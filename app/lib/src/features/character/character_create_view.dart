import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../rust/api/engine.dart';
import '../../ui/common.dart';
import '../room/room_screen.dart';

class CharacterCreateView extends ConsumerStatefulWidget {
  const CharacterCreateView({super.key, required this.ctx});

  final RoomContext ctx;

  @override
  ConsumerState<CharacterCreateView> createState() => _CharacterCreateViewState();
}

class _CharacterCreateViewState extends ConsumerState<CharacterCreateView> {
  final _name = TextEditingController();
  final _description = TextEditingController();
  bool _busy = false;

  Future<void> _create() async {
    setState(() => _busy = true);
    await guard(context, () async {
      final sheet = newCharacter(name: _name.text, description: _description.text);
      await ref.read(characterRepositoryProvider).create(widget.ctx.room.id, widget.ctx.uid, sheet);
    });
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final settings = widget.ctx.room.settings;
    final text = Theme.of(context).textTheme;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Crea tu personaje', style: text.headlineSmall),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _name,
                    autofocus: true,
                    maxLength: 60,
                    decoration: const InputDecoration(labelText: 'Nombre *'),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _description,
                    minLines: 3,
                    maxLines: 6,
                    decoration: const InputDecoration(labelText: 'Descripción'),
                  ),
                  const SectionTitle('Habilidades'),
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.lock_outline),
                    title: Text('Do Anything 1'),
                    subtitle: Text('Permanente. No ocupa slot.'),
                  ),
                  Text(
                    'Las demás habilidades se ganan jugando: sacando todo 6 o gastando XP. '
                    'Esta sala permite ${settings.skillSlots} habilidades además de Do Anything.',
                    style: text.bodySmall,
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy || _name.text.trim().isEmpty ? null : _create,
                    child: const Text('Crear personaje'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
