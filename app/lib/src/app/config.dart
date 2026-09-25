import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../firebase_options.dart';
import '../data/auth_repository.dart';
import '../data/rtdb_rest.dart';

/// Configuración de arranque, vía `--dart-define`.
abstract final class AppConfig {
  /// Conectar a Firebase Emulator Suite en lugar del proyecto real.
  static const useEmulators = bool.fromEnvironment('USE_EMULATORS');

  static const emulatorHost = String.fromEnvironment('EMULATOR_HOST', defaultValue: '127.0.0.1');

  static AuthRepository authRepository(FirebaseAuth auth) => AuthRepository(
    auth,
    identityToolkit: useEmulators
        ? Uri.parse('http://$emulatorHost:9099/identitytoolkit.googleapis.com/v1')
        : Uri.parse('https://identitytoolkit.googleapis.com/v1'),
    apiKey: DefaultFirebaseOptions.currentPlatform.apiKey,
    onSignedOut: resetFirestore,
  );

  /// Reinicia el cliente de Firestore y borra su caché local.
  ///
  /// En Windows, el SDK conserva estado del usuario anterior sobre documentos
  /// ya leídos y el servidor rechaza esas lecturas al nuevo usuario aunque
  /// tenga permiso. Además evita dejar datos de otro usuario en el equipo.
  static Future<void> resetFirestore() async {
    final db = FirebaseFirestore.instance;
    await db.terminate();
    await db.clearPersistence();
    if (useEmulators) db.useFirestoreEmulator(emulatorHost, 8080);
  }

  /// Cliente REST de Realtime Database para la configuración activa.
  static RtdbRest realtimeDatabase(FirebaseAuth auth) {
    final url = Uri.parse(DefaultFirebaseOptions.currentPlatform.databaseURL!);
    return RtdbRest(
      baseUrl: useEmulators ? Uri.parse('http://$emulatorHost:9000') : url,
      // El emulador identifica la base por el subdominio de la URL real.
      namespace: useEmulators ? url.host.split('.').first : null,
      tokenProvider: () async => auth.currentUser?.getIdToken(),
    );
  }
}
