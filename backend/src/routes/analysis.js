/**
 * GET    /sessions                     — 전체 세션 목록
 * GET    /sessions/:sessionId          — 세션 결과 (segments + ruptureEvents 포함)
 * GET    /sessions/:sessionId/audio    — 오디오 presigned URL 리다이렉트
 * POST   /sessions/:sessionId/rupture  — Rupture 감지 수동 트리거 / 재실행
 * DELETE /sessions/:sessionId          — 세션 삭제
 */

import { Router } from "express";
import { getSession, listSessions, deleteSession } from "../services/db.js";
import { getPresignedUrl, deleteFromS3 } from "../services/storage.js";
import { runRuptureDetection } from "../services/aiClient.js";
import { isLLMConfigured, providerName } from "../services/llmClient.js";

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

router.post("/:sessionId/rupture", async (req, res) => {
  try {
    if (!isLLMConfigured()) {
      return res.status(503).json({
        error: `LLM not configured (${providerName === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"} missing)`,
      });
    }
    const session = await getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    const segments = session.analysisResult?.segments;
    if (!segments?.length) {
      return res.status(400).json({ error: "Session has no segments to analyze" });
    }
    const events = await runRuptureDetection(req.params.sessionId, segments);
    res.json({ count: events.length, events });
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
