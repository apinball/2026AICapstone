import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import uploadRouter from "./routes/upload.js";
import analysisRouter from "./routes/analysis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 로컬 모드일 때 오디오 파일 정적 서빙
if (process.env.USE_LOCAL === "true") {
  app.use("/local-storage", express.static(path.resolve("local-storage")));
  console.log("[server] Local mode enabled — using filesystem + JSON DB");
}

// API 라우트
app.get("/api/health", (_req, res) => res.json({ status: "ok", local: process.env.USE_LOCAL === "true" }));
app.use("/api/upload", uploadRouter);
app.use("/api/sessions", analysisRouter);

// React 정적 파일 서빙 (빌드 후)
const clientDist = path.join(__dirname, "../../frontend/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
