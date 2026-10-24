import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import {
  SCENARIOS,
  METRICS,
  initialState,
  createMeasurement,
  generateScenario,
  calculateBaselines,
  runInvestigation,
  transitionAlert,
  createFollowUp,
  updateFollowUp,
  clearDemoData,
  summary,
  csv,
  importMeasurements,
  localAiExplanation
} from "./src/core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ORBIT_DATA_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "orbit-db.json");
const PORT = Number(process.env.PORT || 4173);

fs.mkdirSync(DATA_DIR, { recursive: true });
let state = loadState();

function loadState() {
  if (!fs.existsSync(DB_PATH)) return initialState();
  try {
    return { ...initialState(), ...JSON.parse(fs.readFileSync(DB_PATH, "utf8")) };
  } catch {
    return initialState();
  }
}

function saveState() {
  fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://localhost:4173",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...headers
  });
  res.end(payload);
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw Object.assign(new Error("Request exceeds 1 MB limit"), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  const type = req.headers["content-type"] || "";
  if (type.includes("text/csv")) return text;
  return JSON.parse(text);
}

function notFound(res) {
  send(res, 404, { error: "Not found" });
}

function safe(handler) {
  return async (req, res, url) => {
    try {
      await handler(req, res, url);
      if (req.method !== "GET") saveState();
    } catch (err) {
      send(res, err.status || 500, { error: err.message || "Unexpected error" });
    }
  };
}

const server = http.createServer(safe(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return send(res, 204, "");

  if (!url.pathname.startsWith("/api/")) {
    return serveStatic(req, res, url.pathname);
  }

  if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true, app: "ORBIT", persistence: DB_PATH });
  if (req.method === "GET" && url.pathname === "/api/config") return send(res, 200, { metrics: METRICS, ai_enabled: process.env.AI_ENABLED === "true", model: process.env.GEMINI_MODEL || "not configured" });
  if (req.method === "GET" && url.pathname === "/api/mission") return send(res, 200, state.mission);
  if (req.method === "PATCH" && url.pathname === "/api/mission") {
    state.mission = { ...state.mission, ...(await body(req)), updated_at: new Date().toISOString() };
    return send(res, 200, state.mission);
  }
  if (req.method === "GET" && url.pathname === "/api/crew") return send(res, 200, state.crew);
  if (req.method === "GET" && url.pathname.startsWith("/api/crew/")) return send(res, 200, state.crew.find((c) => c.crew_id === url.pathname.split("/").at(-1)) || {});

  if (req.method === "GET" && url.pathname === "/api/measurements") {
    const metric = url.searchParams.get("metric");
    const source = url.searchParams.get("source");
    let rows = [...state.measurements].sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at));
    if (metric) rows = rows.filter((m) => m.metric_type === metric);
    if (source) rows = rows.filter((m) => m.source === source);
    return send(res, 200, url.searchParams.get("limit") === "all" ? rows : rows.slice(0, Number(url.searchParams.get("limit") || 500)));
  }
  if (req.method === "POST" && url.pathname === "/api/measurements") {
    const measurement = createMeasurement(await body(req), state);
    state.measurements.push(measurement);
    return send(res, 201, measurement);
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/measurements/")) return send(res, 200, state.measurements.find((m) => m.measurement_id === url.pathname.split("/").at(-1)) || {});
  if (req.method === "POST" && url.pathname === "/api/measurements/import") {
    return send(res, 200, importMeasurements(state, String(await body(req)), { commit: true }));
  }
  if (req.method === "POST" && url.pathname === "/api/measurements/import/preview") return send(res, 200, importMeasurements(state, String(await body(req))));

  if (req.method === "GET" && url.pathname === "/api/baselines") return send(res, 200, state.baselines.length ? state.baselines : calculateBaselines(state));
  if (req.method === "POST" && url.pathname === "/api/baselines/recalculate") return send(res, 200, calculateBaselines(state));

  if (req.method === "GET" && url.pathname === "/api/simulator/scenarios") return send(res, 200, SCENARIOS);
  if (req.method === "POST" && url.pathname === "/api/simulator/generate") return send(res, 200, generateScenario(state, await body(req)));
  if (req.method === "POST" && url.pathname === "/api/simulator/start") { state.simulator.status = "running"; return send(res, 200, state.simulator); }
  if (req.method === "POST" && url.pathname === "/api/simulator/pause") { state.simulator.status = "paused"; return send(res, 200, state.simulator); }
  if (req.method === "POST" && url.pathname === "/api/simulator/resume") { state.simulator.status = "running"; return send(res, 200, state.simulator); }
  if (req.method === "POST" && url.pathname === "/api/simulator/reset") return send(res, 200, clearDemoData(state));

  if (req.method === "POST" && url.pathname === "/api/investigations/run") return send(res, 201, runInvestigation(state));
  if (req.method === "GET" && url.pathname === "/api/investigations") return send(res, 200, state.investigations);
  if (req.method === "GET" && url.pathname.startsWith("/api/investigations/")) return send(res, 200, state.investigations.find((i) => i.investigation_id === url.pathname.split("/").at(-1)) || {});

  if (req.method === "GET" && url.pathname === "/api/alerts") return send(res, 200, state.alerts);
  if (req.method === "GET" && url.pathname.startsWith("/api/alerts/") && url.pathname.split("/").length === 4) return send(res, 200, state.alerts.find((a) => a.alert_id === url.pathname.split("/").at(-1)) || {});
  const alertAction = url.pathname.match(/^\/api\/alerts\/([^/]+)\/(acknowledge|investigate|resolve|false-positive)$/);
  if (req.method === "POST" && alertAction) return send(res, 200, transitionAlert(state, alertAction[1], alertAction[2], await body(req)));

  if (req.method === "GET" && url.pathname === "/api/follow-ups") return send(res, 200, state.followUps);
  if (req.method === "POST" && url.pathname === "/api/follow-ups") return send(res, 201, createFollowUp(state, await body(req)));
  if (req.method === "PATCH" && url.pathname.startsWith("/api/follow-ups/")) return send(res, 200, updateFollowUp(state, url.pathname.split("/").at(-1), await body(req)));

  if (req.method === "GET" && url.pathname === "/api/ai/status") return send(res, 200, { enabled: process.env.AI_ENABLED === "true", configured: Boolean(process.env.GEMINI_API_KEY), privacy: "Default local fallback sends no data externally." });
  if (req.method === "POST" && url.pathname === "/api/ai/explain") return send(res, 201, localAiExplanation(state));

  if (req.method === "GET" && url.pathname === "/api/reports/summary") return send(res, 200, summary(state));
  if (req.method === "GET" && url.pathname === "/api/reports/export/measurements") return send(res, 200, csv(state.measurements), { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=orbit-measurements.csv" });
  if (req.method === "GET" && url.pathname === "/api/reports/export/alerts") return send(res, 200, csv(state.alerts), { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=orbit-alerts.csv" });
  if (req.method === "GET" && url.pathname === "/api/reports/export/follow-ups") return send(res, 200, csv(state.followUps), { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=orbit-followups.csv" });

  return notFound(res);
}));

function serveStatic(req, res, pathname) {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(__dirname, "web", clean));
  if (!file.startsWith(path.join(__dirname, "web"))) return send(res, 403, "Forbidden");
  if (!fs.existsSync(file)) return notFound(res);
  const ext = path.extname(file);
  const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ORBIT running at http://127.0.0.1:${PORT}`);
});
