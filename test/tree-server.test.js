import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

import { createFamilyTreeServer } from '../server/app.js';
import { createMemoryTreeStorage } from '../server/memory-tree-storage.js';

const treeId = 'Hq5m8A5Y6kYtKJQW2n4hSufg7ZB4cP9x';
const gedcom = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Ada /Lovelace/\n0 TRLR\n';
const gunzipAsync = promisify(gunzip);

async function withServer(options, callback) {
  const server = createFamilyTreeServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('uploads and retrieves a compressed GEDCOM through the storage adapter', async () => {
  const storage = createMemoryTreeStorage();
  await withServer({ storage, generateId: () => treeId }, async origin => {
    const upload = await fetch(`${origin}/api/trees`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-filename': 'Ada%20family.ged'
      },
      body: gedcom
    });

    assert.equal(upload.status, 201);
    assert.deepEqual(await upload.json(), { id: treeId, url: `/t/${treeId}` });

    const download = await fetch(`${origin}/api/trees/${treeId}`);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(download.headers.get('cache-control'), 'private, no-store');
    assert.equal(download.headers.get('x-tree-filename'), 'Ada%20family.ged');
    assert.equal(await download.text(), gedcom);
  });
});

test('rejects malformed, oversized, and invalid tree requests', async () => {
  const storage = createMemoryTreeStorage();
  await withServer({ storage, generateId: () => treeId, maxUploadBytes: 32 }, async origin => {
    const malformed = await fetch(`${origin}/api/trees`, {
      method: 'POST',
      body: 'not a GEDCOM file'
    });
    assert.equal(malformed.status, 422);
    assert.match((await malformed.json()).error, /GEDCOM HEAD/);

    const oversized = await fetch(`${origin}/api/trees`, {
      method: 'POST',
      body: `0 HEAD\n${'x'.repeat(40)}`
    });
    assert.equal(oversized.status, 413);

    assert.equal((await fetch(`${origin}/api/trees/short`)).status, 400);
    assert.equal((await fetch(`${origin}/api/trees/${treeId}`)).status, 404);
    assert.equal(storage.size, 0);
  });
});

test('passes validated gzip data to storage', async () => {
  let storedBody;
  const storage = {
    async putTree({ body }) {
      const chunks = [];
      for await (const chunk of body) chunks.push(Buffer.from(chunk));
      storedBody = Buffer.concat(chunks);
    },
    async getTree() { return null; }
  };
  await withServer({ storage, generateId: () => treeId }, async origin => {
    const response = await fetch(`${origin}/api/trees`, { method: 'POST', body: gedcom });
    assert.equal(response.status, 201);
    assert.equal((await gunzipAsync(storedBody)).toString('utf8'), gedcom);
  });
});

test('settles the storage upload when a client disconnects', async () => {
  let settled = false;
  const storage = {
    async putTree({ body }) {
      try {
        for await (const chunk of body) void chunk;
      } finally {
        settled = true;
      }
    },
    async getTree() { return null; }
  };
  const server = createFamilyTreeServer({ storage, logger: { error() {} } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const socket = net.connect(server.address().port, '127.0.0.1');
  await once(socket, 'connect');
  socket.write('POST /api/trees HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100000\r\n\r\n0 HEAD\n');
  socket.destroy();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(settled, true);
  server.close();
  await once(server, 'close');
});

test('rate limits repeated uploads from one client', async () => {
  const storage = createMemoryTreeStorage();
  await withServer({
    storage,
    generateId: () => treeId,
    uploadRateLimit: 1
  }, async origin => {
    const first = await fetch(`${origin}/api/trees`, { method: 'POST', body: gedcom });
    const second = await fetch(`${origin}/api/trees`, { method: 'POST', body: gedcom });
    assert.equal(first.status, 201);
    assert.equal(second.status, 429);
    assert.ok(Number(second.headers.get('retry-after')) > 0);
  });
});

test('accepts recoverable leading lines like the browser parser', async () => {
  const storage = createMemoryTreeStorage();
  await withServer({ storage, generateId: () => treeId }, async origin => {
    const response = await fetch(`${origin}/api/trees`, {
      method: 'POST',
      body: `export note that is not GEDCOM\n${gedcom}`
    });
    assert.equal(response.status, 201);
  });
});

test('returns a client error for malformed URL encoding', async () => {
  const storage = createMemoryTreeStorage();
  await withServer({ storage, logger: { error() {} } }, async origin => {
    const response = await fetch(`${origin}/%zz`);
    assert.equal(response.status, 400);
  });
});

test('serves the application shell for shared-tree routes', async () => {
  const storage = createMemoryTreeStorage();
  await withServer({
    storage,
    generateId: () => treeId,
    readStaticFile: async path => path.endsWith('index.html')
      ? Buffer.from('<!doctype html><title>Family Tree</title>')
      : null
  }, async origin => {
    const response = await fetch(`${origin}/t/${treeId}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Family Tree/);
  });
});
