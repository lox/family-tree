import { once } from 'node:events';

import { createServer as createViteServer } from 'vite';

import { createFamilyTreeServer } from '../server/app.js';
import { createMemoryTreeStorage } from '../server/memory-tree-storage.js';

const apiServer = createFamilyTreeServer({ storage: createMemoryTreeStorage() });
apiServer.listen(0, '127.0.0.1');
await once(apiServer, 'listening');
const apiAddress = apiServer.address();

const vite = await createViteServer({
  server: {
    host: '127.0.0.1',
    port: 4173,
    proxy: { '/api': `http://127.0.0.1:${apiAddress.port}` }
  }
});
await vite.listen();
vite.printUrls();

async function stop() {
  await vite.close();
  apiServer.close();
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
