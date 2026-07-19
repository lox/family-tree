import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createIndexedDbTreeStorage,
  createMemoryTreeStorage
} from '../src/tree-storage.js';

const snapshot = (revision, overrides = {}) => ({
  schemaVersion: 1,
  id: 'tree-1',
  revision,
  people: { I1: { id: 'I1', name: `Person ${revision}` } },
  ...overrides
});

test('memory storage clones snapshots and validates their identity and schema', async () => {
  const storage = createMemoryTreeStorage({ schemaVersion: 1 });
  const original = snapshot(0);

  await storage.save(original);
  original.people.I1.name = 'Mutated outside storage';
  const loaded = await storage.load('tree-1');
  loaded.people.I1.name = 'Mutated loaded copy';

  assert.equal((await storage.load('tree-1')).people.I1.name, 'Person 0');
  await assert.rejects(storage.save(snapshot(1, { id: '' })), /non-empty tree id/i);
  await assert.rejects(storage.save(snapshot(1, { schemaVersion: 2 })), /schema version 2.*expected 1/i);
  await assert.rejects(storage.save(snapshot(-1)), /non-negative integer revision/i);
});

test('memory storage keeps one materialized snapshot and rejects stale revisions atomically', async () => {
  const records = new Map();
  const storage = createMemoryTreeStorage({ schemaVersion: 1, records });

  await storage.save(snapshot(0));
  await storage.save(snapshot(1));
  await storage.save(snapshot(2));

  assert.equal((await storage.load('tree-1')).revision, 2);
  assert.equal(records.get('tree-1').snapshot.revision, 2);
  assert.equal(records.get('tree-1').snapshots, undefined);
  await assert.rejects(storage.save(snapshot(2)), /newer than stored revision 2/i);
  assert.equal(records.get('tree-1').snapshot.revision, 2);
  assert.equal(await storage.delete('tree-1'), true);
  assert.equal(await storage.delete('tree-1'), false);
  assert.equal(await storage.load('tree-1'), null);
});

test('memory storage reports corrupt injected records instead of returning invalid data', async () => {
  const records = new Map([['tree-1', {
    id: 'tree-1',
    snapshot: { ...snapshot(1), id: 'other-tree' }
  }]]);
  const storage = createMemoryTreeStorage({ schemaVersion: 1, records });

  await assert.rejects(storage.load('tree-1'), /corrupt.*snapshot id/i);
});

function createFakeIndexedDb({ failPuts = false } = {}) {
  const records = new Map();
  let shouldFailPuts = failPuts;
  const database = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      let pending = 0;
      let completed = false;
      const transaction = {
        error: null,
        objectStore() {
          const request = operation => {
            pending += 1;
            const result = {};
            queueMicrotask(() => {
              try {
                result.result = operation();
                result.onsuccess?.();
              } catch (error) {
                result.error = error;
                result.onerror?.();
                transaction.error = error;
                transaction.onerror?.();
                transaction.onabort?.();
              } finally {
                pending -= 1;
                queueMicrotask(() => {
                  if (!pending && !completed && !transaction.error) {
                    completed = true;
                    transaction.oncomplete?.();
                  }
                });
              }
            });
            return result;
          };
          return {
            get: id => request(() => structuredClone(records.get(id))),
            put: record => request(() => {
              if (shouldFailPuts) throw new Error('disk full');
              records.set(record.id, structuredClone(record));
            }),
            delete: id => request(() => records.delete(id))
          };
        }
      };
      return transaction;
    }
  };
  return {
    records,
    failPuts(value = true) {
      shouldFailPuts = value;
    },
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    }
  };
}

test('IndexedDB storage implements the same snapshot contract', async () => {
  const indexedDB = createFakeIndexedDb();
  const storage = createIndexedDbTreeStorage({ indexedDB, schemaVersion: 1 });

  await storage.save(snapshot(0));
  await storage.save(snapshot(1));
  await storage.save(snapshot(2));

  assert.equal((await storage.load('tree-1')).revision, 2);
  assert.equal(indexedDB.records.get('tree-1').snapshot.revision, 2);
  assert.equal(indexedDB.records.get('tree-1').snapshots, undefined);
  assert.equal(await storage.delete('tree-1'), true);
  assert.equal(await storage.load('tree-1'), null);
  storage.close();
});

test('IndexedDB write failures leave the previous latest snapshot intact', async () => {
  const indexedDB = createFakeIndexedDb();
  const storage = createIndexedDbTreeStorage({ indexedDB, schemaVersion: 1 });
  await storage.save(snapshot(0));

  indexedDB.failPuts();
  await assert.rejects(storage.save(snapshot(1)), /could not save.*disk full/i);
  assert.equal((await storage.load('tree-1')).revision, 0);
});
