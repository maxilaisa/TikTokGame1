/** Map path + turret config for 1920×1080 rift-map.png */
(function (global) {
  const STORAGE_KEY = 'rift-map-data';

  const DEFAULT_MAP = {
    blueBase: { x: 246, y: 938 },
    redBase: { x: 1423, y: 112 },
    lanes: {
      top: [
        { x: 390, y: 597 },
        { x: 453, y: 292 },
        { x: 539, y: 199 },
        { x: 688, y: 144 },
        { x: 1095, y: 139 },
      ],
      mid: [
        { x: 657, y: 649 },
        { x: 939, y: 456 },
        { x: 1184, y: 282 },
      ],
      bot: [
        { x: 718, y: 877 },
        { x: 1256, y: 885 },
        { x: 1447, y: 781 },
        { x: 1504, y: 630 },
        { x: 1427, y: 324 },
      ],
    },
    turrets: [],
  };

  function buildLanePaths(config) {
    const { blueBase, redBase, lanes } = config;
    const out = {};
    for (const lane of ['top', 'mid', 'bot']) {
      const mid = lanes[lane] || [];
      out[lane] = [blueBase, ...mid, redBase];
    }
    return out;
  }

  function pointOnPath(path, t) {
    const segments = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const len = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      segments.push(len);
      total += len;
    }
    let remaining = t * total;
    for (let i = 1; i < path.length; i++) {
      const len = segments[i - 1];
      if (remaining <= len || i === path.length - 1) {
        const f = len > 0 ? remaining / len : 0;
        return {
          x: path[i - 1].x + (path[i].x - path[i - 1].x) * f,
          y: path[i - 1].y + (path[i].y - path[i - 1].y) * f,
        };
      }
      remaining -= len;
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y };
  }

  function defaultTurretPlacements(lanePaths) {
    const slots = [
      { team: 'blue', type: 'defend', t: 0.28 },
      { team: 'blue', type: 'main', t: 0.14 },
      { team: 'red', type: 'defend', t: 0.72 },
      { team: 'red', type: 'main', t: 0.86 },
    ];
    const list = [];
    for (const lane of ['top', 'mid', 'bot']) {
      const path = lanePaths[lane];
      for (const s of slots) {
        const pos = pointOnPath(path, s.t);
        list.push({ lane, team: s.team, type: s.type, x: Math.round(pos.x), y: Math.round(pos.y) });
      }
    }
    return list;
  }

  function turretStats(type) {
    if (type === 'main') {
      return { maxHp: 1200, radius: 30, range: 260, damage: 32, shootDelay: 42 };
    }
    return { maxHp: 700, radius: 26, range: 240, damage: 24, shootDelay: 48 };
  }

  function buildTurrets(config, lanePaths) {
    const placements =
      config.turrets?.length > 0 ? config.turrets : defaultTurretPlacements(lanePaths);

    return placements.map((p, i) => {
      const stats = turretStats(p.type);
      return {
        id: `t-${p.lane}-${p.team}-${p.type}-${i}`,
        lane: p.lane,
        team: p.team,
        type: p.type,
        x: p.x,
        y: p.y,
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        radius: stats.radius,
        range: stats.range,
        damage: stats.damage,
        shootCooldown: 0,
        shootDelay: stats.shootDelay,
        currentTarget: null,
        targetKind: null,
      };
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_MAP));
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_MAP, ...parsed, lanes: parsed.lanes || DEFAULT_MAP.lanes };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_MAP));
    }
  }

  function save(config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  global.RIFT_MAP = {
    STORAGE_KEY,
    DEFAULT_MAP,
    load,
    save,
    clear,
    buildLanePaths,
    buildTurrets,
    pointOnPath,
    defaultTurretPlacements,
    turretStats,
  };
})(window);
