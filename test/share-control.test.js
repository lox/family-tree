import test from 'node:test';
import assert from 'node:assert/strict';

import { createShareControl } from '../src/share-control.js';

function control() {
  const element = new EventTarget();
  element.hidden = false;
  element.disabled = false;
  element.textContent = '';
  element.value = '';
  element.open = false;
  element.showModal = () => { element.open = true; };
  element.close = () => { element.open = false; };
  element.select = () => {};
  return element;
}

function fixture() {
  return {
    trigger: control(),
    dialog: control(),
    createButton: control(),
    closeButton: control(),
    status: control(),
    result: control(),
    urlInput: control(),
    copyButton: control()
  };
}

test('shows an existing link without uploading again', () => {
  const elements = fixture();
  const share = createShareControl({
    ...elements,
    getSource: () => ({ name: 'tree.ged' }),
    getUrl: () => 'https://example.test/t/existing',
    upload: async () => assert.fail('should not upload')
  });

  share.open();

  assert.equal(elements.dialog.open, true);
  assert.equal(elements.result.hidden, false);
  assert.equal(elements.createButton.hidden, true);
  assert.equal(elements.urlInput.value, 'https://example.test/t/existing');
});

test('does not associate an upload with a tree that changed while it was pending', async () => {
  const elements = fixture();
  const firstSource = { name: 'first.ged' };
  const secondSource = { name: 'second.ged' };
  let currentSource = firstSource;
  let finishUpload;
  const uploaded = new Promise(resolve => { finishUpload = resolve; });
  let sharedResult = null;
  const share = createShareControl({
    ...elements,
    getSource: () => currentSource,
    getUrl: () => '',
    upload: async () => uploaded,
    onShared: result => { sharedResult = result; }
  });

  const pending = share.createLink();
  currentSource = secondSource;
  finishUpload({ id: 'first', url: 'https://example.test/t/first' });
  await pending;

  assert.equal(sharedResult, null);
  assert.match(elements.status.textContent, /changed while the link was being created/i);
  assert.equal(elements.createButton.disabled, false);
});

test('prevents closing the dialog during an upload', async () => {
  const elements = fixture();
  let finishUpload;
  const uploaded = new Promise(resolve => { finishUpload = resolve; });
  const share = createShareControl({
    ...elements,
    getSource: () => ({ name: 'tree.ged' }),
    getUrl: () => '',
    upload: async () => uploaded
  });
  const pending = share.createLink();
  const cancel = new Event('cancel', { cancelable: true });

  elements.dialog.dispatchEvent(cancel);

  assert.equal(cancel.defaultPrevented, true);
  assert.equal(elements.closeButton.disabled, true);
  finishUpload({ id: 'tree', url: 'https://example.test/t/tree' });
  await pending;
});
