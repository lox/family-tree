const GEDCOM_LINE = /^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/;

function splitLines(source) {
  const lines = [];
  let offset = 0;
  while (offset < source.length) {
    const match = /\r\n|\r|\n/.exec(source.slice(offset));
    if (!match) {
      lines.push({ raw: source.slice(offset), ending: '' });
      break;
    }
    const end = offset + match.index;
    lines.push({ raw: source.slice(offset, end), ending: match[0] });
    offset = end + match[0].length;
  }
  return lines;
}

function dominantNewline(lines) {
  const counts = new Map();
  for (const { ending } of lines) {
    if (ending) counts.set(ending, (counts.get(ending) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? '\n';
}

/**
 * Parse the GEDCOM container syntax without interpreting or normalising payloads.
 * Every line remains available verbatim while parsed nodes receive stable paths.
 */
export function parseGedcomSyntax(input) {
  if (typeof input !== 'string') throw new TypeError('GEDCOM source must be text');
  const bom = input.startsWith('\uFEFF') ? '\uFEFF' : '';
  const lines = splitLines(bom ? input.slice(1) : input);
  const roots = [];
  const stack = [];
  const malformedLines = [];

  lines.forEach((line, lineIndex) => {
    if (!line.raw.trim()) return;
    const match = line.raw.match(GEDCOM_LINE);
    if (!match) {
      malformedLines.push({
        lineNumber: lineIndex + 1,
        raw: line.raw
      });
      return;
    }
    const node = {
      level: Number(match[1]),
      xref: match[2] ? match[2].slice(1, -1) : '',
      tag: match[3],
      value: match[4] ?? '',
      lineIndex,
      path: [],
      children: []
    };
    while (stack.length && stack.at(-1).level >= node.level) stack.pop();
    const siblings = stack.length ? stack.at(-1).children : roots;
    node.path = stack.length
      ? [...stack.at(-1).path, siblings.length]
      : [siblings.length];
    siblings.push(node);
    stack.push(node);
  });

  return {
    bom,
    newline: dominantNewline(lines),
    lines,
    roots,
    malformedLines
  };
}

export function nodeAtPath(syntax, path) {
  if (!syntax || !Array.isArray(path)) return null;
  let nodes = syntax.roots;
  let node = null;
  for (const index of path) {
    node = nodes?.[index];
    if (!node) return null;
    nodes = node.children;
  }
  return node;
}

export function recordByXref(syntax, xref, tag = '') {
  return syntax?.roots?.find(node => (
    node.xref === xref && (!tag || node.tag === tag)
  )) ?? null;
}

export function subtreeLastLineIndex(node) {
  if (!node) return -1;
  let last = node.lineIndex;
  const visit = child => {
    last = Math.max(last, child.lineIndex);
    child.children.forEach(visit);
  };
  node.children.forEach(visit);
  return last;
}
