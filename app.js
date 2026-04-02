// ============================================================
//  BABYSIT — app.js
//  Firebase 10 + Google Auth + Firestore real-time
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  query,
  collection,
  where,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ============================================================
//  FIREBASE CONFIG
//  → Sostituisci con i valori del tuo progetto Firebase
//    (Progetto Firebase → Impostazioni → Le tue app → SDK setup)
// ============================================================
const firebaseConfig = {
  apiKey:            "INSERISCI_API_KEY",
  authDomain:        "INSERISCI_PROJECT_ID.firebaseapp.com",
  projectId:         "INSERISCI_PROJECT_ID",
  storageBucket:     "INSERISCI_PROJECT_ID.appspot.com",
  messagingSenderId: "INSERISCI_SENDER_ID",
  appId:             "INSERISCI_APP_ID",
};

// ============================================================
//  COSTANTI
// ============================================================
const TOTAL_MINUTES    = 13 * 60;   // 780 min = 13 ore
const STANDARD_MINUTES = 2  * 60;   // 120 min = 2 ore/giorno

const DAY_NAMES = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const MONTHS    = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

// ============================================================
//  INIT
// ============================================================
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const provider    = new GoogleAuthProvider();

// ============================================================
//  STATO
// ============================================================
let currentUser            = null;
let currentWeekMonday      = getThisMonday();
let weekData               = {};      // { 'YYYY-MM-DD': { ... } }
let unsubscribeListener    = null;

// ============================================================
//  UTILITY: DATE
// ============================================================
function getThisMonday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day        = today.getDay();                   // 0=Dom … 6=Sab
  const daysBack   = day === 0 ? -6 : 1 - day;        // giorni a ritroso al lunedì
  const monday     = new Date(today);
  monday.setDate(today.getDate() + daysBack);
  return monday;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function isToday(date) {
  const today = new Date();
  return (
    date.getDate()     === today.getDate()  &&
    date.getMonth()    === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

// ============================================================
//  UTILITY: FORMATO ORE
// ============================================================
function fmtMin(minutes) {
  if (minutes === 0) return '0h';
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const now   = Date.now();
  const diff  = Math.floor((now - timestamp.toMillis()) / 1000);
  if (diff < 60)         return 'pochi secondi fa';
  if (diff < 3600)       return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)} ore fa`;
  return `${Math.floor(diff / 86400)} giorni fa`;
}

// ============================================================
//  AUTH
// ============================================================
document.getElementById('google-signin-btn').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    showToast('Errore durante l\'accesso. Riprova.', 'error');
  }
});

document.getElementById('signout-btn').addEventListener('click', async () => {
  if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;

    // Avatar e nome
    const avatar = document.getElementById('user-avatar');
    if (user.photoURL) {
      avatar.src = user.photoURL;
      avatar.classList.remove('hidden');
    }
    const firstName = (user.displayName || user.email).split(' ')[0];
    document.getElementById('user-name').textContent = firstName;

    // Mostra app
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');

    // Carica settimana corrente
    currentWeekMonday = getThisMonday();
    loadWeek(currentWeekMonday);
  } else {
    currentUser = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
    if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
  }
});

// ============================================================
//  NAVIGAZIONE SETTIMANA
// ============================================================
document.getElementById('prev-week-btn').addEventListener('click', () => {
  currentWeekMonday = new Date(currentWeekMonday);
  currentWeekMonday.setDate(currentWeekMonday.getDate() - 7);
  loadWeek(currentWeekMonday);
});

document.getElementById('next-week-btn').addEventListener('click', () => {
  currentWeekMonday = new Date(currentWeekMonday);
  currentWeekMonday.setDate(currentWeekMonday.getDate() + 7);
  loadWeek(currentWeekMonday);
});

document.getElementById('today-btn').addEventListener('click', () => {
  currentWeekMonday = getThisMonday();
  loadWeek(currentWeekMonday);
});

// ============================================================
//  CARICAMENTO SETTIMANA (real-time)
// ============================================================
function loadWeek(monday) {
  // Cancella listener precedente
  if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }

  updateWeekHeader(monday);

  const weekKey = formatDate(monday);

  const q = query(
    collection(db, 'sessions'),
    where('weekKey', '==', weekKey)
  );

  unsubscribeListener = onSnapshot(q, (snapshot) => {
    weekData = {};
    snapshot.forEach((snap) => { weekData[snap.id] = snap.data(); });
    renderDays(monday);
    updateBudget(monday);
  }, (err) => {
    console.error('Firestore error:', err);
    showToast('Errore di connessione con il database.', 'error');
  });
}

// ============================================================
//  HEADER SETTIMANA
// ============================================================
function updateWeekHeader(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  document.getElementById('week-range').textContent =
    `${fmt(monday)} – ${fmt(sunday)} ${sunday.getFullYear()}`;

  const isCurrentWeek = formatDate(monday) === formatDate(getThisMonday());
  document.getElementById('today-btn').classList.toggle('hidden', isCurrentWeek);
}

// ============================================================
//  RENDER GIORNI
// ============================================================
function renderDays(monday) {
  const grid  = document.getElementById('days-grid');
  const dates = getWeekDates(monday);

  grid.innerHTML = dates.map((date) => buildDayCard(date, monday)).join('');

  // Attacca event listeners
  dates.forEach((date) => {
    const dateStr = formatDate(date);
    const weekday = isWeekday(date);

    if (weekday) {
      document.getElementById(`toggle-${dateStr}`)
        .addEventListener('change', (e) => {
          saveSession(dateStr, monday, { standardActive: e.target.checked });
        });
    }

    document.getElementById(`minus-${dateStr}`)
      .addEventListener('click', () => adjustExtra(dateStr, monday, -30));

    document.getElementById(`plus-${dateStr}`)
      .addEventListener('click', () => adjustExtra(dateStr, monday, +30));
  });
}

function buildDayCard(date, monday) {
  const dateStr = formatDate(date);
  const weekday = isWeekday(date);
  const data    = weekData[dateStr];

  const standardActive = data ? data.standardActive  : weekday;  // default ON per feriali
  const extraMinutes   = data ? (data.extraMinutes || 0) : 0;
  const totalMinutes   = (weekday && standardActive ? STANDARD_MINUTES : 0) + extraMinutes;

  const updatedBy   = data?.updatedBy?.name || data?.updatedBy?.email || '';
  const updatedAt   = data?.updatedAt ? timeAgo(data.updatedAt) : '';
  const updatedText = updatedBy && updatedAt ? `${updatedBy}, ${updatedAt}` : '';

  const classes = [
    'day-card',
    !weekday ? 'weekend' : '',
    isToday(date) ? 'today' : '',
    weekday && !standardActive ? 'inactive' : '',
  ].filter(Boolean).join(' ');

  return `
    <div class="${classes}">
      <div class="day-header">
        <div class="day-name">${DAY_NAMES[date.getDay()]}</div>
        <div class="day-date">${date.getDate()} ${MONTHS[date.getMonth()]}</div>
        ${isToday(date) ? '<div class="today-badge">Oggi</div>' : ''}
      </div>

      ${weekday ? `
        <div class="standard-row">
          <label class="toggle-label">
            <input type="checkbox" id="toggle-${dateStr}" ${standardActive ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          <span class="standard-text">Sessione standard (2h)</span>
        </div>
      ` : ''}

      <div class="extra-row">
        <div class="extra-label">Ore extra</div>
        <div class="extra-controls">
          <button class="btn-adjust" id="minus-${dateStr}" ${extraMinutes <= 0 ? 'disabled' : ''}>−</button>
          <span class="extra-value">${fmtMin(extraMinutes)}</span>
          <button class="btn-adjust" id="plus-${dateStr}">+</button>
        </div>
      </div>

      <div class="day-total">
        Totale: <strong>${fmtMin(totalMinutes)}</strong>
      </div>

      ${updatedText ? `<div class="updated-by">↑ ${updatedText}</div>` : ''}
    </div>
  `;
}

// ============================================================
//  BUDGET
// ============================================================
function updateBudget(monday) {
  const dates = getWeekDates(monday);

  let standardMinutes = 0;
  let extraMinutes    = 0;
  let activeDays      = 0;

  dates.forEach((date) => {
    const dateStr = formatDate(date);
    const data    = weekData[dateStr];
    const weekday = isWeekday(date);

    const stdActive = data ? data.standardActive : weekday;
    const extra     = data ? (data.extraMinutes || 0) : 0;

    if (weekday && stdActive) { standardMinutes += STANDARD_MINUTES; activeDays++; }
    extraMinutes += extra;
  });

  const usedMinutes      = standardMinutes + extraMinutes;
  const remainingMinutes = TOTAL_MINUTES - usedMinutes;
  const pct              = Math.min(100, Math.round((usedMinutes / TOTAL_MINUTES) * 100));

  // Stat labels
  document.getElementById('stat-standard').textContent =
    activeDays > 0 ? `${activeDays}×2h = ${fmtMin(standardMinutes)}` : '0h';
  document.getElementById('stat-extra').textContent = fmtMin(extraMinutes);

  // Remaining with color
  const remEl = document.getElementById('stat-remaining');
  remEl.textContent = fmtMin(remainingMinutes);
  remEl.className   = 'stat-value ' + (
    remainingMinutes <= 0   ? 'over' :
    remainingMinutes <= 60  ? 'low'  : 'good'
  );

  // Progress bar
  const fill = document.getElementById('progress-fill');
  fill.style.width   = `${pct}%`;
  fill.className     = 'progress-fill ' + (pct >= 100 ? 'over' : pct >= 85 ? 'warning' : '');

  document.getElementById('progress-used-label').textContent = `${fmtMin(usedMinutes)} usate`;
  document.getElementById('progress-pct-label').textContent  = `${pct}%`;
}

// ============================================================
//  SALVATAGGIO DATI
// ============================================================
async function saveSession(dateStr, monday, updates) {
  const weekKey  = formatDate(monday);
  const weekday  = isWeekday(new Date(dateStr + 'T12:00:00'));

  const current = weekData[dateStr] || {
    standardActive: weekday,
    extraMinutes:   0,
  };

  const payload = {
    ...current,
    ...updates,
    weekKey,
    updatedBy: {
      name:  currentUser.displayName || '',
      email: currentUser.email,
    },
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'sessions', dateStr), payload, { merge: true });
  } catch (err) {
    console.error('saveSession error:', err);
    showToast('Errore nel salvataggio. Riprova.', 'error');
  }
}

async function adjustExtra(dateStr, monday, deltaMinutes) {
  const current   = weekData[dateStr] || { extraMinutes: 0 };
  const newExtra  = Math.max(0, (current.extraMinutes || 0) + deltaMinutes);
  await saveSession(dateStr, monday, { extraMinutes: newExtra });
}

// ============================================================
//  TOAST
// ============================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
