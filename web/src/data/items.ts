import { collection, deleteDoc, doc, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch, getDocs, addDoc } from 'firebase/firestore';
import {
  adjustCoins,
  claim,
  giveItem,
  offerLine,
  stack,
  validateCatalogItem,
  validateItem,
  validateOfferLine,
  validateOfferTitle,
  type CatalogItem,
  type Item,
  type OfferKind,
} from '../engine';
import { db } from '../firebase/app';
import { UserError } from './errors';
import { catalogToMap, EVERYONE, itemToMap, lineFrom, lineToMap, type CatalogDoc, type LineDoc } from './models';

/* Catálogo del DM, inventarios de los personajes, y botines y tiendas. */

const catalog = (roomId: string) => collection(db, 'rooms', roomId, 'catalog');
const inventory = (roomId: string, cid: string) => collection(db, 'rooms', roomId, 'characters', cid, 'inventory');
const offers = (roomId: string) => collection(db, 'rooms', roomId, 'offers');
const lines = (roomId: string, oid: string) => collection(db, 'rooms', roomId, 'offers', oid, 'lines');
const characterRef = (roomId: string, cid: string) => doc(db, 'rooms', roomId, 'characters', cid);

export const catalogQuery = (roomId: string) => query(catalog(roomId), orderBy('name'));
export const inventoryQuery = (roomId: string, cid: string) => query(inventory(roomId, cid), orderBy('name'));
export const offersQuery = (roomId: string) => query(offers(roomId), orderBy('createdAt'));
export const linesQuery = (roomId: string, oid: string) => query(lines(roomId, oid), orderBy('name'));

/** Lo que ve un jugador: ventanas abiertas para todos y las abiertas para él (las reglas no filtran). */
export const visibleOffersQueries = (roomId: string, uid: string) =>
  [EVERYONE, uid].map((who) => query(offers(roomId), where('open', '==', true), where('audience', 'array-contains', who)));

// ---------- catálogo ----------

export async function saveCatalogItem(roomId: string, item: CatalogItem, id?: string): Promise<void> {
  validateCatalogItem(item);
  const data = { ...catalogToMap(item), updatedAt: serverTimestamp() };
  if (id) await setDoc(doc(catalog(roomId), id), data);
  else await addDoc(catalog(roomId), data);
}

export async function deleteCatalogItem(roomId: string, id: string): Promise<void> {
  await deleteDoc(doc(catalog(roomId), id));
}

// ---------- inventario ----------

/** El DM entrega unidades de un objeto del catálogo; si el personaje ya lo tiene, se apilan. */
export async function give(roomId: string, cid: string, item: CatalogDoc, quantity: number, dmUid: string): Promise<void> {
  const ref = doc(inventory(roomId, cid), item.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      tx.update(ref, { quantity: stack(Number(snap.data().quantity) || 0, quantity), updatedAt: serverTimestamp() });
    } else {
      tx.set(ref, { ...itemToMap(giveItem(item, quantity)), catalogItemId: item.id, givenBy: dmUid, givenAt: serverTimestamp() });
    }
  });
}

/** El DM edita una copia ya entregada. */
export async function updateInventoryItem(roomId: string, cid: string, id: string, item: Item): Promise<void> {
  validateItem(item);
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

/** El DM suma o resta monedas a un personaje. */
export async function changeCoins(roomId: string, cid: string, coins: number, delta: number): Promise<void> {
  await updateDoc(characterRef(roomId, cid), { coins: adjustCoins(coins, delta), updatedAt: serverTimestamp() });
}

// ---------- botines y tiendas ----------

export async function createOffer(roomId: string, kind: OfferKind, title: string): Promise<string> {
  const ref = doc(offers(roomId));
  await setDoc(ref, { kind, title: validateOfferTitle(title), open: false, audience: [EVERYONE], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateOffer(roomId: string, oid: string, patch: { title?: string; open?: boolean; audience?: string[] }): Promise<void> {
  if (patch.title !== undefined) patch = { ...patch, title: validateOfferTitle(patch.title) };
  if (patch.audience !== undefined && patch.audience.length === 0) throw new UserError('Elige al menos a un jugador.');
  await updateDoc(doc(offers(roomId), oid), { ...patch, updatedAt: serverTimestamp() });
}

/** Borra la ventana y sus líneas. */
export async function deleteOffer(roomId: string, oid: string): Promise<void> {
  const batch = writeBatch(db);
  (await getDocs(lines(roomId, oid))).forEach((d) => batch.delete(d.ref));
  batch.delete(doc(offers(roomId), oid));
  await batch.commit();
}

/** Pone un objeto del catálogo en la ventana; si ya estaba, suma una unidad. */
export async function addLine(roomId: string, oid: string, item: CatalogDoc): Promise<void> {
  const ref = doc(lines(roomId, oid), item.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      const line = lineFrom(snap.id, snap.data());
      const next = { ...line, stock: line.stock + 1 };
      validateOfferLine(next);
      tx.update(ref, { stock: next.stock, updatedAt: serverTimestamp() });
    } else {
      tx.set(ref, { ...lineToMap(offerLine(item, 1)), updatedAt: serverTimestamp() });
    }
  });
}

export async function updateLine(roomId: string, oid: string, line: LineDoc): Promise<void> {
  validateOfferLine(line);
  await updateDoc(doc(lines(roomId, oid), line.id), { price: line.price, stock: line.stock, updatedAt: serverTimestamp() });
}

export async function removeLine(roomId: string, oid: string, lid: string): Promise<void> {
  await deleteDoc(doc(lines(roomId, oid), lid));
}

/** El jugador toma (botín) o compra (tienda) unidades: baja existencias, sube su inventario y paga. */
export async function claimLine(roomId: string, oid: string, kind: OfferKind, lid: string, uid: string, quantity: number): Promise<void> {
  const lineRef = doc(lines(roomId, oid), lid);
  const invRef = doc(inventory(roomId, uid), lid);
  const meRef = characterRef(roomId, uid);
  await runTransaction(db, async (tx) => {
    const [lineSnap, invSnap, meSnap] = await Promise.all([tx.get(lineRef), tx.get(invRef), tx.get(meRef)]);
    if (!lineSnap.exists()) throw new UserError('Ese objeto ya no está.');
    if (!meSnap.exists()) throw new UserError('Necesitas un personaje.');
    const line = lineFrom(lineSnap.id, lineSnap.data());
    const result = claim(kind, line, quantity, Number(meSnap.data().coins) || 0);
    tx.update(lineRef, { stock: result.stock });
    if (invSnap.exists()) {
      tx.update(invRef, { quantity: stack(Number(invSnap.data().quantity) || 0, quantity) });
    } else {
      tx.set(invRef, { ...itemToMap(giveItem(line, quantity)), catalogItemId: lid, offerId: oid, givenBy: null, givenAt: serverTimestamp() });
    }
    if (result.cost > 0) tx.update(meRef, { coins: result.coins, updatedAt: serverTimestamp() });
  });
}
