// Ventana 2 en su propio proceso, sin la app de Firebase por defecto en uso.
// Requiere los emuladores y OTRA ventana de Kovalt Roller abierta (ocupa la plaza 1):
//   flutter test integration_test/second_window_test.dart -d windows --dart-define=USE_EMULATORS=true
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:kovalt_roller/src/app/config.dart';
import 'package:kovalt_roller/src/app/instance.dart';
import 'package:kovalt_roller/src/data/models.dart';
import 'package:kovalt_roller/src/data/roll_repository.dart';
import 'package:kovalt_roller/src/data/room_repository.dart';
import 'package:kovalt_roller/src/rust/api/engine.dart';
import 'package:kovalt_roller/src/rust/frb_generated.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('la segunda ventana usa Firestore sin la app por defecto', (tester) async {
    if (!AppConfig.useEmulators) fail('Ejecuta con --dart-define=USE_EMULATORS=true');
    await RustLib.init();
    final slot = InstanceSlot.acquire();
    if (slot.index == 0) fail('Abre antes otra ventana de Kovalt Roller para ocupar la plaza 1.');

    final window = await FirebaseSession.start(slot);
    final auth = AppConfig.authRepository(window.auth, window.db);
    final rooms = RoomRepository(window.db, AppConfig.realtimeDatabase(window.auth));
    await auth.signOut();

    final stamp = DateTime.now().millisecondsSinceEpoch;
    await auth.register('ventana2-$stamp@kovalt.test', 'secreto123', 'DM ventana 2');
    final uid = window.auth.currentUser!.uid;
    expect(await rooms.watchMyRooms(uid).first, isEmpty);
    final roomId = await rooms.createRoom(
      uid: uid,
      displayName: 'DM',
      name: 'Ventana 2',
      settings: defaultRoomSettings(),
    );
    final room = Room.fromDoc(await window.db.doc('rooms/$roomId').get());
    expect(await rooms.joinByCode(uid: uid, displayName: 'DM', code: room.code), roomId);
    expect(await rooms.watchMyRooms(uid).firstWhere((l) => l.isNotEmpty), hasLength(1));
    final rolls = await RollRepository(window.db).watch(roomId, dmUid: uid).first;
    expect(rolls, isEmpty);
    await auth.signOut();
    await tester.pump();
  });
}
