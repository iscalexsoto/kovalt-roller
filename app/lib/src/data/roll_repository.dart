import 'package:cloud_firestore/cloud_firestore.dart';

import '../rust/api/engine.dart';
import '../rust/api/flow.dart';
import 'models.dart';

/// Tiradas de la sala. Cada cambio de estado pasa por la máquina de estados
/// del motor (`rollTransition`) y se escribe tal cual; las Security Rules
/// validan lo mismo del lado del servidor.
class RollRepository {
  RollRepository(this._db);

  final FirebaseFirestore _db;

  CollectionReference<Json> _rolls(String roomId) => _db.collection('rooms/$roomId/rolls');

  Stream<List<RollDoc>> watch(String roomId, {required String dmUid, int limit = 100}) =>
      _rolls(roomId)
          .orderBy('createdAt', descending: true)
          .limit(limit)
          .snapshots()
          .map((q) => q.docs.map((d) => RollDoc.fromDoc(d, dmUid: dmUid)).toList());

  /// El jugador declara una acción con una de sus habilidades.
  Future<void> declare(String roomId, String uid, {required String action, required SkillRefDto skill}) {
    final record = declareRoll(action: action, skill: skill);
    return _rolls(roomId).add({
      ...rollFields(record, previousHistory: const [], uid: uid),
      'characterId': uid,
      'declaradoPor': uid,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  /// Aplica una acción del flujo y la persiste. Devuelve la tirada resultante.
  Future<RollDoc> act(
    Room room,
    RollDoc roll,
    FlowActionDto action, {
    required ActorDto actor,
    required String uid,
  }) async {
    final next = rollTransition(record: roll.record, action: action, actor: actor, maxDice: room.settings.maxDice);
    final fields = rollFields(next, previousHistory: roll.rawHistory, uid: uid);
    await _rolls(room.id).doc(roll.id).update(fields);
    return RollDoc(
      id: roll.id,
      characterId: roll.characterId,
      record: next,
      rawHistory: [for (final h in fields['historial'] as List) h as Json],
      createdAt: roll.createdAt,
    );
  }

  /// Aplica el resultado a la hoja (XP y, si se eligió, la habilidad nueva) y
  /// marca el avance como aplicado, en un solo batch.
  Future<ApplyResultDto> applyAdvance(
    Room room,
    RollDoc roll,
    CharacterDoc character, {
    AdvancementChoiceDto? choice,
    required ActorDto actor,
    required String uid,
  }) async {
    final record = roll.record;
    final result = applyRoll(
      character: character.sheet,
      settings: room.settings,
      playerDice: record.playerRoll!,
      oppositionDice: record.opposition!,
      skillIndex: record.skill.index,
      choice: choice,
    );
    final next = rollTransition(
      record: record,
      action: FlowActionDto(
        kind: FlowActionKindDto.applyAdvance,
        applied: AppliedAdvanceDto(
          xpGained: result.xpGained,
          xpSpent: result.xpSpent,
          newSkill: result.newSkill,
          replacedIndex: result.replacedIndex,
        ),
      ),
      actor: actor,
      maxDice: room.settings.maxDice,
    );

    final batch = _db.batch()
      ..update(_db.doc('rooms/${room.id}/characters/${character.id}'), {
        'xp': result.character.xp,
        'skills': result.character.skills.map(skillToMap).toList(),
        'lastAppliedRollId': roll.id,
        'updatedAt': FieldValue.serverTimestamp(),
      })
      ..update(_rolls(room.id).doc(roll.id), rollFields(next, previousHistory: roll.rawHistory, uid: uid));
    await batch.commit();
    return result;
  }
}
