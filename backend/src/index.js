import "dotenv/config";
import express from "express";
import cors from "cors";

import uploadRouter from "./routes/upload.js";
import analysisRouter from "./routes/analysis.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/upload", uploadRouter);
app.use("/sessions", analysisRouter);

app.listen(PORT, () => {
  console.log(`[backend] Listening on port ${PORT}`);
});
