import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/models.dart';
import '../../rust/api/engine.dart';
import '../../ui/common.dart';
import '../room/room_screen.dart';

/// Crear o editar un objeto: nombre, descripción, valor (opcional) y cantidad.
class ItemEditDialog extends StatefulWidget {
  const ItemEditDialog({super.key, required this.title, required this.onSave, this.initial, this.onDelete});

  final String title;
  final ItemDoc? initial;
  final Future<void> Function(ItemDto item) onSave;
  final Future<void> Function()? onDelete;

  @override
  State<ItemEditDialog> createState() => _ItemEditDialogState();
}

class _ItemEditDialogState extends State<ItemEditDialog> {
  late final _name = TextEditingController(text: widget.initial?.name ?? '');
  late final _description = TextEditingController(text: widget.initial?.description ?? '');
  late final _value = TextEditingController(text: widget.initial?.value?.toString() ?? '');
  late final _quantity = TextEditingController(text: '${widget.initial?.quantity ?? 1}');

  Future<void> _save() async {
    final dto = ItemDto(
      name: _name.text.trim(),
      description: _description.text.trim(),
      value: int.tryParse(_value.text.trim()),
      quantity: int.tryParse(_quantity.text.trim()) ?? 0,
    );
    final ok = await guard(context, () => widget.onSave(dto));
    if (ok && mounted) Navigator.pop(context);
  }

  Future<void> _delete() async {
    if (!await confirm(context, '¿Quitar "${widget.initial!.name}"?', ok: 'Quitar')) return;
    if (!mounted) return;
    final ok = await guard(context, widget.onDelete!);
    if (ok && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final digits = [FilteringTextInputFormatter.digitsOnly];
    return AlertDialog(
      title: Text(widget.title),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _name,
                autofocus: true,
                maxLength: 80,
                decoration: const InputDecoration(labelText: 'Nombre *'),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _description,
                minLines: 3,
                maxLines: 8,
                maxLength: 4000,
                decoration: const InputDecoration(
                  labelText: 'Descripción',
                  helperText: 'Si es mágico, describe aquí su efecto.',
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _value,
                      inputFormatters: digits,
                      decoration: const InputDecoration(labelText: 'Valor (opcional)'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _quantity,
                      inputFormatters: digits,
                      decoration: const InputDecoration(labelText: 'Cantidad'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        if (widget.onDelete != null)
          TextButton(
            onPressed: _delete,
            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
            child: const Text('Quitar'),
          ),
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(onPressed: _name.text.trim().isEmpty ? null : _save, child: const Text('Guardar')),
      ],
    );
  }
}

/// El DM entrega una copia de un objeto del catálogo a un personaje.
class GiveItemDialog extends ConsumerStatefulWidget {
  const GiveItemDialog({super.key, required this.ctx, this.characterId, this.item});

  final RoomContext ctx;
  final String? characterId;
  final ItemDoc? item;

  @override
  ConsumerState<GiveItemDialog> createState() => _GiveItemDialogState();
}

class _GiveItemDialogState extends ConsumerState<GiveItemDialog> {
  late String? _characterId = widget.characterId;
  late String? _itemId = widget.item?.id;
  late final _quantity = TextEditingController(text: '${widget.item?.quantity ?? 1}');

  Future<void> _give(List<ItemDoc> catalog) async {
    final item = catalog.firstWhere((i) => i.id == _itemId);
    final ok = await guard(
      context,
      () => ref
          .read(itemRepositoryProvider)
          .give(widget.ctx.room.id, _characterId!, item, int.tryParse(_quantity.text) ?? 0, dmUid: widget.ctx.uid),
    );
    if (ok && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final catalog = ref.watch(catalogProvider(widget.ctx.room.id)).value ?? const <ItemDoc>[];
    final characters = widget.ctx.characters;
    final ready = _characterId != null && _itemId != null && catalog.any((i) => i.id == _itemId);

    return AlertDialog(
      title: const Text('Entregar objeto'),
      content: SizedBox(
        width: 440,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              initialValue: _characterId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Personaje'),
              items: [for (final c in characters) DropdownMenuItem(value: c.id, child: Text(c.sheet.name))],
              onChanged: (v) => setState(() => _characterId = v),
            ),
            const SizedBox(height: 12),
            if (catalog.isEmpty)
              const Text('El catálogo está vacío. Crea objetos en la pestaña Catálogo.')
            else
              DropdownButtonFormField<String>(
                initialValue: _itemId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Objeto del catálogo'),
                items: [for (final i in catalog) DropdownMenuItem(value: i.id, child: Text(i.name))],
                onChanged: (v) => setState(() {
                  _itemId = v;
                  final item = catalog.firstWhere((i) => i.id == v);
                  _quantity.text = '${item.quantity}';
                }),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _quantity,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Cantidad'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(onPressed: ready ? () => _give(catalog) : null, child: const Text('Entregar')),
      ],
    );
  }
}
