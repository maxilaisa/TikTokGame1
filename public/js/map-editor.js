const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const cursorCoordsEl = document.getElementById('cursor-coords');
const clickCoordsEl = document.getElementById('click-coords');
const pointListEl = document.getElementById('point-list');
const exportJsonEl = document.getElementById('export-json');
const toastEl = document.getElementById('toast');

const W = canvas.width;
const H = canvas.height;

let config = RIFT_MAP.load(W, H);
let activeLane = 'top';
let mouse = { x: 0, y: 0 };
let lastClick = null;

const mapImg = new Image();
let mapImage = null;
mapImg.onload = () => {
  mapImage = mapImg;
};
mapImg.src = '/assets/rift-map.png';

function canvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  return {
    x: Math.round((clientX - rect.left) * scaleX),
    y: Math.round((clientY - rect.top) * scaleY),
  };
}

function getClickMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || 'lane';
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toastEl.hidden = true;
  }, 2200);
}

function syncExport() {
  exportJsonEl.value = RIFT_MAP.toExportJson(config);
}

function refreshPointList() {
  const pts = config.lanes[activeLane] || [];
  pointListEl.innerHTML = [
    `<li><strong>Blue</strong> { x: ${config.blueBase.x}, y: ${config.blueBase.y} }</li>`,
    ...pts.map((p, i) => `<li>${activeLane}[${i}] { x: ${p.x}, y: ${p.y} }</li>`),
    `<li><strong>Red</strong> { x: ${config.redBase.x}, y: ${config.redBase.y} }</li>`,
  ].join('');
  syncExport();
}

document.querySelectorAll('.lane-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lane-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeLane = btn.dataset.lane;
    refreshPointList();
  });
});

canvas.addEventListener('mousemove', (e) => {
  mouse = canvasCoords(e.clientX, e.clientY);
  cursorCoordsEl.textContent = `${mouse.x} , ${mouse.y}`;
});

canvas.addEventListener('click', (e) => {
  const { x, y } = canvasCoords(e.clientX, e.clientY);
  lastClick = { x, y };
  clickCoordsEl.textContent = `{ x: ${x}, y: ${y} }`;

  const mode = getClickMode();
  if (mode === 'blue') {
    config.blueBase = { x, y };
    showToast(`Blue base → ${x}, ${y}`);
  } else if (mode === 'red') {
    config.redBase = { x, y };
    showToast(`Red base → ${x}, ${y}`);
  } else {
    if (!config.lanes[activeLane]) config.lanes[activeLane] = [];
    config.lanes[activeLane].push({ x, y });
    showToast(`${activeLane} point #${config.lanes[activeLane].length}`);
  }
  refreshPointList();
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const pts = config.lanes[activeLane];
  if (pts?.length) {
    pts.pop();
    refreshPointList();
    showToast('Undid last point');
  }
});

document.getElementById('undo-btn').addEventListener('click', () => {
  config.lanes[activeLane]?.pop();
  refreshPointList();
});

document.getElementById('clear-lane-btn').addEventListener('click', () => {
  config.lanes[activeLane] = [];
  refreshPointList();
});

document.getElementById('apply-btn').addEventListener('click', () => {
  RIFT_MAP.save(config);
  showToast('Saved — refresh the game page');
});

document.getElementById('preview-game-btn').addEventListener('click', () => {
  RIFT_MAP.save(config);
  window.open('/', '_blank');
});

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Reset all paths to defaults?')) return;
  RIFT_MAP.clear();
  config = RIFT_MAP.defaults(W, H);
  refreshPointList();
  showToast('Reset to defaults');
});

document.getElementById('copy-btn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(exportJsonEl.value);
  showToast('JSON copied');
});

function drawPaths() {
  const paths = RIFT_MAP.buildLanePaths(config);
  const colors = { top: '#7ee8ff', mid: '#ffe566', bot: '#ff8866' };

  for (const lane of ['top', 'mid', 'bot']) {
    const path = paths[lane];
    const color = colors[lane];
    ctx.strokeStyle = color;
    ctx.lineWidth = lane === activeLane ? 5 : 3;
    ctx.globalAlpha = lane === activeLane ? 1 : 0.55;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();

    path.forEach((p, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 || i === path.length - 1 ? 14 : 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i), p.x, p.y);
    });
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = '#25f4ee';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BLUE', config.blueBase.x, config.blueBase.y - 22);
  ctx.fillStyle = '#fe2c55';
  ctx.fillText('RED', config.redBase.x, config.redBase.y - 22);
}

function drawCrosshair() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 229, 102, 0.85)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(mouse.x, 0);
  ctx.lineTo(mouse.x, H);
  ctx.moveTo(0, mouse.y);
  ctx.lineTo(W, mouse.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffe566';
  ctx.beginPath();
  ctx.arc(mouse.x, mouse.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  if (mapImage) {
    ctx.drawImage(mapImage, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, W, H);
  }
  drawPaths();
  drawCrosshair();
  requestAnimationFrame(render);
}

refreshPointList();
render();
