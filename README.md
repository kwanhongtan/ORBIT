# ORBIT

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

No Gemini API key is required for the current version. Local records are saved in `data/orbit-db.json`.
