# ORBIT Demo Script

## 1. Open

Start the app with `node server.js` and open `http://127.0.0.1:4173`.

## 2. Normal Monitoring

Go to Data & Simulation Lab, generate Scenario A for 12 days, then go to Drift Investigation. Recalculate baselines and run the investigator. Expected result: no combined drift alert.

## 3. Changing Pattern

Generate Scenario B for 10 days. Run the investigator. Expected result: a medium or high multi-signal drift alert with linked evidence.

## 4. Incident Workflow

Open Action Centre. Acknowledge the alert, review the checklist, begin investigation, and create a follow-up action.

## 5. Measurement Quality

Generate Scenario D. Inspect the measurement table for invalid, stale, duplicate, or questionable records. Run the investigator and point out that quality-limited records are not treated as reliable evidence.

## 6. Recovery

Generate Scenario E and rerun the investigator. Complete the follow-up task. Resolve the alert separately with a note after review.

## 7. Reports

Use Data & Simulation Lab to export measurement, alert, and follow-up CSV files.
