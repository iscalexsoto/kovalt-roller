// Configuración de Firebase.
//
// Por defecto la app usa el proyecto real `kovalt-roller-db`. Con
// `--dart-define=USE_EMULATORS=true` usa el proyecto de demostración
// `demo-kovalt` contra Firebase Emulator Suite (ver README).
//
// En Windows, FlutterFire usa la configuración de la app web del proyecto.
// Estos valores identifican el proyecto, no son secretos: los datos los
// protegen las Security Rules (firebase/).
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

  static const FirebaseOptions _production = FirebaseOptions(
    apiKey: 'AIzaSyDKZYbq_QaeKFLDNTSHdYNSQ2PTD1uPNGc',
    appId: '1:858343653650:web:5dbfa6938fd0b4e74e73cb',
    messagingSenderId: '858343653650',
    projectId: 'kovalt-roller-db',
    authDomain: 'kovalt-roller-db.firebaseapp.com',
    databaseURL: 'https://kovalt-roller-db-default-rtdb.firebaseio.com',
    storageBucket: 'kovalt-roller-db.firebasestorage.app',
  );
}
