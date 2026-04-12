/**
 * GET    /sessions                   — 전체 세션 목록 조회
 * GET    /sessions/:sessionId        — 세션 분석 결과 조회
 * GET    /sessions/:sessionId/audio  — 오디오 presigned URL 리다이렉트
 * DELETE /sessions/:sessionId        — 세션 삭제 (S3 + DynamoDB)
 */

import { Router } from "express";
import { getSession, listSessions, deleteSession } from "../services/dynamodb.js";
import { getPresignedUrl, deleteFromS3 } from "../services/s3.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const sessions = await listSessions();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:sessionId", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:sessionId/audio", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    const url = await getPresignedUrl(session.s3Key);
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:sessionId", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    await deleteFromS3(session.s3Key);
    await deleteSession(req.params.sessionId);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
