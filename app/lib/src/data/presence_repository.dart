import 'dart:async';

import 'rtdb_rest.dart';

/// Presencia en RTDB con latidos: la API REST no tiene `onDisconnect`, así que
/// cada cliente reescribe su entrada periódicamente y se considera conectado a
/// quien haya latido hace poco.
class PresenceRepository {
  PresenceRepository(this._rtdb);

  final RtdbRest _rtdb;
  Timer? _heartbeat;

  static const beatEvery = Duration(seconds: 20);

  /// Margen tras el último latido para seguir considerando conectado a alguien.
  static const staleAfter = Duration(seconds: 50);

  String _path(String roomId, String uid) => 'presence/$roomId/$uid';

  Future<void> goOnline(String roomId, String uid, String name) async {
    Future<void> beat() =>
        _rtdb.set(_path(roomId, uid), {'state': 'online', 'name': name, 'lastChanged': RtdbRest.serverTimestamp});

    _heartbeat?.cancel();
    await beat();
    _heartbeat = Timer.periodic(beatEvery, (_) => beat().ignore());
  }

  Future<void> goOffline(String roomId, String uid) async {
    _heartbeat?.cancel();
    _heartbeat = null;
    await _rtdb.remove(_path(roomId, uid));
  }

  /// Uids conectados ahora mismo.
  Stream<Set<String>> watchOnline(String roomId) => _rtdb.watch('presence/$roomId').map(onlineFrom);

  /// Conectados según las marcas del servidor. Como referencia de "ahora" se
  /// usa el latido más reciente, así no depende del reloj local.
  static Set<String> onlineFrom(Object? value) {
    if (value is! Map) return {};
    final stamps = <String, int>{
      for (final e in value.entries)
        if (e.value is Map && (e.value as Map)['lastChanged'] is num)
          e.key.toString(): ((e.value as Map)['lastChanged'] as num).toInt(),
    };
    if (stamps.isEmpty) return {};
    final newest = stamps.values.reduce((a, b) => a > b ? a : b);
    return {
      for (final e in stamps.entries)
        if (newest - e.value <= staleAfter.inMilliseconds) e.key,
    };
  }
}
