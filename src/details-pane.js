import { buildPersonDetails } from './person-details.js';
import {
  buildChildrenDetails,
  buildPartnershipDetails
} from './relationship-details.js';
import { buildRelationshipComparison } from './relationship-comparison.js';

const NS = 'http://www.w3.org/2000/svg';
const detailMeta = (...parts) => parts.filter(Boolean).join(' · ');

const svgElement = (tag, attributes = {}) => {
  const element = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
};

function createFactList(facts) {
  const list = document.createElement('dl');
  list.className = 'inspector-facts';
  facts.forEach(([label, value, wide = false]) => {
    const fact = document.createElement('div');
    fact.className = `inspector-fact${wide ? ' is-wide' : ''}`;
    const term = document.createElement('dt');
    term.textContent = label;
    const definition = document.createElement('dd');
    definition.textContent = value;
    fact.append(term, definition);
    list.append(fact);
  });
  return list;
}

function createSection(title, content, { count, disclosure = false, expanded = false } = {}) {
  const section = document.createElement(disclosure ? 'details' : 'section');
  section.className = `inspector-section${disclosure ? ' inspector-disclosure' : ''}`;
  if (disclosure) section.open = expanded;
  const heading = document.createElement(disclosure ? 'summary' : 'h3');
  heading.className = 'inspector-section-heading';
  const label = document.createElement('span');
  label.textContent = title;
  heading.append(label);
  if (count !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'inspector-count';
    badge.textContent = String(count);
    heading.append(badge);
  }
  section.append(heading, content);
  return section;
}

function createLifeEvents(events) {
  const list = document.createElement('ol');
  list.className = 'inspector-event-list';
  events.forEach(event => {
    const item = document.createElement('li');
    item.className = 'inspector-event';
    const marker = document.createElement('span');
    marker.className = 'inspector-event-marker';
    marker.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = event.label;
    body.append(label);
    const meta = detailMeta(event.date, event.place);
    if (meta) {
      const line = document.createElement('div');
      line.className = 'inspector-event-meta';
      line.textContent = meta;
      body.append(line);
    }
    if (event.value) {
      const value = document.createElement('p');
      value.textContent = event.value;
      body.append(value);
    }
    event.notes.forEach(note => {
      const text = document.createElement('p');
      text.className = 'inspector-event-note';
      text.textContent = note.text;
      body.append(text);
    });
    item.append(marker, body);
    list.append(item);
  });
  return list;
}

function createPersonLink(person, onSelectPerson) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inspector-person-link';
  button.dataset.personId = person.id;
  button.textContent = person.name;
  button.addEventListener('click', () => onSelectPerson(person.id));
  return button;
}

function createPeopleLinks(label, people, onSelectPerson) {
  const group = document.createElement('div');
  group.className = 'inspector-relationship-people';
  const prefix = document.createElement('span');
  prefix.textContent = `${label} · `;
  group.append(prefix);
  people.forEach((person, index) => {
    if (index) group.append(document.createTextNode(', '));
    group.append(createPersonLink(person, onSelectPerson));
  });
  return group;
}

function createRelationships(parents, relationships, onSelectPerson) {
  const list = document.createElement('div');
  list.className = 'inspector-relationship-list';
  if (parents.length) {
    const parentGroup = document.createElement('article');
    parentGroup.className = 'inspector-relationship';
    parentGroup.append(createPeopleLinks('Parents', parents, onSelectPerson));
    list.append(parentGroup);
  }
  relationships.forEach(relationship => {
    const item = document.createElement('article');
    item.className = 'inspector-relationship';
    if (relationship.partners.length) {
      item.append(createPeopleLinks('Partner', relationship.partners, onSelectPerson));
    } else {
      const title = document.createElement('strong');
      title.textContent = 'Recorded family';
      item.append(title);
    }
    relationship.events.forEach(event => {
      const meta = document.createElement('div');
      meta.className = 'inspector-relationship-meta';
      meta.textContent = `${event.label}: ${detailMeta(event.date, event.place) || 'date not recorded'}`;
      item.append(meta);
    });
    if (relationship.children.length) {
      item.append(createPeopleLinks('Children', relationship.children, onSelectPerson));
    }
    list.append(item);
  });
  return list;
}

function createNotes(notes) {
  const list = document.createElement('div');
  list.className = 'inspector-note-list';
  notes.forEach(note => {
    const paragraph = document.createElement('p');
    paragraph.textContent = note.text;
    list.append(paragraph);
  });
  return list;
}

const sourceName = citation => {
  const source = citation.record ?? {};
  return source.title || source.periodical || source.text || source.author
    || source.type || citation.id || 'Unlabelled source';
};

function createSources(sources) {
  const list = document.createElement('ol');
  list.className = 'inspector-source-list';
  sources.forEach(citation => {
    const source = citation.record ?? {};
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = sourceName(citation);
    item.append(title);
    const byline = detailMeta(source.author, source.publisher, source.date, citation.page);
    if (byline) {
      const meta = document.createElement('div');
      meta.className = 'inspector-source-meta';
      meta.textContent = byline;
      item.append(meta);
    }
    if (/^https?:\/\//i.test(source.url ?? '')) {
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = source.url;
      item.append(link);
    }
    list.append(item);
  });
  return list;
}

function createMedia(media) {
  const list = document.createElement('div');
  list.className = 'inspector-media-list';
  media.forEach(item => {
    const mediaItem = document.createElement('div');
    mediaItem.className = 'inspector-media-item';
    const title = document.createElement('strong');
    title.textContent = item.title || item.file?.split(/[\\/]/).at(-1) || 'Untitled media';
    mediaItem.append(title);
    const metaText = detailMeta(item.type, item.format, item.primary ? 'Primary' : '');
    if (metaText) {
      const meta = document.createElement('div');
      meta.className = 'inspector-source-meta';
      meta.textContent = metaText;
      mediaItem.append(meta);
    }
    if (item.file) {
      const path = document.createElement('div');
      path.className = 'inspector-media-path';
      path.textContent = item.file;
      mediaItem.append(path);
    }
    list.append(mediaItem);
  });
  return list;
}

function createPaneIcon(type) {
  const icon = svgElement('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true' });
  icon.classList.add('pane-action-icon');
  if (type === 'right') {
    icon.append(
      svgElement('rect', { x: 2.5, y: 3, width: 15, height: 14, rx: 2 }),
      svgElement('path', { d: 'M 12.5 3 V 17' })
    );
  } else if (type === 'bottom') {
    icon.append(
      svgElement('rect', { x: 2.5, y: 3, width: 15, height: 14, rx: 2 }),
      svgElement('path', { d: 'M 2.5 11.5 H 17.5' })
    );
  } else {
    icon.append(svgElement('path', { d: 'M 5 5 L 15 15 M 15 5 L 5 15' }));
  }
  return icon;
}

function createTopbar(dock, onDock, onClose, labelText = 'Person details') {
  const topbar = document.createElement('div');
  topbar.className = 'inspector-topbar';
  const label = document.createElement('span');
  label.className = 'inspector-label';
  label.textContent = labelText;
  const actions = document.createElement('div');
  actions.className = 'inspector-actions';
  const nextDock = dock === 'right' ? 'bottom' : 'right';
  const dockButton = document.createElement('button');
  dockButton.type = 'button';
  dockButton.className = 'pane-action';
  dockButton.setAttribute('aria-label', `Dock details to ${nextDock}`);
  dockButton.title = `Dock details to ${nextDock}`;
  dockButton.append(createPaneIcon(nextDock));
  dockButton.addEventListener('click', onDock);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pane-action';
  close.setAttribute('aria-label', 'Close details');
  close.title = 'Close details';
  close.append(createPaneIcon('close'));
  close.addEventListener('click', onClose);
  actions.append(dockButton, close);
  topbar.append(label, actions);
  return topbar;
}

function createSections(details, person, onSelectPerson) {
  const sections = document.createElement('div');
  sections.className = 'inspector-sections';
  if (details.personal.length) {
    sections.append(createSection('Personal', createFactList(details.personal)));
  }
  if (details.lifeEvents.length) {
    sections.append(createSection('Life events', createLifeEvents(details.lifeEvents)));
  }
  if (details.parents.length || details.relationships.length) {
    sections.append(createSection(
      'Relationships',
      createRelationships(details.parents, details.relationships, onSelectPerson)
    ));
  }
  if (details.notes.length) {
    sections.append(createSection('Notes', createNotes(details.notes), {
      count: details.notes.length, disclosure: true, expanded: true
    }));
  }
  if (details.sources.length) {
    sections.append(createSection('Sources', createSources(details.sources), {
      count: details.sources.length, disclosure: true
    }));
  }
  if (details.media.length) {
    sections.append(createSection('Media', createMedia(details.media), {
      count: details.media.length, disclosure: true
    }));
  }
  const recordFacts = [
    ['GEDCOM record', person.id],
    person.record?.uid && ['Persistent ID', person.record.uid],
    person.record?.changed && ['Last changed', person.record.changed]
  ].filter(Boolean);
  sections.append(createSection('Record details', createFactList(recordFacts), { disclosure: true }));
  return sections;
}

export function renderDetailsPane({ element, graph, personId, dock, onDock, onClose, onSelectPerson }) {
  return renderSelectionDetailsPane({
    element,
    graph,
    selection: personId ? { type: 'person', personId } : { type: 'none' },
    dock,
    onDock,
    onClose,
    onSelectPerson
  });
}

function createComparisonChain(details, onSelectPerson) {
  const list = document.createElement('ol');
  list.className = 'inspector-comparison-chain';
  details.lineage.forEach(entry => {
    const item = document.createElement('li');
    const marker = document.createElement('span');
    marker.className = 'inspector-comparison-marker';
    marker.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.append(createPersonLink(entry.person, onSelectPerson));
    const relationship = document.createElement('span');
    relationship.className = 'inspector-comparison-role';
    relationship.textContent = entry.relationship;
    body.append(relationship);
    item.append(marker, body);
    list.append(item);
  });
  return list;
}

function createComparisonEndpoints(details, onSelectPerson) {
  const endpoints = [details.people[0], details.people.at(-1)].filter(Boolean);
  const group = document.createElement('div');
  group.className = 'inspector-comparison-endpoints';
  endpoints.forEach((person, index) => {
    if (index) {
      const arrow = document.createElement('span');
      arrow.className = 'inspector-comparison-arrow';
      arrow.textContent = '→';
      arrow.setAttribute('aria-hidden', 'true');
      group.append(arrow);
    }
    const endpoint = document.createElement('div');
    endpoint.className = 'inspector-comparison-endpoint';
    const label = document.createElement('span');
    label.textContent = index === 0 ? 'Reference person' : 'Compared person';
    endpoint.append(label, createPersonLink(person, onSelectPerson));
    group.append(endpoint);
  });
  return group;
}

function createComparisonHeading(details, onSelectPerson) {
  const heading = document.createElement('div');
  heading.className = 'inspector-heading inspector-comparison-heading';
  heading.append(createComparisonEndpoints(details, onSelectPerson));
  const kicker = document.createElement('div');
  kicker.className = 'inspector-comparison-kicker';
  kicker.textContent = 'Closest recorded relationship';
  heading.append(kicker);
  const name = document.createElement('h2');
  name.className = 'inspector-name';
  name.textContent = details.relationship?.forwardTerm
    ? details.relationship.forwardTerm.charAt(0).toUpperCase() + details.relationship.forwardTerm.slice(1)
    : details.connected ? 'Recorded family connection' : 'No recorded relationship';
  heading.append(name);
  const statement = document.createElement('p');
  statement.className = 'inspector-comparison-statement';
  statement.textContent = details.relationship?.forward ?? details.summary;
  heading.append(statement);
  if (details.relationship?.reverse && details.relationship.reverse !== details.relationship.forward) {
    const reciprocal = document.createElement('p');
    reciprocal.className = 'inspector-comparison-reciprocal';
    reciprocal.textContent = details.relationship.reverse;
    heading.append(reciprocal);
  }
  const meta = document.createElement('div');
  meta.className = 'inspector-years';
  meta.textContent = details.summary;
  heading.append(meta);
  return heading;
}

function renderComparisonPane({ element, graph, selection, dock, onDock, onClose, onSelectPerson }) {
  const details = buildRelationshipComparison(graph, ...selection.personIds);
  const sections = document.createElement('div');
  sections.className = 'inspector-sections';
  if (details.connected) {
    sections.append(createSection(
      'Family line',
      createComparisonChain(details, onSelectPerson),
      { count: details.lineage.length }
    ));
  } else {
    const guidance = document.createElement('p');
    guidance.className = 'inspector-comparison-empty';
    guidance.textContent = 'These people may still be related, but this file does not contain a connected chain of family records.';
    sections.append(createSection('Recorded path', guidance));
  }
  const content = document.createElement('div');
  content.className = 'inspector-content';
  content.append(createComparisonHeading(details, onSelectPerson), sections);
  element.replaceChildren(createTopbar(dock, onDock, onClose, 'Relationship'), content);
}

function createRelationshipHeading(title, eyebrow) {
  const heading = document.createElement('div');
  heading.className = 'inspector-heading';
  const name = document.createElement('h2');
  name.className = 'inspector-name';
  name.textContent = title;
  heading.append(name);
  const meta = document.createElement('div');
  meta.className = 'inspector-years';
  meta.textContent = eyebrow;
  heading.append(meta);
  return heading;
}

function createPartnershipSections(details, onSelectPerson) {
  const sections = document.createElement('div');
  sections.className = 'inspector-sections';
  sections.append(createSection(
    'Partners',
    createPeopleLinks('People', details.partners, onSelectPerson)
  ));
  if (details.events.length) {
    sections.append(createSection('Recorded events', createLifeEvents(details.events)));
  }
  if (details.children.length) {
    sections.append(createSection(
      'Children',
      createPeopleLinks('Children', details.children, onSelectPerson),
      { count: details.children.length }
    ));
  }
  if (details.notes.length) {
    sections.append(createSection('Notes', createNotes(details.notes), {
      count: details.notes.length, disclosure: true, expanded: true
    }));
  }
  if (details.sources.length) {
    sections.append(createSection('Sources', createSources(details.sources), {
      count: details.sources.length, disclosure: true
    }));
  }
  if (details.media.length) {
    sections.append(createSection('Media', createMedia(details.media), {
      count: details.media.length, disclosure: true
    }));
  }
  const recordFacts = [
    ['GEDCOM family record', details.familyId],
    details.record.uid && ['Persistent ID', details.record.uid],
    details.record.changed && ['Last changed', details.record.changed]
  ].filter(Boolean);
  sections.append(createSection('Record details', createFactList(recordFacts), { disclosure: true }));
  return sections;
}

function renderPartnershipPane({ element, graph, selection, dock, onDock, onClose, onSelectPerson }) {
  const details = buildPartnershipDetails(graph, selection.familyId);
  if (!details) return false;
  const content = document.createElement('div');
  content.className = 'inspector-content';
  content.append(
    createRelationshipHeading(details.title, 'Recorded partnership'),
    createPartnershipSections(details, onSelectPerson)
  );
  element.replaceChildren(createTopbar(dock, onDock, onClose, 'Partnership details'), content);
  return true;
}

function renderChildrenPane({ element, graph, selection, dock, onDock, onClose, onSelectPerson }) {
  const details = buildChildrenDetails(graph, selection.familyId);
  if (!details) return false;
  const sections = document.createElement('div');
  sections.className = 'inspector-sections';
  sections.append(createSection(
    'Parents or partners',
    createPeopleLinks('People', details.partners, onSelectPerson)
  ));
  const childList = details.children.length
    ? createPeopleLinks('Children', details.children, onSelectPerson)
    : document.createTextNode('No children are recorded for this family.');
  sections.append(createSection('Children', childList, { count: details.children.length }));
  const content = document.createElement('div');
  content.className = 'inspector-content';
  content.append(createRelationshipHeading(details.title, 'Direct descendants'), sections);
  element.replaceChildren(createTopbar(dock, onDock, onClose, 'Children'), content);
  return true;
}

export function renderSelectionDetailsPane({
  element, graph, selection, dock, onDock, onClose, onSelectPerson
}) {
  if (selection?.type === 'comparison') {
    renderComparisonPane({ element, graph, selection, dock, onDock, onClose, onSelectPerson });
    return;
  }
  if (selection?.type === 'partnership' && renderPartnershipPane({
    element, graph, selection, dock, onDock, onClose, onSelectPerson
  })) return;
  if (selection?.type === 'children' && renderChildrenPane({
    element, graph, selection, dock, onDock, onClose, onSelectPerson
  })) return;
  const personId = selection?.type === 'person' ? selection.personId : '';
  const person = graph.people[personId];
  if (!person) {
    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    const heading = document.createElement('h2');
    heading.textContent = 'No person selected';
    const guidance = document.createElement('p');
    guidance.textContent = 'Select a person in the tree to view their details.';
    empty.append(heading, guidance);
    element.replaceChildren(createTopbar(dock, onDock, onClose), empty);
    return;
  }
  const details = buildPersonDetails(graph, personId);
  const heading = document.createElement('div');
  heading.className = 'inspector-heading';
  const name = document.createElement('h2');
  name.className = 'inspector-name';
  name.textContent = person.name;
  heading.append(name);
  if (details.lifespan) {
    const years = document.createElement('div');
    years.className = 'inspector-years';
    years.textContent = details.lifespan;
    heading.append(years);
  }
  const content = document.createElement('div');
  content.className = 'inspector-content';
  content.append(heading, createSections(details, person, onSelectPerson));
  element.replaceChildren(createTopbar(dock, onDock, onClose), content);
}
