const uniqueNumbers = values => [...new Set(values.map(value => Math.round(value * 100) / 100))];

const verticalIsClear = (x, y1, y2, obstacles, clearance) => {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return !obstacles.some(obstacle => {
    // Keep horizontal breathing room, but do not inflate obstacles vertically.
    // Rails deliberately terminate on a destination shell's top edge; padding
    // that edge makes the destination falsely block its own incoming trunk.
    const obstacleTop = obstacle.y;
    const obstacleBottom = obstacle.y + obstacle.height;
    if (obstacleBottom <= top || obstacleTop >= bottom) return false;
    return x > obstacle.x - clearance && x < obstacle.x + obstacle.width + clearance;
  });
};

function channelCandidates({
  sourceX,
  targetXs = [],
  y1,
  y2,
  obstacles,
  contentLeft,
  contentRight,
  clearance
}) {
  const active = obstacles.filter(obstacle => {
    const top = obstacle.y;
    const bottom = obstacle.y + obstacle.height;
    return bottom > Math.min(y1, y2) && top < Math.max(y1, y2);
  });
  const candidates = uniqueNumbers([
    sourceX,
    (contentLeft + contentRight) / 2,
    ...targetXs,
    ...active.flatMap(obstacle => [obstacle.x - clearance, obstacle.x + obstacle.width + clearance]),
    contentLeft,
    contentRight
  ]).filter(x => x >= contentLeft && x <= contentRight);
  const targetLeft = Math.min(...targetXs);
  const targetRight = Math.max(...targetXs);
  const targetCenter = targetXs.length ? (targetLeft + targetRight) / 2 : sourceX;
  const targetPull = x => {
    if (!targetXs.length) return 0;
    const distanceToSpan = x < targetLeft
      ? targetLeft - x
      : x > targetRight ? x - targetRight : 0;
    return distanceToSpan * .35 + Math.abs(x - targetCenter) * .03;
  };

  return candidates
    .filter(x => verticalIsClear(x, y1, y2, active, clearance))
    .sort((a, b) => {
      const edgePenaltyA = a <= contentLeft || a >= contentRight ? 90 : 0;
      const edgePenaltyB = b <= contentLeft || b >= contentRight ? 90 : 0;
      return Math.abs(a - sourceX) + targetPull(a) + edgePenaltyA
        - (Math.abs(b - sourceX) + targetPull(b) + edgePenaltyB);
    });
}

const segment = (bundle, kind, suffix, points, metadata = {}) => ({
  id: `${bundle.id}:${suffix}`,
  bundleId: bundle.id,
  branchIndex: bundle.branchIndex,
  relationship: 'child',
  kind,
  points,
  ...metadata
});

const compactPoints = points => points.filter((point, index) => (
  !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y
));

const connectionRoute = (bundle, target, points) => ({
  id: `${bundle.id}:route:${target.id}`,
  bundleId: bundle.id,
  branchIndex: bundle.branchIndex,
  relationship: 'child',
  targetId: target.id,
  points: compactPoints(points)
});

function groupTargets(targets) {
  const rows = new Map();
  targets.forEach(target => {
    const key = `${target.rowId}:${target.railY}`;
    if (!rows.has(key)) rows.set(key, { id: target.rowId, railY: target.railY, targets: [] });
    rows.get(key).targets.push(target);
  });
  return [...rows.values()].sort((a, b) => a.railY - b.railY || String(a.id).localeCompare(String(b.id)));
}

export function routeConnectionBundles({
  width,
  contentLeft = 16,
  contentRight = width - 16,
  bundles = [],
  obstacles = [],
  clearance = 5
}) {
  const segments = [];
  const junctions = [];
  const portals = [];
  const routes = [];

  bundles.forEach(bundle => {
    const rows = groupTargets(bundle.targets);
    if (!rows.length) return;
    const firstRailY = rows[0].railY;
    const lastRailY = rows.at(-1).railY;
    const continuousCandidates = channelCandidates({
      sourceX: bundle.source.x,
      targetXs: bundle.targets.map(target => target.x),
      y1: bundle.source.exitY,
      y2: lastRailY,
      obstacles,
      contentLeft,
      contentRight,
      clearance
    });
    const interiorCandidates = continuousCandidates.filter(x => x > contentLeft && x < contentRight);
    const continuousRouteX = interiorCandidates[0];
    const maxSharedAisleDetour = Math.max(64, Math.min(112, width * 0.14));
    const wrapMode = rows.length > 1 && (
      continuousRouteX === undefined
      || Math.abs(continuousRouteX - bundle.source.x) > maxSharedAisleDetour
    );

    if (wrapMode) {
      const firstCandidates = channelCandidates({
        sourceX: bundle.source.x,
        targetXs: rows[0].targets.map(target => target.x),
        y1: bundle.source.exitY,
        y2: firstRailY,
        obstacles,
        contentLeft,
        contentRight,
        clearance
      });
      const firstRouteX = firstCandidates.find(x => x > contentLeft && x < contentRight)
        ?? firstCandidates[0]
        ?? contentRight;
      const trunkPoints = [
        { x: bundle.source.x, y: bundle.source.y },
        { x: bundle.source.x, y: bundle.source.exitY },
        { x: firstRouteX, y: bundle.source.exitY },
        { x: firstRouteX, y: firstRailY }
      ];
      segments.push(segment(bundle, 'trunk', 'trunk', trunkPoints));
      const wrapX = bundle.branchIndex % 2
        ? Math.max(4, contentLeft - clearance * 2)
        : Math.min(width - 4, contentRight + clearance * 2);
      segments.push(segment(bundle, 'wrap', 'wrap', [
        { x: wrapX, y: firstRailY },
        { x: wrapX, y: lastRailY }
      ]));

      rows.forEach((row, rowIndex) => {
        const targetXs = row.targets.map(target => target.x);
        const rowSourceX = rowIndex ? wrapX : firstRouteX;
        segments.push(segment(bundle, 'rail', `rail-${rowIndex}`, [
          { x: Math.min(rowSourceX, wrapX, ...targetXs), y: row.railY },
          { x: Math.max(rowSourceX, wrapX, ...targetXs), y: row.railY }
        ]));
        row.targets.forEach((target, targetIndex) => {
          segments.push(segment(bundle, 'drop', `drop-${rowIndex}-${targetIndex}`, [
            { x: target.x, y: row.railY },
            { x: target.x, y: target.y }
          ], { targetId: target.id }));
          routes.push(connectionRoute(bundle, target, [
            ...trunkPoints,
            ...(rowIndex ? [
              { x: wrapX, y: firstRailY },
              { x: wrapX, y: row.railY }
            ] : []),
            { x: target.x, y: row.railY },
            { x: target.x, y: target.y }
          ]));
        });
        const continuesToAnotherRow = rowIndex < rows.length - 1;
        if (row.targets.length + Number(continuesToAnotherRow) > 1) {
          junctions.push({
            id: `${bundle.id}:wrap-junction-${rowIndex}`,
            bundleId: bundle.id,
            branchIndex: bundle.branchIndex,
            x: wrapX,
            y: row.railY,
          });
        }
      });
      return;
    }

    const routeX = interiorCandidates[0] ?? continuousCandidates[0] ?? contentRight;
    const trunkPoints = [
      { x: bundle.source.x, y: bundle.source.y },
      { x: bundle.source.x, y: bundle.source.exitY },
      { x: routeX, y: bundle.source.exitY },
      { x: routeX, y: lastRailY }
    ];
    if (bundle.targets.length === 1) {
      const target = bundle.targets[0];
      const routePoints = compactPoints([
        ...trunkPoints,
        { x: target.x, y: target.railY },
        { x: target.x, y: target.y }
      ]);
      segments.push(segment(bundle, 'route', 'route', routePoints, {
        targetId: target.id
      }));
      routes.push(connectionRoute(bundle, target, routePoints));
      return;
    }
    segments.push(segment(bundle, 'trunk', 'trunk', trunkPoints));
    rows.forEach((row, rowIndex) => {
      const targetXs = row.targets.map(target => target.x);
      segments.push(segment(bundle, 'rail', `rail-${rowIndex}`, [
        { x: Math.min(routeX, ...targetXs), y: row.railY },
        { x: Math.max(routeX, ...targetXs), y: row.railY }
      ]));
      row.targets.forEach((target, targetIndex) => {
        segments.push(segment(bundle, 'drop', `drop-${rowIndex}-${targetIndex}`, [
          { x: target.x, y: row.railY },
          { x: target.x, y: target.y }
        ], { targetId: target.id }));
        routes.push(connectionRoute(bundle, target, [
          { x: bundle.source.x, y: bundle.source.y },
          { x: bundle.source.x, y: bundle.source.exitY },
          { x: routeX, y: bundle.source.exitY },
          { x: routeX, y: row.railY },
          { x: target.x, y: row.railY },
          { x: target.x, y: target.y }
        ]));
      });
      const continuesToAnotherRow = rowIndex < rows.length - 1;
      if (row.targets.length + Number(continuesToAnotherRow) > 1) {
        junctions.push({
          id: `${bundle.id}:junction-${rowIndex}`,
          bundleId: bundle.id,
          branchIndex: bundle.branchIndex,
          x: routeX,
          y: row.railY
        });
      }
    });
  });

  return { segments, junctions, portals, routes };
}
