import 'package:cloud_firestore/cloud_firestore.dart';

import '../rust/api/engine.dart';
import 'models.dart';

class ItemException implements Exception {
  ItemException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Catálogo del DM e inventarios de los personajes.
class ItemRepository {
  ItemRepository(this._db);

  final FirebaseFirestore _db;

  CollectionReference<Json> _catalog(String roomId) => _db.collection('rooms/$roomId/catalog');
  CollectionReference<Json> _inventory(String roomId, String cid) =>
      _db.collection('rooms/$roomId/characters/$cid/inventory');

  void _check(ItemDto item) {
    final error = validateItem(item: item);
    if (error != null) throw ItemException(error);
  }

  Stream<List<ItemDoc>> watchCatalog(String roomId) =>
      _catalog(roomId).orderBy('name').snapshots().map((q) => q.docs.map(ItemDoc.fromDoc).toList());

  Stream<List<ItemDoc>> watchInventory(String roomId, String cid) =>
      _inventory(roomId, cid).orderBy('name').snapshots().map((q) => q.docs.map(ItemDoc.fromDoc).toList());

  Future<void> saveCatalogItem(String roomId, ItemDto item, {String? id}) {
    _check(item);
    final data = {...itemToMap(item), 'updatedAt': FieldValue.serverTimestamp()};
    return id == null ? _catalog(roomId).add(data) : _catalog(roomId).doc(id).set(data);
  }

  Future<void> deleteCatalogItem(String roomId, String id) => _catalog(roomId).doc(id).delete();

  /// El DM entrega una copia del objeto con su propia cantidad.
  Future<void> give(String roomId, String cid, ItemDoc catalogItem, int quantity, {required String dmUid}) {
    final copy = ItemDto(
      name: catalogItem.name,
      description: catalogItem.description,
      value: catalogItem.value,
      quantity: quantity,
    );
    _check(copy);
    return _inventory(roomId, cid).add({
      ...itemToMap(copy),
      'catalogItemId': catalogItem.id,
      'givenBy': dmUid,
      'givenAt': FieldValue.serverTimestamp(),
    });
  }

  /// El DM edita una copia ya entregada.
  Future<void> updateInventoryItem(String roomId, String cid, String id, ItemDto item) {
    _check(item);
    return _inventory(roomId, cid).doc(id).update({...itemToMap(item), 'updatedAt': FieldValue.serverTimestamp()});
  }

  /// El dueño (o el DM) ajusta la cantidad; puede quedar en 0.
  Future<void> setQuantity(String roomId, String cid, String id, int quantity) {
    if (quantity < 0) throw ItemException('La cantidad no puede ser negativa.');
    return _inventory(roomId, cid).doc(id).update({'quantity': quantity});
  }

  Future<void> removeFromInventory(String roomId, String cid, String id) => _inventory(roomId, cid).doc(id).delete();
}
