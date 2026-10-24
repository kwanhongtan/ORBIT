import assert from "node:assert/strict";
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
  latestReadings
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
  const investigation = runInvestigation(state);
  assert.equal(investigation.severity, "LOW");
  assert.equal(state.alerts.length, 0);
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
