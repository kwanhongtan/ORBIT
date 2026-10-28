import crypto from "node:crypto";
import { parse } from "csv-parse/sync";

export const METRICS = {
  heart_rate: { label: "Heart Rate", unit: "bpm", min: 35, max: 210, staleHours: 36 },
  blood_oxygen: { label: "Blood Oxygen", unit: "percent", min: 70, max: 100, staleHours: 36 },
  body_temperature: { label: "Body Temperature", unit: "c", min: 34, max: 42, staleHours: 36 },
  systolic_bp: { label: "Systolic BP", unit: "mmHg", min: 70, max: 230, staleHours: 48 },
  diastolic_bp: { label: "Diastolic BP", unit: "mmHg", min: 40, max: 140, staleHours: 48 },
  sleep_duration: { label: "Sleep Duration", unit: "hours", min: 0, max: 16, staleHours: 48 },
  sleep_quality: { label: "Sleep Quality", unit: "score_1_5", min: 1, max: 5, staleHours: 48 },
  fatigue: { label: "Fatigue", unit: "score_1_10", min: 1, max: 10, staleHours: 48 },
  activity_level: { label: "Activity Level", unit: "score_1_10", min: 1, max: 10, staleHours: 48 },
  exercise_duration: { label: "Exercise Duration", unit: "minutes", min: 0, max: 300, staleHours: 48 },
  hydration: { label: "Hydration", unit: "score_1_10", min: 1, max: 10, staleHours: 48 },
  stress: { label: "Stress", unit: "score_1_10", min: 1, max: 10, staleHours: 48 },
  mood: { label: "Mood", unit: "score_1_10", min: 1, max: 10, staleHours: 48 },
  symptom_severity: { label: "Symptom Severity", unit: "score_0_10", min: 0, max: 10, staleHours: 48 },
  radiation_dose: { label: "Simulated Radiation Dose", unit: "mSv", min: 0, max: 250, staleHours: 168 },
  bone_assessment: { label: "Bone Assessment Placeholder", unit: "score_1_10", min: 1, max: 10, staleHours: 720 }
};

export const SCENARIOS = [
  { id: "stable_baseline", name: "Scenario A - Stable baseline", description: "Consistent synthetic observations for baseline establishment." },
  { id: "gradual_drift", name: "Scenario B - Gradual health drift", description: "Heart rate, fatigue, stress rise while sleep and hydration decline." },
  { id: "isolated_unusual", name: "Scenario C - Isolated unusual measurement", description: "One unusual signal without a combined finding." },
  { id: "poor_quality", name: "Scenario D - Poor-quality data", description: "Invalid, duplicate, stale, and missing-quality observations." },
  { id: "recovery", name: "Scenario E - Recovery and follow-up", description: "Later observations improve after an earlier drift alert." }
];

export function initialState() {
  const now = new Date().toISOString();
  return {
    mission: {
      mission_id: "ORBIT-ARES-01",
      mission_name: "ORBIT Ares Analog Mission",
      start_date: "2026-10-01",
      timezone: "Asia/Kuala_Lumpur",
      scenario_description: "Fictional local demonstration using simulated and manual health data.",
      updated_at: now
    },
    crew: [{ crew_id: "crew-aurora", name: "Commander Aurora Tan", role: "Fictional Flight Engineer", fictional: true }],
    measurements: [],
    importBatches: [],
    deletedImports: [],
    baselines: [],
    investigations: [],
    alerts: [],
    followUps: [],
    audits: [],
    aiExplanations: [],
    simulator: { status: "idle", scenario: null, seed: 42, last_generated_at: null }
  };
}

export function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function seeded(seed) {
  let value = Number(seed) || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function normal(rand, mean, spread) {
  return mean + (rand() + rand() + rand() - 1.5) * spread;
}

export function validateMeasurement(input, existing = [], currentTime = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["measurement must be an object"], duplicate: false, qualityFlags: ["invalid"] };
  }
  const errors = [];
  const metric = Object.hasOwn(METRICS, input.metric_type) ? METRICS[input.metric_type] : null;
  const measured = new Date(input.measured_at);
  const hasNumericValue = typeof input.value === "number" || (typeof input.value === "string" && input.value.trim() !== "");
  const value = hasNumericValue ? Number(input.value) : NaN;
  const validTimestamp = typeof input.measured_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.measured_at) && Number.isFinite(measured.getTime());
  if (!input.crew_id) errors.push("crew_id is required");
  if (!metric) errors.push("unsupported metric_type");
  if (!Number.isFinite(value)) errors.push("value must be numeric");
  if (!validTimestamp) errors.push("measured_at must be an ISO timestamp with timezone");
  if (metric && input.unit && input.unit !== metric.unit) errors.push(`unit must be ${metric.unit}`);
  if (metric && Number.isFinite(value) && (value < metric.min || value > metric.max)) errors.push(`value is outside supported technical range ${metric.min}-${metric.max}`);

  const duplicate = validTimestamp && existing.find((m) =>
    m.crew_id === input.crew_id &&
    m.metric_type === input.metric_type &&
    m.measured_at === measured.toISOString() &&
    Number(m.value) === value
  );
  const ageHours = (currentTime.getTime() - measured.getTime()) / 36e5;
  const futureHours = (measured.getTime() - currentTime.getTime()) / 36e5;
  const qualityFlags = [];
  if (duplicate) qualityFlags.push("duplicate");
  if (metric && ageHours > metric.staleHours) qualityFlags.push("stale");
  if (futureHours > 1) qualityFlags.push("future_timestamp");
  if (errors.length) qualityFlags.push("invalid");
  return { valid: errors.length === 0, errors, duplicate, qualityFlags };
}

export function createMeasurement(input, state, currentTime = new Date()) {
  const check = validateMeasurement(input, state.measurements, currentTime);
  if (!check.valid) {
    const err = new Error(check.errors.join("; "));
    err.status = 400;
    throw err;
  }
  const metric = METRICS[input.metric_type];
  const abrupt = findAbruptChange(input, state.measurements);
  const qualityFlags = [...check.qualityFlags, ...abrupt];
  return {
    measurement_id: input.measurement_id || uid("msr"),
    crew_id: input.crew_id,
    metric_type: input.metric_type,
    value: Number(input.value),
    unit: input.unit || metric.unit,
    measured_at: new Date(input.measured_at).toISOString(),
    ingested_at: nowIso(),
    source: input.source || "manual",
    quality_status: qualityFlags.includes("invalid")
      ? "invalid"
      : qualityFlags.some((flag) => flag !== "abrupt_change_verify")
        ? "questionable"
        : "valid",
    quality_flags: qualityFlags,
    notes: input.notes || "",
    scenario_id: input.scenario_id || null,
    generated_batch_id: input.generated_batch_id || null
  };
}

function findAbruptChange(input, measurements) {
  const prior = measurements
    .filter((m) => m.crew_id === input.crew_id && m.metric_type === input.metric_type && m.quality_status === "valid")
    .sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at))[0];
  if (!prior) return [];
  const metric = METRICS[input.metric_type];
  const delta = Math.abs(Number(input.value) - Number(prior.value));
  const range = metric.max - metric.min;
  return delta > range * 0.35 ? ["abrupt_change_verify"] : [];
}

export function calculateBaselines(state, crewId = "crew-aurora", asOf = new Date(), minSamples = 8) {
  const baselines = Object.keys(METRICS).map((metricType) => {
    let valid = state.measurements
      .filter((m) => m.crew_id === crewId && m.metric_type === metricType && m.quality_status === "valid" && new Date(m.measured_at) <= asOf)
      .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
    const stableScenario = valid.filter((m) => m.scenario_id === "stable_baseline");
    if (stableScenario.length >= minSamples) valid = stableScenario;
    const values = valid.map((m) => Number(m.value));
    const count = values.length;
    const mean = count ? values.reduce((a, b) => a + b, 0) / count : null;
    const sorted = [...values].sort((a, b) => a - b);
    const median = count ? quantile(sorted, 0.5) : null;
    const variance = count > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (count - 1) : null;
    const stddev = variance === null ? null : Math.sqrt(variance);
    const deviations = median === null ? [] : values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = deviations.length ? quantile(deviations, 0.5) : null;
    const spread = Math.max(stddev || 0, (mad || 0) * 1.4826, 0.5);
    return {
      baseline_id: `${crewId}-${metricType}`,
      crew_id: crewId,
      metric_type: metricType,
      sample_count: count,
      mean,
      median,
      stddev,
      mad,
      lower_bound: count >= minSamples ? mean - 2 * spread : null,
      upper_bound: count >= minSamples ? mean + 2 * spread : null,
      period_start: valid[0]?.measured_at || null,
      period_end: valid.at(-1)?.measured_at || null,
      last_updated: nowIso(),
      sufficient: count >= minSamples,
      explanation: count >= minSamples ? `Calculated from ${count} valid measurements.` : `Baseline not established; ${count}/${minSamples} valid measurements available.`
    };
  });
  state.baselines = baselines;
  return baselines;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

export function runInvestigation(state, crewId = "crew-aurora", asOf = null) {
  if (asOf !== null) {
    asOf = new Date(asOf);
    if (!Number.isFinite(asOf.getTime())) throw Object.assign(new Error("Investigation time must be a valid timestamp"), { status: 400 });
  }
  const latestMeasurementTime = state.measurements
    .filter((m) => m.crew_id === crewId && m.quality_status !== "invalid" && !m.quality_flags?.includes("future_timestamp"))
    .map((m) => new Date(m.measured_at))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b - a)[0];
  asOf = asOf || latestMeasurementTime || new Date();
  const windowStart = new Date(asOf.getTime() - 36 * 36e5);
  const baselines = calculateBaselines(state, crewId, windowStart);
  const recent = state.measurements.filter((m) =>
    m.crew_id === crewId &&
    new Date(m.measured_at) >= windowStart &&
    new Date(m.measured_at) <= asOf
  );
  const usable = recent.filter((m) => m.quality_status === "valid" && !m.quality_flags?.includes("future_timestamp"));
  const qualityIssues = recent.filter((m) => !usable.includes(m));
  const missingMetrics = [];
  const insufficientBaselines = [];
  const evidence = [];
  for (const metric of ["heart_rate", "sleep_duration", "fatigue", "stress", "hydration", "blood_oxygen"]) {
    const latest = usable.filter((m) => m.metric_type === metric).sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at))[0];
    const baseline = baselines.find((b) => b.metric_type === metric);
    if (!latest) missingMetrics.push(metric);
    if (!baseline?.sufficient) insufficientBaselines.push(metric);
    if (!latest || !baseline?.sufficient) continue;
    const direction = metric === "sleep_duration" || metric === "hydration" || metric === "blood_oxygen" ? "low" : "high";
    const deviates = direction === "high" ? latest.value > baseline.upper_bound : latest.value < baseline.lower_bound;
    if (deviates) evidence.push({
      metric_type: metric,
      measurement_id: latest.measurement_id,
      value: latest.value,
      baseline_mean: round(baseline.mean),
      bound: direction === "high" ? round(baseline.upper_bound) : round(baseline.lower_bound),
      direction
    });
  }
  let severity = "INFORMATIONAL";
  let title = "No combined health drift finding";
  let explanation = "The investigator did not find enough reliable overlapping baseline deviations for a combined alert.";
  if (evidence.length >= 4) {
    severity = "HIGH";
    title = "Multi-signal health drift pattern";
    explanation = "Multiple valid measurements deviated from the crew member's personal baseline within the observation window.";
  } else if (evidence.length >= 3) {
    severity = "MEDIUM";
    title = "Possible combined health drift";
    explanation = "Several valid measurements deviated from personal baseline and should be reviewed.";
  } else if (evidence.length === 1) {
    severity = "LOW";
    title = "Isolated unusual measurement";
    explanation = "One valid measurement deviated from personal baseline; this is not enough for a combined drift finding.";
  }
  if (qualityIssues.length && severity !== "HIGH") {
    explanation += ` ${qualityIssues.length} recent measurement(s) had quality limitations and were not treated as reliable evidence.`;
  }
  const investigation = {
    investigation_id: uid("inv"),
    crew_id: crewId,
    rule_id: "multi_signal_personal_baseline_drift",
    title,
    severity,
    explanation,
    evidence,
    quality_limitations: qualityIssues.map((m) => ({ measurement_id: m.measurement_id, metric_type: m.metric_type, flags: m.quality_flags })),
    missing_metrics: missingMetrics,
    insufficient_baselines: insufficientBaselines,
    observation_window_hours: 36,
    as_of: asOf.toISOString(),
    window_start: windowStart.toISOString(),
    created_at: nowIso()
  };
  state.investigations.unshift(investigation);
  if (["MEDIUM", "HIGH"].includes(severity)) upsertAlertFromInvestigation(state, investigation);
  audit(state, "investigation.run", investigation.investigation_id, severity);
  return investigation;
}

function upsertAlertFromInvestigation(state, investigation) {
  const open = state.alerts.find((a) => a.rule_id === investigation.rule_id && a.crew_id === investigation.crew_id && !["RESOLVED", "FALSE_POSITIVE"].includes(a.status));
  if (open) {
    open.last_updated = nowIso();
    open.severity = maxSeverity(open.severity, investigation.severity);
    open.related_measurement_ids = [...new Set([...open.related_measurement_ids, ...investigation.evidence.map((e) => e.measurement_id)])];
    open.evidence_summary = investigation.evidence;
    open.explanation = investigation.explanation;
    audit(state, "alert.updated", open.alert_id, open.status);
    return open;
  }
  const alert = {
    alert_id: uid("alert"),
    crew_id: investigation.crew_id,
    rule_id: investigation.rule_id,
    investigation_id: investigation.investigation_id,
    related_metric_ids: investigation.evidence.map((e) => e.metric_type),
    related_measurement_ids: investigation.evidence.map((e) => e.measurement_id),
    severity: investigation.severity,
    title: investigation.title,
    explanation: investigation.explanation,
    evidence_summary: investigation.evidence,
    created_at: nowIso(),
    last_updated: nowIso(),
    status: "NEW",
    response_checklist: responseChecklist(investigation.severity),
    acknowledged_by: null,
    acknowledged_at: null,
    resolution_notes: "",
    notes: []
  };
  state.alerts.unshift(alert);
  audit(state, "alert.created", alert.alert_id, alert.severity);
  return alert;
}

function responseChecklist(severity) {
  const base = [
    "Verify the supporting measurements and quality flags.",
    "Record whether the crew member reports related symptoms or context.",
    "Collect follow-up measurements after the configured review interval."
  ];
  if (severity === "HIGH") {
    return [
      ...base,
      "Escalate according to mission-approved medical communication protocol placeholder.",
      "Do not treat this software priority as an autonomous diagnosis."
    ];
  }
  return [
    ...base,
    "Continue monitoring and document the review decision."
  ];
}

function maxSeverity(a, b) {
  const order = ["INFORMATIONAL", "LOW", "MEDIUM", "HIGH"];
  return order.indexOf(b) > order.indexOf(a) ? b : a;
}

export function transitionAlert(state, alertId, action, body = {}) {
  const alert = state.alerts.find((a) => a.alert_id === alertId);
  if (!alert) return null;
  if (action === "acknowledge") {
    alert.status = "ACKNOWLEDGED";
    alert.acknowledged_by = body.user || "demo-user";
    alert.acknowledged_at = nowIso();
  } else if (action === "investigate") {
    alert.status = "INVESTIGATING";
  } else if (action === "resolve") {
    if (!body.resolution_notes) throw Object.assign(new Error("resolution_notes is required"), { status: 400 });
    alert.status = "RESOLVED";
    alert.resolution_notes = body.resolution_notes;
  } else if (action === "false-positive") {
    if (!body.reason) throw Object.assign(new Error("reason is required"), { status: 400 });
    alert.status = "FALSE_POSITIVE";
    alert.resolution_notes = body.reason;
  }
  if (body.note) alert.notes.push({ at: nowIso(), text: body.note });
  alert.last_updated = nowIso();
  audit(state, `alert.${action}`, alert.alert_id, alert.status);
  return alert;
}

export function createFollowUp(state, body) {
  const alert = state.alerts.find((a) => a.alert_id === body.alert_id);
  if (!alert) throw Object.assign(new Error("linked alert not found"), { status: 404 });
  const action = {
    action_id: uid("follow"),
    alert_id: body.alert_id,
    description: body.description || "Review linked ORBIT alert and collect follow-up measurements.",
    assigned_to: body.assigned_to || "Mission Health Officer",
    due_at: body.due_at || null,
    status: "PENDING",
    created_at: nowIso(),
    completion_at: null,
    completion_notes: ""
  };
  state.followUps.unshift(action);
  audit(state, "followup.created", action.action_id, action.status);
  return action;
}

export function updateFollowUp(state, actionId, body) {
  const action = state.followUps.find((a) => a.action_id === actionId);
  if (!action) return null;
  if (body.status) action.status = body.status;
  if (body.completion_notes !== undefined) action.completion_notes = body.completion_notes;
  if (body.status === "COMPLETED") action.completion_at = nowIso();
  audit(state, "followup.updated", action.action_id, action.status);
  return action;
}

export function generateScenario(state, { scenario = "stable_baseline", days = 7, seed = 42, crew_id = "crew-aurora" } = {}) {
  const scenarioInfo = SCENARIOS.find((s) => s.id === scenario);
  if (!scenarioInfo) throw Object.assign(new Error("unknown scenario"), { status: 400 });
  const batch = `${scenario}-${seed}-${days}`;
  const existingBatch = state.measurements.some((m) => m.generated_batch_id === batch);
  if (existingBatch) return { batch_id: batch, created: 0, skipped_duplicate_batch: true };
  const rand = seeded(seed);
  // A separate stream keeps the background readings unchanged when placing the spike.
  const positionRandom = seeded(seed);
  positionRandom();
  positionRandom();
  const unusualDay = days > 2 ? 1 + Math.floor(positionRandom() * (days - 2)) : 0;
  const created = [];
  const latest = state.measurements
    .filter((m) => m.crew_id === crew_id)
    .map((m) => new Date(m.measured_at))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b - a)[0];
  const start = scenario === "stable_baseline" || !latest ? new Date(Date.UTC(2026, 9, 1, 8, 0, 0)) : new Date(latest.getTime() + 864e5);
  const base = { heart_rate: 72, blood_oxygen: 98, body_temperature: 36.7, sleep_duration: 7.4, sleep_quality: 4, fatigue: 3, activity_level: 6, exercise_duration: 45, hydration: 7, stress: 3, mood: 7, symptom_severity: 1, radiation_dose: 0.08, bone_assessment: 8, systolic_bp: 118, diastolic_bp: 76 };
  for (let day = 0; day < days; day += 1) {
    const measuredAt = new Date(start.getTime() + day * 864e5).toISOString();
    const drift = scenario === "gradual_drift" ? day / Math.max(days - 1, 1) : scenario === "recovery" ? Math.max(0, 1 - day / Math.max(days - 1, 1)) : 0;
    const metrics = { ...base };
    metrics.heart_rate += drift * 20;
    metrics.sleep_duration -= drift * 2.1;
    metrics.fatigue += drift * 5;
    metrics.stress += drift * 4;
    metrics.mood -= drift * 3;
    metrics.symptom_severity += drift * 3;
    metrics.hydration -= drift * 2.5;
    if (scenario === "isolated_unusual" && day === unusualDay) metrics.heart_rate += 28;
    for (const [metric, value] of Object.entries(metrics)) {
      let finalValue = round(normal(rand, value, metric.includes("duration") ? 0.3 : 1.7));
      if (["sleep_quality", "fatigue", "activity_level", "hydration", "stress"].includes(metric)) finalValue = Math.max(METRICS[metric].min, Math.min(METRICS[metric].max, Math.round(finalValue)));
      const input = { crew_id, metric_type: metric, value: finalValue, unit: METRICS[metric].unit, measured_at: measuredAt, source: "simulated_sensor", notes: scenarioInfo.description, scenario_id: scenario, generated_batch_id: batch };
      if (scenario === "poor_quality" && day === days - 1 && metric === "blood_oxygen") input.value = 135;
      if (scenario === "poor_quality" && day === days - 2 && metric === "heart_rate") input.measured_at = new Date(start.getTime() - 10 * 864e5).toISOString();
      const qualityClock = scenario === "poor_quality" && day === days - 2 && metric === "heart_rate"
        ? new Date(start.getTime() + (day + 5) * 864e5)
        : new Date(new Date(input.measured_at).getTime() + 36e5);
      try {
        created.push(createMeasurement(input, state, qualityClock));
      } catch {
        created.push({ ...input, measurement_id: uid("msr"), ingested_at: nowIso(), quality_status: "invalid", quality_flags: ["invalid"], value: Number(input.value) });
      }
    }
  }
  if (scenario === "poor_quality") {
    const dupe = { ...created[0], measurement_id: uid("msr"), quality_status: "questionable", quality_flags: ["duplicate"], ingested_at: nowIso() };
    created.push(dupe);
  }
  state.measurements.push(...created);
  state.simulator = { status: "idle", scenario, seed, last_generated_at: nowIso() };
  audit(state, "simulator.generate", batch, `${created.length} measurements`);
  return { batch_id: batch, created: created.length, skipped_duplicate_batch: false };
}

export function clearDemoData(state) {
  const before = state.measurements.length;
  state.measurements = state.measurements.filter((m) => !m.scenario_id && m.source !== "imported_sample");
  state.baselines = [];
  state.investigations = [];
  state.alerts = [];
  state.followUps = [];
  audit(state, "data.clear_demo", "measurements", `${before - state.measurements.length} removed`);
  return { removed: before - state.measurements.length };
}

export function latestReadings(state, crewId = "crew-aurora", currentTime = new Date()) {
  const latest = {};
  for (const row of state.measurements) {
    if (row.crew_id !== crewId || !METRICS[row.metric_type]) continue;
    const timestamp = new Date(row.measured_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    if (!latest[row.metric_type] || timestamp > new Date(latest[row.metric_type].measured_at).getTime()) {
      latest[row.metric_type] = row;
    }
  }
  return Object.fromEntries(Object.entries(latest).map(([metric, row]) => {
    const ageHours = (currentTime.getTime() - new Date(row.measured_at).getTime()) / 36e5;
    const freshness = ageHours < 0 ? "future" : ageHours > METRICS[metric].staleHours ? "stale" : "current";
    return [metric, { ...row, freshness, age_hours: round(ageHours) }];
  }));
}

export function summary(state) {
  const latest = [...state.measurements].sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at))[0];
  return {
    mission: state.mission,
    crew: state.crew[0],
    counts: {
      measurements: state.measurements.length,
      valid_measurements: state.measurements.filter((m) => m.quality_status === "valid").length,
      quality_warnings: state.measurements.filter((m) => m.quality_status !== "valid").length,
      active_alerts: state.alerts.filter((a) => !["RESOLVED", "FALSE_POSITIVE"].includes(a.status)).length,
      open_followups: state.followUps.filter((f) => !["COMPLETED", "CANCELLED"].includes(f.status)).length
    },
    latest_measurement_at: latest?.measured_at || null,
    latest_readings: latestReadings(state, state.crew[0]?.crew_id),
    latest_investigation: state.investigations[0] || null,
    latest_ai: state.aiExplanations[0] || null
  };
}

export function csv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return `${headers.join(",")}\n${rows.map((row) => headers.map((h) => esc(typeof row[h] === "object" ? JSON.stringify(row[h]) : row[h])).join(",")).join("\n")}\n`;
}

export function parseCsv(text) {
  try {
    if (!text.trim()) throw new Error("CSV is empty");
    return parse(text, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      max_record_size: 100000,
      columns: (headers) => {
        if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate column names");
        for (const column of ["crew_id", "metric_type", "value", "measured_at"]) {
          if (!headers.includes(column)) throw new Error(`CSV is missing required column: ${column}`);
        }
        return headers;
      }
    });
  } catch (err) {
    throw Object.assign(new Error(`Invalid CSV: ${err.message}`), { status: 400 });
  }
}

export function importMeasurements(state, text, { commit = false, currentTime = new Date(), filename = "Pasted CSV" } = {}) {
  const records = parseCsv(text);
  const workingState = { ...state, measurements: [...state.measurements] };
  const accepted = [];
  const errors = [];
  let duplicates = 0;
  for (const [index, row] of records.entries()) {
    try {
      if (!state.crew.some((member) => member.crew_id === row.crew_id)) throw new Error("Unknown crew_id");
      const measurement = createMeasurement({ ...row, source: row.source || "csv_import" }, workingState, currentTime);
      if (measurement.quality_flags.includes("duplicate")) {
        duplicates += 1;
        continue;
      }
      accepted.push(measurement);
      workingState.measurements.push(measurement);
    } catch (err) {
      errors.push({ record: index + 1, error: err.message });
    }
  }
  let batchId = null;
  if (commit && accepted.length) {
    batchId = uid("import");
    accepted.forEach((row) => { row.import_batch_id = batchId; });
    state.importBatches ||= [];
    state.importBatches.unshift({ batch_id: batchId, filename: String(filename).split(/[\\/]/).at(-1).slice(0, 200) || "Pasted CSV", imported_at: nowIso() });
    state.measurements.push(...accepted);
    audit(state, "measurements.imported", batchId, `${accepted.length} accepted; ${errors.length} rejected; ${duplicates} duplicates skipped`);
  }
  return { accepted: accepted.length, rejected: errors.length, duplicates, errors, preview: accepted.slice(0, 20), total: records.length, batch_id: batchId };
}

function isLegacyImport(row) {
  return !row.import_batch_id && ["csv_import", "imported_sample"].includes(row.source);
}

export function listImports(state) {
  const batches = new Map((state.importBatches || []).map((batch) => [batch.batch_id, { ...batch, count: 0 }]));
  for (const row of state.measurements) {
    const id = row.import_batch_id || (isLegacyImport(row) ? "legacy-csv" : null);
    if (!id) continue;
    if (!batches.has(id)) batches.set(id, { batch_id: id, filename: id === "legacy-csv" ? "Earlier CSV imports (grouped)" : "CSV import", imported_at: row.ingested_at || null, count: 0 });
    batches.get(id).count += 1;
  }
  return {
    active: [...batches.values()].filter((batch) => batch.count > 0),
    deleted: (state.deletedImports || []).map((batch) => ({ batch_id: batch.batch_id, filename: batch.filename, deleted_at: batch.deleted_at, count: batch.measurements.length }))
  };
}

export function deleteImport(state, batchId, { confirm, expected_count } = {}) {
  if (confirm !== true) throw Object.assign(new Error("Deletion confirmation is required"), { status: 400 });
  const batch = listImports(state).active.find((item) => item.batch_id === batchId);
  if (!batch) throw Object.assign(new Error("Import not found"), { status: 404 });
  if (expected_count !== batch.count) throw Object.assign(new Error("Import record count changed; refresh and confirm again"), { status: 409 });
  const removed = state.measurements.filter((row) => batchId === "legacy-csv" ? isLegacyImport(row) : row.import_batch_id === batchId);
  const ids = new Set(removed.map((row) => row.measurement_id));
  const crewIds = new Set(removed.map((row) => row.crew_id));
  const investigations = state.investigations.filter((item) => [...(item.evidence || []), ...(item.quality_limitations || [])].some((e) => ids.has(e.measurement_id)));
  const investigationIds = new Set(investigations.map((item) => item.investigation_id));
  const alerts = state.alerts.filter((item) => investigationIds.has(item.investigation_id) || (item.related_measurement_ids || []).some((id) => ids.has(id)) || (item.evidence_summary || []).some((e) => ids.has(e.measurement_id)));
  const alertIds = new Set(alerts.map((item) => item.alert_id));
  const followUps = state.followUps.filter((item) => alertIds.has(item.alert_id));
  state.deletedImports ||= [];
  state.deletedImports.unshift({ ...batch, batch_id: uid("deleted-import"), original_batch_id: batchId, deleted_at: nowIso(), measurements: removed, dependent_records: { investigations, alerts, followUps, aiExplanations: state.aiExplanations } });
  state.measurements = state.measurements.filter((row) => !ids.has(row.measurement_id));
  state.baselines = state.baselines.filter((item) => !crewIds.has(item.crew_id));
  state.investigations = state.investigations.filter((item) => !investigationIds.has(item.investigation_id));
  state.alerts = state.alerts.filter((item) => !alertIds.has(item.alert_id));
  state.followUps = state.followUps.filter((item) => !alertIds.has(item.alert_id));
  state.aiExplanations = [];
  audit(state, "import.deleted", batchId, `${removed.length} readings moved to deleted imports`);
  return { removed: removed.length };
}

export function restoreImport(state, deletedId) {
  const deleted = (state.deletedImports || []).find((batch) => batch.batch_id === deletedId);
  if (!deleted) throw Object.assign(new Error("Deleted import not found"), { status: 404 });
  const existingIds = new Set(state.measurements.map((row) => row.measurement_id));
  const existingReadings = new Set(state.measurements.map((row) => JSON.stringify([row.crew_id, row.metric_type, new Date(row.measured_at).getTime(), Number(row.value)])));
  if (deleted.measurements.some((row) => existingIds.has(row.measurement_id) || existingReadings.has(JSON.stringify([row.crew_id, row.metric_type, new Date(row.measured_at).getTime(), Number(row.value)])))) {
    throw Object.assign(new Error("Matching readings already exist; restore cancelled to prevent duplicates"), { status: 409 });
  }
  state.measurements.push(...deleted.measurements);
  const crewIds = new Set(deleted.measurements.map((row) => row.crew_id));
  state.baselines = state.baselines.filter((item) => !crewIds.has(item.crew_id));
  // Restore readings only; old decisions must be reviewed against the current data.
  deleted.restored_at = nowIso();
  state.deletedImports = state.deletedImports.filter((batch) => batch.batch_id !== deletedId);
  audit(state, "import.restored", deleted.original_batch_id, `${deleted.measurements.length} readings restored; rerun investigation`);
  return { restored: deleted.measurements.length };
}

export function localAiExplanation(state) {
  const s = summary(state);
  const active = state.alerts.filter((a) => !["RESOLVED", "FALSE_POSITIVE"].includes(a.status));
  const payload = {
    explanation_id: uid("ai"),
    created_at: nowIso(),
    source: "deterministic_fallback",
    summary: active.length ? `${active.length} active ORBIT alert(s) require review.` : "No active combined drift alert is currently open.",
    observations: active.slice(0, 3).map((a) => a.title),
    supporting_evidence: active.flatMap((a) => a.evidence_summary).slice(0, 8),
    uncertainty: "This is a simulated educational system and not a medical diagnosis.",
    suggested_follow_up: active.length ? ["Review alert evidence", "Collect follow-up measurements", "Document the resolution decision separately"] : ["Continue routine monitoring"],
    data_limitations: s.counts.quality_warnings ? [`${s.counts.quality_warnings} measurement(s) have quality limitations.`] : ["No recent quality limitations detected in the current summary."]
  };
  state.aiExplanations.unshift(payload);
  audit(state, "ai.fallback", payload.explanation_id, payload.summary);
  return payload;
}

export function audit(state, event_type, entity_id, detail) {
  state.audits.unshift({ audit_id: uid("audit"), event_type, entity_id, detail, created_at: nowIso() });
}

export function round(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
}
