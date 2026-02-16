const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Data helpers ────────────────────────────────────────────────────────────

function loadData(file) {
  const filePath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveData(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

function loadSettings() {
  const filePath = path.join(DATA_DIR, 'settings.json');
  if (!fs.existsSync(filePath)) {
    return {
      displayMode: 'numberTime',
      duplicateColor: '#FF3B30',
      emailSmtp: '',
      emailPort: 587,
      emailUser: '',
      emailPass: '',
      emailFrom: ''
    };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveSettings(settings) {
  fs.writeFileSync(path.join(DATA_DIR, 'settings.json'), JSON.stringify(settings, null, 2));
}

function sanitizeFilename(name) {
  return (name || 'export').replace(/[^a-zA-Z0-9äöüÄÖÜß_\- ]/g, '_');
}

// ─── Events API ──────────────────────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  res.json(loadData('events.json'));
});

app.post('/api/events', (req, res) => {
  const events = loadData('events.json');
  const event = {
    id: uuidv4(),
    name: req.body.name,
    location: req.body.location,
    date: req.body.date,
    startTime: req.body.startTime,
    createdAt: new Date().toISOString()
  };
  events.push(event);
  saveData('events.json', events);
  res.status(201).json(event);
});

app.get('/api/events/:id', (req, res) => {
  const events = loadData('events.json');
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

app.put('/api/events/:id', (req, res) => {
  const events = loadData('events.json');
  const idx = events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Event not found' });
  Object.assign(events[idx], req.body, { id: req.params.id });
  saveData('events.json', events);
  res.json(events[idx]);
});

app.delete('/api/events/:id', (req, res) => {
  let events = loadData('events.json');
  events = events.filter(e => e.id !== req.params.id);
  saveData('events.json', events);

  let timingPoints = loadData('timingpoints.json');
  const tpIds = timingPoints.filter(tp => tp.eventId === req.params.id).map(tp => tp.id);
  timingPoints = timingPoints.filter(tp => tp.eventId !== req.params.id);
  saveData('timingpoints.json', timingPoints);

  tpIds.forEach(tpId => {
    const entryFile = path.join(DATA_DIR, `entries_${tpId}.json`);
    if (fs.existsSync(entryFile)) fs.unlinkSync(entryFile);
    const csvFile = path.join(DATA_DIR, `entries_${tpId}.csv`);
    if (fs.existsSync(csvFile)) fs.unlinkSync(csvFile);
  });

  res.json({ success: true });
});

// ─── Timing Points API ──────────────────────────────────────────────────────

app.get('/api/events/:eventId/timing-points', (req, res) => {
  const timingPoints = loadData('timingpoints.json');
  res.json(timingPoints.filter(tp => tp.eventId === req.params.eventId));
});

app.post('/api/events/:eventId/timing-points', (req, res) => {
  const timingPoints = loadData('timingpoints.json');
  const tp = {
    id: uuidv4(),
    eventId: req.params.eventId,
    name: req.body.name,
    firstName: req.body.firstName || '',
    lastName: req.body.lastName || '',
    latitude: req.body.latitude || null,
    longitude: req.body.longitude || null,
    createdAt: new Date().toISOString()
  };
  timingPoints.push(tp);
  saveData('timingpoints.json', timingPoints);
  res.status(201).json(tp);
});

app.get('/api/timing-points/:id', (req, res) => {
  const timingPoints = loadData('timingpoints.json');
  const tp = timingPoints.find(t => t.id === req.params.id);
  if (!tp) return res.status(404).json({ error: 'Timing point not found' });
  res.json(tp);
});

app.put('/api/timing-points/:id', (req, res) => {
  const timingPoints = loadData('timingpoints.json');
  const idx = timingPoints.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Timing point not found' });
  const keep = { id: timingPoints[idx].id, eventId: timingPoints[idx].eventId, createdAt: timingPoints[idx].createdAt };
  Object.assign(timingPoints[idx], req.body, keep);
  saveData('timingpoints.json', timingPoints);
  res.json(timingPoints[idx]);
});

app.delete('/api/timing-points/:id', (req, res) => {
  let timingPoints = loadData('timingpoints.json');
  timingPoints = timingPoints.filter(t => t.id !== req.params.id);
  saveData('timingpoints.json', timingPoints);

  const entryFile = path.join(DATA_DIR, `entries_${req.params.id}.json`);
  if (fs.existsSync(entryFile)) fs.unlinkSync(entryFile);
  const csvFile = path.join(DATA_DIR, `entries_${req.params.id}.csv`);
  if (fs.existsSync(csvFile)) fs.unlinkSync(csvFile);

  res.json({ success: true });
});

// ─── Entries API ─────────────────────────────────────────────────────────────

app.get('/api/timing-points/:id/entries', (req, res) => {
  res.json(loadData(`entries_${req.params.id}.json`));
});

app.post('/api/timing-points/:id/entries', (req, res) => {
  const entries = loadData(`entries_${req.params.id}.json`);
  const entry = {
    id: uuidv4(),
    timingPointId: req.params.id,
    startNumber: req.body.startNumber,
    timestamp: req.body.timestamp,
    createdAt: new Date().toISOString()
  };
  entries.push(entry);
  saveData(`entries_${req.params.id}.json`, entries);
  updateCsv(req.params.id, entries);
  io.to(`tp_${req.params.id}`).emit('new-entry', entry);
  res.status(201).json(entry);
});

app.delete('/api/entries/:timingPointId/:entryId', (req, res) => {
  let entries = loadData(`entries_${req.params.timingPointId}.json`);
  entries = entries.filter(e => e.id !== req.params.entryId);
  saveData(`entries_${req.params.timingPointId}.json`, entries);
  updateCsv(req.params.timingPointId, entries);
  io.to(`tp_${req.params.timingPointId}`).emit('delete-entry', req.params.entryId);
  res.json({ success: true });
});

// ─── CSV Generation ──────────────────────────────────────────────────────────

function buildCsvContent(entries) {
  const header = 'Startnummer;Datum;Uhrzeit;Zeitstempel\n';
  const rows = entries.map(e => {
    const d = new Date(e.timestamp);
    const date = d.toLocaleDateString('de-DE');
    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      + ',' + String(d.getMilliseconds()).padStart(3, '0').substring(0, 2);
    return `${e.startNumber};${date};${time};${e.timestamp}`;
  }).join('\n');
  return header + rows;
}

function updateCsv(timingPointId, entries) {
  fs.writeFileSync(path.join(DATA_DIR, `entries_${timingPointId}.csv`), buildCsvContent(entries));
}

// Single timing point CSV download
app.get('/api/timing-points/:id/csv', (req, res) => {
  const csvPath = path.join(DATA_DIR, `entries_${req.params.id}.csv`);
  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ error: 'No CSV file found' });
  }
  const timingPoints = loadData('timingpoints.json');
  const tp = timingPoints.find(t => t.id === req.params.id);
  const filename = `${sanitizeFilename(tp?.name)}.csv`;
  res.download(csvPath, filename);
});

// Event-level CSV download (ZIP with one CSV per timing point)
app.get('/api/events/:id/csv', (req, res) => {
  const events = loadData('events.json');
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const timingPoints = loadData('timingpoints.json').filter(tp => tp.eventId === req.params.id);
  if (timingPoints.length === 0) {
    return res.status(404).json({ error: 'Keine Zeitmesspunkte vorhanden' });
  }

  const zipName = `${sanitizeFilename(event.name)}_${event.date}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  timingPoints.forEach(tp => {
    const entries = loadData(`entries_${tp.id}.json`);
    if (entries.length > 0) {
      const csv = buildCsvContent(entries);
      archive.append(csv, { name: `${sanitizeFilename(tp.name)}.csv` });
    }
  });

  archive.finalize();
});

// ─── Email ───────────────────────────────────────────────────────────────────

function createTransporter(settings) {
  return nodemailer.createTransport({
    host: settings.emailSmtp,
    port: settings.emailPort || 587,
    secure: settings.emailPort === 465,
    auth: { user: settings.emailUser, pass: settings.emailPass }
  });
}

// Email single timing point
app.post('/api/timing-points/:id/email', async (req, res) => {
  const settings = loadSettings();
  const { recipientEmail } = req.body;

  if (!settings.emailSmtp || !settings.emailUser) {
    return res.status(400).json({ error: 'E-Mail-Einstellungen nicht konfiguriert' });
  }

  const csvPath = path.join(DATA_DIR, `entries_${req.params.id}.csv`);
  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ error: 'Keine CSV-Datei vorhanden' });
  }

  const timingPoints = loadData('timingpoints.json');
  const tp = timingPoints.find(t => t.id === req.params.id);
  if (!tp) return res.status(404).json({ error: 'Zeitmesspunkt nicht gefunden' });

  const events = loadData('events.json');
  const event = events.find(e => e.id === tp.eventId);
  if (!event) return res.status(404).json({ error: 'Veranstaltung nicht gefunden' });

  const entries = loadData(`entries_${req.params.id}.json`);

  try {
    const transporter = createTransporter(settings);
    const subject = `${event.name} - ${event.date} - ${tp.name}`;
    const body = `Zeitmessergebnisse\n\nVeranstaltung: ${event.name}\nOrt: ${event.location}\nDatum: ${event.date}\nZeitmesspunkt: ${tp.name}\nAnzahl Einträge: ${entries.length}\n\nIm Anhang finden Sie die CSV-Datei mit allen erfassten Zeiten.`;

    await transporter.sendMail({
      from: settings.emailFrom || settings.emailUser,
      to: recipientEmail,
      subject,
      text: body,
      attachments: [{ filename: `${sanitizeFilename(tp.name)}.csv`, path: csvPath }]
    });

    res.json({ success: true, message: 'E-Mail wurde gesendet' });
  } catch (err) {
    res.status(500).json({ error: `E-Mail-Fehler: ${err.message}` });
  }
});

// Email entire event (one CSV per timing point as attachment)
app.post('/api/events/:id/email', async (req, res) => {
  const settings = loadSettings();
  const { recipientEmail } = req.body;

  if (!settings.emailSmtp || !settings.emailUser) {
    return res.status(400).json({ error: 'E-Mail-Einstellungen nicht konfiguriert' });
  }

  const events = loadData('events.json');
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Veranstaltung nicht gefunden' });

  const timingPoints = loadData('timingpoints.json').filter(tp => tp.eventId === req.params.id);
  if (timingPoints.length === 0) {
    return res.status(404).json({ error: 'Keine Zeitmesspunkte vorhanden' });
  }

  const attachments = [];
  let totalEntries = 0;
  const tpNames = [];

  timingPoints.forEach(tp => {
    const csvPath = path.join(DATA_DIR, `entries_${tp.id}.csv`);
    if (fs.existsSync(csvPath)) {
      const entries = loadData(`entries_${tp.id}.json`);
      totalEntries += entries.length;
      tpNames.push(tp.name);
      attachments.push({ filename: `${sanitizeFilename(tp.name)}.csv`, path: csvPath });
    }
  });

  if (attachments.length === 0) {
    return res.status(404).json({ error: 'Keine CSV-Dateien vorhanden' });
  }

  try {
    const transporter = createTransporter(settings);
    const subject = `${event.name} - ${event.date} - Alle Zeitmesspunkte`;
    const body = `Zeitmessergebnisse - Komplette Veranstaltung\n\nVeranstaltung: ${event.name}\nOrt: ${event.location}\nDatum: ${event.date}\nZeitmesspunkte: ${tpNames.join(', ')}\nGesamtanzahl Einträge: ${totalEntries}\n\nIm Anhang finden Sie je eine CSV-Datei pro Zeitmesspunkt.`;

    await transporter.sendMail({
      from: settings.emailFrom || settings.emailUser,
      to: recipientEmail,
      subject,
      text: body,
      attachments
    });

    res.json({ success: true, message: 'E-Mail wurde gesendet' });
  } catch (err) {
    res.status(500).json({ error: `E-Mail-Fehler: ${err.message}` });
  }
});

// ─── Settings API ────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json(loadSettings());
});

app.put('/api/settings', (req, res) => {
  const current = loadSettings();
  const updated = { ...current, ...req.body };
  saveSettings(updated);
  io.emit('settings-updated', updated);
  res.json(updated);
});

// ─── Socket.io ───────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  socket.on('join-timing-point', (timingPointId) => {
    socket.join(`tp_${timingPointId}`);
  });
  socket.on('leave-timing-point', (timingPointId) => {
    socket.leave(`tp_${timingPointId}`);
  });
});

// ─── Start Server ────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Handtiming Server läuft auf http://localhost:${PORT}`);
});
