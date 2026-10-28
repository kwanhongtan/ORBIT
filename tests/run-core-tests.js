import assert from "node:assert/strict";
import { assistantReply } from "../src/assistant.js";
import { replayTimeline, replaySnapshot } from "../src/replay.js";
import {
  initialState,
  generateScenario,
  calculateBaselines,
  runInvestigation,
  createMeasurement,
  transitionAlert,
  createFollowUp,
  updateFollowUp,
  localAiExplanation,
  latestReadings,
  parseCsv,
  importMeasurements,
  csv,
  listImports,
  deleteImport,
  restoreImport
} from "../src/core.js";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("stable scenario establishes baselines without creating drift alert", () => {
  const state = initialState();
  const result = generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 11 });
  assert.equal(result.created > 100, true);
  const baselines = calculateBaselines(state);
  assert.equal(baselines.find((b) => b.metric_type === "heart_rate").sufficient, true);
  const investigation = runInvestigation(state);
  assert.equal(investigation.severity, "INFORMATIONAL");
  assert.equal(state.alerts.length, 0);
});

test("gradual drift creates explainable alert and avoids duplicate open alerts", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 21 });
  generateScenario(state, { scenario: "gradual_drift", days: 10, seed: 22 });
  const first = runInvestigation(state);
  const second = runInvestigation(state);
  assert.match(first.title, /drift/i);
  assert.equal(["MEDIUM", "HIGH"].includes(first.severity), true);
  assert.equal(second.evidence.length >= 3, true);
  assert.equal(state.alerts.length, 1);
  assert.equal(state.alerts[0].related_measurement_ids.length >= 3, true);
});

test("isolated unusual measurement does not become multi-signal finding", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 31 });
  generateScenario(state, { scenario: "isolated_unusual", days: 4, seed: 32 });
  const spike = state.measurements.find((row) => row.scenario_id === "isolated_unusual" && row.metric_type === "heart_rate" && row.value > 90);
  const investigation = runInvestigation(state, "crew-aurora", new Date(spike.measured_at));
  assert.equal(investigation.severity, "LOW");
  assert.equal(state.alerts.length, 0);
});

test("isolated spike occurs on a reproducible interior day and varies by seed", () => {
  const positions = new Set();
  const generate = (days, seed) => {
    const state = initialState();
    generateScenario(state, { scenario: "isolated_unusual", days, seed });
    return state.measurements.filter((row) => row.metric_type === "heart_rate");
  };
  for (let seed = 1; seed <= 20; seed += 1) {
    const rows = generate(12, seed);
    const spikes = rows.filter((row) => row.value > 90);
    assert.equal(spikes.length, 1);
    const position = rows.indexOf(spikes[0]);
    assert.ok(position > 0 && position < rows.length - 1);
    positions.add(position);
    assert.deepEqual(rows.map((row) => [row.measured_at, row.value]), generate(12, seed).map((row) => [row.measured_at, row.value]));
  }
  assert.ok(positions.size > 1);
  assert.equal(generate(3, 42).findIndex((row) => row.value > 90), 1);
  assert.equal(generate(2, 42).findIndex((row) => row.value > 90), 0);
});

test("poor-quality data is flagged and excluded from reliable evidence", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 41 });
  generateScenario(state, { scenario: "poor_quality", days: 4, seed: 42 });
  assert.equal(state.measurements.some((m) => m.quality_status !== "valid"), true);
  const investigation = runInvestigation(state);
  assert.equal(investigation.quality_limitations.length > 0, true);
  assert.equal(investigation.evidence.some((e) => {
    const m = state.measurements.find((row) => row.measurement_id === e.measurement_id);
    return m?.quality_status !== "valid";
  }), false);
});

test("future measurements are not used for past baseline calculations", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 10, seed: 51 });
  state.measurements.push(createMeasurement({
    crew_id: "crew-aurora",
    metric_type: "heart_rate",
    value: 190,
    unit: "bpm",
    measured_at: "2026-12-01T00:00:00.000Z",
    source: "manual"
  }, state, new Date("2026-12-01T01:00:00.000Z")));
  const baselines = calculateBaselines(state, "crew-aurora", new Date("2026-10-12T00:00:00.000Z"));
  assert.equal(baselines.find((b) => b.metric_type === "heart_rate").mean < 100, true);
});

test("alert workflow and follow-up completion are separate from resolution", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 61 });
  generateScenario(state, { scenario: "gradual_drift", days: 10, seed: 62 });
  runInvestigation(state);
  const alert = state.alerts[0];
  transitionAlert(state, alert.alert_id, "acknowledge", { user: "tester" });
  const follow = createFollowUp(state, { alert_id: alert.alert_id });
  updateFollowUp(state, follow.action_id, { status: "COMPLETED", completion_notes: "Done" });
  assert.equal(state.alerts[0].status, "ACKNOWLEDGED");
  transitionAlert(state, alert.alert_id, "resolve", { resolution_notes: "Reviewed recovery data" });
  assert.equal(state.alerts[0].status, "RESOLVED");
});

test("AI disabled fallback returns structured response", () => {
  const state = initialState();
  const response = localAiExplanation(state);
  assert.equal(response.source, "deterministic_fallback");
  assert.equal(Array.isArray(response.suggested_follow_up), true);
});

test("simulator includes self-assessment and mission context metrics", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 2, seed: 71 });
  assert.equal(state.measurements.some((m) => m.metric_type === "mood"), true);
  assert.equal(state.measurements.some((m) => m.metric_type === "symptom_severity"), true);
  assert.equal(state.measurements.some((m) => m.metric_type === "radiation_dose"), true);
  assert.equal(state.measurements.some((m) => m.metric_type === "bone_assessment"), true);
});

test("latest readings use full crew history without hiding questionable records", () => {
  const state = initialState();
  state.measurements.push({ crew_id: "crew-aurora", metric_type: "heart_rate", value: 72, measured_at: "2026-10-20T08:00:00Z", quality_status: "valid", quality_flags: [] });
  state.measurements.push({ crew_id: "crew-aurora", metric_type: "heart_rate", value: 80, measured_at: "2026-10-21T08:00:00Z", quality_status: "questionable", quality_flags: ["duplicate"] });
  state.measurements.push({ crew_id: "other-crew", metric_type: "heart_rate", value: 100, measured_at: "2026-10-22T08:00:00Z" });
  state.measurements.push({ crew_id: "crew-aurora", metric_type: "blood_oxygen", value: 98, measured_at: "2026-10-20T08:00:00Z", quality_status: "valid", quality_flags: [] });
  const snapshot = JSON.stringify(state.measurements);
  const readings = latestReadings(state, "crew-aurora", new Date("2026-10-21T09:00:00Z"));
  assert.equal(readings.heart_rate.value, 80);
  assert.equal(readings.heart_rate.quality_status, "questionable");
  assert.deepEqual(readings.heart_rate.quality_flags, ["duplicate"]);
  assert.equal(readings.heart_rate.freshness, "current");
  assert.equal(readings.blood_oxygen.value, 98);
  assert.equal(JSON.stringify(state.measurements), snapshot);
});

test("reading freshness is recalculated with metric-specific intervals", () => {
  const state = initialState();
  for (const metric of ["heart_rate", "radiation_dose"]) state.measurements.push({ crew_id: "crew-aurora", metric_type: metric, value: 1, measured_at: "2026-10-20T08:00:00Z", quality_status: "valid" });
  let readings = latestReadings(state, "crew-aurora", new Date("2026-10-22T08:00:00Z"));
  assert.equal(readings.heart_rate.freshness, "stale");
  assert.equal(readings.radiation_dose.freshness, "current");
  readings = latestReadings(state, "crew-aurora", new Date("2026-10-20T07:59:00Z"));
  assert.equal(readings.heart_rate.freshness, "future");
  assert.equal(latestReadings(initialState()).heart_rate, undefined);
});

test("measurement validation rejects blank values and malformed timestamps cleanly", () => {
  const state = initialState();
  const input = { crew_id: "crew-aurora", metric_type: "symptom_severity", value: 0, measured_at: "2026-10-20T08:00:00Z" };
  state.measurements.push(createMeasurement(input, state, new Date(input.measured_at)));
  for (const value of ["", "   ", null, undefined, false, [], {}]) {
    assert.throws(() => createMeasurement({ ...input, value }, state), (err) => err.status === 400 && /numeric/.test(err.message));
  }
  for (const measured_at of ["bad-date", "2026-10-20", "2026-10-20T08:00:00", ""]) {
    assert.throws(() => createMeasurement({ ...input, measured_at }, state), (err) => err.status === 400 && /timestamp/.test(err.message));
  }
  assert.equal(createMeasurement({ ...input, value: "0" }, state).value, 0);
  for (const invalid of [null, [], "record", { ...input, metric_type: "__proto__" }]) {
    assert.throws(() => createMeasurement(invalid, state), (err) => err.status === 400);
  }
});

test("flagged future records do not shift the investigation window", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 21 });
  generateScenario(state, { scenario: "gradual_drift", days: 10, seed: 22 });
  const before = runInvestigation(state);
  state.measurements.push(createMeasurement({ crew_id: "crew-aurora", metric_type: "heart_rate", value: 190, measured_at: "2099-01-01T00:00:00Z" }, state, new Date("2026-10-23T00:00:00Z")));
  const after = runInvestigation(state);
  assert.equal(after.severity, before.severity);
  assert.deepEqual(after.evidence, before.evidence);
});

test("empty investigations identify missing data and insufficient baselines", () => {
  const result = runInvestigation(initialState());
  assert.equal(result.missing_metrics.length, 6);
  assert.equal(result.insufficient_baselines.length, 6);
  assert.equal(result.evidence.length, 0);
});

test("CSV parsing supports BOM, quoted commas, newlines and escaped quotes", () => {
  const rows = [{ crew_id: "crew-aurora", metric_type: "heart_rate", value: 72, measured_at: "2026-10-20T08:00:00Z", notes: 'After exercise, said "fine"\nSecond line' }];
  const parsed = parseCsv("\ufeff" + csv(rows));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].notes, rows[0].notes);
  assert.throws(() => parseCsv("metric_type,value\nheart_rate,72"), (err) => err.status === 400);
  assert.throws(() => parseCsv('crew_id,metric_type,value,measured_at\n"unclosed'), (err) => err.status === 400);
});

test("CSV preview does not mutate state and import skips duplicates", () => {
  const state = initialState();
  const text = 'crew_id,metric_type,value,unit,measured_at,notes\ncrew-aurora,heart_rate,72,bpm,2026-10-20T08:00:00Z,"Feels fine, rested"\ncrew-aurora,heart_rate,72,bpm,2026-10-20T08:00:00Z,same\ncrew-aurora,stress,,score_1_10,2026-10-20T08:00:00Z,blank\nunknown,stress,3,score_1_10,2026-10-20T08:00:00Z,unknown crew';
  const currentTime = new Date("2026-10-20T09:00:00Z");
  const before = JSON.stringify(state);
  const preview = importMeasurements(state, text, { currentTime });
  assert.equal(JSON.stringify(state), before);
  assert.equal(preview.accepted, 1);
  assert.equal(preview.rejected, 2);
  assert.equal(preview.duplicates, 1);
  const imported = importMeasurements(state, text, { currentTime, commit: true });
  assert.equal(imported.accepted, 1);
  assert.equal(state.measurements.length, 1);
  assert.equal(state.measurements[0].source, "csv_import");
  assert.equal(importMeasurements(state, text, { currentTime, commit: true }).accepted, 0);
});

test("CSV imports have separate batch identity and recoverable deletion", () => {
  const state = initialState();
  const makeCsv = (value, date) => csv([{ crew_id: "crew-aurora", metric_type: "heart_rate", value, measured_at: date }]);
  const first = importMeasurements(state, makeCsv(72, "2026-10-20T08:00:00Z"), { commit: true, filename: "first.csv" });
  const second = importMeasurements(state, makeCsv(74, "2026-10-21T08:00:00Z"), { commit: true, filename: "second.csv" });
  state.measurements.push(createMeasurement({ crew_id: "crew-aurora", metric_type: "stress", value: 3, measured_at: "2026-10-20T08:00:00Z", source: "manual" }, state));
  generateScenario(state, { days: 2 });
  const before = state.measurements.length;
  assert.notEqual(first.batch_id, second.batch_id);
  assert.equal(listImports(state).active.length, 2);
  const snapshot = JSON.stringify(state);
  assert.throws(() => deleteImport(state, first.batch_id, {}), (err) => err.status === 400);
  assert.throws(() => deleteImport(state, first.batch_id, { confirm: true, expected_count: 2 }), (err) => err.status === 409);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(deleteImport(state, first.batch_id, { confirm: true, expected_count: 1 }).removed, 1);
  assert.equal(state.measurements.length, before - 1);
  assert.equal(state.measurements.some((row) => row.import_batch_id === second.batch_id), true);
  assert.equal(state.measurements.some((row) => row.source === "manual"), true);
  const persisted = JSON.parse(JSON.stringify(state));
  const deleted = listImports(persisted).deleted[0];
  assert.equal(deleted.filename, "first.csv");
  assert.equal(restoreImport(persisted, deleted.batch_id).restored, 1);
  assert.equal(persisted.measurements.length, before);
  assert.equal(listImports(persisted).deleted.length, 0);
  assert.equal(listImports(persisted).active.length, 2);
});

test("deleting imports archives only linked workflow and invalidates affected baselines", () => {
  const state = initialState();
  const result = importMeasurements(state, csv([{ crew_id: "crew-aurora", metric_type: "heart_rate", value: 72, measured_at: "2026-10-20T08:00:00Z" }]), { commit: true });
  const id = state.measurements[0].measurement_id;
  state.investigations = [{ investigation_id: "linked", evidence: [{ measurement_id: id }] }, { investigation_id: "unrelated", evidence: [] }];
  state.alerts = [{ alert_id: "linked", investigation_id: "linked" }, { alert_id: "unrelated", related_measurement_ids: ["other"] }];
  state.followUps = [{ action_id: "linked", alert_id: "linked" }, { action_id: "unrelated", alert_id: "unrelated" }];
  state.baselines = [{ crew_id: "crew-aurora" }, { crew_id: "other" }];
  deleteImport(state, result.batch_id, { confirm: true, expected_count: 1 });
  assert.deepEqual(state.investigations.map((row) => row.investigation_id), ["unrelated"]);
  assert.deepEqual(state.alerts.map((row) => row.alert_id), ["unrelated"]);
  assert.deepEqual(state.followUps.map((row) => row.action_id), ["unrelated"]);
  assert.deepEqual(state.baselines, [{ crew_id: "other" }]);
  assert.equal(state.deletedImports[0].dependent_records.alerts.length, 1);
});

test("legacy CSV records can be deleted without guessing custom or manual sources", () => {
  const state = initialState();
  for (const [index, source] of ["csv_import", "imported_sample", "manual", "wearable_export"].entries()) {
    state.measurements.push(createMeasurement({ crew_id: "crew-aurora", metric_type: "heart_rate", value: 70 + index, measured_at: "2026-10-20T08:00:00Z", source }, state));
  }
  assert.equal(listImports(state).active[0].count, 2);
  deleteImport(state, "legacy-csv", { confirm: true, expected_count: 2 });
  assert.deepEqual(state.measurements.map((row) => row.source), ["manual", "wearable_export"]);
});

test("restore rejects duplicate readings atomically and unknown IDs", () => {
  const state = initialState();
  const text = csv([{ crew_id: "crew-aurora", metric_type: "heart_rate", value: 72, measured_at: "2026-10-20T08:00:00Z" }]);
  const result = importMeasurements(state, text, { commit: true });
  deleteImport(state, result.batch_id, { confirm: true, expected_count: 1 });
  const deleted = listImports(state).deleted[0];
  importMeasurements(state, text, { commit: true });
  const before = JSON.stringify(state);
  assert.throws(() => restoreImport(state, deleted.batch_id), (err) => err.status === 409);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => restoreImport(state, "missing"), (err) => err.status === 404);
  assert.throws(() => deleteImport(state, "missing", { confirm: true, expected_count: 1 }), (err) => err.status === 404);
});

test("assistant summaries are grounded in stored records and do not mutate state", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 21 });
  generateScenario(state, { scenario: "gradual_drift", days: 10, seed: 22 });
  runInvestigation(state);
  const before = JSON.stringify(state);
  const reply = assistantReply(state, { message: "Summarise mission health" }, new Date("2026-10-24T08:00:00Z"));
  assert.equal(reply.source, "local_rules");
  assert.match(reply.answer, /1 open alert/);
  assert.ok(reply.evidence.length > 0);
  assert.ok(reply.evidence.every((e) => state.measurements.some((row) => row.measurement_id === e.measurement_id && row.value === e.value)));
  assert.equal(JSON.stringify(state), before);
});

test("assistant explains metric baseline and maintains bounded follow-up context", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 21 });
  calculateBaselines(state);
  const reply = assistantReply(state, { message: "Show my heart rate trend" }, new Date("2026-10-24T08:00:00Z"));
  assert.equal(reply.context_metric, "heart_rate");
  assert.equal(reply.actions.find((action) => action.view === "timeline").metric, "heart_rate");
  assert.match(reply.sections[0].items.join(" "), /Saved personal baseline/);
  assert.match(reply.sections[0].items.join(" "), /last 7 usable/);
  assert.equal(assistantReply(state, { message: "What about its baseline?", context_metric: "heart_rate" }).context_metric, "heart_rate");
  assert.equal(assistantReply(state, { message: "Review data quality", context_metric: "heart_rate" }).context_metric, null);
  assert.match(assistantReply(state, { message: "Explain this alert", context_metric: "heart_rate" }).answer, /No open alert/);
  assert.equal(assistantReply(state, { message: "sleep quality" }).context_metric, "sleep_quality");
});

test("assistant handles missing records and unsupported questions without invented readings", () => {
  const state = initialState();
  const missing = assistantReply(state, { message: "Show oxygen" });
  assert.equal(missing.evidence.length, 0);
  assert.match(missing.sections[0].items[0], /No reading/);
  const unknown = assistantReply(state, { message: "Write a poem about the moon" });
  assert.match(unknown.answer, /could not match/);
  assert.equal(unknown.evidence.length, 0);
  for (const input of [null, {}, { message: " " }, { message: "x".repeat(1001) }, { message: [] }]) {
    assert.throws(() => assistantReply(state, input), (err) => err.status === 400);
  }
});

test("assistant cites alert evidence, describes rules and cannot change alerts", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 21 });
  generateScenario(state, { scenario: "gradual_drift", days: 10, seed: 22 });
  runInvestigation(state);
  const before = JSON.stringify(state.alerts);
  const reply = assistantReply(state, { message: "Explain current alerts" });
  assert.ok(reply.evidence.length >= 3);
  assert.match(reply.sections.flatMap((s) => s.items).join(" "), /Three deviations produce MEDIUM/);
  assistantReply(state, { message: "Close all alerts" });
  assert.equal(JSON.stringify(state.alerts), before);
});

test("assistant flags stale or questionable readings and excludes future points from trends", () => {
  const state = initialState();
  state.measurements = [
    { measurement_id: "old", crew_id: "crew-aurora", metric_type: "heart_rate", value: 72, measured_at: "2026-10-20T08:00:00Z", source: "manual", quality_status: "valid", quality_flags: [] },
    { measurement_id: "recent", crew_id: "crew-aurora", metric_type: "heart_rate", value: 74, measured_at: "2026-10-21T08:00:00Z", source: "manual", quality_status: "valid", quality_flags: [] },
    { measurement_id: "future", crew_id: "crew-aurora", metric_type: "heart_rate", value: 190, measured_at: "2099-01-01T00:00:00Z", source: "manual", quality_status: "questionable", quality_flags: ["future_timestamp"] }
  ];
  const reply = assistantReply(state, { message: "Show heart rate trend" }, new Date("2026-10-24T08:00:00Z"));
  assert.match(reply.sections[0].items.join(" "), /freshness: future/);
  assert.match(reply.sections[0].items.join(" "), /changed by \+2 bpm/);
  assert.match(reply.sections[0].items.join(" "), /Verify this reading/);
});

test("assistant limits medical questions to data review and lists pending tasks accurately", () => {
  const state = initialState();
  const medical = assistantReply(state, { message: "Diagnose my condition and prescribe medication" });
  assert.match(medical.answer, /cannot diagnose/);
  assert.equal(medical.evidence.length, 0);
  state.followUps = [{ description: "Review readings", assigned_to: "Officer", status: "PENDING" }, { description: "Old task", status: "COMPLETED" }];
  const reply = assistantReply(state, { message: "What needs follow-up?" });
  assert.match(reply.answer, /1 pending/);
  assert.equal(reply.sections[0].items.length, 1);
});

test("replay timeline orders and deduplicates timestamps and handles empty missions", () => {
  assert.deepEqual(replayTimeline(initialState()).timestamps, []);
  const state = initialState();
  generateScenario(state, { days: 12 });
  state.measurements.reverse();
  const timeline = replayTimeline(state);
  assert.equal(timeline.timestamps.length, 12);
  assert.equal(timeline.total_readings, state.measurements.length);
  assert.deepEqual(timeline.timestamps, [...timeline.timestamps].sort());
  assert.throws(() => replayTimeline(state, "other"), (err) => err.status === 404);
});

test("replay hides future readings and never changes live workflows or baselines", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 21 });
  generateScenario(state, { scenario: "gradual_drift", days: 10, seed: 22 });
  runInvestigation(state);
  const before = JSON.stringify(state);
  const at = "2026-10-10T08:00:00.000Z";
  const snapshot = replaySnapshot(state, { at, metric: "heart_rate" });
  assert.equal(snapshot.preview_only, true);
  assert.equal(snapshot.as_of, at);
  assert.equal(snapshot.visible_count, state.measurements.filter((row) => new Date(row.measured_at) <= new Date(at)).length);
  assert.ok(snapshot.remaining_count > 0);
  assert.ok(snapshot.trend.every((row) => new Date(row.measured_at) <= new Date(at)));
  assert.ok(Object.values(snapshot.latest_readings).every((row) => new Date(row.measured_at) <= new Date(at)));
  assert.ok(snapshot.baselines.every((row) => !row.period_end || new Date(row.period_end) <= new Date(snapshot.finding.window_start)));
  assert.ok(snapshot.finding.evidence.every((e) => new Date(state.measurements.find((row) => row.measurement_id === e.measurement_id).measured_at) <= new Date(at)));
  assert.equal(JSON.stringify(state), before);
});

test("replay detects historical isolated spikes and can rewind after a drift finding", () => {
  const state = initialState();
  generateScenario(state, { scenario: "stable_baseline", days: 12, seed: 31 });
  generateScenario(state, { scenario: "isolated_unusual", days: 12, seed: 32 });
  const spike = state.measurements.find((row) => row.scenario_id === "isolated_unusual" && row.metric_type === "heart_rate" && row.value > 90);
  const snapshot = replaySnapshot(state, { at: spike.measured_at });
  assert.equal(snapshot.finding.severity, "LOW");
  assert.equal(snapshot.preview_alert_count, 0);
  generateScenario(state, { scenario: "gradual_drift", days: 10, seed: 22 });
  const times = replayTimeline(state).timestamps;
  const drift = replaySnapshot(state, { at: times.at(-1) });
  assert.ok(["MEDIUM", "HIGH"].includes(drift.finding.severity));
  assert.equal(drift.preview_alert_count, 1);
  const rewind = replaySnapshot(state, { at: times[0] });
  assert.equal(rewind.preview_alert_count, 0);
  assert.ok(rewind.finding.insufficient_baselines.length > 0);
  assert.equal(state.alerts.length, 0);
});

test("replay uses mission time for freshness and validates requested time and metric", () => {
  const state = initialState();
  generateScenario(state, { days: 2 });
  const at = replayTimeline(state).timestamps[0];
  const snapshot = replaySnapshot(state, { at, metric: "blood_oxygen" });
  assert.equal(snapshot.latest_readings.heart_rate.freshness, "current");
  assert.ok(snapshot.trend.every((row) => row.metric_type === "blood_oxygen"));
  for (const input of [{ at: "invalid" }, { at: "2099-01-01T00:00:00Z" }, { at, metric: "__proto__" }]) {
    assert.throws(() => replaySnapshot(state, input), (err) => err.status === 400);
  }
  assert.throws(() => replaySnapshot(initialState(), { at }), (err) => err.status === 404);
  assert.throws(() => runInvestigation(state, "crew-aurora", "invalid"), (err) => err.status === 400);
});

let passed = 0;
for (const item of tests) {
  try {
    item.fn();
    passed += 1;
    console.log(`ok - ${item.name}`);
  } catch (err) {
    console.error(`not ok - ${item.name}`);
    console.error(err);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} tests passed`);
