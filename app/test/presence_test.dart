import 'package:flutter_test/flutter_test.dart';
import 'package:kovalt_roller/src/data/presence_repository.dart';

void main() {
  test('conectado = latido reciente respecto al más nuevo', () {
    final online = PresenceRepository.onlineFrom({
      'ana': {'state': 'online', 'name': 'Ana', 'lastChanged': 100000},
      'bea': {'state': 'online', 'name': 'Bea', 'lastChanged': 70000},
      'caro': {'state': 'online', 'name': 'Caro', 'lastChanged': 10000},
      'roto': 'no es un mapa',
    });
    expect(online, {'ana', 'bea'});
  });

  test('sin datos no hay nadie', () {
    expect(PresenceRepository.onlineFrom(null), isEmpty);
    expect(PresenceRepository.onlineFrom({}), isEmpty);
  });
}
