import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

class AuthRepository {
  /// [identityToolkit] es la base de la API REST de Auth
  /// (`https://identitytoolkit.googleapis.com/v1` o la del emulador) y [apiKey]
  /// la clave web del proyecto; se usan cuando el SDK de Windows falla.
  AuthRepository(this._auth, {required this.identityToolkit, required this.apiKey, http.Client? client})
    : _client = client ?? http.Client();

  final FirebaseAuth _auth;
  final Uri identityToolkit;
  final String apiKey;
  final http.Client _client;

  Stream<User?> authStateChanges() => _auth.userChanges();

  User? get currentUser => _auth.currentUser;

  /// Jugador invitado: sesión anónima con nombre visible.
  Future<void> signInAsGuest(String displayName) async {
    final cred = await _auth.signInAnonymously();
    await cred.user!.updateDisplayName(displayName.trim());
  }

  Future<void> signIn(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email.trim(), password: password);

  Future<void> register(String email, String password, String displayName) async {
    final cred = await _auth.createUserWithEmailAndPassword(email: email.trim(), password: password);
    await cred.user!.updateDisplayName(displayName.trim());
  }

  /// Convierte la sesión de invitado en cuenta con email, conservando el uid
  /// (y con él sus salas y personajes).
  Future<void> upgradeGuest(String email, String password) async {
    final user = _auth.currentUser!;
    try {
      await user.linkWithCredential(EmailAuthProvider.credential(email: email.trim(), password: password));
    } on FirebaseAuthException catch (e) {
      // En Windows `linkWithCredential` falla con un error interno: se hace lo
      // mismo con la API REST (accounts:update sobre la cuenta anónima).
      if (e.code != 'unknown-error' && e.code != 'internal-error') rethrow;
      await _upgradeViaRest(user, email.trim(), password);
      await _auth.signInWithEmailAndPassword(email: email.trim(), password: password);
    }
  }

  Future<void> _upgradeViaRest(User user, String email, String password) async {
    final uri = identityToolkit.replace(
      path: '${identityToolkit.path}/accounts:update',
      queryParameters: {'key': apiKey},
    );
    final response = await _client.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'idToken': await user.getIdToken(),
        'email': email,
        'password': password,
        'returnSecureToken': true,
      }),
    );
    if (response.statusCode != 200) {
      final message = (jsonDecode(response.body) as Map)['error']?['message'] as String? ?? 'UNKNOWN';
      throw FirebaseAuthException(code: _restErrorCode(message), message: message);
    }
  }

  static String _restErrorCode(String message) => switch (message.split(' ').first) {
    'EMAIL_EXISTS' => 'email-already-in-use',
    'INVALID_EMAIL' => 'invalid-email',
    'WEAK_PASSWORD' => 'weak-password',
    _ => 'unknown-error',
  };

  Future<void> updateDisplayName(String name) => _auth.currentUser!.updateDisplayName(name.trim());

  Future<void> signOut() => _auth.signOut();
}

/// Mensaje legible para errores de autenticación.
String authErrorMessage(Object e) {
  if (e is FirebaseAuthException) {
    return switch (e.code) {
      'invalid-email' => 'El email no es válido.',
      'user-not-found' || 'wrong-password' || 'invalid-credential' => 'Email o contraseña incorrectos.',
      'email-already-in-use' || 'credential-already-in-use' => 'Ese email ya tiene una cuenta.',
      'weak-password' => 'La contraseña debe tener al menos 6 caracteres.',
      'network-request-failed' => 'Sin conexión con el servidor.',
      _ => e.message ?? e.code,
    };
  }
  return e.toString();
}
