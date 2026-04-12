/**
 * POST /upload
 * 1. 오디오 파일을 S3 에 업로드
 * 2. AI 서버에 분석 요청 (비동기 트리거)
 * 3. 분석 결과를 DynamoDB에 저장
 */

import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

import { uploadToS3 } from "../services/storage.js";
import { triggerAnalysis } from "../services/aiClient.js";
import { saveSession } from "../services/db.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.post("/", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  const sessionId = uuidv4();
  const s3Key = `sessions/${sessionId}/${req.file.originalname}`;

  try {
    // 1. S3 업로드
    await uploadToS3(s3Key, req.file.buffer, req.file.mimetype);
    console.log(`[upload] S3 uploaded: ${s3Key}`);

    // 2. DynamoDB에 pending 상태로 초기 저장
    await saveSession({
      sessionId,
      s3Key,
      status: "pending",
      createdAt: new Date().toISOString(),
      fileName: req.file.originalname,
    });

    // 3. AI 분석 비동기 트리거 (응답을 기다리지 않음)
    triggerAnalysis(sessionId, req.file.buffer, req.file.originalname).catch((err) =>
      console.error(`[upload] Analysis trigger failed: ${err.message}`)
    );

    res.status(202).json({ sessionId, status: "pending" });
  } catch (err) {
    console.error("[upload] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
