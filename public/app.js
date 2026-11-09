// Garage Finder frontend — talks to the Express API on the same origin.
const API = "https://rishabhgarage.vercel.app/api";
const DEFAULT_CENTER = [28.6139, 77.209]; // New Delhi
const MAX_DURATION = 54;

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
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
const tiles = () =>
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });

const map = L.map("map").setView(DEFAULT_CENTER, 12);
tiles().addTo(map);
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

// ---------- Find ----------
async function loadServiceOptions() {
  state.services = await api("/services");
  const sel = $("#f-service");
  const current = sel.value;
  sel.innerHTML =
    '<option value="">Any service</option>' +
    state.services.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  sel.value = current;
}

async function search() {
  const radiusKm = Number($("#f-radius").value);
  const serviceId = $("#f-service").value;
  const [lat, lng] = state.origin;
  const qs = new URLSearchParams({ lat, lng, radiusKm, limit: 50 });
  if (serviceId) qs.set("serviceId", serviceId);

  drawOrigin(radiusKm);
  const btn = $("#f-search");
  btn.disabled = true;
  try {
    state.results = await api(`/garages/nearby?${qs}`);
    renderResults(Number(serviceId) || null);
    map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

function serviceChips(services, highlightId) {
  if (!services?.length) return '<span class="muted">No services listed</span>';
  return services
    .map(
      (s) =>
        `<span class="chip${s.id === highlightId ? " hl" : ""}">${esc(s.name)} · <b>${s.durationMinutes} min</b></span>`,
    )
    .join("");
}

function renderResults(highlightId) {
  const list = $("#results");
  markers.clearLayers();
  const n = state.results.length;
  $("#results-count").textContent = `${n} found`;

  if (!n) {
    list.innerHTML = '<li class="empty">No garages in this area.<br/>Try a larger radius or a different service.</li>';
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
        <div class="chips">${serviceChips(g.services, highlightId)}</div>
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
  const el = document.querySelector(`.result[data-i="${i}"]`);
  el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
$("#f-service").addEventListener("change", search);
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

// ---------- Garages (manage) ----------
let garagesCache = [];

async function loadGarages() {
  const includeInactive = $("#g-inactive").checked;
  try {
    garagesCache = await api(`/garages${includeInactive ? "?includeInactive=true" : ""}`);
  } catch (err) {
    return toast(err.message, true);
  }
  const wrap = $("#garage-list");
  if (!garagesCache.length) {
    wrap.innerHTML = '<div class="card empty">No garages yet. Create the first one.</div>';
    return;
  }
  wrap.innerHTML = garagesCache
    .map(
      (g) => `
      <div class="card garage-card">
        <div class="result-top">
          <h3>${esc(g.name)}</h3>
          <span class="badge ${g.isActive ? "on" : "off"}">${g.isActive ? "Active" : "Inactive"}</span>
        </div>
        <div class="meta">
          ${esc(g.address || "No address")}${g.phone ? ` · ${esc(g.phone)}` : ""}<br/>
          <span class="muted">${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}</span>
        </div>
        <div class="chips">${serviceChips(g.services)}</div>
        <div class="actions">
          <button class="btn ghost small" data-edit="${g.id}">Edit</button>
          <button class="btn ghost small" data-toggle="${g.id}">${g.isActive ? "Deactivate" : "Activate"}</button>
          <button class="btn ghost small danger" data-del="${g.id}">Delete</button>
        </div>
      </div>`,
    )
    .join("");
}

$("#g-inactive").addEventListener("change", loadGarages);
$("#g-new").addEventListener("click", () => openGarageDialog());
$("#garage-list").addEventListener("click", async (e) => {
  const id = Number(e.target.dataset.edit || e.target.dataset.toggle || e.target.dataset.del);
  if (!id) return;
  const g = garagesCache.find((x) => x.id === id);
  try {
    if (e.target.dataset.edit) return openGarageDialog(g);
    if (e.target.dataset.toggle) {
      await api(`/garages/${id}`, { method: "PATCH", body: { isActive: !g.isActive } });
      toast(`${g.name} ${g.isActive ? "deactivated" : "activated"}`);
    }
    if (e.target.dataset.del) {
      if (!confirm(`Delete "${g.name}"? This cannot be undone.`)) return;
      await api(`/garages/${id}`, { method: "DELETE" });
      toast(`${g.name} deleted`);
    }
    loadGarages();
  } catch (err) {
    toast(err.message, true);
  }
});

// Garage dialog with a click-to-place map
const gDialog = $("#garage-dialog");
let editingGarageId = null;
let pickerMap, pickerMarker;

function setPickerPoint(lat, lng, pan = false) {
  $("#gf-lat").value = Number(lat).toFixed(6);
  $("#gf-lng").value = Number(lng).toFixed(6);
  if (pickerMarker) pickerMarker.setLatLng([lat, lng]);
  else pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
  if (pan) pickerMap.setView([lat, lng], 14);
}

async function openGarageDialog(g = null) {
  editingGarageId = g?.id ?? null;
  $("#garage-dialog-title").textContent = g ? `Edit ${g.name}` : "New garage";
  $("#garage-error").textContent = "";
  $("#gf-name").value = g?.name ?? "";
  $("#gf-address").value = g?.address ?? "";
  $("#gf-phone").value = g?.phone ?? "";
  $("#gf-active").checked = g?.isActive ?? true;
  $("#gf-lat").value = g?.lat ?? "";
  $("#gf-lng").value = g?.lng ?? "";

  if (!state.services.length) await loadServiceOptions().catch(() => {});
  const offered = new Map((g?.services ?? []).map((s) => [s.id, s.durationMinutes]));
  $("#gf-services").innerHTML = state.services.length
    ? state.services
        .map((s) => {
          const on = offered.has(s.id);
          return `
          <div class="pick">
            <label class="check"><input type="checkbox" data-svc="${s.id}" ${on ? "checked" : ""}/> <span title="${esc(s.name)}">${esc(s.name)}</span></label>
            <input type="number" min="1" max="${MAX_DURATION}" data-dur="${s.id}" value="${offered.get(s.id) ?? 30}" ${on ? "" : "disabled"} aria-label="Duration in minutes"/>
          </div>`;
        })
        .join("")
    : '<span class="muted">No services yet — add some in the Services tab.</span>';

  gDialog.showModal();

  if (!pickerMap) {
    pickerMap = L.map("picker-map");
    tiles().addTo(pickerMap);
    pickerMap.on("click", (e) => setPickerPoint(e.latlng.lat, e.latlng.lng));
  }
  pickerMarker?.remove();
  pickerMarker = null;
  setTimeout(() => {
    pickerMap.invalidateSize();
    if (g) setPickerPoint(g.lat, g.lng, true);
    else pickerMap.setView(map.getCenter(), 12);
  }, 0);
}

$("#gf-services").addEventListener("change", (e) => {
  const id = e.target.dataset.svc;
  if (id) document.querySelector(`[data-dur="${id}"]`).disabled = !e.target.checked;
});
["#gf-lat", "#gf-lng"].forEach((sel) =>
  $(sel).addEventListener("change", () => {
    const lat = Number($("#gf-lat").value), lng = Number($("#gf-lng").value);
    if ($("#gf-lat").value && $("#gf-lng").value) setPickerPoint(lat, lng, true);
  }),
);

$("#garage-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const services = [...document.querySelectorAll("[data-svc]:checked")].map((cb) => ({
    serviceId: Number(cb.dataset.svc),
    durationMinutes: Number(document.querySelector(`[data-dur="${cb.dataset.svc}"]`).value),
  }));
  const bad = services.find((s) => !Number.isInteger(s.durationMinutes) || s.durationMinutes < 1 || s.durationMinutes > MAX_DURATION);
  if (bad) {
    $("#garage-error").textContent = `Each service duration must be a whole number from 1 to ${MAX_DURATION} minutes.`;
    return;
  }
  const body = {
    name: $("#gf-name").value.trim(),
    address: $("#gf-address").value.trim() || null,
    phone: $("#gf-phone").value.trim() || null,
    lat: Number($("#gf-lat").value),
    lng: Number($("#gf-lng").value),
    isActive: $("#gf-active").checked,
    services,
  };
  try {
    if (editingGarageId) {
      await api(`/garages/${editingGarageId}`, { method: "PATCH", body });
      toast("Garage updated");
    } else {
      await api("/garages", { method: "POST", body });
      toast("Garage created");
    }
    gDialog.close();
    loadGarages();
    loadServiceOptions().catch(() => {});
  } catch (err) {
    $("#garage-error").textContent = err.message;
  }
});

// ---------- Services (manage) ----------
async function loadServices() {
  try {
    await loadServiceOptions();
  } catch (err) {
    return toast(err.message, true);
  }
  const rows = $("#service-rows");
  if (!state.services.length) {
    rows.innerHTML = '<tr><td colspan="4" class="empty">No services yet.</td></tr>';
    return;
  }
  rows.innerHTML = state.services
    .map(
      (s) => `
      <tr>
        <td><b>${esc(s.name)}</b></td>
        <td class="muted">${esc(s.description || "—")}</td>
        <td>${s.garageCount}</td>
        <td>
          <button class="btn ghost small" data-sedit="${s.id}">Edit</button>
          <button class="btn ghost small danger" data-sdel="${s.id}">Delete</button>
        </td>
      </tr>`,
    )
    .join("");
}

const sDialog = $("#service-dialog");
let editingServiceId = null;

function openServiceDialog(s = null) {
  editingServiceId = s?.id ?? null;
  $("#service-dialog-title").textContent = s ? `Edit ${s.name}` : "New service";
  $("#service-error").textContent = "";
  $("#sf-name").value = s?.name ?? "";
  $("#sf-desc").value = s?.description ?? "";
  sDialog.showModal();
}

$("#s-new").addEventListener("click", () => openServiceDialog());
$("#service-rows").addEventListener("click", async (e) => {
  const id = Number(e.target.dataset.sedit || e.target.dataset.sdel);
  if (!id) return;
  const s = state.services.find((x) => x.id === id);
  if (e.target.dataset.sedit) return openServiceDialog(s);
  const warn = s.garageCount ? ` It is offered by ${s.garageCount} garage(s) and will be removed from them.` : "";
  if (!confirm(`Delete "${s.name}"?${warn}`)) return;
  try {
    await api(`/services/${id}`, { method: "DELETE" });
    toast(`${s.name} deleted`);
    loadServices();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#service-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { name: $("#sf-name").value.trim(), description: $("#sf-desc").value.trim() || null };
  try {
    if (editingServiceId) {
      await api(`/services/${editingServiceId}`, { method: "PATCH", body });
      toast("Service updated");
    } else {
      await api("/services", { method: "POST", body });
      toast("Service created");
    }
    sDialog.close();
    loadServices();
  } catch (err) {
    $("#service-error").textContent = err.message === "Already exists" ? "A service with this name already exists." : err.message;
  }
});

document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

// ---------- Init ----------
loadServiceOptions()
  .catch((err) => toast(err.message, true))
  .finally(search);
