/**
 * 스토리지 서비스 — USE_LOCAL 환경변수로 자동 전환
 *   USE_LOCAL=true  → 로컬 파일시스템
 *   USE_LOCAL=false → AWS S3
 */

const useLocal = process.env.USE_LOCAL === "true";

const mod = useLocal
  ? await import("./storage.local.js")
  : await import("./s3.js");

export const uploadToS3 = mod.uploadToS3;
export const getPresignedUrl = mod.getPresignedUrl;
export const deleteFromS3 = mod.deleteFromS3;
