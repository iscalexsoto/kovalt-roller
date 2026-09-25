import 'package:firebase_auth/firebase_auth.dart';

import '../../firebase_options.dart';
import '../data/auth_repository.dart';
import '../data/rtdb_rest.dart';

/// Configuración de arranque, vía `--dart-define`.
abstract final class AppConfig {
  /// Conectar a Firebase Emulator Suite (por defecto, mientras no hay proyecto real).
  static const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: true);

  static const emulatorHost = String.fromEnvironment('EMULATOR_HOST', defaultValue: '127.0.0.1');

  static AuthRepository authRepository(FirebaseAuth auth) => AuthRepository(
    auth,
    identityToolkit: useEmulators
        ? Uri.parse('http://$emulatorHost:9099/identitytoolkit.googleapis.com/v1')
        : Uri.parse('https://identitytoolkit.googleapis.com/v1'),
    apiKey: DefaultFirebaseOptions.currentPlatform.apiKey,
  );

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
