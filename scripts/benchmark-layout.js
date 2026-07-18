import { performance } from 'node:perf_hooks';

import { buildFamilyLayout } from '../src/layout-engine.js';
import { createSyntheticGraph } from './synthetic-graph.js';

const graph = createSyntheticGraph();
const startedAt = performance.now();
const { projection, layout } = buildFamilyLayout(graph, { width: 1280 });
const elapsed = performance.now() - startedAt;
const visiblePeople = new Set(layout.nodes.map(node => node.personId));

if (visiblePeople.size !== Object.keys(graph.people).length) {
  throw new Error(`Layout omitted ${Object.keys(graph.people).length - visiblePeople.size} people`);
}

console.log([
  `${visiblePeople.size} people`,
  `${graph.families.length} families`,
  `${projection.generations.length} generations`,
  `${layout.bands.length} rows`,
  `${elapsed.toFixed(1)} ms`
].join(' · '));
