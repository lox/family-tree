import { parseGedcom } from './gedcom-parser.js';
import { buildFamilyLayout } from './layout-engine.js';
import { cardNameBaselines, formatCardName } from './name-format.js';
import {
  ancestralEndpointIds,
  computeConnectionFocus,
  computeRelationshipPath
} from './presentation-state.js';
import sampleGedcom from './sample.ged?raw';
import { buildUnionPresentation } from './union-presentation.js';
import { relationshipPeriod } from './relationship-period.js';
import {
  createInspectorState,
  defaultInspectorDock,
  updateInspectorState
} from './inspector-state.js';
import {
  generationLaneBounds,
  generationLaneLabel
} from './lane-presentation.js';
import { renderSelectionDetailsPane } from './details-pane.js';
import { buildImportReport } from './import-report.js';
import {
  PRESENTATION_SETTINGS_KEY,
  createPresentationSettings,
  parsePresentationSettings,
  serializePresentationSettings,
  updatePresentationSettings
} from './presentation-settings.js';
import {
  createSelectionHistoryState,
  emptySelection,
  selectionAfterShiftClick,
  selectionFromHistoryState,
  validatedSelection
} from './navigation-state.js';
import { createPersonSearchDialog } from './person-search.js';
import {
  applyRelationshipFilter,
  createRelationshipFilter
} from './relationship-filter.js';
import { createRelationshipFilterControl } from './relationship-filter-control.js';
import { personClickIntent } from './person-click-intent.js';
import { updateConnectionHover } from './connection-hover.js';
import { buildRelationshipComparison } from './relationship-comparison.js';
import {
  appendInteractiveConnectionPath,
  roundedPath,
  svgElement
} from './svg-rendering.js';

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
const cardScaleInput = document.querySelector('#setting-card-scale');
const cardScaleOutput = document.querySelector('#setting-card-scale-value');
const importReport = document.querySelector('#import-report');
const importReportSummary = document.querySelector('#import-report-summary');
const importReportCard = document.querySelector('#import-report-card');
const searchTrigger = document.querySelector('#person-search-trigger');
const searchDialog = document.querySelector('#person-search-dialog');
const searchInput = document.querySelector('#person-search-input');
const searchResults = document.querySelector('#person-search-results');
const searchClose = document.querySelector('#person-search-close');
const searchMode = document.querySelector('#person-search-mode');
const searchCompareAnchor = document.querySelector('#person-search-compare-anchor');
const searchSubmitLabel = document.querySelector('#person-search-submit-label');

function loadPresentationSettings() {
  try {
    const saved = window.localStorage.getItem(PRESENTATION_SETTINGS_KEY);
    return saved ? parsePresentationSettings(saved) : createPresentationSettings();
  } catch (error) {
    console.warn('Using default presentation settings because saved settings could not be read.', error);
    return createPresentationSettings();
  }
}

let graph = parseGedcom(sampleGedcom);
let importLabel = 'Kennedy sample';
let selectedPersonId = 'I4';
let selection = { type: 'person', personId: selectedPersonId };
let relationshipFilter = createRelationshipFilter();
let activeTreeId = crypto.randomUUID();
let recentPersonIds = selectedPersonId ? [selectedPersonId] : [];
let inspectorState = createInspectorState({
  dock: defaultInspectorDock(window.innerWidth),
  open: Boolean(selectedPersonId)
});
let presentationSettings = loadPresentationSettings();
let lastWidth = 0;
let scheduled = false;
let activeResizePointerId = null;
let suppressTreeClickUntil = 0;
let pendingPersonClickTimer = null;
let hoveredConnectionKey = '';
let renderedConnectionKeys = new Set();
let focusableConnectionKeys = new Set();

function cancelPendingPersonClick() {
  if (pendingPersonClickTimer === null) return;
  window.clearTimeout(pendingPersonClickTimer);
  pendingPersonClickTimer = null;
}

const relationshipFilterControl = createRelationshipFilterControl({
  root: document,
  workspace,
  privacyNote: document.querySelector('.privacy-note'),
  getPeople: () => graph.people,
  getSelectedPersonId: () => selectedPersonId,
  onChange: (nextFilter, { revealPersonId }) => {
    relationshipFilter = nextFilter;
    renderTree();
    if (revealPersonId) revealPersonCard(revealPersonId, false);
  },
  onOpen: () => setSettingsOpen(false)
});

function updateHistory(nextSelection, mode) {
  if (mode === 'none') return;
  const method = mode === 'replace' ? 'replaceState' : 'pushState';
  window.history[method](createSelectionHistoryState(activeTreeId, nextSelection), '');
}

function revealPersonCard(personId, focus = true) {
  if (!personId) return;
  requestAnimationFrame(() => {
    const link = [...svg.querySelectorAll('.person-link')]
      .find(candidate => candidate.dataset.personId === personId);
    if (!link) return;
    link.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    if (focus) link.focus({ preventScroll: true });
  });
}

function selectEntity(nextSelection, {
  historyMode = 'push',
  reveal = false,
  focus = true,
  closeInspector = false
} = {}) {
  const validated = validatedSelection(nextSelection, graph);
  const nextPersonId = validated.type === 'person'
    ? validated.personId
    : validated.type === 'comparison' ? validated.personIds[0] : '';
  const filteredGraph = applyRelationshipFilter(graph, relationshipFilter);
  const selectedPeople = validated.type === 'comparison'
    ? validated.personIds
    : nextPersonId ? [nextPersonId] : [];
  if (validated.type === 'comparison' && relationshipFilter.preset !== 'full') {
    relationshipFilter = createRelationshipFilter();
  } else if (
    relationshipFilter.preset !== 'full'
    && selectedPeople.some(personId => !filteredGraph.people[personId])
  ) {
    relationshipFilter = createRelationshipFilter();
  }
  const selectionChanged = JSON.stringify(validated) !== JSON.stringify(selection);
  const inspectorWasOpen = inspectorState.open;
  selection = validated;
  selectedPersonId = nextPersonId;
  inspectorState = updateInspectorState(inspectorState, {
    type: closeInspector ? 'close' : validated.type !== 'none' ? 'open' : 'deselect-person'
  });
  if (selectedPeople.length) {
    recentPersonIds = [
      ...[...selectedPeople].reverse(),
      ...recentPersonIds.filter(id => !selectedPeople.includes(id))
    ].slice(0, 8);
  }
  if (selectionChanged) updateHistory(validated, historyMode);
  if (selectionChanged || inspectorWasOpen !== inspectorState.open) renderTree();
  if (reveal) revealPersonCard(nextPersonId, focus);
}

function selectPerson(personId, options = {}) {
  const nextSelection = personId && graph.people[personId]
    ? { type: 'person', personId }
    : emptySelection();
  selectEntity(nextSelection, { reveal: Boolean(personId), ...options });
}

function comparePeople(primaryId, comparisonId, options = {}) {
  if (!graph.people[primaryId] || !graph.people[comparisonId] || primaryId === comparisonId) {
    selectPerson(primaryId, options);
    return;
  }
  selectEntity({ type: 'comparison', personIds: [primaryId, comparisonId] }, options);
}

function shiftSelectPerson(personId) {
  selectEntity(selectionAfterShiftClick(selection, personId));
}

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
  const cardScalePercent = Math.round(presentationSettings.cardScale * 100);
  cardScaleInput.value = String(cardScalePercent);
  cardScaleOutput.value = `${cardScalePercent}%`;
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

function renderImportReport() {
  const report = buildImportReport(importLabel, graph.diagnostics);
  importReport.dataset.hasWarnings = String(Boolean(report.warnings.length));
  importReportSummary.textContent = `${report.label} · ${report.status}`;

  const heading = document.createElement('strong');
  heading.textContent = report.label;
  const status = document.createElement('span');
  status.className = 'import-report-status';
  status.textContent = report.status;
  const metadata = document.createElement('p');
  metadata.textContent = report.metadata;
  importReportCard.replaceChildren(heading, status, metadata);

  if (!report.warnings.length) return;
  const warningList = document.createElement('ul');
  report.warnings.forEach(item => {
    const listItem = document.createElement('li');
    const message = document.createElement('strong');
    message.textContent = item.message;
    listItem.append(message);
    if (item.details.length) {
      const details = document.createElement('span');
      details.textContent = item.details.join(' · ');
      listItem.append(details);
    }
    warningList.append(listItem);
  });
  importReportCard.append(warningList);
}

const emphasisClass = connectionKey => renderedConnectionKeys.has(connectionKey)
  ? ' is-emphasized'
  : '';

function appendInteractivePath(attributes, connectionKey) {
  appendInteractiveConnectionPath({
    svg,
    attributes,
    connectionKey,
    graph,
    selectedConnectionKeys: renderedConnectionKeys,
    claimedConnectionKeys: focusableConnectionKeys
  });
}

function inspectorLimits(dock = inspectorState.dock) {
  const bounds = workspace.getBoundingClientRect();
  if (dock === 'bottom') {
    return { min: 170, max: Math.max(170, Math.min(460, bounds.height - 180)) };
  }
  return { min: 280, max: Math.max(280, Math.min(560, bounds.width - 300)) };
}

function applyInspectorLayout() {
  workspace.dataset.dock = inspectorState.dock;
  workspace.classList.toggle('has-inspector', inspectorState.open);
  workspace.style.setProperty('--inspector-right-size', `${inspectorState.rightSize}px`);
  workspace.style.setProperty('--inspector-bottom-size', `${inspectorState.bottomSize}px`);
  inspector.hidden = !inspectorState.open;
  paneResizer.hidden = !inspectorState.open;
  paneResizer.setAttribute('aria-orientation', inspectorState.dock === 'right' ? 'vertical' : 'horizontal');
  paneResizer.setAttribute('aria-label', `Resize ${inspectorState.dock === 'right' ? 'right' : 'bottom'} details pane`);
  const currentSize = inspectorState.dock === 'right' ? inspectorState.rightSize : inspectorState.bottomSize;
  const limits = inspectorLimits();
  paneResizer.setAttribute('aria-valuemin', String(limits.min));
  paneResizer.setAttribute('aria-valuemax', String(limits.max));
  paneResizer.setAttribute('aria-valuenow', String(currentSize));
}

function renderInspector() {
  applyInspectorLayout();
  renderSelectionDetailsPane({
    element: inspector,
    graph,
    selection,
    dock: inspectorState.dock,
    onSelectPerson: personIdToSelect => {
      selectPerson(personIdToSelect, { reveal: true });
    },
    onDock: () => {
      inspectorState = updateInspectorState(inspectorState, { type: 'toggle-dock' });
      const sizeKey = inspectorState.dock === 'right' ? 'rightSize' : 'bottomSize';
      inspectorState = updateInspectorState(inspectorState, {
        type: 'resize', dock: inspectorState.dock, size: inspectorState[sizeKey], ...inspectorLimits()
      });
      applyInspectorLayout();
      renderInspector();
    },
    onClose: () => {
      selectEntity(emptySelection(), { closeInspector: true });
    }
  });
}

function renderTree() {
  scheduled = false;
  errorMessage.hidden = true;
  const width = Math.max(240, Math.floor(stage.getBoundingClientRect().width));
  const renderedGraph = applyRelationshipFilter(graph, relationshipFilter);
  let result;
  try {
    result = buildFamilyLayout(renderedGraph, {
      width,
      cardScale: presentationSettings.cardScale
    });
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
    return;
  }

  const { projection, layout } = result;
  const visiblePeople = new Set(layout.nodes.map(node => node.personId));
  if (selectedPersonId && !visiblePeople.has(selectedPersonId)) {
    selectedPersonId = projection.units[0]?.anchorId;
    selection = selectedPersonId
      ? { type: 'person', personId: selectedPersonId }
      : emptySelection();
  }
  const comparisonDetails = selection.type === 'comparison'
    ? buildRelationshipComparison(graph, ...selection.personIds)
    : null;
  renderedConnectionKeys = selection.type === 'partnership'
    ? new Set([`union:${selection.familyId}`])
    : selection.type === 'children'
      ? new Set([`child:${selection.familyId}`])
      : new Set(
        [...(comparisonDetails?.connectionKeys ?? [])]
          .filter(connectionKey => connectionKey.startsWith('union:'))
      );
  const relationshipPath = computeRelationshipPath(
    projection,
    selection.type === 'person' ? selectedPersonId : ''
  );
  const connectionFocus = computeConnectionFocus(projection, selection);
  const comparisonPersonIds = new Set(comparisonDetails?.people.map(person => person.id) ?? []);
  const comparisonFamilyIds = new Set(comparisonDetails?.steps.map(step => step.familyId) ?? []);
  const comparisonUnitIds = new Set(
    [...comparisonFamilyIds]
      .map(familyId => projection.familyToUnit[familyId])
      .filter(Boolean)
  );
  const comparisonChildEdgeIds = new Set((comparisonDetails?.steps ?? [])
    .filter(step => step.type === 'parent' || step.type === 'child')
    .map(step => `${step.familyId}:${step.type === 'child' ? step.toId : step.fromId}`));
  const comparisonActive = Boolean(comparisonDetails?.connected);
  const endpointPersonIds = ancestralEndpointIds(projection);
  const unionPresentation = buildUnionPresentation(layout.unionEdges);
  const multiUnionUnitIds = new Set(unionPresentation.hubs.map(hub => hub.unitId));
  const renderedFamilyById = new Map(graph.families.map(family => [family.id, family]));
  const pathClass = isLineage => isLineage
    ? ' is-lineage'
    : relationshipPath.active || connectionFocus.active || comparisonActive ? ' is-context' : '';
  const childPathClass = familyId => selection.type === 'children' && selection.familyId === familyId
    ? pathClass(true)
    : relationshipPath.directChildFamilyIds.has(familyId)
    ? ' is-direct-child'
    : pathClass(false);

  const title = svg.querySelector('title');
  const description = svg.querySelector('desc');
  hoveredConnectionKey = '';
  focusableConnectionKeys = new Set();
  svg.replaceChildren(title, description);
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.style.aspectRatio = `${layout.width} / ${layout.height}`;

  const generationGroups = new Map();
  layout.bands.forEach(band => {
    if (!generationGroups.has(band.generation)) generationGroups.set(band.generation, []);
    generationGroups.get(band.generation).push(band);
  });
  const generationLanes = generationLaneBounds(layout.bands, layout.height);
  generationLanes.forEach(({ generation, start, end }) => {
    svg.append(svgElement('rect', {
      x: 0, y: start, width: layout.width, height: end - start,
      class: `lane-background${generation % 2 ? ' is-even' : ''}`
    }));
    if (generation) svg.append(svgElement('line', { x1: 0, y1: start, x2: layout.width, y2: start, class: 'lane-rule' }));
  });

  layout.connections.segments.forEach(segment => {
    const connectionKey = `child:${segment.bundleId}`;
    const path = segment.points.length > 2
      ? roundedPath(segment.points)
      : `M ${segment.points[0].x} ${segment.points[0].y} L ${segment.points[1].x} ${segment.points[1].y}`;
    appendInteractivePath({
      d: path,
      class: `parentage-line parentage-${segment.kind}${childPathClass(segment.bundleId)}${emphasisClass(connectionKey)}`,
      'data-relationship': segment.relationship,
      'data-bundle-id': segment.bundleId
    }, connectionKey);
  });
  layout.connections.junctions.forEach(junction => {
    const connectionKey = `child:${junction.bundleId}`;
    svg.append(svgElement('circle', {
      cx: junction.x, cy: junction.y, r: 2.5,
      class: `parentage-junction${childPathClass(junction.bundleId)}${emphasisClass(connectionKey)}`,
      'data-connection-key': connectionKey,
      'data-bundle-id': junction.bundleId,
      'data-junction': 'child-split'
    }));
  });
  layout.connections.routes
    .filter(route => (
      relationshipPath.parentageEdgeIds.has(route.targetId)
      || comparisonChildEdgeIds.has(route.targetId)
    ))
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
      class: `family-shell${pathClass(
        relationshipPath.unitIds.has(unit.id) || connectionFocus.unitIds.has(unit.id)
        || comparisonUnitIds.has(unit.id)
      )}`
    }));
  });

  unionPresentation.directEdges.forEach(edge => {
    const unionKey = `union:${edge.familyId}`;
    const relationshipClass = pathClass(
      relationshipPath.unionFamilyIds.has(edge.familyId)
      || renderedConnectionKeys.has(`union:${edge.familyId}`)
    );
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
      'data-connection-key': unionKey,
      'data-relationship': edge.relationship,
      'data-family-id': edge.familyId,
      'aria-hidden': 'true'
    }));
    if (edge.offspringPoints.length) {
      const childKey = `child:${edge.familyId}`;
      const isLineage = relationshipPath.parentageFamilyIds.has(edge.familyId);
      const relationshipClass = isLineage
        ? pathClass(true)
        : childPathClass(edge.familyId);
      appendInteractivePath({
        d: roundedPath(edge.offspringPoints, 3),
        class: `parentage-line offspring-origin${relationshipClass}${emphasisClass(childKey)}`,
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
        || renderedConnectionKeys.has(`union:${branch.familyId}`)
      );
      appendInteractivePath({
        d: roundedPath(branch.points, 4),
        class: `union-line union-hub-branch${relationshipClass}${emphasisClass(unionKey)}`,
        'data-relationship': 'partner',
        'data-family-id': branch.familyId
      }, unionKey);
      svg.append(svgElement('circle', {
        cx: branch.port.x,
        cy: branch.port.y,
        r: 3.25,
        class: `union-node${relationshipClass}${emphasisClass(unionKey)}`,
        'data-connection-key': unionKey,
        'data-relationship': 'partner',
        'data-family-id': branch.familyId,
        'aria-hidden': 'true'
      }));

      if (
        relationshipPath.unionFamilyIds.has(branch.familyId)
        || renderedConnectionKeys.has(unionKey)
      ) {
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
          'data-connection-key': unionKey,
          'data-relationship': 'partner',
          'data-family-id': branch.familyId,
          'aria-hidden': 'true'
        }));
      }

      if (branch.edge.offspringPoints.length) {
        const childKey = `child:${branch.familyId}`;
        const isLineage = relationshipPath.parentageFamilyIds.has(branch.familyId);
        const childRelationshipClass = isLineage
          ? pathClass(true)
          : childPathClass(branch.familyId);
        appendInteractivePath({
          d: roundedPath(branch.edge.offspringPoints, 3),
          class: `parentage-line offspring-origin${childRelationshipClass}${emphasisClass(childKey)}`,
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
        'data-family-id': branch.familyId,
        'data-connection-key': unionKey
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

  generationLanes.map(generationLaneLabel).forEach(label => {
    const parityClass = label.generation % 2 ? ' is-even' : '';
    svg.append(svgElement('rect', {
      x: label.x,
      y: label.y,
      width: label.width,
      height: label.height,
      rx: 7,
      class: `lane-label-backing${parityClass}`
    }));
    svg.append(svgElement('text', {
      x: label.textX,
      y: label.textY,
      class: 'lane-label'
    }, label.label));
  });

  layout.nodes.forEach(node => {
    const person = graph.people[node.personId];
    if (!person) return;
    const isAncestralEndpoint = endpointPersonIds.has(person.id);
    const link = svgElement('a', {
      href: `#person-${person.id}`,
      class: `person-link${node.inPartnerGroup ? ' is-partner-group' : ''}${isAncestralEndpoint ? ' is-ancestral-endpoint' : ''}${sexClassFor(person)}${selection.type === 'person' && person.id === selectedPersonId ? ' is-selected' : ''}${selection.type === 'comparison' && person.id === selection.personIds[0] ? ' is-comparison-primary' : ''}${selection.type === 'comparison' && person.id === selection.personIds[1] ? ' is-comparison-secondary' : ''}${pathClass(
        relationshipPath.personIds.has(person.id)
        || connectionFocus.personIds.has(person.id)
        || comparisonPersonIds.has(person.id)
      )}`,
      'data-person-id': person.id,
      'aria-label': `${person.name}${isAncestralEndpoint ? '. Ancestral endpoint: no parents recorded' : ''}`
    });
    const group = svgElement('g', { transform: `translate(${node.x} ${node.y})` });
    const cardScale = layout.card.scale ?? 1;
    const baseCardWidth = node.width / cardScale;
    const baseCardHeight = node.height / cardScale;
    const cardContent = svgElement('g', { transform: `scale(${cardScale})` });
    if (isAncestralEndpoint) {
      group.append(svgElement('title', {}, 'Ancestral endpoint · No parents recorded'));
    }
    cardContent.append(svgElement('rect', {
      width: baseCardWidth,
      height: baseCardHeight,
      rx: 10,
      class: 'person-card'
    }));
    if (isAncestralEndpoint) {
      cardContent.append(svgElement('circle', {
        cx: baseCardWidth / 2,
        cy: 0,
        r: 6.25,
        class: 'ancestral-endpoint-badge',
        'aria-hidden': 'true'
      }));
      cardContent.append(svgElement('text', {
        x: baseCardWidth / 2,
        y: 3,
        class: 'ancestral-endpoint-symbol',
        'aria-hidden': 'true'
      }, '?'));
    }
    cardContent.append(svgElement('circle', { cx: 22, cy: 23, r: 13, class: 'avatar' }));
    cardContent.append(svgElement('text', { x: 22, y: 27, class: 'avatar-text' }, initials(person.name)));
    const nameLines = formatCardName(person.name);
    const nameYs = cardNameBaselines(nameLines.length);
    const nameNodes = [];
    nameLines.forEach((line, index) => {
      const text = svgElement('text', { x: 42, y: nameYs[index], class: 'person-name' }, line);
      nameNodes.push(text);
      cardContent.append(text);
    });
    const years = [year(person.birth), year(person.death)].filter(Boolean).join('–') || 'Dates unknown';
    cardContent.append(svgElement('text', { x: 11, y: 59, class: 'person-meta' }, years));
    cardContent.append(svgElement('text', { x: 11, y: 73, class: 'person-meta' }, clip(person.birthPlace || person.deathPlace || '', 24)));
    group.append(cardContent);
    link.append(group);
    svg.append(link);
    const maxNameWidth = baseCardWidth - 46;
    nameNodes.forEach(text => {
      if (text.getComputedTextLength() > maxNameWidth) {
        text.setAttribute('textLength', maxNameWidth);
        text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
  });

  const familyCount = renderedGraph.families.length;
  summary.textContent = `${visiblePeople.size} visible of ${Object.keys(graph.people).length} people · ${familyCount} ${familyCount === 1 ? 'family' : 'families'} · ${generationGroups.size} generations`;
  relationshipFilterControl.render(relationshipFilter);
  renderInspector();
}

function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(renderTree);
}

const personSearch = createPersonSearchDialog({
  dialog: searchDialog,
  trigger: searchTrigger,
  input: searchInput,
  resultsElement: searchResults,
  closeButton: searchClose,
  modeElement: searchMode,
  compareAnchorLabel: searchCompareAnchor,
  actionLabel: searchSubmitLabel,
  getPeople: () => graph.people,
  getRecentIds: () => recentPersonIds,
  getCompareAnchor: () => selection.type === 'person' ? graph.people[selection.personId] : null,
  onOpen: () => {
    setSettingsOpen(false);
    relationshipFilterControl.close();
  },
  onSelect: (personId, { mode, anchorId }) => {
    if (mode === 'compare') {
      comparePeople(anchorId, personId);
      revealPersonCard(personId);
      return;
    }
    selectPerson(personId, { reveal: true });
  }
});

function selectConnection(connectionKey) {
  const [kind, familyId] = connectionKey.split(':');
  selectEntity({
    type: kind === 'union' ? 'partnership' : 'children',
    familyId
  });
}

function connectionKeyFor(target) {
  return target instanceof Element
    ? target.closest('[data-connection-key]')?.dataset.connectionKey ?? ''
    : '';
}

function applyConnectionHover(nextKey) {
  if (nextKey === hoveredConnectionKey) return;
  hoveredConnectionKey = nextKey;
  svg.querySelectorAll('[data-connection-key]').forEach(element => {
    element.classList.toggle(
      'is-connection-hovered',
      Boolean(nextKey) && element.dataset.connectionKey === nextKey
    );
  });
}

svg.addEventListener('pointerover', event => {
  const key = connectionKeyFor(event.target);
  if (!key) return;
  applyConnectionHover(updateConnectionHover(hoveredConnectionKey, { type: 'enter', key }));
});

svg.addEventListener('pointerout', event => {
  const key = connectionKeyFor(event.target);
  if (!key) return;
  const nextKey = connectionKeyFor(event.relatedTarget);
  applyConnectionHover(updateConnectionHover(hoveredConnectionKey, {
    type: 'leave', key, nextKey
  }));
});

svg.addEventListener('click', event => {
  if (performance.now() < suppressTreeClickUntil) return;
  const connection = event.target.closest('[data-connection-key]');
  if (connection) {
    cancelPendingPersonClick();
    event.preventDefault();
    selectConnection(connection.dataset.connectionKey);
    return;
  }
  const link = event.target.closest('.person-link');
  if (!link) {
    cancelPendingPersonClick();
    selectPerson('', { focus: false });
    return;
  }

  event.preventDefault();
  const personId = link.dataset.personId;
  if (event.shiftKey) {
    cancelPendingPersonClick();
    shiftSelectPerson(personId);
    return;
  }
  const intent = personClickIntent(event.detail, { inspectorOpen: inspectorState.open });
  cancelPendingPersonClick();
  if (intent === 'open-family-branch') {
    selectPerson(personId, { reveal: false, focus: false });
    relationshipFilterControl.applyPreset('family', personId);
    return;
  }
  if (intent === 'select') {
    selectPerson(personId, { focus: false });
    return;
  }
  pendingPersonClickTimer = window.setTimeout(() => {
    pendingPersonClickTimer = null;
    selectPerson(personId, { focus: false });
  }, 240);
});

svg.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const connection = event.target.closest('[data-connection-key]');
  if (!connection) return;
  event.preventDefault();
  selectConnection(connection.dataset.connectionKey);
});

settingsTrigger.addEventListener('click', event => {
  event.stopPropagation();
  relationshipFilterControl.close();
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

cardScaleInput.addEventListener('input', () => {
  presentationSettings = updatePresentationSettings(presentationSettings, {
    type: 'set-card-scale',
    scale: Number(cardScaleInput.value) / 100
  });
  savePresentationSettings();
  renderSettings();
  scheduleRender();
});

document.addEventListener('click', event => {
  if (!event.target.closest('.person-link')) cancelPendingPersonClick();
  setSettingsOpen(false);
  relationshipFilterControl.close();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    graph = parseGedcom(await file.text());
    importLabel = file.name;
    selectedPersonId = '';
    selection = emptySelection();
    relationshipFilter = createRelationshipFilter();
    activeTreeId = crypto.randomUUID();
    recentPersonIds = [];
    searchInput.placeholder = 'Find a person…';
    inspectorState = updateInspectorState(inspectorState, { type: 'deselect-person' });
    updateHistory(selection, 'replace');
    renderImportReport();
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
  applyInspectorLayout();
}

paneResizer.addEventListener('pointerdown', event => {
  if (!inspectorState.open) return;
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
  applyInspectorLayout();
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault();
    searchInput.placeholder = 'Find a person…';
    personSearch.open();
    return;
  }
  if (event.key !== 'Escape') return;
  if (personSearch.isOpen()) {
    event.preventDefault();
    personSearch.close({ restoreFocus: true });
    return;
  }
  if (!settingsPopover.hidden) {
    setSettingsOpen(false);
    settingsTrigger.focus();
    return;
  }
  if (relationshipFilterControl.isOpen()) {
    relationshipFilterControl.close();
    relationshipFilterControl.focus();
    return;
  }
  if (selection.type === 'none') return;
  selectEntity(emptySelection());
});

window.addEventListener('popstate', event => {
  const restoredSelection = selectionFromHistoryState(event.state, activeTreeId, graph);
  selectEntity(restoredSelection, {
    historyMode: 'none',
    reveal: restoredSelection.type === 'person'
  });
});

window.addEventListener('resize', () => {
  if (!inspectorState.open) return;
  const sizeKey = inspectorState.dock === 'right' ? 'rightSize' : 'bottomSize';
  inspectorState = updateInspectorState(inspectorState, {
    type: 'resize',
    dock: inspectorState.dock,
    size: inspectorState[sizeKey],
    ...inspectorLimits()
  });
  applyInspectorLayout();
});

renderSettings();
renderImportReport();
renderTree();
updateHistory(selection, 'replace');
