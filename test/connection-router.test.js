import test from 'node:test';
import assert from 'node:assert/strict';

import { routeConnectionBundles } from '../src/connection-router.js';

const target = (id, x, y, rowId) => ({ id, x, y, railY: y - 12, rowId });

test('bundles one-to-many connections into one trunk, one rail, and target drops', () => {
  const result = routeConnectionBundles({
    width: 320,
    contentLeft: 20,
    contentRight: 300,
    bundles: [{
      id: 'family-a',
      branchIndex: 0,
      source: { x: 160, y: 30, exitY: 54 },
      targets: [target('one', 100, 140, 'row-1'), target('two', 220, 140, 'row-1')]
    }],
    obstacles: []
  });

  assert.deepEqual(result.segments.map(segment => segment.kind), ['trunk', 'rail', 'drop', 'drop']);
  assert.deepEqual(result.junctions.map(junction => ({ x: junction.x, y: junction.y })), [{ x: 160, y: 128 }]);
  assert.equal(result.portals.length, 0);
  assert.equal(result.segments.filter(segment => segment.kind === 'trunk').length, 1);
  assert.deepEqual(result.routes.map(route => route.targetId), ['one', 'two']);
  assert.deepEqual(result.routes[0].points.at(0), { x: 160, y: 30 });
  assert.deepEqual(result.routes[0].points.at(-1), { x: 100, y: 140 });
  assert.deepEqual(
    result.segments.filter(segment => segment.kind === 'drop').map(segment => segment.targetId),
    ['one', 'two']
  );
});

test('routes one child as one continuous path with no junction marker', () => {
  const result = routeConnectionBundles({
    width: 320,
    contentLeft: 20,
    contentRight: 300,
    bundles: [{
      id: 'family-single',
      branchIndex: 0,
      source: { x: 160, y: 30, exitY: 54 },
      targets: [target('only', 220, 140, 'row-1')]
    }],
    obstacles: []
  });

  assert.deepEqual(result.segments.map(segment => segment.kind), ['route']);
  assert.equal(result.junctions.length, 0);
  assert.deepEqual(result.segments[0].points.at(0), { x: 160, y: 30 });
  assert.deepEqual(result.segments[0].points.at(-1), { x: 220, y: 140 });
});

test('wraps one continuous sibling spine around rows with no clear shared channel', () => {
  const result = routeConnectionBundles({
    width: 320,
    contentLeft: 20,
    contentRight: 300,
    bundles: [{
      id: 'family-a',
      branchIndex: 2,
      source: { x: 160, y: 30, exitY: 54 },
      targets: [target('one', 100, 140, 'row-1'), target('two', 210, 270, 'row-2')]
    }],
    obstacles: [{ id: 'blocker', x: 20, y: 160, width: 280, height: 82 }]
  });

  assert.equal(result.portals.length, 0);
  const trunk = result.segments.find(segment => segment.kind === 'trunk');
  const wrap = result.segments.find(segment => segment.kind === 'wrap');
  assert.ok(Math.max(...trunk.points.map(point => point.y)) <= 128);
  assert.ok(wrap);
  assert.ok(wrap.points.every(point => point.x > 300));
  assert.deepEqual(wrap.points.map(point => point.y), [128, 258]);
  const secondRoute = result.routes.find(route => route.targetId === 'two');
  assert.ok(secondRoute.points.some(point => point.x > 300 && point.y === 128));
  assert.ok(secondRoute.points.some(point => point.x > 300 && point.y === 258));
  assert.deepEqual(
    result.junctions.map(junction => ({ x: junction.x, y: junction.y })),
    [{ x: 310, y: 128 }]
  );
});

test('selects a clear interior channel before using an outside gutter', () => {
  const result = routeConnectionBundles({
    width: 500,
    contentLeft: 30,
    contentRight: 470,
    bundles: [{
      id: 'family-b',
      branchIndex: 1,
      source: { x: 250, y: 30, exitY: 60 },
      targets: [target('one', 360, 220, 'row-1')]
    }],
    obstacles: [{ id: 'middle', x: 220, y: 90, width: 60, height: 80 }],
    clearance: 8
  });

  const route = result.segments.find(segment => segment.kind === 'route');
  const routeX = route.points[2].x;
  assert.ok(routeX > 30 && routeX < 470);
  assert.ok(routeX <= 212 || routeX >= 288);
  assert.equal(result.portals.length, 0);
});

test('breaks equal channel detours toward the child instead of routing away from it', () => {
  const result = routeConnectionBundles({
    width: 500,
    contentLeft: 30,
    contentRight: 470,
    bundles: [{
      id: 'family-target-aware',
      branchIndex: 0,
      source: { x: 250, y: 30, exitY: 60 },
      targets: [target('child', 380, 220, 'row-1')]
    }],
    obstacles: [{ id: 'middle', x: 220, y: 90, width: 60, height: 80 }]
  });

  const route = result.segments.find(segment => segment.kind === 'route');
  assert.equal(route.points[2].x, 285);
});

test('uses the visible aisle between sibling shells before taking an outside detour', () => {
  const result = routeConnectionBundles({
    width: 500,
    contentLeft: 20,
    contentRight: 480,
    bundles: [{
      id: 'family-narrow-aisle',
      branchIndex: 0,
      source: { x: 250, y: 30, exitY: 60 },
      targets: [target('child', 250, 300, 'row-1')]
    }],
    obstacles: [
      { id: 'left-shell', x: 20, y: 140, width: 220, height: 82 },
      { id: 'right-shell', x: 250, y: 140, width: 230, height: 82 }
    ]
  });

  const route = result.segments.find(segment => segment.kind === 'route');
  assert.ok(route.points[2].x > 240 && route.points[2].x < 250);
});

test('keeps a centered trunk when a destination shell begins at the rail endpoint', () => {
  const result = routeConnectionBundles({
    width: 500,
    contentLeft: 20,
    contentRight: 480,
    bundles: [{
      id: 'family-endpoint',
      branchIndex: 0,
      source: { x: 250, y: 30, exitY: 60 },
      targets: [{ id: 'child', x: 250, y: 220, railY: 208, rowId: 'row-1' }]
    }],
    obstacles: [{ id: 'destination-shell', x: 100, y: 208, width: 300, height: 82 }]
  });

  const route = result.segments.find(segment => segment.kind === 'route');
  assert.ok(route.points.every(point => point.x === 250));
  assert.equal(result.portals.length, 0);
});

test('uses a continuous outer wrap when the only shared aisle requires a large sideways detour', () => {
  const result = routeConnectionBundles({
    width: 500,
    contentLeft: 20,
    contentRight: 480,
    bundles: [{
      id: 'family-detour',
      branchIndex: 3,
      source: { x: 250, y: 30, exitY: 60 },
      targets: [
        target('one', 170, 150, 'row-1'),
        target('two', 330, 290, 'row-2')
      ]
    }],
    obstacles: [{ id: 'middle-row', x: 100, y: 150, width: 300, height: 82 }]
  });

  assert.equal(result.portals.length, 0);
  const trunk = result.segments.find(segment => segment.kind === 'trunk');
  const wrap = result.segments.find(segment => segment.kind === 'wrap');
  assert.equal(trunk.points.at(-1).x, 250);
  assert.ok(Math.max(...trunk.points.map(point => point.y)) < 200);
  assert.ok(wrap);
  assert.ok(wrap.points.every(point => point.x < 20));
});

test('routing is deterministic', () => {
  const input = {
    width: 400,
    contentLeft: 24,
    contentRight: 376,
    bundles: [{
      id: 'family-c',
      branchIndex: 4,
      source: { x: 200, y: 20, exitY: 50 },
      targets: [target('one', 100, 150, 'r1'), target('two', 300, 280, 'r2')]
    }],
    obstacles: [{ id: 'center', x: 150, y: 170, width: 100, height: 80 }]
  };

  assert.deepEqual(routeConnectionBundles(input), routeConnectionBundles(input));
});
