import { proposeConversationEdit } from './conversation-editor.js';
import { previewTreeTransaction } from './tree-operations.js';

const requiredElement = (root, selector) => {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Editing control requires ${selector}`);
  return element;
};

export function createEditingControl({ root, getDocument, getPersonId, getPerson, onCommit }) {
  const trigger = requiredElement(root, '#edit-trigger');
  const dialog = requiredElement(root, '#edit-dialog');
  const form = requiredElement(root, '#edit-form');
  const context = requiredElement(root, '#edit-context');
  const input = requiredElement(root, '#edit-input');
  const status = requiredElement(root, '#edit-status');
  const previewElement = requiredElement(root, '#edit-preview');
  const closeButton = requiredElement(root, '#edit-close');
  const undoButton = requiredElement(root, '#edit-undo');
  const reviewButton = requiredElement(root, '#edit-review');
  const applyButton = requiredElement(root, '#edit-apply');
  let pending = null;
  let undo = null;

  function resetProposal() {
    pending = null;
    status.textContent = '';
    previewElement.textContent = '';
    previewElement.hidden = true;
    applyButton.hidden = true;
    reviewButton.hidden = false;
  }

  function open() {
    resetProposal();
    const person = getPerson();
    context.textContent = person
      ? `Describe a change to ${person.name}. Nothing changes until you review and apply it.`
      : 'Select a person in the tree, then describe what should change.';
    input.value = '';
    input.disabled = !person;
    reviewButton.disabled = !person;
    undoButton.hidden = !undo;
    dialog.showModal();
    if (person) input.focus();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    resetProposal();
    const proposal = proposeConversationEdit(getDocument(), {
      personId: getPersonId(),
      input: input.value
    });
    if (proposal.status !== 'ready') {
      status.textContent = proposal.message;
      return;
    }
    try {
      const preview = previewTreeTransaction(getDocument(), proposal.transaction);
      pending = proposal.transaction;
      previewElement.textContent = `${proposal.message} ${preview.summary.join(' ')}`;
      previewElement.hidden = false;
      applyButton.hidden = false;
      reviewButton.hidden = true;
    } catch (error) {
      status.textContent = `That change cannot be applied: ${error.message}`;
    }
  });

  applyButton.addEventListener('click', async () => {
    if (!pending) return;
    try {
      const applied = await onCommit({
        ...pending,
        provenance: { ...pending.provenance, approvedBy: 'user' }
      });
      undo = applied.inverse;
      status.textContent = `Applied. ${applied.summary.join(' ')}${applied.persisted ? '' : ' This browser could not save the change for the next visit.'}`;
      pending = null;
      previewElement.hidden = true;
      applyButton.hidden = true;
      reviewButton.hidden = false;
      undoButton.hidden = false;
    } catch (error) {
      status.textContent = `The change was not applied: ${error.message}`;
    }
  });

  undoButton.addEventListener('click', async () => {
    if (!undo) return;
    try {
      const applied = await onCommit(undo);
      undo = null;
      resetProposal();
      undoButton.hidden = true;
      status.textContent = `Undone. ${applied.summary.join(' ')}${applied.persisted ? '' : ' This browser could not save the updated tree.'}`;
    } catch (error) {
      status.textContent = `The change could not be undone: ${error.message}`;
    }
  });

  trigger.addEventListener('click', open);
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', resetProposal);
  input.addEventListener('input', resetProposal);

  return {
    clearUndo() {
      undo = null;
      undoButton.hidden = true;
    },
    isOpen: () => dialog.open,
    open
  };
}
