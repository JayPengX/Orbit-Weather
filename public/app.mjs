// Orbit Weather: one forecast, one truth, for where you are.

import { loadState, saveState, permissionState, chooseSource, getPosition, isFresh, cellOf, fetchForecast, fetchPlaces, placeName } from './lib/api.mjs';
import { theme, escapeHtml as e } from './lib/format.mjs';
import { todayCard, curveCard, airCard, daysCard, sunCard, extrasCard } from './lib/view.mjs';

const main = document.getElementById('main');
const sheet = document.getElementById('sheet');
let state = loadState(localStorage);
let ui = { selected: -1, openDay: null, note: '', busy: false, error: '' };
let permission = 'unknown';

const save = () => saveState(localStorage, state);

// Where the forecast is for (lat / lon), when the server didn't place it.
const coords = () => (state.pick ? state.pick : state.forecast ? { lat: state.forecast.lat, lon: state.forecast.lon } : {});

function render() {
  const f = state.forecast;
  const now = Date.now();
  document.documentElement.dataset.sky = f ? theme(f.now?.condition, f.now?.day ?? true) : 'clear';
  if (!f) {
    main.innerHTML = ui.error
      ? `<section class="card empty"><p>${e(ui.error)}</p><button class="btn" data-act="refresh">再試一次</button> <button class="btn ghost" data-act="pick">選擇地區</button></section>`
      : `<section class="card empty"><div class="spinner"></div><p>正在取得天氣…</p></section>`;
    return;
  }
  const scroller = main.querySelector('[data-scroll="curve"]');
  const keep = scroller ? scroller.scrollLeft : 0;
  const { lat, lon } = coords();
  main.innerHTML = [
    todayCard(f, { place: placeName(f, state), now, note: ui.note }),
    curveCard(f, { now, lat, lon, selected: ui.selected }),
    daysCard(f, { now, open: ui.openDay }),
    airCard(f),
    sunCard(f, { now, lat, lon }),
    extrasCard(f)
  ].join('');
  const s2 = main.querySelector('[data-scroll="curve"]');
  if (s2) s2.scrollLeft = keep;
  document.body.classList.toggle('busy', ui.busy);
}

// The note under the place: how it was found, and the way to better.
function noteFor(how, why) {
  if (how === 'ip') {
    if (permission === 'denied') return '定位權限已關閉，顯示大約位置 · <button class="link" data-act="pick">選擇地區</button>';
    return `${why === 'timeout' ? '定位逾時，' : ''}依網路的大約位置 · <button class="link" data-act="gps">使用精確位置</button>`;
  }
  return '';
}

async function load(where, how, cell) {
  ui.busy = true;
  render();
  try {
    const f = await fetchForecast(where);
    state = { ...state, forecast: f, fetchedAt: Date.now(), cell: cell || cellOf(f.lat, f.lon), how };
    save();
    ui.error = '';
  } catch (err) {
    ui.error = err.status === 429 ? '請求太頻繁，請稍候再試。' : '暫時無法取得天氣，請檢查網路。';
    if (state.forecast) ui.note = (ui.note ? ui.note + '<br>' : '') + e(ui.error);
  } finally {
    ui.busy = false;
    render();
  }
}

// Where are we, then the forecast for there (unless the stored one is it).
async function run({ force = false } = {}) {
  permission = await permissionState(navigator);
  const src = chooseSource({ pick: state.pick, permission, wantGps: state.wantGps });
  const now = Date.now();
  if (src === 'pick') {
    ui.note = '';
    const cell = cellOf(state.pick.lat, state.pick.lon);
    if (force || !isFresh(state, cell, now)) await load({ lat: state.pick.lat, lon: state.pick.lon }, 'pick', cell);
    return;
  }
  if (src === 'gps') {
    const pos = await getPosition(navigator);
    if (!pos.error) {
      ui.note = '';
      const cell = cellOf(pos.lat, pos.lon);
      if (force || !isFresh(state, cell, now)) await load(pos, 'gps', cell);
      else render();
      return;
    }
    if (pos.error === 'denied') {
      permission = 'denied';
      state.wantGps = false;
      save();
    }
    ui.note = noteFor('ip', pos.error);
  } else ui.note = noteFor('ip');
  // By IP: the stored forecast stands if it was found this way and is fresh.
  if (!force && state.how === 'ip' && state.forecast && now - (state.fetchedAt || 0) < 15 * 60_000) return render();
  await load({ auto: true }, 'ip');
}

// ---- The place picker ------------------------------------------------------------

async function openPicker() {
  sheet.hidden = false;
  sheet.innerHTML = `<div class="sheet-body card"><div class="sheet-head"><h2>選擇地區</h2><button class="link" data-act="close">完成</button></div>
    <button class="btn wide" data-act="here">📍 使用目前位置</button>
    <input id="q" type="search" placeholder="搜尋鄉鎮市區，例如：信義區" autocomplete="off">
    <div id="list" class="list"><div class="dim">載入中…</div></div></div>`;
  const input = sheet.querySelector('#q');
  if (!state.places) {
    try {
      state.places = await fetchPlaces();
      save();
    } catch {
      sheet.querySelector('#list').innerHTML = '<div class="dim">無法載入地區清單</div>';
      return;
    }
  }
  const draw = () => {
    const q = input.value.trim().replace(/台/g, '臺');
    const rows = state.places.filter(([c, t]) => !q || (c + t).includes(q)).slice(0, 120);
    let county = '';
    sheet.querySelector('#list').innerHTML =
      rows
        .map(([c, t, la, lo]) => {
          const head = c !== county ? `<div class="county">${e((county = c))}</div>` : '';
          return `${head}<button class="row" data-act="choose" data-c="${e(c)}" data-t="${e(t)}" data-lat="${la}" data-lon="${lo}">${e(t)}</button>`;
        })
        .join('') || '<div class="dim">找不到這個地區</div>';
  };
  input.addEventListener('input', draw);
  draw();
}
const closePicker = () => {
  sheet.hidden = true;
  sheet.innerHTML = '';
};

// ---- Taps --------------------------------------------------------------------------

document.addEventListener('click', async ev => {
  const hit = ev.target.closest('.hit');
  if (hit) {
    ui.selected = Number(hit.dataset.i);
    return render();
  }
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'pick') return openPicker();
  if (act === 'close') return closePicker();
  if (act === 'refresh') return run({ force: true });
  if (act === 'day') {
    ui.openDay = ui.openDay === el.dataset.date ? null : el.dataset.date;
    return render();
  }
  if (act === 'gps' || act === 'here') {
    // Asking only on a tap: the browser shows its prompt then.
    closePicker();
    state.pick = null;
    state.wantGps = true;
    save();
    ui.note = '定位中…';
    render();
    return run({ force: true });
  }
  if (act === 'choose') {
    state.pick = { county: el.dataset.c, town: el.dataset.t, lat: Number(el.dataset.lat), lon: Number(el.dataset.lon) };
    save();
    closePicker();
    ui.selected = -1;
    return run();
  }
});
sheet.addEventListener('click', ev => {
  if (ev.target === sheet) closePicker();
});

// Back in front after a while: fresh again if it's old.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') run();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

render();
run();
