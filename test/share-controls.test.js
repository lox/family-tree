import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('keeps tree actions hidden until the initial tree has loaded', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<label class="file-control" hidden>/);
  assert.match(html, /<button class="share-trigger" id="share-trigger" type="button" hidden>Share<\/button>/);
  assert.match(html, /<span>Import<\/span>/);
  assert.doesNotMatch(html, />Describe a change<\/button>/);
  assert.doesNotMatch(html, />Export GEDCOM<\/button>/);
});
