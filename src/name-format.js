const suffixPattern = /^(Jr\.?|Sr\.?|II|III|IV|V)$/i;

const clip = (value, limit) => (
  value.length > limit ? `${value.slice(0, Math.max(1, limit - 1))}…` : value
);

function wrapWords(words, limit, maxLines) {
  if (!words.length) return [];
  const lines = [];
  let current = '';

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current && lines.length < maxLines - 1) {
      lines.push(current);
      current = word;
      continue;
    }
    current = clip([current, ...words.slice(index)].filter(Boolean).join(' '), limit);
    break;
  }

  if (current) lines.push(clip(current, limit));
  return lines;
}

export function formatCardName(name, limit = 17) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return ['Unknown'];

  const suffix = suffixPattern.test(parts.at(-1)) ? parts.pop() : '';
  const surname = parts.pop() ?? '';
  const givenLines = wrapWords(parts, limit, 2);
  const surnameLimit = suffix ? Math.max(4, limit - suffix.length - 1) : limit;
  const surnameLine = [clip(surname, surnameLimit), suffix].filter(Boolean).join(' ');

  return [...givenLines, surnameLine].filter(Boolean);
}

export function cardNameBaselines(lineCount) {
  if (lineCount <= 1) return [27];
  if (lineCount === 2) return [20, 35];
  return [18, 29, 40];
}
