import 'package:firebase_auth/firebase_auth.dart';

class AuthRepository {
  AuthRepository(this._auth);

  final FirebaseAuth _auth;

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
    await user.linkWithCredential(EmailAuthProvider.credential(email: email.trim(), password: password));
  }

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
