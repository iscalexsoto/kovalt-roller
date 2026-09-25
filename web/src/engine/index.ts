/** Motor de reglas de Roll For Shoes: lógica pura, sin I/O. Es la fuente de verdad de las reglas;
 *  `firebase/firestore.rules` replica sus invariantes en el servidor (si cambia una, cambian las dos). */
export * from './advancement';
export * from './character';
export * from './dice';
export * from './errors';
export * from './inventory';
export * from './resolve';
export * from './rollFlow';
export * from './types';
