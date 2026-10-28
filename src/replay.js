import { METRICS, latestReadings, runInvestigation } from "./core.js";

function crewReadings(state, crewId) {
  if (!state.crew.some((crew) => crew.crew_id === crewId)) throw Object.assign(new Error("Crew member not found"), { status: 404 });
  return state.measurements.filter((row) => row.crew_id === crewId && Number.isFinite(new Date(row.measured_at).getTime())).sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
}

export function replayTimeline(state, crewId = "crew-aurora") {
  const rows = crewReadings(state, crewId);
  const timestamps = [...new Set(rows.map((row) => new Date(row.measured_at).toISOString()))];
  return { crew_id: crewId, timestamps, total_readings: rows.length, start_at: timestamps[0] || null, end_at: timestamps.at(-1) || null };
}

export function replaySnapshot(state, { at, metric = "heart_rate", crew_id = "crew-aurora" } = {}) {
  const time = typeof at === "string" ? new Date(at) : new Date(NaN);
  if (!Number.isFinite(time.getTime())) throw Object.assign(new Error("Replay time must be a valid timestamp"), { status: 400 });
  if (!Object.hasOwn(METRICS, metric)) throw Object.assign(new Error("Unsupported replay metric"), { status: 400 });
  const rows = crewReadings(state, crew_id);
  if (!rows.length) throw Object.assign(new Error("No readings available for replay"), { status: 404 });
  if (time < new Date(rows[0].measured_at) || time > new Date(rows.at(-1).measured_at)) {
    throw Object.assign(new Error("Replay time is outside the recorded mission interval"), { status: 400 });
  }
  const visible = rows.filter((row) => new Date(row.measured_at) <= time);
  // Isolate every mutable result collection: replay must not change live decisions.
  const preview = { ...state, measurements: visible, baselines: [], investigations: [], alerts: [], followUps: [], audits: [], aiExplanations: [] };
  const finding = runInvestigation(preview, crew_id, time);
  return {
    as_of: time.toISOString(),
    metric,
    crew_id,
    visible_count: visible.length,
    remaining_count: rows.length - visible.length,
    latest_readings: latestReadings(preview, crew_id, time),
    trend: visible.filter((row) => row.metric_type === metric && Number.isFinite(row.value)).map((row) => ({ ...row, timestamp: new Date(row.measured_at).getTime() })),
    baselines: preview.baselines,
    finding,
    preview_alert_count: preview.alerts.length,
    preview_only: true
  };
}
