import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/models.dart';
import '../../ui/common.dart';
import '../character/character_sheet.dart';
import '../dm/dm_panel.dart';
import '../room/room_screen.dart';
import 'roll_log.dart';

/// Mesa de juego: jugadores | registro de tiradas | hoja o panel del DM.
class TableView extends StatefulWidget {
  const TableView({super.key, required this.ctx});

  final RoomContext ctx;

  @override
  State<TableView> createState() => _TableViewState();
}

class _TableViewState extends State<TableView> {
  String? _selected;

  @override
  Widget build(BuildContext context) {
    final ctx = widget.ctx;
    final divider = VerticalDivider(width: 1, color: Theme.of(context).dividerColor);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: 260,
          child: _PlayersPanel(
            ctx: ctx,
            selected: _selected,
            onSelect: ctx.isDm ? (id) => setState(() => _selected = id) : null,
          ),
        ),
        divider,
        Expanded(child: RollLog(ctx: ctx)),
        divider,
        SizedBox(
          width: 380,
          child: ctx.isDm
              ? DmPanel(ctx: ctx, selectedCharacterId: _selected)
              : CharacterSheetPanel(ctx: ctx, character: ctx.myCharacter!),
        ),
      ],
    );
  }
}

class _PlayersPanel extends ConsumerWidget {
  const _PlayersPanel({required this.ctx, required this.selected, required this.onSelect});

  final RoomContext ctx;
  final String? selected;
  final ValueChanged<String>? onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(onlineProvider(ctx.room.id)).value ?? const <String>{};
    final members = [...ctx.members]
      ..sort((a, b) {
        if (a.isDm != b.isDm) return a.isDm ? -1 : 1;
        return a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase());
      });

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        const SectionTitle('En la sala'),
        for (final m in members) _tile(context, ref, m, online.contains(m.uid)),
      ],
    );
  }

  Widget _tile(BuildContext context, WidgetRef ref, Member m, bool isOnline) {
    final scheme = Theme.of(context).colorScheme;
    final character = ctx.characterOf(m.uid);
    return ListTile(
      dense: true,
      selected: selected == m.uid,
      contentPadding: const EdgeInsets.symmetric(horizontal: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      leading: Badge(
        backgroundColor: isOnline ? Colors.green : scheme.outline,
        smallSize: 10,
        child: Icon(m.isDm ? Icons.shield_moon : Icons.person),
      ),
      title: Text(character?.sheet.name ?? m.displayName),
      subtitle: Text(
        m.isDm
            ? 'DM · ${m.displayName}'
            : character == null
            ? '${m.displayName} · sin personaje'
            : '${m.displayName} · ${character.sheet.xp} XP',
      ),
      onTap: onSelect != null && character != null ? () => onSelect!(m.uid) : null,
      trailing: ctx.isDm && !m.isDm
          ? PopupMenuButton<String>(
              onSelected: (_) async {
                if (!await confirm(
                  context,
                  '¿Expulsar a ${m.displayName}?',
                  body: 'Podrá volver a entrar si tiene el código vigente. Su personaje se conserva.',
                  ok: 'Expulsar',
                )) {
                  return;
                }
                if (!context.mounted) return;
                await guard(context, () => ref.read(roomRepositoryProvider).removeMember(ctx.room.id, m.uid));
              },
              itemBuilder: (_) => const [PopupMenuItem(value: 'kick', child: Text('Expulsar'))],
            )
          : null,
    );
  }
}
