const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const allyCountEl = document.getElementById('ally-count');
const enemyCountEl = document.getElementById('enemy-count');
const killsEl = document.getElementById('kills');
const setupPanel = document.getElementById('setup-panel');
const usernameInput = document.getElementById('username');
const connectBtn = document.getElementById('connect-btn');

const W = canvas.width;
const H = canvas.height;
const GROUND_Y = H * 0.72;

const socket = io();
const imageCache = new Map();

let allies = [];
let enemies = [];
let bullets = [];
let particles = [];
let floatingTexts = [];
let kills = 0;
let enemySpawnTimer = 0;

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

function spawnAlly(uniqueId, profileUrl, x = 80, y = null) {
  const ally = {
    id: `${uniqueId}-${Date.now()}-${Math.random()}`,
    uniqueId,
    profileUrl,
    img: null,
    x,
    y: y ?? GROUND_Y - 40 - Math.random() * 120,
    hp: 100,
    speed: 0.6 + Math.random() * 0.4,
    radius: 22,
    shootCooldown: 0,
  };
  loadImage(profileUrl).then((img) => {
    ally.img = img;
  });
  allies.push(ally);
  return ally;
}

function spawnEnemy() {
  enemies.push({
    id: `enemy-${Date.now()}`,
    x: W + 40,
    y: GROUND_Y - 30 - Math.random() * 100,
    hp: 60,
    speed: 0.8 + Math.random() * 0.6,
    radius: 18,
  });
}

function spawnBullet(fromX, fromY, ownerId) {
  bullets.push({
    x: fromX,
    y: fromY,
    vx: 14 + Math.random() * 4,
    vy: (Math.random() - 0.5) * 2,
    ownerId,
    radius: 4,
  });
}

function findAllyByUser(uniqueId) {
  return allies.filter((a) => a.uniqueId === uniqueId);
}

function handleFollow({ uniqueId, profileUrl }) {
  spawnAlly(uniqueId, profileUrl);
  spawnFloatingText(120, GROUND_Y - 80, `@${uniqueId} joined the war!`, '#7ee8ff');
}

function handleLike({ uniqueId, profileUrl, likeCount }) {
  const userAllies = findAllyByUser(uniqueId);
  const count = likeCount || 1;
  for (let i = 0; i < count; i++) {
    if (userAllies.length) {
      const ally = userAllies[i % userAllies.length];
      spawnBullet(ally.x + ally.radius, ally.y, uniqueId);
    } else {
      spawnBullet(60 + i * 8, GROUND_Y - 60 - Math.random() * 80, uniqueId);
    }
  }
  if (!userAllies.length && profileUrl) {
    spawnAlly(uniqueId, profileUrl, 40, GROUND_Y - 50);
  }
}

function handleGift({ uniqueId, profileUrl, troopCount, giftName, diamonds }) {
  const n = troopCount || 1;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    spawnAlly(uniqueId, profileUrl, 50 + col * 45, GROUND_Y - 90 - row * 50 - Math.random() * 30);
  }
  spawnFloatingText(
    140,
    GROUND_Y - 120,
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

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#1e3a5f');
  sky.addColorStop(1, '#2d1f3d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  ctx.fillStyle = '#3d2818';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  ctx.fillStyle = '#2a4a2a';
  ctx.fillRect(0, GROUND_Y, W * 0.45, 12);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(W * 0.78, GROUND_Y - 140, 120, 140);
  ctx.fillStyle = '#5a3030';
  ctx.beginPath();
  ctx.moveTo(W * 0.78, GROUND_Y - 140);
  ctx.lineTo(W * 0.78 + 60, GROUND_Y - 200);
  ctx.lineTo(W * 0.78 + 120, GROUND_Y - 140);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8b2020';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('ENEMY BASE', W * 0.78 + 8, GROUND_Y - 150);
}

function drawUnit(x, y, radius, color, img, label) {
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
    ctx.fillStyle = '#445';
    ctx.fill();
  }
  ctx.restore();

  if (label) {
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const short = label.length > 12 ? `${label.slice(0, 11)}…` : label;
    ctx.fillText(short, x, y + radius + 14);
  }
}

function update() {
  enemySpawnTimer++;
  if (enemySpawnTimer > 120) {
    enemySpawnTimer = 0;
    if (enemies.length < 40) spawnEnemy();
  }

  for (const ally of allies) {
    ally.x += ally.speed;
    ally.x = Math.min(ally.x, W * 0.55);
    if (ally.shootCooldown > 0) ally.shootCooldown--;
  }

  for (const enemy of enemies) {
    enemy.x -= enemy.speed;
  }

  for (const bullet of bullets) {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
  }

  bullets = bullets.filter((b) => b.x < W + 20 && b.x > -20);
  enemies = enemies.filter((e) => e.x > -50 && e.hp > 0);
  allies = allies.filter((a) => a.hp > 0 && a.x > -30);

  for (const bullet of bullets) {
    for (const enemy of enemies) {
      const dx = bullet.x - enemy.x;
      const dy = bullet.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bullet.radius + enemy.radius) {
        enemy.hp -= 35;
        bullet.x = -999;
        spawnParticles(enemy.x, enemy.y, '#ff6b4a', 5);
        if (enemy.hp <= 0) {
          kills++;
          spawnParticles(enemy.x, enemy.y, '#ffaa00', 12);
        }
        break;
      }
    }
  }

  for (const ally of allies) {
    for (const enemy of enemies) {
      const dist = Math.hypot(ally.x - enemy.x, ally.y - enemy.y);
      if (dist < ally.radius + enemy.radius) {
        ally.hp -= 0.8;
        enemy.hp -= 0.5;
      }
    }
  }

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

  allyCountEl.textContent = String(allies.length);
  enemyCountEl.textContent = String(enemies.length);
  killsEl.textContent = String(kills);
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();

  for (const enemy of enemies) {
    drawUnit(enemy.x, enemy.y, enemy.radius, '#c0392b', null, null);
  }

  for (const ally of allies) {
    drawUnit(ally.x, ally.y, ally.radius, '#25f4ee', ally.img, ally.uniqueId);
    const hpW = 40;
    ctx.fillStyle = '#222';
    ctx.fillRect(ally.x - hpW / 2, ally.y - ally.radius - 10, hpW, 4);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(ally.x - hpW / 2, ally.y - ally.radius - 10, hpW * (ally.hp / 100), 4);
  }

  for (const bullet of bullets) {
    ctx.fillStyle = '#ffe566';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#ffe566';
    ctx.shadowBlur = 8;
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

spawnEnemy();
spawnEnemy();
loop();
