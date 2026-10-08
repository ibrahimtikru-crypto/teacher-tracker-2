# House of Wisdom - Teacher Tracker (Phase 1-2)

Find where any teacher should be right now, what they teach next, and see their full weekly timetable.
Free hosting: GitHub Pages (website) + Google Sheets (database) + Google Apps Script (connector).

Everything below is click-by-click. Total time: about 20 minutes.

## What is in this folder
| Path | Purpose |
|---|---|
| `index.html`, `css/`, `js/` | The website (goes on GitHub) |
| `apps-script/Code.gs` | The connector between the website and Google Sheets |
| `data/HOW_Timetable_Database.xlsx` | Your real timetable, ready to upload to Google Sheets |
| `data/bootstrap.json` | A copy of the same data, used for preview before Google is connected |

## Step 1 - Test it on your computer (optional)
Opening `index.html` by double-click does not work in some browsers. Instead, in this folder run
`python3 -m http.server 8000` and open http://localhost:8000.
To preview any moment in time: `http://localhost:8000/?day=Monday&time=10:35`.

## Step 2 - Create the Google Sheet database
1. Go to https://drive.google.com and sign in with the school Google account.
2. Click **New > File upload** and choose `data/HOW_Timetable_Database.xlsx`.
3. Double-click the uploaded file, then choose **File > Save as Google Sheets**.
4. Keep these tabs named exactly: **Teachers, Classes, Periods, Timetable**. Other tabs (Summary, Issues, etc.) are harmless.

## Step 3 - Add the backend script
1. In the Google Sheet click **Extensions > Apps Script**.
2. Delete the sample code. Open `apps-script/Code.gs`, copy everything, paste it in.
3. Click the gear icon (Project Settings), tick **Show "appsscript.json" manifest file**, open `appsscript.json` in the editor and paste the contents of `apps-script/appsscript.json`.
4. Click **Save**. Select the function **setupDatabase** and click **Run**. Google asks for permission: choose your account, **Advanced > Go to project (unsafe) > Allow**. This only lets the script read and add tabs in this one sheet.
5. Reload the Google Sheet. A **Teacher Tracker** menu appears. Click **Teacher Tracker > Validate data**. It should say "All checks passed".

## Step 4 - Publish the connector
1. In Apps Script click **Deploy > New deployment**, type **Web app**.
2. Execute as: **Me**. Who has access: **Anyone**.
3. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
4. Test: open `YOUR_URL?action=ping` in a browser. You should see `{"ok":true,...}`.

The public link is read-only. It cannot change anything in your sheet.

## Step 5 - Connect the website
Open `js/config.js` and paste the URL between the quotes:
```js
API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
```

## Step 6 - Publish on GitHub Pages
1. Create a free account at https://github.com and click **New repository**. Name it `teacher-tracker`, set it **Public**.
2. Click **uploading an existing file** and drag in everything EXCEPT the `apps-script` folder and `data/HOW_Timetable_Database.xlsx` (not needed online). Click **Commit changes**.
3. Go to **Settings > Pages**. Under **Branch** choose `main` and `/ (root)`, then **Save**.
4. After about a minute the site is at `https://YOUR-USERNAME.github.io/teacher-tracker/`. Share this link with staff.

## Updating the timetable later
Edit the Google Sheet directly (Timetable, Teachers, Classes tabs). The website shows changes within 5 minutes,
or immediately after **Teacher Tracker > Refresh app cache**. No code changes needed.

### Entering real rooms (important)
Rooms, floors and wings are currently **assumed placeholders** (Room 1-35). Open the **Classes** tab, overwrite the
yellow columns HomeRoom, Floor, Wing, and change Room Source to CONFIRMED. The Timetable tab picks them up automatically.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Unable to connect to timetable database" | Check the URL in `js/config.js`; check Step 4 access is "Anyone"; open `...?action=ping` |
| Old data still shows | Run **Teacher Tracker > Refresh app cache**, then refresh the page (the browser keeps a saved copy for offline use) |
| "Missing sheet: Periods" | A tab was renamed or deleted. Tab names must match exactly |
| Validate data lists an unknown teacher or class | A name or ID in Timetable does not exist in Teachers or Classes |
| Wrong time shown | Times always use the `SchoolTimezone` in the Settings tab (Asia/Karachi) |
| GitHub changes do not appear | Wait 1-2 minutes, then hard refresh (Ctrl+Shift+R) |

## Roadmap
Phase 3 live dashboard and room search, Phase 4-5 substitute finder and assignment, Phase 6 admin panel,
Phase 7 absences and special days, Phase 8 security and performance polish.
