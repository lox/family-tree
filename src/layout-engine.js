import { routeConnectionBundles } from './connection-router.js';

function prepareGraph(graph) {
  if (!graph?.people || !Array.isArray(graph?.families)) {
    throw new TypeError('Family graph must contain people and families');
  }
  const familiesByPartner = new Map();
  const familiesByChild = new Map();
  graph.families.forEach(family => family.partners.forEach(personId => {
    if (!familiesByPartner.has(personId)) familiesByPartner.set(personId, []);
    familiesByPartner.get(personId).push(family);
  }));
  graph.families.forEach(family => family.children.forEach(personId => {
    if (!familiesByChild.has(personId)) familiesByChild.set(personId, []);
    familiesByChild.get(personId).push(family);
  }));
  return { familiesByPartner, familiesByChild };
}

function connectedGenerationInfo(graph, rootFamily, prepared) {
  const { familiesByPartner, familiesByChild } = prepared;
  const levels = new Map();
  const queue = [];
  const assign = (personId, level) => {
    if (!graph.people[personId] || levels.has(personId)) return;
    levels.set(personId, level);
    queue.push(personId);
  };

  if (rootFamily.partners.length) {
    rootFamily.partners.forEach(personId => assign(personId, 0));
    rootFamily.children.forEach(personId => assign(personId, 1));
  } else {
    rootFamily.children.forEach(personId => assign(personId, 0));
  }

  for (let index = 0; index < queue.length; index += 1) {
    const personId = queue[index];
    const level = levels.get(personId);
    (familiesByPartner.get(personId) ?? []).forEach(family => {
      family.partners.forEach(id => assign(id, level));
      family.children.forEach(id => assign(id, level + 1));
    });
    (familiesByChild.get(personId) ?? []).forEach(family => {
      family.partners.forEach(id => assign(id, level - 1));
      family.children.forEach(id => assign(id, level));
    });
  }

  const assignedLevels = [...levels.values()];
  const min = assignedLevels.length ? Math.min(...assignedLevels) : 0;
  const max = assignedLevels.length ? Math.max(...assignedLevels) : 0;
  return { levels, min, max, span: max - min + 1 };
}

function projectConnectedFamilyGraph(graph, rootFamily, prepared, generationInfo) {
  const { familiesByPartner, familiesByChild } = prepared;
  const { levels, min, span } = generationInfo;
  const personOrder = new Map(Object.keys(graph.people).map((personId, index) => [personId, index]));
  const partnerAdjacency = new Map([...levels.keys()].map(personId => [personId, new Set()]));
  const componentFamilies = new Set();

  levels.forEach((_, personId) => {
    (familiesByPartner.get(personId) ?? []).forEach(family => componentFamilies.add(family));
    (familiesByChild.get(personId) ?? []).forEach(family => componentFamilies.add(family));
  });

  componentFamilies.forEach(family => {
    family.partners.forEach(personId => family.partners.forEach(partnerId => {
      if (personId !== partnerId && levels.has(personId) && levels.get(personId) === levels.get(partnerId)) {
        partnerAdjacency.get(personId)?.add(partnerId);
      }
    }));
  });

  const units = [];
  const generations = Array.from({ length: span }, () => []);
  const familyToUnit = {};
  const unitByPerson = new Map();
  const rootPartners = new Set(rootFamily.partners);

  for (let generation = 0; generation < span; generation += 1) {
    const level = generation + min;
    const peopleAtLevel = [...levels.entries()]
      .filter(([, personLevel]) => personLevel === level)
      .map(([personId]) => personId)
      .sort((left, right) => personOrder.get(left) - personOrder.get(right));
    const visited = new Set();

    peopleAtLevel.forEach(personId => {
      if (visited.has(personId)) return;
      const component = [];
      const frontier = [personId];
      visited.add(personId);
      while (frontier.length) {
        const current = frontier.shift();
        component.push(current);
        (partnerAdjacency.get(current) ?? []).forEach(partnerId => {
          if (!visited.has(partnerId)) {
            visited.add(partnerId);
            frontier.push(partnerId);
          }
        });
      }
      component.sort((left, right) => personOrder.get(left) - personOrder.get(right));
      const componentSet = new Set(component);
      const degree = id => (familiesByPartner.get(id) ?? [])
        .filter(family => family.partners.every(partnerId => componentSet.has(partnerId)))
        .length;
      const anchorId = [...component].sort((left, right) => (
        degree(right) - degree(left) || personOrder.get(left) - personOrder.get(right)
      ))[0];
      const unitFamilies = new Set(component.flatMap(id => familiesByPartner.get(id) ?? []));
      const familyIds = [...unitFamilies]
        .filter(family => family.partners.length && family.partners.every(id => componentSet.has(id)))
        .map(family => family.id);
      const isRootUnit = rootPartners.size
        && [...rootPartners].every(id => componentSet.has(id));
      const unit = {
        id: isRootUnit ? `root:${rootFamily.id}` : `person:${anchorId}`,
        generation,
        anchorId,
        partnerIds: component.filter(id => id !== anchorId),
        familyIds,
        personIds: component,
        branchIndex: generations[generation].length
      };
      units.push(unit);
      generations[generation].push(unit.id);
      component.forEach(id => unitByPerson.set(id, unit));
      familyIds.forEach(familyId => { familyToUnit[familyId] = unit.id; });
    });
  }

  const parentage = [];
  componentFamilies.forEach(family => family.children.forEach(childId => {
    const targetUnit = unitByPerson.get(childId);
    if (!familyToUnit[family.id] || !targetUnit) return;
    parentage.push({
      id: `${family.id}:${childId}`,
      sourceFamilyId: family.id,
      targetUnitId: targetUnit.id,
      childId
    });
  }));

  return {
    people: graph.people,
    families: graph.families,
    units,
    generations,
    parentage,
    familyToUnit,
    rootUnitId: `root:${rootFamily.id}`,
    connected: true
  };
}

export function projectFamilyForest(graph) {
  const prepared = prepareGraph(graph);
  const { familiesByPartner, familiesByChild } = prepared;
  const visitedPeople = new Set();
  const projections = [];
  const isolatedUnits = [];

  Object.keys(graph.people).forEach(personId => {
    if (visitedPeople.has(personId)) return;
    const incidentFamilies = [
      ...(familiesByPartner.get(personId) ?? []),
      ...(familiesByChild.get(personId) ?? [])
    ];
    if (!incidentFamilies.length) {
      visitedPeople.add(personId);
      isolatedUnits.push({
        id: `person:${personId}`,
        generation: 0,
        anchorId: personId,
        partnerIds: [],
        familyIds: [],
        personIds: [personId],
        branchIndex: isolatedUnits.length
      });
      return;
    }

    const rootFamily = incidentFamilies[0];
    const generationInfo = connectedGenerationInfo(graph, rootFamily, prepared);
    generationInfo.levels.forEach((_, id) => visitedPeople.add(id));
    projections.push(projectConnectedFamilyGraph(graph, rootFamily, prepared, generationInfo));
  });

  const generationCount = Math.max(
    1,
    ...projections.map(projection => projection.generations.length)
  );
  const generations = Array.from({ length: generationCount }, () => []);
  const units = [];
  const parentage = [];
  const familyToUnit = {};
  const rootUnitIds = [];

  projections.forEach(projection => {
    projection.units.forEach(unit => units.push(unit));
    projection.generations.forEach((unitIds, generation) => {
      generations[generation].push(...unitIds);
    });
    parentage.push(...projection.parentage);
    Object.assign(familyToUnit, projection.familyToUnit);
    rootUnitIds.push(projection.rootUnitId);
  });
  isolatedUnits.forEach(unit => {
    units.push(unit);
    generations[0].push(unit.id);
    rootUnitIds.push(unit.id);
  });

  return {
    people: graph.people,
    families: graph.families,
    units,
    generations,
    parentage,
    familyToUnit,
    rootUnitIds,
    rootUnitId: rootUnitIds[0] ?? '',
    connected: projections.length + isolatedUnits.length <= 1
  };
}

const point = (x, y) => ({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });

export function layoutFamilyGraph(projection, options = {}) {
  const width = Math.max(240, Math.floor(options.width ?? 960));
  const compact = width < (options.compactBreakpoint ?? 420);
  const cardScale = Number.isFinite(options.cardScale) && options.cardScale > 0
    ? options.cardScale
    : 1;
  const scaledMetric = value => Math.round(value * cardScale * 100) / 100;
  const sidePadding = compact ? 12 : 14;
  const routeGutter = 10;
  const cardHeight = scaledMetric(options.cardHeight ?? 82);
  const standardCardWidth = scaledMetric(options.cardWidth ?? 154);
  const cardWidth = compact
    ? Math.min(200, width - (sidePadding + routeGutter) * 2)
    : standardCardWidth;
  const partnerGap = 10;
  const multiPartnerGap = 18;
  const unitGap = 22;
  const baseLabelHeight = 40;
  const connectorShelf = 14;
  const railLaneGap = 6;
  const bandGap = 16;
  const generationGap = 20;
  const contentLeft = sidePadding + routeGutter;
  const contentRight = width - sidePadding - routeGutter;
  const availableWidth = contentRight - contentLeft;
  const unitById = new Map(projection.units.map(unit => [unit.id, unit]));
  const incomingFamiliesByUnit = new Map();
  projection.parentage.forEach(edge => {
    if (!incomingFamiliesByUnit.has(edge.targetUnitId)) {
      incomingFamiliesByUnit.set(edge.targetUnitId, new Set());
    }
    incomingFamiliesByUnit.get(edge.targetUnitId).add(edge.sourceFamilyId);
  });

  const measureUnit = unit => {
    const partnerCount = unit.partnerIds.length;
    const stackedPartnerGap = partnerCount > 1 ? multiPartnerGap : partnerGap;
    if (!partnerCount) return { width: cardWidth, height: cardHeight };
    if (compact) {
      return {
        width: cardWidth,
        height: (partnerCount + 1) * cardHeight + partnerCount * stackedPartnerGap
      };
    }
    return {
      width: cardWidth * 2 + 18,
      height: Math.max(cardHeight, partnerCount * cardHeight + Math.max(0, partnerCount - 1) * stackedPartnerGap)
    };
  };

  const measuredUnits = new Map(projection.units.map(unit => [unit.id, measureUnit(unit)]));
  const gapBetween = (leftUnit, rightUnit) => {
    if (!leftUnit || !rightUnit) return 0;
    return unitGap;
  };
  const nodes = [];
  const unitLayouts = [];
  const bands = [];
  const nodeByUnitPerson = new Map();
  let cursorY = 28;

  projection.generations.forEach((unitIds, generation) => {
    if (!unitIds.length) return;
    const generationUnits = unitIds.map(id => unitById.get(id));
    const packed = [];
    let row = [];
    let used = 0;

    generationUnits.forEach(unit => {
      const measured = measuredUnits.get(unit.id);
      let gap = row.length ? gapBetween(row.at(-1), unit) : 0;
      const required = measured.width + gap;
      if (row.length && used + required > availableWidth) {
        packed.push(row);
        row = [];
        used = 0;
        gap = 0;
      }
      row.push(unit);
      used += measured.width + gap;
    });
    if (row.length) packed.push(row);

    packed.forEach((bandUnits, bandIndex) => {
      const incomingFamilyIds = new Set(bandUnits.flatMap(unit => (
        [...(incomingFamiliesByUnit.get(unit.id) ?? [])]
      )));
      const labelHeight = baseLabelHeight
        + Math.max(0, incomingFamilyIds.size - 1) * railLaneGap;
      const bandHeight = Math.max(...bandUnits.map(unit => measuredUnits.get(unit.id).height));
      const bandWidth = bandUnits.reduce((sum, unit, index) => (
        sum
        + measuredUnits.get(unit.id).width
        + (index ? gapBetween(bandUnits[index - 1], unit) : 0)
      ), 0);
      let cursorX = contentLeft + Math.max(0, (availableWidth - bandWidth) / 2);
      const bandId = `g${generation}:b${bandIndex}`;
      const bandY = cursorY + labelHeight;

      bands.push({
        id: bandId,
        generation,
        index: bandIndex,
        x: contentLeft,
        y: cursorY,
        width: availableWidth,
        height: labelHeight + bandHeight,
        continued: bandIndex > 0
      });

      bandUnits.forEach((unit, unitIndex) => {
        const measured = measuredUnits.get(unit.id);
        const stackedPartnerGap = unit.partnerIds.length > 1 ? multiPartnerGap : partnerGap;
        const unitY = bandY + (bandHeight - measured.height) / 2;
        const unitLayout = {
          id: unit.id,
          generation,
          branchIndex: unit.branchIndex,
          x: cursorX,
          y: unitY,
          width: measured.width,
          height: measured.height,
          bandId,
          inPartnerGroup: unit.personIds.length > 1
        };
        unitLayouts.push(unitLayout);

        const personPositions = [];
        if (compact) {
          unit.personIds.forEach((personId, index) => personPositions.push({
            personId,
            x: cursorX,
            y: unitY + index * (cardHeight + stackedPartnerGap)
          }));
        } else {
          personPositions.push({
            personId: unit.anchorId,
            x: cursorX,
            y: unitY + (measured.height - cardHeight) / 2
          });
          unit.partnerIds.forEach((personId, index) => personPositions.push({
            personId,
            x: cursorX + cardWidth + 18,
            y: unitY + index * (cardHeight + stackedPartnerGap)
          }));
        }

        personPositions.forEach(position => {
          const node = {
            id: `${unit.id}:${position.personId}`,
            unitId: unit.id,
            personId: position.personId,
            generation,
            branchIndex: unit.branchIndex,
            x: position.x,
            y: position.y,
            width: cardWidth,
            height: cardHeight,
            anchor: position.personId === unit.anchorId,
            inPartnerGroup: unit.personIds.length > 1
          };
          nodes.push(node);
          nodeByUnitPerson.set(`${unit.id}:${position.personId}`, node);
        });

        cursorX += measured.width + gapBetween(unit, bandUnits[unitIndex + 1]);
      });

      cursorY += labelHeight + bandHeight + bandGap;
    });

    cursorY += generationGap;
  });

  const unitLayoutById = new Map(unitLayouts.map(unit => [unit.id, unit]));
  const familyById = new Map(projection.families.map(family => [family.id, family]));
  const unionEdges = [];
  const portByFamily = new Map();
  const childBearingFamilyIds = new Set(
    projection.parentage.map(edge => edge.sourceFamilyId)
  );

  projection.units.forEach(unit => {
    const anchor = nodeByUnitPerson.get(`${unit.id}:${unit.anchorId}`);
    if (!anchor) return;
    unit.familyIds.forEach((familyId, familyIndex) => {
      const family = familyById.get(familyId);
      const partnerId = family?.partners.find(id => id !== unit.anchorId);
      const partner = partnerId ? nodeByUnitPerson.get(`${unit.id}:${partnerId}`) : null;
      if (!partner) {
        portByFamily.set(familyId, point(anchor.x + anchor.width/2, anchor.y + anchor.height));
        return;
      }

      let points;
      let port;
      if (compact) {
        const trackX = anchor.x + anchor.width + routeGutter/2;
        port = point(trackX, partner.y + partner.height/2);
        points = [
          point(anchor.x + anchor.width, anchor.y + anchor.height/2),
          point(trackX, anchor.y + anchor.height/2),
          port,
          point(partner.x + partner.width, partner.y + partner.height/2)
        ];
      } else {
        const trackX = anchor.x + anchor.width + 9;
        port = point(trackX, partner.y + partner.height/2);
        points = [
          point(anchor.x + anchor.width, anchor.y + anchor.height/2),
          point(trackX, anchor.y + anchor.height/2),
          port,
          point(partner.x, partner.y + partner.height/2)
        ];
      }
      unionEdges.push({
        id: `union:${familyId}`,
        familyId,
        unitId: unit.id,
        relationship: 'partner',
        points,
        port,
        offspringPort: port,
        offspringPoints: []
      });
      const unionEdge = unionEdges.at(-1);
      if (unit.familyIds.length > 1 && childBearingFamilyIds.has(familyId)) {
        const offspringX = port.x + (familyIndex - (unit.familyIds.length - 1) / 2) * 14;
        unionEdge.offspringPort = point(offspringX, port.y + 7);
        unionEdge.offspringPoints = [
          port,
          point(offspringX, port.y),
          unionEdge.offspringPort
        ];
      }
      portByFamily.set(familyId, unionEdge.offspringPort);
    });
  });

  const bundlesByFamily = new Map();
  projection.parentage.forEach(edge => {
    const sourceUnitId = projection.familyToUnit[edge.sourceFamilyId];
    const sourceUnit = unitLayoutById.get(sourceUnitId);
    const targetUnit = unitLayoutById.get(edge.targetUnitId);
    const targetUnitData = unitById.get(edge.targetUnitId);
    const target = targetUnitData
      ? nodeByUnitPerson.get(`${edge.targetUnitId}:${edge.childId}`)
        ?? nodeByUnitPerson.get(`${edge.targetUnitId}:${targetUnitData.anchorId}`)
      : null;
    const source = portByFamily.get(edge.sourceFamilyId);
    if (!sourceUnit || !targetUnit || !target || !source) return;

    if (!bundlesByFamily.has(edge.sourceFamilyId)) {
      bundlesByFamily.set(edge.sourceFamilyId, {
        id: edge.sourceFamilyId,
        branchIndex: sourceUnit.branchIndex,
        source: {
          x: source.x,
          y: source.y,
          exitY: sourceUnit.y + sourceUnit.height + 12
        },
        targets: []
      });
    }
    bundlesByFamily.get(edge.sourceFamilyId).targets.push({
      id: edge.id,
      x: target.x + target.width/2,
      y: target.y,
      railY: targetUnit.y - connectorShelf,
      rowId: targetUnit.bandId,
      routeLeft: targetUnit.x,
      routeRight: targetUnit.x + targetUnit.width
    });
  });

  const bundles = [...bundlesByFamily.values()];
  const bundlesByTargetRow = new Map();
  bundles.forEach(bundle => {
    new Set(bundle.targets.map(target => target.rowId)).forEach(rowId => {
      if (!bundlesByTargetRow.has(rowId)) bundlesByTargetRow.set(rowId, []);
      bundlesByTargetRow.get(rowId).push(bundle);
    });
  });
  bundlesByTargetRow.forEach((rowBundles, rowId) => {
    rowBundles
      .sort((left, right) => left.source.x - right.source.x || left.id.localeCompare(right.id))
      .forEach((bundle, laneIndex) => {
        bundle.targets
          .filter(target => target.rowId === rowId)
          .forEach(target => {
            target.railY -= laneIndex * railLaneGap;
          });
      });
  });

  const connections = routeConnectionBundles({
    width,
    contentLeft,
    contentRight,
    bundles,
    obstacles: unitLayouts.map(unit => ({
      id: unit.id,
      x: unit.x - 6,
      y: unit.y - 6,
      width: unit.width + 12,
      height: unit.height + 12
    }))
  });

  return {
    width,
    height: Math.max(180, Math.ceil(cursorY + 8)),
    compact,
    card: { width: cardWidth, height: cardHeight, scale: cardScale },
    nodes,
    units: unitLayouts,
    bands,
    unionEdges,
    connections
  };
}

export function buildFamilyLayout(graph, options = {}) {
  const projection = projectFamilyForest(graph);
  const layout = layoutFamilyGraph(projection, options);
  return { projection, layout };
}
