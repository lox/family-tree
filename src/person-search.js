const normalize = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const year = value => (String(value ?? '').match(/\b(\d{4})\b/) ?? [,''])[1];

const resultFor = (person, score = 0) => {
  const birthYear = year(person.birth);
  const deathYear = year(person.death);
  const lifespan = birthYear && deathYear
    ? `${birthYear}–${deathYear}`
    : birthYear || deathYear;
  return {
    id: person.id,
    name: person.name,
    lifespan,
    context: person.birthPlace || person.deathPlace || person.occupation || '',
    score
  };
};

const matchScore = (person, query) => {
  const name = normalize(person.name);
  const aliases = (person.aliases ?? []).map(normalize);
  const metadata = [
    person.birth, person.death, person.birthPlace, person.deathPlace, person.occupation
  ].map(normalize).filter(Boolean);

  if (name === query) return 0;
  if (name.startsWith(query)) return 10;
  const namePosition = name.indexOf(query);
  if (namePosition >= 0) return 20 + namePosition;
  const aliasPosition = aliases.reduce((best, alias) => {
    const position = alias.indexOf(query);
    return position < 0 ? best : Math.min(best, position);
  }, Number.POSITIVE_INFINITY);
  if (Number.isFinite(aliasPosition)) return 100 + aliasPosition;
  const metadataPosition = metadata.reduce((best, value) => {
    const position = value.indexOf(query);
    return position < 0 ? best : Math.min(best, position);
  }, Number.POSITIVE_INFINITY);
  return Number.isFinite(metadataPosition) ? 200 + metadataPosition : null;
};

export function searchPeople(people, rawQuery, { limit = 12, recentIds = [] } = {}) {
  const query = normalize(rawQuery);
  if (!query) {
    return recentIds
      .map(id => people[id])
      .filter(Boolean)
      .slice(0, limit)
      .map(person => resultFor(person));
  }

  return Object.values(people)
    .map(person => ({ person, score: matchScore(person, query) }))
    .filter(result => result.score !== null)
    .sort((left, right) => left.score - right.score || left.person.name.localeCompare(right.person.name))
    .slice(0, limit)
    .map(({ person, score }) => resultFor(person, score));
}

export function moveSearchSelection(currentIndex, direction, resultCount) {
  if (!resultCount) return -1;
  if (currentIndex < 0) return direction < 0 ? resultCount - 1 : 0;
  return (currentIndex + direction + resultCount) % resultCount;
}

export function createPersonSearchDialog({
  dialog,
  trigger,
  input,
  resultsElement,
  closeButton,
  getPeople,
  getRecentIds,
  onOpen = () => {},
  onSelect
}) {
  let activeResults = [];
  let activeIndex = -1;

  const updateActiveResult = () => {
    const options = [...resultsElement.querySelectorAll('.person-search-result')];
    options.forEach((option, index) => {
      const active = index === activeIndex;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-selected', String(active));
    });
    const activeOption = options[activeIndex];
    input.setAttribute('aria-activedescendant', activeOption?.id ?? '');
    activeOption?.scrollIntoView({ block: 'nearest' });
  };

  const close = ({ restoreFocus = false } = {}) => {
    if (dialog.open) dialog.close();
    if (restoreFocus) trigger.focus();
  };

  const chooseResult = (index = activeIndex) => {
    const result = activeResults[index];
    if (!result) return;
    close();
    onSelect(result.id);
  };

  const render = () => {
    const query = input.value.trim();
    activeResults = searchPeople(getPeople(), query, { recentIds: getRecentIds() });
    activeIndex = activeResults.length ? 0 : -1;
    const content = document.createDocumentFragment();
    if (!query && activeResults.length) {
      const label = document.createElement('div');
      label.className = 'person-search-section-label';
      label.textContent = 'Recent people';
      content.append(label);
    }
    activeResults.forEach((result, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `person-search-result-${index}`;
      option.className = 'person-search-result';
      option.dataset.personId = result.id;
      option.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.className = 'person-search-result-name';
      name.textContent = result.name;
      const years = document.createElement('span');
      years.className = 'person-search-result-years';
      years.textContent = result.lifespan;
      option.append(name, years);
      if (result.context) {
        const context = document.createElement('span');
        context.className = 'person-search-result-context';
        context.textContent = result.context;
        option.append(context);
      }
      option.addEventListener('mouseenter', () => {
        activeIndex = index;
        updateActiveResult();
      });
      option.addEventListener('click', () => chooseResult(index));
      content.append(option);
    });
    if (!activeResults.length) {
      const message = document.createElement('div');
      message.className = 'person-search-message';
      message.textContent = query
        ? `No people match “${query}”`
        : 'Start typing to find someone in this tree.';
      content.append(message);
    }
    resultsElement.replaceChildren(content);
    updateActiveResult();
  };

  const open = () => {
    onOpen();
    if (!dialog.open) dialog.showModal();
    input.value = '';
    render();
    requestAnimationFrame(() => input.focus());
  };

  trigger.addEventListener('click', open);
  closeButton.addEventListener('click', () => close());
  input.addEventListener('input', render);
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = moveSearchSelection(
        activeIndex,
        event.key === 'ArrowDown' ? 1 : -1,
        activeResults.length
      );
      updateActiveResult();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      chooseResult();
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });

  return { open, close, isOpen: () => dialog.open };
}
