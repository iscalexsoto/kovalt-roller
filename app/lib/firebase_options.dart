// Configuración de Firebase.
//
// Mientras no exista el proyecto real, la app usa el proyecto de demostración
// `demo-kovalt` contra los emuladores locales (ver README). Para el proyecto
// real, ejecutar `flutterfire configure` y sustituir este archivo, o completar
// `_production` con la configuración web del proyecto.
import 'package:firebase_core/firebase_core.dart';

import 'src/app/config.dart';

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform => AppConfig.useEmulators ? _demo : _production;

  static const FirebaseOptions _demo = FirebaseOptions(
    apiKey: 'demo-api-key',
    appId: '1:000000000000:web:0000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: 'demo-kovalt',
    authDomain: 'demo-kovalt.firebaseapp.com',
    databaseURL: 'https://demo-kovalt-default-rtdb.firebaseio.com',
    storageBucket: 'demo-kovalt.appspot.com',
  );

  // TODO(config): completar con la configuración web del proyecto real.
  static const FirebaseOptions _production = _demo;
}
