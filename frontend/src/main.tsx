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
import { activities, environments, readingContext, type Activity as ReadingActivity, type Environment } from "./readingContext";

type Measurement = {
  measurement_id: string;
  metric_type: string;
  value: number;
  unit: string;
  measured_at: string;
  source: string;
  quality_status: string;
  quality_flags: string[];
  notes?: string;
  activity?: ReadingActivity;
  environment?: Environment;
  freshness?: "current" | "stale" | "future";
};

type Alert = {
  alert_id: string;
  investigation_id?: string;
  title: string;
  severity: "INFORMATIONAL" | "LOW" | "MEDIUM" | "HIGH";
  status: string;
  explanation: string;
  evidence_summary: any[];
  resolution_notes?: string;
  evidence_context?: Record<string, { activity?: ReadingActivity; environment?: Environment }>;
};

type Routine = {
  day: string;
  environment: Environment;
  tasks: { metric: string; time: string; status: "Upcoming" | "Overdue" | "Completed" }[];
};

type FollowUpRecord = {
  action_id: string;
  alert_id: string;
  description: string;
  assigned_to: string;
  due_at: string | null;
  metric_type?: string;
  status: string;
  completion_notes: string;
  measurement?: Measurement | null;
};

const measurementGuidance: Record<string, string> = {
  heart_rate: "Record the device’s pulse in beats per minute. Note whether the reading was taken at rest or after activity.",
  blood_oxygen: "Follow the device instructions. Keep your hand relaxed and still, wait for a stable display, and record SpO₂ as a percentage.",
  body_temperature: "Record the thermometer reading in °C. Note the measurement site and method so later readings can be compared.",
  systolic_bp: "Record the upper number from the cuff display. Record the lower number separately using the same measurement time.",
  diastolic_bp: "Record the lower number from the cuff display. Record the upper number separately using the same measurement time.",
  sleep_duration: "Enter hours slept. Note the sleep period and use the same tracking method for later entries.",
  exercise_duration: "Enter the session duration in minutes. Note the activity and intensity.",
  hydration: "Record your hydration self-rating on the 1–10 scale. Use the same scoring method each time and note any changes in fluid intake or activity.",
  radiation_dose: "Enter a simulated dose in mSv and identify the simulation source in the notes.",
  bone_assessment: "Enter a prototype score and describe the scoring method in the notes."
};
const missionContext: Record<string, string> = {
  heart_rate: "Fluid shifts and cardiovascular deconditioning can change how the body responds to activity. Record recent exercise and whether the reading was taken at rest.",
  systolic_bp: "Fluid shifts in altered gravity can affect circulation. Record the measurement setup and recent activity.",
  diastolic_bp: "Fluid shifts in altered gravity can affect circulation. Record the measurement setup and recent activity.",
  sleep_duration: "Work schedules and circadian disruption can affect sleep. Record a schedule shift or interruption if one occurred.",
  sleep_quality: "Work schedules and circadian disruption can affect sleep. Record a schedule shift or interruption if one occurred.",
  fatigue: "Sleep loss and workload can affect fatigue. Record recent sleep disruption or unusual workload.",
  mood: "Isolation and confinement can affect wellbeing. Record any relevant changes in routine or workload.",
  stress: "Isolation, confinement, and work demands can affect stress. Record any relevant changes in routine or workload."
};

type Investigation = {
  investigation_id: string;
  alert_id?: string;
  as_of?: string;
  window_start?: string;
  title: string;
  severity: "INFORMATIONAL" | "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
  evidence: any[];
  quality_limitations: any[];
  missing_metrics?: string[];
  insufficient_baselines?: string[];
  signal_checks?: {
    metric_type: string;
    value: number | null;
    measured_at: string | null;
    baseline_mean: number | null;
    baseline_samples: number;
    baseline_samples_required?: number;
    bound: number | null;
    direction: "low" | "high";
    result: "flagged" | "clear" | "insufficient_data";
  }[];
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

const alertPriority = { HIGH: 0, MEDIUM: 1, LOW: 2, INFORMATIONAL: 3 };
const isOpenFollowUp = (task: FollowUpRecord) => !["COMPLETED", "CANCELLED"].includes(task.status);
const dueTime = (task: FollowUpRecord) => Date.parse(task.due_at || "") || Infinity;

const request = async (path: string, options: RequestInit = {}) => {
  const res = await fetch(path, options);
  const content = res.headers.get("content-type") || "";
  const result = content.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(result?.error || result || "Request failed");
  return result;
};

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined
});

type CrewMember = { crew_id: string; name: string; role: string };

function App() {
  const [active, setActive] = useState("overview");
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  const loadCrew = () => {
    setError("");
    request("/api/crew").then((members: CrewMember[]) => {
      if (!members.length) throw new Error("No crew profiles found.");
      setCrew(members);
      setSelected((current) => members.some((member) => member.crew_id === current) ? current : members[0].crew_id);
    }).catch((err) => setError(err.message));
  };

  useEffect(loadCrew, []);

  const member = crew.find((profile) => profile.crew_id === selected);
  if (!member) return <main className="boot">{error ? <div role="alert"><p>{error}</p><button onClick={loadCrew}>Retry</button></div> : "Loading crew profiles…"}</main>;

  return <CrewWorkspace key={selected} member={member} crew={crew} active={active} setActive={setActive}
    selectCrew={setSelected} addCrew={(profile) => {
    setCrew((current) => [...current, profile]);
    setSelected(profile.crew_id);
  }} removeCrew={(profiles) => {
    setCrew(profiles);
    setSelected(profiles[0].crew_id);
  }} />;
}

function CrewWorkspace({ member, crew, active, setActive, selectCrew, addCrew, removeCrew }: {
  member: CrewMember;
  crew: CrewMember[];
  active: string;
  setActive: (view: string) => void;
  selectCrew: (id: string) => void;
  addCrew: (profile: CrewMember) => void;
  removeCrew: (profiles: CrewMember[]) => void;
}) {
  const scopedPath = useMemo(() => (path: string) => {
    const params = new URLSearchParams({ crew_id: member.crew_id });
    return `${path}${path.includes("?") ? "&" : "?"}${params}`;
  }, [member.crew_id]);
  const api = useMemo(() => (path: string, options?: RequestInit) => request(scopedPath(path), options), [scopedPath]);
  const [data, setData] = useState<any>(null);
  const [timelineMetric, setTimelineMetric] = useState<string>();
  const [timelineQuality, setTimelineQuality] = useState("all");
  const [busy, setBusy] = useState(false);
  const [addingCrew, setAddingCrew] = useState(false);
  const [savingCrew, setSavingCrew] = useState(false);
  const [deletingCrew, setDeletingCrew] = useState(false);
  const [crewError, setCrewError] = useState("");
  const [message, setMessage] = useState("");
  const [scenario, setScenario] = useState("stable_baseline");
  const [days, setDays] = useState(12);
  const [seed, setSeed] = useState(42);
  const [metric, setMetric] = useState("heart_rate");
  const [manualValue, setManualValue] = useState("");
  const [measurementNotes, setMeasurementNotes] = useState("");
  const [measurementTime, setMeasurementTime] = useState("");
  const [measurementTask, setMeasurementTask] = useState<FollowUpRecord>();
  const [routineDay, setRoutineDay] = useState<string>();
  const [routine, setRoutine] = useState<Routine>();
  const [routineError, setRoutineError] = useState("");
  const [activity, setActivity] = useState<ReadingActivity>("routine");
  const [checkinActivity, setCheckinActivity] = useState<ReadingActivity>("routine");
  const measurementInput = useRef<HTMLInputElement>(null);
  const [responseTarget, setResponseTarget] = useState<string>();
  const [planningAlert, setPlanningAlert] = useState<string>();
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

  const action = async (fn: () => Promise<any>, label: string, onSuccess?: () => void) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onSuccess?.();
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
  const alertQueue = activeAlerts.slice().sort((a, b) => alertPriority[a.severity] - alertPriority[b.severity] ||
    Number(b.status === "NEW") - Number(a.status === "NEW"));
  const followUps: FollowUpRecord[] = data?.followUps || [];
  const taskQueue = followUps.filter(isOpenFollowUp).sort((a, b) => dueTime(a) - dueTime(b));
  const closedAlerts = alerts.filter((alert) => !activeAlerts.includes(alert));
  const closedFollowUps = followUps.filter((task) => !isOpenFollowUp(task));
  const overdueCount = taskQueue.filter((task) => dueTime(task) < Date.now()).length;
  const latestFinding = investigations[0];
  const linkedAlert = latestFinding && alerts.find((alert) => alert.alert_id === latestFinding.alert_id ||
    alert.investigation_id === latestFinding.investigation_id);
  const latestByMetric = data?.summary.latest_readings || {};
  const pageTitle = nav.find(([id]) => id === active)?.[1] || "Mission Overview";
  const navigate = (view: string) => {
    if (view !== "checkin") setRoutineDay(undefined);
    if (view !== "timeline") {
      setTimelineMetric(undefined);
      setTimelineQuality("all");
    }
    setActive(view);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  useEffect(() => {
    if (active !== "overview" && active !== "checkin") return;
    let current = true;
    const refresh = async () => {
      try {
        const next = await api("/api/routine");
        if (current) { setRoutine(next); setRoutineError(""); }
      } catch (error) {
        if (current) setRoutineError(error.message || "Could not load the mission routine.");
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { current = false; window.clearInterval(timer); };
  }, [active, api, data]);
  useEffect(() => {
    if (active === "checkin" && routineDay) measurementInput.current?.focus();
  }, [active, routineDay]);
  const openResponse = (id: string) => {
    setResponseTarget(id);
    navigate("alerts");
  };
  useEffect(() => {
    if (active !== "alerts" || !responseTarget) return;
    const card = document.getElementById(responseTarget);
    const history = card?.closest("details");
    if (history) history.open = true;
    card?.focus();
    card?.scrollIntoView({ block: "center" });
    setResponseTarget(undefined);
    setPlanningAlert(undefined);
  }, [active, responseTarget]);
  const openTimeline = (metric: string, quality = "all") => {
    setTimelineMetric(metric);
    setTimelineQuality(quality);
    navigate("timeline");
  };
  const openMetric = (metric: string) => openTimeline(metric);
  const openMeasurement = (metric: string, task?: FollowUpRecord, day?: string) => {
    setMetric(metric);
    setMeasurementTask(task);
    setRoutineDay(day);
    setActivity("routine");
    setManualValue("");
    setMeasurementTime("");
    setMeasurementNotes("");
    navigate("checkin");
  };

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
          <div className="header-actions">
            <label className="crew-select">Crew member<select value={member.crew_id} disabled={busy || savingCrew} onChange={(event) => selectCrew(event.target.value)}>
              {crew.map((profile) => <option key={profile.crew_id} value={profile.crew_id}>{profile.name}</option>)}
            </select></label>
            <button className="crew-action" aria-expanded={addingCrew} onClick={() => { setCrewError(""); setAddingCrew(!addingCrew); }} disabled={busy || savingCrew}>Add crew</button>
            <button className="crew-action" onClick={() => { setCrewError(""); setDeletingCrew(true); }} disabled={busy || savingCrew || crew.length < 2}
              title={crew.length < 2 ? "Keep at least one active crew profile" : `Delete ${member.name}`}>Delete crew</button>
            <button aria-label="Refresh data" title="Refresh data" onClick={() => action(async () => {}, "Refreshed")} disabled={busy || savingCrew}><RefreshCw size={16} className={busy ? "spin" : ""} /></button>
          </div>
        </header>
        {addingCrew && <section className="panel crew-editor" aria-label="New crew profile">
          <h2>New crew profile</h2>
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (savingCrew) return;
            const fields = new FormData(event.currentTarget);
            setCrewError("");
            setSavingCrew(true);
            try {
              addCrew(await request("/api/crew", post({ name: fields.get("name"), role: fields.get("role") })));
            } catch (err: any) {
              setCrewError(err.message);
            } finally {
              setSavingCrew(false);
            }
          }}>
            <div className="crew-form">
              <label>Name<input name="name" required maxLength={80} /></label>
              <label>Mission role (optional)<input name="role" maxLength={80} /></label>
            </div>
            {crewError && !deletingCrew && <p role="alert">{crewError}</p>}
            <div className="toolbar">
              <button className="primary" disabled={savingCrew}>Create profile</button>
              <button type="button" disabled={savingCrew} onClick={() => setAddingCrew(false)}>Cancel</button>
            </div>
          </form>
          <p className="muted">New profiles start with an empty health record.</p>
        </section>}
        {deletingCrew && <DeleteCrewDialog name={member.name} busy={savingCrew} error={crewError} onCancel={() => {
          setDeletingCrew(false);
          setCrewError("");
        }} onConfirm={async () => {
          if (savingCrew) return;
          setSavingCrew(true);
          setCrewError("");
          try {
            removeCrew(await request(`/api/crew/${encodeURIComponent(member.crew_id)}`, { method: "DELETE" }));
          } catch (err: any) {
            setCrewError(err.message);
          } finally {
            setSavingCrew(false);
          }
        }} />}
        {message && <div className="toast" role="status">{message}</div>}
        {pendingDelete && <DeleteImportDialog batch={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={() => {
          const batch = pendingDelete;
          setPendingDelete(null);
          action(async () => { await api(`/api/imports/${batch.batch_id}/delete`, post({ confirm: true, expected_count: batch.count })); setCsvResult(null); setCsvPreview(null); }, "Import deleted; readings can be restored");
        }} />}

        {active === "overview" && <section>
          <div className="kpis compact">
            <MetricCard label="Total readings" value={data.summary.counts.measurements.toLocaleString()} hint="View all measurement records" icon={<Activity />} onClick={() => openTimeline("all")} />
            <MetricCard label="Quality warnings" value={data.summary.counts.quality_warnings} hint="Review flagged measurement records" icon={<ShieldCheck />} tone="LOW" onClick={() => openTimeline("all", "warnings")} />
            <MetricCard label="Open alerts" value={data.summary.counts.active_alerts} hint="View in Action Centre" icon={<AlertTriangle />} tone={activeAlerts[0]?.severity}
              onClick={() => activeAlerts.length === 1 ? openResponse(`alert-${activeAlerts[0].alert_id}`) : navigate("alerts")} />
            <MetricCard label="Pending follow-ups" value={data.summary.counts.open_followups} hint="View in Action Centre" icon={<ClipboardCheck />}
              onClick={() => openResponse(taskQueue.length === 1 ? `follow-up-${taskQueue[0].action_id}` : "open-follow-ups")} />
          </div>
          <MissionHero summary={data.summary} activeAlerts={activeAlerts} latest={latestByMetric} onOpenMetric={openMetric} onMeasure={openMeasurement} metrics={metrics} />
          <Panel title="Mission Routine">
            {routineError && <p role="alert" className="reading-warning">{routineError}</p>}
            {routine && <MissionRoutine routine={routine} metrics={metrics} busy={busy}
              onRecord={(metric) => openMeasurement(metric, undefined, routine.day)}
              onEnvironment={(environment) => action(async () => {
                setRoutine(await api("/api/routine", { ...post({ environment }), method: "PATCH" }));
              }, "Mission environment saved")}
              onSchedule={(times) => action(async () => {
                setRoutine(await api("/api/routine", { ...post({ times }), method: "PATCH" }));
              }, "Routine schedule saved")} />}
            {!routine && !routineError && <p role="status">Loading routine…</p>}
          </Panel>
          <LatestReadings latest={latestByMetric} metrics={metrics} />
        </section>}

        {active === "timeline" && <section>
          <HealthTimeline metrics={metrics} revision={data} api={api} initialMetric={timelineMetric} initialQuality={timelineQuality} />
        </section>}

        {active === "replay" && <MissionReplay metrics={metrics} revision={data} request={api} />}

        {active === "investigator" && <section className="investigation-view">
          <div className="investigation-header">
            <p className="muted">Compare the latest 36 hours of eligible readings with {member.name}’s personal baselines.</p>
            <button className="primary" disabled={busy} onClick={() => action(
              () => api("/api/investigations/run", post()), "Investigation complete"
            )}><BarChart3 size={16} /> Run investigation</button>
          </div>
          <Panel title="Latest saved result">
            {latestFinding ? <InvestigationResult key={latestFinding.investigation_id} finding={latestFinding} alert={linkedAlert} metrics={metrics} onOpenMetric={openMetric} onMeasure={openMeasurement} onOpenAlert={(id) => openResponse(`alert-${id}`)} onPlan={(id) => { setPlanningAlert(id); openResponse(`alert-${id}`); }} /> : <>
              <p className="muted">Run an investigation to see which readings can be compared with a personal baseline.</p>
              {!measurements.length && <div className="toolbar"><button onClick={() => openMeasurement("heart_rate")}>Record a reading</button><button onClick={() => navigate("reports")}>Open Simulation Lab</button></div>}
            </>}
          </Panel>
          <details className="investigation-section">
            <summary>Personal baselines</summary>
            <BaselineTable rows={data.baselines} metrics={metrics} />
            <button disabled={busy} onClick={() => action(() => api("/api/baselines/recalculate", post()), "Baselines recalculated")}>Recalculate baselines</button>
          </details>
          <details className="investigation-section">
            <summary>Earlier investigations</summary>
            {investigations.length > 1 ? investigations.slice(1, 8).map((f) => <Finding key={f.investigation_id} finding={f} />) : <p className="muted">Earlier runs will appear here.</p>}
            <button onClick={() => navigate("replay")}>Open Mission Replay</button>
          </details>
        </section>}

        {active === "checkin" && <section className="grid two">
          <Panel title="Daily Self-assessment">
            <p className="muted">Adds information that simulated sensors cannot directly provide: mood, symptoms, fatigue, stress, and sleep quality.</p>
            <p className="muted">Use the same scale each day. Higher mood and sleep quality scores mean better, while higher fatigue, stress, and symptom scores mean more severe. Sleep quality uses 1–5 and symptoms use 0–10. The other scores use 1–10.</p>
            <div className="form-grid">
              {["mood", "fatigue", "stress", "sleep_quality", "symptom_severity"].map((name) => <label key={name}>{labelFor(name, metrics)}<input type="number" value={(checkin as any)[name]} onChange={(e) => setCheckin({ ...checkin, [name]: e.target.value })} /></label>)}
            </div>
            <label>Mission context or symptoms<textarea value={checkin.notes} onChange={(e) => setCheckin({ ...checkin, notes: e.target.value })} placeholder="Schedule shift, interrupted sleep, recent exercise, or symptoms" /></label>
            <ActivitySelect value={checkinActivity} onChange={setCheckinActivity} environment={routine?.environment} />
            <p className="muted">Schedule changes, sleep loss, and isolation can affect daily wellbeing. <a href="https://www.nasa.gov/hrp/risks/" target="_blank" rel="noreferrer">NASA Human Research Program</a></p>
            <button className="primary" disabled={busy} onClick={() => action(async () => {
              for (const name of ["mood", "fatigue", "stress", "sleep_quality", "symptom_severity"]) {
                await api("/api/measurements", post({ metric_type: name, value: (checkin as any)[name], unit: metrics[name].unit, measured_at: new Date().toISOString(), source: "manual", notes: checkin.notes, activity: checkinActivity }));
              }
            }, "Daily check-in saved")}><ListChecks size={16} /> Submit Check-in</button>
          </Panel>
          <Panel title="Manual Measurement">
            <form className="guidance-form" onSubmit={(event) => {
              event.preventDefault();
              action(async () => {
                await api("/api/measurements", post({
                  metric_type: metric, value: manualValue, unit: metrics[metric].unit,
                  measured_at: measurementTime ? new Date(measurementTime).toISOString() : new Date().toISOString(),
                  source: "manual", notes: measurementNotes.trim(),
                  follow_up_id: measurementTask?.action_id, routine_day: routineDay, activity
                }));
                setManualValue("");
                setMeasurementNotes("");
                setMeasurementTime("");
                if (measurementTask) {
                  setMeasurementTask(undefined);
                  openResponse(`follow-up-${measurementTask.action_id}`);
                }
                if (routineDay) {
                  navigate("overview");
                }
              }, routineDay ? "Routine task completed" : "Manual measurement saved");
            }}>
              {measurementTask && <p>Repeat measurement for <strong>{measurementTask.description}</strong></p>}
              {routineDay && <p>Mission Routine · {routineDay} UTC</p>}
              <label>Metric<select disabled={!!measurementTask || !!routineDay} value={metric} onChange={(e) => { setMetric(e.target.value); setManualValue(""); }}>{Object.keys(metrics).map((m) => <option key={m} value={m}>{metrics[m].label}</option>)}</select></label>
              <MeasurementGuide metric={metric} config={metrics[metric]} id="measurement-guide" />
              <label>Value ({displayUnit(metrics[metric].unit)})<input ref={measurementInput} type="number" step="any" min={metrics[metric].min} max={metrics[metric].max} required aria-describedby="measurement-guide" value={manualValue} onChange={(e) => setManualValue(e.target.value)} /></label>
              <label>Measurement time (optional)<input type="datetime-local" value={measurementTime} onChange={(e) => setMeasurementTime(e.target.value)} /></label>
              <small className="muted">Leave the time blank to use the current time.</small>
              <ActivitySelect value={activity} onChange={setActivity} environment={routine?.environment} />
              <label>Context or device notes (optional)<textarea value={measurementNotes} onChange={(e) => setMeasurementNotes(e.target.value)} /></label>
              <button disabled={busy}>Add Measurement</button>
              {routineDay && <button type="button" onClick={() => navigate("overview")}>Return to Mission Overview</button>}
              {measurementTask && <button type="button" onClick={() => { setMeasurementTask(undefined); openResponse(`follow-up-${measurementTask.action_id}`); }}>Return to Action Centre</button>}
            </form>
          </Panel>
        </section>}

        {active === "alerts" && <section>
          <div className="grid two">
            <Panel title={`Open alerts (${alertQueue.length})`}>{alertQueue.length ? alertQueue.map((a) => <AlertCard key={a.alert_id} alert={a} action={action} api={api} metrics={metrics} busy={busy} onOpenMetric={openMetric} crewName={member.name} startPlanning={planningAlert === a.alert_id}
              finding={investigations.find((finding) => finding.alert_id === a.alert_id || finding.investigation_id === a.investigation_id)}
              tasks={followUps.filter((task) => task.alert_id === a.alert_id)}
              onClosed={() => openResponse(`alert-${a.alert_id}`)}
              onOpenFollowUp={(id) => openResponse(`follow-up-${id}`)} />) : <><p className="muted">No open alerts for {member.name}.</p><button onClick={() => navigate("investigator")}>Open Drift Investigation</button></>}</Panel>
            <Panel title={`Open follow-ups (${taskQueue.length})`} headingId="open-follow-ups">
              {overdueCount > 0 && <p className="reading-warning">{overdueCount} overdue</p>}
              {taskQueue.length ? taskQueue.map((f) => <FollowUp key={f.action_id} follow={f} alert={alerts.find((a) => a.alert_id === f.alert_id)} action={action} api={api} metrics={metrics} busy={busy} onMeasure={openMeasurement}
              onCompleted={() => openResponse(`follow-up-${f.action_id}`)} />) : <p className="muted">Plan a follow-up from an open alert to assign a review or repeat reading.</p>}</Panel>
          </div>
          {closedAlerts.length > 0 && <details className="panel">
            <summary>Closed alerts ({closedAlerts.length})</summary>
            {closedAlerts.map((a) => <AlertCard key={a.alert_id} alert={a} action={action} api={api} metrics={metrics} busy={busy} onOpenMetric={openMetric} crewName={member.name} />)}
          </details>}
          {closedFollowUps.length > 0 && <details className="panel">
            <summary>Closed follow-ups ({closedFollowUps.length})</summary>
            {closedFollowUps.map((f) => <FollowUp key={f.action_id} follow={f} alert={alerts.find((a) => a.alert_id === f.alert_id)} action={action} api={api} metrics={metrics} busy={busy} onMeasure={openMeasurement}
              onReviewAlert={(id) => openResponse(`alert-${id}`)} />)}
          </details>}
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
              <button onClick={() => confirm(`Clear generated demo data and incident workflow records for ${member.name}?`) && action(() => api("/api/simulator/reset", post()), "Demo data cleared")}>Reset Demo</button>
            </div>
          </Panel>
          <div className="grid two">
          <Panel title="CSV Exports">
            <p className="muted">Exports preserve simulated/manual/imported labels.</p>
            <div className="toolbar">
              <a href={scopedPath("/api/reports/export/measurements")}><button><Download size={16} /> Measurements</button></a>
              <a href={scopedPath("/api/reports/export/alerts")}><button><Download size={16} /> Alerts</button></a>
              <a href={scopedPath("/api/reports/export/follow-ups")}><button><Download size={16} /> Follow-ups</button></a>
            </div>
          </Panel>
          <Panel title="CSV Import">
            <label>CSV crew ID for {member.name}<input readOnly value={member.crew_id} onFocus={(event) => event.currentTarget.select()} /></label>
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

function MetricCard({ label, value, hint, icon, tone, onClick }: {
  label: string; value: string | number; hint: string; icon: React.ReactNode; tone?: string; onClick?: () => void;
}) {
  const className = `metric-card ${tone || ""}`;
  const content = <><span className="metric-card-label"><span>{label}</span>{icon}</span><strong>{value}</strong><span className="metric-card-hint">{hint}</span></>;
  return onClick ? <button type="button" className={className} onClick={onClick}>{content}</button> : <div className={className}>{content}</div>;
}

function MissionHero({ summary, activeAlerts, latest, onOpenMetric, onMeasure, metrics }: any) {
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
      <p className="body-map-hint">Hover over a dot for the latest reading, or select it to explore its history.</p>
    </div>
    <BodyModel latest={latest} alerts={activeAlerts} onOpenMetric={onOpenMetric} onMeasure={onMeasure} metrics={metrics} />
  </div>;
}

const bodyHotspots = [
  { id: "temperature", label: "Body temperature", side: "left", location: "Body-wide reading. Measurement site is not tracked.", unit: "°C", metrics: [{ key: "body_temperature", label: "Temperature" }] },
  { id: "cardio", label: "Heart rate", side: "left", location: "Cardiovascular signal", unit: "bpm", metrics: [{ key: "heart_rate", label: "Heart rate" }] },
  { id: "pressure", label: "Blood pressure", side: "left", location: "Upper-arm cuff reference", unit: "mmHg", metrics: [{ key: "systolic_bp", label: "Systolic" }, { key: "diastolic_bp", label: "Diastolic" }] },
  { id: "oxygen", label: "Blood oxygen", side: "right", location: "Fingertip sensor reference", unit: "%", metrics: [{ key: "blood_oxygen", label: "Blood oxygen" }] },
  { id: "hydration", label: "Hydration", side: "right", location: "Whole-body hydration self-rating", unit: "/10", metrics: [{ key: "hydration", label: "Hydration" }] },
  { id: "exercise", label: "Exercise duration", side: "left", location: "Duration of the full exercise session", unit: "min", metrics: [{ key: "exercise_duration", label: "Exercise duration" }] }
] as const;

function BodyModel({ latest, alerts, onOpenMetric, onMeasure, metrics }: {
  latest: Record<string, Measurement | undefined>; alerts: Alert[]; onOpenMetric: (metric: string) => void;
  onMeasure: (metric: string) => void; metrics: Record<string, MeasurementConfig>;
}) {
  const [selected, setSelected] = useState<typeof bodyHotspots[number]>();
  const detail = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const alertMetrics = new Set(alerts.flatMap((alert) => (alert.evidence_summary || []).map((item) => item.metric_type)));
  useEffect(() => {
    if (selected) detail.current?.querySelector("button")?.focus();
  }, [selected]);
  const close = () => {
    setSelected(undefined);
    trigger.current?.focus();
  };

  return <div className="body-model reference-body" role="group" aria-label="Crew health map">
    <div className="body-figure">
      <img src="/images/wireframe-human-front.png" alt="Cyan wireframe adult body front view" />
      {bodyHotspots.map((spot) => {
        const readings = spot.metrics.map(({ key }) => latest[key]);
        const review = spot.metrics.some(({ key }) => alertMetrics.has(key)) || readings.some((row) => row && (row.freshness !== "current" || row.quality_status !== "valid" || row.quality_flags?.length));
        return <button key={spot.id}
          className={`body-hotspot hotspot-${spot.id} tip-${spot.side}${review ? " hotspot-review" : ""}${readings.every((row) => !row) ? " hotspot-empty" : ""}`}
          aria-label={`${spot.label}${review ? ", review available" : readings.every((row) => !row) ? ", no reading" : ""}`}
          aria-describedby={selected ? undefined : `tip-${spot.id}`}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setSelected(spot);
          }}>
          {!selected && <span id={`tip-${spot.id}`} role="tooltip" className="hotspot-tooltip">
            <small>{spot.label}</small>
            <HotspotReadings spot={spot} latest={latest} alertMetrics={alertMetrics} />
            <small>Select for charts and measurement guidance</small>
          </span>}
        </button>;
      })}
    </div>
    {selected && <div ref={detail} className="hotspot-detail" role="group" aria-label={selected.label} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <strong>{selected.label}</strong>
      <HotspotReadings spot={selected} latest={latest} alertMetrics={alertMetrics} />
      <div className="toolbar">
        {selected.metrics.map(({ key, label }) => <button key={key} onClick={() => onOpenMetric(key)}>{label} chart</button>)}
        <button onClick={close}>Close</button>
      </div>
      {selected.metrics.map(({ key, label }) => <details key={key}>
        <summary>How to record {label.toLowerCase()}</summary>
        <MeasurementGuide metric={key} config={metrics[key]} />
        <button onClick={() => onMeasure(key)}>Record {label.toLowerCase()}</button>
      </details>)}
    </div>}
  </div>;
}

function HotspotReadings({ spot, latest, alertMetrics }: { spot: typeof bodyHotspots[number]; latest: Record<string, Measurement | undefined>; alertMetrics: Set<string> }) {
  return <>
    <small>{spot.location}</small>
    {spot.metrics.map(({ key, label }) => <span className="hotspot-reading" key={key}>
      {spot.metrics.length > 1 && <small>{label}</small>}
      <b>{latest[key]?.value ?? "—"} <em>{spot.unit}</em></b>
      <ReadingMeta reading={latest[key]} />
      {alertMetrics.has(key) && <small>Linked to an open alert</small>}
    </span>)}
  </>;
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

type MeasurementConfig = { label: string; min: number; max: number; unit: string };

function MeasurementGuide({ metric, config, id }: { metric: string; config: MeasurementConfig; id?: string }) {
  return <div className="measurement-guide" id={id}>
    <strong>{config.label} measurement guide</strong>
    <p className="muted">{measurementGuidance[metric] || "Use a consistent scoring method and note what influenced this rating."} ORBIT accepts {config.min}–{config.max} {displayUnit(config.unit)}.</p>
    {missionContext[metric] && <p className="muted">{missionContext[metric]} <a href="https://www.nasa.gov/hrp/risks/" target="_blank" rel="noreferrer">NASA Human Research Program</a></p>}
    {metric === "sleep_duration" && <p className="muted">NASA’s ARCHeR study tracked sleep, activity, and wellbeing during Artemis II. <a href="https://www.nasa.gov/hrp/ongoing-hrp-research/" target="_blank" rel="noreferrer">NASA’s ARCHeR study</a></p>}
  </div>;
}

function ActivitySelect({ value, onChange, environment }: {
  value: ReadingActivity; onChange: (value: ReadingActivity) => void; environment?: Environment;
}) {
  return <label>Activity at measurement time {environment && <small>· {environments[environment]}</small>}
    <select value={value} onChange={(event) => onChange(event.target.value as ReadingActivity)}>
      {Object.entries(activities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  </label>;
}

function MissionRoutine({ routine, metrics, busy, onRecord, onSchedule, onEnvironment }: {
  routine: Routine;
  metrics: Record<string, { label: string }>;
  busy: boolean;
  onRecord: (metric: string) => void;
  onEnvironment: (environment: Environment) => void;
  onSchedule: (times: Record<string, FormDataEntryValue>) => void;
}) {
  const completed = routine.tasks.filter((task) => task.status === "Completed").length;
  return <>
    <label className="mission-environment">Mission environment<select value={routine.environment} disabled={busy}
      onChange={(event) => onEnvironment(event.target.value as Environment)}>
      {Object.entries(environments).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>
    <p role="status">{completed} of {routine.tasks.length} check-ins completed · {routine.day} UTC</p>
    <ul className="routine-list">
      {routine.tasks.map((task) => <li key={task.metric}>
        <strong>{metrics[task.metric].label}</strong>
        <span className={task.status === "Overdue" ? "reading-warning" : "muted"}>{task.time} UTC · {task.status}</span>
        {task.status !== "Completed" && <button onClick={() => onRecord(task.metric)} aria-label={`Record ${metrics[task.metric].label}`}>Record</button>}
      </li>)}
    </ul>
    <details>
      <summary>Edit this crew member’s daily schedule</summary>
      <form className="guidance-form" key={JSON.stringify([routine.environment, routine.tasks.map(({ metric, time }) => [metric, time])])}
        onSubmit={(event) => {
          event.preventDefault();
          onSchedule(Object.fromEntries(new FormData(event.currentTarget)));
        }}>
        {routine.tasks.map((task) => <label key={task.metric}>{metrics[task.metric].label} (UTC)
          <input type="time" name={task.metric} defaultValue={task.time} required />
        </label>)}
        <button disabled={busy}>Save schedule</button>
      </form>
    </details>
  </>;
}

function Panel({ title, children, headingId }: any) {
  return <div className="panel"><h2 id={headingId} tabIndex={headingId ? -1 : undefined}>{title}</h2>{children}</div>;
}

function DeleteCrewDialog({ name, busy, error, onCancel, onConfirm }: {
  name: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="delete-dialog" aria-labelledby="delete-crew-title" onCancel={(event) => {
    event.preventDefault();
    if (!busy) onCancel();
  }}>
    <h2 id="delete-crew-title">Delete crew profile?</h2>
    <p><strong>{name}</strong> will be removed from the crew selector. Their records will be archived locally.</p>
    {error && <p role="alert">{error}</p>}
    <div className="toolbar">
      <button autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
      <button className="danger-button" disabled={busy} onClick={onConfirm}><Trash2 size={16} /> Delete crew</button>
    </div>
  </dialog>;
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

function HealthTimeline({ metrics, revision, api, initialMetric, initialQuality }: any) {
  const [metric, setMetric] = useState(initialMetric || "heart_rate");
  const allMetrics = metric === "all";
  const chartHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (initialMetric) chartHeading.current?.focus({ preventScroll: true });
  }, [initialMetric]);
  const [rows, setRows] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [source, setSource] = useState("all");
  const [quality, setQuality] = useState(initialQuality);
  const [style, setStyle] = useState("line");
  const [page, setPage] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setRows([]);
    const query = new URLSearchParams({ limit: "all" });
    if (!allMetrics) query.set("metric", metric);
    api(`/api/measurements?${query}`).then((result: Measurement[]) => {
      if (!cancelled) setRows(result);
    }).catch((err) => { if (!cancelled) setError(err.message || "Could not load readings"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [metric, allMetrics, api, revision, retry]);
  useEffect(() => { setPage(0); }, [metric, start, end, source, quality, rows]);
  const invalidRange = !!start && !!end && start > end;
  const filtered = useMemo(() => {
    if (invalidRange) return [];
    const from = start ? new Date(`${start}T00:00:00`).getTime() : -Infinity;
    const until = end ? new Date(`${end}T23:59:59.999`).getTime() : Infinity;
    return rows.filter((row) => {
      const time = new Date(row.measured_at).getTime();
      const matchesQuality = quality === "warnings" ? row.quality_status !== "valid" : quality === "all" || row.quality_status === quality;
      return time >= from && time <= until && (allMetrics || Number.isFinite(row.value)) && (source === "all" || row.source === source) && matchesQuality;
    }).sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
  }, [rows, start, end, source, quality, invalidRange, allMetrics]);
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
    <h2 ref={chartHeading} tabIndex={-1}>{allMetrics ? "Review readings" : "Health graphs"}</h2>
    {allMetrics && <p className="muted">Select a health metric to see its chart.</p>}
    <div className="graph-controls">
      <label>Health metric<select aria-label="Health metric" value={metric} onChange={(event) => { setMetric(event.target.value); setSource("all"); }}><option value="all">All metrics</option>{Object.entries(metrics).map(([key, value]: any) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <label>From<input type="date" value={start} max={end || undefined} onInput={(event) => setStart(event.currentTarget.value)} onChange={(event) => setStart(event.target.value)} /></label>
      <label>To<input type="date" value={end} min={start || undefined} onInput={(event) => setEnd(event.currentTarget.value)} onChange={(event) => setEnd(event.target.value)} /></label>
      <label>Source<select aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sources</option>{sources.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
      <label>Quality<select aria-label="Quality" value={quality} onChange={(event) => setQuality(event.target.value)}><option value="all">All records</option><option value="warnings">Quality warnings</option><option value="valid">Valid</option><option value="questionable">Questionable</option><option value="invalid">Invalid</option></select></label>
      {!allMetrics && <label>Graph<select aria-label="Graph type" value={style} onChange={(event) => setStyle(event.target.value)}><option value="line">Line</option><option value="bar">Bar</option></select></label>}
      <button title="Reset filters" aria-label="Reset filters" onClick={() => { setStart(""); setEnd(""); setSource("all"); setQuality("all"); }}><RefreshCw size={16} /></button>
    </div>
    {invalidRange && <p role="alert" className="reading-warning">The start date must be on or before the end date.</p>}
    {!allMetrics && <div className="graph-heading"><h3>{config.label} <span>({unit})</span></h3><span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div>}
    <div className={allMetrics ? undefined : "health-graph"} aria-label={allMetrics ? undefined : `${config.label} graph`} aria-busy={loading}>
      {loading ? <p role="status">Loading readings...</p> : error ? <div role="alert"><p>{error}</p><button onClick={() => setRetry(retry + 1)}><RefreshCw size={16} /> Retry</button></div> : !filtered.length ? <p>No readings match these filters.</p> : !allMetrics && <ResponsiveContainer width="100%" height="100%">{style === "line" ? <LineChart {...chartProps}>{axes}<Line type="linear" dataKey="value" name={config.label} stroke="#60c7d0" strokeWidth={2} isAnimationActive={false} dot={(props: any) => <circle key={props.payload.measurement_id} cx={props.cx} cy={props.cy} r={3} fill={props.payload.quality_status !== "valid" || props.payload.quality_flags?.length ? "#ffd166" : "#60c7d0"} />} /></LineChart> : <BarChart {...chartProps}>{axes}<Bar dataKey="value" name={config.label} fill="#60c7d0" maxBarSize={32} isAnimationActive={false} /></BarChart>}</ResponsiveContainer>}
    </div>
    {!loading && !error && <>
      {!allMetrics && <dl className="graph-summary"><div><dt>Readings</dt><dd>{filtered.length}</dd></div><div><dt>Latest</dt><dd>{filtered.at(-1)?.value ?? "--"} {unit}</dd></div><div><dt>Average</dt><dd>{average === null ? "--" : format(average)} {unit}</dd></div><div><dt>Flagged</dt><dd>{flagged}</dd></div></dl>}
      <MeasurementTable rows={[...filtered].reverse().slice(currentPage * 50, (currentPage + 1) * 50)} />
      <div className="record-pagination"><button aria-label="Previous records" title="Previous records" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>Page {currentPage + 1} of {lastPage + 1} · {filtered.length} records</span><button aria-label="Next records" title="Next records" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div>
    </>}
  </div>;
}

function ReadingTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="reading-chart-tooltip"><strong>{label}: {row.value} {unit}</strong><p>{new Date(row.measured_at).toLocaleString()}</p><p>{row.source.replaceAll("_", " ")} · {row.quality_status}</p>{row.activity && <p>{readingContext(row)}</p>}{!!row.quality_flags?.length && <p className="reading-warning">{row.quality_flags.join(", ")}</p>}</div>;
}

function displayUnit(unit: string) {
  return ({ percent: "%", c: "°C", hours: "h", minutes: "min", score_1_10: "/10", score_0_10: "/10", score_1_5: "/5" } as Record<string, string>)[unit] || unit;
}

function QualityChart({ rows }: { rows: Measurement[] }) {
  const counts = rows.reduce((acc: any, row) => ({ ...acc, [row.quality_status]: (acc[row.quality_status] || 0) + 1 }), {});
  const data = Object.entries(counts).map(([name, count]) => ({ name, count }));
  return <ResponsiveContainer width="100%" height={180}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#26374f" /><XAxis dataKey="name" stroke="#9db2ce" /><YAxis stroke="#9db2ce" /><Tooltip contentStyle={{ background: "#111c2d", border: "1px solid #2a3d58" }} /><Bar dataKey="count" fill="#60c7d0" /></BarChart></ResponsiveContainer>;
}

function Finding({ finding }: { finding?: Investigation }) {
  if (!finding) return <p className="muted">No investigation has been run yet.</p>;
  return <div className="incident"><h3 className={finding.severity}>{finding.title}</h3><p>{finding.explanation}</p><div>{finding.evidence?.map((e: any) => <span className="pill" key={e.measurement_id}>{e.metric_type}: {e.value} vs {e.bound}</span>)}</div>{!!finding.quality_limitations?.length && <p className="muted">{finding.quality_limitations.length} quality-limited record(s) excluded.</p>}{!!finding.missing_metrics?.length && <p className="reading-warning">No usable recent reading: {finding.missing_metrics.map((m) => m.replaceAll("_", " ")).join(", ")}.</p>}{!!finding.insufficient_baselines?.length && <p className="reading-warning">Baseline not established: {finding.insufficient_baselines.map((m) => m.replaceAll("_", " ")).join(", ")}.</p>}</div>;
}

function InvestigationResult({ finding, alert, metrics, onOpenMetric, onMeasure, onOpenAlert, onPlan }: {
  finding: Investigation; alert?: Alert; metrics: any;
  onOpenMetric?: (metric: string) => void; onMeasure?: (metric: string) => void; onOpenAlert?: (id: string) => void;
  onPlan?: (id: string) => void;
}) {
  const missing = finding.missing_metrics || [];
  const insufficient = finding.insufficient_baselines || [];
  const gaps = [...new Set([...missing, ...insufficient])];
  const evidence = finding.evidence || [];
  const checks = finding.signal_checks;
  const compared = checks?.filter((row) => row.result !== "insufficient_data").length ?? 0;
  const excluded = finding.quality_limitations || [];
  let title = finding.title;
  if (checks && !compared) title = "Insufficient data for comparison";
  else if (checks && !evidence.length) title = "No drift flagged in this window";
  else if (evidence.length === 2) title = "Two signals flagged";
  return <div className="investigation-result">
    <h3 className={finding.severity}>{title}</h3>
    {checks && !compared ? <p>ORBIT needs both a usable reading in this window and an established baseline for the same signal.</p> :
      <p>{evidence.length === 2 ? "Two signals crossed their baseline bounds. ORBIT’s combined-alert rule requires at least three." : finding.explanation}</p>}
    {finding.window_start && finding.as_of && <p className="muted">Window · {new Date(finding.window_start).toLocaleString()} to {new Date(finding.as_of).toLocaleString()}</p>}
    {checks && <>
      <p><strong>{compared} of {checks.length} signals compared</strong> · {evidence.length} flagged · {checks.length - compared} with data gaps</p>
      <details>
        <summary>View signal comparisons</summary>
        <div className="table-wrap"><table>
        <thead><tr><th>Signal</th><th>Reading in window</th><th>Baseline</th><th>Result</th>{onOpenMetric && <th>History</th>}</tr></thead>
        <tbody>{checks.map((row) => {
          const unit = displayUnit(metrics[row.metric_type]?.unit || "");
          return <tr key={row.metric_type}>
            <th scope="row">{labelFor(row.metric_type, metrics)}</th>
            <td>{row.value === null ? "No usable reading" : <>{row.value} {unit}<small className="record-flags">{row.measured_at && new Date(row.measured_at).toLocaleString()}</small></>}</td>
            <td>{row.baseline_mean === null ? "Insufficient history" : <>Mean {format(row.baseline_mean)} {unit}<small className="record-flags">{row.direction === "low" ? "Lower" : "Upper"} bound {format(row.bound)}</small></>}
              <small className="record-flags">{row.baseline_samples} usable sample(s){row.baseline_samples_required != null && row.baseline_mean === null && ` · ${Math.max(0, row.baseline_samples_required - row.baseline_samples)} more needed`}</small></td>
            <td>{row.result === "flagged" ? "Flagged" : row.result === "clear" ? "No drift flagged" : "Could not compare"}</td>
            {onOpenMetric && <td><button onClick={() => onOpenMetric(row.metric_type)}>View chart</button></td>}
          </tr>;
        })}</tbody>
        </table></div>
      </details>
    </>}
    {!checks && evidence.length > 0 && <div className="table-wrap"><table>
      <thead><tr><th>Signal</th><th>Latest reading</th><th>Baseline mean</th><th>Baseline bound</th><th>History</th></tr></thead>
      <tbody>{evidence.map((row) => <tr key={row.measurement_id}>
        <th scope="row">{labelFor(row.metric_type, metrics)}</th>
        <td>{row.value} {displayUnit(metrics[row.metric_type]?.unit || "")}</td>
        <td>{row.baseline_mean ?? "—"}</td>
        <td>{row.direction === "low" ? "Lower" : "Upper"} · {row.bound}</td>
        <td><button onClick={() => onOpenMetric(row.metric_type)}>View chart</button></td>
      </tr>)}</tbody>
    </table></div>}
    {excluded.length > 0 && <details>
      <summary>{excluded.length} recent reading(s) excluded by quality checks</summary>
      <ul className="checklist">{excluded.map((row) => <li key={row.measurement_id}>
        {labelFor(row.metric_type, metrics)} · {(row.flags || []).map((flag: string) => flag.replaceAll("_", " ")).join(", ") || "Quality check failed"}
        {onMeasure && Object.hasOwn(metrics, row.metric_type) && <button onClick={() => onMeasure(row.metric_type)}>Record again</button>}
      </li>)}</ul>
    </details>}
    {gaps.length > 0 && <details>
      <summary>Data gaps ({gaps.length})</summary>
      <ul className="checklist">{gaps.map((metric) => <li key={metric}>
        <strong>{labelFor(metric, metrics)}</strong> · {[missing.includes(metric) && "No usable reading in this window", insufficient.includes(metric) && "Needs more baseline readings"].filter(Boolean).join(" · ")}
        {onMeasure && Object.hasOwn(metrics, metric) && <button onClick={() => onMeasure(metric)}>Record reading</button>}
      </li>)}</ul>
    </details>}
    {alert && onOpenAlert ? <div className="toolbar">
      <button onClick={() => onOpenAlert(alert.alert_id)}>Open linked alert</button>
      {onPlan && !["RESOLVED", "FALSE_POSITIVE"].includes(alert.status) && <button className="primary" onClick={() => onPlan(alert.alert_id)}>Plan follow-up</button>}
    </div> :
      onMeasure && <p className="muted">{evidence.length ? "Review the flagged readings in their charts." : gaps.length ? "Collect the missing readings and rerun the investigation when more history is available." : "No new alert was created for this window."}</p>}
  </div>;
}

function AlertCard({ alert, action, api, metrics, busy, onOpenMetric, crewName, startPlanning = false,
  finding, tasks = [], onOpenFollowUp, onClosed }: {
  alert: Alert; action: any; api: typeof request; metrics: any; busy: boolean; onOpenMetric: (metric: string) => void;
  crewName: string; startPlanning?: boolean;
  finding?: Investigation; tasks?: FollowUpRecord[]; onOpenFollowUp?: (id: string) => void;
  onClosed?: () => void;
}) {
  const [planning, setPlanning] = useState(startPlanning);
  const [repeatMetric, setRepeatMetric] = useState<string>();
  const [closing, setClosing] = useState(false);
  const [resolution, setResolution] = useState("");
  const taskDescription = useRef<HTMLTextAreaElement>(null);
  const resolutionInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (closing) resolutionInput.current?.focus();
  }, [closing]);
  useEffect(() => {
    if (planning && repeatMetric) taskDescription.current?.focus();
  }, [planning, repeatMetric]);
  const evidenceMetrics = [...new Set<string>((alert.evidence_summary || []).map((item) => item.metric_type))]
    .filter((metric) => Object.hasOwn(metrics, metric));
  const closed = ["RESOLVED", "FALSE_POSITIVE"].includes(alert.status);
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED");
  const excludedByMetric = new Map<string, Set<string>>();
  for (const row of finding?.quality_limitations ?? []) {
    if (!Object.hasOwn(metrics, row.metric_type)) continue;
    const flags = excludedByMetric.get(row.metric_type) ?? new Set<string>();
    for (const flag of row.flags ?? []) flags.add(flag.replaceAll("_", " "));
    excludedByMetric.set(row.metric_type, flags);
  }
  const planMetrics = [...new Set([...evidenceMetrics, ...excludedByMetric.keys()])];
  const update = (endpoint: string, payload?: any, label = "Alert updated") => action(() => api(`/api/alerts/${alert.alert_id}/${endpoint}`, post(payload || {})), label);
  return <div className="incident" id={`alert-${alert.alert_id}`} tabIndex={-1}>
    <h3 className={alert.severity}>{alert.title}</h3>
    <p>{alert.explanation}</p>
    <p><span className="pill">{alert.severity}</span><span className="pill">{alert.status}</span></p>
    {closed && alert.resolution_notes && <p><strong>Outcome</strong> · {alert.resolution_notes}</p>}
    {closed ? <>
      <GroundReview alert={alert} api={api} metrics={metrics} crewName={crewName} />
    </> : <section className="alert-next-step">
      <h4>Recommended next step</h4>
      {evidenceMetrics.length > 0 && <>
        <p>Review the readings that crossed their personal baseline bounds and prepare a ground review summary.</p>
        <ul className="checklist">{(alert.evidence_summary || []).filter((row) => Object.hasOwn(metrics, row.metric_type)).map((row) => {
          const context = readingContext(alert.evidence_context?.[row.measurement_id] ?? {});
          return <li key={row.measurement_id}>
            {metrics[row.metric_type].label}
            {context && <small> · {context}</small>}
          </li>;
        })}</ul>
      </>}
      {excludedByMetric.size > 0 && <details>
        <summary>Verify excluded readings ({excludedByMetric.size} signals)</summary>
        <ul className="checklist">{[...excludedByMetric].map(([metric, flags]) => {
          const task = tasks.find((item) => item.metric_type === metric && isOpenFollowUp(item));
          return <li key={metric}>
            <strong>{metrics[metric].label}</strong> · {[...flags].join(", ") || "Quality check failed"}
            <button type="button" disabled={busy} onClick={() => {
              if (task) {
                onOpenFollowUp?.(task.action_id);
              } else {
                setRepeatMetric(metric);
                setPlanning(true);
              }
            }}>{task ? "Open repeat follow-up" : "Plan repeat measurement"}</button>
          </li>;
        })}</ul>
      </details>}
      {!evidenceMetrics.length && !excludedByMetric.size && <p>Review the alert details and record the outcome before resolving it.</p>}
      {alert.severity === "HIGH" && <p>Use the mission’s established escalation procedure for high-priority findings.</p>}
      <GroundReview alert={alert} api={api} metrics={metrics} crewName={crewName} />
    </section>}
    {evidenceMetrics.length > 0 && <details>
      <summary>Metric charts</summary>
      <div className="toolbar">{evidenceMetrics.map((metric) =>
        <button key={metric} type="button" onClick={() => onOpenMetric(metric)}>{metrics[metric].label}</button>
      )}</div>
    </details>}
    {!closed && <>
      {completedTasks.length > 0 && <details open={closing || undefined}>
        <summary>Completed follow-up outcomes ({completedTasks.length})</summary>
        <ul className="checklist">{completedTasks.map((task) => <li key={task.action_id}>
          <strong>{task.description}</strong>
          {task.completion_notes && <p>{task.completion_notes}</p>}
          {task.measurement && <LinkedReading reading={task.measurement} />}
        </li>)}</ul>
      </details>}
      <div className="toolbar">
        {alert.status === "NEW" && <button disabled={busy} onClick={() => update("acknowledge", { user: "demo-user" })}>Acknowledge</button>}
        {alert.status !== "INVESTIGATING" && <button disabled={busy} onClick={() => update("investigate")}>Investigate</button>}
        <button disabled={busy} aria-expanded={planning} onClick={() => { setRepeatMetric(undefined); setPlanning(!planning); }}>Plan follow-up</button>
        <button disabled={busy} aria-expanded={closing} onClick={() => setClosing(!closing)}>Close alert</button>
      </div>
      {closing && <form className="guidance-form" onSubmit={(event) => {
        event.preventDefault();
        if (busy || !resolution.trim()) return;
        action(() => api(`/api/alerts/${alert.alert_id}/resolve`, post({ resolution_notes: resolution.trim() })), "Alert closed", onClosed);
      }}>
        <label>Alert outcome<textarea ref={resolutionInput} required maxLength={1000} value={resolution}
          onChange={(event) => setResolution(event.target.value)}
          placeholder="Summarize the review and why you’re closing this alert" /></label>
        <div className="toolbar">
          <button className="primary" disabled={busy || !resolution.trim()}>Save outcome and close alert</button>
          <button type="button" disabled={busy} onClick={() => setClosing(false)}>Cancel</button>
        </div>
      </form>}
      {planning && <form key={repeatMetric ?? "general"} className="guidance-form" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const due = String(fields.get("due"));
        action(async () => {
          await api("/api/follow-ups", post({
            alert_id: alert.alert_id,
            metric_type: fields.get("metric") || undefined,
            description: String(fields.get("description")).trim(),
            assigned_to: String(fields.get("owner")).trim(),
            due_at: due ? new Date(due).toISOString() : null
          }));
          setPlanning(false);
          setRepeatMetric(undefined);
        }, "Follow-up created");
      }}>
        <label>Task<textarea ref={taskDescription} name="description" required maxLength={500} defaultValue={repeatMetric ? `Repeat ${metrics[repeatMetric].label} to verify the excluded reading.` : ""} placeholder="Describe the reading or review to complete" /></label>
        <label>Assigned to<input name="owner" required maxLength={80} defaultValue="Mission Health Officer" /></label>
        <label>Due time (optional)<input name="due" type="datetime-local" /></label>
        <label>Repeat measurement (optional)<select name="metric" defaultValue={repeatMetric ?? evidenceMetrics[0] ?? ""}><option value="">Review only</option>{planMetrics.map((metric) => <option key={metric} value={metric}>{metrics[metric].label}</option>)}</select></label>
        <button disabled={busy}>Save follow-up</button>
      </form>}
    </>}
  </div>;
}

function GroundReview({ alert, api, metrics, crewName }: {
  alert: Alert; api: typeof request; metrics: any; crewName: string;
}) {
  const [brief, setBrief] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const textArea = useRef<HTMLTextAreaElement>(null);
  const readingText = (reading: Measurement) =>
    `${reading.value} ${displayUnit(reading.unit)} at ${reading.measured_at} (${[reading.source, reading.quality_status, ...(reading.quality_flags || [])].map((part) => part.replaceAll("_", " ")).join(", ")})${reading.activity ? ` · ${readingContext(reading)}` : ""}`;
  const prepare = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await api(`/api/alerts/${alert.alert_id}/brief`);
      setBrief([
        "ORBIT ground review summary",
        `Crew member · ${crewName}`,
        `Alert · ${alert.title} (${alert.severity}, ${alert.status})`,
        `Observation window (UTC) · ${data.window_start || "Unavailable"} to ${data.as_of || "Unavailable"}`,
        "",
        "Flagged readings",
        ...data.readings.map((row) => `• ${labelFor(row.metric_type, metrics)} · ${row.reading ? readingText(row.reading) : row.value} · Baseline mean ${row.baseline_mean ?? "unavailable"}, ${row.direction === "low" ? "lower" : "upper"} bound ${row.bound}`),
        "",
        "Quality exclusions",
        ...(data.excluded.length ? data.excluded.map((row) => `• ${labelFor(row.metric_type, metrics)} · ${(row.flags || []).map((flag) => flag.replaceAll("_", " ")).join(", ") || "Quality check failed"}`) : ["None recorded"]),
        "",
        "Symptoms and measurement context",
        ...(data.symptoms ? [`Symptom severity · ${readingText(data.symptoms)}`] : []),
        ...(data.context.length ? data.context : ["No context notes recorded in the window"]),
        "",
        "Follow-ups",
        ...(data.tasks.length ? data.tasks.map((task: FollowUpRecord) => [
          `• ${task.description} · ${task.assigned_to} · ${task.status}`,
          task.due_at && `Due (UTC) · ${task.due_at}`,
          task.measurement && `Repeat reading · ${readingText(task.measurement)}`,
          task.measurement?.notes && `Reading notes · ${task.measurement.notes}`,
          task.completion_notes && `Outcome · ${task.completion_notes}`
        ].filter(Boolean).join("\n")) : ["None recorded"]),
        ...(data.resolution ? ["", `Resolution · ${data.resolution}`] : [])
      ].join("\n"));
      setExpanded(true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="ground-review">
    <button disabled={busy} aria-expanded={expanded} onClick={() => {
      if (brief) setExpanded(!expanded);
      else void prepare();
    }}>{brief ? (expanded ? "Hide ground review summary" : "Show ground review summary") : "Prepare ground review summary"}</button>
    {brief && expanded && <div className="guidance-form">
      <label>Ground review summary<textarea ref={textArea} readOnly rows={10} value={brief} /></label>
      <button onClick={async () => {
        try {
          await navigator.clipboard.writeText(brief);
          setMessage("Summary copied.");
        } catch {
          textArea.current?.focus();
          textArea.current?.select();
          setMessage("Summary selected. Use your device’s copy command.");
        }
      }}>Copy summary</button>
      <button disabled={busy} onClick={prepare}>Refresh summary</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </div>;
}

function LinkedReading({ reading }: { reading: Measurement }) {
  return <p><strong>Linked reading</strong> · {reading.value} {displayUnit(reading.unit)} · {new Date(reading.measured_at).toLocaleString()} · {reading.quality_status}</p>;
}

function FollowUp({ follow, alert, action, api, metrics, busy, onMeasure, onCompleted, onReviewAlert }: {
  follow: FollowUpRecord; alert?: Alert; action: any; api: typeof request; metrics: any;
  busy: boolean; onMeasure: (metric: string, task: FollowUpRecord) => void;
  onCompleted?: () => void; onReviewAlert?: (id: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const closed = ["COMPLETED", "CANCELLED"].includes(follow.status);
  const metric = follow.metric_type;
  return <div className="incident" id={`follow-up-${follow.action_id}`} tabIndex={-1}>
    <strong>{follow.description}</strong>
    {alert && <p className="muted">Alert · {alert.title}</p>}
    <p>{follow.assigned_to} · <span className="pill">{follow.status}</span></p>
    {follow.due_at && <p className={!closed && dueTime(follow) < Date.now() ? "reading-warning" : undefined}>
      {!closed && dueTime(follow) < Date.now() ? "Overdue" : "Due"} · <time dateTime={follow.due_at}>{new Date(follow.due_at).toLocaleString()}</time>
    </p>}
    {follow.measurement && <LinkedReading reading={follow.measurement} />}
    {closed ? <>
      {follow.completion_notes && <p>{follow.completion_notes}</p>}
      {follow.status === "COMPLETED" && alert && onReviewAlert &&
        <button type="button" onClick={() => onReviewAlert(alert.alert_id)}>Review linked alert</button>}
    </> : <>
      {metric && metrics[metric] && <button disabled={busy} onClick={() => onMeasure(metric, follow)}>{follow.measurement ? "Record another" : "Record"} {metrics[metric].label}</button>}
      <form className="guidance-form" onSubmit={(event) => {
        event.preventDefault();
        action(() => api(`/api/follow-ups/${follow.action_id}`, {
          ...post({ status: "COMPLETED", completion_notes: notes.trim() }), method: "PATCH"
        }), "Follow-up completed", onCompleted);
      }}>
        <label>Outcome<textarea required maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record what was checked, the result, and any next action" /></label>
        <button disabled={busy || !notes.trim()}>Complete follow-up</button>
      </form>
    </>}
  </div>;
}

function BaselineTable({ rows, metrics = {} }: any) {
  return <div className="table-wrap"><table><thead><tr><th>Metric</th><th>Mean</th><th>Samples</th><th>Status</th></tr></thead><tbody>{rows.filter((b: any) => b.sample_count).map((b: any) => <tr key={b.baseline_id}><td>{metrics[b.metric_type]?.label || b.metric_type.replaceAll("_", " ")}</td><td>{format(b.mean)}</td><td>{b.sample_count}</td><td><span className={`status-label ${b.sufficient ? "valid" : "questionable"}`}>{b.sufficient ? "Established" : "Insufficient"}</span></td></tr>)}</tbody></table></div>;
}

function MeasurementTable({ rows }: { rows: Measurement[] }) {
  return <Panel title="Measurement Records"><div className="table-wrap"><table><thead><tr><th>Metric</th><th>Value</th><th>Time</th><th>Source</th><th>Quality</th><th>Context</th></tr></thead><tbody>{rows.map((m) => <tr key={m.measurement_id}><td className="metric-name">{m.metric_type.replaceAll("_", " ")}</td><td>{m.value} {displayUnit(m.unit)}</td><td>{new Date(m.measured_at).toLocaleString()}</td><td>{m.source.replaceAll("_", " ")}</td><td><span className={`status-label ${m.quality_status}`}>{m.quality_status}</span><small className="record-flags">{m.quality_flags?.map((flag) => flag.replaceAll("_", " ")).join(", ")}</small></td><td>{readingContext(m) || "—"}</td></tr>)}</tbody></table></div></Panel>;
}

function format(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}


function labelFor(name: string, metrics: any) {
  return metrics[name]?.label || name.replaceAll("_", " ");
}

createRoot(document.getElementById("root")!).render(<App />);
