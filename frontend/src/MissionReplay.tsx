import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Reading = { measurement_id: string; metric_type: string; value: number; unit: string; measured_at: string; source: string; quality_status: string; quality_flags: string[]; freshness?: string; timestamp?: number };
type Timeline = { timestamps: string[]; total_readings: number; start_at: string | null; end_at: string | null };
type Snapshot = {
  as_of: string; metric: string; visible_count: number; remaining_count: number; latest_readings: Record<string, Reading>; trend: Reading[]; preview_alert_count: number;
  baselines: { baseline_id: string; metric_type: string; sample_count: number; mean: number | null; sufficient: boolean }[];
  finding: { severity: string; title: string; explanation: string; evidence: { measurement_id: string; metric_type: string; value: number; bound: number }[]; missing_metrics: string[]; insufficient_baselines: string[] };
};

export default function MissionReplay({ metrics, revision, request }: { metrics: Record<string, { label: string; unit: string }>; revision: unknown; request: (path: string) => Promise<any> }) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [index, setIndex] = useState(0);
  const [metric, setMetric] = useState("heart_rate");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const selected = timeline?.timestamps[index];
  const finalIndex = Math.max(0, (timeline?.timestamps.length || 1) - 1);
  const ready = !!snapshot && snapshot.as_of === selected && snapshot.metric === metric && !loading && !error;

  useEffect(() => {
    let cancelled = false;
    setPlaying(false);
    setTimeline(null);
    setSnapshot(null);
    setIndex(0);
    setError("");
    request("/api/replay/timeline").then((result) => { if (!cancelled) setTimeline(result); }).catch(() => { if (!cancelled) setError("Could not load mission history."); });
    return () => { cancelled = true; };
  }, [revision, request, retry]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    request(`/api/replay/snapshot?at=${encodeURIComponent(selected)}&metric=${encodeURIComponent(metric)}`).then((result) => {
      if (!cancelled) setSnapshot(result);
    }).catch(() => { if (!cancelled) { setError("Could not load this replay point. Refresh the mission history if its data changed."); setPlaying(false); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, metric, request, timeline]);

  useEffect(() => {
    if (!playing || !ready) return;
    if (index >= finalIndex) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setIndex(index + 1), 1000 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, ready, index, finalIndex, speed]);

  const seek = (value: number) => { setPlaying(false); setIndex(Math.max(0, Math.min(finalIndex, value))); };
  const config = metrics[metric];
  const unit = ({ percent: "%", c: "°C", hours: "h", minutes: "min", score_1_10: "/10", score_0_10: "/10", score_1_5: "/5" } as Record<string, string>)[config?.unit] || config?.unit;
  const domainStart = timeline?.start_at ? new Date(timeline.start_at).getTime() : 0;
  const domainEnd = timeline?.end_at ? new Date(timeline.end_at).getTime() : 0;
  return <section className="mission-replay">
    <div className="replay-heading"><h2>Playback</h2><span>Preview session · Live alerts and follow-ups unchanged</span></div>
    {error && <div role="alert"><p className="reading-warning">{error}</p><button onClick={() => setRetry(retry + 1)}><RotateCcw size={16} /> Reload history</button></div>}
    {!timeline && !error && <p role="status">Loading mission history...</p>}
    {timeline && !timeline.timestamps.length && <p className="muted">No mission readings yet. Generate a scenario or import records in Data & Simulation Lab.</p>}
    {!!timeline?.timestamps.length && <>
      <div className="replay-clock"><span>Mission time</span><strong>{selected ? new Date(selected).toLocaleString() : "--"}</strong><small>{Intl.DateTimeFormat().resolvedOptions().timeZone} · Point {index + 1} of {timeline.timestamps.length} · {playing ? "Playing" : index === finalIndex ? "At end" : "Paused"}</small></div>
      <div className="replay-controls">
        <button title="Restart replay" aria-label="Restart replay" disabled={!!error} onClick={() => seek(0)}><RotateCcw size={18} /></button>
        <button title="Previous mission point" aria-label="Previous mission point" disabled={index === 0 || !!error} onClick={() => seek(index - 1)}><ChevronLeft size={18} /></button>
        <button className="primary" title={playing ? "Pause replay" : "Play replay"} aria-label={playing ? "Pause replay" : "Play replay"} disabled={finalIndex === 0 || !!error} onClick={() => { if (playing) setPlaying(false); else { if (index === finalIndex) setIndex(0); setPlaying(true); } }}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <button title="Next mission point" aria-label="Next mission point" disabled={index >= finalIndex || !!error} onClick={() => seek(index + 1)}><ChevronRight size={18} /></button>
        <label>Playback speed<select aria-label="Playback speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
        <label>Health metric<select aria-label="Replay health metric" value={metric} onChange={(event) => { setPlaying(false); setMetric(event.target.value); }}>{Object.entries(metrics).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label>Jump to mission time<select aria-label="Jump to mission time" value={selected} onChange={(event) => seek(timeline.timestamps.indexOf(event.target.value))}>{timeline.timestamps.map((time, i) => <option key={time} value={time}>{i + 1}. {new Date(time).toLocaleString()}</option>)}</select></label>
      </div>
      <label className="replay-scrubber">Mission progress<input type="range" min={0} max={finalIndex} step={1} value={index} disabled={finalIndex === 0 || !!error} aria-label="Mission progress" aria-valuetext={selected ? new Date(selected).toLocaleString() : "No mission time"} onInput={(event) => seek(Number(event.currentTarget.value))} onChange={(event) => seek(Number(event.target.value))} /></label>
      <div className="replay-endpoints"><span>{new Date(timeline.start_at!).toLocaleString()}</span><span>{new Date(timeline.end_at!).toLocaleString()}</span></div>
      <div className="replay-snapshot" aria-busy={loading}>
        {!ready ? <p role="status">{error ? "Replay paused until history reloads." : "Loading selected mission point..."}</p> : <>
          <dl className="graph-summary"><div><dt>Readings available</dt><dd>{snapshot.visible_count}</dd></div><div><dt>Not yet revealed</dt><dd>{snapshot.remaining_count}</dd></div><div><dt>Preview alerts</dt><dd>{snapshot.preview_alert_count}</dd></div><div><dt>Finding priority</dt><dd className={snapshot.finding.severity}>{snapshot.finding.severity}</dd></div></dl>
          <div className="replay-chart-header"><h3>{config?.label} <span>({unit})</span></h3></div>
          <div className="health-graph" aria-label="Replay metric graph">
            {!snapshot.trend.length ? <p>No readings for this metric at or before the selected time.</p> : <ResponsiveContainer width="100%" height="100%"><LineChart data={snapshot.trend} margin={{ top: 15, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#26374f" />
              <XAxis type="number" dataKey="timestamp" domain={[domainStart === domainEnd ? domainStart - 3600000 : domainStart, domainStart === domainEnd ? domainEnd + 3600000 : domainEnd]} stroke="#9db2ce" minTickGap={35} tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
              <YAxis width={55} domain={["auto", "auto"]} stroke="#9db2ce" />
              <Tooltip content={({ active, payload }) => { const row = payload?.[0]?.payload as Reading | undefined; return active && row ? <div className="reading-chart-tooltip"><strong>{row.value} {unit}</strong><p>{new Date(row.measured_at).toLocaleString()}</p><p>{row.source} · {row.quality_status}</p></div> : null; }} />
              <ReferenceLine x={new Date(selected!).getTime()} stroke="#ffd166" strokeDasharray="4 4" />
              <Line type="linear" dataKey="value" stroke="#60c7d0" strokeWidth={2} isAnimationActive={false} dot={(props: any) => <circle key={props.payload.measurement_id} cx={props.cx} cy={props.cy} r={3} fill={props.payload.quality_status !== "valid" || props.payload.quality_flags?.length ? "#ffd166" : "#60c7d0"} />} />
            </LineChart></ResponsiveContainer>}
          </div>
          <div className="replay-analysis">
            <section><h2>Investigation at selected time</h2><h3 className={snapshot.finding.severity}>{snapshot.finding.title}</h3><p>{snapshot.finding.explanation}</p>
              {snapshot.finding.evidence.length > 0 && <ul>{snapshot.finding.evidence.map((item) => <li key={item.measurement_id}>{metrics[item.metric_type]?.label}: {item.value} vs baseline bound {item.bound}</li>)}</ul>}
              {!!snapshot.finding.missing_metrics.length && <p className="reading-warning">Missing recent signals: {snapshot.finding.missing_metrics.map((key) => metrics[key]?.label).join(", ")}.</p>}
              {!!snapshot.finding.insufficient_baselines.length && <p className="reading-warning">Baseline not established: {snapshot.finding.insufficient_baselines.map((key) => metrics[key]?.label).join(", ")}.</p>}
            </section>
            <section><h2>Readings at mission time</h2><dl className="replay-readings">{["heart_rate", "blood_oxygen", "sleep_duration", "fatigue", "stress", "hydration"].map((key) => { const row = snapshot.latest_readings[key]; return <div key={key}><dt>{metrics[key]?.label}</dt><dd>{row ? `${row.value} ${row.unit}` : "No reading yet"}</dd>{row && <small className={row.freshness !== "current" || row.quality_status !== "valid" ? "reading-warning" : "muted"}>{new Date(row.measured_at).toLocaleString()} · {row.quality_status} · {row.freshness}</small>}</div>; })}</dl></section>
          </div>
        </>}
      </div>
    </>}
  </section>;
}
