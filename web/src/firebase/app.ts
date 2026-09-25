import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

/** `vite --mode emu` (pnpm dev:emu): proyecto de demostración `demo-kovalt` contra Firebase Emulator Suite
 *  (`bash scripts/emulators.sh`). Sin él, el proyecto real `kovalt-roller-db`. */
export const IS_EMULATOR = import.meta.env.MODE === 'emu';
const EMULATOR_HOST = (import.meta.env.VITE_EMULATOR_HOST as string | undefined) || '127.0.0.1';

// Estos valores identifican el proyecto, no son secretos: los datos los protegen las Security Rules (firebase/).
const PRODUCTION: FirebaseOptions = {
  apiKey: 'AIzaSyDKZYbq_QaeKFLDNTSHdYNSQ2PTD1uPNGc',
  appId: '1:858343653650:web:5dbfa6938fd0b4e74e73cb',
  messagingSenderId: '858343653650',
  projectId: 'kovalt-roller-db',
  authDomain: 'kovalt-roller-db.firebaseapp.com',
  databaseURL: 'https://kovalt-roller-db-default-rtdb.firebaseio.com',
  storageBucket: 'kovalt-roller-db.firebasestorage.app',
};

const DEMO: FirebaseOptions = {
  apiKey: 'demo-api-key',
  appId: '1:000000000000:web:0000000000000000000000',
  messagingSenderId: '000000000000',
  projectId: 'demo-kovalt',
  authDomain: 'demo-kovalt.firebaseapp.com',
  databaseURL: 'https://demo-kovalt-default-rtdb.firebaseio.com',
  storageBucket: 'demo-kovalt.appspot.com',
};

export const firebaseApp = initializeApp(IS_EMULATOR ? DEMO : PRODUCTION);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const rtdb = getDatabase(firebaseApp);

if (IS_EMULATOR) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectDatabaseEmulator(rtdb, EMULATOR_HOST, 9000);
}
