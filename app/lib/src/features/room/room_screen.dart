import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../data/models.dart';
import '../../ui/common.dart';
import '../character/character_create_view.dart';
import '../table/table_view.dart';

/// Datos de la sala ya cargados, para no repetir la carga en cada panel.
class RoomContext {
  const RoomContext({required this.room, required this.me, required this.members, required this.characters});

  final Room room;
  final Member me;
  final List<Member> members;
  final List<CharacterDoc> characters;

  bool get isDm => me.isDm;
  String get uid => me.uid;

  CharacterDoc? characterOf(String uid) {
    for (final c in characters) {
      if (c.id == uid) return c;
    }
    return null;
  }

  CharacterDoc? get myCharacter => characterOf(uid);

  String displayNameOf(String uid) {
    for (final m in members) {
      if (m.uid == uid) return m.displayName;
    }
    return '?';
  }
}

class RoomScreen extends ConsumerStatefulWidget {
  const RoomScreen({super.key, required this.roomId});

  final String roomId;

  @override
  ConsumerState<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends ConsumerState<RoomScreen> {
  late final _presence = ref.read(presenceRepositoryProvider);
  late final String _uid = ref.read(currentUserProvider)!.uid;
  bool _online = false;

  void _goOnline(String name) {
    if (_online) return;
    _online = true;
    _presence.goOnline(widget.roomId, _uid, name).catchError((_) => _online = false);
  }

  @override
  void dispose() {
    if (_online) _presence.goOffline(widget.roomId, _uid);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final roomAsync = ref.watch(roomProvider(widget.roomId));
    final membersAsync = ref.watch(membersProvider(widget.roomId));
    final charactersAsync = ref.watch(charactersProvider(widget.roomId));

    final error = roomAsync.error ?? membersAsync.error ?? charactersAsync.error;
    if (error != null) {
      return _Message(
        title: 'No se puede abrir la sala',
        body: errorMessage(error) == 'No tienes permiso para hacer eso.'
            ? 'Ya no formas parte de esta sala.'
            : errorMessage(error),
      );
    }

    final room = roomAsync.value;
    final members = membersAsync.value;
    final characters = charactersAsync.value;
    if (!roomAsync.hasValue || members == null || characters == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (room == null) {
      return const _Message(title: 'Sala no encontrada', body: 'Puede que el DM la haya borrado.');
    }

    final me = members.where((m) => m.uid == _uid).firstOrNull;
    if (me == null) {
      return const _Message(title: 'Fuera de la sala', body: 'Ya no formas parte de esta sala.');
    }
    _goOnline(me.displayName);

    final ctx = RoomContext(room: room, me: me, members: members, characters: characters);
    final needsCharacter = !ctx.isDm && ctx.myCharacter == null;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Volver a mis salas',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: Text(room.name),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Center(child: Text(ctx.isDm ? 'DM · ${me.displayName}' : me.displayName)),
          ),
          Padding(padding: const EdgeInsets.only(right: 12), child: RoomCodeChip(room.code)),
        ],
      ),
      body: needsCharacter ? CharacterCreateView(ctx: ctx) : TableView(ctx: ctx),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => context.go('/')),
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(body),
          ],
        ),
      ),
    );
  }
}
