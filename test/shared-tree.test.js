import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadSharedTree,
  shareTree,
  sharedTreeIdFromPathname
} from '../src/shared-tree.js';

const treeId = 'Hq5m8A5Y6kYtKJQW2n4hSufg7ZB4cP9x';

test('recognises only valid shared-tree paths', () => {
  assert.equal(sharedTreeIdFromPathname(`/t/${treeId}`), treeId);
  assert.equal(sharedTreeIdFromPathname(`/t/${treeId}/`), treeId);
  assert.equal(sharedTreeIdFromPathname('/t/short'), '');
  assert.equal(sharedTreeIdFromPathname(`/other/${treeId}`), '');
});

test('uploads the original GEDCOM and returns an absolute share URL', async () => {
  const source = new Blob(['0 HEAD\n0 TRLR\n'], { type: 'text/plain' });
  Object.defineProperty(source, 'name', { value: 'Donald family.ged' });
  let received;
  const fetchImpl = async (url, options) => {
    received = { url, options };
    return new Response(JSON.stringify({ id: treeId, url: `/t/${treeId}` }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  };

  const result = await shareTree(source, {
    fetchImpl,
    origin: 'https://family.example'
  });

  assert.equal(received.url, '/api/trees');
  assert.equal(received.options.method, 'POST');
  assert.equal(received.options.body, source);
  assert.equal(received.options.headers['X-Filename'], 'Donald%20family.ged');
  assert.deepEqual(result, {
    id: treeId,
    url: `https://family.example/t/${treeId}`
  });
});

test('loads a shared GEDCOM with its original filename', async () => {
  const fetchImpl = async url => {
    assert.equal(url, `/api/trees/${treeId}`);
    return new Response('0 HEAD\n0 TRLR\n', {
      headers: { 'x-tree-filename': 'Donald%20family.ged' }
    });
  };

  assert.deepEqual(await loadSharedTree(treeId, { fetchImpl }), {
    filename: 'Donald family.ged',
    text: '0 HEAD\n0 TRLR\n'
  });
});

test('reports upload and missing-tree failures clearly', async () => {
  const source = new Blob(['0 HEAD\n']);
  Object.defineProperty(source, 'name', { value: 'tree.ged' });

  await assert.rejects(
    shareTree(source, {
      fetchImpl: async () => new Response(
        JSON.stringify({ error: 'Uploads are temporarily unavailable.' }),
        { status: 503, headers: { 'content-type': 'application/json' } }
      )
    }),
    /Uploads are temporarily unavailable/
  );
  await assert.rejects(
    loadSharedTree(treeId, {
      fetchImpl: async () => new Response('', { status: 404 })
    }),
    /could not be found/i
  );
});
