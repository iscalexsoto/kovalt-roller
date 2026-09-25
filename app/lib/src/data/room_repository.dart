import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../rust/api/engine.dart';
import 'models.dart';
import 'rtdb_rest.dart';

class RoomException implements Exception {
  RoomException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Salas, códigos y membresías. Firestore es la fuente de verdad; RTDB lleva
/// un espejo mínimo de la membresía porque sus reglas no pueden leer Firestore.
class RoomRepository {
  RoomRepository(this._db, this._rtdb);

  final FirebaseFirestore _db;
  final RtdbRest _rtdb;

  // Sin 0/O, 1/I/L ni U para evitar confusiones al dictar el código.
  static const _alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  static final _random = Random.secure();

  DocumentReference<Json> _room(String id) => _db.doc('rooms/$id');
  DocumentReference<Json> _code(String code) => _db.doc('roomCodes/$code');
  DocumentReference<Json> _member(String roomId, String uid) => _db.doc('rooms/$roomId/members/$uid');
  DocumentReference<Json> _myRoom(String uid, String roomId) => _db.doc('users/$uid/rooms/$roomId');

  static String normalizeCode(String code) => code.trim().toUpperCase().replaceAll(RegExp(r'[\s-]'), '');

  String _newCode() => List.generate(6, (_) => _alphabet[_random.nextInt(_alphabet.length)]).join();

  Future<String> _freeCode() async {
    for (var i = 0; i < 10; i++) {
      final code = _newCode();
      if (!(await _code(code).get()).exists) return code;
    }
    throw RoomException('No se pudo generar un código de sala libre.');
  }

  Stream<Room?> watchRoom(String roomId) => _room(roomId).snapshots().map((d) => d.exists ? Room.fromDoc(d) : null);

  Stream<List<Member>> watchMembers(String roomId) =>
      _db.collection('rooms/$roomId/members').snapshots().map((q) => q.docs.map(Member.fromDoc).toList());

  Stream<List<MyRoomEntry>> watchMyRooms(String uid) => _db
      .collection('users/$uid/rooms')
      .orderBy('joinedAt', descending: true)
      .snapshots()
      .map((q) => q.docs.map(MyRoomEntry.fromDoc).toList());

  /// Crea la sala; quien la crea es el DM.
  Future<String> createRoom({
    required String uid,
    required String displayName,
    required String name,
    required RoomSettingsDto settings,
  }) async {
    final error = validateRoomSettings(settings: settings);
    if (error != null) throw RoomException(error);

    final code = await _freeCode();
    final roomRef = _db.collection('rooms').doc();
    final batch = _db.batch()
      ..set(roomRef, {
        'name': name.trim(),
        'dmUid': uid,
        'code': code,
        'settings': settingsToMap(settings),
        'status': 'open',
        'createdAt': FieldValue.serverTimestamp(),
      })
      ..set(_code(code), {'roomId': roomRef.id, 'createdAt': FieldValue.serverTimestamp()})
      ..set(_member(roomRef.id, uid), {
        'role': 'dm',
        'displayName': displayName,
        'joinCode': null,
        'characterId': null,
        'joinedAt': FieldValue.serverTimestamp(),
      })
      ..set(_myRoom(uid, roomRef.id), {'name': name.trim(), 'role': 'dm', 'joinedAt': FieldValue.serverTimestamp()});
    await batch.commit();

    await _rtdb.set('roomAccess/${roomRef.id}', {'dm': uid, 'code': code});
    await _rtdb.set('members/${roomRef.id}/$uid', {'role': 'dm', 'code': code});
    return roomRef.id;
  }

  /// Une al usuario a la sala del código. Devuelve el id de la sala.
  Future<String> joinByCode({required String uid, required String displayName, required String code}) async {
    final normalized = normalizeCode(code);
    if (normalized.length != 6) throw RoomException('El código tiene 6 caracteres.');

    final codeDoc = await _code(normalized).get();
    if (!codeDoc.exists) throw RoomException('No hay ninguna sala con ese código.');
    final roomId = codeDoc.data()!['roomId'] as String;

    if (!await _isMember(roomId, uid)) {
      await _member(roomId, uid).set({
        'role': 'player',
        'displayName': displayName,
        'joinCode': normalized,
        'characterId': null,
        'joinedAt': FieldValue.serverTimestamp(),
      });
      await _rtdb.set('members/$roomId/$uid', {'role': 'player', 'code': normalized});
    }

    final room = Room.fromDoc(await _room(roomId).get());
    await _myRoom(
      uid,
      roomId,
    ).set({'name': room.name, 'role': room.dmUid == uid ? 'dm' : 'player', 'joinedAt': FieldValue.serverTimestamp()});
    return roomId;
  }

  Future<bool> _isMember(String roomId, String uid) async {
    try {
      return (await _member(roomId, uid).get()).exists;
    } on FirebaseException catch (e) {
      // Sin membresía, las reglas no dejan ni leer el documento.
      if (e.code == 'permission-denied') return false;
      rethrow;
    }
  }

  Future<void> updateRoom(Room room, {required String name, required RoomSettingsDto settings}) async {
    final error = validateRoomSettings(settings: settings);
    if (error != null) throw RoomException(error);
    await _room(room.id).update({'name': name.trim(), 'settings': settingsToMap(settings)});
  }

  /// Nuevo código de sala; el anterior deja de servir para unirse.
  Future<String> rotateCode(Room room) async {
    final code = await _freeCode();
    final batch = _db.batch()
      ..set(_code(code), {'roomId': room.id, 'createdAt': FieldValue.serverTimestamp()})
      ..update(_room(room.id), {'code': code})
      ..delete(_code(room.code));
    await batch.commit();
    await _rtdb.set('roomAccess/${room.id}/code', code);
    return code;
  }

  /// El DM expulsa a un jugador (su personaje se conserva).
  Future<void> removeMember(String roomId, String uid) async {
    await _member(roomId, uid).delete();
    await _rtdb.remove('members/$roomId/$uid');
  }

  Future<void> leaveRoom(String roomId, String uid) async {
    await _myRoom(uid, roomId).delete();
  }
}
