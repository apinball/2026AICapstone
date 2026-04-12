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

// API 라우트
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
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
