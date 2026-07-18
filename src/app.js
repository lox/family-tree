import { parseGedcom } from './gedcom-parser.js';
import { buildFamilyLayout } from './layout-engine.js';
import { cardNameBaselines, formatCardName } from './name-format.js';
import {
  ancestralEndpointIds,
  computeRelationshipPath,
  selectionAfterTreeClick,
  toggleConnectionSelection
} from './presentation-state.js';
import { sampleGraph } from './sample-data.js';
import { buildUnionPresentation } from './union-presentation.js';
import { relationshipPeriod } from './relationship-period.js';
import { createInspectorState, updateInspectorState } from './inspector-state.js';
import { generationLaneBounds } from './lane-presentation.js';
import { renderDetailsPane } from './details-pane.js';
import {
  PRESENTATION_SETTINGS_KEY,
  createPresentationSettings,
  parsePresentationSettings,
  serializePresentationSettings,
  updatePresentationSettings
} from './presentation-settings.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = document.querySelector('#family-tree');
const stage = document.querySelector('.tree-stage');
const fileInput = document.querySelector('#ged-file');
const summary = document.querySelector('#tree-summary');
const inspector = document.querySelector('#person-inspector');
const workspace = document.querySelector('#tree-workspace');
const paneResizer = document.querySelector('#pane-resizer');
const errorMessage = document.querySelector('#error-message');
const settingsTrigger = document.querySelector('#settings-trigger');
const settingsPopover = document.querySelector('#settings-popover');
const sexColorsInput = document.querySelector('#setting-sex-colors');
const sexColourKey = document.querySelector('#sex-colour-key');

function loadPresentationSettings() {
  try {
    const saved = window.localStorage.getItem(PRESENTATION_SETTINGS_KEY);
    return saved ? parsePresentationSettings(saved) : createPresentationSettings();
  } catch (error) {
    console.warn('Using default presentation settings because saved settings could not be read.', error);
    return createPresentationSettings();
  }
}

let graph = sampleGraph;
let selectedPersonId = 'I4';
let emphasizedConnectionKeys = new Set();
let inspectorState = createInspectorState({ dock: window.innerWidth < 760 ? 'bottom' : 'right' });
let presentationSettings = loadPresentationSettings();
let lastWidth = 0;
let scheduled = false;
let activeResizePointerId = null;
let suppressTreeClickUntil = 0;

const svgElement = (tag, attributes = {}, text = '') => {
  const element = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  if (text) element.textContent = text;
  return element;
};

const year = value => (value?.match(/\b(\d{4})\b/) ?? [,''])[1];
const initials = name => {
  const parts = name.replace(/\b(Jr\.|III|II|IV)\b/g, '').split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? '?'}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
};
const clip = (value, length) => value.length > length ? `${value.slice(0, length - 1)}…` : value;
const sexClassFor = person => {
  if (!presentationSettings.colorBySex) return '';
  const sex = String(person.sex ?? '').trim().toUpperCase();
  if (sex === 'M') return ' is-sex-male';
  if (sex === 'F') return ' is-sex-female';
  return '';
};

function setSettingsOpen(open) {
  settingsPopover.hidden = !open;
  settingsTrigger.setAttribute('aria-expanded', String(open));
}

function renderSettings() {
  sexColorsInput.checked = presentationSettings.colorBySex;
  sexColourKey.hidden = !presentationSettings.colorBySex;
}

function savePresentationSettings() {
  try {
    window.localStorage.setItem(
      PRESENTATION_SETTINGS_KEY,
      serializePresentationSettings(presentationSettings)
    );
  } catch (error) {
    console.warn('Presentation settings changed but could not be saved in this browser.', error);
  }
}

function roundedPath(points, radius = 8) {
  if (points.length < 2) return '';
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    if (!incoming || !outgoing) continue;
    const turnRadius = Math.min(radius, incoming / 2, outgoing / 2);
    const before = {
      x: current.x - (current.x - previous.x) / incoming * turnRadius,
      y: current.y - (current.y - previous.y) / incoming * turnRadius
    };
    const after = {
      x: current.x + (next.x - current.x) / outgoing * turnRadius,
      y: current.y + (next.y - current.y) / outgoing * turnRadius
    };
    parts.push(`L ${before.x} ${before.y}`, `Q ${current.x} ${current.y} ${after.x} ${after.y}`);
  }
  const last = points.at(-1);
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

const emphasisClass = connectionKey => emphasizedConnectionKeys.has(connectionKey)
  ? ' is-emphasized'
  : '';

function appendInteractivePath(attributes, connectionKey) {
  const group = svgElement('g', {
    class: 'connection-group',
    'data-connection-key': connectionKey
  });
  group.append(
    svgElement('path', {
      ...attributes,
      'data-connection-key': connectionKey
    }),
    svgElement('path', {
      d: attributes.d,
      class: 'connection-hit-target',
      'data-connection-key': connectionKey,
      'aria-hidden': 'true'
    })
  );
  svg.append(group);
}

function inspectorLimits(dock = inspectorState.dock) {
  const bounds = workspace.getBoundingClientRect();
  if (dock === 'bottom') {
    return { min: 170, max: Math.max(170, Math.min(460, bounds.height - 180)) };
  }
  return { min: 280, max: Math.max(280, Math.min(560, bounds.width - 300)) };
}

function applyInspectorLayout(hasSelection = Boolean(selectedPersonId)) {
  workspace.dataset.dock = inspectorState.dock;
  workspace.classList.toggle('has-inspector', hasSelection);
  workspace.style.setProperty('--inspector-right-size', `${inspectorState.rightSize}px`);
  workspace.style.setProperty('--inspector-bottom-size', `${inspectorState.bottomSize}px`);
  inspector.hidden = !hasSelection;
  paneResizer.hidden = !hasSelection;
  paneResizer.setAttribute('aria-orientation', inspectorState.dock === 'right' ? 'vertical' : 'horizontal');
  paneResizer.setAttribute('aria-label', `Resize ${inspectorState.dock === 'right' ? 'right' : 'bottom'} details pane`);
  const currentSize = inspectorState.dock === 'right' ? inspectorState.rightSize : inspectorState.bottomSize;
  const limits = inspectorLimits();
  paneResizer.setAttribute('aria-valuemin', String(limits.min));
  paneResizer.setAttribute('aria-valuemax', String(limits.max));
  paneResizer.setAttribute('aria-valuenow', String(currentSize));
}

function renderInspector(personId) {
  const person = graph.people[personId];
  applyInspectorLayout(Boolean(person));
  renderDetailsPane({
    element: inspector,
    graph,
    personId,
    dock: inspectorState.dock,
    onDock: () => {
      inspectorState = updateInspectorState(inspectorState, { type: 'toggle-dock' });
      const sizeKey = inspectorState.dock === 'right' ? 'rightSize' : 'bottomSize';
      inspectorState = updateInspectorState(inspectorState, {
        type: 'resize', dock: inspectorState.dock, size: inspectorState[sizeKey], ...inspectorLimits()
      });
      applyInspectorLayout(true);
      renderInspector(selectedPersonId);
    },
    onClose: () => {
      selectedPersonId = '';
      renderTree();
    }
  });
}

function renderTree() {
  scheduled = false;
  errorMessage.hidden = true;
  const width = Math.max(240, Math.floor(stage.getBoundingClientRect().width));
  let result;
  try {
    result = buildFamilyLayout(graph, { width });
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
    return;
  }

  const { projection, layout } = result;
  const visiblePeople = new Set(layout.nodes.map(node => node.personId));
  if (selectedPersonId && !visiblePeople.has(selectedPersonId)) {
    selectedPersonId = projection.units[0]?.anchorId;
  }
  const relationshipPath = computeRelationshipPath(projection, selectedPersonId);
  const endpointPersonIds = ancestralEndpointIds(projection);
  const unionPresentation = buildUnionPresentation(layout.unionEdges);
  const multiUnionUnitIds = new Set(unionPresentation.hubs.map(hub => hub.unitId));
  const renderedFamilyById = new Map(graph.families.map(family => [family.id, family]));
  const pathClass = isLineage => isLineage
    ? ' is-lineage'
    : relationshipPath.active ? ' is-context' : '';

  const title = svg.querySelector('title');
  const description = svg.querySelector('desc');
  svg.replaceChildren(title, description);
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.style.aspectRatio = `${layout.width} / ${layout.height}`;

  const generationGroups = new Map();
  layout.bands.forEach(band => {
    if (!generationGroups.has(band.generation)) generationGroups.set(band.generation, []);
    generationGroups.get(band.generation).push(band);
  });
  generationLaneBounds(layout.bands, layout.height).forEach(({ generation, start, end }) => {
    svg.append(svgElement('rect', {
      x: 0, y: start, width: layout.width, height: end - start,
      class: `lane-background${generation % 2 ? ' is-even' : ''}`
    }));
    svg.append(svgElement('text', { x: 12, y: start + 20, class: 'lane-label' }, `Generation ${generation + 1}`));
    if (generation) svg.append(svgElement('line', { x1: 0, y1: start, x2: layout.width, y2: start, class: 'lane-rule' }));
  });

  layout.connections.segments.forEach(segment => {
    const connectionKey = `child:${segment.bundleId}`;
    const path = segment.points.length > 2
      ? roundedPath(segment.points)
      : `M ${segment.points[0].x} ${segment.points[0].y} L ${segment.points[1].x} ${segment.points[1].y}`;
    appendInteractivePath({
      d: path,
      class: `parentage-line parentage-${segment.kind}${pathClass(false)}${emphasisClass(connectionKey)}`,
      'data-relationship': segment.relationship,
      'data-bundle-id': segment.bundleId
    }, connectionKey);
  });
  layout.connections.junctions.forEach(junction => {
    const connectionKey = `child:${junction.bundleId}`;
    svg.append(svgElement('circle', {
      cx: junction.x, cy: junction.y, r: 2.5,
      class: `parentage-junction${pathClass(false)}${emphasisClass(connectionKey)}`,
      'data-bundle-id': junction.bundleId,
      'data-junction': 'child-split'
    }));
  });
  layout.connections.routes
    .filter(route => relationshipPath.parentageEdgeIds.has(route.targetId))
    .forEach(route => {
      const connectionKey = `child:${route.bundleId}`;
      svg.append(svgElement('path', {
        d: roundedPath(route.points),
        class: `parentage-line parentage-route is-lineage${emphasisClass(connectionKey)}`,
        'data-relationship': route.relationship,
        'data-bundle-id': route.bundleId,
        'data-target-id': route.targetId,
        'data-connection-key': connectionKey
      }));
    });
  layout.units.filter(unit => unit.inPartnerGroup && !multiUnionUnitIds.has(unit.id)).forEach(unit => {
    svg.append(svgElement('rect', {
      x: unit.x - 6, y: unit.y - 6, width: unit.width + 12, height: unit.height + 12, rx: 15,
      class: `family-shell${pathClass(relationshipPath.unitIds.has(unit.id))}`
    }));
  });

  unionPresentation.directEdges.forEach(edge => {
    const unionKey = `union:${edge.familyId}`;
    const relationshipClass = pathClass(relationshipPath.unionFamilyIds.has(edge.familyId));
    appendInteractivePath({
      d: roundedPath(edge.points, 6),
      class: `union-line${relationshipClass}${emphasisClass(unionKey)}`,
      'data-relationship': edge.relationship,
      'data-family-id': edge.familyId
    }, unionKey);
    svg.append(svgElement('circle', {
      cx: edge.port.x,
      cy: edge.port.y,
      r: 3.25,
      class: `union-node${relationshipClass}${emphasisClass(unionKey)}`,
      'data-relationship': edge.relationship,
      'data-family-id': edge.familyId,
      'aria-hidden': 'true'
    }));
    if (edge.offspringPoints.length) {
      const childKey = `child:${edge.familyId}`;
      const isLineage = relationshipPath.parentageFamilyIds.has(edge.familyId);
      appendInteractivePath({
        d: roundedPath(edge.offspringPoints, 3),
        class: `parentage-line offspring-origin${pathClass(isLineage)}${emphasisClass(childKey)}`,
        'data-family-id': edge.familyId
      }, childKey);
    }
  });

  unionPresentation.hubs.forEach(hub => {
    [hub.anchorSegment, hub.spineSegment].forEach((points, index) => {
      svg.append(svgElement('path', {
        d: roundedPath(points, 4),
        class: `union-line union-hub-${index ? 'spine' : 'anchor'}${pathClass(false)}`,
        'data-relationship': 'partner',
        'data-unit-id': hub.unitId
      }));
    });

    hub.branches.forEach((branch, index) => {
      const unionKey = `union:${branch.familyId}`;
      const relationshipClass = pathClass(
        relationshipPath.unionFamilyIds.has(branch.familyId)
      );
      appendInteractivePath({
        d: roundedPath(branch.points, 4),
        class: `union-line union-hub-branch${pathClass(false)}${emphasisClass(unionKey)}`,
        'data-relationship': 'partner',
        'data-family-id': branch.familyId
      }, unionKey);
      svg.append(svgElement('circle', {
        cx: branch.port.x,
        cy: branch.port.y,
        r: 3.25,
        class: `union-node${pathClass(false)}${emphasisClass(unionKey)}`,
        'data-relationship': 'partner',
        'data-family-id': branch.familyId,
        'aria-hidden': 'true'
      }));

      if (relationshipPath.unionFamilyIds.has(branch.familyId)) {
        svg.append(svgElement('path', {
          d: roundedPath(branch.routePoints, 6),
          class: `union-line union-hub-route is-lineage${emphasisClass(unionKey)}`,
          'data-relationship': 'partner',
          'data-family-id': branch.familyId,
          'data-connection-key': unionKey
        }));
        svg.append(svgElement('circle', {
          cx: branch.port.x,
          cy: branch.port.y,
          r: 3.25,
          class: `union-node is-lineage${emphasisClass(unionKey)}`,
          'data-relationship': 'partner',
          'data-family-id': branch.familyId,
          'aria-hidden': 'true'
        }));
      }

      if (branch.edge.offspringPoints.length) {
        const childKey = `child:${branch.familyId}`;
        const isLineage = relationshipPath.parentageFamilyIds.has(branch.familyId);
        appendInteractivePath({
          d: roundedPath(branch.edge.offspringPoints, 3),
          class: `parentage-line offspring-origin${pathClass(isLineage)}${emphasisClass(childKey)}`,
          'data-family-id': branch.familyId
        }, childKey);
      }

      const family = renderedFamilyById.get(branch.familyId);
      const period = relationshipPeriod(family, graph.people);
      const label = period.label || `Partner ${index + 1}`;
      const labelWidth = Math.max(36, label.length * 4.6 + 10);
      const partnerEdgeX = branch.points.at(-1).x;
      const partnerOnRight = partnerEdgeX > branch.port.x;
      const labelX = partnerOnRight
        ? partnerEdgeX + 8
        : partnerEdgeX - labelWidth - 8;
      const labelY = branch.port.y - layout.card.height / 2 - 8;
      const labelGroup = svgElement('g', {
        class: `union-label${relationshipClass}`,
        'data-family-id': branch.familyId
      });
      if (period.title) labelGroup.append(svgElement('title', {}, period.title));
      labelGroup.append(svgElement('rect', {
        x: labelX,
        y: labelY - 6,
        width: labelWidth,
        height: 12,
        rx: 6,
        class: 'union-label-background'
      }));
      labelGroup.append(svgElement('text', {
        x: labelX + labelWidth / 2,
        y: labelY + 3,
        class: 'union-label-text'
      }, label));
      svg.append(labelGroup);
    });
  });

  layout.nodes.forEach(node => {
    const person = graph.people[node.personId];
    if (!person) return;
    const isAncestralEndpoint = endpointPersonIds.has(person.id);
    const link = svgElement('a', {
      href: `#person-${person.id}`,
      class: `person-link${node.inPartnerGroup ? ' is-partner-group' : ''}${isAncestralEndpoint ? ' is-ancestral-endpoint' : ''}${sexClassFor(person)}${person.id === selectedPersonId ? ' is-selected' : ''}${pathClass(relationshipPath.personIds.has(person.id))}`,
      'data-person-id': person.id,
      'aria-label': `${person.name}${isAncestralEndpoint ? '. Ancestral endpoint: no parents recorded' : ''}`
    });
    const group = svgElement('g', { transform: `translate(${node.x} ${node.y})` });
    if (isAncestralEndpoint) {
      group.append(svgElement('title', {}, 'Ancestral endpoint · No parents recorded'));
    }
    group.append(svgElement('rect', { width: node.width, height: node.height, rx: 10, class: 'person-card' }));
    if (isAncestralEndpoint) {
      group.append(svgElement('circle', {
        cx: node.width / 2,
        cy: 0,
        r: 6.25,
        class: 'ancestral-endpoint-badge',
        'aria-hidden': 'true'
      }));
      group.append(svgElement('text', {
        x: node.width / 2,
        y: 3,
        class: 'ancestral-endpoint-symbol',
        'aria-hidden': 'true'
      }, '?'));
    }
    group.append(svgElement('circle', { cx: 22, cy: 23, r: 13, class: 'avatar' }));
    group.append(svgElement('text', { x: 22, y: 27, class: 'avatar-text' }, initials(person.name)));
    const nameLines = formatCardName(person.name);
    const nameYs = cardNameBaselines(nameLines.length);
    const nameNodes = [];
    nameLines.forEach((line, index) => {
      const text = svgElement('text', { x: 42, y: nameYs[index], class: 'person-name' }, line);
      nameNodes.push(text);
      group.append(text);
    });
    const years = [year(person.birth), year(person.death)].filter(Boolean).join('–') || 'Dates unknown';
    group.append(svgElement('text', { x: 11, y: 59, class: 'person-meta' }, years));
    group.append(svgElement('text', { x: 11, y: 73, class: 'person-meta' }, clip(person.birthPlace || person.deathPlace || '', 24)));
    link.append(group);
    svg.append(link);
    const maxNameWidth = node.width - 46;
    nameNodes.forEach(text => {
      if (text.getComputedTextLength() > maxNameWidth) {
        text.setAttribute('textLength', maxNameWidth);
        text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
  });

  summary.textContent = `${visiblePeople.size} visible of ${Object.keys(graph.people).length} people · ${graph.families.length} families · ${generationGroups.size} generations`;
  renderInspector(selectedPersonId);
}

function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(renderTree);
}

svg.addEventListener('click', event => {
  if (performance.now() < suppressTreeClickUntil) return;
  const connection = event.target.closest('[data-connection-key]');
  if (connection) {
    event.preventDefault();
    emphasizedConnectionKeys = toggleConnectionSelection(
      emphasizedConnectionKeys,
      connection.dataset.connectionKey
    );
    renderTree();
    return;
  }
  const link = event.target.closest('.person-link');
  if (link) event.preventDefault();
  const nextSelection = selectionAfterTreeClick(link?.dataset.personId);
  if (nextSelection === selectedPersonId) return;
  selectedPersonId = nextSelection;
  renderTree();
});

settingsTrigger.addEventListener('click', event => {
  event.stopPropagation();
  setSettingsOpen(settingsPopover.hidden);
});

settingsPopover.addEventListener('click', event => event.stopPropagation());

sexColorsInput.addEventListener('change', () => {
  presentationSettings = updatePresentationSettings(presentationSettings, {
    type: 'set-sex-colors',
    enabled: sexColorsInput.checked
  });
  savePresentationSettings();
  renderSettings();
  renderTree();
});

document.addEventListener('click', () => setSettingsOpen(false));

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    graph = parseGedcom(await file.text());
    selectedPersonId = '';
    emphasizedConnectionKeys = new Set();
    renderTree();
  } catch (error) {
    errorMessage.textContent = `Could not open ${file.name}: ${error.message}`;
    errorMessage.hidden = false;
  } finally {
    fileInput.value = '';
  }
});

new ResizeObserver(entries => {
  const nextWidth = Math.round(entries[0].contentRect.width);
  if (nextWidth && Math.abs(nextWidth - lastWidth) > 4) {
    lastWidth = nextWidth;
    scheduleRender();
  }
}).observe(stage);

function resizeInspector(clientX, clientY) {
  const bounds = workspace.getBoundingClientRect();
  const dock = inspectorState.dock;
  const requestedSize = dock === 'right'
    ? bounds.right - clientX
    : bounds.bottom - clientY;
  inspectorState = updateInspectorState(inspectorState, {
    type: 'resize',
    dock,
    size: requestedSize,
    ...inspectorLimits(dock)
  });
  applyInspectorLayout(true);
}

paneResizer.addEventListener('pointerdown', event => {
  if (!selectedPersonId) return;
  event.preventDefault();
  activeResizePointerId = event.pointerId;
  suppressTreeClickUntil = performance.now() + 400;
  paneResizer.setPointerCapture(event.pointerId);
  workspace.classList.add('is-resizing');
});

window.addEventListener('pointermove', event => {
  if (event.pointerId !== activeResizePointerId) return;
  resizeInspector(event.clientX, event.clientY);
});

window.addEventListener('pointerup', event => {
  if (event.pointerId !== activeResizePointerId) return;
  if (paneResizer.hasPointerCapture(event.pointerId)) {
    paneResizer.releasePointerCapture(event.pointerId);
  }
  activeResizePointerId = null;
  suppressTreeClickUntil = performance.now() + 150;
  workspace.classList.remove('is-resizing');
});

window.addEventListener('pointercancel', event => {
  if (event.pointerId !== activeResizePointerId) return;
  activeResizePointerId = null;
  workspace.classList.remove('is-resizing');
});

paneResizer.addEventListener('keydown', event => {
  const horizontalStep = event.key === 'ArrowLeft' ? 12 : event.key === 'ArrowRight' ? -12 : 0;
  const verticalStep = event.key === 'ArrowUp' ? 12 : event.key === 'ArrowDown' ? -12 : 0;
  const adjustment = inspectorState.dock === 'right' ? horizontalStep : verticalStep;
  if (!adjustment) return;
  event.preventDefault();
  const sizeKey = inspectorState.dock === 'right' ? 'rightSize' : 'bottomSize';
  inspectorState = updateInspectorState(inspectorState, {
    type: 'resize',
    dock: inspectorState.dock,
    size: inspectorState[sizeKey] + adjustment,
    ...inspectorLimits()
  });
  applyInspectorLayout(true);
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!settingsPopover.hidden) {
    setSettingsOpen(false);
    settingsTrigger.focus();
    return;
  }
  if (!selectedPersonId) return;
  selectedPersonId = '';
  renderTree();
});

window.addEventListener('resize', () => {
  if (!selectedPersonId) return;
  const sizeKey = inspectorState.dock === 'right' ? 'rightSize' : 'bottomSize';
  inspectorState = updateInspectorState(inspectorState, {
    type: 'resize',
    dock: inspectorState.dock,
    size: inspectorState[sizeKey],
    ...inspectorLimits()
  });
  applyInspectorLayout(true);
});

renderSettings();
renderTree();
