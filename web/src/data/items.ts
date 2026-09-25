import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { giveItem, validateItem, type Item } from '../engine';
import { db } from '../firebase/app';
import { UserError } from './errors';
import { itemToMap, type ItemDoc } from './models';

/* Catálogo del DM e inventarios de los personajes. */

const catalog = (roomId: string) => collection(db, 'rooms', roomId, 'catalog');
const inventory = (roomId: string, cid: string) => collection(db, 'rooms', roomId, 'characters', cid, 'inventory');

export const catalogQuery = (roomId: string) => query(catalog(roomId), orderBy('name'));
export const inventoryQuery = (roomId: string, cid: string) => query(inventory(roomId, cid), orderBy('name'));

function check(item: Item): void {
  validateItem(item);
  if (!Number.isInteger(item.quantity) || item.quantity < 0) throw new UserError('La cantidad no puede ser negativa.');
  if (item.value !== null && (!Number.isInteger(item.value) || item.value < 0)) throw new UserError('El valor debe ser un entero positivo.');
}

export async function saveCatalogItem(roomId: string, item: Item, id?: string): Promise<void> {
  check(item);
  const data = { ...itemToMap(item), updatedAt: serverTimestamp() };
  if (id) await setDoc(doc(catalog(roomId), id), data);
  else await addDoc(catalog(roomId), data);
}

export async function deleteCatalogItem(roomId: string, id: string): Promise<void> {
  await deleteDoc(doc(catalog(roomId), id));
}

/** El DM entrega una copia del objeto con su propia cantidad. */
export async function give(roomId: string, cid: string, catalogItem: ItemDoc, quantity: number, dmUid: string): Promise<void> {
  const copy = giveItem({ name: catalogItem.name, description: catalogItem.description, value: catalogItem.value, quantity: catalogItem.quantity }, quantity);
  check(copy);
  await addDoc(inventory(roomId, cid), { ...itemToMap(copy), catalogItemId: catalogItem.id, givenBy: dmUid, givenAt: serverTimestamp() });
}

/** El DM edita una copia ya entregada. */
export async function updateInventoryItem(roomId: string, cid: string, id: string, item: Item): Promise<void> {
  check(item);
  await updateDoc(doc(inventory(roomId, cid), id), { ...itemToMap(item), updatedAt: serverTimestamp() });
}

/** El dueño (o el DM) ajusta la cantidad; puede quedar en 0. */
export async function setQuantity(roomId: string, cid: string, id: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 0) throw new UserError('La cantidad no puede ser negativa.');
  await updateDoc(doc(inventory(roomId, cid), id), { quantity });
}

export async function removeFromInventory(roomId: string, cid: string, id: string): Promise<void> {
  await deleteDoc(doc(inventory(roomId, cid), id));
}
