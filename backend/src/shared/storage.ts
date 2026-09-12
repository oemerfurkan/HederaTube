import { GetObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { env } from "./env.js";

export type ObjectRange = { start: number; end?: number };
export type ObjectStream = {
  body: Readable;
  contentLength?: number;
  contentRange?: string;
  contentType?: string;
  status: 200 | 206;
};

export interface ObjectStorage {
  getObject(key: string, range?: ObjectRange): Promise<ObjectStream>;
  getBuffer(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer | Readable, contentType?: string): Promise<void>;
  putStream(key: string, body: Readable, contentType?: string): Promise<void>;
  /** Absolute presigned PUT url, or undefined when the driver cannot presign (fs). */
  presignPut(key: string, expiresInSeconds?: number): Promise<string | undefined>;
  ensureCors?(): Promise<void>;
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/** Garage / any S3-compatible store (production). */
/**
 * S3-compatible stores (Garage, MinIO) do not report checksums the way AWS does for multipart
 * objects. With the SDK's default "WHEN_SUPPORTED" integrity checks, reading back a file that was
 * uploaded in parts fails with "Checksum mismatch" even though the bytes are intact.
 */
const compatibleChecksums = { requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" } as const;

export function createS3Storage(): ObjectStorage {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    ...compatibleChecksums,
  });
  const publicClient = env.S3_PUBLIC_ENDPOINT
    ? new S3Client({
        endpoint: env.S3_PUBLIC_ENDPOINT,
        region: env.S3_REGION,
        forcePathStyle: true,
        credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
        ...compatibleChecksums,
      })
    : client;
  const Bucket = env.S3_BUCKET;
  return {
    async getObject(key, range) {
      const res = await client.send(
        new GetObjectCommand({
          Bucket,
          Key: key,
          ...(range ? { Range: `bytes=${range.start}-${range.end ?? ""}` } : {}),
        }),
      );
      return {
        body: res.Body as Readable,
        contentLength: res.ContentLength,
        contentRange: res.ContentRange,
        contentType: res.ContentType,
        status: res.ContentRange ? 206 : 200,
      };
    },
    async getBuffer(key) {
      const { body } = await this.getObject(key);
      return streamToBuffer(body);
    },
    async putObject(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async putStream(key, body, contentType) {
      await new Upload({ client, params: { Bucket, Key: key, Body: body, ContentType: contentType } }).done();
    },
    presignPut(key, expiresIn = 3600) {
      return getSignedUrl(publicClient, new PutObjectCommand({ Bucket, Key: key }), { expiresIn });
    },
    async ensureCors() {
      await client.send(
        new PutBucketCorsCommand({
          Bucket,
          CORSConfiguration: {
            CORSRules: [{ AllowedOrigins: [env.PUBLIC_BASE_URL], AllowedMethods: ["PUT", "GET"], AllowedHeaders: ["*"], MaxAgeSeconds: 3600 }],
          },
        }),
      );
    },
  };
}

/** Local directory (development without Garage). */
export function createFsStorage(root = env.STORAGE_FS_DIR): ObjectStorage {
  const resolve = (key: string) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(`invalid key ${key}`);
    return full;
  };
  return {
    async getObject(key, range) {
      const file = resolve(key);
      const info = await stat(file);
      if (range) {
        const end = Math.min(range.end ?? info.size - 1, info.size - 1);
        return {
          body: createReadStream(file, { start: range.start, end }),
          contentLength: end - range.start + 1,
          contentRange: `bytes ${range.start}-${end}/${info.size}`,
          status: 206,
        };
      }
      return { body: createReadStream(file), contentLength: info.size, status: 200 };
    },
    async getBuffer(key) {
      const { body } = await this.getObject(key);
      return streamToBuffer(body);
    },
    async putObject(key, body) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      if (Buffer.isBuffer(body)) {
        await writeFile(file, body);
      } else {
        await pipeline(body, createWriteStream(file));
      }
    },
    async putStream(key, body) {
      return this.putObject(key, body);
    },
    async presignPut() {
      return undefined;
    },
  };
}

export const storage: ObjectStorage = env.STORAGE_DRIVER === "s3" ? createS3Storage() : createFsStorage();

export const objectKeys = {
  segment: (videoId: string, index: number) => `videos/${videoId}/seg-${String(index).padStart(4, "0")}.ts`,
  thumbnail: (videoId: string) => `videos/${videoId}/thumb.jpg`,
  avatar: (creatorId: string, version: number, ext: string) => `avatars/${creatorId}/${version}.${ext}`,
  source: (videoId: string, name: string) => `uploads/${videoId}/${name.replace(/[^\w.\-]+/g, "_")}`,
};
