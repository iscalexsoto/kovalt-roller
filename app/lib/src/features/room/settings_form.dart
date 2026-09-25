import 'package:flutter/material.dart';

import '../../rust/api/engine.dart';

/// Editor de los ajustes de sala (variantes de reglas).
class RoomSettingsForm extends StatelessWidget {
  const RoomSettingsForm({super.key, required this.value, required this.onChanged});

  final RoomSettingsDto value;
  final ValueChanged<RoomSettingsDto> onChanged;

  RoomSettingsDto _copy({int? skillSlots, TieWinnerDto? tieWinner, bool? xpSameRoll, int? maxDice}) => RoomSettingsDto(
    skillSlots: skillSlots ?? value.skillSlots,
    tieWinner: tieWinner ?? value.tieWinner,
    xpSameRoll: xpSameRoll ?? value.xpSameRoll,
    maxDice: maxDice ?? value.maxDice,
  );

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        _Stepper(
          label: 'Slots de habilidad',
          help: 'Sin contar "Do Anything 1", que es permanente.',
          value: value.skillSlots,
          min: 1,
          max: 10,
          onChanged: (v) => onChanged(_copy(skillSlots: v)),
        ),
        _Stepper(
          label: 'Máximo de dados',
          help: 'Una habilidad de este nivel ya no puede avanzar.',
          value: value.maxDice,
          min: 2,
          max: 10,
          onChanged: (v) => onChanged(_copy(maxDice: v)),
        ),
        const SizedBox(height: 8),
        Text('En empate gana', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        SegmentedButton<TieWinnerDto>(
          segments: const [
            ButtonSegment(value: TieWinnerDto.player, label: Text('El jugador')),
            ButtonSegment(value: TieWinnerDto.opposition, label: Text('La oposición')),
          ],
          selected: {value.tieWinner},
          onSelectionChanged: (s) => onChanged(_copy(tieWinner: s.first)),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('XP de la misma tirada'),
          subtitle: const Text('El XP ganado al fallar se puede gastar en esa misma tirada.'),
          value: value.xpSameRoll,
          onChanged: (v) => onChanged(_copy(xpSameRoll: v)),
        ),
      ],
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    required this.help,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final String label;
  final String help;
  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(label),
      subtitle: Text(help),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(icon: const Icon(Icons.remove), onPressed: value > min ? () => onChanged(value - 1) : null),
          SizedBox(width: 24, child: Text('$value', textAlign: TextAlign.center)),
          IconButton(icon: const Icon(Icons.add), onPressed: value < max ? () => onChanged(value + 1) : null),
        ],
      ),
    );
  }
}
