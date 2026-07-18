export function buildUnionPresentation(unionEdges) {
  const edgesByUnit = new Map();
  unionEdges.forEach(edge => {
    if (!edgesByUnit.has(edge.unitId)) edgesByUnit.set(edge.unitId, []);
    edgesByUnit.get(edge.unitId).push(edge);
  });

  const directEdges = [];
  const hubs = [];
  edgesByUnit.forEach((edges, unitId) => {
    if (edges.length === 1) {
      directEdges.push(edges[0]);
      return;
    }

    const trackX = edges[0].points[1].x;
    const portYs = edges.map(edge => edge.port.y);
    const spineYs = [edges[0].points[1].y, ...portYs];
    hubs.push({
      unitId,
      anchorSegment: [edges[0].points[0], edges[0].points[1]],
      spineSegment: [
        { x: trackX, y: Math.min(...spineYs) },
        { x: trackX, y: Math.max(...spineYs) }
      ],
      branches: edges.map(edge => ({
        edge,
        familyId: edge.familyId,
        port: edge.port,
        points: [edge.port, edge.points.at(-1)],
        routePoints: edge.points
      }))
    });
  });

  return { directEdges, hubs };
}
