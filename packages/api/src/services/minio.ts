import * as Minio from "minio";

let client: Minio.Client | null = null;

function getClient(): Minio.Client {
  if (!client) {
    client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
      port: Number(process.env.MINIO_PORT ?? 9100),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    });
  }
  return client;
}

function getBucket(): string {
  return process.env.MINIO_BUCKET ?? "family-chat";
}

export async function ensureBucket(): Promise<void> {
  const mc = getClient();
  const bucket = getBucket();
  const exists = await mc.bucketExists(bucket);
  if (!exists) {
    await mc.makeBucket(bucket);
  }
}

export async function uploadObject(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const mc = getClient();
  await mc.putObject(getBucket(), key, buffer, buffer.length, { "Content-Type": contentType });
}

export async function downloadObject(key: string): Promise<Buffer> {
  const mc = getClient();
  const stream = await mc.getObject(getBucket(), key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteObject(key: string): Promise<void> {
  const mc = getClient();
  await mc.removeObject(getBucket(), key);
}

export async function deleteByPrefix(prefix: string): Promise<void> {
  const mc = getClient();
  const bucket = getBucket();
  const objects = mc.listObjects(bucket, prefix, true);
  const toDelete: string[] = [];
  for await (const obj of objects) {
    toDelete.push(obj.name);
  }
  if (toDelete.length > 0) {
    await mc.removeObjects(bucket, toDelete);
  }
}

export async function clearAllObjects(): Promise<void> {
  const mc = getClient();
  const bucket = getBucket();
  const exists = await mc.bucketExists(bucket);
  if (!exists) return;
  const objects = mc.listObjects(bucket, "", true);
  const toDelete: string[] = [];
  for await (const obj of objects) {
    toDelete.push(obj.name);
  }
  if (toDelete.length > 0) {
    await mc.removeObjects(bucket, toDelete);
  }
}

export async function minioPing(): Promise<boolean> {
  try {
    const mc = getClient();
    await mc.bucketExists(getBucket());
    return true;
  } catch {
    return false;
  }
}
