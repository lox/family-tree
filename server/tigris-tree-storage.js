import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const FILENAME_METADATA_LIMIT = 1024;

export function encodeFilenameMetadata(filename) {
  const value = String(filename || 'shared-tree.ged');
  const extension = value.toLocaleLowerCase().endsWith('.ged') ? value.slice(-4) : '';
  const stem = extension ? value.slice(0, -4) : value;
  const characters = [...stem];
  let candidate = value;
  let encoded = Buffer.from(candidate, 'utf8').toString('base64');
  while (Buffer.byteLength(encoded, 'ascii') > FILENAME_METADATA_LIMIT && characters.length) {
    characters.pop();
    candidate = `${characters.join('')}${extension}`;
    encoded = Buffer.from(candidate, 'utf8').toString('base64');
  }
  return encoded;
}

export function decodeFilenameMetadata(value) {
  if (!value) return 'shared-tree.ged';
  try {
    return Buffer.from(value, 'base64').toString('utf8') || 'shared-tree.ged';
  } catch {
    return 'shared-tree.ged';
  }
}

export function createTigrisTreeStorage({
  bucket = process.env.BUCKET_NAME,
  client = new S3Client({ region: process.env.AWS_REGION || 'auto' }),
  createUpload = options => new Upload(options)
} = {}) {
  if (!bucket) throw new Error('BUCKET_NAME must be set before starting the server.');

  return {
    async putTree({ id, filename, body }) {
      const upload = createUpload({
        client,
        queueSize: 1,
        leavePartsOnError: false,
        params: {
          Bucket: bucket,
          Key: `trees/${id}.ged.gz`,
          Body: body,
          ContentType: 'text/plain; charset=utf-8',
          ContentEncoding: 'gzip',
          CacheControl: 'private, no-store',
          Metadata: {
            filename64: encodeFilenameMetadata(filename),
            uploadedAt: new Date().toISOString()
          }
        }
      });
      await upload.done();
    },

    async getTree(id) {
      try {
        const object = await client.send(new GetObjectCommand({
          Bucket: bucket,
          Key: `trees/${id}.ged.gz`
        }));
        return {
          body: object.Body,
          contentEncoding: object.ContentEncoding || 'gzip',
          filename: object.Metadata?.filename64
            ? decodeFilenameMetadata(object.Metadata.filename64)
            : decodeLegacyFilenameMetadata(object.Metadata?.filename)
        };
      } catch (error) {
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    }
  };
}

function decodeLegacyFilenameMetadata(value) {
  if (!value) return 'shared-tree.ged';
  try {
    return decodeURIComponent(value);
  } catch {
    return 'shared-tree.ged';
  }
}
