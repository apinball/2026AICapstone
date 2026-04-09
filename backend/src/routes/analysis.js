/**
 * GET /sessions/:sessionId        — 세션 분석 결과 조회
 * GET /sessions                   — 전체 세션 목록 조회
 */

import { Router } from "express";
import { getSession, listSessions } from "../services/dynamodb.js";

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

export default router;
