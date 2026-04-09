import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
