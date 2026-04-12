/**
 * S3 로컬 대체 — 파일시스템에 저장
 * USE_LOCAL=true 일 때 사용
 */

import fs from "fs/promises";
import path from "path";

const STORAGE_DIR = path.resolve("local-storage");

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function fullPath(key) {
  return path.join(STORAGE_DIR, key);
}

export async function uploadToS3(key, body, _contentType) {
  const fp = fullPath(key);
  await ensureDir(fp);
  await fs.writeFile(fp, body);
}

export async function getPresignedUrl(key) {
  // 로컬에서는 Express 정적 경로로 대체
  return `/local-storage/${key}`;
}

export async function deleteFromS3(key) {
  try {
    await fs.unlink(fullPath(key));
  } catch {
    // 파일 없으면 무시
  }
}
