/* ══════════════════════════════════════════════
   旅途 Tabivibe — 行程規劃 App
   全部資料存 localStorage，純前端
══════════════════════════════════════════════ */

// ── Constants ──────────────────────────────────
const STORAGE_KEY = 'tabivibe_trips';

const CAT_META = {
  sight:     { emoji: '🗺️', label: '景點' },
  food:      { emoji: '🍜', label: '美食' },
  transport: { emoji: '🚆', label: '交通' },
  hotel:     { emoji: '🏨', label: '住宿' },
  shop:      { emoji: '🛍️', label: '購物' },
  other:     { emoji: '📌', label: '其他' },
};

const CURRENCY_SYM = { JPY: '¥', TWD: 'NT$', CNY: '¥', USD: '$', KRW: '₩', EUR: '€', HKD: 'HK$', SGD: 'S$', THB: '฿' };

// ── State ───────────────────────────────────────
let trips        = [];      // all trips
let currentTrip  = null;    // trip being viewed
let currentDay   = 1;       // 1-indexed
let editingAct   = null;    // activity being edited (null = new)
let editingTrip  = false;   // editing existing trip vs creating new
let modalDays    = 7;       // days picker in trip modal

// ── Persistence ─────────────────────────────────
function loadTrips()  { trips = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function saveTrips()  { localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); }
function genId()      { return Math.random().toString(36).slice(2, 10); }

// ── Screen Routing ───────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function goHome() {
  currentTrip = null;
  showScreen('screen-home');
  renderHome();
}

// ── Home ─────────────────────────────────────────
function renderHome() {
  const list  = document.getElementById('trip-list');
  const empty = document.getElementById('empty-trips');

  if (!trips.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = trips.map(trip => {
    const sym    = CURRENCY_SYM[trip.currency] || '';
    const spent  = totalSpent(trip);
    const pct    = trip.budget ? Math.min(spent / trip.budget * 100, 100) : 0;
    const dates  = formatDateRange(trip.startDate, trip.days);
    const actCount = trip.activities.length;

    return `
      <div class="trip-card" onclick="openTrip('${trip.id}')">
        <div class="trip-card-top">
          <div class="trip-card-emoji">${trip.emoji || '✈️'}</div>
          <div class="trip-card-info">
            <div class="trip-card-name">${esc(trip.name)}</div>
            <div class="trip-card-sub">${dates} · ${trip.days} 天 · ${actCount} 個活動</div>
          </div>
        </div>
        ${trip.budget ? `
        <div class="trip-card-progress">
          <div class="trip-card-progress-label">
            <span>已規劃 ${sym}${formatNum(spent)}</span>
            <span>預算 ${sym}${formatNum(trip.budget)}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>` : ''}
      </div>`;
  }).join('');
}

// ── Open Trip ────────────────────────────────────
function openTrip(id) {
  currentTrip = trips.find(t => t.id === id);
  if (!currentTrip) return;
  currentDay = 1;
  showScreen('screen-trip');
  renderTripDetail();
}

function renderTripDetail() {
  const t = currentTrip;
  document.getElementById('trip-title').textContent = `${t.emoji || '✈️'} ${t.name}`;
  document.getElementById('trip-meta').textContent  =
    `${formatDateRange(t.startDate, t.days)} · ${t.days} 天`;

  renderBudgetBar();
  renderDayTabs();
  renderActivities();
}

function renderBudgetBar() {
  const t = currentTrip;
  if (!t.budget) {
    document.getElementById('budget-bar').style.display = 'none';
    return;
  }
  document.getElementById('budget-bar').style.display = '';
  const sym     = CURRENCY_SYM[t.currency] || '';
  const planned = totalPlanned(t);
  const actual  = totalActual(t);
  const budget  = t.budget;

  document.getElementById('budget-planned').textContent = `${sym}${formatNum(planned)}`;
  document.getElementById('budget-actual').textContent  = `${sym}${formatNum(actual)}`;
  document.getElementById('budget-total').textContent   = `${sym}${formatNum(budget)}`;

  const planPct   = Math.min(planned / budget * 100, 100);
  const actualPct = Math.min(actual  / budget * 100, 100);
  const isOver    = actual > budget;

  document.getElementById('budget-fill-planned').style.width = planPct + '%';
  const actualFill = document.getElementById('budget-fill-actual');
  actualFill.style.width = actualPct + '%';
  actualFill.classList.toggle('over', isOver);

  const status = document.getElementById('budget-status');
  const diff   = budget - actual;
  if (actual === 0) {
    status.textContent = `預估總花費 ${sym}${formatNum(planned)}`;
    status.className = 'budget-status';
  } else if (isOver) {
    status.textContent = `⚠️ 已超支 ${sym}${formatNum(Math.abs(diff))}`;
    status.className = 'budget-status over';
  } else {
    const remain = budget - planned;
    status.textContent = `剩餘預算 ${sym}${formatNum(diff)} ／ 預估可用 ${sym}${formatNum(remain)}`;
    status.className = remain < 0 ? 'budget-status warn' : 'budget-status ok';
  }
}

function renderDayTabs() {
  const t    = currentTrip;
  const tabs = document.getElementById('day-tabs');

  tabs.innerHTML = Array.from({ length: t.days }, (_, i) => {
    const d    = i + 1;
    const date = addDays(t.startDate, i);
    return `
      <button class="day-tab ${d === currentDay ? 'active' : ''}"
              onclick="switchDay(${d})">
        Day ${d}<br><small>${formatShortDate(date)}</small>
      </button>`;
  }).join('');
}

function switchDay(d) {
  currentDay = d;
  document.querySelectorAll('.day-tab').forEach((btn, i) => {
    btn.classList.toggle('active', i + 1 === d);
  });
  renderActivities();
}

function renderActivities() {
  const t    = currentTrip;
  const list = document.getElementById('activity-list');

  const dayActs = t.activities
    .filter(a => a.day === currentDay)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  if (!dayActs.length) {
    list.innerHTML = `<div class="empty-day">這天還沒有活動<br>點下方「新增活動」開始規劃 ✏️</div>`;
    return;
  }

  const sym = CURRENCY_SYM[t.currency] || '';

  list.innerHTML = dayActs.map(act => {
    const meta    = CAT_META[act.category] || CAT_META.other;
    const hasActual = act.actual_cost !== undefined && act.actual_cost !== null && act.actual_cost !== '';
    const isOver    = hasActual && act.cost && Number(act.actual_cost) > Number(act.cost);

    let costsHtml = '';
    if (act.cost || hasActual) {
      costsHtml = `<div class="act-costs">`;
      if (act.cost)     costsHtml += `<span class="act-card-cost-plan">預估 ${sym}${formatNum(act.cost)}</span>`;
      if (hasActual)    costsHtml += `<span class="act-card-cost-actual${isOver ? ' over' : ''}">實際 ${sym}${formatNum(act.actual_cost)}</span>`;
      else if (act.cost) costsHtml += `<span class="act-unrecorded">尚未記帳</span>`;
      costsHtml += `</div>`;
    }

    return `
      <div class="activity-item" onclick="openEditActivity('${act.id}')">
        <div class="act-timeline">
          <div class="act-time">${act.time || ''}</div>
          <div class="act-dot cat-${act.category}">${meta.emoji}</div>
          <div class="act-line"></div>
        </div>
        <div class="act-card">
          <div class="act-card-name">${esc(act.name)}</div>
          ${act.location ? `<div class="act-card-loc">
            📍 ${act.mapsUrl
              ? `<a href="${esc(act.mapsUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(act.location)}</a>`
              : esc(act.location)}
          </div>` : ''}
          ${costsHtml}
          ${act.notes ? `<div class="act-card-notes">${esc(act.notes)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  // 每日小計
  const dayPlanned = dayActs.reduce((s, a) => s + (Number(a.cost) || 0), 0);
  const dayActual  = dayActs.filter(a => a.actual_cost !== undefined && a.actual_cost !== null && a.actual_cost !== '')
                             .reduce((s, a) => s + (Number(a.actual_cost) || 0), 0);
  const recorded   = dayActs.filter(a => a.actual_cost !== undefined && a.actual_cost !== null && a.actual_cost !== '').length;

  list.innerHTML += `
    <div class="day-summary">
      <div class="day-summary-item">
        <div class="val" style="color:var(--blue)">${sym}${formatNum(dayPlanned)}</div>
        <div class="lbl">今日預估</div>
      </div>
      <div class="day-summary-item">
        <div class="val" style="color:var(--green)">${sym}${formatNum(dayActual)}</div>
        <div class="lbl">今日實際</div>
      </div>
      <div class="day-summary-item">
        <div class="val">${recorded} / ${dayActs.length}</div>
        <div class="lbl">已記帳</div>
      </div>
    </div>`;
}

// ── Trip Modal ───────────────────────────────────
function openNewTripModal() {
  editingTrip = false;
  modalDays   = 7;
  document.getElementById('trip-modal-title').textContent = '新增旅程';
  document.getElementById('trip-name').value    = '';
  document.getElementById('trip-emoji').value   = '';
  document.getElementById('trip-dest').value    = '';
  document.getElementById('trip-start').value   = '';
  document.getElementById('trip-budget').value  = '';
  document.getElementById('trip-currency').value = 'JPY';
  document.getElementById('days-display').textContent = '7';
  document.getElementById('delete-trip-btn').style.display = 'none';
  document.getElementById('trip-modal-err').style.display  = 'none';
  document.querySelectorAll('.country-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('trip-modal').classList.remove('hidden');
}

function openEditTripModal() {
  if (!currentTrip) return;
  const t = currentTrip;
  editingTrip = true;
  modalDays   = t.days;
  document.getElementById('trip-modal-title').textContent = '編輯旅程';
  document.getElementById('trip-name').value    = t.name;
  document.getElementById('trip-emoji').value   = t.emoji || '';
  document.getElementById('trip-dest').value    = t.destination || '';
  // 標記對應的國家按鈕
  document.querySelectorAll('.country-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.emoji === t.emoji);
  });
  document.getElementById('trip-start').value   = t.startDate || '';
  document.getElementById('trip-budget').value  = t.budget || '';
  document.getElementById('trip-currency').value = t.currency || 'JPY';
  document.getElementById('days-display').textContent = t.days;
  document.getElementById('delete-trip-btn').style.display = 'inline-flex';
  document.getElementById('trip-modal-err').style.display  = 'none';
  document.getElementById('trip-modal').classList.remove('hidden');
}

function closeTripModal() {
  document.getElementById('trip-modal').classList.add('hidden');
}

function pickCountry(btn) {
  document.querySelectorAll('.country-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('trip-emoji').value = btn.dataset.emoji;
  document.getElementById('trip-dest').value  = btn.dataset.name;
}

function adjustDays(delta) {
  modalDays = Math.max(1, Math.min(30, modalDays + delta));
  document.getElementById('days-display').textContent = modalDays;
}

function saveTripModal() {
  const name  = document.getElementById('trip-name').value.trim();
  const start = document.getElementById('trip-start').value;
  const err   = document.getElementById('trip-modal-err');

  if (!name) { showErr(err, '請輸入旅程名稱'); return; }
  if (!start) { showErr(err, '請選擇出發日期'); return; }
  err.style.display = 'none';

  const data = {
    name:        name,
    emoji:       document.getElementById('trip-emoji').value.trim() || '✈️',
    destination: document.getElementById('trip-dest').value.trim(),
    startDate:   start,
    days:        modalDays,
    currency:    document.getElementById('trip-currency').value,
    budget:      parseFloat(document.getElementById('trip-budget').value) || 0,
  };

  if (editingTrip && currentTrip) {
    Object.assign(currentTrip, data);
    saveTrips();
    closeTripModal();
    renderTripDetail();
  } else {
    const newTrip = { ...data, id: genId(), activities: [] };
    trips.unshift(newTrip);
    saveTrips();
    closeTripModal();
    openTrip(newTrip.id);
  }
}

function deleteCurrentTrip() {
  if (!currentTrip) return;
  if (!confirm(`確定要刪除「${currentTrip.name}」嗎？`)) return;
  trips = trips.filter(t => t.id !== currentTrip.id);
  saveTrips();
  closeTripModal();
  goHome();
}

// ── Activity Modal ───────────────────────────────
function openAddActivityModal() {
  editingAct = null;
  document.getElementById('act-modal-title').textContent = `新增活動 — Day ${currentDay}`;
  document.getElementById('act-name').value     = '';
  document.getElementById('act-time').value     = '';
  document.getElementById('act-cost').value     = '';
  document.getElementById('act-actual').value   = '';
  document.getElementById('act-location').value = '';
  document.getElementById('act-maps').value     = '';
  document.getElementById('act-notes').value    = '';
  document.getElementById('delete-act-btn').style.display  = 'none';
  document.getElementById('act-modal-err').style.display   = 'none';
  pickCat(document.querySelector('.cat-btn[data-cat="sight"]'));
  document.getElementById('activity-modal').classList.remove('hidden');
}

function openEditActivity(id) {
  const act = currentTrip.activities.find(a => a.id === id);
  if (!act) return;
  editingAct = act;

  document.getElementById('act-modal-title').textContent = '編輯活動';
  document.getElementById('act-name').value     = act.name;
  document.getElementById('act-time').value     = act.time || '';
  document.getElementById('act-cost').value     = act.cost || '';
  document.getElementById('act-actual').value   = act.actual_cost ?? '';
  document.getElementById('act-location').value = act.location || '';
  document.getElementById('act-maps').value     = act.mapsUrl || '';
  document.getElementById('act-notes').value    = act.notes || '';
  document.getElementById('delete-act-btn').style.display = 'inline-flex';
  document.getElementById('act-modal-err').style.display  = 'none';

  // 設定分類按鈕
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === act.category);
  });
  document.getElementById('activity-modal').classList.remove('hidden');
}

function closeActivityModal() {
  document.getElementById('activity-modal').classList.add('hidden');
}

function pickCat(btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function saveActivityModal() {
  const name = document.getElementById('act-name').value.trim();
  const err  = document.getElementById('act-modal-err');
  if (!name) { showErr(err, '請輸入活動名稱'); return; }
  err.style.display = 'none';

  const cat = document.querySelector('.cat-btn.active')?.dataset.cat || 'other';

  const actualRaw = document.getElementById('act-actual').value;
  const data = {
    name:        name,
    category:    cat,
    time:        document.getElementById('act-time').value,
    cost:        parseFloat(document.getElementById('act-cost').value) || 0,
    actual_cost: actualRaw !== '' ? parseFloat(actualRaw) : null,
    location:    document.getElementById('act-location').value.trim(),
    mapsUrl:     document.getElementById('act-maps').value.trim(),
    notes:       document.getElementById('act-notes').value.trim(),
    day:         currentDay,
  };

  if (editingAct) {
    Object.assign(editingAct, data);
  } else {
    currentTrip.activities.push({ ...data, id: genId() });
  }

  saveTrips();
  closeActivityModal();
  renderActivities();
  renderBudgetBar();
}

function deleteActivity() {
  if (!editingAct) return;
  currentTrip.activities = currentTrip.activities.filter(a => a.id !== editingAct.id);
  saveTrips();
  closeActivityModal();
  renderActivities();
  renderBudgetBar();
}

// ── Helpers ──────────────────────────────────────
function totalPlanned(trip) {
  return trip.activities.reduce((sum, a) => sum + (Number(a.cost) || 0), 0);
}
function totalActual(trip) {
  return trip.activities
    .filter(a => a.actual_cost !== undefined && a.actual_cost !== null && a.actual_cost !== '')
    .reduce((sum, a) => sum + (Number(a.actual_cost) || 0), 0);
}
function totalSpent(trip) {
  const actual = totalActual(trip);
  return actual > 0 ? actual : totalPlanned(trip);
}

function addDays(dateStr, n) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDateRange(startStr, days) {
  if (!startStr) return '未設定日期';
  const start = new Date(startStr);
  const end   = new Date(startStr);
  end.setDate(end.getDate() + days - 1);
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  return `${start.getFullYear()} · ${fmt(start)}–${fmt(end)}`;
}

function formatShortDate(d) {
  if (!d) return '';
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function formatNum(n) {
  return n >= 1000 ? n.toLocaleString() : n;
}

function showErr(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── 點擊 overlay 關閉 modal ──────────────────────
document.getElementById('trip-modal').addEventListener('click', function(e) {
  if (e.target === this) closeTripModal();
});
document.getElementById('activity-modal').addEventListener('click', function(e) {
  if (e.target === this) closeActivityModal();
});

// ── 分享功能（JSONBin.io 短連結）───────────────────

const JSONBIN_KEY = '$2a$10$C7w3iZB7RaHtSqIB0ncK.u24GBTPHC0MCX0beBpqjssY9aeE.1.Qi';
const JSONBIN_URL = 'https://api.jsonbin.io/v3/b';

async function shareTrip() {
  if (!currentTrip) return;

  const shareBtn = document.querySelector('.icon-btn[onclick="shareTrip()"]');
  if (shareBtn) shareBtn.textContent = '⏳';

  try {
    const res = await fetch(JSONBIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_KEY,
        'X-Bin-Private': 'false',
      },
      body: JSON.stringify(currentTrip),
    });

    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const binId = data.metadata.id;

    const url = `${location.origin}${location.pathname}?trip=${binId}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('🔗 連結已複製！傳給朋友吧');
    }).catch(() => {
      prompt('複製這個連結分享給朋友：', url);
    });
  } catch (e) {
    showToast('⚠️ 分享失敗，請稍後再試');
  } finally {
    if (shareBtn) shareBtn.textContent = '🔗';
  }
}

function showToast(msg) {
  const t = document.getElementById('share-toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

let sharedTripData = null;

async function checkShareParam() {
  // 支援新版 ?trip=ID
  const params = new URLSearchParams(location.search);
  const binId  = params.get('trip');

  // 支援舊版 #share=encoded（向下相容）
  const hash = location.hash;
  if (!binId && hash.startsWith('#share=')) {
    try {
      sharedTripData = JSON.parse(decodeURIComponent(atob(hash.slice('#share='.length))));
      _showSharedBanner();
      history.replaceState(null, '', location.pathname);
    } catch { /* 舊格式解析失敗，忽略 */ }
    return;
  }

  if (!binId) return;

  try {
    const res = await fetch(`${JSONBIN_URL}/${binId}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY },
    });
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    sharedTripData = data.record;
    _showSharedBanner();
  } catch {
    showToast('⚠️ 找不到行程，連結可能已失效');
  } finally {
    history.replaceState(null, '', location.pathname);
  }
}

function _showSharedBanner() {
  if (!sharedTripData) return;
  currentTrip = sharedTripData;
  currentDay  = 1;
  showScreen('screen-trip');
  renderTripDetail();

  document.getElementById('share-banner-name').textContent =
    `${sharedTripData.emoji || '✈️'} ${sharedTripData.name}`;
  document.getElementById('share-banner').classList.remove('hidden');
}

function saveSharedTrip() {
  if (!sharedTripData) return;
  if (trips.find(t => t.id === sharedTripData.id)) {
    showToast('✅ 這個行程你已經存過了！');
    closeShareBanner();
    return;
  }
  trips.unshift({ ...sharedTripData, id: genId() });
  saveTrips();
  closeShareBanner();
  showToast('✅ 已儲存到你的行程！');
}

function closeShareBanner() {
  document.getElementById('share-banner').classList.add('hidden');
  sharedTripData = null;
}

// ── Init ─────────────────────────────────────────
loadTrips();

// 示範資料（第一次開啟才注入）
if (!trips.length) {
  const demo = {
    id: 'demo-japan',
    name: '日本關東 2026',
    emoji: '🇯🇵',
    destination: '日本',
    startDate: '2026-05-01',
    days: 7,
    currency: 'JPY',
    budget: 100000,
    activities: [
      { id: 'a1', day:1, time:'14:00', name:'抵達成田機場 T2', category:'transport', location:'成田國際空港', mapsUrl:'', notes:'搭 Narita Express 到新宿，約 90 分鐘', cost:3000 },
      { id: 'a2', day:1, time:'18:00', name:'辦理入住', category:'hotel',     location:'新宿グランドホテル',   mapsUrl:'', notes:'',               cost:8000 },
      { id: 'a3', day:1, time:'20:00', name:'新宿居酒屋晚餐', category:'food', location:'新宿歌舞伎町',         mapsUrl:'', notes:'一蘭拉麵或燒鳥', cost:2000 },
      { id: 'a4', day:2, time:'09:00', name:'淺草寺',          category:'sight',    location:'東京都台東區淺草 2-3-1', mapsUrl:'', notes:'免費入場，雷門拍照', cost:0 },
      { id: 'a5', day:2, time:'12:00', name:'仲見世通り購物',  category:'shop',     location:'淺草仲見世',            mapsUrl:'', notes:'伴手禮、和菓子', cost:3000 },
      { id: 'a6', day:2, time:'15:00', name:'上野動物園',      category:'sight',    location:'東京都台東區上野公園',  mapsUrl:'', notes:'',           cost:600  },
      { id: 'a7', day:3, time:'10:00', name:'築地場外市場海鮮', category:'food',    location:'築地場外市場',           mapsUrl:'', notes:'生魚片丼、玉子燒', cost:2500 },
      { id: 'a8', day:3, time:'14:00', name:'teamLab Planets', category:'sight',    location:'豊洲',                  mapsUrl:'', notes:'須提前網路購票', cost:3200 },
    ]
  };
  trips.push(demo);
  saveTrips();
}

renderHome();
checkShareParam();
