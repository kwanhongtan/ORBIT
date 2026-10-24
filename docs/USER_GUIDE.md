# ORBIT User Guide

## Mission Overview

Use this screen to see the fictional mission profile, current telemetry count, quality warnings, active alerts, open follow-ups, and the latest investigator finding.

Latest readings include timestamp, source, input quality, and freshness. These checks do not establish medical normality. The heart-rate and fingertip-oxygen dots show details on hover, keyboard focus, or tap. Whole-body and self-report metrics are listed separately.

## Health Timeline

Review trends, measurement records, source labels, and quality status.

Select any health metric in **Health graphs** to review its full recorded history. Filter by local start/end dates, source, or quality and switch between line and bar graphs. Hover a plotted reading for its value, time, source, and quality flags. The records table follows the same filters and uses 50-record pages. Use the reset icon to clear filters. Metrics without matching data show an empty state.

## Drift Investigation

Recalculate baselines after generating stable data. Run the investigator after each scenario. Findings show the supporting measurements, baseline comparisons, severity, and quality limitations.

## Daily Check-in

Submit mood, fatigue, stress, sleep quality, symptom severity, and notes. Manual measurements can also be entered for oxygen saturation, blood pressure, simulated radiation-dose placeholders, and bone-assessment placeholders.

## Action Centre

Alerts can be acknowledged, moved to investigation, marked false positive, resolved with required notes, or linked to follow-up actions. Completing a follow-up does not automatically resolve an alert.

## AI Health Assistant

The assistant screen generates a local structured fallback explanation. It is not a diagnosis and does not send data externally.

## Data And Simulation Lab

Generate reproducible scenarios, reset demo data with confirmation, export measurements, alerts, and follow-ups as CSV, or paste CSV in the documented template format to import measurements with validation.

Select a CSV file (up to 1 MB) or paste its contents, then choose **Validate CSV**. Review the ready count, rejected records, duplicate count, and first 20 accepted records. Choose **Import Valid Records** to save only accepted records. Validation does not import data; imported records are revalidated before saving.

Required columns: `crew_id`, `metric_type`, `value`, `measured_at`. Optional columns include `unit`, `source`, and `notes`. Use `crew-aurora` for the current crew and ISO timestamps with a timezone, such as `2026-10-24T08:00:00Z`. Vendor exports with other headers need mapping to this schema. See `data/import_template.csv` for an example.
