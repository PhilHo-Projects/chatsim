import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type PresignedUpload = {
  expiresAt: Date;
  headers: Record<string, string>;
  method: "PUT";
  url: string;
};

export type ObjectHead = {
  contentLength: number;
  contentType: string;
};

export interface ObjectStorage {
  presignOriginalPut(
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<PresignedUpload>;
  headOriginal(key: string): Promise<ObjectHead | null>;
  getOriginal(key: string, maxBytes: number): Promise<Buffer>;
  copyOriginal(sourceKey: string, destinationKey: string): Promise<void>;
  putVariant(
    key: string,
    body: Buffer,
    input: { cacheControl: string; contentType: string }
  ): Promise<void>;
  deleteOriginals(keys: string[]): Promise<void>;
  deleteVariants(keys: string[]): Promise<void>;
}

type R2ObjectStorageOptions = {
  accountId: string;
  originals: {
    accessKeyId: string;
    bucket: string;
    secretAccessKey: string;
  };
  variants: {
    accessKeyId: string;
    bucket: string;
    secretAccessKey: string;
  };
};

export class R2ObjectStorage implements ObjectStorage {
  private readonly originalsClient: S3Client;
  private readonly variantsClient: S3Client;

  constructor(private readonly options: R2ObjectStorageOptions) {
    const endpoint = `https://${options.accountId}.r2.cloudflarestorage.com`;
    this.originalsClient = new S3Client({
      credentials: {
        accessKeyId: options.originals.accessKeyId,
        secretAccessKey: options.originals.secretAccessKey
      },
      endpoint,
      region: "auto"
    });
    this.variantsClient = new S3Client({
      credentials: {
        accessKeyId: options.variants.accessKeyId,
        secretAccessKey: options.variants.secretAccessKey
      },
      endpoint,
      region: "auto"
    });
  }

  async presignOriginalPut(
    key: string,
    contentType: string,
    expiresInSeconds: number
  ) {
    const url = await getSignedUrl(
      this.originalsClient,
      new PutObjectCommand({
        Bucket: this.options.originals.bucket,
        ContentType: contentType,
        Key: key
      }),
      { expiresIn: expiresInSeconds }
    );

    return {
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      headers: { "Content-Type": contentType },
      method: "PUT" as const,
      url
    };
  }

  async headOriginal(key: string) {
    try {
      const result = await this.originalsClient.send(
        new HeadObjectCommand({
          Bucket: this.options.originals.bucket,
          Key: key
        })
      );

      return {
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType ?? ""
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "$metadata" in error &&
        (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
      ) {
        return null;
      }

      throw error;
    }
  }

  async getOriginal(key: string, maxBytes: number) {
    const result = await this.originalsClient.send(
      new GetObjectCommand({
        Bucket: this.options.originals.bucket,
        Key: key
      })
    );

    if (!result.Body) {
      throw new Error("R2 returned an empty object body.");
    }

    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      const buffer = Buffer.from(chunk);
      size += buffer.byteLength;

      if (size > maxBytes) {
        throw new Error("R2 object exceeded the bounded download limit.");
      }

      chunks.push(buffer);
    }

    return Buffer.concat(chunks, size);
  }

  async copyOriginal(sourceKey: string, destinationKey: string) {
    await this.originalsClient.send(
      new CopyObjectCommand({
        Bucket: this.options.originals.bucket,
        CopySource: `${this.options.originals.bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, "/")}`,
        Key: destinationKey,
        MetadataDirective: "COPY"
      })
    );
  }

  async putVariant(
    key: string,
    body: Buffer,
    input: { cacheControl: string; contentType: string }
  ) {
    await this.variantsClient.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.options.variants.bucket,
        CacheControl: input.cacheControl,
        ContentType: input.contentType,
        Key: key
      })
    );
  }

  async deleteOriginals(keys: string[]) {
    await this.deleteObjects(
      this.originalsClient,
      this.options.originals.bucket,
      keys
    );
  }

  async deleteVariants(keys: string[]) {
    await this.deleteObjects(
      this.variantsClient,
      this.options.variants.bucket,
      keys
    );
  }

  private async deleteObjects(client: S3Client, bucket: string, keys: string[]) {
    if (keys.length === 0) {
      return;
    }

    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: [...new Set(keys)].map((Key) => ({ Key })),
          Quiet: true
        }
      })
    );
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function createR2ObjectStorageFromEnvironment() {
  return new R2ObjectStorage({
    accountId: requiredEnvironment("R2_ACCOUNT_ID"),
    originals: {
      accessKeyId: requiredEnvironment("R2_ORIGINALS_ACCESS_KEY_ID"),
      bucket: requiredEnvironment("R2_ORIGINALS_BUCKET"),
      secretAccessKey: requiredEnvironment("R2_ORIGINALS_SECRET_ACCESS_KEY")
    },
    variants: {
      accessKeyId: requiredEnvironment("R2_VARIANTS_ACCESS_KEY_ID"),
      bucket: requiredEnvironment("R2_VARIANTS_BUCKET"),
      secretAccessKey: requiredEnvironment("R2_VARIANTS_SECRET_ACCESS_KEY")
    }
  });
}
