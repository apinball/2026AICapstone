/**
 * AI 서버 → 백엔드 callback 라우트.
 * 도커 내부 네트워크에서만 접근 가능 (외부 노출 없음).
 */

import { Router } from "express";
import {
  saveRuptureEvents,
  saveSummary,
  saveRedactedSegments,
  setJobStatus,
} from "../services/db.js";

const router = Router();

router.post("/rupture-callback", async (req, res) => {
  const { sessionId, events, error } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  if (error) {
    console.error(`[internal] Rupture failed for ${sessionId}: ${error}`);
    await setJobStatus(sessionId, "rupture", "error", error);
    return res.status(200).json({ ok: false, error });
  }
  try {
    await saveRuptureEvents(sessionId, events ?? []);
    await setJobStatus(sessionId, "rupture", "completed");
    console.log(`[internal] Saved ${events?.length ?? 0} rupture events for ${sessionId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[internal] Save failed: ${err.message}`);
    await setJobStatus(sessionId, "rupture", "error", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/summary-callback", async (req, res) => {
  const { sessionId, summary, error } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  if (error) {
    console.error(`[internal] Summary failed for ${sessionId}: ${error}`);
    await setJobStatus(sessionId, "summary", "error", error);
    return res.status(200).json({ ok: false, error });
  }
  try {
    await saveSummary(sessionId, summary);
    await setJobStatus(sessionId, "summary", "completed");
    console.log(`[internal] Saved summary for ${sessionId}`);
    res.json({ ok: true });
  } catch (err) {
    await setJobStatus(sessionId, "summary", "error", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/redaction-callback", async (req, res) => {
  const { sessionId, redacted, error } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  if (error) {
    console.error(`[internal] Redaction failed for ${sessionId}: ${error}`);
    await setJobStatus(sessionId, "redaction", "error", error);
    return res.status(200).json({ ok: false, error });
  }
  try {
    await saveRedactedSegments(sessionId, redacted ?? []);
    await setJobStatus(sessionId, "redaction", "completed");
    console.log(`[internal] Saved ${redacted?.length ?? 0} redacted segments for ${sessionId}`);
    res.json({ ok: true });
  } catch (err) {
    await setJobStatus(sessionId, "redaction", "error", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
