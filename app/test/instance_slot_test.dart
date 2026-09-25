import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kovalt_roller/src/app/instance.dart';
import 'package:kovalt_roller/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async {
    await RustLib.init(externalLibrary: ExternalLibrary.open('../target/debug/rust_lib_kovalt_roller.dll'));
  });

  test('cada ventana toma una plaza libre distinta', () {
    // Los mutex son por proceso: en el mismo proceso, cada reserva toma la siguiente.
    final first = InstanceSlot.acquire();
    final second = InstanceSlot.acquire();
    expect(second.index, first.index + 1);
    expect(second.number, second.index + 1);
    expect(InstanceSlot.single.firebaseAppName, isNull);
    expect(second.firebaseAppName, 'ventana-${second.number}');
  });
}
