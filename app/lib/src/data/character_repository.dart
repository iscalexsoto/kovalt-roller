import 'package:cloud_firestore/cloud_firestore.dart';

import '../rust/api/engine.dart';
import 'models.dart';

class CharacterRepository {
  CharacterRepository(this._db);

  final FirebaseFirestore _db;

  DocumentReference<Json> _ref(String roomId, String cid) => _db.doc('rooms/$roomId/characters/$cid');

  Stream<List<CharacterDoc>> watchAll(String roomId) =>
      _db.collection('rooms/$roomId/characters').snapshots().map((q) => q.docs.map(CharacterDoc.fromDoc).toList());

  /// Crea la hoja (el id es el uid del dueño) y la enlaza en la membresía.
  Future<void> create(String roomId, String uid, CharacterDto sheet) async {
    final batch = _db.batch()
      ..set(_ref(roomId, uid), characterToMap(uid, sheet))
      ..update(_db.doc('rooms/$roomId/members/$uid'), {'characterId': uid});
    await batch.commit();
  }

  Future<void> updateTexts(
    String roomId,
    String cid, {
    required String name,
    required String description,
    required String notes,
  }) => _ref(roomId, cid).update({
    'name': name.trim(),
    'description': description.trim(),
    'notes': notes,
    'updatedAt': FieldValue.serverTimestamp(),
  });

  /// Corrección manual del DM (xp y habilidades), sujeta a las invariantes.
  Future<void> dmUpdateSheet(String roomId, String cid, {required int xp, required List<SkillDto> skills}) => _ref(
    roomId,
    cid,
  ).update({'xp': xp, 'skills': skills.map(skillToMap).toList(), 'updatedAt': FieldValue.serverTimestamp()});
}
