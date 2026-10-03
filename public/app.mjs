// Orbit Weather: one forecast, one truth, for where you are and the places
// you pin. A Quadra app (a related add-on, like Orbit Class): the Quadra
// Pass signs in and keeps the pins; the kit draws the loading screen, keeps
// the app current, and sends the notices.

import { quadraSession, topActions, installGate, watchUpdates, schedulePush, tell, ask } from './lib/quadra.mjs';
import { loadLocal, saveLocal, cellOf, cachedForecast, isFresh, permissionState, getPosition, fetchForecast, fetchWhere, fetchPlaces, placeLines } from './lib/api.mjs';
import { emptyData, encodeData, decodeData, mergeData, cleanPin, newPinId, planNotices, placeAt, MAX_PINS, CARDS, DEFAULT_LAYOUT } from './lib/pins.mjs';
import { pageHtml, daySheet, colsFor, rangeOf, metricSheet } from './lib/cards.mjs';
import { readout, scrubHtml, colAt, colSpot, CHART_W, PLOT_BOTTOM } from './lib/graph.mjs';
import { escapeHtml as e, dateOf } from './lib/format.mjs';
import { routeForecast } from './lib/plan.mjs';

const $ = id => document.getElementById(id);
const VERSION = document.querySelector('meta[name="build-version"]')?.content || 'dev';
const q = quadraSession('weather', { lang: 'zh' });

const state = {
  local: loadLocal(),
  data: emptyData(),
  pages: [],
  index: 0,
  permission: 'unknown',
  // What each page's graphs show, for the read-outs: key → { uv, rain, air, tz }.
  cols: {},
  // The graphs' ranges (the cards' tabs), this device's choice.
  ranges: (() => {
    try {
      return JSON.parse(localStorage.getItem('orbit-weather.ranges') || '{}') || {};
    } catch {
      return {};
    }
  })()
};

// ---- Pages: here, then each pin --------------------------------------------------------

function buildPages() {
  const here = state.local.here;
  const old = Object.fromEntries(state.pages.map(p => [p.key, p]));
  state.pages = [
    // 我的行程 first, once there's a pin: the weather where you'll be.
    ...(state.data.pins.length ? [{ key: 'plan', plan: true, pin: null, lat: null, lon: null }] : []),
    { ...(old.here || {}), key: 'here', pin: null, lat: here?.lat ?? old.here?.lat ?? null, lon: here?.lon ?? old.here?.lon ?? null, place: here?.place || old.here?.place || null },
    ...state.data.pins.map(pin => ({ ...(old[pin.id] || {}), key: pin.id, pin, lat: pin.lat, lon: pin.lon, place: { county: pin.county, town: pin.town, village: pin.village } }))
  ];
}
const pageOf = key => state.pages.find(p => p.key === key);
// A page's forecast: its cell's; 我的行程's, the places' made one.
const forecastOf = page => (page.plan ? routeForecast(state.data.pins, forecastFor, Date.now()) : page.lat != null ? cachedForecast(state.local, cellOf(page.lat, page.lon))?.f || null : page.ipForecast || null);
const forecastFor = key => {
  const page = pageOf(key);
  return page && !page.plan ? forecastOf(page) : null;
};

// The place chips: built when the places change, else only the pressed one
// moves (rebuilding them under a finger loses the tap on a phone, and
// throws the row back to its start).
function renderDots() {
  const dots = $('dots');
  const sig = state.pages.map(p => `${p.key}:${p.pin?.name || ''}:${p.pin?.home ? 1 : 0}`).join('|');
  if (dots.dataset.sig !== sig) {
    dots.dataset.sig = sig;
    dots.innerHTML = state.pages
      .map((p, i) => `<button class="q-chip wx-dot" type="button" data-go="${i}" aria-pressed="false">${p.plan ? '🗓️ 行程' : `${p.pin?.home ? '🏠' : p.pin ? '📌' : '📍'} ${e(p.pin ? p.pin.name : '目前位置')}`}</button>`)
      .join('') + `<button class="q-chip wx-dot wx-add" type="button" data-act="add-pin" aria-label="新增釘選地點">＋ 釘選</button>`;
  }
  for (const b of dots.querySelectorAll('[data-go]')) {
    const on = Number(b.dataset.go) === state.index;
    if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
  }
  const on = dots.querySelector(`[data-go="${state.index}"]`);
  if (on) {
    // Into view inside the row only (scrollIntoView would move the page too).
    const l = on.offsetLeft - dots.offsetLeft;
    if (l < dots.scrollLeft || l + on.offsetWidth > dots.scrollLeft + dots.clientWidth) dots.scrollTo({ left: Math.max(0, l - 16), behavior: 'smooth' });
  }
}

function renderPage(page) {
  const el = document.querySelector(`.wx-page[data-key="${page.key}"]`);
  if (!el) return;
  const now = Date.now();
  if (page.plan) {
    // Where the route has you now, for the top.
    const cur = placeAt(state.data.pins, now);
    page.pin = cur;
    page.place = cur ? { county: cur.county, town: cur.town, village: cur.village } : pageOf('here')?.place || null;
  }
  const f = forecastOf(page);
  const top = el.scrollTop;
  el.innerHTML = pageHtml(f, page, { now, cards: state.data.cards, hidden: state.data.hidden, ranges: state.ranges }) + (page.pin && !page.plan ? `<button class="q-btn wx-edit" type="button" data-act="edit-pin" data-pin="${e(page.pin.id)}">編輯「${e(page.pin.name)}」</button>` : '');
  el.scrollTop = top;
  page.drawn = drawnSig(page);
}

const planPage = () => state.pages.find(p => p.plan);
// What a page was drawn from: drawn again only when it changes (or the hour turns).
const drawnSig = page => {
  const f = page.plan ? state.pages.filter(p => !p.plan).map(p => forecastOf(p)?.at || 0).join() : forecastOf(page)?.at || page.error || 0;
  return `${f}|${Math.floor(Date.now() / 3_600_000)}|${state.data.t}|${page.place?.village || ''}`;
};


function renderAll() {
  const pager = $('pager');
  const keys = state.pages.map(p => p.key).join();
  if (pager.dataset.keys !== keys) {
    pager.innerHTML = state.pages.map(p => `<article class="wx-page" data-key="${e(p.key)}"></article>`).join('');
    pager.dataset.keys = keys;
  }
  state.pages.forEach(renderPage);
  renderDots();
}

// A chip tapped: straight there (a smooth scroll fights the pages' snapping
// in Safari), the chips at once, the page's data after the frame.
let jumping = false;
function goTo(i) {
  state.index = Math.max(0, Math.min(state.pages.length - 1, i));
  const pager = $('pager');
  jumping = true;
  pager.scrollLeft = state.index * pager.clientWidth;
  renderDots();
  requestAnimationFrame(() => {
    jumping = false;
    loadPage(state.pages[state.index]);
  });
}

// ---- Loading a page's forecast -------------------------------------------------------------

async function loadPage(page, { force = false } = {}) {
  if (!page || page.loading) return;
  // The plan needs every place: each loaded in turn, the plan redrawn as they come.
  if (page.plan) {
    if (page.drawn !== drawnSig(page)) renderPage(page);
    for (const p of state.pages.filter(x => !x.plan)) await loadPage(p, { force });
    return page.drawn === drawnSig(page) ? undefined : renderPage(page);
  }
  const cell = page.lat != null ? cellOf(page.lat, page.lon) : null;
  if (!force && cell && isFresh(cachedForecast(state.local, cell))) return page.drawn === drawnSig(page) ? undefined : renderPage(page);
  page.loading = true;
  try {
    const token = await q.ensureToken();
    if (!token) throw Object.assign(new Error('signed out'), { status: 401 });
    const f = await fetchForecast(page.lat != null ? { lat: page.lat, lon: page.lon } : { auto: true }, token);
    if (cell) state.local.forecasts[cell] = { at: Date.now(), f };
    else {
      // Where the network said: the page takes the forecast's own place.
      page.ipForecast = f;
      page.place = page.place || f.place;
    }
    page.error = '';
    saveLocal(state.local);
  } catch (err) {
    page.error = err.status === 429 ? '請求太頻繁，請稍候再試。' : '暫時無法取得天氣，請檢查網路。';
  } finally {
    page.loading = false;
    renderPage(page);
    const plan = planPage();
    if (plan && plan.drawn !== drawnSig(plan)) renderPage(plan);
  }
}

// Where the device is: as precise as it gives, to the village. Asked each
// time the app opens (the phone remembers the permission).
async function locate() {
  state.permission = await permissionState();
  const here = pageOf('here');
  if (state.permission === 'denied') {
    here.note = state.local.here ? '定位已關閉，顯示上次的位置' : '定位已關閉，顯示大約位置';
    if (!state.local.here) {
      here.lat = here.lon = null;
      return loadPage(here);
    }
    return loadPage(here);
  }
  let pos = await getPosition(navigator, { high: true, timeout: 8000 });
  if (pos.error === 'timeout') pos = await getPosition(navigator, { high: false, timeout: 5000, maximumAge: 30 * 60_000 });
  if (pos.error) {
    if (pos.error === 'denied') state.permission = 'denied';
    here.note = state.local.here ? '無法定位，顯示上次的位置' : '無法定位，顯示大約位置';
    if (!state.local.here) here.lat = here.lon = null;
    return loadPage(here);
  }
  here.note = pos.acc > 1000 ? '大約位置' : '';
  const moved = !state.local.here || Math.abs(state.local.here.lat - pos.lat) > 0.001 || Math.abs(state.local.here.lon - pos.lon) > 0.001;
  let place = state.local.here?.place || null;
  if (moved || !place?.village) {
    try {
      const token = await q.ensureToken();
      const w = await fetchWhere(pos.lat, pos.lon, token);
      if (w?.county) place = w;
    } catch {}
  }
  state.local.here = { lat: pos.lat, lon: pos.lon, place, at: Date.now() };
  saveLocal(state.local);
  Object.assign(here, { lat: pos.lat, lon: pos.lon, place });
  renderPage(here);
  await loadPage(here);
  sendNotices();
}

// ---- The pins on the pass ---------------------------------------------------------------

let saving = null;
async function saveData() {
  state.data.t = Date.now();
  state.local.data = encodeData(state.data);
  saveLocal(state.local);
  buildPages();
  renderAll();
  sendNotices();
  if (!q.active) return;
  saving = q.write({ payload: encodeData(state.data) }).catch(() => {});
  await saving;
}

function sendNotices() {
  const here = state.local.here;
  schedulePush(q, planNotices({ pins: state.data.pins, brief: state.data.brief, here: here ? { lat: here.lat, lon: here.lon } : null }));
}

// ---- Sheets: a pin, the settings, a day --------------------------------------------------

function sheet(html, cls = '') {
  const d = document.createElement('dialog');
  d.className = `q-sheet wx-sheet ${cls}`;
  d.innerHTML = html;
  d.addEventListener('click', ev => (ev.target === d || ev.target.closest('[data-act="close"]')) && d.close());
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
async function pinSheet(pin = null) {
  if (!pin && state.data.pins.length >= MAX_PINS) return tell({ title: `最多 ${MAX_PINS} 個釘選地點`, body: '先刪掉一個再新增。' });
  const here = state.local.here;
  const draft = pin ? { ...pin } : { id: newPinId(), name: '', days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00', lat: here?.lat, lon: here?.lon, ...(here?.place || {}) };
  const where = () => [draft.county, draft.town, draft.village].filter(Boolean).join(' ') || '尚未選擇';
  const d = sheet(`
    <div class="q-sheet-head"><h2>${pin ? '編輯釘選地點' : '釘選地點'}</h2><button class="q-close" type="button" data-act="close" aria-label="關閉">×</button></div>
    <label class="wx-field"><span>名稱</span><input id="pin-name" maxlength="20" placeholder="例如：學校、家" value="${e(draft.name)}"></label>
    <div class="wx-field"><span>地點</span><b id="pin-where">${e(where())}</b></div>
    <div class="wx-row">
      ${here ? `<button class="q-btn" type="button" data-pin-act="here">📍 用目前位置${here.place?.village ? `（${e(here.place.village)}）` : ''}</button>` : ''}
    </div>
    <label class="wx-field"><span>或搜尋鄉鎮市區</span><input id="pin-q" type="search" placeholder="例如：大安區" autocomplete="off"></label>
    <div id="pin-list" class="wx-list"></div>
    <div class="wx-row wx-home-row"><span>🏠 這是我的家<small>沒有其他行程的時間，就當作在這裡</small></span><button class="wx-switch" type="button" role="switch" data-pin-act="home" aria-checked="${draft.home === true}" aria-label="這是我的家"><i></i></button></div>
    <div class="wx-field"><span>我在這裡的時間（行程用；這時打開 App 也直接顯示這裡）</span>
      <div class="q-chips wx-week">${WEEK.map((w, i) => `<button class="q-chip" type="button" data-day="${i}" aria-pressed="${draft.days.includes(i)}">${w}</button>`).join('')}</div>
      <div class="wx-row"><input id="pin-from" type="time" value="${draft.from}"> 到 <input id="pin-to" type="time" value="${draft.to}"></div>
    </div>
    <div class="wx-row wx-actions">
      ${pin ? '<button class="q-btn wx-danger" type="button" data-pin-act="delete">刪除</button>' : ''}
      <button class="q-btn primary" type="button" data-pin-act="save">儲存</button>
    </div>`);
  const list = d.querySelector('#pin-list');
  const qInput = d.querySelector('#pin-q');
  let places = null;
  qInput.addEventListener('input', async () => {
    const text = qInput.value.trim().replace(/台/g, '臺');
    if (!text) return (list.innerHTML = '');
    places ||= await fetchPlaces().catch(() => []);
    const rows = places.filter(([c, t]) => (c + t).includes(text)).slice(0, 30);
    list.innerHTML = rows.map(([c, t, la, lo]) => `<button class="q-row-btn" type="button" data-place="${e(c)}|${e(t)}|${la}|${lo}">${e(t)}<small>${e(c)}</small></button>`).join('') || '<p class="wx-foot">找不到這個地區</p>';
  });
  d.addEventListener('click', async ev => {
    const day = ev.target.closest('[data-day]');
    if (day) {
      const i = Number(day.dataset.day);
      draft.days = draft.days.includes(i) ? draft.days.filter(x => x !== i) : [...draft.days, i];
      day.setAttribute('aria-pressed', String(draft.days.includes(i)));
      return;
    }
    const place = ev.target.closest('[data-place]');
    if (place) {
      const [c, t, la, lo] = place.dataset.place.split('|');
      Object.assign(draft, { county: c, town: t, village: '', lat: Number(la), lon: Number(lo) });
      d.querySelector('#pin-where').textContent = where();
      list.innerHTML = '';
      qInput.value = '';
      return;
    }
    const act = ev.target.closest('[data-pin-act]')?.dataset.pinAct;
    if (act === 'home') {
      draft.home = !draft.home;
      ev.target.closest('[data-pin-act]').setAttribute('aria-checked', String(draft.home));
      return;
    }
    if (act === 'here' && here) {
      Object.assign(draft, { lat: here.lat, lon: here.lon, county: here.place?.county || '', town: here.place?.town || '', village: here.place?.village || '' });
      d.querySelector('#pin-where').textContent = where();
    }
    if (act === 'delete') {
      if (!(await ask({ title: `刪除「${pin.name}」？`, ok: '刪除', cancel: '取消', danger: true }))) return;
      state.data.pins = state.data.pins.filter(p => p.id !== pin.id);
      state.data.gone[pin.id] = Date.now();
      d.close();
      await saveData();
      goTo(0);
    }
    if (act === 'save') {
      draft.name = d.querySelector('#pin-name').value;
      draft.from = d.querySelector('#pin-from').value || '07:00';
      draft.to = d.querySelector('#pin-to').value || '17:00';
      const clean = cleanPin({ ...draft, t: Date.now() });
      if (!clean) return tell({ title: '請選擇臺灣的地點', body: '用目前位置，或搜尋鄉鎮市區。' });
      // One home at most.
      if (clean.home) state.data.pins = state.data.pins.map(p => (p.id !== clean.id && p.home ? { ...p, home: false, t: Date.now() } : p));
      const at = state.data.pins.findIndex(p => p.id === clean.id);
      if (at >= 0) state.data.pins[at] = clean;
      else state.data.pins.push(clean);
      d.close();
      await saveData();
      goTo(state.pages.findIndex(p => p.key === clean.id));
    }
  });
}

// The settings: the cards' order and which show, the morning brief's time.
const CARD_ICONS = { metrics: '📊', advice: '💡', days: '📆', info: '📋' };
function settingsSheet() {
  const rows = () =>
    state.data.cards
      .map((k, i, all) => {
        const on = !state.data.hidden.includes(k);
        return `<div class="wx-order-row${on ? '' : ' is-off'}">
          <span class="wx-order-name">${CARD_ICONS[k]} ${e(CARDS[k])}</span>
          <button class="q-icon-btn wx-mini" type="button" data-move="${k}" data-by="-1" aria-label="上移${e(CARDS[k])}" ${i ? '' : 'disabled'}>↑</button>
          <button class="q-icon-btn wx-mini" type="button" data-move="${k}" data-by="1" aria-label="下移${e(CARDS[k])}" ${i < all.length - 1 ? '' : 'disabled'}>↓</button>
          <button class="wx-switch" type="button" role="switch" data-show="${k}" aria-checked="${on}" aria-label="顯示${e(CARDS[k])}"><i></i></button>
        </div>`;
      })
      .join('');
  const d = sheet(`
    <div class="q-sheet-head"><h2>設定</h2><button class="q-close" type="button" data-act="close" aria-label="關閉">×</button></div>
    <h3 class="q-sheet-h">卡片順序</h3>
    <p class="wx-foot">最上面的地點和現在天氣固定在頂端；其他卡片可以上下移動，或關掉不顯示。每個地點的頁面都一樣，跟著 Quadra Pass 同步。</p>
    <div class="wx-order" id="card-order">${rows()}</div>
    <button class="q-btn wx-reset" type="button" data-reset="1">恢復預設順序</button>
    <h3 class="q-sheet-h">通知</h3>
    <label class="wx-field"><span>早晨天氣的時間</span><input id="brief-time" type="time" value="${state.data.brief}"></label>
    <p class="wx-foot">早晨天氣和降雨提醒的開關，在右上角的帳戶裡（Quadra Pass 的通知設定）。早晨天氣以那時的釘選地點為準，沒有的話以最後打開本 App 的位置為準。</p>`);
  const redraw = () => (d.querySelector('#card-order').innerHTML = rows());
  d.addEventListener('click', ev => {
    const move = ev.target.closest('[data-move]');
    const show = ev.target.closest('[data-show]');
    const reset = ev.target.closest('[data-reset]');
    if (!move && !show && !reset) return;
    const cards = [...state.data.cards];
    if (move) {
      const i = cards.indexOf(move.dataset.move);
      const j = i + Number(move.dataset.by);
      if (i < 0 || j < 0 || j >= cards.length) return;
      [cards[i], cards[j]] = [cards[j], cards[i]];
      state.data.cards = cards;
    }
    if (show) {
      const k = show.dataset.show;
      state.data.hidden = state.data.hidden.includes(k) ? state.data.hidden.filter(x => x !== k) : [...state.data.hidden, k];
    }
    if (reset) {
      state.data.cards = [...DEFAULT_LAYOUT];
      state.data.hidden = [];
    }
    redraw();
    // Keep the button just pressed under the finger.
    if (move) d.querySelector(`[data-move="${move.dataset.move}"][data-by="${move.dataset.by}"]`)?.focus();
    saveData();
  });
  d.querySelector('#brief-time').addEventListener('change', ev => {
    if (/^\d{2}:\d{2}$/.test(ev.target.value)) {
      state.data.brief = ev.target.value;
      saveData();
    }
  });
}

// A metric's sheet: its big graph, tabs and read-out.
function openMetric(key, kind) {
  const page = pageOf(key);
  const f = page && forecastOf(page);
  if (!f) return;
  const d = sheet('', 'wx-metric-sheet');
  d.dataset.key = key;
  d.redraw = () => {
    const now = Date.now();
    d.innerHTML = metricSheet(kind, f, { now, key, ranges: state.ranges, page });
    state.cols[key] = { ...(state.cols[key] || {}), [kind]: colsFor(kind, f, now, rangeOf(kind, state.ranges)), tz: f.tz };
  };
  d.redraw();
}

function openDay(key, date) {
  const page = pageOf(key);
  const f = page && forecastOf(page);
  if (!f) return;
  const d = sheet('', 'wx-day-sheet');
  const show = when => {
    d.innerHTML = daySheet(f, when, { now: Date.now(), lat: page.lat, lon: page.lon });
    d.scrollTop = 0;
    armScrub(d, f, when);
  };
  d.addEventListener('click', ev => {
    const step = ev.target.closest('[data-dayn]');
    if (step?.dataset.dayn) show(step.dataset.dayn);
  });
  show(date);
}

// The day graph's crosshair, like a stock chart's: a finger (or the mouse)
// on the graph picks the hour under it; the line, the dots on the curves and
// the read-out above follow while it moves.
function armScrub(d, f, date) {
  const plot = d.querySelector('.wx-dayg-plot');
  const svg = plot?.querySelector('svg');
  const read = d.querySelector('.wx-scrub');
  if (!svg || !read) return;
  const hours = (f.hours || []).filter(h => dateOf(h.t, f.tz) === date);
  const aqi = (f.air?.history || []).filter(a => dateOf(a.t, f.tz) === date);
  const n = Number(svg.dataset.n);
  const colW = Number(svg.dataset.col);
  const ty = svg.dataset.ty.split(',');
  const fy = svg.dataset.fy.split(',');
  const cross = svg.querySelector('.g-cross');
  const dotT = svg.querySelector('.g-dot-t');
  const dotF = svg.querySelector('.g-dot-f');
  let shown = -1;
  const put = i => {
    i = Math.max(0, Math.min(n - 1, i));
    if (i === shown) return;
    shown = i;
    const x = String(i * colW + colW / 2);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    for (const [dot, ys] of [[dotT, ty], [dotF, fy]]) {
      dot.setAttribute('cx', ys[i] === '' ? '-99' : x);
      dot.setAttribute('cy', ys[i] || '0');
    }
    const h = hours[i];
    const a = h && aqi.find(x2 => Math.floor(x2.t / 3_600_000) === Math.floor(h.t / 3_600_000));
    read.innerHTML = scrubHtml(h, { tz: f.tz, aqi: a || null });
  };
  // The viewBox runs from -10 to width + 10 (room for the edge labels).
  const at = ev => {
    const r = svg.getBoundingClientRect();
    const u = ((ev.clientX - r.left) / r.width) * (n * colW + 20) - 10;
    return Math.floor(u / colW);
  };
  let down = false;
  plot.addEventListener('pointerdown', ev => {
    down = true;
    plot.setPointerCapture?.(ev.pointerId);
    put(at(ev));
  });
  // Once a frame at most.
  let want = null;
  plot.addEventListener('pointermove', ev => {
    if (!down && ev.pointerType !== 'mouse') return;
    const first = want == null;
    want = at(ev);
    if (first) requestAnimationFrame(() => {
      put(want);
      want = null;
    });
  });
  for (const type of ['pointerup', 'pointercancel']) plot.addEventListener(type, () => (down = false));
  put(Number(plot.dataset.start) || 0);
}

const help = () =>
  tell({
    title: 'Orbit Weather',
    body: '一個答案的天氣：多個來源在背後合成一個數字。',
    points: ['左右滑動整頁，切換我的行程、目前位置和各地點。', '圖上點一下或手指拖曳，看每小時（或每天）的數字；上方的分頁切換 24 小時、48 小時、10 天。', '點「10 天預報」的任一天，看當天的圖；‹ › 換一天。', '把地點設成「家」並設定學校等地點的星期和時間：「我的行程」每小時取你在的城市。', '⚙︎ 設定：調整卡片順序、關掉不需要的卡片。']
  });

// ---- Taps and swipes --------------------------------------------------------------------

document.addEventListener('click', ev => {
  const tab = ev.target.closest('[data-range]');
  if (tab) {
    const [kind, k] = tab.dataset.range.split(':');
    state.ranges[kind] = k;
    try {
      localStorage.setItem('orbit-weather.ranges', JSON.stringify(state.ranges));
    } catch {}
    return document.querySelectorAll('dialog[open]').forEach(d => d.redraw?.());
  }
  const metric = ev.target.closest('[data-metric]');
  if (metric) return openMetric(metric.dataset.page, metric.dataset.metric);
  if (ev.target.closest('.ch')) return;
  const go = ev.target.closest('[data-go]');
  if (go) return goTo(Number(go.dataset.go));
  const stay = ev.target.closest('[data-go-key]');
  if (stay) return goTo(state.pages.findIndex(p => p.key === stay.dataset.goKey));
  const day = ev.target.closest('[data-day][data-page]');
  if (day) return openDay(day.dataset.page, day.dataset.day);
  const act = ev.target.closest('[data-act]')?.dataset.act;
  if (act === 'add-pin') return pinSheet();
  if (act === 'edit-pin') return pinSheet(state.data.pins.find(p => p.id === ev.target.closest('[data-pin]').dataset.pin));
  if (act === 'retry') return loadPage(pageOf(ev.target.closest('[data-page]').dataset.page), { force: true });
});

// A column picked (a tap, a finger dragging, the mouse): the crosshair and
// the dot on it, its numbers above the graph.
function pick(svg, i) {
  if (svg.dataset.sel === String(i)) return;
  svg.dataset.sel = String(i);
  const host = svg.closest('[data-key]');
  const key = host?.dataset.key;
  const kind = svg.dataset.graph;
  const col = state.cols[key]?.[kind]?.[i];
  const out = host?.querySelector(`[data-read="${kind}"]`);
  if (out) {
    out.textContent = readout(kind, col, state.cols[key]?.tz);
    out.classList.add('is-on');
  }
  // The crosshair is HTML over the graph, moved by transform (the GPU's
  // work; redrawing the SVG on every move stutters on a phone).
  const box = svg.parentElement;
  const xh = box.querySelector('.ch-xh');
  const dh = box.querySelector('.ch-dh');
  if (!xh) return;
  const spot = colSpot(svg, i);
  // (An SVG has no offsetLeft: placed against the box's rectangle.)
  const r = svg.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const scale = r.width / CHART_W;
  const x = r.left - b.left + spot.x * scale;
  const y0 = r.top - b.top;
  xh.hidden = false;
  xh.style.height = `${PLOT_BOTTOM * scale - 20 * scale}px`;
  xh.style.transform = `translate(${x}px, ${y0 + 20 * scale}px)`;
  dh.hidden = spot.y == null;
  if (spot.y != null) dh.style.transform = `translate(${x}px, ${y0 + spot.y * scale}px)`;
}
// At most once a frame, however fast the finger moves.
let pending = null;
const pickSoon = (svg, x) => {
  const first = !pending;
  pending = { svg, x };
  if (first) requestAnimationFrame(() => {
    const p = pending;
    pending = null;
    if (p) pick(p.svg, colAt(p.svg, p.x));
  });
};

// Dragging on a graph reads it (the graph only pans up and down, so a
// sideways drag there isn't a page swipe); the mouse just hovers.
let dragging = null;
document.addEventListener('pointerdown', ev => {
  const svg = ev.target.closest?.('svg.ch');
  if (!svg) return;
  dragging = svg;
  svg.setPointerCapture?.(ev.pointerId);
  pickSoon(svg, ev.clientX);
});
document.addEventListener('pointermove', ev => {
  const svg = dragging || (ev.pointerType === 'mouse' ? ev.target.closest?.('svg.ch') : null);
  if (svg) pickSoon(svg, ev.clientX);
});
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, () => (dragging = null));

// The page in view, once a swipe settles.
let settle = 0;
$('pager').addEventListener('scroll', () => {
  if (jumping) return;
  clearTimeout(settle);
  settle = setTimeout(() => {
    const pager = $('pager');
    const i = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
    if (i !== state.index) {
      state.index = i;
      renderDots();
      loadPage(state.pages[i]);
    }
  }, 120);
});
window.addEventListener('resize', () => goTo(state.index));

// Back on screen: fresh again, where the device is now.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.started) return;
  locate();
  loadPage(state.pages[state.index]);
});

// A notice's tap (#pin=<id>) opens that pin.
function openFromHash() {
  const m = /pin=(p[a-z0-9]+)/.exec(location.hash);
  const i = m ? state.pages.findIndex(p => p.key === m[1]) : -1;
  return i >= 0 ? i : null;
}
window.addEventListener('hashchange', () => {
  const i = openFromHash();
  if (i != null) goTo(i);
});

// ---- Start --------------------------------------------------------------------------------

window.__fxStarted = true;
const gated = installGate('weather', 'zh');
watchUpdates({ current: VERSION, key: 'orbitWeather', cachePrefix: 'orbit-weather-', busy: () => Boolean(document.querySelector('dialog[open]')) });
topActions(q, { help, refresh: () => loadPage(state.pages[state.index], { force: true }) });
// The app's own buttons beside the kit's: add a place, the settings.
const extra = document.createElement('button');
extra.className = 'q-icon-btn';
extra.type = 'button';
extra.setAttribute('aria-label', '設定');
extra.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/></svg>';
extra.addEventListener('click', settingsSheet);
$('top-actions').prepend(extra);

async function boot() {
  // This device's copy first (paints at once), then the pass's.
  state.data = decodeData(state.local.data) || emptyData();
  buildPages();
  renderAll();
  const first = await q.start();
  const theirs = decodeData(first?.payload);
  const merged = mergeData(state.data, theirs);
  const changed = encodeData(merged) !== (first?.payload || '');
  state.data = merged;
  state.local.data = encodeData(merged);
  saveLocal(state.local);
  buildPages();
  renderAll();
  // 我的行程 when there are pins (it shows where you are now), else here.
  const start = openFromHash() ?? 0;
  $('loading').hidden = true;
  state.started = true;
  goTo(start);
  if (changed && (merged.pins.length || theirs) && q.active) q.write({ payload: encodeData(merged) }).catch(() => {});
  locate();
  sendNotices();
}
q.on('active', live => live && state.started && q.write({ payload: encodeData(state.data) }).catch(() => {}));
if (!gated) boot();

if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => {});
