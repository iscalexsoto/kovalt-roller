import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/models.dart';
import '../../rust/api/engine.dart';
import '../../ui/common.dart';
import '../dm/item_dialogs.dart';
import '../room/room_screen.dart';

/// Hoja de personaje con inventario. El dueño edita textos y cantidades;
/// el DM además corrige XP y gestiona los objetos entregados.
class CharacterSheetPanel extends ConsumerWidget {
  const CharacterSheetPanel({super.key, required this.ctx, required this.character});

  final RoomContext ctx;
  final CharacterDoc character;

  bool get _isOwner => character.id == ctx.uid;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sheet = character.sheet;
    final text = Theme.of(context).textTheme;
    final usage = slotUsage(character: sheet, settings: ctx.room.settings);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(child: Text(sheet.name, style: text.headlineSmall)),
            if (_isOwner)
              IconButton(
                tooltip: 'Editar hoja',
                icon: const Icon(Icons.edit),
                onPressed: () => showDialog(
                  context: context,
                  builder: (_) => _EditSheetDialog(ctx: ctx, character: character),
                ),
              ),
          ],
        ),
        Text('Jugador: ${ctx.displayNameOf(character.ownerUid)}', style: text.bodySmall),
        if (sheet.description.isNotEmpty) ...[const SizedBox(height: 8), Text(sheet.description)],
        const SizedBox(height: 12),
        _XpRow(ctx: ctx, character: character),
        SectionTitle('Habilidades', trailing: Text('Slots ${usage.used}/${usage.capacity}', style: text.labelMedium)),
        for (final s in sheet.skills)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(radius: 14, child: Text('${s.level}')),
            title: Text(s.name),
            subtitle: s.permanent
                ? const Text('Permanente')
                : s.derivedFrom == null
                ? null
                : Text('De ${s.derivedFrom}'),
            trailing: s.permanent ? const Icon(Icons.lock_outline, size: 18) : null,
          ),
        SectionTitle(
          'Inventario',
          trailing: ctx.isDm
              ? TextButton.icon(
                  onPressed: () => showDialog(
                    context: context,
                    builder: (_) => GiveItemDialog(ctx: ctx, characterId: character.id),
                  ),
                  icon: const Icon(Icons.card_giftcard, size: 18),
                  label: const Text('Entregar'),
                )
              : null,
        ),
        _Inventory(ctx: ctx, character: character),
        const SectionTitle('Notas'),
        Text(sheet.notes.isEmpty ? (_isOwner ? 'Sin notas. Pulsa editar para escribir.' : 'Sin notas.') : sheet.notes),
      ],
    );
  }
}

class _XpRow extends ConsumerWidget {
  const _XpRow({required this.ctx, required this.character});

  final RoomContext ctx;
  final CharacterDoc character;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final xp = character.sheet.xp;
    Future<void> setXp(int value) => guard(
      context,
      () => ref
          .read(characterRepositoryProvider)
          .dmUpdateSheet(ctx.room.id, character.id, xp: value, skills: character.sheet.skills),
    );

    return Row(
      children: [
        const Icon(Icons.star_outline),
        const SizedBox(width: 6),
        Text('XP: $xp', style: Theme.of(context).textTheme.titleMedium),
        const Spacer(),
        if (ctx.isDm) ...[
          IconButton(
            tooltip: 'Quitar 1 XP',
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: xp > 0 ? () => setXp(xp - 1) : null,
          ),
          IconButton(tooltip: 'Dar 1 XP', icon: const Icon(Icons.add_circle_outline), onPressed: () => setXp(xp + 1)),
        ],
      ],
    );
  }
}

class _Inventory extends ConsumerWidget {
  const _Inventory({required this.ctx, required this.character});

  final RoomContext ctx;
  final CharacterDoc character;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(inventoryProvider((roomId: ctx.room.id, characterId: character.id)));
    final repo = ref.read(itemRepositoryProvider);
    final canEditQuantity = ctx.isDm || character.id == ctx.uid;

    return items.when(
      data: (list) => list.isEmpty
          ? const Text('Vacío.')
          : Column(
              children: [
                for (final item in list)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(item.value == null ? item.name : '${item.name}  ·  valor ${item.value}'),
                    subtitle: item.description.isEmpty ? null : Text(item.description),
                    onLongPress: ctx.isDm
                        ? () => showDialog(
                            context: context,
                            builder: (_) => ItemEditDialog(
                              title: 'Editar objeto entregado',
                              initial: item,
                              onSave: (dto) => repo.updateInventoryItem(ctx.room.id, character.id, item.id, dto),
                              onDelete: () => repo.removeFromInventory(ctx.room.id, character.id, item.id),
                            ),
                          )
                        : null,
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (canEditQuantity)
                          IconButton(
                            icon: const Icon(Icons.remove, size: 18),
                            onPressed: item.quantity > 0
                                ? () => guard(
                                    context,
                                    () => repo.setQuantity(ctx.room.id, character.id, item.id, item.quantity - 1),
                                  )
                                : null,
                          ),
                        Text('×${item.quantity}', style: Theme.of(context).textTheme.titleSmall),
                        if (canEditQuantity)
                          IconButton(
                            icon: const Icon(Icons.add, size: 18),
                            onPressed: () => guard(
                              context,
                              () => repo.setQuantity(ctx.room.id, character.id, item.id, item.quantity + 1),
                            ),
                          ),
                      ],
                    ),
                  ),
                if (ctx.isDm)
                  Text(
                    'Mantén pulsado un objeto para editarlo o quitarlo.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
      loading: () => const LinearProgressIndicator(),
      error: (e, _) => Text(errorMessage(e)),
    );
  }
}

class _EditSheetDialog extends ConsumerStatefulWidget {
  const _EditSheetDialog({required this.ctx, required this.character});

  final RoomContext ctx;
  final CharacterDoc character;

  @override
  ConsumerState<_EditSheetDialog> createState() => _EditSheetDialogState();
}

class _EditSheetDialogState extends ConsumerState<_EditSheetDialog> {
  late final _name = TextEditingController(text: widget.character.sheet.name);
  late final _description = TextEditingController(text: widget.character.sheet.description);
  late final _notes = TextEditingController(text: widget.character.sheet.notes);

  Future<void> _save() async {
    final ok = await guard(
      context,
      () => ref
          .read(characterRepositoryProvider)
          .updateTexts(
            widget.ctx.room.id,
            widget.character.id,
            name: _name.text,
            description: _description.text,
            notes: _notes.text,
          ),
    );
    if (ok && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Editar hoja'),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _name,
                maxLength: 60,
                decoration: const InputDecoration(labelText: 'Nombre *'),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _description,
                minLines: 2,
                maxLines: 5,
                decoration: const InputDecoration(labelText: 'Descripción'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _notes,
                minLines: 4,
                maxLines: 12,
                decoration: const InputDecoration(labelText: 'Notas'),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(onPressed: _name.text.trim().isEmpty ? null : _save, child: const Text('Guardar')),
      ],
    );
  }
}
