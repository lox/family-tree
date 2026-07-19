import { Readable } from 'node:stream';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gunzipAsync = promisify(gunzip);

async function readBody(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function createMemoryTreeStorage() {
  const trees = new Map();
  return {
    get size() {
      return trees.size;
    },
    async putTree({ id, filename, body }) {
      const compressed = await readBody(body);
      trees.set(id, { compressed, filename });
    },
    async getTree(id) {
      const tree = trees.get(id);
      if (!tree) return null;
      return {
        body: Readable.from(tree.compressed),
        contentEncoding: 'gzip',
        filename: tree.filename
      };
    },
    async readTreeText(id) {
      const tree = trees.get(id);
      return tree ? (await gunzipAsync(tree.compressed)).toString('utf8') : null;
    }
  };
}
