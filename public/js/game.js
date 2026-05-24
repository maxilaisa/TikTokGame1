const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const blueCountEl = document.getElementById('blue-count');
const redCountEl = document.getElementById('red-count');
const killsEl = document.getElementById('kills');
const setupPanel = document.getElementById('setup-panel');
const usernameInput = document.getElementById('username');
const connectBtn = document.getElementById('connect-btn');

const W = canvas.width;
const H = canvas.height;

const TEAMS = { BLUE: 'blue', RED: 'red' };
const LANES = ['top', 'mid', 'bot'];
const SHOOT_RANGE = 220;
const SHOOT_COOLDOWN = 28;

const socket = io();
const imageCache = new Map();

/** @type {HTMLImageElement | null} */
let mapImage = null;
const mapImg = new Image();
mapImg.onload = () => {
  mapImage = mapImg;
};
mapImg.src = '/assets/rift-map.png';

const mapConfig = RIFT_MAP.load(W, H);
const BLUE_BASE = mapConfig.blueBase;
const RED_BASE = mapConfig.redBase;
const LANE_PATHS = RIFT_MAP.buildLanePaths(mapConfig);
const showPathDebug = new URLSearchParams(location.search).has('paths');

let units = [];
let bullets = [];
let particles = [];
let floatingTexts = [];
let kills = 0;
let redSpawnTimer = 0;

function proxyAvatar(url) {
  if (!url) return null;
  return `/api/avatar?url=${encodeURIComponent(url)}`;
}

function loadImage(url) {
  const src = proxyAvatar(url);
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) {
    const cached = imageCache.get(src);
    return cached instanceof HTMLImageElement && cached.complete
      ? Promise.resolve(cached)
      : cached;
  }
  const img = new Image();
  const promise = new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
  img.src = src;
  imageCache.set(src, promise);
  promise.then((loaded) => {
    if (loaded) imageCache.set(src, loaded);
  });
  return promise;
}

function pathForTeam(lane, team) {
  const path = LANE_PATHS[lane];
  return team === TEAMS.RED ? [...path].reverse() : path;
}

function pickLane() {
  return LANES[Math.floor(Math.random() * LANES.length)];
}

function spawnFloatingText(x, y, text, color = '#fff') {
  floatingTexts.push({ x, y, text, color, life: 90, vy: -1.2 });
}

function spawnParticles(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      life: 30 + Math.random() * 20,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

function spawnUnit(team, uniqueId, profileUrl, lane = null) {
  const chosenLane = lane || pickLane();
  const path = pathForTeam(chosenLane, team);
  const start = path[0];
  const unit = {
    id: `${team}-${uniqueId || 'ai'}-${Date.now()}-${Math.random()}`,
    team,
    uniqueId: uniqueId || null,
    profileUrl,
    img: null,
    lane: chosenLane,
    path,
    waypointIndex: 0,
    x: start.x + (Math.random() - 0.5) * 40,
    y: start.y + (Math.random() - 0.5) * 40,
    hp: team === TEAMS.BLUE ? 100 : 70,
    speed: 1.4 + Math.random() * 0.6,
    radius: team === TEAMS.BLUE ? 20 : 17,
    shootCooldown: Math.floor(Math.random() * SHOOT_COOLDOWN),
  };
  if (profileUrl) {
    loadImage(profileUrl).then((img) => {
      unit.img = img;
    });
  }
  units.push(unit);
  return unit;
}

function spawnRedUnit() {
  spawnUnit(TEAMS.RED, null, null);
}

function spawnBullet(fromX, fromY, team, targetX, targetY, damage = 30) {
  const dx = targetX - fromX;
  const dy = targetY - fromY;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = 11 + Math.random() * 3;
  bullets.push({
    x: fromX,
    y: fromY,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    team,
    damage,
    radius: 5,
  });
}

function unitsOnTeam(team) {
  return units.filter((u) => u.team === team);
}

function findNearestEnemy(unit) {
  const foes = unitsOnTeam(unit.team === TEAMS.BLUE ? TEAMS.RED : TEAMS.BLUE);
  let best = null;
  let bestDist = SHOOT_RANGE;
  for (const foe of foes) {
    const dist = Math.hypot(unit.x - foe.x, unit.y - foe.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = foe;
    }
  }
  return best;
}

function findUnitsByUser(uniqueId, team = TEAMS.BLUE) {
  return units.filter((u) => u.uniqueId === uniqueId && u.team === team);
}

function tryShoot(unit, target, damage = 30) {
  if (unit.shootCooldown > 0) return;
  spawnBullet(unit.x, unit.y, unit.team, target.x, target.y, damage);
  unit.shootCooldown = SHOOT_COOLDOWN;
}

function moveAlongPath(unit) {
  const idx = unit.waypointIndex;
  const target = unit.path[Math.min(idx, unit.path.length - 1)];
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 8 && idx < unit.path.length - 1) {
    unit.waypointIndex++;
    return;
  }

  if (dist > 1) {
    unit.x += (dx / dist) * unit.speed;
    unit.y += (dy / dist) * unit.speed;
  }
}

function handleFollow({ uniqueId, profileUrl }) {
  const lane = pickLane();
  spawnUnit(TEAMS.BLUE, uniqueId, profileUrl, lane);
  spawnFloatingText(BLUE_BASE.x, BLUE_BASE.y - 40, `@${uniqueId} joined Blue!`, '#7ee8ff');
}

function handleLike({ uniqueId, profileUrl, likeCount }) {
  const userUnits = findUnitsByUser(uniqueId, TEAMS.BLUE);
  const count = likeCount || 1;
  for (let i = 0; i < count; i++) {
    const shooter = userUnits[i % userUnits.length];
    if (shooter) {
      const target = findNearestEnemy(shooter);
      if (target) {
        spawnBullet(shooter.x, shooter.y, TEAMS.BLUE, target.x, target.y, 40);
      } else {
        spawnBullet(shooter.x, shooter.y, TEAMS.BLUE, RED_BASE.x, RED_BASE.y, 40);
      }
    } else {
      spawnBullet(
        BLUE_BASE.x + i * 10,
        BLUE_BASE.y,
        TEAMS.BLUE,
        RED_BASE.x,
        RED_BASE.y,
        35
      );
    }
  }
  if (!userUnits.length && profileUrl) {
    spawnUnit(TEAMS.BLUE, uniqueId, profileUrl);
  }
}

function handleGift({ uniqueId, profileUrl, troopCount, giftName, diamonds }) {
  const n = troopCount || 1;
  for (let i = 0; i < n; i++) {
    spawnUnit(TEAMS.BLUE, uniqueId, profileUrl, LANES[i % LANES.length]);
  }
  spawnFloatingText(
    BLUE_BASE.x + 40,
    BLUE_BASE.y - 80,
    `@${uniqueId} +${n} troops (${giftName || 'gift'} · ${diamonds || '?'}💎)`,
    '#ffd56a'
  );
}

socket.on('tiktok-status', ({ status, username, error, roomId }) => {
  if (status === 'connected') {
    statusEl.textContent = `LIVE @${username}${roomId ? ` · room ${roomId}` : ''}`;
    setupPanel.classList.add('hidden');
  } else if (status === 'connecting') {
    statusEl.textContent = `Connecting to @${username}…`;
  } else if (status === 'error') {
    statusEl.textContent = `Error: ${error || 'connection failed'}`;
  } else {
    statusEl.textContent = username ? `Offline / idle (@${username})` : 'Enter username & go LIVE';
  }
});

socket.on('game-event', (payload) => {
  switch (payload.event) {
    case 'follow':
      handleFollow(payload);
      break;
    case 'like':
      handleLike(payload);
      break;
    case 'gift':
      handleGift(payload);
      break;
    default:
      break;
  }
});

connectBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (!username) return;
  socket.emit('connect-tiktok', username);
});

function drawMapFallback() {
  ctx.fillStyle = '#1a2e1a';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(80, 140, 200, 0.35)';
  ctx.lineWidth = 28;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const lane of LANES) {
    const path = LANE_PATHS[lane];
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(30, 80, 160, 0.5)';
  ctx.beginPath();
  ctx.arc(BLUE_BASE.x, BLUE_BASE.y, 55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200, 50, 50, 0.5)';
  ctx.beginPath();
  ctx.arc(RED_BASE.x, RED_BASE.y, 55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BLUE', BLUE_BASE.x, BLUE_BASE.y + 6);
  ctx.fillText('RED', RED_BASE.x, RED_BASE.y + 6);
}

function drawPathDebug() {
  const colors = { top: '#7ee8ff', mid: '#ffe566', bot: '#ff8866' };
  for (const lane of LANES) {
    const path = LANE_PATHS[lane];
    ctx.strokeStyle = colors[lane];
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawBackground() {
  if (mapImage) {
    ctx.drawImage(mapImage, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, W, H);
  } else {
    drawMapFallback();
  }
  if (showPathDebug) drawPathDebug();
}

function drawUnit(unit) {
  const color = unit.team === TEAMS.BLUE ? '#25f4ee' : '#fe2c55';
  const { x, y, radius, img, uniqueId } = unit;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = unit.team === TEAMS.BLUE ? '#2a4a6a' : '#6a2a2a';
    ctx.fill();
  }
  ctx.restore();

  const hpW = 36;
  const maxHp = unit.team === TEAMS.BLUE ? 100 : 70;
  ctx.fillStyle = '#222';
  ctx.fillRect(x - hpW / 2, y - radius - 12, hpW, 4);
  ctx.fillStyle = unit.team === TEAMS.BLUE ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(x - hpW / 2, y - radius - 12, hpW * (unit.hp / maxHp), 4);

  if (uniqueId) {
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const short = uniqueId.length > 10 ? `${uniqueId.slice(0, 9)}…` : uniqueId;
    ctx.fillText(short, x, y + radius + 12);
  }
}

function update() {
  redSpawnTimer++;
  if (redSpawnTimer > 90) {
    redSpawnTimer = 0;
    if (unitsOnTeam(TEAMS.RED).length < 35) spawnRedUnit();
  }

  for (const unit of units) {
    moveAlongPath(unit);
    if (unit.shootCooldown > 0) unit.shootCooldown--;

    const target = findNearestEnemy(unit);
    if (target) tryShoot(unit, target);
  }

  for (const bullet of bullets) {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
  }

  bullets = bullets.filter((b) => b.x > -40 && b.x < W + 40 && b.y > -40 && b.y < H + 40);

  for (const bullet of bullets) {
    const foeTeam = bullet.team === TEAMS.BLUE ? TEAMS.RED : TEAMS.BLUE;
    for (const unit of unitsOnTeam(foeTeam)) {
      const dist = Math.hypot(bullet.x - unit.x, bullet.y - unit.y);
      if (dist < bullet.radius + unit.radius) {
        unit.hp -= bullet.damage;
        bullet.x = -9999;
        spawnParticles(unit.x, unit.y, bullet.team === TEAMS.BLUE ? '#7ee8ff' : '#ff6b4a', 5);
        if (unit.hp <= 0 && bullet.team === TEAMS.BLUE) {
          kills++;
          spawnParticles(unit.x, unit.y, '#ffaa00', 12);
        }
        break;
      }
    }
  }

  for (const a of units) {
    for (const b of units) {
      if (a.team === b.team || a.id >= b.id) continue;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < a.radius + b.radius) {
        a.hp -= 0.4;
        b.hp -= 0.4;
      }
    }
  }

  units = units.filter((u) => u.hp > 0);

  particles = particles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    return p.life > 0;
  });

  floatingTexts = floatingTexts.filter((t) => {
    t.y += t.vy;
    t.life--;
    return t.life > 0;
  });

  blueCountEl.textContent = String(unitsOnTeam(TEAMS.BLUE).length);
  redCountEl.textContent = String(unitsOnTeam(TEAMS.RED).length);
  killsEl.textContent = String(kills);
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();

  for (const unit of units) {
    drawUnit(unit);
  }

  for (const bullet of bullets) {
    ctx.fillStyle = bullet.team === TEAMS.BLUE ? '#7ee8ff' : '#ff8866';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  for (const p of particles) {
    ctx.globalAlpha = p.life / 50;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  for (const t of floatingTexts) {
    ctx.globalAlpha = t.life / 90;
    ctx.fillStyle = t.color;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t.text, t.x, t.y);
    ctx.globalAlpha = 1;
  }
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

for (let i = 0; i < 4; i++) spawnRedUnit();
loop();
