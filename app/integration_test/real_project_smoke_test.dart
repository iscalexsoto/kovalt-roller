// Prueba de humo contra el proyecto REAL de Firebase (no los emuladores).
//
// Crea dos cuentas de prueba (@example.com) y una sala, juega una tirada
// completa y, pase lo que pase, borra lo que las reglas permiten borrar.
// Quedan el documento de la sala y sus tiradas (las reglas no dejan borrar
// tiradas): se eliminan desde la consola. Solo corre si se confirma el proyecto:
//
//   flutter test integration_test/real_project_smoke_test.dart -d windows \
//     --dart-define=CONFIRM_REAL_PROJECT=kovalt-roller-db
import 'dart:math';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:kovalt_roller/firebase_options.dart';
import 'package:kovalt_roller/src/app/config.dart';
import 'package:kovalt_roller/src/data/character_repository.dart';
import 'package:kovalt_roller/src/data/item_repository.dart';
import 'package:kovalt_roller/src/data/models.dart';
import 'package:kovalt_roller/src/data/presence_repository.dart';
import 'package:kovalt_roller/src/data/roll_repository.dart';
import 'package:kovalt_roller/src/data/room_repository.dart';
import 'package:kovalt_roller/src/rust/api/engine.dart';
import 'package:kovalt_roller/src/rust/api/flow.dart';
import 'package:kovalt_roller/src/rust/frb_generated.dart';

const _confirm = String.fromEnvironment('CONFIRM_REAL_PROJECT');

void log(String message) {
  // ignore: avoid_print
  print('SMOKE $message');
}

Future<void> attempt(String what, Future<void> Function() action) async {
  try {
    await action();
  } catch (e) {
    log('limpieza: no se pudo $what ($e)');
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('prueba de humo en el proyecto real', (tester) async {
    if (AppConfig.useEmulators) fail('Esta prueba es para el proyecto real, no para los emuladores.');
    final projectId = DefaultFirebaseOptions.currentPlatform.projectId;
    if (_confirm != projectId) fail('Confirma con --dart-define=CONFIRM_REAL_PROJECT=$projectId');

    await RustLib.init();
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    final fbAuth = FirebaseAuth.instance;
    final db = FirebaseFirestore.instance;
    final rtdb = AppConfig.realtimeDatabase(fbAuth);
    final auth = AppConfig.authRepository(fbAuth, db);
    final rooms = RoomRepository(db, rtdb);
    final characters = CharacterRepository(db);
    final items = ItemRepository(db);
    final rolls = RollRepository(db);
    final presence = PresenceRepository(rtdb);

    final stamp = DateTime.now().millisecondsSinceEpoch;
    final rnd = Random.secure();
    String password() => List.generate(20, (_) => rnd.nextInt(36).toRadixString(36)).join();
    final dmEmail = 'kovalt-smoke-dm-$stamp@example.com';
    final dmPassword = password();
    final playerEmail = 'kovalt-smoke-player-$stamp@example.com';
    final playerPassword = password();

    String? dmUid;
    String? playerUid;
    var playerHasEmail = false;
    Room? room;

    Future<void> asDm() async {
      await auth.signOut();
      await auth.signIn(dmEmail, dmPassword);
    }

    Future<void> asPlayer() async {
      await auth.signOut();
      await auth.signIn(playerEmail, playerPassword);
    }

    Future<void> deleteCurrentAccount() async {
      await fbAuth.currentUser!.delete();
      await AppConfig.resetFirestore(db);
    }

    Future<void> cleanup() async {
      final r = room;
      if (dmUid != null) {
        await attempt('entrar como DM', asDm);
        if (r != null) {
          if (playerUid != null) {
            await attempt('borrar inventario', () async {
              for (final d in (await db.collection('rooms/${r.id}/characters/$playerUid/inventory').get()).docs) {
                await d.reference.delete();
              }
            });
            await attempt('borrar personaje', () => db.doc('rooms/${r.id}/characters/$playerUid').delete());
            await attempt('expulsar jugador', () => rooms.removeMember(r.id, playerUid!));
          }
          await attempt('borrar catálogo', () async {
            for (final d in (await db.collection('rooms/${r.id}/catalog').get()).docs) {
              await d.reference.delete();
            }
          });
          await attempt('borrar código', () => db.doc('roomCodes/${r.code}').delete());
          await attempt('borrar espejo RTDB', () async {
            await rtdb.remove('members/${r.id}/$dmUid');
            await rtdb.remove('roomAccess/${r.id}');
          });
          await attempt('borrar membresía DM', () => db.doc('rooms/${r.id}/members/$dmUid').delete());
          await attempt('borrar índice DM', () => db.doc('users/$dmUid/rooms/${r.id}').delete());
        }
        await attempt('borrar cuenta DM', deleteCurrentAccount);
      }
      if (playerUid != null) {
        // Sin email (fallo antes de convertir la cuenta) la sesión anónima ya se perdió.
        if (playerHasEmail) {
          await attempt('entrar como jugador', asPlayer);
          if (r != null) {
            await attempt('borrar índice jugador', () => db.doc('users/$playerUid/rooms/${r.id}').delete());
          }
          await attempt('borrar cuenta jugador', deleteCurrentAccount);
        } else {
          log('limpieza: queda la cuenta anónima $playerUid');
        }
      }
      await auth.signOut();
      if (r != null) log('queda rooms/${r.id} con sus tiradas: bórralo desde la consola');
    }

    await auth.signOut();
    try {
      // --- DM ---
      await auth.register(dmEmail, dmPassword, 'DM de prueba');
      dmUid = fbAuth.currentUser!.uid;
      log('DM registrado');
      final roomId = await rooms.createRoom(
        uid: dmUid,
        displayName: 'DM de prueba',
        name: 'PRUEBA AUTOMÁTICA (borrar)',
        settings: const RoomSettingsDto(skillSlots: 1, tieWinner: TieWinnerDto.player, xpSameRoll: true, maxDice: 10),
      );
      final r = room = Room.fromDoc(await db.doc('rooms/$roomId').get());
      log('sala creada con código ${r.code}');
      await items.saveCatalogItem(roomId, const ItemDto(name: 'Cuerda', description: 'Prueba', value: 1, quantity: 1));
      log('objeto en el catálogo');

      // --- Jugador: invitado que se convierte en cuenta ---
      await auth.signOut();
      await auth.signInAsGuest('Jugador de prueba');
      final pUid = playerUid = fbAuth.currentUser!.uid;
      await auth.upgradeGuest(playerEmail, playerPassword);
      playerHasEmail = true;
      expect(fbAuth.currentUser!.uid, pUid);
      log('invitado convertido en cuenta (mismo uid)');
      await expectLater(
        rooms.joinByCode(uid: pUid, displayName: 'Jugador', code: 'ZZZZZZ'),
        throwsA(isA<RoomException>()),
      );
      await rooms.joinByCode(uid: pUid, displayName: 'Jugador', code: r.code);
      await characters.create(roomId, pUid, newCharacter(name: 'Personaje de prueba', description: ''));
      log('unido a la sala y personaje creado');
      await presence.goOnline(roomId, pUid, 'Jugador');
      expect(await presence.watchOnline(roomId).first, contains(pUid));
      log('presencia en Realtime Database OK');
      await expectLater(
        db.collection('rooms/$roomId/catalog').get(const GetOptions(source: Source.server)),
        throwsA(isA<FirebaseException>()),
      );
      await expectLater(db.doc('rooms/$roomId/characters/$pUid').update({'xp': 99}), throwsA(isA<FirebaseException>()));
      log('reglas: catálogo privado y XP protegido');
      await rolls.declare(
        roomId,
        pUid,
        action: 'Prueba automática',
        skill: const SkillRefDto(index: 0, name: 'Do Anything', level: 1),
      );
      final rollId = (await db.collection('rooms/$roomId/rolls').get()).docs.single.id;
      await presence.goOffline(roomId, pUid);
      log('acción declarada');

      // --- DM aprueba, opone y entrega el objeto ---
      await asDm();
      var doc = RollDoc.fromDoc(await db.doc('rooms/$roomId/rolls/$rollId').get(), dmUid: dmUid);
      doc = await rolls.act(
        r,
        doc,
        const FlowActionDto(kind: FlowActionKindDto.approve),
        actor: ActorDto.dm,
        uid: dmUid,
      );
      await rolls.act(
        r,
        doc,
        FlowActionDto(kind: FlowActionKindDto.rollOpposition, dice: Uint8List.fromList([2])),
        actor: ActorDto.dm,
        uid: dmUid,
      );
      final catalog = await items.watchCatalog(roomId).first;
      await items.give(roomId, pUid, catalog.single, 2, dmUid: dmUid);
      log('aprobada, oposición tirada y objeto entregado');

      // --- Jugador tira un 6, resuelve y aprende una habilidad ---
      await asPlayer();
      doc = RollDoc.fromDoc(await db.doc('rooms/$roomId/rolls/$rollId').get(), dmUid: dmUid);
      doc = await rolls.act(
        r,
        doc,
        FlowActionDto(kind: FlowActionKindDto.rollPlayer, dice: Uint8List.fromList([6])),
        actor: ActorDto.owner,
        uid: pUid,
      );
      doc = await rolls.act(
        r,
        doc,
        const FlowActionDto(kind: FlowActionKindDto.resolve, tieWinner: TieWinnerDto.player),
        actor: ActorDto.owner,
        uid: pUid,
      );
      expect(doc.record.result, RollResultDto.exito);
      await rolls.applyAdvance(
        r,
        doc,
        CharacterDoc.fromDoc(await db.doc('rooms/$roomId/characters/$pUid').get()),
        choice: const AdvancementChoiceDto(newSkillName: 'Probar', slot: SlotChoiceKind.append, replaceIndex: 0),
        actor: ActorDto.owner,
        uid: pUid,
      );
      final sheet = CharacterDoc.fromDoc(await db.doc('rooms/$roomId/characters/$pUid').get()).sheet;
      expect(sheet.skills.map((s) => '${s.name} ${s.level}'), ['Do Anything 1', 'Probar 2']);
      expect((await items.watchInventory(roomId, pUid).first).single.quantity, 2);
      log('tirada resuelta, habilidad "Probar 2" aprendida e inventario correcto');
    } finally {
      await cleanup();
      log('limpieza terminada');
    }
    await tester.pump();
  });
}
