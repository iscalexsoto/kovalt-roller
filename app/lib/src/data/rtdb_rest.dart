import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class RtdbException implements Exception {
  RtdbException(this.statusCode, this.body);

  final int statusCode;
  final String body;

  bool get isPermissionDenied => statusCode == 401 || statusCode == 403;

  @override
  String toString() =>
      isPermissionDenied ? 'No tienes permiso para hacer eso.' : 'Realtime Database ($statusCode): $body';
}

/// Cliente mínimo de Realtime Database sobre su API REST.
///
/// Sustituye al plugin `firebase_database`, que en Windows (beta) cierra el
/// proceso en cuanto hace una operación. Escrituras y lecturas por HTTP;
/// escucha de cambios por Server-Sent Events.
class RtdbRest {
  RtdbRest({required this.baseUrl, required this.tokenProvider, this.namespace, http.Client? client})
    : _client = client ?? http.Client();

  /// `https://<db>.firebaseio.com` o, con emuladores, `http://127.0.0.1:9000`.
  final Uri baseUrl;

  /// Namespace (`?ns=`), necesario solo con el emulador.
  final String? namespace;

  /// Token de ID del usuario actual (o null sin sesión).
  final Future<String?> Function() tokenProvider;

  final http.Client _client;

  /// Marca de tiempo del servidor, como `ServerValue.timestamp`.
  static const serverTimestamp = {'.sv': 'timestamp'};

  Future<Uri> _uri(String path) async {
    final token = await tokenProvider();
    return baseUrl.replace(
      path: '/${path.replaceAll(RegExp(r'^/+|/+$'), '')}.json',
      queryParameters: {'ns': ?namespace, 'auth': ?token},
    );
  }

  void _check(http.Response r) {
    if (r.statusCode < 200 || r.statusCode >= 300) throw RtdbException(r.statusCode, r.body);
  }

  Future<void> set(String path, Object? value) async {
    _check(await _client.put(await _uri(path), body: jsonEncode(value)));
  }

  Future<void> remove(String path) async {
    _check(await _client.delete(await _uri(path)));
  }

  Future<Object?> get(String path) async {
    final r = await _client.get(await _uri(path));
    _check(r);
    return jsonDecode(r.body);
  }

  /// Valor actual de `path` y cada cambio posterior. Se reconecta solo si
  /// la conexión se corta o el token caduca.
  Stream<Object?> watch(String path) {
    late StreamController<Object?> controller;
    http.Client? streamClient;
    var cancelled = false;

    Future<void> run() async {
      while (!cancelled) {
        streamClient = http.Client();
        try {
          final request = http.Request('GET', await _uri(path))..headers['Accept'] = 'text/event-stream';
          final response = await streamClient!.send(request);
          if (response.statusCode != 200) {
            final body = await response.stream.bytesToString();
            throw RtdbException(response.statusCode, body);
          }
          String? event;
          await for (final line in response.stream.transform(utf8.decoder).transform(const LineSplitter())) {
            if (cancelled) break;
            if (line.startsWith('event:')) {
              event = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              if (event == 'put' || event == 'patch') {
                // Releer el nodo completo es más simple que aplicar el parche.
                controller.add(await get(path));
              } else if (event == 'cancel' || event == 'auth_revoked') {
                break;
              }
            }
          }
        } on RtdbException catch (e) {
          if (e.isPermissionDenied) {
            if (!cancelled) controller.addError(e);
            return;
          }
        } catch (_) {
          // Conexión cortada: reintentar.
        } finally {
          streamClient?.close();
        }
        if (!cancelled) await Future<void>.delayed(const Duration(seconds: 2));
      }
    }

    controller = StreamController<Object?>(
      onListen: run,
      onCancel: () {
        cancelled = true;
        streamClient?.close();
      },
    );
    return controller.stream;
  }
}
