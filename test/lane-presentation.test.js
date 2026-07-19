import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generationLaneBounds,
  generationLaneLabel
} from '../src/lane-presentation.js';

test('fills the canvas with continuous generation lanes', () => {
  const lanes = generationLaneBounds([
    { generation: 0, y: 28, height: 118 },
    { generation: 1, y: 182, height: 118 },
    { generation: 1, y: 316, height: 118 },
    { generation: 2, y: 470, height: 118 }
  ], 640);

  assert.deepEqual(lanes, [
    { generation: 0, start: 0, end: 164 },
    { generation: 1, start: 164, end: 452 },
    { generation: 2, start: 452, end: 640 }
  ]);
  assert.ok(lanes.every((lane, index) => index === 0 || lane.start === lanes[index - 1].end));
});

test('positions generation labels on a foreground backing inside their lane', () => {
  assert.deepEqual(generationLaneLabel({ generation: 3, start: 452 }), {
    generation: 3,
    label: 'Generation 4',
    x: 7,
    y: 459,
    width: 105,
    height: 23,
    textX: 12,
    textY: 472
  });
});
