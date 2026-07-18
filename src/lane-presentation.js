export function generationLaneBounds(bands, layoutHeight) {
  const grouped = new Map();
  bands.forEach(band => {
    if (!grouped.has(band.generation)) grouped.set(band.generation, []);
    grouped.get(band.generation).push(band);
  });

  const generations = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([generation, generationBands]) => {
      const sorted = [...generationBands].sort((left, right) => left.y - right.y);
      return {
        generation,
        contentStart: sorted[0].y,
        contentEnd: Math.max(...sorted.map(band => band.y + band.height))
      };
    });

  const boundaries = generations.slice(0, -1).map((current, index) => (
    (current.contentEnd + generations[index + 1].contentStart) / 2
  ));

  return generations.map((item, index) => ({
    generation: item.generation,
    start: index ? boundaries[index - 1] : 0,
    end: boundaries[index] ?? layoutHeight
  }));
}
