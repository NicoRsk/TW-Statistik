"use strict";

/* =========================================================
   Konstanten
   ========================================================= */

const ZONES = ["Rückraum", "Durchbruch", "Kreis", "Außen", "Gegenstoß", "7m"];

// Erwartete Paradenquoten je Zone (teamweite Referenzwerte, wie im Original)
const EXPECTED = {
  "Rückraum": 43.2,
  "Durchbruch": 26.2,
  "Kreis": 20.9,
  "Außen": 27.1,
  "Gegenstoß": 15.9,
  "7m": 20.5
};

// Reihenfolge für die schematische Darstellung (2-spaltiges Raster,
// grob von "nah am Tor" nach "weiter weg" sortiert – bewusst schematisch,
// nicht maßstabsgetreu, da z. B. "Gegenstoß" keine feste Position hat).
const PITCH_ORDER = ["Kreis", "7m", "Durchbruch", "Außen", "Rückraum", "Gegenstoß"];

const STORAGE_KEY = "tw-stats:v1";
const KEEPER_COUNT = 3;

// ---------------------------------------------------------------------------
// HIER ÄNDERN: Trag zwischen den Anführungszeichen deinen Namen (oder ein
// Pseudonym) ein, wenn du als Ersteller/in oben in der App genannt werden
// möchtest. Leer lassen (also "" ), wenn kein Name angezeigt werden soll.
// Das ist die einzige Zeile in der ganzen App, die dafür angepasst werden muss.
const CREDIT_NAME = "by Nico Röske";
// ---------------------------------------------------------------------------

/* =========================================================
   Status
   ========================================================= */

function emptyZones() {
  const z = {};
  ZONES.forEach((zone) => { z[zone] = { saves: 0, goals: 0 }; });
  return z;
}

function defaultState() {
  return {
    keepers: Array.from({ length: KEEPER_COUNT }, (_, i) => ({
      name: `Torhüter ${i + 1}`,
      zones: emptyZones(),
      history: [] // { save: number|null, xsave: number }
    }))
  };
}

let state = loadState();
let view = { screen: "overview", keeperIndex: null };
let pendingZonePick = null; // { keeperIndex, category, enabled: Set<string> }

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.keepers) || parsed.keepers.length !== KEEPER_COUNT) {
      return defaultState();
    }
    // Fehlende Zonen/Felder defensiv auffüllen (z. B. nach App-Updates)
    parsed.keepers.forEach((k) => {
      k.zones = k.zones || {};
      ZONES.forEach((zone) => {
        if (!k.zones[zone]) k.zones[zone] = { saves: 0, goals: 0 };
      });
      if (!Array.isArray(k.history)) k.history = [];
    });
    return parsed;
  } catch (e) {
    console.warn("Konnte gespeicherte Daten nicht laden, starte neu.", e);
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Speichern fehlgeschlagen (z. B. privater Modus).", e);
    showToast("Speichern nicht möglich – Daten bleiben nur für diese Sitzung erhalten.");
  }
}

/* =========================================================
   Ableitungen / Berechnungen
   ========================================================= */

function keeperTotals(keeper) {
  let saves = 0, goals = 0;
  ZONES.forEach((zone) => {
    saves += keeper.zones[zone].saves;
    goals += keeper.zones[zone].goals;
  });
  const shots = saves + goals;
  const pct = shots > 0 ? (saves / shots) * 100 : 0;
  return { saves, goals, shots, pct };
}

function keeperXSave(keeper) {
  let weighted = 0, totalShots = 0;
  ZONES.forEach((zone) => {
    const z = keeper.zones[zone];
    const shots = z.saves + z.goals;
    weighted += EXPECTED[zone] * shots;
    totalShots += shots;
  });
  return totalShots > 0 ? weighted / totalShots : 0;
}

function teamTotals() {
  let saves = 0, goals = 0;
  state.keepers.forEach((k) => {
    const t = keeperTotals(k);
    saves += t.saves;
    goals += t.goals;
  });
  const shots = saves + goals;
  const pct = shots > 0 ? (saves / shots) * 100 : 0;
  return { saves, goals, shots, pct };
}

function teamXSave() {
  let weighted = 0, totalShots = 0;
  ZONES.forEach((zone) => {
    let zoneShots = 0;
    state.keepers.forEach((k) => {
      zoneShots += k.zones[zone].saves + k.zones[zone].goals;
    });
    weighted += EXPECTED[zone] * zoneShots;
    totalShots += zoneShots;
  });
  return totalShots > 0 ? weighted / totalShots : 0;
}

function fmtPct(value) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

function fmtPct1(value) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

/* =========================================================
   Mutationen
   ========================================================= */

function recordHistory(keeperIndex) {
  const keeper = state.keepers[keeperIndex];
  const totals = keeperTotals(keeper);
  const xsave = keeperXSave(keeper);
  keeper.history.push({
    save: totals.shots > 0 ? totals.pct : null,
    xsave
  });
}

function applyZoneAction(keeperIndex, category, op, zone) {
  const keeper = state.keepers[keeperIndex];
  const field = category === "save" ? "saves" : "goals";
  if (op === "add") {
    keeper.zones[zone][field] += 1;
  } else {
    if (keeper.zones[zone][field] > 0) {
      keeper.zones[zone][field] -= 1;
    }
  }
  recordHistory(keeperIndex);
  saveState();
  render();
}

function resetAll() {
  state = defaultState();
  saveState();
  view = { screen: "overview", keeperIndex: null };
  render();
}

/* =========================================================
   Zonen-Overlay (Auswahl der Abschlussposition)
   ========================================================= */

function zonesWithValue(keeper, category) {
  const field = category === "save" ? "saves" : "goals";
  return ZONES.filter((zone) => keeper.zones[zone][field] > 0);
}

function startCounterAction(keeperIndex, category, op) {
  const keeper = state.keepers[keeperIndex];

  if (op === "remove") {
    const candidates = zonesWithValue(keeper, category);
    if (candidates.length === 0) {
      showToast("Nichts zum Entfernen vorhanden.");
      return;
    }
    if (candidates.length === 1) {
      // Eindeutig – kein Dialog nötig (wie im Original)
      applyZoneAction(keeperIndex, category, "remove", candidates[0]);
      return;
    }
    openZoneOverlay(keeperIndex, category, "remove", new Set(candidates));
    return;
  }

  openZoneOverlay(keeperIndex, category, "add", new Set(ZONES));
}

function openZoneOverlay(keeperIndex, category, op, enabledSet) {
  pendingZonePick = { keeperIndex, category, op, enabled: enabledSet };

  const overlay = document.getElementById("zone-overlay");
  const title = document.getElementById("zone-overlay-title");
  const hint = document.getElementById("zone-overlay-hint");
  const grid = document.getElementById("zone-grid");

  const catLabel = category === "save" ? "Parade" : "Gegentor";
  title.textContent = op === "add" ? `${catLabel} zuordnen` : `${catLabel} entfernen`;
  hint.textContent = op === "add"
    ? "Wähle die Abschlussposition dieser Aktion."
    : "Wähle, aus welcher Zone die letzte Aktion entfernt werden soll.";

  grid.innerHTML = PITCH_ORDER.map((zone) => {
    const enabled = enabledSet.has(zone);
    const cls = category === "save" ? "is-save" : "is-goal";
    return `<button type="button" class="zone-option ${cls}" data-zone="${zone}" ${enabled ? "" : "disabled"}>${zone}</button>`;
  }).join("");

  overlay.hidden = false;
}

function closeZoneOverlay() {
  document.getElementById("zone-overlay").hidden = true;
  pendingZonePick = null;
}

document.getElementById("zone-grid").addEventListener("click", (e) => {
  const btn = e.target.closest(".zone-option");
  if (!btn || btn.disabled || !pendingZonePick) return;
  const { keeperIndex, category, op } = pendingZonePick;
  const zone = btn.dataset.zone;
  closeZoneOverlay();
  applyZoneAction(keeperIndex, category, op, zone);
});

document.getElementById("zone-cancel").addEventListener("click", closeZoneOverlay);

/* =========================================================
   Reset-Overlay
   ========================================================= */

function openResetOverlay() {
  document.getElementById("reset-overlay").hidden = false;
}
function closeResetOverlay() {
  document.getElementById("reset-overlay").hidden = true;
}
document.getElementById("reset-cancel").addEventListener("click", closeResetOverlay);
document.getElementById("reset-confirm").addEventListener("click", () => {
  closeResetOverlay();
  resetAll();
});

/* =========================================================
   Toast
   ========================================================= */

let toastTimer = null;
function showToast(message, opts = {}) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  if (!opts.sticky) {
    toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }
}

/* =========================================================
   Rendering
   ========================================================= */

function render() {
  const app = document.getElementById("app");
  app.innerHTML = view.screen === "overview" ? renderOverview() : renderDetail(view.keeperIndex);
}

function renderAppHeader() {
  const nameSuffix = CREDIT_NAME ? ` ${escapeHtml(CREDIT_NAME)}` : "";
  return `
    <div class="header">
      <div class="header__title">TW-Statistiken${nameSuffix}<small>Live-Spielstatistik</small></div>
      <div class="status-dot ${navigator.onLine ? "" : "is-offline"}" id="status-dot">${navigator.onLine ? "Bereit" : "Offline"}</div>
    </div>`;
}

function renderOverview() {
  const totals = teamTotals();
  const xsave = teamXSave();
  const diff = totals.pct - xsave;

  const rows = state.keepers.map((keeper, i) => {
    const t = keeperTotals(keeper);
    return `
      <button type="button" class="keeper-row" data-action="open-keeper" data-keeper="${i}">
        <div>
          <div class="keeper-row__name">${escapeHtml(keeper.name)}</div>
          <div class="keeper-row__meta">Paraden ${t.saves} · Gegentore ${t.goals}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="keeper-row__quote">${fmtPct(t.pct)}</div>
          <div class="keeper-row__chevron">›</div>
        </div>
      </button>`;
  }).join("");

  return `
    ${renderAppHeader()}

    <div class="card">
      <div class="card__label">Team gesamt</div>
      <div class="team-summary">
        <div class="team-summary__stat">
          <div class="team-summary__value">${totals.saves}</div>
          <div class="team-summary__unit">Paraden</div>
        </div>
        <div class="team-summary__stat">
          <div class="team-summary__value">${totals.goals}</div>
          <div class="team-summary__unit">Gegentore</div>
        </div>
        <div class="team-summary__stat">
          <div class="team-summary__value">${fmtPct(totals.pct)}</div>
          <div class="team-summary__caption">Paradenquote</div>
        </div>
      </div>
      <div class="diff-line">
        <span>xSaves-Quote: <b>${fmtPct(xsave)}</b></span>
        <span class="diff-line__value ${diff >= 0 ? "pos" : "neg"}">${diff >= 0 ? "+" : ""}${fmtPct(diff)}</span>
      </div>
    </div>

    <div class="card__label" style="margin: 18px 4px 8px;">Torhüter</div>
    ${rows}

    <button type="button" class="btn btn--reset btn--block" style="margin-top:18px;" data-action="open-reset">Alles zurücksetzen</button>
  `;
}

function renderDetail(index) {
  const keeper = state.keepers[index];
  const totals = keeperTotals(keeper);
  const xsave = keeperXSave(keeper);
  const diff = totals.pct - xsave;

  return `
    ${renderAppHeader()}

    <div class="topbar">
      <button type="button" class="back-btn" data-action="back" aria-label="Zurück">‹</button>
      <input class="name-input" type="text" value="${escapeHtml(keeper.name)}" data-action="rename" data-keeper="${index}" maxlength="40">
    </div>

    <div class="counter-block">
      <div class="counter-card">
        <div class="counter-card__label">Paraden</div>
        <div class="counter-card__value">${totals.saves}</div>
        <div class="counter-card__buttons">
          <button class="counter-btn counter-btn--minus is-save" data-action="counter" data-keeper="${index}" data-category="save" data-op="remove">−1</button>
          <button class="counter-btn counter-btn--plus is-save" data-action="counter" data-keeper="${index}" data-category="save" data-op="add">+1</button>
        </div>
      </div>
      <div class="counter-card">
        <div class="counter-card__label">Gegentore</div>
        <div class="counter-card__value">${totals.goals}</div>
        <div class="counter-card__buttons">
          <button class="counter-btn counter-btn--minus is-goal" data-action="counter" data-keeper="${index}" data-category="goal" data-op="remove">−1</button>
          <button class="counter-btn counter-btn--plus is-goal" data-action="counter" data-keeper="${index}" data-category="goal" data-op="add">+1</button>
        </div>
      </div>
    </div>

    <div class="quote-block">
      <div class="quote-block__label">Paradenquote</div>
      <div class="quote-block__value">${fmtPct(totals.pct)}</div>
      <div class="quote-sub">
        <span>xSaves <b>${fmtPct(xsave)}</b></span>
        <span class="${diff >= 0 ? "pos" : "neg"}">Differenz <b>${diff >= 0 ? "+" : ""}${fmtPct(diff)}</b></span>
      </div>
    </div>

    <div class="card">
      <div class="card__label">Paradenquote nach Abschlusszone</div>
      <div class="pitch-caption">Schematische Anordnung zur schnellen Orientierung – nicht maßstabsgetreu. "Gegenstoß" hat keine feste Position.</div>
      ${renderPitch(keeper, { interactive: false })}
    </div>

    <div class="card">
      <div class="card__label">Verlauf</div>
      <div class="chart-legend">
        <span><span class="chart-legend__dot" style="background:var(--text)"></span>Paradenquote</span>
        <span><span class="chart-legend__dot" style="background:var(--xsave)"></span>xSaves-Quote</span>
      </div>
      ${renderChart(keeper.history)}
    </div>
  `;
}

function renderPitch(keeper, { interactive }) {
  const tiles = PITCH_ORDER.map((zone) => {
    const z = keeper.zones[zone];
    const shots = z.saves + z.goals;
    const pct = shots > 0 ? (z.saves / shots) * 100 : 0;
    return `
      <div class="zone-tile">
        <div class="zone-tile__name">${zone}</div>
        <div class="zone-tile__stat">${shots > 0 ? fmtPct(pct) : "–"} (${z.saves}/${shots})</div>
        <div class="zone-tile__expected">Erwartet ${fmtPct1(EXPECTED[zone])}</div>
      </div>`;
  }).join("");

  return `
    <div class="pitch">
      <div class="pitch__goal">Tor</div>
      <div class="pitch-row pitch-row--2">${tiles}</div>
    </div>`;
}

function renderChart(history) {
  if (!history || history.length === 0) {
    return `<div class="chart-empty">Noch keine Aktionen erfasst.</div>`;
  }

  const padLeft = 34, padRight = 12, padTop = 12, padBottom = 22;
  const stepX = 44;
  const innerW = Math.max(history.length - 1, 1) * stepX;
  const width = Math.max(innerW + padLeft + padRight, 260);
  const height = 180;
  const innerH = height - padTop - padBottom;

  const xAt = (i) => padLeft + (history.length > 1 ? i * stepX : innerW / 2);
  const yAt = (v) => padTop + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;

  const gridLines = [0, 25, 50, 75, 100].map((v) => `
    <line x1="${padLeft}" y1="${yAt(v)}" x2="${width - padRight}" y2="${yAt(v)}" stroke="var(--border)" stroke-width="1" />
    <text x="0" y="${yAt(v) + 4}" font-size="10" fill="var(--text-faint)">${v}%</text>
  `).join("");

  const xsavePoints = history.map((h, i) => `${xAt(i)},${yAt(h.xsave)}`).join(" ");

  const saveSegments = [];
  let current = [];
  history.forEach((h, i) => {
    if (h.save === null) {
      if (current.length) { saveSegments.push(current); current = []; }
    } else {
      current.push(`${xAt(i)},${yAt(h.save)}`);
    }
  });
  if (current.length) saveSegments.push(current);

  const saveLines = saveSegments.map((seg) =>
    `<polyline points="${seg.join(" ")}" fill="none" stroke="var(--text)" stroke-width="2.5" />`
  ).join("");

  const saveDots = history.map((h, i) =>
    h.save === null ? "" : `<circle cx="${xAt(i)}" cy="${yAt(h.save)}" r="2.5" fill="var(--text)" />`
  ).join("");
  const xsaveDots = history.map((h, i) =>
    `<circle cx="${xAt(i)}" cy="${yAt(h.xsave)}" r="2" fill="var(--xsave)" />`
  ).join("");

  return `
    <div class="chart-scroll">
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Verlauf der Paradenquote und xSaves-Quote">
        ${gridLines}
        <polyline points="${xsavePoints}" fill="none" stroke="var(--xsave)" stroke-width="2" stroke-dasharray="4 3" />
        ${saveLines}
        ${xsaveDots}
        ${saveDots}
      </svg>
    </div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =========================================================
   Event-Delegation
   ========================================================= */

document.getElementById("app").addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;

  if (action === "open-keeper") {
    view = { screen: "detail", keeperIndex: Number(el.dataset.keeper) };
    render();
  } else if (action === "back") {
    view = { screen: "overview", keeperIndex: null };
    render();
  } else if (action === "counter") {
    const keeperIndex = Number(el.dataset.keeper);
    const category = el.dataset.category;
    const op = el.dataset.op;
    startCounterAction(keeperIndex, category, op);
  } else if (action === "open-reset") {
    openResetOverlay();
  }
});

document.getElementById("app").addEventListener("input", (e) => {
  const el = e.target.closest('[data-action="rename"]');
  if (!el) return;
  const keeperIndex = Number(el.dataset.keeper);
  state.keepers[keeperIndex].name = el.value;
  saveState();
});

/* =========================================================
   Online/Offline-Status
   ========================================================= */

window.addEventListener("online", () => { if (view.screen === "overview") render(); });
window.addEventListener("offline", () => { if (view.screen === "overview") render(); });

/* =========================================================
   Service Worker
   ========================================================= */

if ("serviceWorker" in navigator) {
  // Sobald der neue Service Worker die Kontrolle übernimmt (dank skipWaiting
  // in sw.js passiert das jetzt automatisch, ohne dass alle Fenster/Tabs
  // manuell geschlossen werden müssen), einmalig neu laden, damit die neuen
  // Dateien auch tatsächlich angezeigt werden.
  let refreshingAfterUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingAfterUpdate) return;
    refreshingAfterUpdate = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        const hadControllerBefore = !!navigator.serviceWorker.controller;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && !hadControllerBefore) {
            // Erster Durchlauf überhaupt: ab jetzt ist Offline-Nutzung möglich.
            showToast("Fertig geladen – ab jetzt auch offline nutzbar.");
          }
          // Bei einem Update (hadControllerBefore = true) übernimmt der neue
          // Worker jetzt automatisch, und der controllerchange-Listener oben
          // lädt die Seite von selbst neu – kein manuelles Eingreifen nötig.
        });
      });
    }).catch((err) => {
      console.warn("Service Worker konnte nicht registriert werden.", err);
    });
  });
}

/* =========================================================
   Start
   ========================================================= */

render();
