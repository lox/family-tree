import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parseGedcom } from '../src/gedcom-parser.js';

const fixture = name => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

test('imports a Reunion 5.5.1 export and identifies unsupported extension data', async () => {
  const graph = parseGedcom(await fixture('reunion-5.5.ged'));

  assert.equal(graph.diagnostics.format.version, '5.5.1');
  assert.equal(graph.diagnostics.format.producer, 'Reunion');
  assert.equal(graph.people.I1.media[0].primary, true);
  assert.deepEqual(graph.families[0].partners, ['I1', 'I2']);
  assert.deepEqual(graph.diagnostics.warnings, [{
    code: 'unsupported-tags',
    count: 1,
    message: '1 tag is not displayed.',
    details: ['_SIZE (1)']
  }]);
});

test('imports GEDCOM 7 partner records without assuming husband and wife roles', async () => {
  const graph = parseGedcom(await fixture('gedcom-7.ged'));

  assert.equal(graph.diagnostics.format.version, '7.0');
  assert.deepEqual(graph.families[0].partners, ['I1', 'I2']);
  assert.deepEqual(graph.diagnostics.warnings, []);
});

test('keeps the usable portion of an incomplete file and explains omitted data', async () => {
  const graph = parseGedcom(await fixture('incomplete-family.ged'));

  assert.deepEqual(graph.families[0].partners, ['I1']);
  assert.deepEqual(graph.families[0].children, []);
  assert.deepEqual(graph.diagnostics.warnings.map(item => item.code), [
    'malformed-lines',
    'unsupported-tags',
    'missing-person-references'
  ]);
});
