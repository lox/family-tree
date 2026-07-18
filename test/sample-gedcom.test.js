import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parseGedcom } from '../src/gedcom-parser.js';

test('the bundled demo is a GEDCOM document parsed through the production importer', async () => {
  const sampleGedcom = await readFile(new URL('../src/sample.ged', import.meta.url), 'utf8');
  assert.match(sampleGedcom, /^0 HEAD\n/);

  const graph = parseGedcom(sampleGedcom);

  assert.equal(Object.keys(graph.people).length, 49);
  assert.equal(graph.families.length, 16);
  assert.equal(graph.people.I4.name, 'John Fitzgerald KENNEDY');
  assert.equal(graph.people.I4.occupation, '35th President of the United States');
  assert.equal(graph.people.I4.facts.find(fact => fact.tag === 'BAPM').place, 'Brookline, MA');
  assert.equal(graph.people.I4.notes[0].sources[0].id, 'S7');
  assert.equal(graph.people.I4.media.length, 3);
  assert.deepEqual(graph.diagnostics.warnings, []);
});
