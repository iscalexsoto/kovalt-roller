import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../data/models.dart';
import '../../rust/api/engine.dart';
import '../../rust/api/flow.dart';
import '../../ui/common.dart';
import '../room/room_screen.dart';

String stateLabel(RollStateDto s) => switch (s) {
  RollStateDto.declarada => 'Declarada',
  RollStateDto.aprobada => 'Aprobada',
  RollStateDto.contraoferta => 'Contraoferta',
  RollStateDto.rechazada => 'Rechazada',
  RollStateDto.sinTirada => 'Sin tirada',
  RollStateDto.oposicion => 'Oposición',
  RollStateDto.tirada => 'Tirada',
  RollStateDto.resuelta => 'Resuelta',
  RollStateDto.retirada => 'Retirada',
};

String actionLabel(FlowActionKindDto k, RollDoc roll) => switch (k) {
  FlowActionKindDto.approve => 'Aprobar',
  FlowActionKindDto.counterOffer => 'Contraoferta',
  FlowActionKindDto.reject => 'Rechazar',
  FlowActionKindDto.narrate => 'Narrar sin tirada',
  FlowActionKindDto.acceptCounterOffer => 'Aceptar',
  FlowActionKindDto.redeclare => 'Editar',
  FlowActionKindDto.withdraw => 'Retirar',
  FlowActionKindDto.rollOpposition => 'Tirar oposición',
  FlowActionKindDto.rollPlayer => 'Tirar ${roll.record.skill.level}d6',
  FlowActionKindDto.resolve => 'Resolver',
  FlowActionKindDto.applyAdvance => 'Aplicar avance',
};

/// Acciones principales (botón relleno) frente a secundarias.
bool isPrimaryAction(FlowActionKindDto k) => const {
  FlowActionKindDto.approve,
  FlowActionKindDto.acceptCounterOffer,
  FlowActionKindDto.rollOpposition,
  FlowActionKindDto.rollPlayer,
  FlowActionKindDto.resolve,
  FlowActionKindDto.applyAdvance,
}.contains(k);

SkillRefDto skillRef(CharacterDto sheet, int index) =>
    SkillRefDto(index: index, name: sheet.skills[index].name, level: sheet.skills[index].level);

String skillLabel(String name, int level) => '$name $level';

/// Ejecuta las acciones del flujo de tirada desde la UI.
class RollActions {
  RollActions(this.context, this.ref, this.ctx);

  final BuildContext context;
  final WidgetRef ref;
  final RoomContext ctx;

  ActorDto actorFor(RollDoc roll) => ctx.isDm
      ? ActorDto.dm
      : roll.characterId == ctx.uid
      ? ActorDto.owner
      : ActorDto.other;

  List<FlowActionKindDto> allowed(RollDoc roll) =>
      allowedRollActions(state: roll.state, advance: roll.record.advance, actor: actorFor(roll));

  Future<RollDoc> _act(RollDoc roll, FlowActionDto action) =>
      ref.read(rollRepositoryProvider).act(ctx.room, roll, action, actor: actorFor(roll), uid: ctx.uid);

  Future<void> run(RollDoc roll, FlowActionKindDto kind) => guard(context, () async {
    switch (kind) {
      case FlowActionKindDto.approve:
      case FlowActionKindDto.acceptCounterOffer:
        await _act(roll, FlowActionDto(kind: kind));

      case FlowActionKindDto.withdraw:
        if (await confirm(context, '¿Retirar la declaración?', ok: 'Retirar')) {
          await _act(roll, FlowActionDto(kind: kind));
        }

      case FlowActionKindDto.reject:
        final note = await promptText(
          context,
          title: 'Rechazar declaración',
          label: 'Motivo (opcional)',
          ok: 'Rechazar',
          required: false,
        );
        if (note != null) await _act(roll, FlowActionDto(kind: kind, text: note));

      case FlowActionKindDto.narrate:
        final text = await promptText(
          context,
          title: 'Resolver sin tirada',
          label: '¿Qué ocurre?',
          ok: 'Narrar',
          maxLines: 5,
          maxLength: 4000,
        );
        if (text != null) await _act(roll, FlowActionDto(kind: kind, text: text));

      case FlowActionKindDto.counterOffer:
        final sheet = ctx.characterOf(roll.characterId)?.sheet;
        if (sheet == null) return;
        final result = await showDialog<(SkillRefDto, String)>(
          context: context,
          builder: (_) => _CounterOfferDialog(sheet: sheet, current: roll.record.skill.index),
        );
        if (result != null) {
          await _act(roll, FlowActionDto(kind: kind, skill: result.$1, text: result.$2));
        }

      case FlowActionKindDto.redeclare:
        final sheet = ctx.characterOf(roll.characterId)?.sheet;
        if (sheet == null) return;
        final result = await showDialog<(String, SkillRefDto)>(
          context: context,
          builder: (_) => DeclareDialog(
            sheet: sheet,
            initialAction: roll.record.action,
            initialSkill: roll.record.skill.index < sheet.skills.length ? roll.record.skill.index : 0,
          ),
        );
        if (result != null) {
          await _act(roll, FlowActionDto(kind: kind, text: result.$1, skill: result.$2));
        }

      case FlowActionKindDto.rollOpposition:
        final count = await showDialog<int>(
          context: context,
          builder: (_) => _OppositionDialog(
            initial: roll.record.skill.level.clamp(1, ctx.room.settings.maxDice),
            max: ctx.room.settings.maxDice,
          ),
        );
        if (count != null) {
          final dice = rollDice(count: count, maxDice: ctx.room.settings.maxDice);
          await _act(roll, FlowActionDto(kind: kind, dice: dice));
        }

      case FlowActionKindDto.rollPlayer:
        final dice = rollDice(count: roll.record.skill.level, maxDice: ctx.room.settings.maxDice);
        final rolled = await _act(roll, FlowActionDto(kind: kind, dice: dice));
        final resolved = await _resolve(rolled);
        await _settle(resolved);

      case FlowActionKindDto.resolve:
        await _settle(await _resolve(roll));

      case FlowActionKindDto.applyAdvance:
        await _settle(roll);
    }
  });

  Future<RollDoc> _resolve(RollDoc roll) =>
      _act(roll, FlowActionDto(kind: FlowActionKindDto.resolve, tieWinner: ctx.room.settings.tieWinner));

  /// Aplica XP y, si procede, pregunta por la habilidad nueva.
  Future<void> _settle(RollDoc roll) async {
    final character = ctx.characterOf(roll.characterId);
    if (character == null) return;
    final record = roll.record;
    final option = advancementOption(
      character: character.sheet,
      settings: ctx.room.settings,
      playerDice: record.playerRoll!,
      oppositionDice: record.opposition!,
      skillIndex: record.skill.index,
    );

    AdvancementChoiceDto? choice;
    if (option != null) {
      if (!context.mounted) return;
      final picked = await showDialog<_AdvancementPick>(
        context: context,
        barrierDismissible: false,
        builder: (_) => AdvancementDialog(option: option, sheet: character.sheet, forPlayer: ctx.isDm),
      );
      if (picked == null) return; // Decidir más tarde: el avance queda pendiente.
      choice = picked.choice;
    }

    final result = await ref
        .read(rollRepositoryProvider)
        .applyAdvance(ctx.room, roll, character, choice: choice, actor: actorFor(roll), uid: ctx.uid);
    if (!context.mounted) return;
    final learned = result.newSkill;
    if (learned != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Nueva habilidad: ${skillLabel(learned.name, learned.level)}')));
    }
  }
}

// ---------- diálogos ----------

/// Declarar (o volver a declarar) una acción: texto + habilidad.
class DeclareDialog extends StatefulWidget {
  const DeclareDialog({super.key, required this.sheet, this.initialAction = '', this.initialSkill = 0});

  final CharacterDto sheet;
  final String initialAction;
  final int initialSkill;

  @override
  State<DeclareDialog> createState() => _DeclareDialogState();
}

class _DeclareDialogState extends State<DeclareDialog> {
  late final _action = TextEditingController(text: widget.initialAction);
  late int _skill = widget.initialSkill;

  @override
  Widget build(BuildContext context) {
    final valid = _action.text.trim().isNotEmpty;
    return AlertDialog(
      title: const Text('Declarar acción'),
      content: SizedBox(
        width: 460,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _action,
              autofocus: true,
              maxLines: 3,
              maxLength: 500,
              decoration: const InputDecoration(labelText: '¿Qué intentas hacer?'),
              onChanged: (_) => setState(() {}),
            ),
            SkillDropdown(sheet: widget.sheet, value: _skill, onChanged: (v) => setState(() => _skill = v)),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(
          onPressed: valid ? () => Navigator.pop(context, (_action.text.trim(), skillRef(widget.sheet, _skill))) : null,
          child: const Text('Declarar'),
        ),
      ],
    );
  }
}

class SkillDropdown extends StatelessWidget {
  const SkillDropdown({super.key, required this.sheet, required this.value, required this.onChanged, this.exclude});

  final CharacterDto sheet;
  final int value;
  final int? exclude;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<int>(
      initialValue: value,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Habilidad'),
      items: [
        for (var i = 0; i < sheet.skills.length; i++)
          if (i != exclude)
            DropdownMenuItem(
              value: i,
              child: Text('${skillLabel(sheet.skills[i].name, sheet.skills[i].level)}  ·  ${sheet.skills[i].level}d6'),
            ),
      ],
      onChanged: (v) => v == null ? null : onChanged(v),
    );
  }
}

class _CounterOfferDialog extends StatefulWidget {
  const _CounterOfferDialog({required this.sheet, required this.current});

  final CharacterDto sheet;
  final int current;

  @override
  State<_CounterOfferDialog> createState() => _CounterOfferDialogState();
}

class _CounterOfferDialogState extends State<_CounterOfferDialog> {
  final _note = TextEditingController();
  late int _skill = widget.current == 0 && widget.sheet.skills.length > 1 ? 1 : 0;

  @override
  Widget build(BuildContext context) {
    final options = widget.sheet.skills.length - 1;
    return AlertDialog(
      title: const Text('Proponer otra habilidad'),
      content: SizedBox(
        width: 460,
        child: options < 1
            ? const Text('El personaje no tiene otra habilidad que proponer.')
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SkillDropdown(
                    sheet: widget.sheet,
                    value: _skill,
                    exclude: widget.current,
                    onChanged: (v) => setState(() => _skill = v),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _note,
                    maxLength: 1000,
                    decoration: const InputDecoration(labelText: 'Nota para el jugador (opcional)'),
                  ),
                ],
              ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(
          onPressed: options < 1
              ? null
              : () => Navigator.pop(context, (skillRef(widget.sheet, _skill), _note.text.trim())),
          child: const Text('Proponer'),
        ),
      ],
    );
  }
}

class _OppositionDialog extends StatefulWidget {
  const _OppositionDialog({required this.initial, required this.max});

  final int initial;
  final int max;

  @override
  State<_OppositionDialog> createState() => _OppositionDialogState();
}

class _OppositionDialogState extends State<_OppositionDialog> {
  late int _count = widget.initial;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Dados de oposición'),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('${_count}d6', style: Theme.of(context).textTheme.displaySmall),
            Slider(
              value: _count.toDouble(),
              min: 1,
              max: widget.max.toDouble(),
              divisions: widget.max - 1,
              label: '$_count',
              onChanged: (v) => setState(() => _count = v.round()),
            ),
            const Text('El resultado será visible para el jugador antes de su tirada.'),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(context, _count), child: const Text('Tirar')),
      ],
    );
  }
}

class _AdvancementPick {
  const _AdvancementPick(this.choice);

  /// null = renunciar a la habilidad nueva (el XP del fallo se aplica igual).
  final AdvancementChoiceDto? choice;
}

/// Elegir la habilidad nueva: nombre y slot (o reemplazo / descarte).
class AdvancementDialog extends StatefulWidget {
  const AdvancementDialog({super.key, required this.option, required this.sheet, this.forPlayer = false});

  final AdvancementOptionDto option;
  final CharacterDto sheet;

  /// El DM decide en nombre del jugador.
  final bool forPlayer;

  @override
  State<AdvancementDialog> createState() => _AdvancementDialogState();
}

class _AdvancementDialogState extends State<AdvancementDialog> {
  final _name = TextEditingController();
  int? _replace;

  @override
  Widget build(BuildContext context) {
    final o = widget.option;
    final text = Theme.of(context).textTheme;
    final valid = _name.text.trim().isNotEmpty && (!o.slotsFull || _replace != null);

    return AlertDialog(
      title: Text(o.natural ? '¡Todos 6!' : 'Puedes avanzar gastando XP'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                o.natural
                    ? 'Ganas una habilidad nueva de nivel ${o.newLevel}, derivada de ${o.sourceLabel}.'
                    : 'Convierte ${o.xpCost} dado(s) en 6 gastando ${o.xpCost} XP (disponibles: ${o.xpAvailable}) '
                          'y gana una habilidad de nivel ${o.newLevel} derivada de ${o.sourceLabel}. '
                          'El resultado de la tirada no cambia.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _name,
                autofocus: true,
                maxLength: 40,
                decoration: InputDecoration(labelText: 'Nombre de la habilidad', suffixText: '${o.newLevel}'),
                onChanged: (_) => setState(() {}),
              ),
              if (o.slotsFull) ...[
                const SizedBox(height: 8),
                Text('Todos los slots están ocupados. Elige qué habilidad reemplazar:', style: text.bodyMedium),
                RadioGroup<int>(
                  groupValue: _replace,
                  onChanged: (v) => setState(() => _replace = v),
                  child: Column(
                    children: [
                      for (var i = 1; i < widget.sheet.skills.length; i++)
                        RadioListTile<int>(
                          value: i,
                          dense: true,
                          title: Text(skillLabel(widget.sheet.skills[i].name, widget.sheet.skills[i].level)),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Decidir más tarde')),
        TextButton(
          onPressed: () => Navigator.pop(context, const _AdvancementPick(null)),
          child: const Text('Renunciar'),
        ),
        FilledButton(
          onPressed: valid
              ? () => Navigator.pop(
                  context,
                  _AdvancementPick(
                    AdvancementChoiceDto(
                      newSkillName: _name.text.trim(),
                      slot: o.slotsFull ? SlotChoiceKind.replace : SlotChoiceKind.append,
                      replaceIndex: _replace ?? 0,
                    ),
                  ),
                )
              : null,
          child: Text(o.natural ? 'Aprender' : 'Gastar ${o.xpCost} XP y aprender'),
        ),
      ],
    );
  }
}
