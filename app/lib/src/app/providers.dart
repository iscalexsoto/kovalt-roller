import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/character_repository.dart';
import '../data/item_repository.dart';
import '../data/models.dart';
import '../data/presence_repository.dart';
import '../data/roll_repository.dart';
import '../data/room_repository.dart';
import 'config.dart';
import 'instance.dart';

// ---------- servicios ----------

/// Firebase de la ventana actual; se inyecta en `main` según su plaza.
final firebaseSessionProvider = Provider<FirebaseSession>((ref) => throw UnimplementedError('Se inyecta en main'));

/// Plaza de la ventana actual (se inyecta en `main`).
final instanceSlotProvider = Provider<InstanceSlot>((ref) => InstanceSlot.single);
final _auth = Provider((ref) => ref.watch(firebaseSessionProvider).auth);
final _db = Provider((ref) => ref.watch(firebaseSessionProvider).db);

final realtimeDatabaseProvider = Provider((ref) => AppConfig.realtimeDatabase(ref.watch(_auth)));

final authRepositoryProvider = Provider((ref) => AppConfig.authRepository(ref.watch(_auth), ref.watch(_db)));
final roomRepositoryProvider = Provider((ref) => RoomRepository(ref.watch(_db), ref.watch(realtimeDatabaseProvider)));
final characterRepositoryProvider = Provider((ref) => CharacterRepository(ref.watch(_db)));
final itemRepositoryProvider = Provider((ref) => ItemRepository(ref.watch(_db)));
final rollRepositoryProvider = Provider((ref) => RollRepository(ref.watch(_db)));
final presenceRepositoryProvider = Provider((ref) => PresenceRepository(ref.watch(realtimeDatabaseProvider)));

// ---------- sesión ----------

final authStateProvider = StreamProvider<User?>((ref) => ref.watch(authRepositoryProvider).authStateChanges());

final currentUserProvider = Provider<User?>((ref) => ref.watch(authStateProvider).value);

final myRoomsProvider = StreamProvider<List<MyRoomEntry>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return const Stream.empty();
  return ref.watch(roomRepositoryProvider).watchMyRooms(user.uid);
});

// ---------- sala ----------

final roomProvider = StreamProvider.family<Room?, String>(
  (ref, roomId) => ref.watch(roomRepositoryProvider).watchRoom(roomId),
);

final membersProvider = StreamProvider.family<List<Member>, String>(
  (ref, roomId) => ref.watch(roomRepositoryProvider).watchMembers(roomId),
);

final charactersProvider = StreamProvider.family<List<CharacterDoc>, String>(
  (ref, roomId) => ref.watch(characterRepositoryProvider).watchAll(roomId),
);

final onlineProvider = StreamProvider.family<Set<String>, String>(
  (ref, roomId) => ref.watch(presenceRepositoryProvider).watchOnline(roomId),
);

final rollsProvider = StreamProvider.family<List<RollDoc>, String>((ref, roomId) {
  final room = ref.watch(roomProvider(roomId)).value;
  if (room == null) return const Stream.empty();
  return ref.watch(rollRepositoryProvider).watch(roomId, dmUid: room.dmUid);
});

final catalogProvider = StreamProvider.family<List<ItemDoc>, String>(
  (ref, roomId) => ref.watch(itemRepositoryProvider).watchCatalog(roomId),
);

final inventoryProvider = StreamProvider.family<List<ItemDoc>, ({String roomId, String characterId})>(
  (ref, key) => ref.watch(itemRepositoryProvider).watchInventory(key.roomId, key.characterId),
);
