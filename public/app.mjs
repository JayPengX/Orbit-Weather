// Orbit Weather: one forecast, one truth, for where you are and the places
// you pin. An Orbit app (the everyday tools, like Orbit Class): the Quadra
// Pass signs in and keeps the pins; the kit draws the loading screen, keeps
// the app current, and sends the notices.

import { quadraSession, topActions, tabBar, installGate, watchUpdates, schedulePush, tell, ask, closeSheet, mayLocate, keepOffline } from '#kit/quadra.mjs';
import { settleSegs } from '#kit/ui.mjs';
import * as kitUI from '#kit/ui.mjs';
import { loadLocal, saveLocal, cellOf, cachedForecast, isFresh, permissionState, getPosition, fetchForecast, fetchWhere, fetchPlaces, FRESH_MS, HIDE_MS, MORE_FIRST_MS, MORE_MS, MORE_TRIES } from './lib/api.mjs';
import { emptyData, encodeData, decodeData, mergeData, cleanPin, newPinId, planNotices, placeAt, scheduleText, MAX_PINS, DEFAULT_LAYOUT, useHolidays } from './lib/pins.mjs';
// Taiwan's holidays (the kit's), before anything is drawn, so a school pin
// is off on a holiday from the first screen (an older kit: none, at once).
const holidays = await Promise.race([import('#kit/holidays.mjs').catch(() => null), new Promise(r => setTimeout(r, 1500, null))]);
if (holidays?.twHoliday) useHolidays(date => Boolean(holidays.twHoliday(date)));
import { nowHtml, weekHtml, placesHtml, placeName, daySheet, infoCard, adviceSheet, colsFor, rangeOf, metricSheet } from './lib/cards.mjs';
import { readout, scrubHtml, colAt, colSpot, CHART_W, PLOT_BOTTOM } from './lib/graph.mjs';
import { escapeHtml as e, dateOf, staleText, hereNote } from './lib/format.mjs';
import { W, en, lang } from './lib/lang.mjs';
import { ICON_DEFS, glyph, placeGlyph, conditionArt } from './lib/icons.mjs';
import { routeForecast } from './lib/plan.mjs';

const $ = id => document.getElementById(id);
const VERSION = document.querySelector('meta[name="build-version"]')?.content || 'dev';
document.documentElement.lang = en ? 'en' : 'zh-Hant';
const q = quadraSession('weather', { lang });

const state = {
  local: loadLocal(),
  data: emptyData(),
  pages: [],
  // The place shown (a page's key) and the tab: 今天, 預報, 地點.
  key: null,
  tab: 'now',
  // 地點 in 編輯: the pins' rows open their sheets.
  editing: false,
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

// ---- Pages: 我的行程, here, then each pin; one shown at a time ---------------------------

function buildPages() {
  const here = state.local.here;
  const old = Object.fromEntries(state.pages.map(p => [p.key, p]));
  state.pages = [
    // 我的行程 first, once there's a pin: the weather where you'll be.
    ...(state.data.pins.length ? [{ key: 'plan', plan: true, pin: null, lat: null, lon: null }] : []),
    { ...(old.here || {}), key: 'here', pin: null, lat: here?.lat ?? old.here?.lat ?? null, lon: here?.lon ?? old.here?.lon ?? null, place: here?.place || old.here?.place || null },
    ...state.data.pins.map(pin => ({ ...(old[pin.id] || {}), key: pin.id, pin, lat: pin.lat, lon: pin.lon, place: { county: pin.county, town: pin.town } }))
  ];
}
const pageOf = key => state.pages.find(p => p.key === key);
// A page's forecast: its cell's; 我的行程's, the places' made one.
// The device off the plan: its place is fresh (half an hour) and over 2 km
// from the pin the plan has you at now. Then the plan takes here for this
// hour and the next (where you actually are), its pins after that.
const OFF_PLAN_KM = 2;
const kmBetween = (a, b) => {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return 6371 * Math.hypot(x, y);
};
function liveRoute(now = Date.now()) {
  const here = state.local.here;
  const pin = placeAt(state.data.pins, now);
  if (!here || here.lat == null || now - (here.at || 0) > 30 * 60_000 || !pin) return null;
  return kmBetween(here, pin) > OFF_PLAN_KM ? { until: Math.floor(now / 3_600_000) * 3_600_000 + 2 * 3_600_000 } : null;
}
// (A copy hours old isn't shown while the new one is on its way: it read
// as today's. Kept for when the read fails, marked old.)
const forecastOf = page => {
  if (page.plan) return routeForecast(state.data.pins, forecastFor, Date.now(), liveRoute());
  const f = page.lat != null ? cachedForecast(state.local, cellOf(page.lat, page.lon))?.f || null : page.ipForecast || null;
  return f && !page.error && Date.now() - (Number(f.at) || 0) > HIDE_MS ? null : f;
};
const forecastFor = key => {
  const page = pageOf(key);
  return page && !page.plan ? forecastOf(page) : null;
};

const current = () => pageOf(state.key) || state.pages[0];

// 我的行程 says where the route has you now (the head, the sky, its row in 地點).
function notePlan(now) {
  const page = state.pages.find(p => p.plan);
  if (!page) return;
  const cur = liveRoute(now) ? null : placeAt(state.data.pins, now);
  page.pin = cur;
  page.place = cur ? { county: cur.county, town: cur.town } : pageOf('here')?.place || null;
}

// ---- Tabs: 今天, 預報, 地點 (the kit's bar; one place shared by all) -------------------------

const TABS = ['now', 'week', 'places'];
const tabs = tabBar({
  tabs: [
    { id: 'now', label: W('今天', 'Today'), icon: '<circle cx="9" cy="8.5" r="3.2"/><path d="M9 2.5v1.2M3 8.5h1.2M4.8 4.3l.9.9M13.2 4.3l-.9.9"/><path d="M8 20.5a4 4 0 0 1-.4-8 5.2 5.2 0 0 1 9.9 1.3 3.4 3.4 0 0 1-.3 6.7z"/>' },
    { id: 'week', label: W('預報', 'Forecast'), icon: 'calendar' },
    { id: 'places', label: W('地點', 'Places'), icon: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>' }
  ],
  // (The address: #tab=week, #pin=<id>, kept by the app.)
  hash: () => null,
  onSelect: id => showTab(id),
  label: W('分頁', 'Tabs')
});
function showTab(id, { top = false, load = true } = {}) {
  state.tab = TABS.includes(id) ? id : 'now';
  if (state.tab !== 'places') state.editing = false;
  tabs.select(state.tab, { top });
  render();
  if (load) loadShown();
}
// A place chosen (地點, a notice's tap): its 今天, from the top.
function choose(key) {
  if (!pageOf(key)) return;
  state.key = key;
  showTab('now', { top: true });
}
// What the tab in view needs: the place's forecast; on 地點, every place's.
function loadShown() {
  if (state.tab !== 'places') return loadPage(current());
  for (const p of state.pages) if (!p.plan) loadPage(p);
}

// ---- Drawing the tab in view ---------------------------------------------------------------

// What a page was drawn from: drawn again only when it changes (or the hour turns).
const pageSig = page =>
  page.plan
    ? `${state.pages.filter(p => !p.plan).map(p => `${forecastOf(p)?.at || 0}${forecastOf(p)?.more ? '+' : ''}`).join()}|${liveRoute() ? 'here' : ''}`
    : `${forecastOf(page)?.at || page.error || 0}${forecastOf(page)?.more ? '+' : ''}|${page.lat ?? ''},${page.lon ?? ''}|${page.place?.town || ''}|${page.note || ''}|${page.askable ? 1 : 0}|${page.error || ''}`;
const viewSig = page => {
  const base = `${state.tab}|${page.key}|${Math.floor(Date.now() / 3_600_000)}|${state.data.t}`;
  return state.tab === 'places' ? `${base}|${state.data.brief}|${state.editing}|${state.pages.map(p => `${p.key}:${p.plan ? '' : pageSig(p)}`).join(';')}` : `${base}|${pageSig(page)}${state.tab === 'week' ? '' : `|${state.pages.map(p => forecastOf(p)?.at || 0).join()}`}`;
};
function render() {
  const page = current();
  if (!page) return;
  const now = Date.now();
  notePlan(now);
  const panel = $(`panel-${state.tab}`);
  // (更新中 on the sky while the place's forecast is asked.)
  panel.classList.toggle('is-loading', Boolean(page.loading));
  const sig = viewSig(page);
  if (panel.dataset.sig === sig) return;
  panel.dataset.sig = sig;
  if (state.tab === 'places') return void ((panel.innerHTML = placesHtml(placeRows(page), { brief: state.data.brief, editing: state.editing && state.data.pins.length > 0 })), kitUI.wireNavTitles?.(panel));
  const opts = { now, cards: state.data.cards, hidden: state.data.hidden, places: placeRows(page) };
  panel.innerHTML = (state.tab === 'week' ? weekHtml : nowHtml)(forecastOf(page), page, opts);
  kitUI.wireNavTitles?.(panel);
}

// 地點's rows: each place's picture and colour, what it is, its temperature now.
const PLACE_COLOR = page => (page.plan ? 'indigo' : page.pin?.home ? 'orange' : page.pin ? 'pink' : 'blue');
function placeRows(shown) {
  return state.pages.map(p => {
    const n = forecastOf(p)?.now;
    const name = placeName(p);
    return {
      key: p.key,
      title: name.title,
      // (A pin's township is on its sky; here, its hours.)
      sub: p.pin && !p.plan ? scheduleText(p.pin) : name.sub,
      temp: n?.temp ?? null,
      art: n ? conditionArt(n.condition?.code, n.condition?.text, n.day ?? true, { size: 28 }) : '',
      on: p === shown,
      pin: p.pin && !p.plan ? p.pin.id : '',
      glyph: placeGlyph(p, { size: 22 }),
      color: PLACE_COLOR(p)
    };
  });
}

// ---- Loading a page's forecast -------------------------------------------------------------

// `naming`: the place's name on its way, drawn with the forecast.
async function loadPage(page, { force = false, naming = null } = {}) {
  if (!page) return;
  // Asked while it's loading (a new position as the old one loads): once more after.
  if (page.loading) return void (page.again = true);
  // The plan needs every place: all asked at once, the plan redrawn as they come.
  if (page.plan) {
    render();
    await Promise.all(state.pages.filter(x => !x.plan).map(p => loadPage(p, { force })));
    return render();
  }
  const cell = page.lat != null ? cellOf(page.lat, page.lon) : null;
  if (!force && (cell ? isFresh(cachedForecast(state.local, cell)) : page.ipForecast && isFresh({ at: page.ipAt, f: page.ipForecast }))) return render();
  page.loading = true;
  render();
  try {
    const token = await q.ensureToken();
    if (!token) throw Object.assign(new Error('signed out'), { status: 401 });
    const { f, rest } = await fetchForecast(page.lat != null ? { lat: page.lat, lon: page.lon } : { auto: true }, token);
    await naming;
    take(page, cell, f);
    // Not the last word yet: the proxy's quick answer (now, two days, the
    // week; `more`: the hours to day 10 and the air forecast follow), or an
    // old copy whose refresh took longer than the proxy waited
    // (`refreshing`). The whole one comes on the same request, drawn the
    // moment it's in.
    clearTimeout(page.retry);
    if (f.more || f.refreshing) follow(page, cell, rest);
    else page.mores = 0;
  } catch (err) {
    page.error = err.status === 429 ? W('請求太頻繁，請稍候再試。', 'Too many requests. Try again shortly.') : W('暫時無法取得天氣，請檢查網路。', 'Can’t get the weather right now. Check your connection.');
  } finally {
    page.loading = false;
    if (page.again) {
      page.again = false;
      setTimeout(() => loadPage(page), 0);
    }
    render();
  }
}

// A page's answer kept (a place's on the device, the network's guess on the page).
function take(page, cell, f) {
  if (cell) state.local.forecasts[cell] = { at: Date.now(), f };
  else {
    // Where the network said: the page takes the forecast's own place.
    // (Each answer's own place: the network's guess moves as you do.)
    page.ipForecast = f;
    page.ipAt = Date.now();
    // (Only until a fix: once the phone has said where it is, that name stands.)
    if (page.lat == null) page.place = f.place || page.place;
  }
  page.error = '';
  saveLocal(state.local);
}
// The whole answer, on the request that brought the first: drawn when it's
// in (unless something newer came meanwhile). When the request ends without
// it, asked again MORE_FIRST_MS later, then every MORE_MS, MORE_TRIES times
// at most.
function follow(page, cell, rest) {
  rest.then(g => {
    if (g && !g.more && !g.refreshing) {
      page.mores = 0;
      const had = cell ? cachedForecast(state.local, cell)?.f : page.ipForecast;
      if ((Number(g.at) || 0) < (Number(had?.at) || 0) || (!cell && page.lat != null)) return;
      take(page, cell, g);
      render();
      return;
    }
    if ((page.mores = (page.mores || 0) + 1) <= MORE_TRIES) page.retry = setTimeout(() => loadPage(page, { force: true }), page.mores === 1 ? MORE_FIRST_MS : MORE_MS);
  });
}

// Where the device is: as precise as it gives, to the township, each time
// the app opens and every 10 minutes while it's open. Asked of the phone
// unprompted once: a phone that would ask again (iOS's 「允許一次」, or
// 「下次詢問」) isn't asked on every open, return and tick (Weather asked again
// and again where Transit asked once); the last place stands, and 定位 on
// the page asks.
const ASKED_KEY = 'orbit-weather.geo.asked';
async function locate({ force = false } = {}) {
  // (The kit's rule, Transit's too.)
  const may = await mayLocate(ASKED_KEY, { force });
  state.permission = may === 'denied' ? 'denied' : await permissionState();
  const here = pageOf('here');
  here.askable = false;
  if (may === 'no') {
    here.askable = true;
    here.note = state.local.here ? W('上次的位置', 'Last location') : W('大約位置', 'Approximate');
    if (!state.local.here) here.lat = here.lon = null;
    render();
    return loadPage(here);
  }
  if (may === 'denied') {
    here.note = state.local.here ? W('定位已關閉，顯示上次的位置', 'Location off · last location') : W('定位已關閉，顯示大約位置', 'Location off · approximate');
    if (!state.local.here) here.lat = here.lon = null;
    return loadPage(here);
  }
  state.locatedAt = Date.now();
  // One at a time (an open, a return and the tick can ask together).
  if (state.locating) return state.locating;
  state.locating = locateNow(here).finally(() => (state.locating = null));
  return state.locating;
}
// Wi-Fi's or the cell network's fix first (under a second, or the phone's
// own from the last two minutes), the forecast asked for it at once; GPS's
// after it, which takes seconds outdoors and many more inside, the page
// again only when it's another cell. (GPS's alone, the forecast waited for
// it: up to 8 s, 14 s with the coarser try after.)
async function locateNow(here) {
  const quick = await getPosition(navigator, { high: false, timeout: 3000, maximumAge: 2 * 60_000 });
  if (quick.error === 'denied') state.permission = 'denied';
  const fine = quick.error === 'denied' ? null : getPosition(navigator, { high: true, timeout: quick.error ? 10_000 : 15_000, maximumAge: 30_000 });
  if (!quick.error) await placeHere(here, quick);
  const pos = fine ? await fine : quick;
  if (!pos.error) {
    // (Within the quick one's cell: only its accuracy is news.)
    if (!quick.error && cellOf(pos.lat, pos.lon) === cellOf(quick.lat, quick.lon)) {
      // (A name that couldn't be read stays said until one is.)
      const note = hereNote(pos.acc, here.nameless && !here.place?.town);
      state.local.here = { ...state.local.here, lat: pos.lat, lon: pos.lon, at: Date.now() };
      saveLocal(state.local);
      Object.assign(here, { lat: pos.lat, lon: pos.lon });
      if (here.note !== note) ((here.note = note), render());
    } else await placeHere(here, pos);
  } else if (quick.error) {
    if (pos.error === 'denied') state.permission = 'denied';
    here.note = state.local.here ? W('無法定位，顯示上次的位置', 'Can’t locate · last location') : W('無法定位，顯示大約位置', 'Can’t locate · approximate');
    if (!state.local.here) here.lat = here.lon = null;
    return loadPage(here);
  }
  sendNotices();
}
// The page at a fix: its forecast and its township's name asked together,
// drawn together (the name used to be waited for before the forecast was asked).
async function placeHere(here, pos) {
  here.note = hereNote(pos.acc, false);
  const was = state.local.here;
  const moved = !was || Math.abs(was.lat - pos.lat) > 0.001 || Math.abs(was.lon - pos.lon) > 0.001;
  let place = was?.place || null;
  // A failed lookup keeps the last place's name only if it's still where you are (within 1 km).
  if (moved && (!was || kmBetween(was, pos) > 1)) place = null;
  state.local.here = { lat: pos.lat, lon: pos.lon, place, at: Date.now() };
  saveLocal(state.local);
  Object.assign(here, { lat: pos.lat, lon: pos.lon, place });
  const naming =
    moved || !place?.town
      ? q
          .ensureToken()
          .then(token => fetchWhere(pos.lat, pos.lon, token))
          .then(w => {
            if (state.local.here?.lat !== pos.lat || state.local.here?.lon !== pos.lon) return;
            if (!w?.county) throw new Error('no name');
            state.local.here.place = here.place = w;
            here.nameless = false;
            here.note = hereNote(pos.acc, false);
            saveLocal(state.local);
          })
          // (No name to be had: said under the title, not left as if it were coming.)
          .catch(() => {
            if (here.place?.town) return;
            here.nameless = true;
            here.note = hereNote(pos.acc, true);
          })
      : null;
  await loadPage(here, { naming });
  // (A forecast already kept for the cell: the name, once it's in, or that it
  // isn't; the note is part of what was drawn, so a lookup that failed while
  // the forecast loaded is drawn too.)
  if (naming) {
    await naming;
    render();
  }
}

// ---- The pins on the pass ---------------------------------------------------------------

// The pins on the pass, kept in step with this device's copy: the pass's
// read and merged in before anything is written over it, whenever it may
// have changed (the kit's pass-sync.mjs; a copy this version can't read is never
// written over).
const keepData = () => {
  state.local.data = encodeData(state.data);
  saveLocal(state.local);
};
// The kit's shared Pass sync (an older kit without it: this device's pins stay on this device).
const passSync = (await import('#kit/pass-sync.mjs').catch(() => null))?.passSync ?? (() => ({ first: async () => {}, watch() {}, sync() {}, push() {}, keep() {}, changed() {} }));
const pass = passSync(q, {
  decode: decodeData,
  encode: () => encodeData(state.data),
  apply: theirs => {
    const was = encodeData(state.data);
    state.data = mergeData(state.data, theirs);
    if (encodeData(state.data) === was) return;
    keepData();
    if (!state.started) return;
    buildPages();
    render();
    sendNotices();
  }
});
async function saveData() {
  state.data.t = Date.now();
  keepData();
  buildPages();
  render();
  sendNotices();
  pass.changed();
  await pass.sync();
}

function sendNotices() {
  const here = state.local.here;
  schedulePush(q, planNotices({ pins: state.data.pins, brief: state.data.brief, here: here ? { lat: here.lat, lon: here.lon } : null }));
}

// ---- Sheets: a pin, the layout, a day, a metric, the advice ----------------------------------

// A sheet is the kit's (title centred, ✕ trailing, Esc and a tap outside close,
// a drag down closes). `html` may start with its own simple head (a title and
// a close button): that becomes the kit's head; a richer head (a tile, tabs)
// or none (filled in later) stays as the content has it.
function sheet(html, cls = '') {
  const box = document.createElement('template');
  box.innerHTML = html;
  const first = box.content.firstElementChild;
  const h2 = first?.classList.contains('q-sheet-head') && first.children.length === 2 && !first.querySelector('h2 *') ? first.querySelector('h2') : null;
  const title = h2 ? h2.textContent : '';
  if (h2) first.remove();
  const k = kitUI.sheet({ title, body: [...box.content.childNodes], cls: `wx-sheet ${cls}`, closeLabel: W('關閉', 'Close') });
  const d = k.el;
  if (!h2) k.head.remove();
  d.addEventListener('click', ev => ev.target.closest('[data-act="close"]') && shut(d));
  return d;
}
// Down to the foot as every sheet in the family goes (the kit's; dragged down, its sheetSwipe).
const shut = d => closeSheet(d);
const WEEK = en ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['日', '一', '二', '三', '四', '五', '六'];
async function pinSheet(pin = null) {
  if (!pin && state.data.pins.length >= MAX_PINS) return tell({ title: W(`最多 ${MAX_PINS} 個釘選地點`, `Up to ${MAX_PINS} pinned places`), body: W('先刪掉一個再新增。', 'Delete one first.') });
  const here = state.local.here;
  const draft = pin ? { ...pin } : { id: newPinId(), name: '', days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00', lat: here?.lat, lon: here?.lon, ...(here?.place || {}) };
  const where = () => [draft.county, draft.town].filter(Boolean).join(' ') || W('尚未選擇', 'Not chosen');
  const d = sheet(`
    <div class="q-sheet-head"><h2>${pin ? W('編輯釘選地點', 'Edit pinned place') : W('釘選地點', 'Pinned place')}</h2><button class="q-close" type="button" data-act="close" aria-label="${W('關閉', 'Close')}">×</button></div>
    <div class="q-list">
      <label class="q-cell"><span class="q-cell-text">${W('名稱', 'Name')}</span><input id="pin-name" class="wx-cell-input" maxlength="20" placeholder="${W('例如：學校、家', 'e.g. School, Home')}" value="${e(draft.name)}"></label>
      <div class="q-cell"><span class="q-cell-text">${W('地點', 'Place')}</span><span class="q-cell-value" id="pin-where">${e(where())}</span></div>
      <div class="q-cell"><span class="q-cell-text"><span>${glyph('home', { size: 16 })} ${W('這是我的家', 'This is home')}</span><small>${W('其他時間都在這裡', 'Any other time')}</small></span><button class="q-switch" type="button" role="switch" data-pin-act="home" aria-checked="${draft.home === true}" aria-label="${W('這是我的家', 'This is home')}"></button></div>
    </div>
    ${here ? `<button class="q-btn tinted block wx-here" type="button" data-pin-act="here">${glyph('locate', { size: 16 })}${W('用目前位置', 'Use current location')}${here.place?.town ? W(`（${e(here.place.town)}）`, ` (${e(here.place.town)})`) : ''}</button>` : ''}
    <h3 class="q-list-head">${W('或搜尋鄉鎮市區', 'Or search a district')}</h3>
    <label class="q-search"><input id="pin-q" type="search" placeholder="${W('例如：大安區', 'e.g. 大安區')}" autocomplete="off" enterkeyhint="search"><button class="q-search-clear" type="button" data-pin-act="clear-q" aria-label="${W('清除', 'Clear')}">✕</button></label>
    <div id="pin-list" class="q-list wx-list"></div>
    <h3 class="q-list-head">${W('我在這裡的時間', 'When I’m here')}</h3>
    <div class="q-list">
      <div class="q-cell"><div class="q-chips wx-week">${WEEK.map((w, i) => `<button class="q-chip" type="button" data-day="${i}" aria-pressed="${draft.days.includes(i)}">${w}</button>`).join('')}</div></div>
      <div class="q-cell"><span class="q-cell-text">${W('從', 'From')}</span><input id="pin-from" class="wx-time" type="time" value="${draft.from}"></div>
      <div class="q-cell"><span class="q-cell-text">${W('到', 'To')}</span><input id="pin-to" class="wx-time" type="time" value="${draft.to}"></div>
    </div>
    <p class="q-list-foot">${W('行程用；這段時間打開 App 也直接顯示這裡。', 'Used by My route; opening the app in these hours shows this place.')}</p>
    <div class="wx-actions">
      ${pin ? `<button class="q-btn danger tinted large" type="button" data-pin-act="delete">${W('刪除', 'Delete')}</button>` : ''}
      <button class="q-btn primary large" type="button" data-pin-act="save">${W('儲存', 'Save')}</button>
    </div>`);
  const list = d.querySelector('#pin-list');
  const qInput = d.querySelector('#pin-q');
  let places = null;
  qInput.addEventListener('input', async () => {
    const text = qInput.value.trim().replace(/台/g, '臺');
    if (!text) return (list.innerHTML = '');
    places ||= await fetchPlaces().catch(() => []);
    const rows = places.filter(([c, t]) => (c + t).includes(text)).slice(0, 30);
    list.innerHTML = rows.map(([c, t, la, lo]) => `<button class="q-cell" type="button" data-place="${e(c)}|${e(t)}|${la}|${lo}"><span class="q-cell-text">${e(t)}</span><span class="q-cell-value">${e(c)}</span></button>`).join('') || (kitUI.emptyHtml?.({ title: W('找不到這個地區', 'No district found') }) ?? `<p class="q-cell wx-none">${W('找不到這個地區', 'No district found')}</p>`);
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
      Object.assign(draft, { county: c, town: t, lat: Number(la), lon: Number(lo) });
      d.querySelector('#pin-where').textContent = where();
      list.innerHTML = '';
      qInput.value = '';
      return;
    }
    const act = ev.target.closest('[data-pin-act]')?.dataset.pinAct;
    if (act === 'clear-q') {
      qInput.value = '';
      list.innerHTML = '';
      return qInput.focus();
    }
    if (act === 'home') {
      draft.home = !draft.home;
      ev.target.closest('[data-pin-act]').setAttribute('aria-checked', String(draft.home));
      return;
    }
    if (act === 'here' && here) {
      Object.assign(draft, { lat: here.lat, lon: here.lon, county: here.place?.county || '', town: here.place?.town || '' });
      d.querySelector('#pin-where').textContent = where();
    }
    if (act === 'delete') {
      if (!(await ask({ title: W(`刪除「${pin.name}」？`, `Delete “${pin.name}”?`), ok: W('刪除', 'Delete'), cancel: W('取消', 'Cancel'), danger: true }))) return;
      state.data.pins = state.data.pins.filter(p => p.id !== pin.id);
      state.data.gone[pin.id] = Date.now();
      d.close();
      await saveData();
    }
    if (act === 'save') {
      draft.name = d.querySelector('#pin-name').value;
      draft.from = d.querySelector('#pin-from').value || '07:00';
      draft.to = d.querySelector('#pin-to').value || '17:00';
      const clean = cleanPin({ ...draft, t: Date.now() });
      if (!clean) return tell({ title: W('請選擇臺灣的地點', 'Pick a place in Taiwan'), body: W('用目前位置，或搜尋鄉鎮市區。', 'Use your location, or search a district.') });
      // One home at most.
      if (clean.home) state.data.pins = state.data.pins.map(p => (p.id !== clean.id && p.home ? { ...p, home: false, t: Date.now() } : p));
      const at = state.data.pins.findIndex(p => p.id === clean.id);
      if (at >= 0) state.data.pins[at] = clean;
      else state.data.pins.push(clean);
      d.close();
      await saveData();
      // A new place: its weather.
      if (at < 0) choose(clean.id);
    }
  });
}

// 版面: the owner's cards, where each now lives, in their order, each shown or
// not (kept on the Pass). 建議 is 今天's; 指標 and the days are 預報's, in this
// order; 更多資訊 is in today's sheet.
const CARD_ROWS = { metrics: ['chart', W('指標', 'Conditions'), W('預報', 'Forecast')], advice: ['bulb', W('建議', 'Advice'), W('今天', 'Today')], days: ['calendar', W('10 天預報', '10-day forecast'), W('預報', 'Forecast')], info: ['list', W('更多資訊', 'Details'), W('今天的詳情', 'Today’s sheet')] };
function layoutSheet() {
  const rows = () =>
    state.data.cards
      .map((k, i, all) => {
        const on = !state.data.hidden.includes(k);
        const [icon, name, where] = CARD_ROWS[k];
        return `<div class="q-cell wx-order-row${on ? '' : ' is-off'}">
          <span class="q-cell-icon" aria-hidden="true">${glyph(icon, { size: 18 })}</span>
          <span class="q-cell-text wx-order-name"><span>${e(name)}</span><small>${e(where)}</small></span>
          <button class="wx-mini" type="button" data-move="${k}" data-by="-1" aria-label="${W('上移', 'Move up ')}${e(name)}" ${i ? '' : 'disabled'}>↑</button>
          <button class="wx-mini" type="button" data-move="${k}" data-by="1" aria-label="${W('下移', 'Move down ')}${e(name)}" ${i < all.length - 1 ? '' : 'disabled'}>↓</button>
          <button class="q-switch" type="button" role="switch" data-show="${k}" aria-checked="${on}" aria-label="${W('顯示', 'Show ')}${e(name)}"></button>
        </div>`;
      })
      .join('');
  const d = sheet(`
    <div class="q-sheet-head"><h2>${W('版面', 'Layout')}</h2><button class="q-close" type="button" data-act="close" aria-label="${W('關閉', 'Close')}">×</button></div>
    <div class="q-list wx-order" id="card-order">${rows()}</div>
    <p class="q-list-foot">${W('每個地點都一樣，跟著 Quadra Pass 同步。', 'The same for every place, synced with Quadra Pass.')}</p>
    <button class="q-btn plain wx-reset" type="button" data-reset="1">${W('恢復預設', 'Reset')}</button>`);
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
}
// The morning brief's time, in 地點 (the notice's own switch is the account's).
document.addEventListener('change', ev => {
  if (ev.target.id !== 'brief-time' || !/^\d{2}:\d{2}$/.test(ev.target.value)) return;
  state.data.brief = ev.target.value;
  saveData();
});

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
    settleSegs(d);
    state.cols[key] = { ...(state.cols[key] || {}), [kind]: colsFor(kind, f, now, rangeOf(kind, state.ranges)), tz: f.tz };
  };
  d.redraw();
}

// 全部: every piece of advice.
function openAdvice(key) {
  const page = pageOf(key);
  const f = page && forecastOf(page);
  if (f) sheet(adviceSheet(f, { now: Date.now() }), 'wx-advice-sheet');
}

function openDay(key, date) {
  const page = pageOf(key);
  const f = page && forecastOf(page);
  if (!f) return;
  const d = sheet('', 'wx-day-sheet');
  const show = when => {
    const now = Date.now();
    // Today's sheet also holds 更多資訊 (not on the move, nor when hidden).
    const info = when === dateOf(now, f.tz) && !page.plan && !state.data.hidden.includes('info') ? infoCard(f, { now, lat: page.lat, lon: page.lon, page }) : '';
    d.innerHTML = daySheet(f, when, { now, lat: page.lat, lon: page.lon }) + info;
    d.scrollTop = 0;
    armScrub(d, f, when);
  };
  let shown = date;
  const step = by => {
    const b = d.querySelector(`.wx-nav[aria-label="${by < 0 ? W('前一天', 'Previous day') : W('後一天', 'Next day')}"]`);
    if (!b?.dataset.dayn) return;
    shown = b.dataset.dayn;
    show(shown);
    d.classList.remove('slide-l', 'slide-r');
    void d.offsetWidth;
    d.classList.add(by < 0 ? 'slide-r' : 'slide-l');
  };
  d.addEventListener('click', ev => {
    const b = ev.target.closest('[data-dayn]');
    if (b?.dataset.dayn) step(b.getAttribute('aria-label') === W('前一天', 'Previous day') ? -1 : 1);
  });
  // A sideways swipe (not on the charts, which read the hours): the next or previous day.
  let sx = null;
  let sy = 0;
  d.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse' || ev.target.closest('.wx-dayg-plot, .q-sheet-head')) return;
    sx = ev.clientX;
    sy = ev.clientY;
  });
  d.addEventListener('pointerup', ev => {
    if (sx == null) return;
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
  d.addEventListener('pointercancel', () => (sx = null));
  show(date);
}

// The day sheet's crosshair, like a stock chart's: only while a finger (or
// the mouse) is on the charts; the read-out above follows it, and goes back
// to the day's summary when it lifts.
function armScrub(d, f, date) {
  const plot = d.querySelector('.wx-dayg-plot');
  const read = d.querySelector('.wx-scrub');
  if (!plot || !read) return;
  const summary = read.innerHTML;
  const hours = (f.hours || []).filter(h => dateOf(h.t, f.tz) === date);
  const temp = plot.querySelector('svg.ch-daytemp');
  const xh = plot.querySelector('.ch-xh');
  const dh = plot.querySelector('.ch-dh');
  const svgs = [...plot.querySelectorAll('svg.ch')];
  let shown = -1;
  const put = i => {
    if (i === shown) return;
    shown = i;
    read.innerHTML = scrubHtml(hours[i], { tz: f.tz });
    const b = plot.getBoundingClientRect();
    const r = temp.getBoundingClientRect();
    const last = svgs[svgs.length - 1].getBoundingClientRect();
    const scale = r.width / CHART_W;
    const spot = colSpot(temp, i);
    const x = r.left - b.left + spot.x * scale;
    xh.hidden = false;
    xh.style.height = `${last.bottom - r.top - 24 * scale}px`;
    xh.style.transform = `translate(${x}px, ${r.top - b.top + 20 * scale}px)`;
    dh.hidden = spot.y == null;
    if (spot.y != null) dh.style.transform = `translate(${x}px, ${r.top - b.top + spot.y * scale}px)`;
  };
  const hide = () => {
    shown = -1;
    xh.hidden = true;
    dh.hidden = true;
    read.innerHTML = summary;
  };
  let down = false;
  let want = null;
  const soon = x => {
    const first = want == null;
    want = x;
    if (first) requestAnimationFrame(() => {
      if (want != null && (down || hover)) put(colAt(temp, want));
      want = null;
    });
  };
  let hover = false;
  plot.addEventListener('pointerdown', ev => {
    down = true;
    plot.setPointerCapture?.(ev.pointerId);
    soon(ev.clientX);
  });
  plot.addEventListener('pointermove', ev => {
    hover = ev.pointerType === 'mouse';
    if (down || hover) soon(ev.clientX);
  });
  for (const type of ['pointerup', 'pointercancel']) plot.addEventListener(type, ev => {
    down = false;
    if (ev.pointerType !== 'mouse') hide();
  });
  plot.addEventListener('pointerleave', ev => {
    if (ev.pointerType === 'mouse' && !down) {
      hover = false;
      hide();
    }
  });
}

// ---- Taps --------------------------------------------------------------------------------

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
  // 定位: where the phone is, asked now (it was left on the last place).
  if (ev.target.closest('[data-locate]')) return void (ev.stopPropagation(), locate({ force: true }));
  const metric = ev.target.closest('[data-metric]');
  if (metric) return openMetric(metric.dataset.page, metric.dataset.metric);
  if (ev.target.closest('.ch')) return;
  // The old-copy chip on the sky: asked again now (not today's sheet).
  const stale = ev.target.closest('.wx-stale');
  if (stale) return void (ev.stopPropagation(), loadPage(pageOf(stale.dataset.page), { force: true }));
  const act = ev.target.closest('[data-act]')?.dataset.act;
  if (act === 'add-pin') return pinSheet();
  if (act === 'edit-pin') return pinSheet(state.data.pins.find(p => p.id === ev.target.closest('[data-pin]').dataset.pin));
  if (act === 'retry') return loadPage(pageOf(ev.target.closest('[data-page]').dataset.page), { force: true });
  if (act === 'places') return showTab('places');
  if (act === 'edit-places') return void ((state.editing = !state.editing), render());
  if (act === 'advice') return openAdvice(ev.target.closest('[data-page]').dataset.page);
  if (act === 'layout') return layoutSheet();
  const go = ev.target.closest('[data-go-key]');
  if (go) return choose(go.dataset.goKey);
  const day = ev.target.closest('[data-day][data-page]');
  if (day) return openDay(day.dataset.page, day.dataset.day);
});

// The sky and a place's row are role="button": Enter or space opens them too.
document.addEventListener('keydown', ev => {
  if ((ev.key !== 'Enter' && ev.key !== ' ') || !ev.target.matches?.('.wx-hero[data-day], [data-go-key], .q-panel[data-metric]')) return;
  ev.preventDefault();
  if (ev.target.dataset.metric) openMetric(ev.target.dataset.page, ev.target.dataset.metric);
  else if (ev.target.dataset.goKey) choose(ev.target.dataset.goKey);
  else openDay(ev.target.dataset.page, ev.target.dataset.day);
});

// While the app is on screen: every minute the 「更新於」 times move on, the
// tab is redrawn when the hour turns, and what it shows is asked again once
// its forecast is FRESH_MS old (loadPage does nothing before).
function tick() {
  if (document.visibilityState !== 'visible' || !state.started) return;
  const now = Date.now();
  for (const el of document.querySelectorAll('.wx-stale-age[data-at]')) el.textContent = staleText(Number(el.dataset.at), now);
  render();
  loadShown();
  // Left open for hours, carried about: where you are, again every 10 minutes.
  if (now - (state.locatedAt || 0) > 10 * 60_000) locate();
}
setInterval(tick, 60_000);

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
// A finger lifted (or the mouse gone): the crosshair goes; the read-out stays.
const unpick = svg => {
  if (!svg) return;
  delete svg.dataset.sel;
  svg.parentElement.querySelector('.ch-xh')?.setAttribute('hidden', '');
  svg.parentElement.querySelector('.ch-dh')?.setAttribute('hidden', '');
};
for (const type of ['pointerup', 'pointercancel'])
  document.addEventListener(type, ev => {
    if (dragging && ev.pointerType !== 'mouse') unpick(dragging);
    dragging = null;
  });
document.addEventListener('pointerout', ev => {
  if (ev.pointerType === 'mouse' && ev.target.matches?.('svg.ch') && !ev.target.contains(ev.relatedTarget)) unpick(ev.target);
});

// Back on screen: fresh again, where the device is now.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.started) return;
  locate();
  loadShown();
});

// The address: a notice's tap (#pin=<id>) opens that pin; #tab=week or
// #tab=places a tab.
const hashPin = () => {
  const m = /pin=(p[a-z0-9]+)/.exec(location.hash);
  return m && pageOf(m[1]) ? m[1] : null;
};
const hashTab = () => /tab=(week|places)/.exec(location.hash)?.[1] || null;
window.addEventListener('hashchange', () => {
  const key = hashPin();
  if (key) return choose(key);
  if (hashTab()) showTab(hashTab());
});

// ---- Start --------------------------------------------------------------------------------

window.__fxStarted = true;
document.body.insertAdjacentHTML('afterbegin', ICON_DEFS);
const gated = installGate('weather', 'zh');
watchUpdates({ current: VERSION, key: 'orbitWeather', cachePrefix: 'orbit-weather-', busy: () => Boolean(document.querySelector('dialog[open]')) });
topActions(q, { refresh: () => (state.tab === 'places' ? state.pages.filter(p => !p.plan).forEach(p => loadPage(p, { force: true })) : loadPage(current(), { force: true })) });

async function boot() {
  // This device's copy first (paints at once), then the pass's.
  state.data = decodeData(state.local.data) || emptyData();
  buildPages();
  // 我的行程 when there are pins (it shows where you are now), else here; a
  // notice's pin; the tab the address names.
  state.key = hashPin() ?? state.pages[0].key;
  state.tab = hashTab() ?? 'now';
  // A phone that has opened Weather before: its last forecast up at once and
  // the phone asked where it is beside the sign-in, not after it (the sign-in's
  // round trip, then the fix, then the forecast, one after another, was the
  // seconds before the weather now). A first opening waits for the sign-in
  // (no location prompt over the gate).
  const used = Boolean(state.local.data || state.local.here);
  const show = () => {
    if (state.started) return;
    $('loading').hidden = true;
    state.started = true;
    showTab(state.tab, { load: false });
  };
  if (used) {
    show();
    locate();
  }
  const first = await q.start();
  // The pass's pins merged in; this device's go up where the pass lacks them.
  await pass.first(first, { local: Boolean(state.data.pins.length || state.data.t) });
  keepData();
  buildPages();
  // (The pass's pins in: a notice's pin, or 我的行程, can be named now.)
  if (!state.started) state.key = hashPin() ?? state.pages[0].key;
  render();
  // A first opening: the loading screen lifts when the first place's forecast
  // is in (or after 4 s), not onto blank cards.
  if (!used) await Promise.race([locate().catch(() => {}), new Promise(r => setTimeout(r, 4000))]);
  show();
  pass.watch();
  pass.sync();
  // (Already on its way when it was asked beside the sign-in.)
  if (used) loadShown();
  sendNotices();
}
if (!gated) boot();

// Opens without a connection: the kit registers the worker and has it keep every file loaded.
keepOffline();
