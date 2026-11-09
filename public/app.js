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

const state = { services: [], origin: DEFAULT_CENTER, results: [] };

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
  state.origin = [e.latlng.lat, e.latlng.lng];
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
$("#f-search").addEventListener("click", search);
$("#f-radius").addEventListener("change", search);
$("#f-locate").addEventListener("click", () => {
  if (!navigator.geolocation) return toast("Geolocation not supported", true);
  const btn = $("#f-locate");
  setButtonLoading(btn, true, "Locating");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setButtonLoading(btn, false);
      state.origin = [pos.coords.latitude, pos.coords.longitude];
      search();
    },
    () => {
      setButtonLoading(btn, false);
      toast("Couldn't get your location — click the map instead", true);
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
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
loadServiceList()
  .then(renderServiceFilter)
  .catch((err) => {
    $("#f-services").innerHTML = '<div class="ms-loading">Couldn\'t load services</div>';
    toast(err.message, true);
  })
  .finally(search);
