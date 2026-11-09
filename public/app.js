// Garage Finder — customer frontend (read-only).
// API base comes from API_BASE_URL in .env (served by /config.js); falls back to the same server.
const API = (window.APP_CONFIG?.apiBaseUrl || "/api").replace(/\/$/, "");
const DEFAULT_CENTER = [28.6139, 77.209]; // New Delhi

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(path) {
  const res = await fetch(API + path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 2800);
}

const state = { services: [], origin: DEFAULT_CENTER, originLabel: "New Delhi", results: [] };

// ---------- Service area: Delhi ----------
// Simplified NCT of Delhi boundary as [lng, lat] pairs (from OpenStreetMap, © OSM contributors).
const DELHI_BOUNDARY = [[76.8394,28.5825],[76.8459,28.55],[76.8644,28.5437],[76.8769,28.5249],[76.8871,28.5203],[76.8805,28.5056],[76.8854,28.5014],[76.9069,28.5138],[76.9209,28.5069],[76.935,28.511],[76.9528,28.5053],[76.9784,28.5213],[76.9909,28.5136],[76.9968,28.5197],[77.0101,28.5147],[77.017,28.5211],[77.0017,28.5335],[77.0135,28.5405],[77.0434,28.5252],[77.0462,28.5166],[77.0672,28.5119],[77.0723,28.5203],[77.0804,28.518],[77.1195,28.4951],[77.1125,28.4732],[77.1277,28.4428],[77.1628,28.4285],[77.1715,28.4062],[77.2179,28.4102],[77.25,28.425],[77.2459,28.4544],[77.2331,28.4585],[77.2434,28.4788],[77.2902,28.4965],[77.3141,28.4834],[77.3276,28.4898],[77.3453,28.5135],[77.2998,28.5563],[77.2929,28.5762],[77.3134,28.5965],[77.3412,28.6051],[77.3404,28.6236],[77.3168,28.6377],[77.3252,28.6779],[77.333,28.6816],[77.3237,28.6987],[77.3311,28.7132],[77.2913,28.7064],[77.2863,28.7144],[77.2909,28.7227],[77.2757,28.7356],[77.2558,28.7385],[77.2587,28.7526],[77.2381,28.7592],[77.2329,28.775],[77.221,28.7792],[77.228,28.7846],[77.2073,28.7867],[77.2,28.797],[77.2021,28.8136],[77.2187,28.8108],[77.2237,28.8223],[77.2142,28.8558],[77.1752,28.8585],[77.158,28.8368],[77.1453,28.8381],[77.1402,28.8617],[77.1219,28.858],[77.0826,28.8834],[77.0747,28.8672],[77.0583,28.868],[77.0402,28.8318],[77.0234,28.8391],[76.9944,28.8396],[76.9803,28.8215],[76.9658,28.8277],[76.9617,28.8149],[76.9492,28.8161],[76.9419,28.7987],[76.954,28.7903],[76.9483,28.7798],[76.9557,28.7677],[76.9444,28.7539],[76.9588,28.7428],[76.9598,28.7299],[76.9481,28.7125],[76.968,28.6992],[76.9545,28.6696],[76.9374,28.6702],[76.9245,28.6496],[76.9444,28.6331],[76.9424,28.6272],[76.9353,28.6184],[76.9191,28.6315],[76.9065,28.6236],[76.8894,28.6318],[76.8646,28.5855],[76.8394,28.5825]];
// Ray-casting point-in-polygon test.
function inDelhi([lat, lng]) {
  let inside = false;
  for (let i = 0, j = DELHI_BOUNDARY.length - 1; i < DELHI_BOUNDARY.length; j = i++) {
    const [xi, yi] = DELHI_BOUNDARY[i];
    const [xj, yj] = DELHI_BOUNDARY[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Popular Delhi areas offered as suggestions (first 8 also shown as quick chips).
const POPULAR_AREAS = [
  ["Connaught Place", 28.6315, 77.2167],
  ["Saket", 28.5245, 77.2066],
  ["Karol Bagh", 28.6519, 77.1909],
  ["Lajpat Nagar", 28.5677, 77.2433],
  ["Dwarka", 28.5921, 77.046],
  ["Rohini", 28.7495, 77.0565],
  ["Janakpuri", 28.6219, 77.0878],
  ["Vasant Kunj", 28.5293, 77.153],
  ["Mayur Vihar", 28.6077, 77.294],
  ["Pitampura", 28.699, 77.1384],
  ["Hauz Khas", 28.5494, 77.2001],
  ["Greater Kailash", 28.5482, 77.2347],
  ["Chandni Chowk", 28.6506, 77.2303],
  ["Rajouri Garden", 28.6415, 77.1209],
  ["Nehru Place", 28.5491, 77.2533],
  ["Laxmi Nagar", 28.6304, 77.2777],
  ["Preet Vihar", 28.6419, 77.295],
  ["Kalkaji", 28.539, 77.2593],
  ["Punjabi Bagh", 28.6683, 77.125],
  ["Model Town", 28.7158, 77.191],
  ["Okhla", 28.5355, 77.2732],
  ["Vasant Vihar", 28.5603, 77.1601],
  ["Defence Colony", 28.5714, 77.232],
  ["Paschim Vihar", 28.6688, 77.1018],
  ["Shahdara", 28.6735, 77.2896],
  ["Uttam Nagar", 28.6219, 77.0596],
  ["Malviya Nagar", 28.5355, 77.2109],
  ["Patel Nagar", 28.6505, 77.17],
  ["Kamla Nagar", 28.6812, 77.205],
  ["Mukherjee Nagar", 28.7068, 77.2069],
  ["New Delhi", 28.6139, 77.209],
  ["Delhi", 28.6139, 77.209],
].map(([name, lat, lng]) => ({ name, lat, lng }));

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function matchPopular(text, max = 8) {
  const q = norm(text);
  if (!q) return POPULAR_AREAS.slice(0, max);
  const starts = POPULAR_AREAS.filter((a) => norm(a.name).startsWith(q));
  const contains = POPULAR_AREAS.filter((a) => !starts.includes(a) && norm(a.name).includes(q));
  return [...starts, ...contains].slice(0, max);
}

// Free-text lookup via OpenStreetMap Nominatim (used only when no popular area matches).
// Searches within India only (a bare number like 141001 otherwise matches postcodes in Russia/China).
// 6-digit input is treated as an Indian PIN code.
const isPincode = (text) => /^[1-9]\d{5}$/.test(text.replace(/\s+/g, ""));
async function geocode(text) {
  const pin = text.replace(/\s+/g, "");
  const qs = new URLSearchParams({ format: "json", limit: "1", addressdetails: "1", countrycodes: "in" });
  if (isPincode(pin)) qs.set("postalcode", pin);
  else qs.set("q", text);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Location lookup failed");
  const [hit] = await res.json();
  if (!hit) return null;
  // Human-readable place, e.g. "Ludhiana, Punjab" or "Punjab".
  const a = hit.address || {};
  const local = a.city || a.town || a.village || a.state_district || a.county || a.city_district || a.suburb;
  const place = [...new Set([local, a.state].filter(Boolean))].join(", ") || hit.display_name.split(",")[0];
  return { lat: Number(hit.lat), lng: Number(hit.lon), place };
}

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => showView(tab.dataset.view)),
);
function showView(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "find") setTimeout(() => map.invalidateSize(), 0);
  if (name === "garages") loadGarages();
  if (name === "services") loadServices();
}

// ---------- Map ----------
const map = L.map("map").setView(DEFAULT_CENTER, 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const markers = L.layerGroup().addTo(map);
let originMarker, radiusCircle;

map.on("click", (e) => {
  setOrigin([e.latlng.lat, e.latlng.lng], "Pinned location");
  search();
});

function drawOrigin(radiusKm) {
  originMarker?.remove();
  radiusCircle?.remove();
  originMarker = L.marker(state.origin, {
    icon: L.divIcon({ className: "", html: '<div class="you-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
    zIndexOffset: 1000,
  }).addTo(map).bindTooltip("Search point");
  radiusCircle = L.circle(state.origin, {
    radius: radiusKm * 1000,
    color: "#e8590c",
    weight: 1,
    fillOpacity: 0.06,
  }).addTo(map);
}

// ---------- Service checkboxes ----------
async function loadServiceList() {
  state.services = await api("/services");
}

function renderServiceFilter() {
  $("#f-services").innerHTML = state.services.length
    ? state.services
        .map((s) => `<label class="ms-opt"><input type="checkbox" data-svc="${s.id}" /> ${esc(s.name)}</label>`)
        .join("")
    : '<div class="ms-loading">No services available</div>';
}

const serviceBoxes = () => [...document.querySelectorAll("#f-services [data-svc]")];
const selectedServiceIds = () => serviceBoxes().filter((cb) => cb.checked).map((cb) => Number(cb.dataset.svc));

function updateServiceSummary() {
  const ids = selectedServiceIds();
  const names = state.services.filter((s) => ids.includes(s.id)).map((s) => s.name);
  $("#svc-summary").textContent =
    names.length === 0 ? "All services" : names.length <= 2 ? names.join(", ") : `${names.length} services selected`;
}

// Dropdown open/close
const svcToggle = $("#svc-toggle");
const svcPanel = $("#svc-panel");
function setPanel(open) {
  svcPanel.hidden = !open;
  svcToggle.setAttribute("aria-expanded", String(open));
}
svcToggle.addEventListener("click", () => setPanel(svcPanel.hidden));
$("#svc-done").addEventListener("click", () => {
  setPanel(false);
  svcToggle.focus();
});
document.addEventListener("click", (e) => {
  if (!svcPanel.hidden && !e.target.closest("#svc-select")) setPanel(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !svcPanel.hidden) {
    setPanel(false);
    svcToggle.focus();
  }
});

// "All services" and individual services are mutually exclusive.
let filterTimer;
svcPanel.addEventListener("change", (e) => {
  const all = $("#f-all");
  if (e.target === all) {
    if (all.checked) serviceBoxes().forEach((cb) => (cb.checked = false));
    else if (!selectedServiceIds().length) all.checked = true; // need something selected
  } else {
    all.checked = selectedServiceIds().length === 0;
  }
  updateServiceSummary();
  clearTimeout(filterTimer);
  filterTimer = setTimeout(search, 350); // let quick multi-clicks settle into one search
});

// ---------- Loaders ----------
const skeletonCards = (n) =>
  Array.from({ length: n }, () =>
    `<li class="result skeleton" aria-hidden="true"><div class="sk sk-title"></div><div class="sk sk-line"></div><div class="sk sk-chips"></div></li>`,
  ).join("");
const loadingBlock = (text) => `<div class="loading-block"><span class="spinner"></span> ${esc(text)}</div>`;

function setButtonLoading(btn, loading, text) {
  if (loading) {
    btn.dataset.label ??= btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>${esc(text)}`;
    btn.disabled = true;
  } else {
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    delete btn.dataset.label;
    btn.disabled = false;
  }
}

// ---------- Find ----------
let searchSeq = 0;
async function search() {
  const radiusKm = Number($("#f-radius").value);
  const ids = selectedServiceIds();
  const [lat, lng] = state.origin;
  const qs = new URLSearchParams({ lat, lng, radiusKm, limit: 50 });
  if (ids.length) qs.set("serviceIds", ids.join(","));

  const seq = ++searchSeq; // ignore responses from older, superseded searches
  drawOrigin(radiusKm);
  map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
  markers.clearLayers();

  // Outside Delhi → we don't operate there yet.
  if (!inDelhi(state.origin)) {
    state.results = [];
    $("#map-loader").hidden = true;
    showComingSoon(state.placeLabel || state.originLabel);
    return;
  }

  $("#results").innerHTML = skeletonCards(3);
  $("#results-count").textContent = "Searching…";
  $("#map-loader").hidden = false;
  setButtonLoading($("#f-search"), true, "Searching");
  try {
    const results = await api(`/garages/nearby?${qs}`);
    if (seq !== searchSeq) return;
    state.results = results;
    renderResults(new Set(ids));
  } catch (err) {
    if (seq !== searchSeq) return;
    $("#results").innerHTML = '<li class="empty">Couldn\'t load garages. Please try again.</li>';
    $("#results-count").textContent = "";
    toast(err.message, true);
  } finally {
    if (seq === searchSeq) {
      $("#map-loader").hidden = true;
      setButtonLoading($("#f-search"), false);
    }
  }
}

function serviceChips(services, highlight = new Set()) {
  if (!services?.length) return '<span class="muted">No services listed</span>';
  return services
    .map(
      (s) =>
        `<span class="chip${highlight.has(s.id) ? " hl" : ""}">${esc(s.name)} · <b>${s.durationMinutes} min</b></span>`,
    )
    .join("");
}

function renderResults(highlight) {
  const list = $("#results");
  markers.clearLayers();
  const n = state.results.length;
  $("#results-count").textContent = `${n} found`;

  if (!n) {
    list.innerHTML = '<li class="empty">No garages in this area.<br/>Try a larger radius or fewer services.</li>';
    return;
  }

  list.innerHTML = state.results
    .map(
      (g, i) => `
      <li class="result" data-i="${i}">
        <div class="result-top">
          <h3>${esc(g.name)}</h3>
          <span class="distance">${g.distanceKm.toFixed(1)} km</span>
        </div>
        <div class="meta">
          ${esc(g.address || "")}${g.phone ? ` · ${esc(g.phone)}` : ""}
        </div>
        <div class="chips">${serviceChips(g.services, highlight)}</div>
      </li>`,
    )
    .join("");

  state.results.forEach((g, i) => {
    const m = L.marker([g.lat, g.lng])
      .bindPopup(`<b>${esc(g.name)}</b><br/>${esc(g.address || "")}<br/>${g.distanceKm.toFixed(1)} km away`)
      .on("click", () => selectResult(i, false));
    m._idx = i;
    markers.addLayer(m);
  });
}

function selectResult(i, pan = true) {
  document.querySelectorAll(".result").forEach((el) => el.classList.toggle("active", Number(el.dataset.i) === i));
  document.querySelector(`.result[data-i="${i}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (pan) {
    const g = state.results[i];
    map.setView([g.lat, g.lng], Math.max(map.getZoom(), 14));
    markers.eachLayer((m) => m._idx === i && m.openPopup());
  }
}

$("#results").addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const li = e.target.closest(".result");
  if (li) selectResult(Number(li.dataset.i));
});
$("#f-search").addEventListener("click", async () => {
  // If the user typed something new, resolve it first.
  const text = locInput.value.trim();
  if (text && text !== state.originLabel) await resolveTyped(text);
  else search();
});
$("#f-radius").addEventListener("change", search);
$("#f-locate").addEventListener("click", () => {
  if (!navigator.geolocation) return toast("Geolocation not supported", true);
  const btn = $("#f-locate");
  setButtonLoading(btn, true, "");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setButtonLoading(btn, false);
      setOrigin([pos.coords.latitude, pos.coords.longitude], "My location");
      search();
    },
    () => {
      setButtonLoading(btn, false);
      toast("Couldn't get your location — click the map instead", true);
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

// ---------- Coming soon (outside Delhi / unknown place) ----------
function showComingSoon(place, notFound = false) {
  $("#results-count").textContent = "0 found";
  $("#results").innerHTML = `
    <li class="coming-soon">
      <div class="cs-icon">🚧</div>
      <h3>No garages are available ${notFound ? "for this location" : `in ${esc(place)}`}</h3>
      <p>${notFound ? `We couldn't find “${esc(place)}”. Try a Delhi area (e.g. Saket) or a Delhi PIN code (e.g. 110017).<br/>` : ""}We currently serve <b>Delhi</b> only. More cities are on the way.</p>
      <span class="cs-badge">Coming soon</span>
    </li>`;
  setButtonLoading($("#f-search"), false);
}

// ---------- Location search ----------
const locInput = $("#loc-input");
const locList = $("#loc-list");
let locItems = [];
let locActive = -1;

function setOrigin(coords, label) {
  state.origin = coords;
  state.originLabel = label;
  state.placeLabel = null;
  locInput.value = label;
  document.querySelectorAll(".pop-chip").forEach((c) => c.classList.toggle("active", c.dataset.name === label));
}

function openLocList(open) {
  locList.hidden = !open;
  locInput.setAttribute("aria-expanded", String(open));
}

function renderLocList() {
  const text = locInput.value.trim();
  locItems = matchPopular(text);
  locActive = -1;
  const head = text ? "" : '<li class="loc-head">Popular in Delhi</li>';
  const rows = locItems
    .map((a, i) => `<li role="option" data-i="${i}" aria-selected="false">📍 ${esc(a.name)} <span class="muted">Delhi</span></li>`)
    .join("");
  const searchRow = text && !locItems.some((a) => norm(a.name) === norm(text))
    ? `<li role="option" data-search="1" aria-selected="false">🔎 Search “${esc(text)}”</li>`
    : "";
  locList.innerHTML = head + searchRow + rows;
  openLocList(Boolean(rows || searchRow));
}

function pickArea(area) {
  openLocList(false);
  setOrigin([area.lat, area.lng], area.name);
  search();
}

// Typed text: popular-area match first, otherwise geocode. Anything outside Delhi → coming soon.
async function resolveTyped(text) {
  openLocList(false);
  // Only an exact popular-area name skips the lookup ("punjab" must NOT become "Punjabi Bagh").
  const exact = POPULAR_AREAS.find((a) => norm(a.name) === norm(text));
  if (exact) return pickArea(exact);

  const seq = ++searchSeq; // cancel any in-flight search rendering
  markers.clearLayers();
  $("#results").innerHTML = skeletonCards(2);
  $("#results-count").textContent = "Finding location…";
  setButtonLoading($("#f-search"), true, "Finding");
  let hit = null;
  try {
    hit = await geocode(text);
  } catch {
    hit = null;
  }
  if (seq !== searchSeq) return; // a newer search started meanwhile
  if (!hit) {
    state.originLabel = text;
    locInput.value = text;
    return showComingSoon(text, true);
  }
  const label = isPincode(text) ? `${text.replace(/\s+/g, "")} · ${hit.place}` : text;
  setOrigin([hit.lat, hit.lng], label);
  state.placeLabel = hit.place;
  search();
}

locInput.addEventListener("focus", () => {
  locInput.select();
  renderLocList();
});
locInput.addEventListener("input", renderLocList);
locInput.addEventListener("keydown", (e) => {
  const options = [...locList.querySelectorAll('[role="option"]')];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (locList.hidden) renderLocList();
    if (!options.length) return;
    locActive = (locActive + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options.forEach((o, i) => o.setAttribute("aria-selected", String(i === locActive)));
    options[locActive].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    const chosen = options[locActive];
    if (chosen?.dataset.i !== undefined) pickArea(locItems[Number(chosen.dataset.i)]);
    else if (locInput.value.trim()) resolveTyped(locInput.value.trim());
  } else if (e.key === "Escape") {
    openLocList(false);
  }
});
locList.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in input
locList.addEventListener("click", (e) => {
  const li = e.target.closest('[role="option"]');
  if (!li) return;
  if (li.dataset.search) resolveTyped(locInput.value.trim());
  else pickArea(locItems[Number(li.dataset.i)]);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#loc-box")) openLocList(false);
});

$("#popular-chips").innerHTML = POPULAR_AREAS.slice(0, 8)
  .map((a) => `<button type="button" class="pop-chip" data-name="${esc(a.name)}">${esc(a.name)}</button>`)
  .join("");
$("#popular-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".pop-chip");
  if (chip) pickArea(POPULAR_AREAS.find((a) => a.name === chip.dataset.name));
});

// ---------- Garages (view only, active garages) ----------
async function loadGarages() {
  const wrap = $("#garage-list");
  wrap.innerHTML = loadingBlock("Loading garages…");
  let garages;
  try {
    garages = (await api("/garages")).filter((g) => g.isActive); // API returns active only by default
  } catch (err) {
    wrap.innerHTML = '<div class="card empty">Couldn\'t load garages. Please try again.</div>';
    return toast(err.message, true);
  }
  if (!garages.length) {
    wrap.innerHTML = '<div class="card empty">No garages available right now.</div>';
    return;
  }
  wrap.innerHTML = garages
    .map(
      (g) => `
      <div class="card garage-card">
        <h3>${esc(g.name)}</h3>
        <div class="meta">
          ${esc(g.address || "")}${g.phone ? ` · ${esc(g.phone)}` : ""}
        </div>
        <div class="chips">${serviceChips(g.services)}</div>
      </div>`,
    )
    .join("");
}

// ---------- Services (view only) ----------
async function loadServices() {
  const rows = $("#service-rows");
  rows.innerHTML = `<tr><td colspan="3">${loadingBlock("Loading services…")}</td></tr>`;
  try {
    await loadServiceList();
  } catch (err) {
    rows.innerHTML = '<tr><td colspan="3" class="empty">Couldn\'t load services. Please try again.</td></tr>';
    return toast(err.message, true);
  }
  rows.innerHTML = state.services.length
    ? state.services
        .map(
          (s) => `
      <tr>
        <td><b>${esc(s.name)}</b></td>
        <td class="muted">${esc(s.description || "—")}</td>
        <td>${s.garageCount}</td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="3" class="empty">No services available.</td></tr>';
}

// ---------- Init ----------
locInput.value = state.originLabel;
loadServiceList()
  .then(renderServiceFilter)
  .catch((err) => {
    $("#f-services").innerHTML = '<div class="ms-loading">Couldn\'t load services</div>';
    toast(err.message, true);
  })
  .finally(search);
