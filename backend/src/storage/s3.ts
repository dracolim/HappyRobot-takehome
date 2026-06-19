import { S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketCorsCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export const BUCKET = process.env.MINIO_BUCKET ?? "attachments"

const credentials = {
  accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
}

// Internal client — used for GetObject, DeleteObject, bucket management
export const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  credentials,
  forcePathStyle: true,
})

// Public client — used only for generating presigned URLs the browser will call directly.
// MINIO_PUBLIC_URL is the hostname the browser can reach:
//   local dev  → http://localhost:9000   (Docker exposes MinIO on this port)
//   production → https://<id>.r2.cloudflarestorage.com  (same as MINIO_ENDPOINT on R2)
const s3Public = new S3Client({
  endpoint: process.env.MINIO_PUBLIC_URL ?? process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  credentials,
  forcePathStyle: true,
})

export async function createPresignedPutUrl(objectKey: string, mimeType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, ContentType: mimeType })
  return getSignedUrl(s3Public, command, { expiresIn: 900 }) // 15 minutes
}

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
    console.log(`[s3] Created bucket: ${BUCKET}`)
  }

  // Allow browser to PUT directly via presigned URL.
  // R2 doesn't support this API — configure CORS in the Cloudflare dashboard instead.
  await s3.send(new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [{
        AllowedHeaders: ["*"],
        AllowedMethods: ["PUT"],
        AllowedOrigins: [process.env.FRONTEND_URL ?? "http://localhost:3000"],
        MaxAgeSeconds: 3000,
      }],
    },
  })).catch(() => {})
}
