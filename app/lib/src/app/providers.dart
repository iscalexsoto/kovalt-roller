import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/character_repository.dart';
import '../data/item_repository.dart';
import '../data/models.dart';
import '../data/presence_repository.dart';
import '../data/roll_repository.dart';
import '../data/room_repository.dart';
import 'config.dart';

// ---------- servicios ----------

final realtimeDatabaseProvider = Provider((ref) => AppConfig.realtimeDatabase(FirebaseAuth.instance));

final authRepositoryProvider = Provider((ref) => AppConfig.authRepository(FirebaseAuth.instance));
final roomRepositoryProvider = Provider(
  (ref) => RoomRepository(FirebaseFirestore.instance, ref.watch(realtimeDatabaseProvider)),
);
final characterRepositoryProvider = Provider((ref) => CharacterRepository(FirebaseFirestore.instance));
final itemRepositoryProvider = Provider((ref) => ItemRepository(FirebaseFirestore.instance));
final rollRepositoryProvider = Provider((ref) => RollRepository(FirebaseFirestore.instance));
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
