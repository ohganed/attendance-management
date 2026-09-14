import assert from 'node:assert/strict';
import fs from 'node:fs';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

const DB = 'attendance-v02';
const STORE = 'state';
const KEY = 'main';
const SECRETS = 'secrets';

const source = fs.readFileSync('attendance-enhancements.js', 'utf8');
const start = source.indexOf('function openDb(){');
const end = source.indexOf('\nasync function readState', start);
assert.notEqual(start, -1, 'openDb function must exist in attendance-enhancements.js');
assert.notEqual(end, -1, 'openDb function boundary must exist');
const functionSource = source.slice(start, end).replace('function openDb', 'function');
const openDb = eval(`(${functionSource})`);

function deleteDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('deleteDatabase blocked'));
  });
}

function createV1State(value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function readMain(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

await deleteDb();

// Fresh browser: enhancement may be first to open the database. It must create
// exactly the stores the main v2 app expects, rather than leaving an empty v2 DB.
let db = await openDb();
assert.equal(db.version, 2);
assert.equal(db.objectStoreNames.contains(STORE), true, 'fresh v2 DB needs state store');
assert.equal(db.objectStoreNames.contains(SECRETS), true, 'fresh v2 DB needs secrets store');
db.close();
console.log('PASS: fresh browser creates v2-compatible state and secrets stores');

await deleteDb();

// Existing browser: opening v1 through the enhancement must add secrets while
// preserving the existing state/main object byte-for-byte at the JS data level.
const original = {
  schemaVersion: 1,
  schools: [{ id: 'school-1', name: 'Existing School' }],
  attendance: [{ lessonId: 'lesson-1', studentNumber: 12, status: '欠席' }],
  studentRecords: [{ id: 'record-1', type: 'LEARNING', summary: 'existing record' }],
};
await createV1State(original);
db = await openDb();
assert.equal(db.version, 2);
assert.equal(db.objectStoreNames.contains(STORE), true);
assert.equal(db.objectStoreNames.contains(SECRETS), true);
assert.deepEqual(await readMain(db), original, 'v1 state/main must survive the v2 upgrade unchanged');
db.close();
console.log('PASS: v1 existing state is preserved during v2 upgrade');

await deleteDb();
