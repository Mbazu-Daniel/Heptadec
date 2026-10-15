import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** R2 accepts a presigned PUT for up to seven days. An upload is immediate. */
export const PRESIGNED_TTL_SECONDS = 900;

export interface IUploadTarget {
  readonly bucket: string;
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /**
   * Set only for temporary credentials. Passed through to the SDK, which signs
   * the token the way S3 expects rather than leaving it to us.
   */
  readonly sessionToken?: string;
  readonly key: string;
  readonly contentType: string;
}

export interface IPresignedUpload {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/**
 * A URL the browser can PUT the file to, valid for PRESIGNED_TTL_SECONDS.
 *
 * The client sends only metadata; the file's bytes go from the browser straight
 * to the bucket, so a Worker never holds an upload.
 *
 * `content-type` is in the signature rather than passed along on trust, so a
 * body that is not the image this call approved cannot land under the key with a
 * media type nobody checked.
 */
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
      // Avatars and logos are shown to whoever can see the page anyway. Public
      // is what lets the browser load them from the bucket directly rather than
      // through a Worker invocation per image.
      ACL: "public-read",
    }),
    {
      expiresIn: PRESIGNED_TTL_SECONDS,
      signableHeaders: new Set(["host", "content-type"]),
    },
  );

  return { url, headers: { "content-type": target.contentType } };
}