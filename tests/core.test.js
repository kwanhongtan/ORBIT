import test from "node:test";
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
  localAiExplanation
} from "../src/core.js";

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
