import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../data/models.dart';
import '../../rust/api/engine.dart';
import '../../ui/common.dart';
import '../auth/upgrade_account_dialog.dart';
import '../room/settings_form.dart';

class LobbyScreen extends ConsumerWidget {
  const LobbyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final slot = ref.watch(instanceSlotProvider);
    if (user == null) return const SizedBox.shrink();
    final rooms = ref.watch(myRoomsProvider);

    return Scaffold(
      appBar: AppBar(
        leading: Padding(padding: const EdgeInsets.all(10), child: Image.asset('assets/icon.png')),
        title: Text(slot.index == 0 ? 'Kovalt Roller' : 'Kovalt Roller · ventana ${slot.number}'),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Center(child: Text(user.displayName ?? 'Sin nombre')),
          ),
          if (user.isAnonymous)
            TextButton(
              onPressed: () => showDialog(context: context, builder: (_) => const UpgradeAccountDialog()),
              child: const Text('Crear cuenta'),
            ),
          IconButton(
            tooltip: 'Cerrar sesión',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              if (user.isAnonymous &&
                  !await confirm(
                    context,
                    '¿Cerrar sesión de invitado?',
                    body: 'Perderás el acceso a tus salas y personajes salvo que antes crees una cuenta.',
                    ok: 'Cerrar sesión',
                  )) {
                return;
              }
              await ref.read(authRepositoryProvider).signOut();
            },
          ),
        ],
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(child: _JoinCard()),
                  const SizedBox(width: 16),
                  Expanded(child: _CreateCard(canCreate: !user.isAnonymous)),
                ],
              ),
              const SectionTitle('Mis salas'),
              rooms.when(
                data: (list) => list.isEmpty
                    ? const Padding(padding: EdgeInsets.all(16), child: Text('Todavía no estás en ninguna sala.'))
                    : Card(
                        child: Column(
                          children: [
                            for (final r in list)
                              ListTile(
                                leading: Icon(r.role == MemberRole.dm ? Icons.shield_moon : Icons.person),
                                title: Text(r.name),
                                subtitle: Text(r.role == MemberRole.dm ? 'DM' : 'Jugador'),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => context.go('/room/${r.roomId}'),
                              ),
                          ],
                        ),
                      ),
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text(errorMessage(e)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _JoinCard extends ConsumerStatefulWidget {
  const _JoinCard();

  @override
  ConsumerState<_JoinCard> createState() => _JoinCardState();
}

class _JoinCardState extends ConsumerState<_JoinCard> {
  final _code = TextEditingController();
  bool _busy = false;

  Future<void> _join() async {
    final user = ref.read(currentUserProvider)!;
    setState(() => _busy = true);
    String? roomId;
    await guard(context, () async {
      roomId = await ref
          .read(roomRepositoryProvider)
          .joinByCode(uid: user.uid, displayName: user.displayName ?? 'Jugador', code: _code.text);
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (roomId != null) context.go('/room/$roomId');
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Unirse a una sala', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            TextField(
              controller: _code,
              textCapitalization: TextCapitalization.characters,
              maxLength: 7,
              decoration: const InputDecoration(labelText: 'Código de la sala', hintText: 'K7Q2MX'),
              onSubmitted: (_) => _join(),
            ),
            FilledButton.icon(
              onPressed: _busy ? null : _join,
              icon: const Icon(Icons.login),
              label: const Text('Unirse'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateCard extends StatelessWidget {
  const _CreateCard({required this.canCreate});

  final bool canCreate;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Dirigir una partida', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Text(
              canCreate
                  ? 'Crea una sala y comparte su código con tus jugadores. Serás el DM.'
                  : 'Para crear salas y ser DM necesitas una cuenta registrada.',
            ),
            const SizedBox(height: 28),
            FilledButton.tonalIcon(
              onPressed: canCreate
                  ? () => showDialog(context: context, builder: (_) => const _CreateRoomDialog())
                  : null,
              icon: const Icon(Icons.add),
              label: const Text('Crear sala'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateRoomDialog extends ConsumerStatefulWidget {
  const _CreateRoomDialog();

  @override
  ConsumerState<_CreateRoomDialog> createState() => _CreateRoomDialogState();
}

class _CreateRoomDialogState extends ConsumerState<_CreateRoomDialog> {
  final _name = TextEditingController();
  late RoomSettingsDto _settings = defaultRoomSettings();
  bool _busy = false;

  Future<void> _create() async {
    final user = ref.read(currentUserProvider)!;
    setState(() => _busy = true);
    String? roomId;
    await guard(context, () async {
      roomId = await ref
          .read(roomRepositoryProvider)
          .createRoom(uid: user.uid, displayName: user.displayName ?? 'DM', name: _name.text, settings: _settings);
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (roomId != null) {
      Navigator.pop(context);
      context.go('/room/$roomId');
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Nueva sala'),
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
                decoration: const InputDecoration(labelText: 'Nombre de la sala'),
                onChanged: (_) => setState(() {}),
              ),
              RoomSettingsForm(value: _settings, onChanged: (s) => setState(() => _settings = s)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(onPressed: _busy || _name.text.trim().isEmpty ? null : _create, child: const Text('Crear')),
      ],
    );
  }
}
