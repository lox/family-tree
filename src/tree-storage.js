const DEFAULT_DATABASE_NAME = 'family-tree-edits';
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = 'tree-snapshots';

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer.`);
  return value;
}

function requireTreeId(id) {
  if (typeof id !== 'string' || !id.trim()) throw new TypeError('A non-empty tree id is required.');
  return id;
}

function clone(value, context) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(`${context} must contain only persistable structured data.`, { cause: error });
  }
}

function validateSnapshot(snapshot, schemaVersion) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('A tree snapshot must be an object.');
  }
  requireTreeId(snapshot.id);
  if (!Number.isInteger(snapshot.schemaVersion) || snapshot.schemaVersion < 1) {
    throw new TypeError('A tree snapshot schemaVersion must be a positive integer.');
  }
  if (snapshot.schemaVersion !== schemaVersion) {
    throw new Error(`Tree snapshot schema version ${snapshot.schemaVersion} is not supported; expected ${schemaVersion}.`);
  }
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) {
    throw new TypeError('A tree snapshot must have a non-negative integer revision.');
  }
  return clone(snapshot, 'A tree snapshot');
}

function validateRecord(record, id, schemaVersion) {
  if (!record || typeof record !== 'object' || record.id !== id || !record.snapshot) {
    throw new Error(`Tree storage record ${id} is corrupt.`);
  }
  let snapshot;
  try {
    snapshot = validateSnapshot(record.snapshot, schemaVersion);
  } catch (error) {
    throw new Error(`Tree storage record ${id} is corrupt: ${error.message}`, { cause: error });
  }
  if (snapshot.id !== id) throw new Error(`Tree storage record ${id} is corrupt: snapshot id does not match.`);
  return { id, snapshot };
}

function nextRecord(current, snapshot, schemaVersion) {
  const validated = validateSnapshot(snapshot, schemaVersion);
  if (current) {
    const previous = validateRecord(current, validated.id, schemaVersion).snapshot;
    if (validated.revision <= previous.revision) {
      throw new Error(`Tree snapshot revision ${validated.revision} must be newer than stored revision ${previous.revision}.`);
    }
  }
  // The document's editLog is the compact durable revision history. Keeping one
  // materialized snapshot avoids duplicating the preserved GEDCOM for every edit.
  return { id: validated.id, snapshot: validated };
}

export function createMemoryTreeStorage({ schemaVersion = 1, records = new Map() } = {}) {
  const version = requirePositiveInteger(schemaVersion, 'schemaVersion');
  if (!(records instanceof Map)) throw new TypeError('records must be a Map.');
  return {
    async save(snapshot) {
      const record = nextRecord(records.get(snapshot?.id), snapshot, version);
      records.set(record.id, clone(record, 'A tree storage record'));
      return clone(record.snapshot, 'A tree snapshot');
    },
    async load(id) {
      requireTreeId(id);
      const stored = records.get(id);
      if (!stored) return null;
      return clone(validateRecord(stored, id, version).snapshot, 'A tree snapshot');
    },
    async delete(id) {
      requireTreeId(id);
      return records.delete(id);
    }
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

function observeTransaction(transaction) {
  const done = transactionDone(transaction);
  void done.catch(() => {});
  return done;
}

function openIndexedDb(indexedDB, databaseName) {
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    throw new Error('IndexedDB is not available in this environment.');
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SNAPSHOT_STORE)) {
        request.result.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another open window.'));
  });
}

const storageError = (action, error) => (
  new Error(`Tree storage could not ${action}: ${error.message}`, { cause: error })
);

export function createIndexedDbTreeStorage({
  schemaVersion = 1,
  indexedDB = globalThis.indexedDB,
  databaseName = DEFAULT_DATABASE_NAME
} = {}) {
  const version = requirePositiveInteger(schemaVersion, 'schemaVersion');
  if (typeof databaseName !== 'string' || !databaseName.trim()) {
    throw new TypeError('databaseName must be a non-empty string.');
  }
  let databasePromise;
  const database = () => {
    try {
      databasePromise ??= openIndexedDb(indexedDB, databaseName);
      return databasePromise;
    } catch (error) {
      return Promise.reject(error);
    }
  };

  async function readRecord(id, action) {
    requireTreeId(id);
    try {
      const db = await database();
      const transaction = db.transaction(SNAPSHOT_STORE, 'readonly');
      const done = observeTransaction(transaction);
      const record = await requestResult(transaction.objectStore(SNAPSHOT_STORE).get(id));
      await done;
      return record ?? null;
    } catch (error) {
      throw storageError(action, error);
    }
  }

  return {
    async save(snapshot) {
      const validated = validateSnapshot(snapshot, version);
      try {
        const db = await database();
        const transaction = db.transaction(SNAPSHOT_STORE, 'readwrite');
        const done = observeTransaction(transaction);
        const store = transaction.objectStore(SNAPSHOT_STORE);
        const current = await requestResult(store.get(validated.id));
        const record = nextRecord(current, validated, version);
        await requestResult(store.put(record));
        await done;
        return clone(record.snapshot, 'A tree snapshot');
      } catch (error) {
        throw storageError('save the tree snapshot', error);
      }
    },
    async load(id) {
      const stored = await readRecord(id, 'load the tree snapshot');
      return stored ? clone(validateRecord(stored, id, version).snapshot, 'A tree snapshot') : null;
    },
    async delete(id) {
      requireTreeId(id);
      try {
        const db = await database();
        const transaction = db.transaction(SNAPSHOT_STORE, 'readwrite');
        const done = observeTransaction(transaction);
        const store = transaction.objectStore(SNAPSHOT_STORE);
        const current = await requestResult(store.get(id));
        if (current) await requestResult(store.delete(id));
        await done;
        return Boolean(current);
      } catch (error) {
        throw storageError('delete the tree', error);
      }
    },
    close() {
      databasePromise?.then(db => db.close()).catch(() => {});
      databasePromise = undefined;
    }
  };
}
