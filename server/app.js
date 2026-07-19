import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const TREE_ID_PATTERN = /^(?:[A-Za-z0-9_-]{32}|[a-z0-9]{16})$/;
const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

class RequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function json(response, statusCode, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers
  });
  response.end(body);
}

function sanitizeFilename(header) {
  let decoded = 'family-tree.ged';
  if (header) {
    try {
      decoded = decodeURIComponent(String(header));
    } catch {
      throw new RequestError(400, 'The uploaded filename is invalid.');
    }
  }
  const filename = decoded.split(/[\\/]/).at(-1).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (filename || 'family-tree.ged').slice(0, 255);
}

function validateGedcom(maxUploadBytes) {
  let bytes = 0;
  let prefix = '';
  return new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxUploadBytes) {
        callback(new RequestError(413, `GEDCOM uploads are limited to ${maxUploadBytes} bytes.`));
        return;
      }
      if (prefix.length < 8192) prefix += chunk.toString('utf8', 0, 8192 - prefix.length);
      callback(null, chunk);
    },
    flush(callback) {
      const normalized = prefix.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      const hasTopLevelRecord = /(?:^|\n)0\s+(?:HEAD|@[^@\n]+@\s+(?:INDI|FAM))(?:\s|$)/.test(normalized);
      if (!hasTopLevelRecord) {
        callback(new RequestError(
          422,
          'The upload does not contain a GEDCOM HEAD or individual record near the beginning.'
        ));
        return;
      }
      callback();
    }
  });
}

function contentType(path) {
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
  })[extname(path)] || 'application/octet-stream';
}

async function defaultReadStaticFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return null;
    throw error;
  }
}

function nodeReadable(body) {
  if (body && typeof body.pipe === 'function') return body;
  if (body && typeof body.getReader === 'function') return Readable.fromWeb(body);
  return Readable.from(body || []);
}

function createUploadRateLimiter({ limit, windowMs, now = Date.now }) {
  const clients = new Map();
  return {
    consume(clientId) {
      const timestamp = now();
      const current = clients.get(clientId);
      if (!current || current.resetAt <= timestamp) {
        clients.set(clientId, { count: 1, resetAt: timestamp + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - timestamp) / 1000))
        };
      }
      current.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }
  };
}

function clientId(request) {
  const flyClientIp = request.headers['fly-client-ip'];
  return String(Array.isArray(flyClientIp) ? flyClientIp[0] : flyClientIp || request.socket.remoteAddress);
}

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw new RequestError(400, 'The request path is invalid.');
  }
}

export function generateTreeId(randomBytesImpl = randomBytes) {
  const bytes = randomBytesImpl(10);
  if (!Buffer.isBuffer(bytes) || bytes.length !== 10) {
    throw new Error('The random byte generator returned an invalid value.');
  }
  return BigInt(`0x${bytes.toString('hex') || '0'}`)
    .toString(36)
    .padStart(16, '0');
}

export function createFamilyTreeServer({
  storage,
  distDir = resolve('dist'),
  generateId = generateTreeId,
  maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES,
  uploadRateLimit = 5,
  uploadRateWindowMs = 60 * 60 * 1000,
  readStaticFile = defaultReadStaticFile,
  logger = console
}) {
  if (!storage) throw new Error('A tree storage adapter is required.');
  const uploadRateLimiter = createUploadRateLimiter({
    limit: uploadRateLimit,
    windowMs: uploadRateWindowMs
  });

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');

      if (url.pathname === '/api/trees') {
        if (request.method !== 'POST') {
          json(response, 405, { error: 'Method not allowed.' });
          return;
        }
        const rateLimit = uploadRateLimiter.consume(clientId(request));
        if (!rateLimit.allowed) {
          json(response, 429, { error: 'Too many uploads. Try again later.' }, {
            'retry-after': String(rateLimit.retryAfterSeconds)
          });
          return;
        }
        const declaredLength = Number(request.headers['content-length'] || 0);
        if (declaredLength > maxUploadBytes) {
          json(response, 413, { error: `GEDCOM uploads are limited to ${maxUploadBytes} bytes.` });
          return;
        }
        const id = generateId();
        if (!TREE_ID_PATTERN.test(id)) throw new Error('The tree ID generator returned an invalid ID.');
        const filename = sanitizeFilename(request.headers['x-filename']);
        const compressedBody = new PassThrough();
        const upload = storage.putTree({
          id,
          filename,
          body: compressedBody
        });
        upload.catch(error => compressedBody.destroy(error));
        await Promise.all([
          pipeline(request, validateGedcom(maxUploadBytes), createGzip(), compressedBody),
          upload
        ]);
        json(response, 201, { id, url: `/t/${id}` });
        return;
      }

      if (url.pathname.startsWith('/api/trees/')) {
        if (request.method !== 'GET') {
          json(response, 405, { error: 'Method not allowed.' });
          return;
        }
        const id = url.pathname.slice('/api/trees/'.length);
        if (!TREE_ID_PATTERN.test(id)) {
          json(response, 400, { error: 'The shared tree ID is invalid.' });
          return;
        }
        const tree = await storage.getTree(id);
        if (!tree) {
          json(response, 404, { error: 'This shared tree could not be found.' });
          return;
        }
        response.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'content-encoding': tree.contentEncoding || 'gzip',
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
          'x-tree-filename': encodeURIComponent(tree.filename || 'shared-tree.ged')
        });
        await pipeline(nodeReadable(tree.body), response);
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end();
        return;
      }
      const treeRouteId = url.pathname.match(/^\/t\/([^/]+)\/?$/)?.[1] || '';
      const isTreeRoute = TREE_ID_PATTERN.test(treeRouteId);
      const requestedPath = isTreeRoute || url.pathname === '/'
        ? resolve(distDir, 'index.html')
        : resolve(distDir, `.${decodePathname(url.pathname)}`);
      const distPrefix = `${resolve(distDir)}${sep}`;
      if (requestedPath !== resolve(distDir) && !requestedPath.startsWith(distPrefix)) {
        response.writeHead(400).end();
        return;
      }
      const file = await readStaticFile(requestedPath);
      if (!file) {
        response.writeHead(404).end('Not found');
        return;
      }
      const size = Buffer.isBuffer(file) ? file.length : undefined;
      response.writeHead(200, {
        'content-type': contentType(requestedPath),
        'cache-control': url.pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
        ...(size === undefined ? {} : { 'content-length': size })
      });
      if (request.method === 'HEAD') response.end();
      else if (Buffer.isBuffer(file)) response.end(file);
      else await pipeline(file, response);
    } catch (error) {
      if (!response.headersSent) {
        const statusCode = error.statusCode || 500;
        const message = statusCode === 500 ? 'The server could not complete the request.' : error.message;
        json(response, statusCode, { error: message });
      } else {
        response.destroy(error);
      }
      if (!error.statusCode) logger.error('Request failed.', error);
    }
  });
}
