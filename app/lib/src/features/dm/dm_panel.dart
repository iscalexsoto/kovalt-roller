import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../rust/api/engine.dart';
import '../../ui/common.dart';
import '../character/character_sheet.dart';
import '../room/room_screen.dart';
import '../room/settings_form.dart';
import 'item_dialogs.dart';

/// Panel lateral del DM: hoja del personaje seleccionado, catálogo y ajustes.
class DmPanel extends StatelessWidget {
  const DmPanel({super.key, required this.ctx, required this.selectedCharacterId});

  final RoomContext ctx;
  final String? selectedCharacterId;

  @override
  Widget build(BuildContext context) {
    final selected = selectedCharacterId == null ? null : ctx.characterOf(selectedCharacterId!);
    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          const TabBar(
            tabs: [
              Tab(text: 'Personaje'),
              Tab(text: 'Catálogo'),
              Tab(text: 'Sala'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                selected == null
                    ? const Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text(
                            'Selecciona un jugador en la lista para ver su hoja.',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      )
                    : CharacterSheetPanel(ctx: ctx, character: selected),
                _CatalogTab(ctx: ctx),
                _RoomTab(ctx: ctx),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CatalogTab extends ConsumerWidget {
  const _CatalogTab({required this.ctx});

  final RoomContext ctx;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalog = ref.watch(catalogProvider(ctx.room.id));
    final repo = ref.read(itemRepositoryProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              const Expanded(child: Text('Solo tú ves el catálogo. Entrega copias a los personajes.')),
              FilledButton.tonalIcon(
                onPressed: () => showDialog(
                  context: context,
                  builder: (_) =>
                      ItemEditDialog(title: 'Nuevo objeto', onSave: (dto) => repo.saveCatalogItem(ctx.room.id, dto)),
                ),
                icon: const Icon(Icons.add),
                label: const Text('Objeto'),
              ),
            ],
          ),
        ),
        Expanded(
          child: catalog.when(
            data: (items) => items.isEmpty
                ? const Center(child: Text('Catálogo vacío.'))
                : ListView(
                    padding: const EdgeInsets.all(8),
                    children: [
                      for (final item in items)
                        ListTile(
                          title: Text(item.name),
                          subtitle: Text(
                            [
                              if (item.value != null) 'Valor ${item.value}',
                              'Cantidad ${item.quantity}',
                              if (item.description.isNotEmpty) item.description,
                            ].join(' · '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onTap: () => showDialog(
                            context: context,
                            builder: (_) => ItemEditDialog(
                              title: 'Editar objeto',
                              initial: item,
                              onSave: (dto) => repo.saveCatalogItem(ctx.room.id, dto, id: item.id),
                              onDelete: () => repo.deleteCatalogItem(ctx.room.id, item.id),
                            ),
                          ),
                          trailing: IconButton(
                            tooltip: 'Entregar',
                            icon: const Icon(Icons.card_giftcard),
                            onPressed: ctx.characters.isEmpty
                                ? null
                                : () => showDialog(
                                    context: context,
                                    builder: (_) => GiveItemDialog(ctx: ctx, item: item),
                                  ),
                          ),
                        ),
                    ],
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text(errorMessage(e))),
          ),
        ),
      ],
    );
  }
}

class _RoomTab extends ConsumerStatefulWidget {
  const _RoomTab({required this.ctx});

  final RoomContext ctx;

  @override
  ConsumerState<_RoomTab> createState() => _RoomTabState();
}

class _RoomTabState extends ConsumerState<_RoomTab> {
  late final _name = TextEditingController(text: widget.ctx.room.name);
  late RoomSettingsDto _settings = widget.ctx.room.settings;
  bool _busy = false;

  bool get _dirty => _name.text.trim() != widget.ctx.room.name || _settings != widget.ctx.room.settings;

  Future<void> _save() async {
    setState(() => _busy = true);
    await guard(
      context,
      () => ref.read(roomRepositoryProvider).updateRoom(widget.ctx.room, name: _name.text, settings: _settings),
    );
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _rotate() async {
    if (!await confirm(
      context,
      '¿Generar un código nuevo?',
      body: 'El código actual dejará de servir para unirse. Los jugadores que ya están en la sala no se ven afectados.',
      ok: 'Generar',
    )) {
      return;
    }
    if (!mounted) return;
    await guard(context, () => ref.read(roomRepositoryProvider).rotateCode(widget.ctx.room));
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SectionTitle('Código para unirse'),
        Row(
          children: [
            RoomCodeChip(widget.ctx.room.code),
            const SizedBox(width: 8),
            TextButton.icon(onPressed: _rotate, icon: const Icon(Icons.refresh), label: const Text('Nuevo código')),
          ],
        ),
        const SectionTitle('Sala'),
        TextField(
          controller: _name,
          maxLength: 80,
          decoration: const InputDecoration(labelText: 'Nombre'),
          onChanged: (_) => setState(() {}),
        ),
        const SectionTitle('Reglas'),
        RoomSettingsForm(value: _settings, onChanged: (s) => setState(() => _settings = s)),
        const SizedBox(height: 8),
        Text(
          'Reducir los slots no quita habilidades: las hojas que los superen no podrán guardar cambios de habilidades hasta ajustarse.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy || !_dirty || _name.text.trim().isEmpty ? null : _save,
          child: const Text('Guardar cambios'),
        ),
      ],
    );
  }
}
