// Dos ventanas a la vez (DM y jugador) en el mismo equipo, contra los emuladores:
//   flutter test integration_test/multi_window_test.dart -d windows --dart-define=USE_EMULATORS=true
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:kovalt_roller/src/app/config.dart';
import 'package:kovalt_roller/src/app/instance.dart';
import 'package:kovalt_roller/src/data/character_repository.dart';
import 'package:kovalt_roller/src/data/models.dart';
import 'package:kovalt_roller/src/data/roll_repository.dart';
import 'package:kovalt_roller/src/data/room_repository.dart';
import 'package:kovalt_roller/src/rust/api/engine.dart';
import 'package:kovalt_roller/src/rust/api/flow.dart';
import 'package:kovalt_roller/src/rust/frb_generated.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('DM y jugador en dos plazas simultáneas', (tester) async {
    if (!AppConfig.useEmulators) fail('Ejecuta con --dart-define=USE_EMULATORS=true');
    await RustLib.init();

    final dmWindow = await FirebaseSession.start(InstanceSlot.acquire());
    final playerWindow = await FirebaseSession.start(InstanceSlot.acquire());
    expect(playerWindow.slot.index, dmWindow.slot.index + 1);

    final dmAuth = AppConfig.authRepository(dmWindow.auth, dmWindow.db);
    final playerAuth = AppConfig.authRepository(playerWindow.auth, playerWindow.db);
    await dmAuth.signOut();
    await playerAuth.signOut();

    // Cada ventana con su propia sesión.
    final stamp = DateTime.now().millisecondsSinceEpoch;
    await dmAuth.register('dm-multi-$stamp@kovalt.test', 'secreto123', 'DM');
    await playerAuth.signInAsGuest('Ana');
    final dmUid = dmWindow.auth.currentUser!.uid;
    final playerUid = playerWindow.auth.currentUser!.uid;
    expect(dmUid, isNot(playerUid));
    expect(dmWindow.auth.currentUser!.isAnonymous, isFalse);
    expect(playerWindow.auth.currentUser!.isAnonymous, isTrue);

    final dmRooms = RoomRepository(dmWindow.db, AppConfig.realtimeDatabase(dmWindow.auth));
    final playerRooms = RoomRepository(playerWindow.db, AppConfig.realtimeDatabase(playerWindow.auth));
    final roomId = await dmRooms.createRoom(
      uid: dmUid,
      displayName: 'DM',
      name: 'Dos ventanas',
      settings: defaultRoomSettings(),
    );
    final room = Room.fromDoc(await dmWindow.db.doc('rooms/$roomId').get());

    // El jugador se une y declara desde su ventana; el DM lo ve y aprueba desde la suya.
    await playerRooms.joinByCode(uid: playerUid, displayName: 'Ana', code: room.code);
    await CharacterRepository(playerWindow.db).create(roomId, playerUid, newCharacter(name: 'Ana', description: ''));
    await RollRepository(playerWindow.db).declare(
      roomId,
      playerUid,
      action: 'Salto',
      skill: const SkillRefDto(index: 0, name: 'Do Anything', level: 1),
    );
    final seenByDm = await RollRepository(dmWindow.db).watch(roomId, dmUid: dmUid).firstWhere((l) => l.isNotEmpty);
    expect(seenByDm.single.state, RollStateDto.declarada);
    await RollRepository(dmWindow.db).act(
      room,
      seenByDm.single,
      const FlowActionDto(kind: FlowActionKindDto.approve),
      actor: ActorDto.dm,
      uid: dmUid,
    );

    // Cerrar sesión en una ventana no afecta a la otra.
    await dmAuth.signOut();
    expect(playerWindow.auth.currentUser?.uid, playerUid);
    final approved = await RollRepository(playerWindow.db)
        .watch(roomId, dmUid: dmUid)
        .firstWhere((l) => l.single.state == RollStateDto.aprobada);
    expect(approved.single.state, RollStateDto.aprobada);
    await playerAuth.signOut();
    await tester.pump();
  });
}
