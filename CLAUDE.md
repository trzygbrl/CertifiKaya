# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CertifiKaya is a Google Apps Script extension for Google Sheets that automates batch certificate generation and email distribution for the AUF University Library. It is built entirely on the Google Apps Script platform — there is no local build system, package manager, or test runner.

## Deployment Workflow (clasp)

This project uses [clasp](https://github.com/google/clasp) to sync local files with the Google Apps Script project.

```bash
# Push local changes to Google Apps Script
clasp push

# Pull latest from Google Apps Script (overwrites local)
clasp pull

# Open the Apps Script editor in browser
clasp open

# Deploy as a new web app version
clasp deploy --description "version description"
```

The Script ID is in `.clasp.json`. The web app URL for the logs dashboard is pinned inside `index.html:viewLogs()` — update this if a new deployment is made.

To set the required database password in the script, run this once in the Apps Script editor console:
```js
PropertiesService.getScriptProperties().setProperty('dbpassword', '<password>');
```

## Architecture

### Backend: `Code.js` (Google Apps Script / V8)

All server-side logic lives here. Key responsibilities:

- **`onOpen()`** — adds the "CertifiKaya" menu to Google Sheets on open.
- **`getSheetHeaders()` / `getSheetData()`** — reads participant data directly from the active sheet's first row (headers) and remaining rows (data). Rows are returned as `{headerName: value}` objects.
- **`initializeEvent()`** — called once at batch start. Creates `certificate_templates` and `events` DB records; uploads the template image to Google Drive and returns `{ eventId, templateId }`.
- **`processAndSaveCertificate(payload)`** — called once per participant. Decodes the base64 certificate, saves it to a Google Drive folder named `{eventName} ({eventDate})`, sends the email via `MailApp`, and calls `logToDatabase()`.
- **`logToDatabase()`** — inserts a `participants` row and a `generation_logs` row into the Aiven MySQL database.
- **`fetchGenerationLogs()` / `fetchEvents()` / `fetchTemplates()`** — query the DB filtered by the current user's email for the logs dashboard.
- **`doGet()`** — serves `logs_dashboard.html` as a standalone web app.

Session/state between modals is persisted via `PropertiesService.getUserProperties()`:
- `cert_bounds` — JSON string of normalized bounding box `{x, y, w, h}` (values 0–1, relative to image dimensions).
- `cert_email_draft` — JSON string of `{subject, body}`.

### Database

MySQL hosted on Aiven (`mysql-18e17a2d-certifikaya.g.aivencloud.com:12448/defaultdb`). Connected via `Jdbc.getConnection()`. Schema:

```
users → certificate_templates → events
                                    ↓
                              participants → generation_logs
```

`getOrCreateUserAccount()` is called on every DB write — it upserts the current user by `google_email` and returns the `user_id`.

### Frontend: HTML files

All HTML files are self-contained (inline CSS + JS). They communicate with `Code.js` exclusively via `google.script.run.<functionName>()` calls.

| File | Purpose | Rendered As |
|---|---|---|
| `index.html` | Main sidebar UI | Sidebar (300px wide) |
| `template_editor.html` | Canvas drag-to-select bounding box tool | Modal (1000×700) |
| `email_editor.html` | Email subject/body draft form | Modal (600×500) |
| `logs_dashboard.html` | Staff dashboard with 3 tabs | Standalone web app |

### Certificate Generation Pipeline (client-side, `index.html`)

The entire rendering pipeline runs in the browser (sidebar), not on the server:

1. User configures event, uploads template image, selects name bounding box via `template_editor.html`, and drafts the email.
2. `startGeneration()` calls `initializeEvent()` to create DB records and get `eventId`.
3. `getGenerationConfig()` is polled (every 3s) to retrieve the saved bounding box from `PropertiesService`.
4. `getSheetData()` returns all participant rows.
5. `processBatch()` iterates participants sequentially (awaits each to avoid Google quota exhaustion):
   - Draws the certificate image onto a hidden `<canvas>`.
   - Overlays the participant name, centered within the bounding box using `ctx.fillText()`. Font size is `boxH * 0.6`.
   - Exports to PDF (via jsPDF) or PNG/JPG via `canvas.toDataURL()`.
   - Sends the base64 payload to `processAndSaveCertificate()` on the backend.

The bounding box is stored as normalized ratios (0–1) so it scales correctly when applied to the original full-resolution image.

### Logs Dashboard (`logs_dashboard.html`)

Protected by a password gate. On load the dashboard is hidden and a password prompt is shown. The entered password is verified server-side via `verifyDashboardPassword()`, which checks it against the `dashboard_password` Script Property. On success, all three data sets are fetched in parallel (`fetchAllGenerationLogs`, `fetchAllEvents`, `fetchAllTemplates`) — these return **all** records with no user filter.

To set the dashboard password, run once in the Apps Script editor console:
```js
PropertiesService.getScriptProperties().setProperty('dashboard_password', '<password>');
```

Tab switching is purely CSS (`display: none/block`). The Generation Logs tab has two client-side filters (college/program and delivery status) applied over the cached `allLogs` array. All three tables support clickable column-header sorting; sort state (`col`, `dir`) is tracked per table in `sortState` and re-applied whenever a filter changes.

## Key Design Constraints

- **Sequential processing**: `processBatch` awaits each `processAndSaveCertificate` call to prevent exceeding Google Apps Script quotas (`MailApp`, `DriveApp`).
- **No forced capitalization**: Text is overlaid as-is to preserve cursive font rendering.
- **Modal sandboxing**: The sidebar and modals run in separate iframes and cannot share JavaScript state directly. Bounding box and email draft are passed through `PropertiesService` as the shared state layer, polled every 3 seconds by the sidebar.
- **User-scoped data**: All DB queries filter by `Session.getActiveUser().getEmail()`, so each staff member sees only their own logs and templates.
