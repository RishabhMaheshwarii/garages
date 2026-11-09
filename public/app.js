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
  const wrap = $("#f-services");
  wrap.querySelectorAll(".svc-opt:not(:first-child)").forEach((el) => el.remove());
  wrap.insertAdjacentHTML(
    "beforeend",
    state.services
      .map((s) => `<label class="svc-opt"><input type="checkbox" data-svc="${s.id}" /> ${esc(s.name)}</label>`)
      .join(""),
  );
}

const serviceBoxes = () => [...document.querySelectorAll("#f-services [data-svc]")];
const selectedServiceIds = () => serviceBoxes().filter((cb) => cb.checked).map((cb) => Number(cb.dataset.svc));

// "All services" and individual services are mutually exclusive.
$("#f-services").addEventListener("change", (e) => {
  const all = $("#f-all");
  if (e.target === all) {
    if (all.checked) serviceBoxes().forEach((cb) => (cb.checked = false));
    else if (!selectedServiceIds().length) all.checked = true; // need something selected
  } else {
    all.checked = selectedServiceIds().length === 0;
  }
  search();
});

// ---------- Find ----------
async function search() {
  const radiusKm = Number($("#f-radius").value);
  const ids = selectedServiceIds();
  const [lat, lng] = state.origin;
  const qs = new URLSearchParams({ lat, lng, radiusKm, limit: 50 });
  if (ids.length) qs.set("serviceIds", ids.join(","));

  drawOrigin(radiusKm);
  const btn = $("#f-search");
  btn.disabled = true;
  try {
    state.results = await api(`/garages/nearby?${qs}`);
    renderResults(new Set(ids));
    map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
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
          ${g.address ? esc(g.address) : ""}
          ${g.phone ? ` · <a href="tel:${esc(g.phone)}">${esc(g.phone)}</a>` : ""}
          · <a href="https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}" target="_blank" rel="noopener">Directions</a>
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
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.origin = [pos.coords.latitude, pos.coords.longitude];
      search();
    },
    () => toast("Couldn't get your location — click the map instead", true),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

// ---------- Garages (view only, active garages) ----------
async function loadGarages() {
  let garages;
  try {
    garages = await api("/garages"); // API returns active garages only by default
  } catch (err) {
    return toast(err.message, true);
  }
  const wrap = $("#garage-list");
  if (!garages.length) {
    wrap.innerHTML = '<div class="card empty">No garages available right now.</div>';
    return;
  }
  wrap.innerHTML = garages
    .filter((g) => g.isActive)
    .map(
      (g) => `
      <div class="card garage-card">
        <h3>${esc(g.name)}</h3>
        <div class="meta">
          ${esc(g.address || "")}${g.phone ? ` · <a href="tel:${esc(g.phone)}">${esc(g.phone)}</a>` : ""}
          · <a href="https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}" target="_blank" rel="noopener">Directions</a>
        </div>
        <div class="chips">${serviceChips(g.services)}</div>
      </div>`,
    )
    .join("");
}

// ---------- Services (view only) ----------
async function loadServices() {
  try {
    await loadServiceList();
  } catch (err) {
    return toast(err.message, true);
  }
  const rows = $("#service-rows");
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
  .catch((err) => toast(err.message, true))
  .finally(search);
