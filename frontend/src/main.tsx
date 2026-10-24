import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  HeartPulse,
  ListChecks,
  Play,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  WifiOff
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import "./styles.css";

type Measurement = {
  measurement_id: string;
  metric_type: string;
  value: number;
  unit: string;
  measured_at: string;
  source: string;
  quality_status: string;
  quality_flags: string[];
  freshness?: "current" | "stale" | "future";
};

type Alert = {
  alert_id: string;
  title: string;
  severity: "INFORMATIONAL" | "LOW" | "MEDIUM" | "HIGH";
  status: string;
  explanation: string;
  evidence_summary: any[];
};

type Investigation = {
  investigation_id: string;
  title: string;
  severity: "INFORMATIONAL" | "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
  evidence: any[];
  quality_limitations: any[];
};

const nav = [
  ["overview", "Mission Overview", HeartPulse],
  ["timeline", "Health Timeline", Activity],
  ["investigator", "Drift Investigation", BarChart3],
  ["checkin", "Daily Check-in", ListChecks],
  ["alerts", "Action Centre", AlertTriangle],
  ["ai", "AI Assistant", Brain],
  ["reports", "Data & Simulation Lab", Database]
] as const;

const api = async (path: string, options: RequestInit = {}) => {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  const content = res.headers.get("content-type") || "";
  return content.includes("json") ? res.json() : res.text();
};

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined
});

function App() {
  const [active, setActive] = useState("overview");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scenario, setScenario] = useState("stable_baseline");
  const [days, setDays] = useState(12);
  const [seed, setSeed] = useState(42);
  const [metric, setMetric] = useState("heart_rate");
  const [manualValue, setManualValue] = useState("");
  const [checkin, setCheckin] = useState({ mood: "7", fatigue: "3", stress: "3", sleep_quality: "4", symptom_severity: "0", notes: "" });
  const [csvText, setCsvText] = useState("");

  const load = async () => {
    const [summary, measurements, baselines, investigations, alerts, followUps, scenarios, aiStatus, config] = await Promise.all([
      api("/api/reports/summary"),
      api("/api/measurements?limit=300"),
      api("/api/baselines"),
      api("/api/investigations"),
      api("/api/alerts"),
      api("/api/follow-ups"),
      api("/api/simulator/scenarios"),
      api("/api/ai/status"),
      api("/api/config")
    ]);
    setData({ summary, measurements, baselines, investigations, alerts, followUps, scenarios, aiStatus, config });
  };

  const action = async (fn: () => Promise<any>, label: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      setMessage(label);
      setTimeout(() => setMessage(""), 2800);
    } catch (err: any) {
      setMessage(err.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const measurements: Measurement[] = data?.measurements || [];
  const alerts: Alert[] = data?.alerts || [];
  const investigations: Investigation[] = data?.investigations || [];
  const metrics = data?.config?.metrics || {};
  const activeAlerts = alerts.filter((a) => !["RESOLVED", "FALSE_POSITIVE"].includes(a.status));
  const latestByMetric = data?.summary.latest_readings || {};
  const chartRows = useMemo(() => measurements
    .filter((m) => ["heart_rate", "sleep_duration", "fatigue", "stress", "hydration"].includes(m.metric_type))
    .slice(0, 90)
    .reverse()
    .map((m) => ({ time: new Date(m.measured_at).toLocaleDateString(), metric: m.metric_type, value: m.value })), [measurements]);

  if (!data) return <main className="boot"><RefreshCw className="spin" /> Loading ORBIT...</main>;

  return (
    <div className="shell">
      <aside>
        <div className="brand"><Stethoscope /><div><strong>ORBIT</strong><span>Health Console</span></div></div>
        {nav.map(([id, label, Icon]) => <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><Icon size={18} /> {label}</button>)}
      </aside>
      <main>
        <header>
          <div><p className="eyebrow">Observational Risk Baselines, Investigation & Tracking</p><h1>{data.summary.mission.mission_name}</h1></div>
          <button onClick={() => action(load, "Refreshed")} disabled={busy}><RefreshCw size={16} /> Refresh</button>
        </header>
        {message && <div className="toast">{message}</div>}

        {active === "overview" && <section>
          <MissionHero summary={data.summary} activeAlerts={activeAlerts} latest={latestByMetric} />
          <LatestReadings latest={latestByMetric} metrics={metrics} />
          <div className="kpis compact">
            <MetricCard label="Unified Records" value={data.summary.counts.measurements} hint={`${data.summary.counts.valid_measurements} validated readings`} icon={<Activity />} />
            <MetricCard label="Quality Flags" value={data.summary.counts.quality_warnings} hint="Invalid, stale, duplicate, or uncertain" icon={<ShieldCheck />} />
            <MetricCard label="Open Alerts" value={data.summary.counts.active_alerts} hint="Evidence-linked action centre" icon={<AlertTriangle />} tone={activeAlerts[0]?.severity} />
            <MetricCard label="Follow-ups" value={data.summary.counts.open_followups} hint="Response loop tracking" icon={<ClipboardCheck />} />
          </div>
          <div className="grid two">
            <Panel title="Mission-Ready Operation"><OfflineCard latest={data.summary.latest_measurement_at} /></Panel>
            <Panel title="Latest Finding"><Finding finding={investigations[0]} /></Panel>
          </div>
        </section>}

        {active === "timeline" && <section>
          <Panel title="Health Timeline">
            <TimelineRail rows={measurements.slice(0, 18)} alerts={alerts.slice(0, 3)} />
          </Panel>
          <div className="grid two">
            <Panel title="Shared Health Timeline"><Chart rows={chartRows} /></Panel>
            <Panel title="Quality Mix"><QualityChart rows={measurements} /></Panel>
          </div>
          <MeasurementTable rows={measurements.slice(0, 120)} />
        </section>}

        {active === "investigator" && <section className="grid two">
          <Panel title="Investigation Controls">
            <p className="muted">Deterministic baseline-aware analysis. AI output never creates or closes alerts.</p>
            <div className="toolbar">
              <button className="primary" onClick={() => action(() => api("/api/investigations/run", post()), "Investigation complete")}><BarChart3 size={16} /> Run Investigator</button>
              <button onClick={() => action(() => api("/api/baselines/recalculate", post()), "Baselines recalculated")}>Recalculate Baselines</button>
            </div>
            <BaselineTable rows={data.baselines} />
          </Panel>
          <Panel title="Findings">{investigations.slice(0, 8).map((f) => <Finding key={f.investigation_id} finding={f} />)}</Panel>
        </section>}

        {active === "checkin" && <section className="grid two">
          <Panel title="Daily Self-assessment">
            <p className="muted">Adds information that simulated sensors cannot directly provide: mood, symptoms, fatigue, stress, and sleep quality.</p>
            <div className="form-grid">
              {["mood", "fatigue", "stress", "sleep_quality", "symptom_severity"].map((name) => <label key={name}>{labelFor(name, metrics)}<input type="number" value={(checkin as any)[name]} onChange={(e) => setCheckin({ ...checkin, [name]: e.target.value })} /></label>)}
            </div>
            <textarea value={checkin.notes} onChange={(e) => setCheckin({ ...checkin, notes: e.target.value })} placeholder="Context, symptoms, activity notes, or verification comments" />
            <button className="primary" onClick={() => action(async () => {
              for (const name of ["mood", "fatigue", "stress", "sleep_quality", "symptom_severity"]) {
                await api("/api/measurements", post({ crew_id: "crew-aurora", metric_type: name, value: Number((checkin as any)[name]), unit: metrics[name].unit, measured_at: new Date().toISOString(), source: "manual", notes: checkin.notes }));
              }
            }, "Daily check-in saved")}><ListChecks size={16} /> Submit Check-in</button>
          </Panel>
          <Panel title="Manual Measurement">
            <p className="muted">Use this for blood pressure, oxygen saturation, radiation-dose placeholders, or bone-assessment placeholders. These are prototype records, not clinical assessments.</p>
            <div className="toolbar">
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.keys(metrics).map((m) => <option key={m} value={m}>{metrics[m].label}</option>)}</select>
              <input placeholder="Value" value={manualValue} onChange={(e) => setManualValue(e.target.value)} />
              <button onClick={() => action(() => api("/api/measurements", post({ crew_id: "crew-aurora", metric_type: metric, value: Number(manualValue), unit: metrics[metric].unit, measured_at: new Date().toISOString(), source: "manual" })), "Manual measurement saved")}>Add Measurement</button>
            </div>
          </Panel>
        </section>}

        {active === "alerts" && <section className="grid two">
          <Panel title="Guided Response">{alerts.length ? alerts.map((a) => <AlertCard key={a.alert_id} alert={a} action={action} />) : <p className="muted">No alerts yet.</p>}</Panel>
          <Panel title="Follow-up Actions">{data.followUps.length ? data.followUps.map((f: any) => <FollowUp key={f.action_id} follow={f} action={action} />) : <p className="muted">Create a follow-up from an alert to show closed-loop review.</p>}</Panel>
        </section>}

        {active === "ai" && <section className="grid two">
          <Panel title="AI Health Assistant">
            <p className="muted">Current mode uses deterministic local fallback. It sends no data externally and cannot override rule-based alerts.</p>
            <p><span className="pill">AI enabled: {String(data.aiStatus.enabled)}</span><span className="pill">Gemini configured: {String(data.aiStatus.configured)}</span></p>
            <button className="primary" onClick={() => action(() => api("/api/ai/explain", post()), "Structured explanation generated")}><Brain size={16} /> Generate Explanation</button>
          </Panel>
          <Panel title="Latest Explanation">{data.summary.latest_ai ? <div className="incident"><h3>{data.summary.latest_ai.summary}</h3><p>{data.summary.latest_ai.uncertainty}</p><p><b>Follow-up:</b> {data.summary.latest_ai.suggested_follow_up.join("; ")}</p><span className="pill">{data.summary.latest_ai.source}</span></div> : <p className="muted">No explanation generated yet.</p>}</Panel>
        </section>}

        {active === "reports" && <section>
          <Panel title="Simulation Lab">
            <p className="muted">Use predictable scenarios to demonstrate normal baseline, health drift, measurement quality, and recovery.</p>
            <div className="scenario-grid">
              {data.scenarios.map((s: any) => <button key={s.id} className={scenario === s.id ? "scenario active" : "scenario"} onClick={() => setScenario(s.id)}><strong>{s.name.replace("Scenario ", "")}</strong><span>{s.description}</span></button>)}
            </div>
            <div className="toolbar">
              <input type="number" value={days} min={2} max={30} onChange={(e) => setDays(Number(e.target.value))} />
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
              <button className="primary" onClick={() => action(() => api("/api/simulator/generate", post({ scenario, days, seed })), "Sample data generated")}><Play size={16} /> Generate</button>
              <button onClick={() => confirm("Clear generated demo data and incident workflow records?") && action(() => api("/api/simulator/reset", post()), "Demo data cleared")}>Reset Demo</button>
            </div>
          </Panel>
          <div className="grid two">
          <Panel title="CSV Exports">
            <p className="muted">Exports preserve simulated/manual/imported labels.</p>
            <div className="toolbar">
              <a href="/api/reports/export/measurements"><button><Download size={16} /> Measurements</button></a>
              <a href="/api/reports/export/alerts"><button><Download size={16} /> Alerts</button></a>
              <a href="/api/reports/export/follow-ups"><button><Download size={16} /> Follow-ups</button></a>
            </div>
          </Panel>
          <Panel title="CSV Import">
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="crew_id,metric_type,value,unit,measured_at,source,notes" />
            <button onClick={() => action(() => api("/api/measurements/import", { method: "POST", headers: { "Content-Type": "text/csv" }, body: csvText }), "CSV imported with validation")}><FileText size={16} /> Import CSV</button>
          </Panel>
          </div>
        </section>}
      </main>
    </div>
  );
}

function MetricCard({ label, value, hint, icon, tone }: any) {
  return <div className={`metric-card ${tone || ""}`}>{icon}<p>{label}</p><strong>{value}</strong><span>{hint}</span></div>;
}

function MissionHero({ summary, activeAlerts, latest }: any) {
  const status = activeAlerts.length ? `${activeAlerts[0].severity} review` : "Nominal monitoring";
  return <div className="mission-hero">
    <div className="hero-copy">
      <span className="tag">Software-only prototype · Local-first</span>
      <h2>Crew health overview</h2>
      <p>{summary.crew.name}</p>
      <div className="hero-stats">
        <span><b>{status}</b>Current status</span>
        <span><b>{summary.crew.name}</b>Fictional crew profile</span>
        <span><b>{summary.latest_measurement_at ? new Date(summary.latest_measurement_at).toLocaleDateString() : "No data"}</b>Latest telemetry</span>
      </div>
    </div>
    <BodyModel latest={latest} />
  </div>;
}

function BodyModel({ latest }: any) {
  return <div className="body-model reference-body" aria-label="Reference wireframe adult health model">
    <div className="body-figure">
      <img src="/images/wireframe-human-front.png" alt="Cyan wireframe adult body front view" />
      <HealthHotspot className="hotspot-oxygen" label="Blood oxygen" reading={latest.blood_oxygen} unit="%" side="right" location="Whole-body oxygenation; fingertip sampling site" />
      <HealthHotspot className="hotspot-cardio" label="Heart rate" reading={latest.heart_rate} unit="bpm" side="left" location="Cardiovascular signal" />
    </div>
  </div>;
}

function HealthHotspot({ className, label, reading, unit, side, location }: any) {
  const [pinned, setPinned] = useState(false);
  const id = `tip-${className}`;
  return <button className={`body-hotspot ${className} ${side === "left" ? "tip-left" : "tip-right"} ${pinned ? "pinned" : ""}`} aria-label={`${label}: ${reading?.value ?? "No reading"} ${reading ? unit : ""}`} aria-describedby={id} aria-expanded={pinned} onClick={() => setPinned(!pinned)} onKeyDown={(event) => { if (event.key === "Escape") { setPinned(false); event.currentTarget.blur(); } }}>
    <span id={id} role="tooltip" className="hotspot-tooltip"><small>{label}</small><b>{reading?.value ?? "--"} <em>{unit}</em></b><small>{location}</small><ReadingMeta reading={reading} /></span>
  </button>;
}

function ReadingMeta({ reading }: { reading?: Measurement }) {
  if (!reading) return <span className="reading-meta">No reading recorded</span>;
  const needsReview = reading.quality_status !== "valid" || !!reading.quality_flags?.length;
  const quality = needsReview ? "Needs verification" : "Passed input checks";
  return <span className="reading-meta">
    <time dateTime={reading.measured_at}>{new Date(reading.measured_at).toLocaleString()}</time>
    <span>{reading.source.replaceAll("_", " ")}</span>
    <span className={reading.freshness !== "current" || needsReview ? "reading-warning" : "reading-ok"}>{quality} · {reading.freshness === "future" ? "Future timestamp" : reading.freshness === "stale" ? "Outdated" : "Within update interval"}</span>
    {!!reading.quality_flags?.length && <span>{reading.quality_flags.map((flag) => flag.replaceAll("_", " ")).join(", ")}</span>}
  </span>;
}

function LatestReadings({ latest, metrics }: any) {
  return <section className="latest-readings" aria-label="Latest health readings">
    <h2>Latest readings</h2>
    <div className="reading-grid">{Object.entries(metrics).map(([metric, config]: [string, any]) => {
      const reading = latest[metric];
      const context = ["stress", "fatigue", "mood", "hydration", "symptom_severity", "activity_level"].includes(metric) ? "Whole-body / self-report" : metric === "radiation_dose" || metric === "bone_assessment" ? "Prototype placeholder" : null;
      const unit = ({ percent: "%", c: "°C", hours: "h", minutes: "min", score_1_10: "/10", score_0_10: "/10", score_1_5: "/5" } as Record<string, string>)[config.unit] || config.unit;
      return <article className="reading-item" key={metric}>
        <h3>{config.label}</h3>
        <p className="reading-value">{reading?.value ?? "--"} <small>{unit}</small></p>
        {context && <span className="reading-context">{context}</span>}
        <ReadingMeta reading={reading} />
      </article>;
    })}</div>
  </section>;
}

function Panel({ title, children }: any) {
  return <div className="panel"><h2>{title}</h2>{children}</div>;
}

function Chart({ rows }: any) {
  return <ResponsiveContainer width="100%" height={260}><AreaChart data={rows}><CartesianGrid strokeDasharray="3 3" stroke="#26374f" /><XAxis dataKey="time" stroke="#9db2ce" /><YAxis stroke="#9db2ce" /><Tooltip contentStyle={{ background: "#111c2d", border: "1px solid #2a3d58" }} /><Area dataKey="value" stroke="#60c7d0" fill="#22515f" /></AreaChart></ResponsiveContainer>;
}

function QualityChart({ rows }: { rows: Measurement[] }) {
  const counts = rows.reduce((acc: any, row) => ({ ...acc, [row.quality_status]: (acc[row.quality_status] || 0) + 1 }), {});
  const data = Object.entries(counts).map(([name, count]) => ({ name, count }));
  return <ResponsiveContainer width="100%" height={180}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#26374f" /><XAxis dataKey="name" stroke="#9db2ce" /><YAxis stroke="#9db2ce" /><Tooltip contentStyle={{ background: "#111c2d", border: "1px solid #2a3d58" }} /><Bar dataKey="count" fill="#60c7d0" /></BarChart></ResponsiveContainer>;
}

function TimelineRail({ rows, alerts }: { rows: Measurement[]; alerts: Alert[] }) {
  const events = [
    ...alerts.map((a) => ({ id: a.alert_id, title: a.title, meta: `${a.severity} · ${a.status}`, type: "alert" })),
    ...rows.map((m) => ({ id: m.measurement_id, title: m.metric_type.replaceAll("_", " "), meta: `${m.value} ${m.unit} · ${new Date(m.measured_at).toLocaleString()} · ${m.quality_status}`, type: m.quality_status === "valid" ? "measurement" : "quality" }))
  ].slice(0, 16);
  return <div className="timeline-rail">{events.map((event) => <div key={event.id} className={`timeline-event ${event.type}`}><span></span><div><strong>{event.title}</strong><p>{event.meta}</p></div></div>)}</div>;
}

function Finding({ finding }: { finding?: Investigation }) {
  if (!finding) return <p className="muted">No investigation has been run yet.</p>;
  return <div className="incident"><h3 className={finding.severity}>{finding.title}</h3><p>{finding.explanation}</p><div>{finding.evidence?.map((e: any) => <span className="pill" key={e.measurement_id}>{e.metric_type}: {e.value} vs {e.bound}</span>)}</div>{!!finding.quality_limitations?.length && <p className="muted">{finding.quality_limitations.length} quality-limited record(s) excluded.</p>}</div>;
}

function AlertCard({ alert, action }: { alert: Alert; action: any }) {
  const update = (endpoint: string, payload?: any, label = "Alert updated") => action(() => api(`/api/alerts/${alert.alert_id}/${endpoint}`, post(payload || {})), label);
  return <div className="incident"><h3 className={alert.severity}>{alert.title}</h3><p>{alert.explanation}</p><p><span className="pill">{alert.severity}</span><span className="pill">{alert.status}</span></p><Checklist items={(alert as any).response_checklist} /><div className="toolbar"><button onClick={() => update("acknowledge", { user: "demo-user" })}>Acknowledge</button><button onClick={() => update("investigate")}>Investigate</button><button onClick={() => action(() => api("/api/follow-ups", post({ alert_id: alert.alert_id, description: "Collect recovery measurements and review linked alert evidence." })), "Follow-up created")}>Create Follow-up</button><button onClick={() => update("resolve", { resolution_notes: prompt("Resolution note required") || "" }, "Alert resolved")}>Resolve</button></div></div>;
}

function FollowUp({ follow, action }: any) {
  return <div className="incident"><strong>{follow.description}</strong><p>{follow.assigned_to} · <span className="pill">{follow.status}</span></p>{follow.status !== "COMPLETED" && <button onClick={() => action(() => api(`/api/follow-ups/${follow.action_id}`, { ...post({ status: "COMPLETED", completion_notes: "Completed in demonstration workflow." }), method: "PATCH" }), "Follow-up completed; alert still needs review")}>Complete</button>}</div>;
}

function BaselineTable({ rows }: any) {
  return <div className="table-wrap"><table><thead><tr><th>Metric</th><th>Mean</th><th>Samples</th><th>Status</th></tr></thead><tbody>{rows.filter((b: any) => b.sample_count).map((b: any) => <tr key={b.baseline_id}><td>{b.metric_type}</td><td>{format(b.mean)}</td><td>{b.sample_count}</td><td>{b.sufficient ? "Established" : "Insufficient"}</td></tr>)}</tbody></table></div>;
}

function MeasurementTable({ rows }: { rows: Measurement[] }) {
  return <Panel title="Measurement Records"><div className="table-wrap"><table><thead><tr><th>Metric</th><th>Value</th><th>Time</th><th>Source</th><th>Quality</th></tr></thead><tbody>{rows.map((m) => <tr key={m.measurement_id}><td>{m.metric_type}</td><td>{m.value} {m.unit}</td><td>{new Date(m.measured_at).toLocaleString()}</td><td>{m.source}</td><td>{m.quality_status} {m.quality_flags?.join(", ")}</td></tr>)}</tbody></table></div></Panel>;
}

function format(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function OfflineCard({ latest }: { latest: string }) {
  return <div className="offline-card"><WifiOff /><div><h3>Local-first demonstration</h3><p>Stored records remain available from the local database, and deterministic rules run without external AI or internet access.</p><span className="pill">Last telemetry: {latest ? new Date(latest).toLocaleString() : "No data yet"}</span><span className="pill">External sync: prototype placeholder</span></div></div>;
}

function Checklist({ items }: { items?: string[] }) {
  const list = items?.length ? items : ["Verify evidence.", "Record action.", "Collect follow-up measurement."];
  return <ul className="checklist">{list.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function labelFor(name: string, metrics: any) {
  return metrics[name]?.label || name.replaceAll("_", " ");
}

createRoot(document.getElementById("root")!).render(<App />);
