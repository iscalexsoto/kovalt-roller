// Partida completa contra Firebase Emulator Suite (bash scripts/emulators.sh):
//   flutter test integration_test/game_flow_test.dart -d windows --dart-define=USE_EMULATORS=true
//
// Ejercita los plugins de Firebase en Windows, las Security Rules y el motor en Rust.
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:kovalt_roller/firebase_options.dart';
import 'package:kovalt_roller/src/app/config.dart';
import 'package:kovalt_roller/src/data/auth_repository.dart';
import 'package:kovalt_roller/src/data/character_repository.dart';
import 'package:kovalt_roller/src/data/item_repository.dart';
import 'package:kovalt_roller/src/data/models.dart';
import 'package:kovalt_roller/src/data/presence_repository.dart';
import 'package:kovalt_roller/src/data/roll_repository.dart';
import 'package:kovalt_roller/src/data/rtdb_rest.dart';
import 'package:kovalt_roller/src/data/room_repository.dart';
import 'package:kovalt_roller/src/rust/api/engine.dart';
import 'package:kovalt_roller/src/rust/api/flow.dart';
import 'package:kovalt_roller/src/rust/frb_generated.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late FirebaseFirestore db;
  late RtdbRest rtdb;
  late AuthRepository auth;
  late RoomRepository rooms;
  late CharacterRepository characters;
  late ItemRepository items;
  late RollRepository rolls;
  late PresenceRepository presence;

  setUpAll(() async {
    // Crea usuarios y salas: nunca contra el proyecto real.
    if (!AppConfig.useEmulators) fail('Ejecuta con --dart-define=USE_EMULATORS=true');
    await RustLib.init();
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    await FirebaseAuth.instance.useAuthEmulator('127.0.0.1', 9099);
    db = FirebaseFirestore.instance..useFirestoreEmulator('127.0.0.1', 8080);
    rtdb = AppConfig.realtimeDatabase(FirebaseAuth.instance);
    auth = AppConfig.authRepository(FirebaseAuth.instance, db);
    rooms = RoomRepository(db, rtdb);
    characters = CharacterRepository(db);
    items = ItemRepository(db);
    rolls = RollRepository(db);
    presence = PresenceRepository(rtdb);
  });

  Future<Room> room(String id) async => Room.fromDoc(await db.doc('rooms/$id').get());
  Future<CharacterDoc> character(String roomId, String uid) async =>
      CharacterDoc.fromDoc(await db.doc('rooms/$roomId/characters/$uid').get());
  Future<RollDoc> roll(Room r, String id) async =>
      RollDoc.fromDoc(await db.doc('rooms/${r.id}/rolls/$id').get(), dmUid: r.dmUid);

  testWidgets('partida completa: sala, personaje, tirada y avance', (tester) async {
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final dmEmail = 'dm$stamp@kovalt.test';

    // --- DM: registro y sala (1 slot para forzar el reemplazo más adelante) ---
    await auth.register(dmEmail, 'secreto123', 'La DM');
    final dmUid = FirebaseAuth.instance.currentUser!.uid;
    final settings = RoomSettingsDto(skillSlots: 1, tieWinner: TieWinnerDto.player, xpSameRoll: true, maxDice: 10);
    final roomId = await rooms.createRoom(uid: dmUid, displayName: 'La DM', name: 'Mesa de prueba', settings: settings);
    var r = await room(roomId);
    expect(r.dmUid, dmUid);
    await items.saveCatalogItem(
      roomId,
      const ItemDto(name: 'Cuerda', description: '15 m de cáñamo', value: 2, quantity: 1),
    );
    await auth.signOut();

    // --- Jugador invitado: unirse, personaje y presencia ---
    await auth.signInAsGuest('Ana');
    final playerUid = FirebaseAuth.instance.currentUser!.uid;
    expect(FirebaseAuth.instance.currentUser!.isAnonymous, isTrue);
    await expectLater(
      rooms.joinByCode(uid: playerUid, displayName: 'Ana', code: 'ZZZZZZ'),
      throwsA(isA<RoomException>()),
    );
    expect(await rooms.joinByCode(uid: playerUid, displayName: 'Ana', code: r.code.toLowerCase()), roomId);
    await characters.create(roomId, playerUid, newCharacter(name: 'Ana la Audaz', description: 'Exploradora'));
    await presence.goOnline(roomId, playerUid, 'Ana');
    expect(await presence.watchOnline(roomId).first, contains(playerUid));

    // El catálogo es privado del DM.
    await expectLater(
      db.collection('rooms/$roomId/catalog').get(const GetOptions(source: Source.server)),
      throwsA(isA<FirebaseException>()),
    );

    // Declara con Do Anything 1.
    await rolls.declare(
      roomId,
      playerUid,
      action: 'Trepo por la muralla',
      skill: const SkillRefDto(index: 0, name: 'Do Anything', level: 1),
    );
    final rollId = (await db.collection('rooms/$roomId/rolls').get()).docs.single.id;
    await presence.goOffline(roomId, playerUid);
    await auth.signOut();

    // --- DM: aprueba y tira oposición ---
    await auth.signIn(dmEmail, 'secreto123');
    var doc = await roll(r, rollId);
    expect(doc.state, RollStateDto.declarada);
    doc = await rolls.act(
      r,
      doc,
      const FlowActionDto(kind: FlowActionKindDto.approve),
      actor: ActorDto.dm,
      uid: dmUid,
    );
    doc = await rolls.act(
      r,
      doc,
      FlowActionDto(kind: FlowActionKindDto.rollOpposition, dice: Uint8List.fromList([1])),
      actor: ActorDto.dm,
      uid: dmUid,
    );
    // Entrega un objeto del catálogo.
    final catalog = await items.watchCatalog(roomId).first;
    await items.give(roomId, playerUid, catalog.single, 3, dmUid: dmUid);
    await auth.signOut();

    // El motor tampoco deja al DM tirar por el jugador.
    expect(
      () => rollTransition(
        record: doc.record,
        action: FlowActionDto(kind: FlowActionKindDto.rollPlayer, dice: Uint8List.fromList([6])),
        actor: ActorDto.dm,
        maxDice: 10,
      ),
      throwsA(anything),
    );
    await auth.signOut();

    // --- Alguien sin código no ve la sala ---
    await FirebaseAuth.instance.signInAnonymously();
    expect(FirebaseAuth.instance.currentUser!.uid, isNot(playerUid));
    await expectLater(db.doc('rooms/$roomId').get(), throwsA(isA<FirebaseException>()));
    await FirebaseAuth.instance.signOut();
    await tester.pump();
  });

  testWidgets('jugador completa su tirada y avance con slots llenos', (tester) async {
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final dmEmail = 'dm2-$stamp@kovalt.test';
    final playerEmail = 'p2-$stamp@kovalt.test';

    await auth.register(dmEmail, 'secreto123', 'DM');
    final dmUid = FirebaseAuth.instance.currentUser!.uid;
    final settings = RoomSettingsDto(skillSlots: 1, tieWinner: TieWinnerDto.player, xpSameRoll: true, maxDice: 10);
    final roomId = await rooms.createRoom(uid: dmUid, displayName: 'DM', name: 'Mesa 2', settings: settings);
    final r = await room(roomId);
    await auth.signOut();

    // Invitado que luego crea cuenta (mismo uid): así puede volver a entrar.
    await auth.signInAsGuest('Bea');
    final playerUid = FirebaseAuth.instance.currentUser!.uid;
    await auth.upgradeGuest(playerEmail, 'secreto123');
    expect(FirebaseAuth.instance.currentUser!.uid, playerUid);
    await rooms.joinByCode(uid: playerUid, displayName: 'Bea', code: r.code);
    await characters.create(roomId, playerUid, newCharacter(name: 'Bea', description: ''));

    Future<String> declare(int index, String name, int level) async {
      await rolls.declare(
        roomId,
        playerUid,
        action: 'Acción ${DateTime.now().microsecondsSinceEpoch}',
        skill: SkillRefDto(index: index, name: name, level: level),
      );
      final q = await db.collection('rooms/$roomId/rolls').where('estado', isEqualTo: 'declarada').get();
      return q.docs.single.id;
    }

    Future<void> dmPrepares(String rollId, List<int> opposition) async {
      await auth.signOut();
      await auth.signIn(dmEmail, 'secreto123');
      var d = await roll(r, rollId);
      d = await rolls.act(
        r,
        d,
        const FlowActionDto(kind: FlowActionKindDto.approve),
        actor: ActorDto.dm,
        uid: dmUid,
      );
      await rolls.act(
        r,
        d,
        FlowActionDto(kind: FlowActionKindDto.rollOpposition, dice: Uint8List.fromList(opposition)),
        actor: ActorDto.dm,
        uid: dmUid,
      );
      await auth.signOut();
      await auth.signIn(playerEmail, 'secreto123');
    }

    Future<RollDoc> playerRollsAndResolves(String rollId, List<int> dice) async {
      var d = await roll(r, rollId);
      d = await rolls.act(
        r,
        d,
        FlowActionDto(kind: FlowActionKindDto.rollPlayer, dice: Uint8List.fromList(dice)),
        actor: ActorDto.owner,
        uid: playerUid,
      );
      return rolls.act(
        r,
        d,
        FlowActionDto(kind: FlowActionKindDto.resolve, tieWinner: r.settings.tieWinner),
        actor: ActorDto.owner,
        uid: playerUid,
      );
    }

    // 1) Do Anything 1 saca 6: aprende "Trepar 2" (ocupa el único slot).
    var rollId = await declare(0, 'Do Anything', 1);
    await dmPrepares(rollId, [3]);
    var resolved = await playerRollsAndResolves(rollId, [6]);
    expect(resolved.record.result, RollResultDto.exito);
    var result = await rolls.applyAdvance(
      r,
      resolved,
      await character(roomId, playerUid),
      choice: const AdvancementChoiceDto(newSkillName: 'Trepar', slot: SlotChoiceKind.append, replaceIndex: 0),
      actor: ActorDto.owner,
      uid: playerUid,
    );
    expect(result.newSkill!.level, 2);
    var sheet = (await character(roomId, playerUid)).sheet;
    expect(sheet.skills.map((s) => '${s.name} ${s.level}'), ['Do Anything 1', 'Trepar 2']);

    // 2) Trepar 2 falla con [6, 2]: +1 XP que, con xpSameRoll, paga convertir el 2 en 6.
    //    Slots llenos: reemplaza Trepar por "Escalar muros 3".
    rollId = await declare(1, 'Trepar', 2);
    await dmPrepares(rollId, [6, 6, 6]);
    resolved = await playerRollsAndResolves(rollId, [6, 2]);
    expect(resolved.record.result, RollResultDto.fallo);
    final option = advancementOption(
      character: (await character(roomId, playerUid)).sheet,
      settings: r.settings,
      playerDice: resolved.record.playerRoll!,
      oppositionDice: resolved.record.opposition!,
      skillIndex: 1,
    )!;
    expect(option.xpCost, 1);
    expect(option.slotsFull, isTrue);
    result = await rolls.applyAdvance(
      r,
      resolved,
      await character(roomId, playerUid),
      choice: const AdvancementChoiceDto(newSkillName: 'Escalar muros', slot: SlotChoiceKind.replace, replaceIndex: 1),
      actor: ActorDto.owner,
      uid: playerUid,
    );
    sheet = (await character(roomId, playerUid)).sheet;
    expect(sheet.skills.map((s) => '${s.name} ${s.level}'), ['Do Anything 1', 'Escalar muros 3']);
    expect(sheet.xp, 0);
    expect((await roll(r, rollId)).record.advance, AdvanceStateDto.aplicado);

    // 3) Un intento de trampa directo: subir XP a mano falla.
    await expectLater(
      db.doc('rooms/$roomId/characters/$playerUid').update({'xp': 99}),
      throwsA(isA<FirebaseException>()),
    );
    await auth.signOut();
    await tester.pump();
  });
}
