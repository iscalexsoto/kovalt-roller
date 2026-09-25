import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kovalt_roller/src/data/models.dart';
import 'package:kovalt_roller/src/rust/api/engine.dart';
import 'package:kovalt_roller/src/rust/api/flow.dart';
import 'package:kovalt_roller/src/rust/frb_generated.dart';

/// Ida y vuelta RollRecordDto → documento de Firestore → RollDoc.
void main() {
  const dm = 'dm-uid';
  const player = 'player-uid';

  setUpAll(() async {
    await RustLib.init(externalLibrary: ExternalLibrary.open('../target/debug/rust_lib_kovalt_roller.dll'));
  });

  Json toDoc(RollRecordDto r, List<Json> previous, String uid) => {
    ...rollFields(r, previousHistory: previous, uid: uid),
    'characterId': player,
    'declaradoPor': player,
  };

  test('el flujo completo sobrevive al mapeo de Firestore', () {
    const skill = SkillRefDto(index: 0, name: 'Do Anything', level: 1);
    var record = declareRoll(action: 'Salto el foso', skill: skill);
    var doc = RollDoc.fromMap('r1', toDoc(record, const [], player), dmUid: dm);

    RollDoc step(FlowActionDto action, ActorDto actor, String uid) {
      record = rollTransition(record: doc.record, action: action, actor: actor, maxDice: 10);
      return RollDoc.fromMap('r1', toDoc(record, doc.rawHistory, uid), dmUid: dm);
    }

    doc = step(const FlowActionDto(kind: FlowActionKindDto.approve), ActorDto.dm, dm);
    doc = step(
      FlowActionDto(kind: FlowActionKindDto.rollOpposition, dice: rollDice(count: 2, maxDice: 10)),
      ActorDto.dm,
      dm,
    );
    doc = step(
      FlowActionDto(kind: FlowActionKindDto.rollPlayer, dice: rollDice(count: 1, maxDice: 10)),
      ActorDto.owner,
      player,
    );
    doc = step(
      const FlowActionDto(kind: FlowActionKindDto.resolve, tieWinner: TieWinnerDto.player),
      ActorDto.owner,
      player,
    );

    expect(doc.state, RollStateDto.resuelta);
    expect(doc.record.opposition, record.opposition);
    expect(doc.record.playerRoll, record.playerRoll);
    expect(doc.record.result, record.result);
    expect(doc.record.advance, AdvanceStateDto.pendiente);
    expect(doc.record.history.map((h) => h.by).toList(), [
      ActorDto.owner,
      ActorDto.dm,
      ActorDto.dm,
      ActorDto.owner,
      ActorDto.owner,
    ]);
    expect(doc.historyUids, [player, dm, dm, player, player]);
    expect(doc.rawHistory.map((h) => h['a']).toList(), ['declarada', 'aprobada', 'oposicion', 'tirada', 'resuelta']);
  });

  test('narrar deja dos entradas firmadas por el DM y avance no_aplica', () {
    const skill = SkillRefDto(index: 0, name: 'Do Anything', level: 1);
    final declared = declareRoll(action: 'Abro la puerta', skill: skill);
    final start = RollDoc.fromMap('r2', toDoc(declared, const [], player), dmUid: dm);
    final narrated = rollTransition(
      record: start.record,
      action: const FlowActionDto(kind: FlowActionKindDto.narrate, text: 'Se abre sin ruido.'),
      actor: ActorDto.dm,
      maxDice: 10,
    );
    final fields = toDoc(narrated, start.rawHistory, dm);
    expect(fields['avance'], {'estado': 'no_aplica'});
    expect(fields['outcome'], 'narrado');
    expect((fields['historial'] as List).skip(1), [
      {'de': 'declarada', 'a': 'sin_tirada', 'por': dm},
      {'de': 'sin_tirada', 'a': 'resuelta', 'por': dm},
    ]);
  });

  test('ajustes de sala', () {
    final s = defaultRoomSettings();
    expect(settingsFromMap(settingsToMap(s)), s);
    expect(settingsToMap(s)['tieWinner'], 'player');
  });
}
