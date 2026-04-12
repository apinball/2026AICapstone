import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-northeast-2" });
const BUCKET = process.env.S3_BUCKET_NAME || "capstone-audio-bucket";

/**
 * @param {string} key        - S3 오브젝트 키
 * @param {Buffer} body       - 파일 버퍼
 * @param {string} contentType
 */
export async function uploadToS3(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * S3 오브젝트의 presigned URL 생성 (15분 유효)
 * @param {string} key
 * @returns {Promise<string>}
 */
export async function getPresignedUrl(key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 900 });
}

/**
 * S3 오브젝트 삭제
 * @param {string} key
 */
export async function deleteFromS3(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
