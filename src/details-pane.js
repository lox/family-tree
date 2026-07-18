import { buildPersonDetails } from './person-details.js';

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

function createRelationships(relationships) {
  const list = document.createElement('div');
  list.className = 'inspector-relationship-list';
  relationships.forEach(relationship => {
    const item = document.createElement('article');
    item.className = 'inspector-relationship';
    const title = document.createElement('strong');
    title.textContent = relationship.partners.length
      ? relationship.partners.join(' & ')
      : 'Recorded family';
    item.append(title);
    relationship.events.forEach(event => {
      const meta = document.createElement('div');
      meta.className = 'inspector-relationship-meta';
      meta.textContent = `${event.label}: ${detailMeta(event.date, event.place) || 'date not recorded'}`;
      item.append(meta);
    });
    if (relationship.children.length) {
      const children = document.createElement('div');
      children.className = 'inspector-relationship-children';
      children.textContent = `Children · ${relationship.children.join(', ')}`;
      item.append(children);
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

function createTopbar(dock, onDock, onClose) {
  const topbar = document.createElement('div');
  topbar.className = 'inspector-topbar';
  const label = document.createElement('span');
  label.className = 'inspector-label';
  label.textContent = 'Person details';
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

function createSections(details, person) {
  const sections = document.createElement('div');
  sections.className = 'inspector-sections';
  if (details.personal.length) {
    sections.append(createSection('Personal', createFactList(details.personal)));
  }
  if (details.lifeEvents.length) {
    sections.append(createSection('Life events', createLifeEvents(details.lifeEvents)));
  }
  if (details.relationships.length) {
    sections.append(createSection('Relationships', createRelationships(details.relationships)));
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

export function renderDetailsPane({ element, graph, personId, dock, onDock, onClose }) {
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
  content.append(heading, createSections(details, person));
  element.replaceChildren(createTopbar(dock, onDock, onClose), content);
}
