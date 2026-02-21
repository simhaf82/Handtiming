const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const ROADS_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = '&copy; Esri';

const app = {
  currentView: 'events', previousView: 'events',
  currentEventId: null, currentTimingPointId: null,
  entries: [], settings: {}, inputValue: '', inputTimestamp: null,
  startlist: [], dnfdns: [],
  socket: null, map: null, mapMarker: null, mapLocationMarker: null,
  fullscreenMap: null, fullscreenMarker: null, isMapFullscreen: false,
  emailMode: null, exportTimingPoints: [],
  _swipeStartX: 0, _swipeStartY: 0,

  // ─── Init ──────────────────────────────────────────────────────────────
  async init() {
    this.socket = io();
    this.settings = await this.api('GET', '/api/settings');
    this.applySettings();

    this.socket.on('new-entry', (entry) => {
      if (!this.entries.find(e => e.id === entry.id)) { this.entries.push(entry); this.renderEntries(); }
    });
    this.socket.on('delete-entry', (entryId) => {
      this.entries = this.entries.filter(e => e.id !== entryId); this.renderEntries();
    });
    this.socket.on('update-entry', (updated) => {
      const idx = this.entries.findIndex(e => e.id === updated.id);
      if (idx !== -1) { this.entries[idx] = updated; this.renderEntries(); }
    });
    this.socket.on('settings-updated', (s) => { this.settings = s; this.applySettings(); this.renderEntries(); });
    this.socket.on('dnfdns-updated', (list) => { this.dnfdns = list; this.renderDnfDns(); this.renderStartlist(); });

    document.addEventListener('keydown', (e) => {
      if (this.currentView !== 'timing') return;
      const activeTab = document.querySelector('#view-timing .tab.active');
      if (!activeTab || activeTab.dataset.tab !== 'input') return;
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); this.numInput(e.key); }
      else if (e.key === 'Enter') { e.preventDefault(); this.submitEntry(); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); this.clearInput(); }
    });

    this.initSwipeGesture();
    this.navigate('events');
  },

  initSwipeGesture() {
    const input = document.getElementById('timing-input');
    if (!input) return;
    input.addEventListener('touchstart', (e) => { this._swipeStartX = e.touches[0].clientX; this._swipeStartY = e.touches[0].clientY; }, { passive: true });
    input.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - this._swipeStartX;
      const dy = e.changedTouches[0].clientY - this._swipeStartY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) this.clearInput();
    }, { passive: true });
  },

  // ─── API ───────────────────────────────────────────────────────────────
  async api(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Fehler' })); throw new Error(err.error || 'Fehler'); }
    return res.json();
  },

  // ─── Navigation ────────────────────────────────────────────────────────
  navigate(view) {
    this.previousView = this.currentView; this.currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById(`view-${view}`); if (el) el.classList.remove('hidden');
    this.closeMenu();
    if (view === 'events') this.loadEvents();
    else if (view === 'settings') this.loadSettings();
    this.updateMenu();
  },
  navigateBack() { this.currentTimingPointId ? this.navigateToEventDetail() : this.navigate('events'); },
  navigateToEventDetail() {
    if (this.currentTimingPointId) { this.socket.emit('leave-timing-point', this.currentTimingPointId); this.currentTimingPointId = null; }
    this.navigate('event-detail'); this.loadEventDetail();
  },

  // ─── Menu ──────────────────────────────────────────────────────────────
  toggleMenu() {
    const menu = document.getElementById('side-menu');
    if (menu.classList.contains('open')) this.closeMenu();
    else { menu.classList.add('open'); document.getElementById('menu-overlay').classList.remove('hidden'); this.updateMenu(); }
  },
  closeMenu() { document.getElementById('side-menu').classList.remove('open'); document.getElementById('menu-overlay').classList.add('hidden'); },
  async updateMenu() {
    const events = await this.api('GET', '/api/events');
    let html = `<li onclick="app.navigate('events')"><span class="menu-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg></span>Veranstaltungen</li>`;
    html += `<li onclick="app.navigate('settings')"><span class="menu-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>Einstellungen</li>`;
    if (events.length > 0) {
      html += `<li class="menu-divider" style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;cursor:default">Veranstaltungen</li>`;
      events.forEach(ev => { html += `<li onclick="app.currentEventId='${ev.id}';app.navigateToEventDetail()"><span class="menu-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></span>${this.esc(ev.name)}</li>`; });
    }
    document.getElementById('menu-list').innerHTML = html;
  },

  // ─── Events ────────────────────────────────────────────────────────────
  async loadEvents() {
    const events = await this.api('GET', '/api/events');
    const c = document.getElementById('events-list');
    if (!events.length) { c.innerHTML = '<div class="empty-state">Noch keine Veranstaltungen erstellt.</div>'; return; }
    c.innerHTML = events.map(ev => `
      <div class="card" onclick="app.currentEventId='${ev.id}';app.navigateToEventDetail()">
        <div class="card-content">
          <div class="card-title">${this.esc(ev.name)}</div>
          <div class="card-subtitle">${this.esc(ev.location)} &middot; ${ev.date} &middot; ${ev.startTime}</div>
        </div>
        <div class="card-actions">
          <button class="btn-icon btn-icon-delete" onclick="event.stopPropagation();app.deleteEvent('${ev.id}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
        <span class="card-dot">&middot;</span>
      </div>`).join('');
  },
  async createEvent(e) {
    e.preventDefault();
    await this.api('POST', '/api/events', { name: document.getElementById('event-name').value, location: document.getElementById('event-location').value, date: document.getElementById('event-date').value, startTime: document.getElementById('event-starttime').value });
    document.getElementById('form-event').reset(); this.showToast('Veranstaltung erstellt'); this.navigate('events');
  },
  async deleteEvent(id) { if (!confirm('Veranstaltung wirklich löschen?')) return; await this.api('DELETE', `/api/events/${id}`); this.showToast('Gelöscht'); this.loadEvents(); },

  // ─── Event Detail ──────────────────────────────────────────────────────
  async loadEventDetail() {
    const ev = await this.api('GET', `/api/events/${this.currentEventId}`);
    document.getElementById('event-detail-title').textContent = ev.name;
    document.getElementById('event-detail-info').innerHTML = `<span>${this.esc(ev.location)}</span><span class="info-sep">&middot;</span><span>${ev.date}</span><span class="info-sep">&middot;</span><span>${ev.startTime}</span>`;

    const tps = await this.api('GET', `/api/events/${this.currentEventId}/timing-points`);
    this.exportTimingPoints = tps;
    const c = document.getElementById('timing-points-list');
    if (!tps.length) { c.innerHTML = '<div class="empty-state">Noch keine Zeitmesspunkte.</div>'; }
    else {
      tps.forEach((tp, i) => { tp._isFirst = i === 0; tp._isLast = i === tps.length - 1; });
      c.innerHTML = tps.map(tp => `
        <div class="card" onclick="app.openTimingPoint('${tp.id}')">
          <div class="card-content">
            <div class="card-title">${this.esc(tp.name)}</div>
            <div class="card-subtitle">${tp.firstName || tp.lastName ? this.esc((tp.firstName+' '+tp.lastName).trim()) : 'Kein Zeitnehmer'}</div>
            <div class="card-badge">${tp.entryCount} Teilnehmer${tp.duplicateCount > 0 ? ' &middot; <span class="badge-dup">'+tp.duplicateCount+' doppelt</span>' : ''}</div>
          </div>
          <div class="card-actions">
            <button class="btn-icon btn-icon-edit" onclick="event.stopPropagation();app.editTimingPoint('${tp.id}')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-icon-delete" onclick="event.stopPropagation();app.deleteTimingPoint('${tp.id}')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
            </button>
            <button class="btn-reorder" onclick="event.stopPropagation();app.moveTimingPoint('${tp.id}','up')" ${tp._isFirst ? 'disabled' : ''}>&#9650;</button>
            <button class="btn-reorder" onclick="event.stopPropagation();app.moveTimingPoint('${tp.id}','down')" ${tp._isLast ? 'disabled' : ''}>&#9660;</button>
          </div>
          <span class="card-dot">&middot;</span>
        </div>`).join('');
    }

    // Export checkboxes
    const el = document.getElementById('export-tp-list');
    el.innerHTML = tps.map(tp => `<div class="export-tp-row"><input type="checkbox" id="exp_${tp.id}" checked><label for="exp_${tp.id}">${this.esc(tp.name)} (${tp.entryCount})</label></div>`).join('');
    this.navigate('event-detail');
  },

  // ─── Export ────────────────────────────────────────────────────────────
  getSelectedExportIds() {
    return this.exportTimingPoints.filter(tp => document.getElementById(`exp_${tp.id}`)?.checked).map(tp => tp.id);
  },
  toggleAllExport() {
    const boxes = document.querySelectorAll('#export-tp-list input[type="checkbox"]');
    const allChecked = [...boxes].every(b => b.checked);
    boxes.forEach(b => b.checked = !allChecked);
  },
  exportSelectedCsv() {
    const ids = this.getSelectedExportIds();
    if (!ids.length) { this.showToast('Keine Zeitmesspunkte ausgewählt'); return; }
    window.open(`/api/events/${this.currentEventId}/csv?tpIds=${ids.join(',')}`, '_blank');
  },

  // ─── Timing Points ────────────────────────────────────────────────────
  showCreateTimingPoint() {
    document.getElementById('tp-edit-id').value = '';
    document.getElementById('create-tp-title').textContent = 'Zeitmesspunkt erstellen';
    document.getElementById('tp-submit-btn').textContent = 'Erstellen';
    document.getElementById('form-tp').reset();
    document.getElementById('tp-lat').value = ''; document.getElementById('tp-lng').value = '';
    this.navigate('create-tp'); this.initMap();
  },
  async editTimingPoint(tpId) {
    const tp = await this.api('GET', `/api/timing-points/${tpId}`);
    document.getElementById('tp-edit-id').value = tp.id;
    document.getElementById('create-tp-title').textContent = 'Zeitmesspunkt bearbeiten';
    document.getElementById('tp-submit-btn').textContent = 'Speichern';
    document.getElementById('tp-name').value = tp.name;
    document.getElementById('tp-firstname').value = tp.firstName || '';
    document.getElementById('tp-lastname').value = tp.lastName || '';
    document.getElementById('tp-lat').value = tp.latitude || '';
    document.getElementById('tp-lng').value = tp.longitude || '';
    this.navigate('create-tp'); this.initMap(tp.latitude, tp.longitude);
  },
  async saveTimingPoint(e) {
    e.preventDefault();
    const editId = document.getElementById('tp-edit-id').value;
    const data = { name: document.getElementById('tp-name').value, firstName: document.getElementById('tp-firstname').value, lastName: document.getElementById('tp-lastname').value, latitude: document.getElementById('tp-lat').value || null, longitude: document.getElementById('tp-lng').value || null };
    if (editId) { await this.api('PUT', `/api/timing-points/${editId}`, data); this.showToast('Gespeichert'); }
    else { await this.api('POST', `/api/events/${this.currentEventId}/timing-points`, data); this.showToast('Erstellt'); }
    document.getElementById('form-tp').reset(); this.navigateToEventDetail();
  },
  async deleteTimingPoint(id) { if (!confirm('Zeitmesspunkt wirklich löschen?')) return; await this.api('DELETE', `/api/timing-points/${id}`); this.showToast('Gelöscht'); this.loadEventDetail(); },
  async moveTimingPoint(tpId, direction) {
    const tps = this.exportTimingPoints;
    const idx = tps.findIndex(tp => tp.id === tpId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= tps.length) return;
    const ids = tps.map(tp => tp.id);
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    await this.api('PUT', `/api/events/${this.currentEventId}/timing-points/reorder`, { ids });
    this.loadEventDetail();
  },

  // ─── Map ───────────────────────────────────────────────────────────────
  addTileLayers(map) {
    L.tileLayer(SATELLITE_TILES, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
    L.tileLayer(ROADS_TILES, { maxZoom: 19 }).addTo(map);
    L.tileLayer(LABELS_TILES, { maxZoom: 19 }).addTo(map);
  },
  initMap(lat, lng) {
    setTimeout(() => {
      if (this.map) { this.map.remove(); this.map = null; }
      this.mapMarker = null; this.mapLocationMarker = null;
      const center = (lat && lng) ? [parseFloat(lat), parseFloat(lng)] : [47.3769, 8.5417];
      const zoom = (lat && lng) ? 16 : 13;
      this.map = L.map('tp-map').setView(center, zoom);
      this.addTileLayers(this.map);
      if (lat && lng) this.mapMarker = L.marker([parseFloat(lat), parseFloat(lng)]).addTo(this.map);
      this.map.on('click', (e) => this.setMapMarker(e.latlng.lat, e.latlng.lng));
      this.map.invalidateSize();
      if (!lat && !lng && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          this.map.setView([pos.coords.latitude, pos.coords.longitude], 15);
          this.mapLocationMarker = L.circleMarker([pos.coords.latitude, pos.coords.longitude], { radius: 8, fillColor: '#007AFF', fillOpacity: 0.9, color: '#fff', weight: 2 }).addTo(this.map).bindPopup('Mein Standort');
        }, () => {});
      }
    }, 150);
  },
  setMapMarker(lat, lng) {
    document.getElementById('tp-lat').value = lat; document.getElementById('tp-lng').value = lng;
    if (this.mapMarker) this.map.removeLayer(this.mapMarker);
    this.mapMarker = L.marker([lat, lng]).addTo(this.map);
    if (this.fullscreenMap && this.isMapFullscreen) {
      if (this.fullscreenMarker) this.fullscreenMap.removeLayer(this.fullscreenMarker);
      this.fullscreenMarker = L.marker([lat, lng]).addTo(this.fullscreenMap);
    }
  },
  useCurrentLocation() {
    if (!navigator.geolocation) { this.showToast('Geolocation nicht verfügbar'); return; }
    navigator.geolocation.getCurrentPosition((pos) => { this.setMapMarker(pos.coords.latitude, pos.coords.longitude); this.map.setView([pos.coords.latitude, pos.coords.longitude], 16); this.showToast('Standort übernommen'); }, () => this.showToast('Standort nicht ermittelbar'));
  },
  useCurrentLocationFullscreen() {
    if (!navigator.geolocation) { this.showToast('Geolocation nicht verfügbar'); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      document.getElementById('tp-lat').value = lat; document.getElementById('tp-lng').value = lng;
      if (this.fullscreenMarker) this.fullscreenMap.removeLayer(this.fullscreenMarker);
      this.fullscreenMarker = L.marker([lat, lng]).addTo(this.fullscreenMap);
      this.fullscreenMap.setView([lat, lng], 16);
      this.showToast('Standort übernommen');
    }, () => this.showToast('Standort nicht ermittelbar'));
  },

  // ─── Fullscreen Map ────────────────────────────────────────────────────
  toggleMapFullscreen() {
    const overlay = document.getElementById('map-fullscreen-overlay');
    if (this.isMapFullscreen) {
      overlay.classList.add('hidden'); this.isMapFullscreen = false;
      if (this.fullscreenMap) { this.fullscreenMap.remove(); this.fullscreenMap = null; this.fullscreenMarker = null; }
      if (this.map) {
        const lat = document.getElementById('tp-lat').value, lng = document.getElementById('tp-lng').value;
        if (lat && lng) { if (this.mapMarker) this.map.removeLayer(this.mapMarker); this.mapMarker = L.marker([parseFloat(lat), parseFloat(lng)]).addTo(this.map); this.map.setView([parseFloat(lat), parseFloat(lng)], 16); }
        this.map.invalidateSize();
      }
    } else {
      overlay.classList.remove('hidden'); this.isMapFullscreen = true;
      // Wait for the overlay to be fully visible and laid out
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const lat = document.getElementById('tp-lat').value, lng = document.getElementById('tp-lng').value;
          const center = (lat && lng) ? [parseFloat(lat), parseFloat(lng)] : this.map.getCenter();
          this.fullscreenMap = L.map('tp-map-fullscreen').setView(center, this.map.getZoom());
          this.addTileLayers(this.fullscreenMap);
          if (lat && lng) this.fullscreenMarker = L.marker([parseFloat(lat), parseFloat(lng)]).addTo(this.fullscreenMap);
          this.fullscreenMap.on('click', (e) => {
            document.getElementById('tp-lat').value = e.latlng.lat; document.getElementById('tp-lng').value = e.latlng.lng;
            if (this.fullscreenMarker) this.fullscreenMap.removeLayer(this.fullscreenMarker);
            this.fullscreenMarker = L.marker(e.latlng).addTo(this.fullscreenMap);
          });
          this.fullscreenMap.invalidateSize();
          setTimeout(() => this.fullscreenMap.invalidateSize(), 100);
          setTimeout(() => this.fullscreenMap.invalidateSize(), 500);
        });
      });
    }
  },
  confirmMapLocation() { this.toggleMapFullscreen(); },

  // ─── Timing Screen ────────────────────────────────────────────────────
  async openTimingPoint(tpId) {
    this.currentTimingPointId = tpId; this.inputValue = ''; this.inputTimestamp = null;
    this.socket.emit('join-timing-point', tpId);
    const tp = await this.api('GET', `/api/timing-points/${tpId}`);
    document.getElementById('timing-title').textContent = tp.name;
    const [entries, startlist, dnfdns] = await Promise.all([
      this.api('GET', `/api/timing-points/${tpId}/entries`),
      this.api('GET', `/api/events/${this.currentEventId}/startlist`),
      this.api('GET', `/api/timing-points/${tpId}/dnf-dns`)
    ]);
    this.entries = entries;
    this.startlist = startlist;
    this.dnfdns = dnfdns;
    document.getElementById('timing-input').value = ''; document.getElementById('timing-timestamp').textContent = '';
    this.navigate('timing'); this.switchTab('input'); this.renderEntries();
  },

  // ─── Tabs ──────────────────────────────────────────────────────────────
  switchTab(tab) {
    document.querySelectorAll('#view-timing .tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`#view-timing .tab[data-tab="${tab}"]`).classList.add('active');
    document.querySelectorAll('#view-timing .tab-content').forEach(tc => tc.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    if (tab === 'all' || tab === 'duplicates') this.renderEntriesList(tab);
    if (tab === 'startlist') this.renderStartlist();
    if (tab === 'dnfdns') this.renderDnfDns();
  },
  switchSettingsTab(tab) {
    document.querySelectorAll('#view-settings .tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`#view-settings .tab[data-stab="${tab}"]`).classList.add('active');
    document.querySelectorAll('.settings-tab-content').forEach(tc => tc.classList.add('hidden'));
    document.getElementById(`stab-${tab}`).classList.remove('hidden');
  },

  // ─── Number Input ──────────────────────────────────────────────────────
  numInput(digit) {
    if (this.inputValue === '') { this.inputTimestamp = new Date(); this.updateTimestampDisplay(); }
    this.inputValue += digit; document.getElementById('timing-input').value = this.inputValue;
  },
  clearInput() { this.inputValue = ''; this.inputTimestamp = null; document.getElementById('timing-input').value = ''; document.getElementById('timing-timestamp').textContent = ''; },
  updateTimestampDisplay() {
    if (!this.inputTimestamp) return;
    const d = this.inputTimestamp;
    const t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const ms = String(d.getMilliseconds()).padStart(3, '0').substring(0, 2);
    document.getElementById('timing-timestamp').textContent = `${d.toLocaleDateString('de-DE')}  ${t},${ms}`;
  },

  // ─── Submit Entry ──────────────────────────────────────────────────────
  async submitEntry() {
    if (!this.inputValue || !this.inputTimestamp) return;
    try {
      const saved = await this.api('POST', `/api/timing-points/${this.currentTimingPointId}/entries`, { startNumber: this.inputValue, timestamp: this.inputTimestamp.toISOString() });
      if (!this.entries.find(e => e.id === saved.id)) this.entries.push(saved);
      this.renderEntries(); this.clearInput();
    } catch (err) { this.showToast('Fehler: ' + err.message); }
  },

  // ─── Render Entries ────────────────────────────────────────────────────
  getDuplicates() { const c = {}; this.entries.forEach(e => { c[e.startNumber] = (c[e.startNumber] || 0) + 1; }); return c; },

  renderEntries() {
    const container = document.getElementById('last-entries');
    const dups = this.getDuplicates();
    const last5 = [...this.entries].reverse();
    const dupColor = this.settings.duplicateColor || '#FF3B30';

    if (!last5.length) { container.innerHTML = '<div class="empty-state" style="padding:20px">Noch keine Einträge</div>'; return; }

    container.innerHTML = last5.map(entry => {
      const isDup = dups[entry.startNumber] > 1;
      return `
        <div class="last-entry ${isDup ? 'duplicate' : ''}" style="${isDup ? 'border-left-color:'+dupColor : ''}" data-id="${entry.id}">
          <div class="entry-left">
            <span class="entry-number" onclick="app.showEditEntry('${entry.id}')">${this.esc(entry.startNumber)}</span>
            <span class="entry-time">${this.formatEntryTime(entry)}</span>
          </div>
          <div class="swipe-delete" onclick="app.deleteEntry('${entry.id}')">Löschen</div>
        </div>`;
    }).join('');

    // Attach swipe listeners to last entries
    container.querySelectorAll('.last-entry').forEach(el => this.attachEntrySwipe(el));

    const activeTab = document.querySelector('#view-timing .tab.active');
    if (activeTab && (activeTab.dataset.tab === 'all' || activeTab.dataset.tab === 'duplicates')) this.renderEntriesList(activeTab.dataset.tab);
    if (activeTab && activeTab.dataset.tab === 'startlist') this.renderStartlist();
  },

  attachEntrySwipe(el) {
    let startX = 0;
    el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; el.classList.remove('swiped'); }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (dx < -60) el.classList.add('swiped');
      else el.classList.remove('swiped');
    }, { passive: true });
  },

  renderEntriesList(tab) {
    const dups = this.getDuplicates();
    let items = [...this.entries];
    if (tab === 'duplicates') items = items.filter(e => dups[e.startNumber] > 1);
    const c = document.getElementById(tab === 'all' ? 'all-entries-list' : 'duplicate-entries-list');
    const dupColor = this.settings.duplicateColor || '#FF3B30';
    if (!items.length) { c.innerHTML = `<div class="empty-state">${tab === 'duplicates' ? 'Keine doppelten Einträge' : 'Noch keine Einträge'}</div>`; return; }
    c.innerHTML = items.slice().reverse().map(entry => {
      const isDup = dups[entry.startNumber] > 1;
      return `
        <div class="entry-item ${isDup ? 'duplicate' : ''}" style="${isDup ? 'border-left-color:'+dupColor : ''}">
          <div class="entry-info">
            <span class="entry-number" onclick="app.showEditEntry('${entry.id}')">${this.esc(entry.startNumber)}</span>
            <span class="entry-time">${this.formatEntryTime(entry)}</span>
          </div>
          <button class="entry-delete" onclick="app.deleteEntry('${entry.id}')">&#10005;</button>
        </div>`;
    }).join('');
  },

  formatEntryTime(entry) {
    const d = new Date(entry.timestamp);
    const t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const ms = String(d.getMilliseconds()).padStart(3, '0').substring(0, 2);
    const mode = this.settings.displayMode || 'numberTime';
    if (mode === 'number') return '';
    if (mode === 'numberTime') return `${t},${ms}`;
    return `${d.toLocaleDateString('de-DE')}  ${t},${ms}`;
  },

  async deleteEntry(entryId) {
    try { await this.api('DELETE', `/api/entries/${this.currentTimingPointId}/${entryId}`); this.entries = this.entries.filter(e => e.id !== entryId); this.renderEntries(); }
    catch (err) { this.showToast('Fehler: ' + err.message); }
  },

  // ─── Edit Entry ────────────────────────────────────────────────────────
  showEditEntry(entryId) {
    const entry = this.entries.find(e => e.id === entryId);
    if (!entry) return;
    document.getElementById('edit-entry-id').value = entryId;
    document.getElementById('edit-entry-number').value = entry.startNumber;
    document.getElementById('edit-entry-dialog').classList.remove('hidden');
    document.getElementById('edit-entry-number').focus();
  },
  hideEditEntry() { document.getElementById('edit-entry-dialog').classList.add('hidden'); },
  async saveEditEntry() {
    const id = document.getElementById('edit-entry-id').value;
    const num = document.getElementById('edit-entry-number').value;
    if (!num) { this.showToast('Startnummer eingeben'); return; }
    try {
      const updated = await this.api('PUT', `/api/entries/${this.currentTimingPointId}/${id}`, { startNumber: num });
      const idx = this.entries.findIndex(e => e.id === id);
      if (idx !== -1) this.entries[idx] = updated;
      this.renderEntries(); this.hideEditEntry(); this.showToast('Startnummer geändert');
    } catch (err) { this.showToast('Fehler: ' + err.message); }
  },

  // ─── Startlist ─────────────────────────────────────────────────────────
  async uploadStartlist() {
    const fileInput = document.getElementById('startlist-file');
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    try {
      const res = await fetch(`/api/events/${this.currentEventId}/startlist`, { method: 'POST', body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Fehler'); }
      this.startlist = await res.json();
      this.showToast(`${this.startlist.length} Teilnehmer importiert`);
      this.renderStartlist();
    } catch (err) { this.showToast('Fehler: ' + err.message); }
    fileInput.value = '';
  },
  async deleteStartlist() {
    if (!confirm('Startliste wirklich löschen?')) return;
    await this.api('DELETE', `/api/events/${this.currentEventId}/startlist`);
    this.startlist = [];
    this.showToast('Startliste gelöscht');
    this.renderStartlist();
  },
  renderStartlist() {
    const uploadArea = document.getElementById('startlist-upload');
    const content = document.getElementById('startlist-content');
    const table = document.getElementById('startlist-table');
    if (!this.startlist.length) {
      uploadArea.classList.remove('hidden');
      content.classList.add('hidden');
      return;
    }
    uploadArea.classList.add('hidden');
    content.classList.remove('hidden');

    const entryNumbers = new Set(this.entries.map(e => e.startNumber));
    const dnfDnsNumbers = {};
    this.dnfdns.forEach(d => { dnfDnsNumbers[d.startNumber] = d.type; });

    const finishedCount = this.startlist.filter(s => entryNumbers.has(s.startNumber)).length;
    const dnfCount = this.dnfdns.filter(d => d.type === 'DNF').length;
    const dnsCount = this.dnfdns.filter(d => d.type === 'DNS').length;
    document.getElementById('startlist-count').textContent = `${finishedCount}/${this.startlist.length} gewertet` + (dnfCount ? ` · ${dnfCount} DNF` : '') + (dnsCount ? ` · ${dnsCount} DNS` : '');

    table.innerHTML = `<div class="sl-header"><span class="sl-col-nr">Nr</span><span class="sl-col-name">Name</span><span class="sl-col-gender">G</span><span class="sl-col-year">Jg</span><span class="sl-col-status">Status</span></div>` +
      this.startlist.map(s => {
        const hasTime = entryNumbers.has(s.startNumber);
        const dnfDns = dnfDnsNumbers[s.startNumber];
        let statusHtml = '';
        if (hasTime) statusHtml = '<span class="sl-status-ok">&#10003;</span>';
        else if (dnfDns === 'DNF') statusHtml = '<span class="sl-status-dnf">DNF</span>';
        else if (dnfDns === 'DNS') statusHtml = '<span class="sl-status-dns">DNS</span>';
        return `<div class="sl-row ${hasTime ? 'sl-finished' : ''} ${dnfDns ? 'sl-' + dnfDns.toLowerCase() : ''}"><span class="sl-col-nr">${this.esc(s.startNumber)}</span><span class="sl-col-name">${this.esc(s.lastName)} ${this.esc(s.firstName)}</span><span class="sl-col-gender">${this.esc(s.gender)}</span><span class="sl-col-year">${this.esc(s.yearOfBirth)}</span><span class="sl-col-status">${statusHtml}</span></div>`;
      }).join('');
  },

  // ─── DNF/DNS ──────────────────────────────────────────────────────────
  async addDnfDns() {
    const num = document.getElementById('dnfdns-number').value.trim();
    const type = document.getElementById('dnfdns-type').value;
    if (!num) { this.showToast('Startnummer eingeben'); return; }
    try {
      this.dnfdns = await this.api('POST', `/api/timing-points/${this.currentTimingPointId}/dnf-dns`, { startNumber: num, type });
      document.getElementById('dnfdns-number').value = '';
      this.showToast(`${num} als ${type} markiert`);
      this.renderDnfDns();
      this.renderStartlist();
    } catch (err) { this.showToast('Fehler: ' + err.message); }
  },
  async removeDnfDns(startNumber) {
    try {
      await this.api('DELETE', `/api/timing-points/${this.currentTimingPointId}/dnf-dns/${startNumber}`);
      this.dnfdns = this.dnfdns.filter(d => d.startNumber !== startNumber);
      this.renderDnfDns();
      this.renderStartlist();
    } catch (err) { this.showToast('Fehler: ' + err.message); }
  },
  renderDnfDns() {
    const list = document.getElementById('dnfdns-list');
    if (!this.dnfdns.length) {
      list.innerHTML = '<div class="empty-state">Keine DNF/DNS-Einträge</div>';
      return;
    }
    // Find names from startlist
    const nameMap = {};
    this.startlist.forEach(s => { nameMap[s.startNumber] = `${s.lastName} ${s.firstName}`.trim(); });

    list.innerHTML = this.dnfdns.map(d => {
      const name = nameMap[d.startNumber] || '';
      return `<div class="dnfdns-item"><span class="dnfdns-badge dnfdns-${d.type.toLowerCase()}">${d.type}</span><span class="dnfdns-nr">${this.esc(d.startNumber)}</span>${name ? `<span class="dnfdns-name">${this.esc(name)}</span>` : ''}<button class="entry-delete" onclick="app.removeDnfDns('${this.esc(d.startNumber)}')">&#10005;</button></div>`;
    }).join('');
  },

  // ─── CSV & Email ───────────────────────────────────────────────────────
  downloadCsv() { window.open(`/api/timing-points/${this.currentTimingPointId}/csv`, '_blank'); },
  showEmailDialog(mode) {
    this.emailMode = mode;
    document.getElementById('email-dialog-title').textContent = mode === 'selected' ? 'Ausgewählte CSVs per E-Mail' : 'CSV per E-Mail senden';
    document.getElementById('email-dialog').classList.remove('hidden');
    document.getElementById('email-recipient').value = '';
  },
  hideEmailDialog() { document.getElementById('email-dialog').classList.add('hidden'); },
  async sendEmail() {
    const recipient = document.getElementById('email-recipient').value;
    if (!recipient) { this.showToast('E-Mail eingeben'); return; }
    try {
      if (this.emailMode === 'selected') {
        const ids = this.getSelectedExportIds();
        if (!ids.length) { this.showToast('Keine Zeitmesspunkte ausgewählt'); return; }
        await this.api('POST', `/api/events/${this.currentEventId}/email`, { recipientEmail: recipient, timingPointIds: ids });
      } else {
        await this.api('POST', `/api/timing-points/${this.currentTimingPointId}/email`, { recipientEmail: recipient });
      }
      this.hideEmailDialog(); this.showToast('E-Mail gesendet');
    } catch (err) { this.showToast('Fehler: ' + err.message); }
  },

  // ─── Settings ──────────────────────────────────────────────────────────
  async loadSettings() {
    this.settings = await this.api('GET', '/api/settings');
    document.getElementById('setting-display-mode').value = this.settings.displayMode || 'numberTime';
    document.getElementById('setting-duplicate-color').value = this.settings.duplicateColor || '#FF3B30';
    document.getElementById('setting-smtp').value = this.settings.emailSmtp || '';
    document.getElementById('setting-port').value = this.settings.emailPort || 587;
    document.getElementById('setting-email-user').value = this.settings.emailUser || '';
    document.getElementById('setting-email-pass').value = this.settings.emailPass || '';
    document.getElementById('setting-email-from').value = this.settings.emailFrom || '';
  },
  async saveSettings() {
    this.settings = await this.api('PUT', '/api/settings', {
      displayMode: document.getElementById('setting-display-mode').value,
      duplicateColor: document.getElementById('setting-duplicate-color').value,
      emailSmtp: document.getElementById('setting-smtp').value,
      emailPort: parseInt(document.getElementById('setting-port').value) || 587,
      emailUser: document.getElementById('setting-email-user').value,
      emailPass: document.getElementById('setting-email-pass').value,
      emailFrom: document.getElementById('setting-email-from').value
    });
    this.applySettings(); this.showToast('Gespeichert');
  },
  applySettings() { document.documentElement.style.setProperty('--duplicate-color', this.settings.duplicateColor || '#FF3B30'); },

  // ─── Helpers ───────────────────────────────────────────────────────────
  esc(text) { const d = document.createElement('div'); d.textContent = text || ''; return d.innerHTML; },
  showToast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.add('hidden'), 2500);
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
