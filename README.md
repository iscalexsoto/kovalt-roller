# Kovalt Roller

Mesa virtual para jugar **Roll For Shoes** por salas.

- **Motor de reglas:** Rust (`crates/r4s_engine`), lógica pura y testeada.
- **App:** Flutter para Windows; el motor se integra con flutter_rust_bridge.
- **Backend:** Firebase Auth, Cloud Firestore (datos persistentes) y Realtime Database (presencia y eventos en vivo).

## Cómo se juega

1. Un usuario registrado crea una sala y es el DM. La sala tiene un código.
2. Los jugadores entran con el código (sin necesidad de registrarse) y crean su personaje.
3. Cada acción pasa por el flujo de tirada: declarar → el DM aprueba → oposición → tirada → resuelta.

Las reglas concretas y las variantes de la casa están en [docs/rules.md](docs/rules.md).

## Desarrollo

```bash
cargo test -p r4s_engine
```
