import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  SCENARIOS,
  METRICS,
  initialState,
  createMeasurement,
  generateScenario,
  updateSimulator,
  calculateBaselines,
  runInvestigation,
  transitionAlert,
  createFollowUp,
  updateFollowUp,
  clearDemoData,
  summary,
  csv,
  importMeasurements,
  listImports,
  deleteImport,
  restoreImport,
  localAiExplanation
} from "./src/core.js";
import { assistantReply } from "./src/assistant.js";
import { activities, missionRoutine, validEnvironment, validRoutineTimes } from "./src/routine.js";
import { replayTimeline, replaySnapshot } from "./src/replay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ORBIT_DATA_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "orbit-db.json");
const PORT = Number(process.env.PORT || 4173);

fs.mkdirSync(DATA_DIR, { recursive: true });
let liveState = loadState();

function loadState() {
  if (!fs.existsSync(DB_PATH)) return initialState();
  try {
    return { ...initialState(), ...JSON.parse(fs.readFileSync(DB_PATH, "utf8")) };
  } catch {
    return initialState();
  }
}

function saveState(next = liveState) {
  const temporary = `${DB_PATH}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2));
    fs.renameSync(temporary, DB_PATH);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://localhost:4173",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Import-Filename",
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
  const text = Buffer.concat(chunks, size).toString("utf8");
  if (!text) return {};
  const type = req.headers["content-type"] || "";
  if (type.includes("text/csv")) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Invalid JSON request"), { status: 400 });
  }
}

function notFound(res) {
  send(res, 404, { error: "Not found" });
}

function safe(handler) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      await handler(req, res, url);
      if (req.method !== "GET" && req.method !== "OPTIONS" && req.method !== "DELETE" &&
          url.pathname !== "/api/crew" && !url.searchParams.has("practice")) saveState();
    } catch (err) {
      if (res.headersSent) res.destroy();
      else send(res, err.status || 500, { error: err.message || "Unexpected error" });
    }
  };
}

const server = http.createServer(safe(async (req, res, url) => {
  if (req.method === "OPTIONS") return send(res, 204, "");

  if (!url.pathname.startsWith("/api/")) {
    return serveStatic(req, res, url.pathname);
  }
  if (url.pathname === "/api/practice" || url.searchParams.has("practice")) return notFound(res);
  const state = liveState;

  if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true, app: "ORBIT", persistence: DB_PATH });
  if (req.method === "GET" && url.pathname === "/api/config") return send(res, 200, { metrics: METRICS, ai_enabled: process.env.AI_ENABLED === "true", model: process.env.GEMINI_MODEL || "not configured" });
  if (req.method === "GET" && url.pathname === "/api/mission") return send(res, 200, state.mission);
  if (req.method === "PATCH" && url.pathname === "/api/mission") {
    state.mission = { ...state.mission, ...(await body(req)), updated_at: new Date().toISOString() };
    return send(res, 200, state.mission);
  }
  const activeCrew = state.crew.filter((row) => !row.deleted_at);
  if (req.method === "GET" && url.pathname === "/api/crew") return send(res, 200, activeCrew);
  if (req.method === "POST" && url.pathname === "/api/crew") {
    const input = await body(req);
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const role = typeof input?.role === "string" ? input.role.trim() : "";
    if (!name || name.length > 80 || role.length > 80) return send(res, 400, { error: "Enter a crew name and an optional role (up to 80 characters each)." });
    const gender = input?.gender ?? "unspecified";
    if (!["male", "female", "unspecified"].includes(gender)) return send(res, 400, { error: "Choose a supported gender option." });
    const member = { crew_id: `crew-${randomUUID()}`, name, role: role || "Crew member", gender, fictional: true };
    const next = { ...state, crew: [...state.crew, member] };
    saveState(next);
    liveState = next;
    return send(res, 201, member);
  }
  const crewRoute = url.pathname.match(/^\/api\/crew\/([^/]+)$/);
  if (crewRoute) {
    const profile = activeCrew.find((row) => row.crew_id === crewRoute[1]);
    if (req.method === "GET") return profile ? send(res, 200, profile) : notFound(res);
    if (req.method === "DELETE") {
      if (!profile) return notFound(res);
      if (activeCrew.length === 1) return send(res, 409, { error: "Keep at least one active crew profile." });
      const next = { ...state, crew: state.crew.map((row) => row === profile ? { ...row, deleted_at: new Date().toISOString() } : row) };
      saveState(next);
      liveState = next;
      return send(res, 200, next.crew.filter((row) => !row.deleted_at));
    }
  }

  const requestedCrew = url.searchParams.get("crew_id");
  const crewId = requestedCrew ?? activeCrew[0]?.crew_id;
  const member = activeCrew.find((row) => row.crew_id === crewId);
  if (!member) return send(res, 404, { error: "Crew member not found" });
  const owned = (row) => row.crew_id === crewId;
  const ownsAlert = (id) => state.alerts.some((row) => row.alert_id === id && owned(row));
  const ownsFollowUp = (row) => ownsAlert(row.alert_id);

  if (url.pathname === "/api/routine" && req.method === "GET") return send(res, 200, missionRoutine(state, member));
  if (url.pathname === "/api/routine" && req.method === "PATCH") {
    const { times, environment } = await body(req);
    const selected = environment ?? member.environment ?? "station";
    if (!validEnvironment(selected)) return send(res, 400, { error: "Choose a supported mission environment." });
    if (times !== undefined && !validRoutineTimes(times)) return send(res, 400, { error: "Enter a valid UTC time for each routine task." });
    member.environment = selected;
    if (times) member.routine_schedules = { ...member.routine_schedules, [selected]: times };
    return send(res, 200, missionRoutine(state, member));
  }

  if (req.method === "GET" && url.pathname === "/api/replay/timeline") return send(res, 200, replayTimeline(state, crewId));
  if (req.method === "GET" && url.pathname === "/api/replay/snapshot") return send(res, 200, replaySnapshot(state, { at: url.searchParams.get("at"), metric: url.searchParams.get("metric") || "heart_rate", crew_id: crewId }));

  if (req.method === "GET" && url.pathname === "/api/measurements") {
    const metric = url.searchParams.get("metric");
    const source = url.searchParams.get("source");
    let rows = state.measurements.filter(owned).sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at));
    if (metric) rows = rows.filter((m) => m.metric_type === metric);
    if (source) rows = rows.filter((m) => m.source === source);
    return send(res, 200, url.searchParams.get("limit") === "all" ? rows : rows.slice(0, Number(url.searchParams.get("limit") || 500)));
  }
  if (req.method === "POST" && url.pathname === "/api/measurements") {
    const input = await body(req);
    const target = input.crew_id ?? crewId;
    if ((requestedCrew !== null && target !== crewId) || !state.crew.some((row) => row.crew_id === target && !row.deleted_at)) return send(res, 400, { error: "Measurement crew ID must match an active crew member and the selected profile." });
    const followUp = input.follow_up_id && state.followUps.find((row) =>
      row.action_id === input.follow_up_id && target === crewId && ownsFollowUp(row));
    if (input.follow_up_id && (!followUp || ["COMPLETED", "CANCELLED"].includes(followUp.status) || followUp.metric_type !== input.metric_type)) {
      return send(res, 409, { error: "This measurement does not match an open follow-up for the selected crew member." });
    }
    const now = new Date();
    const measurement = createMeasurement({ ...input, crew_id: target }, state, now);
    if (input.activity !== undefined) {
      if (!activities.includes(input.activity)) return send(res, 400, { error: "Choose a supported measurement activity." });
      measurement.activity = input.activity;
      measurement.environment = state.crew.find((row) => row.crew_id === target).environment ?? "station";
    }
    if (input.routine_day !== undefined) {
      const routine = missionRoutine(state, member, now);
      const task = routine.tasks.find((row) => row.metric === measurement.metric_type);
      if (target !== crewId || followUp || input.routine_day !== routine.day || !task || task.status === "Completed" ||
          !measurement.measured_at.startsWith(routine.day) || new Date(measurement.measured_at) > now ||
          measurement.quality_status !== "valid") {
        return send(res, 409, { error: "Routine tasks need one valid reading from today (UTC). Refresh Mission Overview to check the task status." });
      }
      measurement.routine_day = routine.day;
    }
    state.measurements.push(measurement);
    if (followUp) followUp.measurement_id = measurement.measurement_id;
    return send(res, 201, measurement);
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/measurements/")) return send(res, 200, state.measurements.find((m) => owned(m) && m.measurement_id === url.pathname.split("/").at(-1)) || {});
  if (req.method === "POST" && url.pathname === "/api/measurements/import") {
    const filename = req.headers["x-import-filename"] ? decodeURIComponent(String(req.headers["x-import-filename"])) : "Pasted CSV";
    return send(res, 200, importMeasurements(state, String(await body(req)), { commit: true, filename, crewId }));
  }
  if (req.method === "POST" && url.pathname === "/api/measurements/import/preview") return send(res, 200, importMeasurements(state, String(await body(req)), { crewId }));
  if (req.method === "GET" && url.pathname === "/api/imports") return send(res, 200, listImports(state, crewId));
  const importAction = url.pathname.match(/^\/api\/imports\/([^/]+)\/(delete|restore)$/);
  if (req.method === "POST" && importAction) {
    return send(res, 200, importAction[2] === "delete" ? deleteImport(state, importAction[1], await body(req), crewId) : restoreImport(state, importAction[1], crewId));
  }

  if (req.method === "GET" && url.pathname === "/api/baselines") {
    const baselines = state.baselines.filter(owned);
    return send(res, 200, baselines.length ? baselines : calculateBaselines(state, crewId));
  }
  if (req.method === "POST" && url.pathname === "/api/baselines/recalculate") return send(res, 200, calculateBaselines(state, crewId));

  if (req.method === "GET" && url.pathname === "/api/simulator/scenarios") return send(res, 200, SCENARIOS);
  if (req.method === "POST" && url.pathname === "/api/simulator/generate") {
    const input = await body(req);
    const target = input.crew_id ?? crewId;
    if ((requestedCrew !== null && target !== crewId) || !state.crew.some((row) => row.crew_id === target && !row.deleted_at)) return send(res, 400, { error: "Simulation crew ID must match an active crew member and the selected profile." });
    return send(res, 200, generateScenario(state, { ...input, crew_id: target }));
  }
  const simulatorAction = url.pathname.match(/^\/api\/simulator\/(start|pause|resume)$/);
  if (req.method === "POST" && simulatorAction) return send(res, 200, updateSimulator(state, crewId, { status: simulatorAction[1] === "pause" ? "paused" : "running" }));
  if (req.method === "POST" && url.pathname === "/api/simulator/reset") return send(res, 200, clearDemoData(state, crewId));

  if (req.method === "POST" && url.pathname === "/api/investigations/run") return send(res, 201, runInvestigation(state, crewId));
  if (req.method === "GET" && url.pathname === "/api/investigations") return send(res, 200, state.investigations.filter(owned));
  if (req.method === "GET" && url.pathname.startsWith("/api/investigations/")) return send(res, 200, state.investigations.find((i) => owned(i) && i.investigation_id === url.pathname.split("/").at(-1)) || {});

  if (req.method === "GET" && url.pathname === "/api/alerts") {
    const contextById = new Map(state.measurements.filter((row) => owned(row) && row.activity)
      .map((row) => [row.measurement_id, { activity: row.activity, environment: row.environment }]));
    return send(res, 200, state.alerts.filter(owned).map((alert) => ({
      ...alert,
      evidence_context: Object.fromEntries((alert.evidence_summary ?? [])
        .filter((row) => contextById.has(row.measurement_id))
        .map((row) => [row.measurement_id, contextById.get(row.measurement_id)]))
    })));
  }
  const briefRoute = url.pathname.match(/^\/api\/alerts\/([^/]+)\/brief$/);
  if (req.method === "GET" && briefRoute) {
    const alert = state.alerts.find((row) => row.alert_id === briefRoute[1] && owned(row));
    if (!alert) return notFound(res);
    const finding = state.investigations.find((row) => owned(row) && (row.alert_id === alert.alert_id || row.investigation_id === alert.investigation_id));
    const measurements = state.measurements.filter(owned);
    const byId = new Map(measurements.map((row) => [row.measurement_id, row]));
    const withinWindow = (row) => finding?.window_start && finding?.as_of &&
      Date.parse(row.measured_at) >= Date.parse(finding.window_start) && Date.parse(row.measured_at) <= Date.parse(finding.as_of);
    return send(res, 200, {
      window_start: finding?.window_start,
      as_of: finding?.as_of,
      excluded: finding?.quality_limitations ?? [],
      readings: (alert.evidence_summary || []).map((row) => ({ ...row, reading: byId.get(row.measurement_id) })),
      symptoms: measurements.filter((row) => withinWindow(row) && row.metric_type === "symptom_severity" && !row.scenario_id)
        .sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at))[0] ?? null,
      context: [...new Set(measurements.filter((row) => withinWindow(row) && row.notes && !row.scenario_id).map((row) => row.notes))],
      tasks: state.followUps.filter((row) => row.alert_id === alert.alert_id).map((row) => ({ ...row, measurement: byId.get(row.measurement_id) })),
      resolution: alert.resolution_notes
    });
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/alerts/") && url.pathname.split("/").length === 4) return send(res, 200, state.alerts.find((a) => owned(a) && a.alert_id === url.pathname.split("/").at(-1)) || {});
  const alertAction = url.pathname.match(/^\/api\/alerts\/([^/]+)\/(acknowledge|investigate|resolve|false-positive)$/);
  if (req.method === "POST" && alertAction) {
    const input = await body(req);
    if (!ownsAlert(alertAction[1])) return notFound(res);
    return send(res, 200, transitionAlert(state, alertAction[1], alertAction[2], input));
  }

  if (req.method === "GET" && url.pathname === "/api/follow-ups") {
    return send(res, 200, state.followUps.filter(ownsFollowUp).map((row) => ({
      ...row,
      measurement: row.measurement_id ? state.measurements.find((item) => item.measurement_id === row.measurement_id && owned(item)) ?? null : null
    })));
  }
  if (req.method === "POST" && url.pathname === "/api/follow-ups") {
    const input = await body(req);
    if (!ownsAlert(input.alert_id)) return notFound(res);
    return send(res, 201, createFollowUp(state, input));
  }
  if (req.method === "PATCH" && url.pathname.startsWith("/api/follow-ups/")) {
    const input = await body(req);
    const id = url.pathname.split("/").at(-1);
    if (!state.followUps.some((row) => row.action_id === id && ownsFollowUp(row))) return notFound(res);
    return send(res, 200, updateFollowUp(state, id, input));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/status") return send(res, 200, { enabled: process.env.AI_ENABLED === "true", configured: Boolean(process.env.GEMINI_API_KEY), privacy: "Default local fallback sends no data externally." });
  if (url.pathname.startsWith("/api/ai/") || url.pathname === "/api/reports/summary") {
    const scoped = {
      ...state,
      crew: [member],
      measurements: state.measurements.filter(owned),
      alerts: state.alerts.filter(owned),
      investigations: state.investigations.filter(owned),
      followUps: state.followUps.filter(ownsFollowUp),
      aiExplanations: state.aiExplanations.filter((row) => (row.crew_id ?? state.crew[0].crew_id) === crewId)
    };
    if (req.method === "GET" && url.pathname === "/api/reports/summary") return send(res, 200, summary(scoped));
    if (req.method === "POST" && url.pathname === "/api/ai/explain") {
      const explanation = { ...localAiExplanation(scoped), crew_id: crewId };
      state.aiExplanations.unshift(explanation);
      return send(res, 201, explanation);
    }
    if (req.method === "POST" && url.pathname === "/api/ai/chat") return send(res, 200, assistantReply(scoped, await body(req)));
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/reports/export/")) {
    const report = url.pathname.split("/").at(-1);
    const rows = { measurements: state.measurements.filter(owned), alerts: state.alerts.filter(owned), "follow-ups": state.followUps.filter(ownsFollowUp) };
    if (Object.hasOwn(rows, report)) return send(res, 200, csv(rows[report]), { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=orbit-${report}-${crewId}.csv` });
  }

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
