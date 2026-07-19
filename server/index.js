import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFamilyTreeServer } from './app.js';
import { createTigrisTreeStorage } from './tigris-tree-storage.js';

const serverDirectory = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const server = createFamilyTreeServer({
  storage: createTigrisTreeStorage(),
  distDir: resolve(serverDirectory, '../dist')
});
server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 15 * 60 * 1000);
server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 60 * 1000);

server.listen(port, '0.0.0.0', () => {
  console.log(`Family Tree listening on port ${port}.`);
});
