# ORBIT

ORBIT is a local astronaut health monitoring prototype for the NASA Space Apps Challenge. It helps a crew member record measurements, review changes against their personal baseline, and document what they did in response.

## 1. Install Node.js on Windows

Download Node.js from the **[official Node.js download page](https://nodejs.org/en/download)**. npm is included; do not install it separately.

1. Select **Node.js 24 LTS**, **Windows**, and **Windows Installer (.msi)**. Use **x64** for Intel/AMD PCs or **ARM64** for ARM PCs. Check **Settings > System > About > System type** if unsure.
2. Open the downloaded `.msi` installer and follow the setup wizard.
3. Keep the default installation folder and leave **npm package manager** and **Add to PATH** enabled.
4. The optional tools for native modules are not required for ORBIT.
5. Finish installation, close existing terminal windows, then open a new **Command Prompt** from the Start menu.
6. Check that both commands print a version number:

```cmd
node --version
npm --version
```

If either command is not recognized, restart Windows and try again. If it still fails, rerun the installer and choose **Repair**, then reopen Command Prompt.

## 2. Download and Run ORBIT

1. On this GitHub repository, click **Code > Download ZIP**.
2. Right-click the downloaded ZIP and select **Extract All**.
3. Open the extracted folder containing `package.json` and `server.js`.
4. Click File Explorer's address bar, type `cmd`, and press Enter.
5. Run these commands one at a time:

```cmd
npm install
npm start
```

6. Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/) in your browser.

Keep the terminal open while using the app. Press Ctrl+C to stop it.

The repository includes the built frontend. After changing frontend code, run `npm run build` again and restart the server.

If using PowerShell and it blocks `npm.ps1`, use `npm.cmd install` and `npm.cmd start`, or use Command Prompt as described above.

ORBIT runs locally without an API key. If port 4173 is already in use, set another port before starting. In Command Prompt, run `set "PORT=4175"` and then `npm start`. Open [http://127.0.0.1:4175/](http://127.0.0.1:4175/) on the computer running the server.

## What you can do

| Screen | Workflow |
| --- | --- |
| **Mission Overview** | Check open alerts, pending follow-ups, and quality warnings. Select a body hotspot for readings, charts, and measurement guidance. In Mission Routine, edit daily UTC check-in times for the selected crew member and mission environment. |
| **Daily Check-in** | Submit a self-assessment or enter an individual measurement. Record the activity at measurement time. Saving a valid reading through a Mission Routine task marks that task complete. |
| **Health Timeline** | Browse measurement records or select one metric to view its chart. Filter by dates, source, and data quality. |
| **Mission Replay** | Play back recorded mission time and inspect the readings and investigation result at the selected point. Replay is read-only. |
| **Drift Investigation** | Compare readings from a 36-hour window with earlier personal baselines. Expand the result to see which signals were flagged, excluded, or lacked enough data. |
| **Action Centre** | Review alert evidence, plan a repeat measurement or review task, and document the outcome. Use **Review linked alert** after completing a follow-up, then save an outcome with **Close alert**. Prepare a ground review summary for manual handoff. |
| **Data & Simulation Lab** | Generate synthetic scenarios, preview and import a CSV, manage import history, and export readings, alerts, or follow-ups. |

## Try the demo

1. Use **Add crew** to create a fresh demo profile.
2. In **Data & Simulation Lab**, generate **Stable baseline** for 12 days, then **Gradual health drift** for 10 days.
3. Open **Drift Investigation**, select **Run investigation**, and expand **View signal comparisons** to inspect the evidence.
4. In **Action Centre**, open the linked alert and plan a follow-up. Record the repeat measurement or review outcome, then complete the task.
5. Select **Review linked alert**, prepare the ground review summary, and close the alert with an outcome. The alert and task appear under **Closed alerts** and **Closed follow-ups**, respectively.

## Working with multiple crew members

Use **Add crew** in the header to create a profile, then use the **Crew member** selector to switch between profiles. New profiles start empty. The selected profile controls check-ins, timelines, replay, investigations, alerts, follow-ups, and the Data & Simulation Lab.

Profiles organize data inside one shared local workspace. Anyone who can open that workspace can switch between profiles.

**Delete crew** removes the selected profile from the active roster and archives its records locally. Keep at least one active profile.

## Importing and exporting data

Start with the [CSV template](data/import_template.csv). Include the headers `crew_id`, `metric_type`, `value`, and `measured_at`. Optional fields include `unit`, `source`, and `notes`. Use the metric identifier shown in the template, such as `heart_rate`, and an ISO 8601 timestamp with a time zone, such as `2026-10-24T08:00:00Z`.

1. Select a crew member and copy the ID shown in **CSV Import** into the file’s `crew_id` column. Use one crew ID per file.
2. Load the CSV and preview it before importing. ORBIT reports rejected rows and skips duplicate measurements.
3. Use **Import History** to manage imported batches and **CSV Exports** to download records for the selected crew member.

**Reset Demo** clears simulated data and the selected crew member’s investigation and incident history. Use a separate demo profile when testing scenarios.

## Storage and prototype scope

Records are saved to `data/orbit-db.json` by default. Set `ORBIT_DATA_DIR` before starting the server to use a different directory. To make a backup, stop the server and copy the database file.

ORBIT uses rule-based comparisons against personal baselines. An alert supports review of a possible change. Clinical use would require separate validation and approved mission procedures. The local server binds to `127.0.0.1` and the workspace uses a shared crew selector.

## Research context

- **Sleep and daily check-ins.** NASA’s ARCHeR study tracked sleep, activity, and wellbeing during Artemis II. ORBIT’s sleep guide asks crew members to use the same tracking method across check-ins and note schedule changes or interruptions. [NASA Human Research Program](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- **Distance from Earth.** NASA identifies access to medical support as a challenge for distant missions. ORBIT supports local review and lets crew members prepare a ground review summary for manual handoff. [NASA’s Five Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/)
- **Radiation monitoring.** The Canadian Space Agency describes an instrument designed to measure neutron radiation exposure in space. ORBIT uses simulated radiation readings to demonstrate how exposure can be recorded. [CSA’s Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)

## Development

```sh
npm run build
npm run typecheck
npm test
```

The frontend uses React, TypeScript, Vite, and Recharts. The Node.js server serves the built frontend from `web/` and stores workspace data in a local JSON file. See the [architecture notes](docs/ARCHITECTURE.md) and [credits](docs/CREDITS.md).
