import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kovalt_roller/src/rust/api/engine.dart';
import 'package:kovalt_roller/src/rust/api/flow.dart';
import 'package:kovalt_roller/src/rust/frb_generated.dart';

/// Requiere `cargo build -p rust_lib_kovalt_roller` (usa la DLL del workspace).
void main() {
  late RoomSettingsDto settings;

  setUpAll(() async {
    await RustLib.init(externalLibrary: ExternalLibrary.open('../target/debug/rust_lib_kovalt_roller.dll'));
    settings = defaultRoomSettings();
  });

  test('personaje nuevo con Do Anything 1', () {
    final c = newCharacter(name: '  Ana ', description: '');
    expect(c.name, 'Ana');
    expect(c.skills.single.name, 'Do Anything');
    expect(validateCharacter(character: c, settings: settings), isEmpty);
    expect(() => newCharacter(name: ' ', description: ''), throwsA(isA<AnyhowException>()));
  });

  test('dados dentro de rango', () {
    final dice = rollDice(count: 10, maxDice: 10);
    expect(dice, hasLength(10));
    expect(dice.every((d) => d >= 1 && d <= 6), isTrue);
  });

  test('todos 6 dan una habilidad nueva', () {
    final c = newCharacter(name: 'Ana', description: '');
    final opt = advancementOption(
      character: c,
      settings: settings,
      playerDice: [6],
      oppositionDice: [2],
      skillIndex: 0,
    );
    expect(opt!.natural, isTrue);
    final res = applyRoll(
      character: c,
      settings: settings,
      playerDice: [6],
      oppositionDice: [2],
      skillIndex: 0,
      choice: const AdvancementChoiceDto(newSkillName: 'Trepar', slot: SlotChoiceKind.append, replaceIndex: 0),
    );
    expect(res.character.skills.last.name, 'Trepar');
    expect(res.character.skills.last.level, 2);
  });

  test('flujo de tirada a través del bridge', () {
    var r = declareRoll(
      action: 'Salto',
      skill: const SkillRefDto(index: 0, name: 'Do Anything', level: 1),
    );
    expect(allowedRollActions(state: r.state, actor: ActorDto.owner), contains(FlowActionKindDto.withdraw));
    r = rollTransition(
      record: r,
      action: const FlowActionDto(kind: FlowActionKindDto.approve),
      actor: ActorDto.dm,
      maxDice: 10,
    );
    expect(r.state, RollStateDto.aprobada);
    expect(rollStateId(state: RollStateDto.sinTirada), 'sin_tirada');
    expect(
      () => rollTransition(
        record: r,
        action: FlowActionDto(kind: FlowActionKindDto.rollPlayer, dice: Uint8List.fromList([6])),
        actor: ActorDto.owner,
        maxDice: 10,
      ),
      throwsA(isA<AnyhowException>()),
    );
  });
}
