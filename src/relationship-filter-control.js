import {
  createCustomRelationshipFilter,
  createRelationshipFilter,
  relationshipFilterAnchorPersonId,
  relationshipFilterLabel
} from './relationship-filter.js';

const DEFAULT_PRIVACY_NOTICE = 'GED files stay in this browser.';

function requiredElement(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Relationship filter control requires ${selector}`);
  return element;
}

const depthValue = depth => depth === Infinity ? 'all' : String(depth);
const parseDepth = value => value === 'all' ? Infinity : Number(value);

export function createRelationshipFilterControl({
  root,
  workspace,
  privacyNote,
  getPrivacyNotice = () => DEFAULT_PRIVACY_NOTICE,
  getPeople,
  getSelectedPersonId,
  onChange,
  onOpen
}) {
  const trigger = requiredElement(root, '#relationship-filter-trigger');
  const triggerLabel = requiredElement(root, '#relationship-filter-trigger-label');
  const clearButton = requiredElement(root, '#relationship-filter-clear');
  const popover = requiredElement(root, '#relationship-filter-popover');
  const anchorLabel = requiredElement(root, '#relationship-filter-anchor');
  const presetButtons = [...root.querySelectorAll('[data-filter-preset]')];
  const options = requiredElement(root, '#relationship-filter-options');
  const ancestorDepth = requiredElement(root, '#relationship-filter-ancestor-depth');
  const descendantDepth = requiredElement(root, '#relationship-filter-descendant-depth');
  const partners = requiredElement(root, '#relationship-filter-partners');
  const siblings = requiredElement(root, '#relationship-filter-siblings');
  const descendantPartners = requiredElement(root, '#relationship-filter-descendant-partners');
  let currentFilter = createRelationshipFilter();

  const anchorPersonId = () => relationshipFilterAnchorPersonId(
    currentFilter,
    getSelectedPersonId()
  );

  function setOpen(open) {
    popover.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  }

  function applyPreset(preset, requestedAnchorId = getSelectedPersonId()) {
    const personId = requestedAnchorId || anchorPersonId();
    if (preset !== 'full' && !getPeople()[personId]) return;
    const nextFilter = createRelationshipFilter(personId, preset);
    onChange(nextFilter, { revealPersonId: preset === 'full' ? '' : personId });
  }

  function applyCustomFilter() {
    const personId = getSelectedPersonId() || anchorPersonId();
    if (!getPeople()[personId]) return;
    const nextFilter = createCustomRelationshipFilter(personId, {
      ancestorDepth: parseDepth(ancestorDepth.value),
      descendantDepth: parseDepth(descendantDepth.value),
      includeAnchorPartners: partners.checked,
      includeSiblings: siblings.checked,
      includeDescendantPartners: descendantPartners.checked
    });
    onChange(nextFilter, { revealPersonId: personId });
  }

  function render(filter) {
    currentFilter = filter;
    const active = filter.preset !== 'full';
    const person = getPeople()[anchorPersonId()];
    const label = relationshipFilterLabel(filter.preset);
    workspace.classList.toggle('is-filtered', active);
    trigger.classList.toggle('is-active', active);
    clearButton.hidden = !active;
    triggerLabel.textContent = label;
    trigger.setAttribute('aria-label', active && person
      ? `${label} relative to ${person.name}`
      : 'Filter relatives');
    anchorLabel.textContent = person ? `Relative to ${person.name}` : 'Select a person first';
    options.disabled = !person;
    presetButtons.forEach(button => {
      button.disabled = button.dataset.filterPreset !== 'full' && !person;
      button.classList.toggle('is-selected', button.dataset.filterPreset === filter.preset);
    });
    ancestorDepth.value = depthValue(filter.ancestorDepth);
    descendantDepth.value = depthValue(filter.descendantDepth);
    partners.checked = filter.includeAnchorPartners;
    siblings.checked = filter.includeSiblings;
    descendantPartners.checked = filter.includeDescendantPartners;
    privacyNote.textContent = active && person
      ? `${label} relative to ${person.name} · ${getPrivacyNotice()}`
      : `Select a person to trace their relationship path. · Shift-click to compare two people. · Double-click for a family branch. · ${getPrivacyNotice()}`;
  }

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    const open = popover.hidden;
    if (open) onOpen();
    setOpen(open);
  });
  clearButton.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(false);
    applyPreset('full');
    trigger.focus();
  });
  popover.addEventListener('click', event => event.stopPropagation());
  presetButtons.forEach(button => {
    button.addEventListener('click', () => applyPreset(button.dataset.filterPreset));
  });
  [ancestorDepth, descendantDepth, partners, siblings, descendantPartners]
    .forEach(control => control.addEventListener('change', applyCustomFilter));

  return {
    applyPreset,
    close: () => setOpen(false),
    focus: () => trigger.focus(),
    isOpen: () => !popover.hidden,
    render
  };
}
