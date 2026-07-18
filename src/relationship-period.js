export const relationshipYear = value => (value?.match(/\b(\d{4})\b/) ?? [, ''])[1];

const explicitEnd = family => {
  if (family.annulment) return { date: family.annulment, reason: 'annulment', verb: 'Annulled' };
  if (family.divorce) return { date: family.divorce, reason: 'divorce', verb: 'Divorced' };
  if (family.separation) return { date: family.separation, reason: 'separation', verb: 'Separated' };
  return null;
};

const deathEnd = (family, people, startYear) => family.partners
  .map(personId => people[personId]?.death)
  .filter(Boolean)
  .map(date => ({ date, year: Number(relationshipYear(date)) }))
  .filter(candidate => candidate.year && (!startYear || candidate.year >= Number(startYear)))
  .sort((left, right) => left.year - right.year)[0];

export function relationshipPeriod(family, people) {
  const start = family.marriage ?? '';
  const startYear = relationshipYear(start);
  const recordedEnd = explicitEnd(family);
  const inferredDeath = recordedEnd ? null : deathEnd(family, people, startYear);
  const end = recordedEnd ?? (inferredDeath ? {
    date: inferredDeath.date,
    reason: 'death',
    verb: 'Ended'
  } : null);
  const endYear = relationshipYear(end?.date);

  if (!startYear) {
    return {
      label: '',
      title: end ? `${end.verb} ${end.date}${end.reason === 'death' ? ' by death' : ''}` : '',
      endReason: end?.reason ?? ''
    };
  }

  return {
    label: endYear ? `${startYear}–${endYear}` : `m. ${startYear}`,
    title: end
      ? `Married ${start} · ${end.verb} ${end.date}${end.reason === 'death' ? ' by death' : ''}`
      : `Married ${start}`,
    endReason: end?.reason ?? ''
  };
}
