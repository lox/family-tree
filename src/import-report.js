const plural = (count, singular, pluralForm = `${singular}s`) => (
  count === 1 ? singular : pluralForm
);

export function buildImportReport(label, diagnostics) {
  const { format, counts, warnings } = diagnostics;
  const formatDescription = format.version
    ? `GEDCOM ${format.version}${format.producer ? ` from ${format.producer}` : ''}`
    : 'Unknown GEDCOM version';
  const warningCount = warnings.reduce((total, item) => total + item.count, 0);

  return {
    label,
    status: warningCount
      ? `Imported with ${warningCount} ${plural(warningCount, 'warning')}`
      : 'Imported without warnings',
    metadata: [
      formatDescription,
      `${counts.people} ${plural(counts.people, 'person', 'people')}`,
      `${counts.families} ${plural(counts.families, 'family', 'families')}`,
      `${counts.sources} ${plural(counts.sources, 'source')}`
    ].join(' · '),
    warnings: warnings.map(item => ({ message: item.message, details: item.details }))
  };
}
