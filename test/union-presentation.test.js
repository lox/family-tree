import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUnionPresentation } from '../src/union-presentation.js';

const edge = (familyId, unitId, anchorY, partnerY) => ({
  id: `union:${familyId}`,
  familyId,
  unitId,
  relationship: 'partner',
  points: [
    { x: 100, y: anchorY },
    { x: 109, y: anchorY },
    { x: 109, y: partnerY },
    { x: 118, y: partnerY }
  ],
  port: { x: 109, y: partnerY }
});

test('keeps single-partner unions as direct edges', () => {
  const single = edge('F1', 'U1', 80, 80);
  const presentation = buildUnionPresentation([single]);

  assert.deepEqual(presentation.directEdges, [single]);
  assert.deepEqual(presentation.hubs, []);
});

test('builds one shared hub with distinct branches for multiple partners', () => {
  const first = edge('F1', 'U1', 126, 80);
  const second = edge('F2', 'U1', 126, 172);
  const presentation = buildUnionPresentation([first, second]);
  const hub = presentation.hubs[0];

  assert.deepEqual(presentation.directEdges, []);
  assert.equal(hub.unitId, 'U1');
  assert.deepEqual(hub.anchorSegment, [first.points[0], first.points[1]]);
  assert.deepEqual(hub.spineSegment, [{ x: 109, y: 80 }, { x: 109, y: 172 }]);
  assert.deepEqual(hub.branches.map(branch => branch.points), [
    [{ x: 109, y: 80 }, { x: 118, y: 80 }],
    [{ x: 109, y: 172 }, { x: 118, y: 172 }]
  ]);
  assert.deepEqual(hub.branches.map(branch => branch.routePoints), [first.points, second.points]);
});
