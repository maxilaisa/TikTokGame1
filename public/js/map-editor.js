const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const cursorCoordsEl = document.getElementById('cursor-coords');
const clickCoordsEl = document.getElementById('click-coords');
const turretListEl = document.getElementById('turret-list');
const exportJsonEl = document.getElementById('export-json');
const toastEl = document.getElementById('toast');

const W = canvas.width;
const H = canvas.height;

let config = RIFT_MAP.load();
let activeLane = 'top';
let placeMode = 'red-main';
let mouse = { x: 0, y: 0 };

const mapImg = new Image();
let mapImage = null;
mapImg.onload = () => {
  mapImage = mapImg;
};
mapImg.src = '/assets/rift-map.png';

const lanePaths = RIFT_MAP.buildLanePaths(config);

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
  exportJsonEl.value = JSON.stringify({ turrets: config.turrets }, null, 2);
}

function refreshList() {
  turretListEl.innerHTML = (config.turrets || [])
    .map(
      (t, i) =>
        `<li>${i + 1}. ${t.lane} ${t.team} ${t.type} — { x: ${t.x}, y: ${t.y} }</li>`
    )
    .join('');
  syncExport();
}

document.querySelectorAll('.lane-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
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

canvas.addEventListener('mousemove', (e) => {
  mouse = canvasCoords(e.clientX, e.clientY);
  cursorCoordsEl.textContent = `${mouse.x} , ${mouse.y}`;
});

canvas.addEventListener('click', (e) => {
  const { x, y } = canvasCoords(e.clientX, e.clientY);
  clickCoordsEl.textContent = `{ x: ${x}, y: ${y} }`;

  const [team, type] = placeMode.split('-');
  if (!config.turrets) config.turrets = [];
  config.turrets.push({ lane: activeLane, team, type, x, y });
  refreshList();
  showToast(`Placed ${team} ${type} (${activeLane})`);
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
  window.open('/', '_blank');
});

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Reset turrets to auto positions?')) return;
  RIFT_MAP.clear();
  config = RIFT_MAP.load();
  config.turrets = RIFT_MAP.defaultTurretPlacements(RIFT_MAP.buildLanePaths(config));
  refreshList();
});

document.getElementById('copy-btn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(exportJsonEl.value);
  showToast('Copied');
});

function drawPaths() {
  for (const lane of ['top', 'mid', 'bot']) {
    const path = lanePaths[lane];
    ctx.strokeStyle = lane === activeLane ? 'rgba(126,232,255,0.5)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = lane === activeLane ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  }
}

function drawTurretMarker(t) {
  const isMain = t.type === 'main';
  const isBlue = t.team === 'blue';
  ctx.fillStyle = isBlue ? '#25f4ee' : '#fe2c55';
  ctx.strokeStyle = isMain ? '#ffd56a' : '#fff';
  ctx.lineWidth = isMain ? 3 : 1;
  ctx.beginPath();
  ctx.moveTo(t.x, t.y - (isMain ? 20 : 16));
  ctx.lineTo(t.x + (isMain ? 18 : 14), t.y + 10);
  ctx.lineTo(t.x - (isMain ? 18 : 14), t.y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(isMain ? 'M' : 'D', t.x, t.y + 4);
}

function render() {
  ctx.clearRect(0, 0, W, H);
  if (mapImage) ctx.drawImage(mapImage, 0, 0, W, H);
  else {
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, W, H);
  }
  drawPaths();
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
