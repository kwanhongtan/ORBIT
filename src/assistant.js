import { METRICS, latestReadings, round } from "./core.js";

const aliases = {
  heart_rate: ["heart rate", "heart_rate", "pulse", "cardio"],
  blood_oxygen: ["oxygen", "blood_oxygen", "spo2", "saturation"],
  body_temperature: ["temperature", "body_temperature"],
  systolic_bp: ["systolic", "systolic_bp", "blood pressure"],
  diastolic_bp: ["diastolic", "diastolic_bp", "blood pressure"],
  sleep_duration: ["sleep duration", "sleep_duration", "sleep hours", "sleep"],
  sleep_quality: ["sleep quality", "sleep_quality"],
  fatigue: ["fatigue", "tiredness"],
  activity_level: ["activity", "activity_level"],
  exercise_duration: ["exercise", "exercise_duration"],
  hydration: ["hydration"],
  stress: ["stress"],
  mood: ["mood"],
  symptom_severity: ["symptom", "symptoms", "symptom_severity"],
  radiation_dose: ["radiation", "dose", "radiation_dose"],
  bone_assessment: ["bone", "bone_assessment"]
};

function mentions(text, phrase) {
  return (` ${text.replace(/[^a-z0-9_]+/g, " ")} `).includes(` ${phrase} `);
}

export function assistantReply(state, input, currentTime = new Date()) {
  if (!input || typeof input.message !== "string" || !input.message.trim() || input.message.length > 1000) {
    throw Object.assign(new Error("Question must contain 1 to 1000 characters"), { status: 400 });
  }
  const message = input.message.trim().toLowerCase();
  const crewId = state.crew[0]?.crew_id;
  const measurements = state.measurements.filter((row) => row.crew_id === crewId);
  const readings = latestReadings(state, crewId, currentTime);
  const alerts = state.alerts.filter((row) => row.crew_id === crewId && !["RESOLVED", "FALSE_POSITIVE"].includes(row.status));
  const response = {
    source: "local_rules",
    generated_at: currentTime.toISOString(),
    context_metric: null,
    answer: "",
    sections: [],
    evidence: [],
    actions: [],
    limitations: ["Local rule-based response; no external language model. Describes stored records and cannot establish medical normality or a diagnosis."]
  };
  const section = (title, items) => response.sections.push({ title, items });
  const action = (label, view) => response.actions.push({ label, view, metric: response.context_metric });
  const cite = (row) => {
    if (!row || response.evidence.some((item) => item.measurement_id === row.measurement_id)) return;
    response.evidence.push({ measurement_id: row.measurement_id, label: METRICS[row.metric_type]?.label || row.metric_type, value: row.value, unit: row.unit, measured_at: row.measured_at, source: row.source, quality_status: row.quality_status, quality_flags: row.quality_flags || [], freshness: readings[row.metric_type]?.measurement_id === row.measurement_id ? readings[row.metric_type].freshness : null });
  };
  const selected = Object.entries(aliases).filter(([, names]) => names.some((name) => mentions(message, name))).map(([key]) => key);
  if (selected.includes("sleep_quality") && selected.includes("sleep_duration") && !message.includes("duration") && !message.includes("hours")) selected.splice(selected.indexOf("sleep_duration"), 1);
  const contextFollowUp = (/\b(it|its|that|this)\b/.test(message) && !/\b(alert|alerts|task|tasks|follow|summary)\b/.test(message)) || /^(what about |how about )?(the )?(baseline|trend|quality|more|why)[?!. ]*$/.test(message);
  if (!selected.length && Object.hasOwn(METRICS, input.context_metric) && contextFollowUp) selected.push(input.context_metric);

  if (/\b(diagnos\w*|treat\w*|medication|medicine|prescri\w*|dosage)\b/.test(message) || /\b(do i have|am i sick|am i healthy|is it safe)\b/.test(message)) {
    response.answer = "I can explain ORBIT's stored readings and rule-based findings, but I cannot diagnose a condition, prescribe treatment, or determine whether someone is healthy.";
    section("Review", ["Verify the readings and their quality with the responsible health professional or mission health officer."]);
    action("Review readings", "timeline");
    return response;
  }

  if (selected.length) {
    response.context_metric = selected.length === 1 ? selected[0] : null;
    response.answer = `Recorded review: ${selected.map((key) => METRICS[key].label).join(", ")}.`;
    for (const key of selected) {
      const latest = readings[key];
      const config = METRICS[key];
      if (!latest) { section(config.label, ["No reading has been recorded for this metric."]); continue; }
      cite(latest);
      const items = [`Latest recorded value: ${latest.value} ${config.unit} at ${latest.measured_at}. Source: ${latest.source}.`, `Input quality: ${latest.quality_status}; freshness: ${latest.freshness}.${latest.quality_flags?.length ? ` Flags: ${latest.quality_flags.join(", ")}.` : ""}`];
      const baseline = state.baselines.find((row) => row.crew_id === crewId && row.metric_type === key);
      if (baseline?.sufficient && Number.isFinite(baseline.mean) && Number.isFinite(baseline.lower_bound) && Number.isFinite(baseline.upper_bound)) {
        const position = latest.value < baseline.lower_bound ? "below" : latest.value > baseline.upper_bound ? "above" : "within";
        items.push(`Saved personal baseline: mean ${round(baseline.mean)} ${config.unit}, comparison bounds ${round(baseline.lower_bound)} to ${round(baseline.upper_bound)}, from ${baseline.sample_count} readings. Latest value is ${position} those bounds.`);
        items.push(`Baseline last calculated: ${baseline.last_updated}. This is a personal comparison, not a clinical reference range.`);
      } else items.push(`A sufficient saved baseline is not available (${baseline?.sample_count || 0}/8 minimum readings). Recalculate baselines after collecting suitable data.`);
      const recent = measurements.filter((row) => row.metric_type === key && row.quality_status === "valid" && !(row.quality_flags || []).includes("future_timestamp") && new Date(row.measured_at) <= currentTime).sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at)).slice(-7);
      if (recent.length >= 2) {
        const first = recent[0], last = recent.at(-1);
        const delta = round(last.value - first.value);
        items.push(`Across the last ${recent.length} usable recorded readings (${first.measured_at} to ${last.measured_at}), the value changed by ${delta > 0 ? "+" : ""}${delta} ${config.unit}. This describes the stored interval, not a forecast.`);
        cite(first);
        cite(last);
      } else items.push("At least two usable, non-future readings are needed to describe a change over time.");
      if (latest.freshness !== "current" || latest.quality_status !== "valid" || latest.quality_flags?.length) items.push("Verify this reading before relying on its baseline comparison.");
      if (["radiation_dose", "bone_assessment"].includes(key)) items.push("This metric is a prototype placeholder, not an implemented clinical assessment.");
      section(config.label, items);
    }
    action("Review graph", "timeline");
    action("Review baselines", "investigator");
  } else if (/\b(follow.up|task|action|next|pending)\b/.test(message)) {
    const tasks = state.followUps.filter((row) => !["COMPLETED", "CANCELLED"].includes(row.status));
    response.answer = `${tasks.length} pending follow-up task(s) and ${alerts.length} open alert(s) are recorded.`;
    section("Pending tasks", tasks.length ? tasks.map((row) => `${row.description} Assigned to ${row.assigned_to}; status ${row.status}; due ${row.due_at || "not set"}.`) : ["No pending follow-up tasks have been recorded."]);
    section("Review sequence", ["Review alert evidence and quality flags.", "Record any follow-up measurements and review decisions.", "Completing a task does not resolve its alert; resolution requires a separate recorded review."]);
    action("Open Action Centre", "alerts");
  } else if (/\b(alert|alerts|drift|finding|findings|investigation|unusual|anomal\w*)\b/.test(message)) {
    response.answer = alerts.length ? `${alerts.length} open alert(s) require recorded review.` : "No open alert is recorded. This does not establish that all readings are normal.";
    section("Recorded alerts", alerts.length ? alerts.map((row) => `${row.title}: ${row.severity}, ${row.status}. ${row.explanation}`) : ["Run the investigator to evaluate the current records."]);
    for (const alert of alerts) for (const e of alert.evidence_summary || []) cite(measurements.find((row) => row.measurement_id === e.measurement_id));
    section("How the current rule works", ["The investigator compares the latest usable heart rate, sleep duration, fatigue, stress, hydration and oxygen readings with personal baseline bounds within its 36-hour observation window.", "Three deviations produce MEDIUM priority; four or more produce HIGH. A single deviation is a LOW finding and does not create a combined drift alert. Two deviations currently remain informational.", "Existing alerts stay open until a user records a resolution; the assistant cannot create or close them."]);
    action("Review investigation", "investigator");
    action("Open Action Centre", "alerts");
  } else if (/\b(quality|missing|duplicate|duplicates|invalid|stale|outdated|reliable|flag|flags)\b/.test(message)) {
    const flagged = measurements.filter((row) => row.quality_status !== "valid" || row.quality_flags?.length);
    const stale = Object.values(readings).filter((row) => row.freshness !== "current");
    response.answer = `${flagged.length} stored reading(s) have input-quality flags; ${stale.length} latest metric reading(s) are outdated or future-dated.`;
    section("Data coverage", [`${Object.keys(readings).length} of ${Object.keys(METRICS).length} supported metrics have a recorded reading.`, "Quality checks assess input consistency, not medical accuracy. Historical flags reflect checks at ingestion; freshness is checked again against the current time."]);
    [...flagged.slice(-4), ...stale.slice(0, 4)].forEach(cite);
    action("Review records", "timeline");
  } else if (/\b(baseline|baselines)\b/.test(message)) {
    response.answer = "Personal baselines describe the crew member's recorded comparison values.";
    section("Calculation", ["At least eight valid readings are required for each metric. The calculation stores a mean and variation-based comparison bounds; stable-baseline scenario records are preferred when enough exist.", "The investigator calculates baselines using records before its observation window to avoid using those recent readings as their own reference.", "These are prototype statistical bounds, not clinical normal ranges. Ask about a specific metric for its saved baseline."]);
    action("Review baselines", "investigator");
  } else if (/\b(summary|summarise|summarize|overview|status|health|mission|today|overall)\b/.test(message)) {
    response.answer = `${measurements.length} stored readings, ${alerts.length} open alert(s), and ${state.followUps.filter((row) => !["COMPLETED", "CANCELLED"].includes(row.status)).length} pending follow-up task(s).`;
    section("Latest recorded signals", Object.entries(readings).slice(0, 6).map(([key, row]) => `${METRICS[key].label}: ${row.value} ${row.unit}; ${row.measured_at}; ${row.freshness}.`));
    Object.values(readings).slice(0, 6).forEach(cite);
    if (!measurements.length) section("Data needed", ["There are no active readings. Add a check-in, import CSV records, or generate a simulation before reviewing health data."]);
    action("Review overview", "overview");
    action("Review readings", "timeline");
  } else {
    response.answer = "I could not match that question to a supported ORBIT data review. I can review metrics, personal baselines, recorded alerts, data quality, and follow-up tasks.";
    section("Try asking", ["Show my heart rate trend", "Explain current alerts", "Review data quality", "What needs follow-up?"]);
  }
  response.evidence = response.evidence.slice(0, 12);
  return response;
}
