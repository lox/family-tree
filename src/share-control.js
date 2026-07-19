import { shareTree } from './shared-tree.js';

function element(options, key, selector) {
  const value = options[key] ?? options.root?.querySelector(selector);
  if (!value) throw new Error(`Share control requires ${selector}`);
  return value;
}

export function createShareControl(options) {
  const trigger = element(options, 'trigger', '#share-trigger');
  const dialog = element(options, 'dialog', '#share-dialog');
  const createButton = element(options, 'createButton', '#share-create');
  const closeButton = element(options, 'closeButton', '#share-close');
  const status = element(options, 'status', '#share-status');
  const result = element(options, 'result', '#share-result');
  const urlInput = element(options, 'urlInput', '#share-url');
  const copyButton = element(options, 'copyButton', '#share-copy');
  const getSource = options.getSource;
  const getUrl = options.getUrl;
  const upload = options.upload ?? shareTree;
  const onShared = options.onShared ?? (() => {});
  const clipboard = options.clipboard ?? globalThis.navigator?.clipboard;
  let uploading = false;

  function reset() {
    const url = getUrl();
    status.textContent = '';
    result.hidden = !url;
    urlInput.value = url;
    createButton.hidden = Boolean(url);
    createButton.disabled = false;
    createButton.textContent = 'Create public link';
    closeButton.disabled = false;
    copyButton.textContent = 'Copy';
  }

  function open() {
    if (!getSource()) return;
    reset();
    dialog.showModal();
  }

  async function createLink() {
    const source = getSource();
    if (!source || uploading) return;
    uploading = true;
    createButton.disabled = true;
    closeButton.disabled = true;
    createButton.textContent = 'Uploading…';
    status.textContent = '';
    try {
      const uploaded = await upload(source);
      if (source !== getSource()) {
        status.textContent = 'The tree changed while the link was being created. Try sharing again.';
        createButton.disabled = false;
        createButton.textContent = 'Try again';
        return;
      }
      onShared(uploaded);
      urlInput.value = uploaded.url;
      result.hidden = false;
      createButton.hidden = true;
    } catch (error) {
      status.textContent = error.message;
      createButton.disabled = false;
      createButton.textContent = 'Try again';
    } finally {
      uploading = false;
      closeButton.disabled = false;
    }
  }

  async function copy() {
    try {
      await clipboard.writeText(urlInput.value);
      copyButton.textContent = 'Copied';
    } catch {
      urlInput.select();
      status.textContent = 'Copy the selected link.';
    }
  }

  trigger.addEventListener('click', open);
  closeButton.addEventListener('click', () => {
    if (!uploading) dialog.close();
  });
  createButton.addEventListener('click', createLink);
  copyButton.addEventListener('click', copy);
  dialog.addEventListener('cancel', event => {
    if (uploading) event.preventDefault();
  });

  return {
    createLink,
    isOpen: () => dialog.open,
    open
  };
}
