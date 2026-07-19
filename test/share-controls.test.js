import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('keeps Import and Share actions visible in the header', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<span>Import<\/span>/);
  assert.match(html, /<button class="share-trigger" id="share-trigger" type="button">Share<\/button>/);
});
