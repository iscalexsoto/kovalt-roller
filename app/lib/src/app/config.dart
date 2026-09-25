/// Configuración de arranque, vía `--dart-define`.
abstract final class AppConfig {
  /// Conectar a Firebase Emulator Suite (por defecto, mientras no hay proyecto real).
  static const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: true);

  static const emulatorHost = String.fromEnvironment('EMULATOR_HOST', defaultValue: '127.0.0.1');
}
