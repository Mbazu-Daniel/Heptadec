import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const PRESIGNED_TTL_SECONDS = 900;

export interface IUploadTarget {
  readonly bucket: string;
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  readonly key: string;
  readonly contentType: string;
}

export interface IPresignedUpload {
  readonly url: string;
  readonly headers: Record<string, string>;
}

export async function presignUpload(target: IUploadTarget): Promise<IPresignedUpload> {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${target.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: target.accessKeyId,
      secretAccessKey: target.secretAccessKey,
      sessionToken: target.sessionToken,
    },
  });

  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: target.bucket,
      Key: target.key,
      ContentType: target.contentType,
      ACL: "public-read",
    }),
    {
      expiresIn: PRESIGNED_TTL_SECONDS,
      signableHeaders: new Set(["host", "content-type"]),
    },
  );

  return { url, headers: { "content-type": target.contentType } };
}