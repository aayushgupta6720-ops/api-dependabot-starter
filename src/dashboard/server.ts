import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunLogEntry } from "../runLog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const RUN_LOG_PATH = path.resolve("./run-log.jsonl");
const STATE_PATH = path.resolve("./.changelog-state.json");
const EVAL_RESULTS_DIR = path.resolve("./eval-results");

const PORT = Number(process.env.DASHBOARD_PORT ?? 4200);

function readRuns(): RunLogEntry[] {
  if (!existsSync(RUN_LOG_PATH)) return [];
  const lines = readFileSync(RUN_LOG_PATH, "utf8").split("\n").filter((l) => l.trim());
  const runs = lines.map((line) => JSON.parse(line) as RunLogEntry);
  return runs.reverse(); // newest first
}

interface EvalCaseResult {
  id: string;
  pass: boolean;
  failures: string[];
}

interface EvalSummary {
  file: string;
  timestamp: string;
  passed: number;
  total: number;
}

function readEvals(): EvalSummary[] {
  if (!existsSync(EVAL_RESULTS_DIR)) return [];
  const files = readdirSync(EVAL_RESULTS_DIR).filter((f) => f.endsWith(".json"));
  const summaries = files.map((file) => {
    const results = JSON.parse(
      readFileSync(path.join(EVAL_RESULTS_DIR, file), "utf8")
    ) as EvalCaseResult[];
    return {
      file,
      // filenames are `new Date().toISOString().replace(/[:.]/g, "-")` (see src/eval/run.ts),
      // so they already sort chronologically as strings — no need to reconstruct real ISO.
      timestamp: file.replace(/\.json$/, ""),
      passed: results.filter((r) => r.pass).length,
      total: results.length,
    };
  });
  return summaries.sort((a, b) => b.file.localeCompare(a.file));
}

function readStatus() {
  const state = existsSync(STATE_PATH)
    ? JSON.parse(readFileSync(STATE_PATH, "utf8"))
    : { lastSeenTag: null };
  const runs = readRuns();
  return {
    lastSeenTag: state.lastSeenTag,
    lastRunAt: runs[0]?.startedAt ?? null,
  };
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
};

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";

  if (url === "/api/runs") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(readRuns()));
    return;
  }

  if (url === "/api/evals") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(readEvals()));
    return;
  }

  if (url === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(readStatus()));
    return;
  }

  const filePath = path.join(PUBLIC_DIR, url === "/" ? "index.html" : url);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
