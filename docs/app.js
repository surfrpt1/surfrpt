"use strict";

const NODES_URL = "v2ray_configs/nearest/nodes.json";

const state = {
  nodes: [],
  loc: null,
  topN: 50,
  proto: "",
  cfOnly: false,
  query: "",
};

const $ = (id) => document.getElementById(id);

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
  return list
    .map((n) => ({ n, d: distance(n) }))
    .sort((x, y) => {
      if (x.d == null && y.d == null) return x.n.latency - y.n.latency;
      if (x.d == null) return 1;
      if (y.d == null) return -1;
      return x.d - y.d;
    });
}

function locLabel() {
  if (!state.loc) return null;
  const acc = state.loc.accuracy ? `±${Math.round(state.loc.accuracy)}m ` : "";
  return `${acc}(${state.loc.lat.toFixed(4)}, ${state.loc.lon.toFixed(4)})`;
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
    locInfo.textContent = "No device location — showing CI latency order. Click Refresh to rank by distance.";
  }

  tbody.innerHTML = sorted
    .map(({ n, d }, i) => {
      const dStr = d == null ? "—" : d < 1 ? `${(d * 1000).toFixed(0)} m` : `${d.toFixed(0)} km`;
      const loc = [n.country, n.city].filter(Boolean).join(" · ") || "—";
      const lat = n.latency == null ? "—" : `${n.latency} ms`;
      return `<tr>
        <td>${i + 1}</td>
        <td class="code">${dStr}</td>
        <td class="code">${lat}</td>
        <td>${n.scheme}</td>
        <td>${loc}</td>
        <td class="code">${n.host}:${n.port}</td>
        <td><button data-copy="${i}">copy</button></td>
      </tr>`;
    })
    .join("");
}

async function loadNodes() {
  try {
    const res = await fetch(NODES_URL, { cache: "no-store" });
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

$("refresh").addEventListener("click", refresh);
$("use-location").addEventListener("click", async () => {
  const loc = await getLocation();
  if (loc) {
    state.loc = loc;
    render();
  }
});
$("download-sub").addEventListener("click", () => {
  const lines = ["#profile-title: base64:" + btoa("surfrpt-nearest"), "#profile-update-interval: 1"].concat(
    filtered().slice(0, state.topN).map(({ n }) => n.config)
  );
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "surfrpt-nearest.txt";
  a.click();
  URL.revokeObjectURL(a.href);
});
$("copy-top").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(topList());
    $("copy-top").textContent = "✓ Copied";
    setTimeout(() => ($("copy-top").textContent = "Copy top-N"), 1200);
  } catch (e) {
    const area = $("export-area");
    area.value = topList();
    $("export").classList.remove("hidden");
  }
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
$("search").addEventListener("input", (e) => {
  state.query = e.target.value;
  render();
});
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-copy]");
  if (!btn) return;
  const { n } = filtered()[+btn.dataset.copy];
  if (!n) return;
  navigator.clipboard.writeText(n.config).then(
    () => {
      btn.textContent = "✓";
      setTimeout(() => (btn.textContent = "copy"), 900);
    },
    () => {}
  );
});

loadNodes();
