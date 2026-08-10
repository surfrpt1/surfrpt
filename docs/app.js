"use strict";

const PW_HASH =
  "a272294f8a3c1d7588d80e82109805d8d824844dc8c2ade2249ed238d1e5557b";
const SESSION_KEY = "surfrpt.unlocked";

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function unlock(pw) {
  return (await sha256Hex(pw)) === PW_HASH;
}

function init() {
  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    document.body.classList.remove("locked");
    loadNodes();
    return;
  }
  const form = $("login-form");
  const input = $("login-pw");
  const msg = $("login-msg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    if (await unlock(input.value)) {
      sessionStorage.setItem(SESSION_KEY, "1");
      document.body.classList.remove("locked");
      input.value = "";
      loadNodes();
    } else {
      msg.textContent = "Incorrect password.";
      input.select();
    }
  });
  input.focus();
}

const NODES_URL =
  "https://raw.githubusercontent.com/surfrpt1/surfrpt/main/v2ray_configs/nearest/nodes.json";
const SUB_URL =
  "https://raw.githubusercontent.com/surfrpt1/surfrpt/main/v2ray_configs/subscriptions/subscription-1.txt";

const state = {
  nodes: [],
  loc: null,
  topN: 50,
  proto: "",
  cfOnly: false,
  dedup: false,
  query: "",
};

const $ = (id) => document.getElementById(id);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function distance(n) {
  if (!state.loc || n.lat == null || n.lon == null) return null;
  return haversineKm(state.loc, n);
}

function isCloudflare(ip) {
  const parts = (ip || "").split(".");
  if (parts.length !== 4) return false;
  const a = +parts[0], b = +parts[1];
  return (
    a === 104 || a === 172 || a === 162 || a === 188 || a === 141 ||
    a === 108 || a === 103 || a === 173 || a === 190 || a === 198 ||
    a === 131 || a === 197 || (a === 192 && b === 0)
  );
}

function filtered() {
  let list = state.nodes;
  if (state.proto) list = list.filter((n) => n.scheme === state.proto);
  if (state.cfOnly) list = list.filter((n) => isCloudflare(n.ip));
  const q = state.query.trim().toLowerCase();
  if (q) {
    list = list.filter((n) =>
      [n.country, n.cc, n.region, n.city, n.isp, n.host, n.ip]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }
  const sorted = list
    .map((n) => ({ n, d: distance(n) }))
    .sort((x, y) => {
      if (x.d == null && y.d == null) return x.n.latency - y.n.latency;
      if (x.d == null) return 1;
      if (y.d == null) return -1;
      return x.d - y.d;
    });

  if (state.dedup) {
    const seen = new Set();
    const out = [];
    for (const item of sorted) {
      const key = `${item.n.scheme}|${item.n.host}|${item.n.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }
  return sorted;
}

function locLabel() {
  if (!state.loc) return null;
  const acc = state.loc.accuracy ? `±${Math.round(state.loc.accuracy)}m ` : "";
  return `${acc}(${state.loc.lat.toFixed(4)}, ${state.loc.lon.toFixed(4)})`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function srLink(n) {
  return "shadowrocket://add/" + encodeURIComponent(n.config);
}

function render() {
  const tbody = $("tbody");
  const sorted = filtered().slice(0, state.topN);
  const locInfo = $("locinfo");
  if (!state.nodes.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="dim">No data — is nodes.json available?</td></tr>`;
    return;
  }
  if (state.loc) {
    locInfo.textContent = `Ranking from device location ${locLabel()}. Showing ${sorted.length} of ${filtered().length} matched nodes.`;
  } else {
    locInfo.textContent = "No device location — showing CI latency order. Tap Refresh to rank by your location.";
  }
  tbody.innerHTML = sorted
    .map(({ n, d }, i) => {
      const dStr = d == null ? "—" : d < 1 ? `${(d * 1000).toFixed(0)} m` : `${d.toFixed(0)} km`;
      const loc = [n.country, n.city].filter(Boolean).join(" · ") || "—";
      const lat = n.latency == null ? "—" : `${n.latency} ms`;
      const actions = isIOS
        ? `<a class="btn sr" href="${srLink(n)}">Open in Shadowrocket</a>
           <button class="btn" data-copy="${i}">Copy</button>`
        : `<button class="btn" data-copy="${i}">Copy</button>`;
      return `<tr data-idx="${i}">
        <td data-label="#">${i + 1}</td>
        <td data-label="Distance" class="code">${dStr}</td>
        <td data-label="CI latency" class="code">${lat}</td>
        <td data-label="Protocol">${escapeHtml(n.scheme)}</td>
        <td data-label="Location">${escapeHtml(loc)}</td>
        <td data-label="Host" class="code">${escapeHtml(n.host)}:${escapeHtml(n.port)}</td>
        <td data-label="Actions" class="actions">${actions}</td>
      </tr>`;
    })
    .join("");
}

async function loadNodes() {
  try {
    const res = await fetch(`${NODES_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.nodes = await res.json();
    $("locinfo").textContent = `Loaded ${state.nodes.length} nodes.`;
    render();
  } catch (e) {
    $("tbody").innerHTML = `<tr><td colspan="7" class="dim">Failed to load ${NODES_URL}: ${e.message}</td></tr>`;
    $("locinfo").textContent = "Load failed.";
  }
}

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  });
}

async function refresh() {
  const btn = $("refresh");
  btn.disabled = true;
  btn.textContent = "Locating…";
  const loc = await getLocation();
  state.loc = loc;
  if (loc) {
    $("locinfo").textContent = `Device location ${locLabel()}. Refreshing nodes…`;
    $("use-location").disabled = false;
  } else {
    $("locinfo").textContent = "Location denied/unavailable — falling back to CI latency order.";
    $("use-location").disabled = false;
  }
  await loadNodes();
  btn.textContent = "⟳ Refresh";
  btn.disabled = false;
}

function topList() {
  return filtered().slice(0, state.topN).map(({ n }) => n.config).join("\n");
}

function b64(s) {
  try {
    return btoa(s);
  } catch (_) {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }
}

async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return true;
    } catch (_) {
      return false;
    }
  }
  return false;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const area = $("export-area");
    area.value = text;
    $("export").classList.remove("hidden");
    area.select();
    return false;
  }
}

async function flash(btn, msg) {
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => (btn.textContent = old), 1200);
}

$("refresh").addEventListener("click", refresh);
$("use-location").addEventListener("click", async () => {
  const loc = await getLocation();
  if (loc) {
    state.loc = loc;
    render();
  }
});

$("share-top").addEventListener("click", async () => {
  const list = topList();
  if (!list) return;
  const ok = await shareText("surfrpt nearest nodes", list);
  if (!ok) {
    const copied = await copyText(list);
    $("share-top").textContent = copied ? "✓ Copied (no share)" : "Open export box";
    setTimeout(() => ($("share-top").textContent = "Share top-N"), 1400);
  }
});

$("download-sub").addEventListener("click", () => {
  const lines = ["#profile-title: base64:" + b64("surfrpt-nearest"), "#profile-update-interval: 1"].concat(
    filtered().slice(0, state.topN).map(({ n }) => n.config)
  );
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "surfrpt-nearest.txt";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("sr-sub").addEventListener("click", () => {
  // sub://BASE64(url) — standard Shadowrocket subscription deep link
  const deep = "shadowrocket://add/sub://" + b64(SUB_URL) + "#surfrpt";
  window.location.href = deep;
  setTimeout(() => flash($("sr-sub"), "Opened Shadowrocket?"), 300);
});

$("copy-top").addEventListener("click", async () => {
  const list = topList();
  if (!list) return;
  const copied = await copyText(list);
  $("copy-top").textContent = copied ? "✓ Copied" : "Copied to box below";
  setTimeout(() => ($("copy-top").textContent = "Copy top-N"), 1200);
});

$("topn").addEventListener("input", (e) => {
  state.topN = Math.min(500, Math.max(5, parseInt(e.target.value, 10) || 50));
  render();
});
$("filter-proto").addEventListener("change", (e) => {
  state.proto = e.target.value;
  render();
});
$("filter-cf").addEventListener("change", (e) => {
  state.cfOnly = e.target.checked;
  render();
});
$("dedup").addEventListener("click", (e) => {
  state.dedup = !state.dedup;
  const btn = e.currentTarget;
  btn.textContent = state.dedup ? "Remove duplicates: on" : "Remove duplicates: off";
  btn.setAttribute("aria-pressed", String(state.dedup));
  btn.classList.toggle("active", state.dedup);
  render();
});
$("search").addEventListener("input", (e) => {
  state.query = e.target.value;
  render();
});
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-copy]");
  if (!btn) return;
  const idx = +btn.dataset.copy;
  const { n } = filtered()[idx];
  if (!n) return;
  copyText(n.config).then((ok) => {
    btn.textContent = ok ? "✓ Copied" : "In box";
    setTimeout(() => (btn.textContent = "Copy"), 900);
  });
});

init();
