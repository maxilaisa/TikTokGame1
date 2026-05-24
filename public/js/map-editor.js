const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const cursorCoordsEl = document.getElementById('cursor-coords');
const clickCoordsEl = document.getElementById('click-coords');
const turretListEl = document.getElementById('turret-list');
const exportJsonEl = document.getElementById('export-json');
const toastEl = document.getElementById('toast');
const showRangesEl = document.getElementById('show-ranges');

const W = canvas.width;
const H = canvas.height;

let config = RIFT_MAP.load();
let activeLane = 'top';
let placeMode = 'meet';
let mouse = { x: 0, y: 0 };
let showRanges = true;

const mapImg = new Image();
let mapImage = null;
mapImg.onload = () => {
  mapImage = mapImg;
};
mapImg.src = '/assets/rift-map.png';

const lanePaths = RIFT_MAP.buildLanePaths(config);

if (!config.meetPoints) {
  config.meetPoints = RIFT_MAP.ensureMeetPoints(config);
}

function canvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((clientX - rect.left) * (W / rect.width)),
    y: Math.round((clientY - rect.top) * (H / rect.height)),
  };
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toastEl.hidden = true;
  }, 2000);
}

function syncExport() {
  exportJsonEl.value = JSON.stringify(
    { turrets: config.turrets, meetPoints: config.meetPoints },
    null,
    2
  );
}

function refreshList() {
  const meetLines = ['top', 'mid', 'bot'].map((lane) => {
    const m = config.meetPoints[lane];
    return `<li><strong>Meet ${lane}</strong> — { x: ${m.x}, y: ${m.y} }</li>`;
  });
  const turretLines = (config.turrets || []).map(
    (t, i) => `<li>${i + 1}. ${t.lane} ${t.team} ${t.type} — { x: ${t.x}, y: ${t.y} }</li>`
  );
  turretListEl.innerHTML = [...meetLines, ...turretLines].join('');
  syncExport();
}

document.querySelectorAll('.lane-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.lane === 'base') return;
    document.querySelectorAll('.lane-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeLane = btn.dataset.lane;
  });
});

document.querySelectorAll('.place-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.place-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    placeMode = btn.dataset.mode;
  });
});

showRangesEl.addEventListener('change', () => {
  showRanges = showRangesEl.checked;
});

canvas.addEventListener('mousemove', (e) => {
  mouse = canvasCoords(e.clientX, e.clientY);
  cursorCoordsEl.textContent = `${mouse.x} , ${mouse.y}`;
});

canvas.addEventListener('click', (e) => {
  const { x, y } = canvasCoords(e.clientX, e.clientY);
  clickCoordsEl.textContent = `{ x: ${x}, y: ${y} }`;

  if (placeMode === 'meet') {
    if (activeLane === 'base') {
      showToast('Pick top / mid / bot lane for meet point');
      return;
    }
    config.meetPoints[activeLane] = { x, y };
    refreshList();
    showToast(`Meet point set (${activeLane})`);
    return;
  }

  const parts = placeMode.split('-');
  const team = parts[0];
  const type = parts.slice(1).join('-');
  const lane = type === 'base' ? 'base' : activeLane;
  if (!config.turrets) config.turrets = [];
  config.turrets.push({ lane, team, type, x, y });
  refreshList();
  showToast(`Placed ${team} ${type}`);
});

document.getElementById('undo-btn').addEventListener('click', () => {
  config.turrets?.pop();
  refreshList();
});

document.getElementById('clear-btn').addEventListener('click', () => {
  config.turrets = [];
  refreshList();
});

document.getElementById('apply-btn').addEventListener('click', () => {
  RIFT_MAP.save(config);
  showToast('Saved — refresh game');
});

document.getElementById('open-game-btn').addEventListener('click', () => {
  RIFT_MAP.save(config);
  window.open('/?ranges=1', '_blank');
});

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Reset turrets & meet points to defaults?')) return;
  RIFT_MAP.clear();
  config = RIFT_MAP.load();
  refreshList();
});

document.getElementById('copy-btn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(exportJsonEl.value);
  showToast('Copied');
});

function drawPaths() {
  for (const lane of ['top', 'mid', 'bot']) {
    const path = lanePaths[lane];
    ctx.strokeStyle = lane === activeLane ? 'rgba(126,232,255,0.5)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = lane === activeLane ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  }
}

function drawTurretRanges() {
  for (const t of config.turrets || []) {
    const stats = RIFT_MAP.turretStats(t.type);
    const isBlue = t.team === 'blue';
    ctx.strokeStyle = isBlue ? 'rgba(37, 244, 238, 0.45)' : 'rgba(254, 44, 85, 0.45)';
    ctx.fillStyle = isBlue ? 'rgba(37, 244, 238, 0.07)' : 'rgba(254, 44, 85, 0.07)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, stats.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawMeetPoint(lane) {
  const m = config.meetPoints[lane];
  if (!m) return;
  const isActive = lane === activeLane;
  ctx.strokeStyle = isActive ? '#ffd56a' : 'rgba(255, 213, 106, 0.75)';
  ctx.fillStyle = 'rgba(255, 213, 106, 0.3)';
  ctx.lineWidth = isActive ? 4 : 2;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FIGHT', m.x, m.y + 4);
  ctx.font = '10px sans-serif';
  ctx.fillText(lane.toUpperCase(), m.x, m.y + 18);
}

function drawTurretMarker(t) {
  const isBase = t.type === 'base';
  const isBlue = t.team === 'blue';
  const label = isBase ? 'B' : t.type === 'last' ? 'L' : t.type === 'defend2' ? '2' : '1';
  ctx.fillStyle = isBlue ? '#25f4ee' : '#fe2c55';
  ctx.strokeStyle = isBase ? '#ffd56a' : '#fff';
  ctx.lineWidth = isBase ? 3 : 1;
  const s = isBase ? 22 : 16;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y - s);
  ctx.lineTo(t.x + s, t.y + 10);
  ctx.lineTo(t.x - s, t.y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, t.x, t.y + 4);
}

function render() {
  ctx.clearRect(0, 0, W, H);
  if (mapImage) ctx.drawImage(mapImage, 0, 0, W, H);
  else {
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, W, H);
  }

  drawPaths();
  if (showRanges) drawTurretRanges();
  for (const lane of ['top', 'mid', 'bot']) drawMeetPoint(lane);
  for (const t of config.turrets || []) drawTurretMarker(t);

  ctx.strokeStyle = 'rgba(255,229,102,0.8)';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(mouse.x, 0);
  ctx.lineTo(mouse.x, H);
  ctx.moveTo(0, mouse.y);
  ctx.lineTo(W, mouse.y);
  ctx.stroke();
  ctx.setLineDash([]);

  requestAnimationFrame(render);
}

refreshList();
render();
