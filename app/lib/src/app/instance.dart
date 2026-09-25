import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import '../../firebase_options.dart';
import '../rust/api/instance.dart';
import 'config.dart';

/// Plaza de la ventana actual. Permite abrir varias ventanas de la app a la vez
/// (p. ej. el DM y un jugador en el mismo equipo): cada plaza tiene su propia
/// sesión de Firebase y su propia caché de Firestore, que se recuerdan al
/// volver a abrir la app en esa plaza.
class InstanceSlot {
  const InstanceSlot._(this.index);

  /// 0 para la primera ventana, 1 para la segunda, etc.
  final int index;

  static const maxSlots = 8;

  /// Número visible para el usuario (1, 2, 3…).
  int get number => index + 1;

  /// Nombre de la app de Firebase de esta plaza (null = app por defecto).
  String? get firebaseAppName => index == 0 ? null : 'ventana-$number';

  /// Una sola plaza, sin reservar (tests).
  static const single = InstanceSlot._(0);

  /// Reserva la primera plaza libre con un mutex con nombre del sistema (en
  /// Rust), que Windows libera al cerrarse el proceso. Requiere `RustLib.init()`.
  static InstanceSlot acquire() {
    final index = acquireInstanceSlot(maxSlots: maxSlots);
    if (index == null) {
      throw StateError('Hay demasiadas ventanas de Kovalt Roller abiertas (máximo $maxSlots).');
    }
    return InstanceSlot._(index);
  }
}

/// Servicios de Firebase de una plaza.
class FirebaseSession {
  const FirebaseSession({required this.slot, required this.auth, required this.db});

  final InstanceSlot slot;
  final FirebaseAuth auth;
  final FirebaseFirestore db;

  static Future<FirebaseSession> start(InstanceSlot slot) async {
    // El plugin de Firestore resuelve internamente la app por defecto incluso
    // al usar otra (FirebaseFirestorePlatform.instance). Se registra siempre,
    // aunque esta ventana no use su sesión ni su caché.
    if (slot.firebaseAppName != null && !Firebase.apps.any((a) => a.name == defaultFirebaseAppName)) {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    }
    final app = await Firebase.initializeApp(
      name: slot.firebaseAppName,
      options: DefaultFirebaseOptions.currentPlatform,
    );
    final auth = FirebaseAuth.instanceFor(app: app);
    final db = FirebaseFirestore.instanceFor(app: app);
    if (AppConfig.useEmulators) {
      await auth.useAuthEmulator(AppConfig.emulatorHost, 9099);
      db.useFirestoreEmulator(AppConfig.emulatorHost, 8080);
    }
    return FirebaseSession(slot: slot, auth: auth, db: db);
  }
}
