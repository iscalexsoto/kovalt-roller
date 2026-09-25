import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/models.dart';
import '../../rust/api/flow.dart';
import '../../ui/common.dart';
import '../room/room_screen.dart';
import 'roll_actions.dart';

/// Registro de tiradas de la sala, con la barra para declarar.
class RollLog extends ConsumerWidget {
  const RollLog({super.key, required this.ctx});

  final RoomContext ctx;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rolls = ref.watch(rollsProvider(ctx.room.id));
    final actions = RollActions(context, ref, ctx);

    return Column(
      children: [
        Expanded(
          child: rolls.when(
            data: (list) {
              if (list.isEmpty) {
                return Center(
                  child: Text(
                    ctx.isDm
                        ? 'Aún no hay acciones. Los jugadores declaran lo que intentan hacer.'
                        : 'Declara lo que intenta hacer tu personaje.',
                  ),
                );
              }
              // Primero lo que me toca resolver.
              final mine = list.where((r) => actions.allowed(r).any(isPrimaryAction)).toList();
              final rest = list.where((r) => !mine.contains(r)).toList();
              return ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  if (mine.isNotEmpty) ...[
                    const SectionTitle('Te toca'),
                    for (final r in mine) _card(r, actions),
                    const SectionTitle('Registro'),
                  ],
                  for (final r in rest) _card(r, actions),
                ],
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text(errorMessage(e))),
          ),
        ),
        if (!ctx.isDm && ctx.myCharacter != null) _DeclareBar(ctx: ctx),
      ],
    );
  }

  Widget _card(RollDoc r, RollActions actions) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: RollCard(roll: r, ctx: ctx, actions: actions),
  );
}

class RollCard extends StatelessWidget {
  const RollCard({super.key, required this.roll, required this.ctx, required this.actions});

  final RollDoc roll;
  final RoomContext ctx;
  final RollActions actions;

  Color _stateColor(ColorScheme s) => switch (roll.state) {
    RollStateDto.declarada || RollStateDto.contraoferta => s.tertiary,
    RollStateDto.rechazada || RollStateDto.retirada => s.outline,
    RollStateDto.resuelta => s.primary,
    _ => s.secondary,
  };

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final r = roll.record;
    final character = ctx.characterOf(roll.characterId);
    final who = character?.sheet.name ?? ctx.displayNameOf(roll.characterId);
    final allowed = actions.allowed(roll);
    final faded = roll.state == RollStateDto.retirada || roll.state == RollStateDto.rechazada;

    return Opacity(
      opacity: faded ? 0.7 : 1,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  CircleAvatar(radius: 14, child: Text(who.isEmpty ? '?' : who.characters.first.toUpperCase())),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: who,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          TextSpan(text: '  con ${skillLabel(r.skill.name, r.skill.level)}'),
                        ],
                      ),
                    ),
                  ),
                  Chip(
                    label: Text(stateLabel(roll.state)),
                    labelStyle: TextStyle(color: _stateColor(scheme), fontWeight: FontWeight.w600),
                    side: BorderSide(color: _stateColor(scheme)),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text('“${r.action}”', style: text.bodyLarge?.copyWith(fontStyle: FontStyle.italic)),
              if (r.counterOffer != null) ...[
                const SizedBox(height: 8),
                _Note(
                  icon: Icons.swap_horiz,
                  text:
                      'El DM propone usar ${skillLabel(r.counterOffer!.name, r.counterOffer!.level)}'
                      '${r.dmNote == null ? '' : ': ${r.dmNote}'}',
                ),
              ] else if (r.dmNote != null) ...[
                const SizedBox(height: 8),
                _Note(icon: Icons.feedback_outlined, text: 'DM: ${r.dmNote}'),
              ],
              if (r.narration != null) ...[
                const SizedBox(height: 8),
                _Note(icon: Icons.auto_stories, text: r.narration!),
              ],
              if (r.opposition != null) ...[
                const SizedBox(height: 10),
                DiceRow(label: 'Oposición', dice: r.opposition!, muted: true),
              ],
              if (r.playerRoll != null) ...[const SizedBox(height: 6), DiceRow(label: 'Tirada', dice: r.playerRoll!)],
              if (r.result == RollResultDto.exito || r.result == RollResultDto.fallo) ...[
                const SizedBox(height: 10),
                _ResultBanner(record: r),
              ],
              if (allowed.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.end,
                  children: [
                    for (final k in allowed)
                      isPrimaryAction(k)
                          ? FilledButton(onPressed: () => actions.run(roll, k), child: Text(actionLabel(k, roll)))
                          : OutlinedButton(onPressed: () => actions.run(roll, k), child: Text(actionLabel(k, roll))),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(8)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: scheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

class _ResultBanner extends StatelessWidget {
  const _ResultBanner({required this.record});

  final RollRecordDto record;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final success = record.result == RollResultDto.exito;
    final applied = record.applied;
    final details = <String>[
      if (!success) '+1 XP',
      if (applied?.newSkill != null)
        'Nueva habilidad: ${skillLabel(applied!.newSkill!.name, applied.newSkill!.level)}'
            '${applied.xpSpent > 0 ? ' (−${applied.xpSpent} XP)' : ''}',
      if (record.advance == AdvanceStateDto.pendiente) 'avance pendiente',
    ];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: success ? scheme.primaryContainer : scheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(
            success ? Icons.check_circle : Icons.cancel,
            color: success ? scheme.onPrimaryContainer : scheme.onErrorContainer,
          ),
          const SizedBox(width: 8),
          Text(
            success ? 'Éxito' : 'Fallo',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: success ? scheme.onPrimaryContainer : scheme.onErrorContainer,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              details.join(' · '),
              style: TextStyle(color: success ? scheme.onPrimaryContainer : scheme.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }
}

class _DeclareBar extends ConsumerStatefulWidget {
  const _DeclareBar({required this.ctx});

  final RoomContext ctx;

  @override
  ConsumerState<_DeclareBar> createState() => _DeclareBarState();
}

class _DeclareBarState extends ConsumerState<_DeclareBar> {
  final _action = TextEditingController();
  int _skill = 0;
  bool _busy = false;

  Future<void> _declare() async {
    final sheet = widget.ctx.myCharacter!.sheet;
    if (_action.text.trim().isEmpty) return;
    setState(() => _busy = true);
    final ok = await guard(
      context,
      () => ref
          .read(rollRepositoryProvider)
          .declare(widget.ctx.room.id, widget.ctx.uid, action: _action.text, skill: skillRef(sheet, _skill)),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) _action.clear();
  }

  @override
  Widget build(BuildContext context) {
    final sheet = widget.ctx.myCharacter!.sheet;
    if (_skill >= sheet.skills.length) _skill = 0;
    return Material(
      elevation: 3,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            SizedBox(
              width: 220,
              child: SkillDropdown(sheet: sheet, value: _skill, onChanged: (v) => setState(() => _skill = v)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _action,
                maxLength: 500,
                decoration: const InputDecoration(labelText: '¿Qué intentas hacer?', counterText: ''),
                onSubmitted: (_) => _declare(),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton.icon(
              onPressed: _busy ? null : _declare,
              icon: const Icon(Icons.campaign),
              label: const Text('Declarar'),
            ),
          ],
        ),
      ),
    );
  }
}
