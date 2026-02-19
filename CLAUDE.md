# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Start server:** `node server.js` (runs on `PORT` env var or 3000)
- **Install dependencies:** `npm install`
- **No test or lint commands configured**

## Architecture

Single-page application for hand-timing at sporting events. German-language UI.

### Backend (`server.js`)
- Express.js REST API + Socket.io for real-time sync between multiple timekeepers
- File-based JSON storage in `data/` directory (not committed to git)
- CSV generation per timing point, ZIP export for multiple timing points via `archiver`
- Email sending via `nodemailer` with SMTP settings stored in `data/settings.json`
- Socket.io rooms per timing point (`tp_{id}`) — emits `new-entry`, `delete-entry`, `update-entry`, `settings-updated`

### Frontend (`public/`)
- Vanilla JS SPA — no framework, no build step
- `app.js`: Single `app` object with all state and methods. View switching via `.hidden` CSS class on `#view-*` divs
- `index.html`: All views defined statically, dynamically populated via `innerHTML`
- `style.css`: Apple-style design system using CSS custom properties
- Leaflet.js maps with Esri satellite/roads/labels tile layers (3 overlapping layers for hybrid view)
- Touch gestures: swipe-to-clear on number input, swipe-to-delete on entry rows

### Data Model
- **Events** → have many **Timing Points** → have many **Entries**
- Entries stored per timing point: `data/entries_{tpId}.json`
- CSV files auto-generated on each entry change: `data/entries_{tpId}.csv`
- Timestamps captured client-side at first digit press (not on confirm)

### API Routes
- `/api/events` — CRUD for events
- `/api/events/:eventId/timing-points` — timing points per event (enriched with `entryCount`, `duplicateCount`)
- `/api/timing-points/:id/entries` — entries per timing point
- `/api/entries/:timingPointId/:entryId` — update/delete individual entries
- `/api/timing-points/:id/csv` — single CSV download
- `/api/events/:id/csv?tpIds=...` — selective ZIP/CSV export
- `/api/timing-points/:id/email` and `/api/events/:id/email` — send CSV via email
- `/api/settings` — app-wide settings (display mode, duplicate color, SMTP config)

### Key Conventions
- All IDs are UUIDs (via `uuid` package)
- German locale for date/time formatting (`de-DE`)
- CSV delimiter is semicolon (`;`), timestamps include hundredths of seconds
- Email subject format: `{EventName} - {Date} - {TimingPointName}`
- Fullscreen map overlay lives outside `#app` div to avoid z-index conflicts with Leaflet controls
