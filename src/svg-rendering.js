import { claimConnectionFocus } from './connection-hover.js';

const NS = 'http://www.w3.org/2000/svg';

export const svgElement = (tag, attributes = {}, text = '') => {
  const element = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  if (text) element.textContent = text;
  return element;
};

export function roundedPath(points, radius = 8) {
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

export function appendInteractiveConnectionPath({
  svg,
  attributes,
  connectionKey,
  graph,
  selectedConnectionKeys,
  claimedConnectionKeys
}) {
  const [kind, familyId] = connectionKey.split(':');
  const family = graph.families.find(candidate => candidate.id === familyId);
  const people = family?.partners
    .map(personId => graph.people[personId]?.name)
    .filter(Boolean)
    .join(' and ');
  const focusable = claimConnectionFocus(claimedConnectionKeys, connectionKey);
  const groupAttributes = {
    class: 'connection-group',
    'data-connection-key': connectionKey
  };
  if (focusable) Object.assign(groupAttributes, {
    role: 'button', tabindex: '0',
    'aria-pressed': String(selectedConnectionKeys.has(connectionKey)),
    'aria-label': kind === 'union'
      ? `Select partnership${people ? ` between ${people}` : ''}`
      : `Select children${people ? ` of ${people}` : ''}`
  });
  else groupAttributes['aria-hidden'] = 'true';

  const group = svgElement('g', groupAttributes);
  const paths = [];
  if (attributes.class?.includes('parentage-route')) {
    paths.push(svgElement('path', {
      d: attributes.d,
      class: 'connection-casing',
      'aria-hidden': 'true'
    }));
  }
  paths.push(
    svgElement('path', { ...attributes, 'data-connection-key': connectionKey }),
    svgElement('path', {
      d: attributes.d,
      class: 'connection-hit-target',
      'data-connection-key': connectionKey,
      'aria-hidden': 'true'
    })
  );
  group.append(...paths);
  svg.append(group);
}
