const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const blueMinionsEl = document.getElementById('blue-minions');
const redMinionsEl = document.getElementById('red-minions');
const playersEl = document.getElementById('player-count');
const turretsEl = document.getElementById('turrets-down');
const setupPanel = document.getElementById('setup-panel');
const usernameInput = document.getElementById('username');
const connectBtn = document.getElementById('connect-btn');

const W = canvas.width;
const H = canvas.height;

const TEAMS = { BLUE: 'blue', RED: 'red' };
const LANES = ['top', 'mid', 'bot'];
const ROLES = ['melee', 'mage', 'marksman'];
const ROLE_OFFSET = { melee: 38, mage: 12, marksman: -18 };
const WAVE_INTERVAL = 120;

const ROLE_CONFIG = {
  melee: {
    range: 48,
    damage: 20,
    cooldown: 42,
    animFrames: 16,
    hitFrame: 9,
    hp: 72,
    speed: 1.65,
    radius: 13,
    color: '#6eb5ff',
  },
  mage: {
    range: 155,
    damage: 26,
    cooldown: 52,
    animFrames: 22,
    hitFrame: 14,
    hp: 52,
    speed: 1.35,
    radius: 11,
    color: '#c77dff',
  },
  marksman: {
    range: 195,
    damage: 22,
    cooldown: 38,
    animFrames: 12,
    hitFrame: 6,
    hp: 48,
    speed: 1.25,
    radius: 10,
    color: '#ffd56a',
  },
};

const socket = io();
const imageCache = new Map();

let mapImage = null;
const mapImg = new Image();
mapImg.onload = () => {
  mapImage = mapImg;
};
mapImg.src = '/assets/rift-map.png';

const mapData = RIFT_MAP.load();
const BLUE_BASE = mapData.blueBase;
const RED_BASE = mapData.redBase;
const LANE_PATHS = RIFT_MAP.buildLanePaths(mapData);
let turrets = RIFT_MAP.buildTurrets(mapData, LANE_PATHS);

let minions = [];
let players = [];
let bullets = [];
let attackAnims = [];
let particles = [];
let floatingTexts = [];
let turretsDestroyed = 0;
let waveTimer = 0;

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

function pathTangent(path) {
  const a = path[0];
  const b = path[1] || path[0];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

function pickLane() {
  return LANES[Math.floor(Math.random() * LANES.length)];
}

function enemyTeam(team) {
  return team === TEAMS.BLUE ? TEAMS.RED : TEAMS.BLUE;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isAlive(target) {
  if (!target) return false;
  if (target.hp !== undefined) return target.hp > 0;
  return true;
}

function allUnits() {
  return [...minions, ...players];
}

function minionsOnTeam(team, lane = null) {
  return minions.filter((m) => m.team === team && (!lane || m.lane === lane));
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

function makeLaneUnit(team, lane, stats) {
  const path = pathForTeam(lane, team);
  const tan = pathTangent(path);
  const start = path[0];
  const off = stats.formationOffset || 0;
  return {
    team,
    lane,
    path,
    waypointIndex: 0,
    x: start.x + tan.x * off + (Math.random() - 0.5) * 8,
    y: start.y + tan.y * off + (Math.random() - 0.5) * 8,
    lockedTarget: null,
    attackCooldown: Math.floor(Math.random() * 20),
    attackAnim: null,
    turretEnteredAt: {},
    isPlayer: false,
    ...stats,
  };
}

function spawnMinion(team, lane, role) {
  const cfg = ROLE_CONFIG[role];
  const minion = makeLaneUnit(team, lane, {
    id: `minion-${team}-${lane}-${role}-${Date.now()}`,
    role,
    hp: cfg.hp,
    maxHp: cfg.hp,
    speed: cfg.speed,
    radius: cfg.radius,
    roleConfig: cfg,
    formationOffset: ROLE_OFFSET[role],
    isPlayer: false,
  });
  minions.push(minion);
  return minion;
}

function maintainLaneMinions() {
  for (const lane of LANES) {
    for (const team of [TEAMS.BLUE, TEAMS.RED]) {
      const laneMinions = minionsOnTeam(team, lane);
      for (const role of ROLES) {
        if (!laneMinions.some((m) => m.role === role)) {
          spawnMinion(team, lane, role);
        }
      }
    }
  }
}

function spawnPlayer(uniqueId, profileUrl, lane = null) {
  if (players.some((p) => p.uniqueId === uniqueId)) return null;
  const chosenLane = lane || pickLane();
  const player = makeLaneUnit(TEAMS.BLUE, chosenLane, {
    id: `player-${uniqueId}`,
    uniqueId,
    img: null,
    hp: 130,
    maxHp: 130,
    speed: 1.85,
    radius: 22,
    roleConfig: { range: 175, damage: 34, cooldown: 28, animFrames: 14, hitFrame: 7 },
    formationOffset: 0,
    isPlayer: true,
  });
  loadImage(profileUrl).then((img) => {
    player.img = img;
  });
  players.push(player);
  return player;
}

function findPlayerByUser(uniqueId) {
  return players.find((p) => p.uniqueId === uniqueId);
}

function livingTurrets(team = null, lane = null) {
  return turrets.filter((t) => {
    if (t.hp <= 0) return false;
    if (team && t.team !== team) return false;
    if (lane && t.lane !== lane) return false;
    return true;
  });
}

/** Defend (outer) before main (inner) for attackers */
function sortedEnemyTurrets(unit) {
  const foes = livingTurrets(enemyTeam(unit.team), unit.lane);
  return foes.sort((a, b) => {
    const order = { defend: 0, main: 1 };
    const oa = order[a.type] ?? 0;
    const ob = order[b.type] ?? 0;
    if (oa !== ob) return oa - ob;
    return dist(unit, a) - dist(unit, b);
  });
}

function targetEnemyTurret(unit) {
  const sorted = sortedEnemyTurrets(unit);
  const outer = sorted[0];
  if (!outer) return null;
  if (dist(unit, outer) < unit.roleConfig.range + outer.radius + 20) return outer;
  return null;
}

function acquireTarget(unit) {
  const range = unit.roleConfig.range + 30;
  const enemyMinions = minions.filter(
    (m) =>
      m.team === enemyTeam(unit.team) &&
      m.lane === unit.lane &&
      isAlive(m) &&
      dist(unit, m) < range
  );
  if (enemyMinions.length) {
    return enemyMinions.sort((a, b) => dist(unit, a) - dist(unit, b))[0];
  }
  return targetEnemyTurret(unit);
}

function ensureLockedTarget(unit) {
  if (isAlive(unit.lockedTarget) && dist(unit, unit.lockedTarget) < unit.roleConfig.range + 80) {
    return unit.lockedTarget;
  }
  unit.lockedTarget = acquireTarget(unit);
  return unit.lockedTarget;
}

function spawnBullet(fromX, fromY, team, targetX, targetY, damage = 28) {
  const dx = targetX - fromX;
  const dy = targetY - fromY;
  const d = Math.hypot(dx, dy) || 1;
  const speed = 12;
  bullets.push({
    x: fromX,
    y: fromY,
    vx: (dx / d) * speed,
    vy: (dy / d) * speed,
    team,
    damage,
    radius: 5,
  });
}

function startAttackAnim(unit, target) {
  const cfg = unit.roleConfig;
  unit.attackAnim = {
    frame: 0,
    maxFrame: cfg.animFrames,
    hitFrame: cfg.hitFrame,
    targetId: target.id,
    targetX: target.x,
    targetY: target.y,
    role: unit.role || 'player',
    team: unit.team,
    x: unit.x,
    y: unit.y,
    hit: false,
  };
}

function applyAttackHit(unit, target) {
  if (!isAlive(target)) return;
  if (target.maxHp && target.shootDelay !== undefined) {
    damageTurret(target, unit.roleConfig.damage, unit.team);
    return;
  }
  target.hp -= unit.roleConfig.damage;
  spawnParticles(target.x, target.y, unit.team === TEAMS.BLUE ? '#7ee8ff' : '#ff6b4a', 4);
}

function tickAttackAnim(unit) {
  const anim = unit.attackAnim;
  if (!anim) return false;

  anim.frame++;
  const target = unit.lockedTarget;
  if (target) {
    anim.targetX = target.x;
    anim.targetY = target.y;
  }

  if (!anim.hit && anim.frame >= anim.hitFrame) {
    anim.hit = true;
    applyAttackHit(unit, target);
  }

  if (anim.frame >= anim.maxFrame) {
    unit.attackAnim = null;
    unit.attackCooldown = unit.roleConfig.cooldown;
    return false;
  }
  return true;
}

function damageTurret(turret, amount, killerTeam) {
  turret.hp -= amount;
  spawnParticles(turret.x, turret.y, killerTeam === TEAMS.BLUE ? '#7ee8ff' : '#ff6b4a', 4);
  if (turret.hp <= 0) {
    turretsDestroyed++;
    turret.currentTarget = null;
    spawnParticles(turret.x, turret.y, '#ffaa00', 16);
    spawnFloatingText(turret.x, turret.y - 30, 'TURRET DOWN!', '#ffd56a');
  }
}

function moveAlongPath(unit) {
  const idx = unit.waypointIndex;
  const target = unit.path[Math.min(idx, unit.path.length - 1)];
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const d = Math.hypot(dx, dy);
  if (d < 8 && idx < unit.path.length - 1) {
    unit.waypointIndex++;
    return;
  }
  if (d > 1) {
    unit.x += (dx / d) * unit.speed;
    unit.y += (dy / d) * unit.speed;
  }
}

function moveToward(unit, target) {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const d = Math.hypot(dx, dy) || 1;
  unit.x += (dx / d) * unit.speed;
  unit.y += (dy / d) * unit.speed;
}

function updateLaneUnit(unit) {
  if (tickAttackAnim(unit)) return;

  if (unit.attackCooldown > 0) unit.attackCooldown--;

  const target = ensureLockedTarget(unit);
  if (!target) {
    moveAlongPath(unit);
    return;
  }

  const inRange = dist(unit, target) <= unit.roleConfig.range + (target.radius || 0);

  if (!inRange) {
    moveToward(unit, target);
    return;
  }

  if (unit.attackCooldown <= 0 && !unit.attackAnim) {
    startAttackAnim(unit, target);
  }
}

function trackTurretAggro(turret) {
  const now = performance.now();
  const inRange = allUnits().filter(
    (u) => u.lane === turret.lane && u.team === enemyTeam(turret.team) && dist(turret, u) <= turret.range
  );

  for (const u of inRange) {
    if (!u.turretEnteredAt[turret.id]) {
      u.turretEnteredAt[turret.id] = now;
    }
  }

  const minionsInRange = inRange.filter((u) => !u.isPlayer);
  const playersInRange = inRange.filter((u) => u.isPlayer);

  // MOBA: minions always draw turret aggro over players in range
  const pool = minionsInRange.length ? minionsInRange : playersInRange;
  pool.sort((a, b) => (a.turretEnteredAt[turret.id] || 0) - (b.turretEnteredAt[turret.id] || 0));

  const pick = pool[0] || null;
  if (
    pick &&
    turret.currentTarget === pick &&
    isAlive(pick) &&
    dist(turret, pick) <= turret.range
  ) {
    return pick;
  }

  turret.currentTarget = pick;
  return pick;
}

function updateTurrets() {
  for (const turret of turrets) {
    if (turret.hp <= 0) continue;
    if (turret.shootCooldown > 0) turret.shootCooldown--;

    const target = trackTurretAggro(turret);
    if (target && turret.shootCooldown <= 0) {
      spawnBullet(turret.x, turret.y - 12, turret.team, target.x, target.y, turret.damage);
      turret.shootCooldown = turret.shootDelay;
    }
  }
}

function updateBullets() {
  for (const b of bullets) {
    b.x += b.vx;
    b.y += b.vy;
  }
  bullets = bullets.filter((b) => b.x > -40 && b.x < W + 40 && b.y > -40 && b.y < H + 40);

  for (const bullet of bullets) {
    if (bullet.x < -100) continue;
    const foeTeam = enemyTeam(bullet.team);

    for (const turret of livingTurrets(foeTeam)) {
      if (dist(bullet, turret) < bullet.radius + turret.radius) {
        damageTurret(turret, bullet.damage, bullet.team);
        bullet.x = -9999;
        break;
      }
    }
    if (bullet.x < -100) continue;

    for (const u of allUnits().filter((u) => u.team === foeTeam)) {
      if (dist(bullet, u) < bullet.radius + u.radius) {
        u.hp -= bullet.damage;
        bullet.x = -9999;
        spawnParticles(u.x, u.y, '#ffaa00', 5);
        break;
      }
    }
  }
}

function pickAttackTarget(player) {
  const turret = targetEnemyTurret(player);
  const locked = ensureLockedTarget(player);
  return turret || locked;
}

function handleFollow({ uniqueId, profileUrl }) {
  const existing = findPlayerByUser(uniqueId);
  if (existing) {
    spawnFloatingText(existing.x, existing.y - 30, `@${uniqueId} already in game!`, '#7ee8ff');
    return;
  }
  const player = spawnPlayer(uniqueId, profileUrl, pickLane());
  if (player) spawnFloatingText(player.x, player.y - 40, `@${uniqueId} joined!`, '#7ee8ff');
}

function handleLike({ uniqueId, likeCount }) {
  const player = findPlayerByUser(uniqueId);
  if (!player) return;
  const count = likeCount || 1;
  for (let i = 0; i < count; i++) {
    const target = pickAttackTarget(player);
    if (target) spawnBullet(player.x, player.y, TEAMS.BLUE, target.x, target.y, 44);
    else spawnBullet(player.x, player.y, TEAMS.BLUE, RED_BASE.x, RED_BASE.y, 30);
  }
}

function handleGift({ uniqueId, troopCount, giftName, diamonds }) {
  const player = findPlayerByUser(uniqueId);
  if (!player) {
    spawnFloatingText(BLUE_BASE.x, BLUE_BASE.y - 60, `@${uniqueId} — follow to join!`, '#ffd56a');
    return;
  }
  const bonus = troopCount || 1;
  player.hp = Math.min(player.maxHp, player.hp + 15 * bonus);
  for (let i = 0; i < Math.min(bonus, 6); i++) {
    const target = pickAttackTarget(player);
    if (target) spawnBullet(player.x, player.y, TEAMS.BLUE, target.x, target.y, 52);
  }
  spawnFloatingText(
    player.x,
    player.y - 50,
    `+power (${giftName || 'gift'} · ${diamonds || '?'}💎)`,
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

function drawBackground() {
  if (mapImage) {
    ctx.drawImage(mapImage, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawTurret(turret) {
  if (turret.hp <= 0) return;
  const isBlue = turret.team === TEAMS.BLUE;
  const isMain = turret.type === 'main';
  const glow = isBlue ? '#25f4ee' : '#fe2c55';
  const h = isMain ? 34 : 28;

  ctx.save();
  ctx.translate(turret.x, turret.y);
  ctx.fillStyle = isBlue ? '#1a4a8a' : '#8a1a1a';
  ctx.strokeStyle = isMain ? '#ffd56a' : glow;
  ctx.lineWidth = isMain ? 4 : 2;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(isMain ? 26 : 20, 14);
  ctx.lineTo(isMain ? -26 : -20, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const hpW = isMain ? 54 : 46;
  ctx.fillStyle = '#222';
  ctx.fillRect(-hpW / 2, -h - 14, hpW, 5);
  ctx.fillStyle = isBlue ? '#3498db' : '#e74c3c';
  ctx.fillRect(-hpW / 2, -h - 14, hpW * (turret.hp / turret.maxHp), 5);
  ctx.restore();
}

function drawMinion(m) {
  const cfg = ROLE_CONFIG[m.role];
  ctx.save();
  ctx.shadowColor = cfg.color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = cfg.color;
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#fff';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(m.role[0].toUpperCase(), m.x, m.y + 3);
  ctx.restore();

  const hpW = 22;
  ctx.fillStyle = '#222';
  ctx.fillRect(m.x - hpW / 2, m.y - m.radius - 7, hpW, 3);
  ctx.fillStyle = m.team === TEAMS.BLUE ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(m.x - hpW / 2, m.y - m.radius - 7, hpW * (m.hp / m.maxHp), 3);
}

function drawPlayer(p) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius + 3, 0, Math.PI * 2);
  ctx.fillStyle = '#25f4ee';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.clip();
  if (p.img) ctx.drawImage(p.img, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
  else {
    ctx.fillStyle = '#2a4a6a';
    ctx.fill();
  }
  ctx.restore();

  const hpW = 40;
  ctx.fillStyle = '#222';
  ctx.fillRect(p.x - hpW / 2, p.y - p.radius - 12, hpW, 4);
  ctx.fillStyle = '#2ecc71';
  ctx.fillRect(p.x - hpW / 2, p.y - p.radius - 12, hpW * (p.hp / p.maxHp), 4);
}

function drawAttackAnimations() {
  for (const m of minions) {
    if (m.attackAnim) drawUnitAttack(m, m.attackAnim);
  }
  for (const p of players) {
    if (p.attackAnim) drawUnitAttack(p, p.attackAnim);
  }
}

function drawUnitAttack(unit, anim) {
  const t = anim.frame / anim.maxFrame;
  const role = anim.role || unit.role || 'player';
  const color = unit.role ? ROLE_CONFIG[unit.role].color : '#7ee8ff';

  if (role === 'melee') {
    const angle = Math.atan2(anim.targetY - anim.y, anim.targetX - anim.x);
    const sweep = t * Math.PI * 0.9;
    ctx.save();
    ctx.translate(anim.x, anim.y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 1 - t * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, unit.radius + 18, -sweep / 2, sweep / 2);
    ctx.stroke();
    ctx.restore();
  } else if (role === 'mage') {
    const pulse = 8 + t * 22;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35 + t * 0.4;
    ctx.beginPath();
    ctx.arc(anim.x, anim.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    if (anim.frame >= anim.hitFrame) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(anim.x, anim.y);
      ctx.lineTo(anim.targetX, anim.targetY);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(anim.targetX, anim.targetY, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4 + t * 0.6;
    ctx.beginPath();
    ctx.moveTo(anim.x, anim.y);
    const mx = anim.x + (anim.targetX - anim.x) * t;
    const my = anim.y + (anim.targetY - anim.y) * t;
    ctx.lineTo(mx, my);
    ctx.stroke();
    if (anim.hit) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(anim.targetX, anim.targetY, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function update() {
  waveTimer++;
  if (waveTimer >= WAVE_INTERVAL) {
    waveTimer = 0;
    maintainLaneMinions();
  }

  for (const m of minions) updateLaneUnit(m);
  for (const p of players) updateLaneUnit(p);

  updateTurrets();
  updateBullets();

  minions = minions.filter((m) => m.hp > 0);
  players = players.filter((p) => p.hp > 0);

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

  blueMinionsEl.textContent = String(minionsOnTeam(TEAMS.BLUE).length);
  redMinionsEl.textContent = String(minionsOnTeam(TEAMS.RED).length);
  playersEl.textContent = String(players.length);
  turretsEl.textContent = String(turretsDestroyed);
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  for (const t of turrets) drawTurret(t);
  for (const m of minions) drawMinion(m);
  for (const p of players) drawPlayer(p);
  drawAttackAnimations();

  for (const bullet of bullets) {
    ctx.fillStyle = bullet.team === TEAMS.BLUE ? '#7ee8ff' : '#ff8866';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
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

maintainLaneMinions();
loop();
