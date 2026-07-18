import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFamilyLayout } from '../src/layout-engine.js';
import { createSyntheticGraph } from '../scripts/synthetic-graph.js';

test('lays out a roughly 1,000-person pedigree completely and deterministically', () => {
  const graph = createSyntheticGraph();
  const first = buildFamilyLayout(graph, { width: 1280 });
  const second = buildFamilyLayout(graph, { width: 1280 });
  const visiblePeople = new Set(first.layout.nodes.map(node => node.personId));

  assert.equal(Object.keys(graph.people).length, 966);
  assert.equal(graph.families.length, 240);
  assert.equal(visiblePeople.size, 966);
  assert.equal(first.projection.generations.length, 5);
  assert.deepEqual(
    { width: first.layout.width, height: first.layout.height, bands: first.layout.bands.length },
    { width: second.layout.width, height: second.layout.height, bands: second.layout.bands.length }
  );
});
