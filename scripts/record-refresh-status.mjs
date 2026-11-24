import { writeFile } from "node:fs/promises";
import path from "node:path";

await writeFile(path.resolve(process.env.NEXUSQ_DATA_DIR ?? "public/data", "refresh-status.json"), JSON.stringify({
  attemptedAt: new Date().toISOString(), outcome: process.env.REFRESH_OUTCOME ?? "unknown",
  runUrl: process.env.REFRESH_RUN_URL ?? null,
  failureStage: process.env.REFRESH_FAILURE_STAGE || null,
}));
