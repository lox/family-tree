const SHARED_TREE_ID_PATTERN = /^(?:[A-Za-z0-9_-]{32}|[a-z0-9]{16})$/;

export function sharedTreeIdFromPathname(pathname) {
  const match = String(pathname).match(/^\/t\/([^/]+)\/?$/);
  return match && SHARED_TREE_ID_PATTERN.test(match[1]) ? match[1] : '';
}

async function responseError(response, fallback) {
  try {
    const body = await response.json();
    if (typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // The server may return an empty or non-JSON error response.
  }
  return fallback;
}

export async function shareTree(file, {
  fetchImpl = globalThis.fetch,
  origin = globalThis.location?.origin ?? ''
} = {}) {
  const response = await fetchImpl('/api/trees', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Filename': encodeURIComponent(file.name || 'family-tree.ged')
    },
    body: file
  });
  if (!response.ok) {
    throw new Error(await responseError(response, 'The tree could not be shared.'));
  }
  const result = await response.json();
  return {
    id: result.id,
    url: new URL(result.url, origin || 'http://localhost').toString()
  };
}

export async function loadSharedTree(id, { fetchImpl = globalThis.fetch } = {}) {
  if (!SHARED_TREE_ID_PATTERN.test(id)) throw new Error('The shared tree link is invalid.');
  const response = await fetchImpl(`/api/trees/${id}`);
  if (!response.ok) {
    const fallback = response.status === 404
      ? 'This shared tree could not be found.'
      : 'This shared tree could not be loaded.';
    throw new Error(await responseError(response, fallback));
  }
  const encodedFilename = response.headers.get('x-tree-filename') || 'shared-tree.ged';
  let filename = 'shared-tree.ged';
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    // Use the safe fallback for malformed metadata.
  }
  return { filename, text: await response.text() };
}
