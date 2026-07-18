import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFamilyLayout,
  layoutFamilyGraph,
  projectFamilyForest
} from '../src/layout-engine.js';

test('production layout includes disconnected families and isolated people', () => {
  const forest = {
    people: Object.fromEntries('ABCDEFG'.split('').map(id => [id, { id, name: id }])),
    families: [
      { id: 'LEFT', partners: ['A', 'B'], children: ['C'], marriage: '' },
      { id: 'RIGHT', partners: ['D', 'E'], children: ['F'], marriage: '' }
    ]
  };

  const { projection, layout } = buildFamilyLayout(forest, { width: 900 });
  const visiblePeople = new Set(layout.nodes.map(node => node.personId));

  assert.deepEqual([...visiblePeople].sort(), Object.keys(forest.people));
  assert.equal(projection.rootUnitIds.length, 3);
});

test('production layout accepts a GEDCOM containing only individual records', () => {
  const individuals = {
    people: {
      A: { id: 'A', name: 'Person A' },
      B: { id: 'B', name: 'Person B' }
    },
    families: []
  };

  const { layout } = buildFamilyLayout(individuals, { width: 500 });

  assert.deepEqual(layout.nodes.map(node => node.personId), ['A', 'B']);
});

test('projects disconnected components without repeatedly scanning every family', () => {
  let partnerReads = 0;
  const people = {};
  const families = [];

  for (let index = 0; index < 80; index += 1) {
    const partnerIds = [`A${index}`, `B${index}`];
    const childId = `C${index}`;
    [...partnerIds, childId].forEach(id => { people[id] = { id, name: id }; });
    families.push({
      id: `F${index}`,
      get partners() {
        partnerReads += 1;
        return partnerIds;
      },
      children: [childId]
    });
  }

  projectFamilyForest({ people, families });

  assert.ok(partnerReads < 5000, `expected local component work, observed ${partnerReads} partner reads`);
});

test('projects a connected pedigree using family-local unit work', () => {
  let partnerReads = 0;
  const people = {};
  const families = [];

  for (let index = 0; index <= 100; index += 1) {
    [`A${index}`, `B${index}`].forEach(id => { people[id] = { id, name: id }; });
  }
  for (let index = 0; index < 100; index += 1) {
    const partnerIds = [`A${index}`, `B${index}`];
    families.push({
      id: `F${index}`,
      get partners() {
        partnerReads += 1;
        return partnerIds;
      },
      children: [`A${index + 1}`]
    });
  }

  projectFamilyForest({ people, families });

  assert.ok(partnerReads < 5000, `expected family-local unit work, observed ${partnerReads} partner reads`);
});

const people = Object.fromEntries('ABCDEFGHIJKLM'.split('').map(id => [id, {
  id,
  name: `Person ${id}`,
  birth: '',
  death: '',
  birthPlace: '',
  deathPlace: '',
  occupation: ''
}]));

const graph = {
  people,
  families: [
    { id: 'F0', partners: ['A', 'B'], children: ['C', 'F', 'G', 'H', 'I', 'J', 'K'], marriage: '' },
    { id: 'F1', partners: ['C', 'D'], children: ['L'], marriage: '' },
    { id: 'F2', partners: ['C', 'E'], children: ['M'], marriage: '' }
  ]
};

test('projects remarriages into one family unit without duplicating the anchor person', () => {
  const projection = projectFamilyForest(graph);
  const remarriage = projection.units.find(unit => unit.anchorId === 'C');

  assert.deepEqual(remarriage.partnerIds, ['D', 'E']);
  assert.deepEqual(remarriage.familyIds, ['F1', 'F2']);
  assert.equal(projection.units.filter(unit => unit.personIds.includes('C')).length, 1);
  assert.equal(projection.parentage.filter(edge => edge.sourceFamilyId === 'F0').length, 7);
});

test('projects the complete connected tree', () => {
  const projection = projectFamilyForest(graph);
  const visiblePeople = new Set(projection.units.flatMap(unit => unit.personIds));

  assert.equal(visiblePeople.size, Object.keys(graph.people).length);
  assert.equal(projection.connected, true);
});

test('includes ancestors and descendants in the full forest', () => {
  const connectedGraph = {
    people: Object.fromEntries('ABCDEFGHIJKL'.split('').map(id => [id, { id, name: id }])),
    families: [
      { id: 'R', partners: ['A', 'B'], children: ['C'], marriage: '' },
      { id: 'DA', partners: ['C', 'D'], children: ['E'], marriage: '' },
      { id: 'AA', partners: ['F', 'G'], children: ['A', 'H'], marriage: '' },
      { id: 'AB', partners: ['I', 'J'], children: ['B'], marriage: '' },
      { id: 'AD', partners: ['K', 'L'], children: ['D'], marriage: '' }
    ]
  };

  const connected = projectFamilyForest(connectedGraph);
  const connectedPeople = new Set(connected.units.flatMap(unit => unit.personIds));

  assert.equal(connectedPeople.size, 12);
  assert.equal(connected.generations.length, 4);
  assert.equal(connected.units.find(unit => unit.id === connected.rootUnitId).generation, 1);
});

test('packs wide generations into bands without shrinking cards or exceeding the viewport', () => {
  const projection = projectFamilyForest(graph);
  const layout = layoutFamilyGraph(projection, { width: 520 });

  assert.ok(layout.bands.filter(band => band.generation === 1).length > 1);
  assert.equal(layout.width, 520);
  assert.ok(layout.nodes.every(node => node.x >= 0 && node.x + node.width <= layout.width));
  assert.ok(layout.nodes.every(node => node.width === 154));
});

test('stacks partners in compact viewports and keeps every node inside the layout', () => {
  const projection = projectFamilyForest(graph);
  const layout = layoutFamilyGraph(projection, { width: 300 });
  const rootNodes = layout.nodes.filter(node => node.unitId === 'root:F0');

  assert.equal(rootNodes.length, 2);
  assert.equal(rootNodes[0].x, rootNodes[1].x);
  assert.ok(rootNodes[1].y > rootNodes[0].y);
  assert.ok(layout.nodes.every(node => node.x >= 0 && node.x + node.width <= layout.width));
});

test('creates one relationship connector per union and deterministic geometry', () => {
  const projection = projectFamilyForest(graph);
  const first = layoutFamilyGraph(projection, { width: 900 });
  const second = layoutFamilyGraph(projection, { width: 900 });
  const remarriageUnions = first.unionEdges.filter(edge => ['F1', 'F2'].includes(edge.familyId));

  assert.equal(remarriageUnions.length, 2);
  assert.ok(first.connections.segments.some(segment => segment.kind === 'trunk'));
  assert.ok(first.connections.segments.every(segment => segment.points.length >= 2));
  assert.deepEqual(first, second);
});

test('reserves a label channel between stacked partners in a multiple union', () => {
  const projection = projectFamilyForest(graph);
  [900, 300].forEach(width => {
    const layout = layoutFamilyGraph(projection, { width });
    const partnerNodes = layout.nodes
      .filter(node => node.unitId === 'person:C' && !node.anchor)
      .sort((left, right) => left.y - right.y);
    const partnerGap = partnerNodes[1].y - (partnerNodes[0].y + partnerNodes[0].height);

    assert.ok(partnerGap >= 18);
  });
});

test('leaves a visible connector shelf above every destination card', () => {
  const projection = projectFamilyForest(graph);
  const layout = layoutFamilyGraph(projection, { width: 900 });
  const drops = layout.connections.segments.filter(segment => segment.kind === 'drop');

  assert.ok(drops.length > 0);
  assert.ok(drops.every(segment => segment.points.at(-1).y - segment.points[0].y >= 14));
});

test('assigns separate offspring routing shelves to different parent families in the same row', () => {
  const separateFamiliesGraph = {
    people: Object.fromEntries('ABCDEFGH'.split('').map(id => [id, { id, name: id }])),
    families: [
      { id: 'ROOT', partners: ['A', 'B'], children: ['C', 'D'], marriage: '' },
      { id: 'LEFT', partners: ['C', 'E'], children: ['G'], marriage: '' },
      { id: 'RIGHT', partners: ['D', 'F'], children: ['H'], marriage: '' }
    ]
  };
  const projection = projectFamilyForest(separateFamiliesGraph);
  const layout = layoutFamilyGraph(projection, { width: 900 });
  const railY = bundleId => layout.connections.segments
    .find(segment => segment.bundleId === bundleId && segment.kind === 'route')
    ?.points.at(-2).y;

  assert.notEqual(railY('LEFT'), undefined);
  assert.notEqual(railY('RIGHT'), undefined);
  assert.notEqual(railY('LEFT'), railY('RIGHT'));
  assert.ok(Math.abs(railY('LEFT') - railY('RIGHT')) >= 6);
});

test('labels partner unions and child connectors with distinct relationship roles', () => {
  const projection = projectFamilyForest(graph);
  const layout = layoutFamilyGraph(projection, { width: 900 });

  assert.ok(layout.unionEdges.every(edge => edge.relationship === 'partner'));
  assert.ok(layout.connections.segments.every(segment => segment.relationship === 'child'));
});

test('gives each child-bearing union in a multiple partnership its own offspring port', () => {
  const projection = projectFamilyForest(graph);
  const layout = layoutFamilyGraph(projection, { width: 900 });
  const firstUnion = layout.unionEdges.find(edge => edge.familyId === 'F1');
  const secondUnion = layout.unionEdges.find(edge => edge.familyId === 'F2');
  const firstRoute = layout.connections.segments.find(segment =>
    segment.bundleId === 'F1' && segment.kind === 'route'
  );

  assert.notDeepEqual(firstUnion.offspringPort, firstUnion.port);
  assert.notDeepEqual(secondUnion.offspringPort, secondUnion.port);
  assert.notEqual(firstUnion.offspringPort.x, secondUnion.offspringPort.x);
  assert.ok(firstUnion.offspringPort.y > firstUnion.port.y);
  assert.ok(secondUnion.offspringPort.y > secondUnion.port.y);
  assert.deepEqual(firstRoute.points[0], firstUnion.offspringPort);
});

test('identifies only people rendered inside a partner group', () => {
  const projection = projectFamilyForest(graph);
  const layout = layoutFamilyGraph(projection, { width: 900 });
  const partneredNodes = layout.nodes.filter(node => node.unitId === 'person:C');
  const singleNode = layout.nodes.find(node => node.personId === 'F');
  const partneredUnit = layout.units.find(unit => unit.id === 'person:C');
  const singleUnit = layout.units.find(unit => unit.id === 'person:F');

  assert.ok(partneredNodes.every(node => node.inPartnerGroup === true));
  assert.equal(singleNode.inPartnerGroup, false);
  assert.equal(partneredUnit.inPartnerGroup, true);
  assert.equal(singleUnit.inPartnerGroup, false);
});

test('keeps a visible horizontal gutter between every sibling unit', () => {
  const mixedGraph = {
    people: Object.fromEntries('PQRSTUV'.split('').map(id => [id, { id, name: id }])),
    families: [
      { id: 'G0', partners: ['P', 'Q'], children: ['R', 'S', 'U', 'V'], marriage: '' },
      { id: 'G1', partners: ['S', 'T'], children: [], marriage: '' }
    ]
  };
  const projection = projectFamilyForest(mixedGraph);
  const layout = layoutFamilyGraph(projection, { width: 1000 });
  const singleUnit = layout.units.find(unit => unit.id === 'person:R');
  const partnerUnit = layout.units.find(unit => unit.id === 'person:S');
  const nextSingleUnit = layout.units.find(unit => unit.id === 'person:U');
  const lastSingleUnit = layout.units.find(unit => unit.id === 'person:V');
  const gaps = [
    partnerUnit.x - (singleUnit.x + singleUnit.width),
    nextSingleUnit.x - (partnerUnit.x + partnerUnit.width),
    lastSingleUnit.x - (nextSingleUnit.x + nextSingleUnit.width)
  ];

  assert.deepEqual(gaps, [22, 22, 22]);
  assert.equal(partnerUnit.y, singleUnit.y);
});
