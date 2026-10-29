import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileText,
  HeartPulse,
  ListChecks,
  Play,
  RefreshCw,
  Rewind,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Undo2,
  WifiOff
} from "lucide-react";
import {
  Line,
  LineChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import "./styles.css";
import MissionReplay from "./MissionReplay";

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
  missing_metrics?: string[];
  insufficient_baselines?: string[];
};

const nav = [
  ["overview", "Mission Overview", HeartPulse],
  ["timeline", "Health Timeline", Activity],
  ["replay", "Mission Replay", Rewind],
  ["investigator", "Drift Investigation", BarChart3],
  ["checkin", "Daily Check-in", ListChecks],
  ["alerts", "Action Centre", AlertTriangle],
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
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [csvResult, setCsvResult] = useState<any>(null);
  const [csvFilename, setCsvFilename] = useState("Pasted CSV");
  const [pendingDelete, setPendingDelete] = useState<any>(null);
  const changeCsv = (text: string, filename = "Pasted CSV") => { setCsvText(text); setCsvFilename(filename); setCsvPreview(null); setCsvResult(null); };

  const load = async () => {
    const [summary, measurements, baselines, investigations, alerts, followUps, scenarios, config, imports] = await Promise.all([
      api("/api/reports/summary"),
      api("/api/measurements?limit=300"),
      api("/api/baselines"),
      api("/api/investigations"),
      api("/api/alerts"),
      api("/api/follow-ups"),
      api("/api/simulator/scenarios"),
      api("/api/config"),
      api("/api/imports")
    ]);
    setData({ summary, measurements, baselines, investigations, alerts, followUps, scenarios, config, imports });
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
  const pageTitle = nav.find(([id]) => id === active)?.[1] || "Mission Overview";
  const navigate = (view: string) => { setActive(view); window.scrollTo({ top: 0, behavior: "auto" }); };

  if (!data) return <main className="boot">{message ? <div role="alert"><h1>Unable to load ORBIT</h1><p>{message}</p><button onClick={() => { setMessage(""); load().catch((err) => setMessage(err.message)); }}><RefreshCw size={16} /> Retry</button></div> : <><RefreshCw className="spin" /> Loading ORBIT...</>}</main>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Stethoscope /><div><strong>ORBIT</strong><span>Health Console</span></div></div>
        <nav aria-label="Main navigation">{[{ label: "Monitoring", items: nav.slice(0, 4) }, { label: "Workspace", items: nav.slice(4) }].map((group) => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map(([id, label, Icon]) => <button aria-label={label} aria-current={active === id ? "page" : undefined} key={id} className={active === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={17} /><span className="nav-label">{label}</span>{id === "alerts" && activeAlerts.length > 0 && <span className="nav-count">{activeAlerts.length}</span>}</button>)}</div>)}</nav>
        <div className="sidebar-footer"><span className="workspace-dot" /> Local workspace<span>{data.summary.mission.mission_id}</span></div>
      </aside>
      <main>
        <header className="page-header">
          <div><p className="eyebrow">{data.summary.mission.mission_name}</p><h1>{pageTitle}</h1></div>
          <div className="header-actions"><span className="workspace-label"><span className="workspace-dot" /> Local database</span><button aria-label="Refresh data" title="Refresh data" onClick={() => action(load, "Refreshed")} disabled={busy}><RefreshCw size={16} className={busy ? "spin" : ""} /></button></div>
        </header>
        {message && <div className="toast" role="status">{message}</div>}
        {pendingDelete && <DeleteImportDialog batch={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={() => {
          const batch = pendingDelete;
          setPendingDelete(null);
          action(async () => { await api(`/api/imports/${batch.batch_id}/delete`, post({ confirm: true, expected_count: batch.count })); setCsvResult(null); setCsvPreview(null); }, "Import deleted; readings can be restored");
        }} />}

        {active === "overview" && <section>
          <div className="kpis compact">
            <MetricCard label="Total readings" value={data.summary.counts.measurements.toLocaleString()} hint={`${data.summary.counts.valid_measurements.toLocaleString()} passed input checks`} icon={<Activity />} />
            <MetricCard label="Quality warnings" value={data.summary.counts.quality_warnings} hint="Records requiring verification" icon={<ShieldCheck />} tone="LOW" />
            <MetricCard label="Open alerts" value={data.summary.counts.active_alerts} hint="Awaiting team review" icon={<AlertTriangle />} tone={activeAlerts[0]?.severity} />
            <MetricCard label="Pending follow-ups" value={data.summary.counts.open_followups} hint="Recorded response tasks" icon={<ClipboardCheck />} />
          </div>
          <MissionHero summary={data.summary} activeAlerts={activeAlerts} latest={latestByMetric} onNavigate={navigate} />
          <LatestReadings latest={latestByMetric} metrics={metrics} />
          <div className="grid two">
            <Panel title="Workspace status"><OfflineCard latest={data.summary.latest_measurement_at} /></Panel>
            <Panel title="Latest investigation"><Finding finding={investigations[0]} /></Panel>
          </div>
        </section>}

        {active === "timeline" && <section>
          <HealthTimeline metrics={metrics} revision={data} />
          <Panel title="Health Timeline">
            <TimelineRail rows={measurements.slice(0, 18)} alerts={alerts.slice(0, 3)} />
          </Panel>
        </section>}

        {active === "replay" && <MissionReplay metrics={metrics} revision={data} request={api} />}

        {active === "investigator" && <section className="grid two">
          <Panel title="Investigation Controls">
            <p className="muted">Personal baseline comparison · 36-hour observation window</p>
            <div className="toolbar">
              <button className="primary" onClick={() => action(() => api("/api/investigations/run", post()), "Investigation complete")}><BarChart3 size={16} /> Run Investigator</button>
              <button onClick={() => action(() => api("/api/baselines/recalculate", post()), "Baselines recalculated")}>Recalculate Baselines</button>
            </div>
            <BaselineTable rows={data.baselines} metrics={metrics} />
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
                await api("/api/measurements", post({ crew_id: "crew-aurora", metric_type: name, value: (checkin as any)[name], unit: metrics[name].unit, measured_at: new Date().toISOString(), source: "manual", notes: checkin.notes }));
              }
            }, "Daily check-in saved")}><ListChecks size={16} /> Submit Check-in</button>
          </Panel>
          <Panel title="Manual Measurement">
            <p className="muted">Use this for blood pressure, oxygen saturation, radiation-dose placeholders, or bone-assessment placeholders. These are prototype records, not clinical assessments.</p>
            <div className="toolbar">
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.keys(metrics).map((m) => <option key={m} value={m}>{metrics[m].label}</option>)}</select>
              <input placeholder="Value" value={manualValue} onChange={(e) => setManualValue(e.target.value)} />
              <button onClick={() => action(() => api("/api/measurements", post({ crew_id: "crew-aurora", metric_type: metric, value: manualValue, unit: metrics[metric].unit, measured_at: new Date().toISOString(), source: "manual" })), "Manual measurement saved")}>Add Measurement</button>
            </div>
          </Panel>
        </section>}

        {active === "alerts" && <section className="grid two">
          <Panel title="Guided Response">{alerts.length ? alerts.map((a) => <AlertCard key={a.alert_id} alert={a} action={action} />) : <p className="muted">No alerts yet.</p>}</Panel>
          <Panel title="Follow-up Actions">{data.followUps.length ? data.followUps.map((f: any) => <FollowUp key={f.action_id} follow={f} action={action} />) : <p className="muted">Create a follow-up from an alert to show closed-loop review.</p>}</Panel>
        </section>}


        {active === "reports" && <section>
          <Panel title="Simulation Lab">
            <div className="scenario-grid">
              {data.scenarios.map((s: any, index: number) => <button key={s.id} aria-pressed={scenario === s.id} className={scenario === s.id ? "scenario active" : "scenario"} onClick={() => setScenario(s.id)}><small>Scenario {String.fromCharCode(65 + index)}</small><strong>{s.name.replace(/^Scenario [A-Z] - /, "")}</strong><span>{s.description}</span></button>)}
            </div>
            <div className="toolbar simulation-controls">
              <label>Duration (days)<input type="number" aria-label="Simulation duration in days" value={days} min={2} max={30} onChange={(e) => setDays(Number(e.target.value))} /></label>
              <label>Random seed<input type="number" aria-label="Simulation random seed" value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></label>
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
            <label className="csv-file">CSV file<input type="file" accept=".csv,text/csv" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              changeCsv("");
              try {
                if (file.size > 1024 * 1024) throw new Error("CSV file exceeds 1 MB limit");
                changeCsv(await file.text(), file.name);
              } catch (err: any) { setMessage(err.message || "Could not read file"); }
            }} /></label>
            <textarea aria-label="CSV records" value={csvText} onChange={(e) => changeCsv(e.target.value)} placeholder="crew_id,metric_type,value,unit,measured_at,source,notes" />
            <div className="toolbar">
              <button disabled={busy || !csvText.trim()} onClick={() => action(async () => { setCsvResult(null); setCsvPreview(null); setCsvPreview(await api("/api/measurements/import/preview", { method: "POST", headers: { "Content-Type": "text/csv" }, body: csvText })); }, "CSV preview ready")}><FileText size={16} /> Validate CSV</button>
              <button className="primary" disabled={busy || !csvPreview?.accepted} onClick={() => action(async () => { const result = await api("/api/measurements/import", { method: "POST", headers: { "Content-Type": "text/csv", "X-Import-Filename": encodeURIComponent(csvFilename) }, body: csvText }); setCsvResult(result); setCsvPreview(null); }, "CSV import complete")}><Download size={16} /> Import Valid Records</button>
            </div>
            {(csvPreview || csvResult) && <ImportResult result={csvResult || csvPreview} imported={!!csvResult} />}
          </Panel>
          </div>
          <Panel title="Import History">
            {data.imports.active.length ? <div className="import-history">{data.imports.active.map((batch: any) => <div className="import-history-row" key={batch.batch_id}>
              <div><strong>{batch.filename}</strong><span>{batch.count} readings · {batch.imported_at ? new Date(batch.imported_at).toLocaleString() : "Import date unavailable"}</span></div>
              <button className="danger-button" disabled={busy} onClick={() => setPendingDelete(batch)}><Trash2 size={16} /> Delete Import</button>
            </div>)}</div> : <p className="muted">No active CSV imports.</p>}
            <details className="deleted-imports"><summary>Deleted Imports ({data.imports.deleted.length})</summary>
              <p className="muted">Deleted readings remain in the local database for recovery. Restoring brings back readings; recalculate baselines and rerun the investigator afterward.</p>
              {data.imports.deleted.map((batch: any) => <div className="import-history-row" key={batch.batch_id}>
                <div><strong>{batch.filename}</strong><span>{batch.count} readings · Deleted {new Date(batch.deleted_at).toLocaleString()}</span></div>
                <button disabled={busy} onClick={() => action(() => api(`/api/imports/${batch.batch_id}/restore`, post()), "Readings restored; rerun baseline calculation and investigation")}><Undo2 size={16} /> Restore Readings</button>
              </div>)}
            </details>
          </Panel>
        </section>}
      </main>
    </div>
  );
}

function MetricCard({ label, value, hint, icon, tone }: any) {
  return <div className={`metric-card ${tone || ""}`}><div className="metric-card-label"><p>{label}</p>{icon}</div><strong>{value}</strong><span>{hint}</span></div>;
}

function MissionHero({ summary, activeAlerts, latest, onNavigate }: any) {
  const status = activeAlerts.length ? `${activeAlerts[0].severity} priority review` : "No open alerts";
  return <div className="mission-hero">
    <div className="hero-copy">
      <span className="tag">Fictional crew profile</span>
      <h2>{summary.crew.name}</h2>
      <p>{summary.crew.role}</p>
      <div className="hero-stats">
        <span><small>Review status</small><b className={activeAlerts[0]?.severity}>{status}</b></span>
        <span><small>Latest recorded reading</small><b>{summary.latest_measurement_at ? new Date(summary.latest_measurement_at).toLocaleString() : "No data"}</b></span>
      </div>
      <div className="toolbar overview-actions"><button onClick={() => onNavigate("timeline")}><Activity size={16} /> Health timeline</button><button onClick={() => onNavigate("replay")}><Rewind size={16} /> Open replay</button></div>
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
  const [category, setCategory] = useState("vitals");
  const categories = [{ id: "vitals", label: "Vitals", keys: ["heart_rate", "blood_oxygen", "body_temperature", "systolic_bp", "diastolic_bp"] }, { id: "wellbeing", label: "Wellbeing", keys: ["sleep_duration", "sleep_quality", "fatigue", "activity_level", "exercise_duration", "hydration", "stress", "mood", "symptom_severity"] }, { id: "mission", label: "Mission", keys: ["radiation_dose", "bone_assessment"] }, { id: "all", label: "All metrics", keys: Object.keys(metrics) }];
  const selected = categories.find((item) => item.id === category)!;
  return <section className="latest-readings" aria-label="Latest health readings">
    <div className="section-heading"><h2>Latest readings</h2><div className="metric-tabs" role="group" aria-label="Metric category">{categories.map((item) => <button key={item.id} aria-pressed={category === item.id} className={category === item.id ? "selected" : ""} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div></div>
    <div className="reading-grid">{Object.entries(metrics).filter(([key]) => selected.keys.includes(key)).map(([metric, config]: [string, any]) => {
      const reading = latest[metric];
      const context = ["stress", "fatigue", "mood", "hydration", "symptom_severity", "activity_level"].includes(metric) ? "Whole-body / self-report" : metric === "radiation_dose" || metric === "bone_assessment" ? "Prototype placeholder" : null;
      const unit = ({ percent: "%", c: "°C", hours: "h", minutes: "min", score_1_10: "/10", score_0_10: "/10", score_1_5: "/5" } as Record<string, string>)[config.unit] || config.unit;
      return <article className="reading-item" key={metric}>
        <h3>{config.label}</h3>
        <p className="reading-value">{reading ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(reading.value) : "--"} <small>{unit}</small></p>
        {context && <span className="reading-context">{context}</span>}
        <ReadingMeta reading={reading} />
      </article>;
    })}</div>
  </section>;
}

function Panel({ title, children }: any) {
  return <div className="panel"><h2>{title}</h2>{children}</div>;
}

function DeleteImportDialog({ batch, onCancel, onConfirm }: any) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="delete-dialog" aria-labelledby="delete-import-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="delete-import-title">Delete CSV import?</h2>
    <p><strong>{batch.filename}</strong> · {batch.count} readings</p>
    <p>These readings will leave active graphs and records. Related findings, alerts and follow-ups will be archived. Affected baselines and generated explanations will be cleared.</p>
    <p>You can restore the readings from Deleted Imports. Other imports and manual readings will remain.</p>
    <div className="toolbar"><button autoFocus onClick={onCancel}>Cancel</button><button className="danger-button" onClick={onConfirm}><Trash2 size={16} /> Delete {batch.count} Readings</button></div>
  </dialog>;
}

function ImportResult({ result, imported }: any) {
  return <div className="import-result" role="status">
    <p><strong>{result.accepted} {imported ? "imported" : "ready"}</strong> · {result.rejected} rejected · {result.duplicates} duplicates skipped</p>
    {!!result.errors.length && <ul>{result.errors.map((item: any) => <li key={item.record}>Record {item.record}: {item.error}</li>)}</ul>}
    {!!result.preview.length && <div className="table-wrap"><table><thead><tr><th>Metric</th><th>Value</th><th>Time</th><th>Source</th><th>Quality</th></tr></thead><tbody>{result.preview.map((row: Measurement) => <tr key={row.measurement_id}><td>{row.metric_type}</td><td>{row.value} {row.unit}</td><td>{row.measured_at}</td><td>{row.source}</td><td>{row.quality_status} {row.quality_flags.join(", ")}</td></tr>)}</tbody></table></div>}
  </div>;
}

function HealthTimeline({ metrics, revision, initialMetric = "heart_rate" }: any) {
  const [metric, setMetric] = useState(initialMetric);
  const [rows, setRows] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [source, setSource] = useState("all");
  const [quality, setQuality] = useState("all");
  const [style, setStyle] = useState("line");
  const [page, setPage] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setRows([]);
    api(`/api/measurements?metric=${encodeURIComponent(metric)}&limit=all`).then((result) => {
      if (!cancelled) setRows(result);
    }).catch((err) => { if (!cancelled) setError(err.message || "Could not load readings"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [metric, revision, retry]);
  useEffect(() => { setPage(0); }, [metric, start, end, source, quality, rows]);
  const invalidRange = !!start && !!end && start > end;
  const filtered = useMemo(() => {
    if (invalidRange) return [];
    const from = start ? new Date(`${start}T00:00:00`).getTime() : -Infinity;
    const until = end ? new Date(`${end}T23:59:59.999`).getTime() : Infinity;
    return rows.filter((row) => {
      const time = new Date(row.measured_at).getTime();
      return Number.isFinite(time) && Number.isFinite(row.value) && time >= from && time <= until && (source === "all" || row.source === source) && (quality === "all" || row.quality_status === quality);
    }).sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
  }, [rows, start, end, source, quality, invalidRange]);
  const points = filtered.map((row) => ({ ...row, timestamp: new Date(row.measured_at).getTime() }));
  const config = metrics[metric] || {};
  const unit = displayUnit(config.unit || "");
  const sources = [...new Set(rows.map((row) => row.source))].sort();
  const average = filtered.length ? filtered.reduce((sum, row) => sum + row.value, 0) / filtered.length : null;
  const flagged = filtered.filter((row) => row.quality_status !== "valid" || row.quality_flags?.length).length;
  const lastPage = Math.max(0, Math.ceil(filtered.length / 50) - 1);
  const currentPage = Math.min(page, lastPage);
  const chartProps = { data: points, margin: { top: 12, right: 12, left: 0, bottom: 20 } };
  const axes = <>
    <CartesianGrid strokeDasharray="3 3" stroke="#26374f" />
    <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} stroke="#9db2ce" tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })} minTickGap={35} />
    <YAxis width={55} stroke="#9db2ce" domain={["auto", "auto"]} />
    <Tooltip content={<ReadingTooltip label={config.label} unit={unit} />} />
  </>;
  return <div className="timeline-review">
    <h2>Health graphs</h2>
    <div className="graph-controls">
      <label>Health metric<select aria-label="Health metric" value={metric} onChange={(event) => { setMetric(event.target.value); setSource("all"); }}>{Object.entries(metrics).map(([key, value]: any) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <label>From<input type="date" value={start} max={end || undefined} onInput={(event) => setStart(event.currentTarget.value)} onChange={(event) => setStart(event.target.value)} /></label>
      <label>To<input type="date" value={end} min={start || undefined} onInput={(event) => setEnd(event.currentTarget.value)} onChange={(event) => setEnd(event.target.value)} /></label>
      <label>Source<select aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sources</option>{sources.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
      <label>Quality<select aria-label="Quality" value={quality} onChange={(event) => setQuality(event.target.value)}><option value="all">All records</option><option value="valid">Valid</option><option value="questionable">Questionable</option><option value="invalid">Invalid</option></select></label>
      <label>Graph<select aria-label="Graph type" value={style} onChange={(event) => setStyle(event.target.value)}><option value="line">Line</option><option value="bar">Bar</option></select></label>
      <button title="Reset graph filters" aria-label="Reset graph filters" onClick={() => { setStart(""); setEnd(""); setSource("all"); setQuality("all"); }}><RefreshCw size={16} /></button>
    </div>
    <div className="graph-heading"><h3>{config.label} <span>({unit})</span></h3><span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div>
    {invalidRange && <p role="alert" className="reading-warning">The start date must be on or before the end date.</p>}
    <div className="health-graph" aria-label={`${config.label} graph`} aria-busy={loading}>
      {loading ? <p role="status">Loading readings...</p> : error ? <div role="alert"><p>{error}</p><button onClick={() => setRetry(retry + 1)}><RefreshCw size={16} /> Retry</button></div> : !points.length ? <p>No readings for this metric and date range.</p> : <ResponsiveContainer width="100%" height="100%">{style === "line" ? <LineChart {...chartProps}>{axes}<Line type="linear" dataKey="value" name={config.label} stroke="#60c7d0" strokeWidth={2} isAnimationActive={false} dot={(props: any) => <circle key={props.payload.measurement_id} cx={props.cx} cy={props.cy} r={3} fill={props.payload.quality_status !== "valid" || props.payload.quality_flags?.length ? "#ffd166" : "#60c7d0"} />} /></LineChart> : <BarChart {...chartProps}>{axes}<Bar dataKey="value" name={config.label} fill="#60c7d0" maxBarSize={32} isAnimationActive={false} /></BarChart>}</ResponsiveContainer>}
    </div>
    {!loading && !error && <>
      <dl className="graph-summary"><div><dt>Readings</dt><dd>{filtered.length}</dd></div><div><dt>Latest</dt><dd>{filtered.at(-1)?.value ?? "--"} {unit}</dd></div><div><dt>Average</dt><dd>{average === null ? "--" : format(average)} {unit}</dd></div><div><dt>Flagged</dt><dd>{flagged}</dd></div></dl>
      <MeasurementTable rows={[...filtered].reverse().slice(currentPage * 50, (currentPage + 1) * 50)} />
      <div className="record-pagination"><button aria-label="Previous records" title="Previous records" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>Page {currentPage + 1} of {lastPage + 1} · {filtered.length} records</span><button aria-label="Next records" title="Next records" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div>
    </>}
  </div>;
}

function ReadingTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="reading-chart-tooltip"><strong>{label}: {row.value} {unit}</strong><p>{new Date(row.measured_at).toLocaleString()}</p><p>{row.source.replaceAll("_", " ")} · {row.quality_status}</p>{!!row.quality_flags?.length && <p className="reading-warning">{row.quality_flags.join(", ")}</p>}</div>;
}

function displayUnit(unit: string) {
  return ({ percent: "%", c: "°C", hours: "h", minutes: "min", score_1_10: "/10", score_0_10: "/10", score_1_5: "/5" } as Record<string, string>)[unit] || unit;
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
  return <div className="incident"><h3 className={finding.severity}>{finding.title}</h3><p>{finding.explanation}</p><div>{finding.evidence?.map((e: any) => <span className="pill" key={e.measurement_id}>{e.metric_type}: {e.value} vs {e.bound}</span>)}</div>{!!finding.quality_limitations?.length && <p className="muted">{finding.quality_limitations.length} quality-limited record(s) excluded.</p>}{!!finding.missing_metrics?.length && <p className="reading-warning">No usable recent reading: {finding.missing_metrics.map((m) => m.replaceAll("_", " ")).join(", ")}.</p>}{!!finding.insufficient_baselines?.length && <p className="reading-warning">Baseline not established: {finding.insufficient_baselines.map((m) => m.replaceAll("_", " ")).join(", ")}.</p>}</div>;
}

function AlertCard({ alert, action }: { alert: Alert; action: any }) {
  const update = (endpoint: string, payload?: any, label = "Alert updated") => action(() => api(`/api/alerts/${alert.alert_id}/${endpoint}`, post(payload || {})), label);
  return <div className="incident"><h3 className={alert.severity}>{alert.title}</h3><p>{alert.explanation}</p><p><span className="pill">{alert.severity}</span><span className="pill">{alert.status}</span></p><Checklist items={(alert as any).response_checklist} /><div className="toolbar"><button onClick={() => update("acknowledge", { user: "demo-user" })}>Acknowledge</button><button onClick={() => update("investigate")}>Investigate</button><button onClick={() => action(() => api("/api/follow-ups", post({ alert_id: alert.alert_id, description: "Collect recovery measurements and review linked alert evidence." })), "Follow-up created")}>Create Follow-up</button><button onClick={() => update("resolve", { resolution_notes: prompt("Resolution note required") || "" }, "Alert resolved")}>Resolve</button></div></div>;
}

function FollowUp({ follow, action }: any) {
  return <div className="incident"><strong>{follow.description}</strong><p>{follow.assigned_to} · <span className="pill">{follow.status}</span></p>{follow.status !== "COMPLETED" && <button onClick={() => action(() => api(`/api/follow-ups/${follow.action_id}`, { ...post({ status: "COMPLETED", completion_notes: "Completed in demonstration workflow." }), method: "PATCH" }), "Follow-up completed; alert still needs review")}>Complete</button>}</div>;
}

function BaselineTable({ rows, metrics = {} }: any) {
  return <div className="table-wrap"><table><thead><tr><th>Metric</th><th>Mean</th><th>Samples</th><th>Status</th></tr></thead><tbody>{rows.filter((b: any) => b.sample_count).map((b: any) => <tr key={b.baseline_id}><td>{metrics[b.metric_type]?.label || b.metric_type.replaceAll("_", " ")}</td><td>{format(b.mean)}</td><td>{b.sample_count}</td><td><span className={`status-label ${b.sufficient ? "valid" : "questionable"}`}>{b.sufficient ? "Established" : "Insufficient"}</span></td></tr>)}</tbody></table></div>;
}

function MeasurementTable({ rows }: { rows: Measurement[] }) {
  return <Panel title="Measurement Records"><div className="table-wrap"><table><thead><tr><th>Metric</th><th>Value</th><th>Time</th><th>Source</th><th>Quality</th></tr></thead><tbody>{rows.map((m) => <tr key={m.measurement_id}><td className="metric-name">{m.metric_type.replaceAll("_", " ")}</td><td>{m.value} {displayUnit(m.unit)}</td><td>{new Date(m.measured_at).toLocaleString()}</td><td>{m.source.replaceAll("_", " ")}</td><td><span className={`status-label ${m.quality_status}`}>{m.quality_status}</span><small className="record-flags">{m.quality_flags?.map((flag) => flag.replaceAll("_", " ")).join(", ")}</small></td></tr>)}</tbody></table></div></Panel>;
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
