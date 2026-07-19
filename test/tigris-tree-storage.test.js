import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  createTigrisTreeStorage,
  decodeFilenameMetadata,
  encodeFilenameMetadata
} from '../server/tigris-tree-storage.js';

test('keeps encoded filenames within a conservative S3 metadata budget', () => {
  const filename = `${'家'.repeat(255)}.ged`;
  const encoded = encodeFilenameMetadata(filename);
  assert.ok(Buffer.byteLength(encoded, 'ascii') <= 1024);
  assert.ok(decodeFilenameMetadata(encoded).endsWith('.ged'));
});

test('round trips ordinary Unicode filenames through metadata', () => {
  const filename = 'Donald 家族.ged';
  assert.equal(decodeFilenameMetadata(encodeFilenameMetadata(filename)), filename);
});

test('uses one multipart worker and preserves the compressed body stream', async () => {
  const body = Readable.from(Buffer.from('compressed GEDCOM'));
  let uploadOptions;
  const storage = createTigrisTreeStorage({
    bucket: 'trees',
    client: {},
    createUpload: options => {
      uploadOptions = options;
      return { async done() {} };
    }
  });

  await storage.putTree({ id: 'tree-id', filename: '家族.ged', body });

  assert.equal(uploadOptions.queueSize, 1);
  assert.equal(uploadOptions.params.Body, body);
  assert.equal(uploadOptions.params.ContentEncoding, 'gzip');
  assert.equal(
    decodeFilenameMetadata(uploadOptions.params.Metadata.filename64),
    '家族.ged'
  );
});
