/**
 * GET    /sessions                     — 전체 세션 목록
 * GET    /sessions/:sessionId          — 세션 결과 (segments + ruptureEvents 포함)
 * GET    /sessions/:sessionId/audio    — 오디오 presigned URL 리다이렉트
 * POST   /sessions/:sessionId/rupture  — Rupture 감지 수동 트리거 / 재실행
 * DELETE /sessions/:sessionId          — 세션 삭제
 */

import { Router } from "express";
import { getSession, listSessions, deleteSession, setJobStatus, updateSegmentSpeakers, setSegmentNote, toggleBookmark } from "../services/db.js";
import { getPresignedUrl, deleteFromS3 } from "../services/storage.js";
import { runRuptureDetection, runSummary, runRedaction, runDistortionDetection, runWorksheetGeneration } from "../services/aiClient.js";

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

/**
 * AI 서버에 callback URL과 함께 비동기 트리거.
 * AI 서버가 처리 완료 후 /api/internal/...-callback 으로 결과 push → DB 저장.
 * 백엔드는 5분 대기 없이 즉시 응답하므로 컨테이너 재시작에도 안전.
 */
router.post("/:sessionId/rupture", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const segments = session.analysisResult?.segments;
    if (!segments?.length) {
      return res.status(400).json({ error: "Session has no segments to analyze" });
    }
    await setJobStatus(req.params.sessionId, "rupture", "processing");
    await runRuptureDetection(req.params.sessionId, segments);
    res.status(202).json({ status: "started", message: "백그라운드에서 처리 중" });
  } catch (err) {
    await setJobStatus(req.params.sessionId, "rupture", "error", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:sessionId/summary", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const segments = session.analysisResult?.segments;
    if (!segments?.length) {
      return res.status(400).json({ error: "Session has no segments to summarize" });
    }
    await setJobStatus(req.params.sessionId, "summary", "processing");
    await runSummary(req.params.sessionId, segments);
    res.status(202).json({ status: "started", message: "백그라운드에서 처리 중" });
  } catch (err) {
    await setJobStatus(req.params.sessionId, "summary", "error", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:sessionId/redact", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const segments = session.analysisResult?.segments;
    if (!segments?.length) {
      return res.status(400).json({ error: "Session has no segments to redact" });
    }
    await setJobStatus(req.params.sessionId, "redaction", "processing");
    await runRedaction(req.params.sessionId, segments);
    res.status(202).json({ status: "started", message: "백그라운드에서 처리 중" });
  } catch (err) {
    await setJobStatus(req.params.sessionId, "redaction", "error", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:sessionId/distortion", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const segments = session.analysisResult?.segments;
    if (!segments?.length) {
      return res.status(400).json({ error: "Session has no segments to analyze" });
    }
    await setJobStatus(req.params.sessionId, "distortion", "processing");
    await runDistortionDetection(req.params.sessionId, segments);
    res.status(202).json({ status: "started", message: "인지왜곡 탐지 중" });
  } catch (err) {
    await setJobStatus(req.params.sessionId, "distortion", "error", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:sessionId/worksheet", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!session.distortions?.length) {
      return res.status(400).json({ error: "인지왜곡 분석을 먼저 실행하세요" });
    }
    await setJobStatus(req.params.sessionId, "worksheet", "processing");
    await runWorksheetGeneration(req.params.sessionId);
    res.status(202).json({ status: "started", message: "CBT 워크시트 생성 중" });
  } catch (err) {
    await setJobStatus(req.params.sessionId, "worksheet", "error", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 화자 라벨 수동 정정
 * body: { speakers: ["counselor", "client", ...] } — 인덱스별 새 화자 (undefined는 유지)
 */
router.patch("/:sessionId/speakers", async (req, res) => {
  try {
    const { speakers } = req.body;
    if (!Array.isArray(speakers)) {
      return res.status(400).json({ error: "speakers must be an array" });
    }
    await updateSegmentSpeakers(req.params.sessionId, speakers);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 메모/북마크
 *   PUT /sessions/:id/notes/:segmentIdx  body: { text }   — 빈 text는 삭제
 *   POST /sessions/:id/bookmarks/:segmentIdx              — 토글 (있으면 제거, 없으면 추가)
 */
router.put("/:sessionId/notes/:segmentIdx", async (req, res) => {
  try {
    const { text } = req.body ?? {};
    await setSegmentNote(req.params.sessionId, Number(req.params.segmentIdx), text ?? "");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:sessionId/bookmarks/:segmentIdx", async (req, res) => {
  try {
    const added = await toggleBookmark(req.params.sessionId, Number(req.params.segmentIdx));
    res.json({ ok: true, bookmarked: added });
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
