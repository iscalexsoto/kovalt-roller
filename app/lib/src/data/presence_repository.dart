import 'dart:async';

import 'package:firebase_database/firebase_database.dart';

/// Presencia en RTDB: cada cliente marca su entrada y la borra al desconectarse.
class PresenceRepository {
  PresenceRepository(this._rtdb);

  final FirebaseDatabase _rtdb;

  DatabaseReference _ref(String roomId, String uid) => _rtdb.ref('presence/$roomId/$uid');

  Future<void> goOnline(String roomId, String uid, String name) async {
    final ref = _ref(roomId, uid);
    await ref.onDisconnect().remove();
    await ref.set({'state': 'online', 'name': name, 'lastChanged': ServerValue.timestamp});
  }

  Future<void> goOffline(String roomId, String uid) async {
    final ref = _ref(roomId, uid);
    await ref.remove();
    await ref.onDisconnect().cancel();
  }

  /// Uids conectados ahora mismo.
  Stream<Set<String>> watchOnline(String roomId) => _rtdb.ref('presence/$roomId').onValue.map((event) {
    final value = event.snapshot.value;
    if (value is! Map) return <String>{};
    return value.keys.map((k) => k.toString()).toSet();
  });
}
