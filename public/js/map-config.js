/** Map path + turret config for 1920×1080 rift-map.png */
(function (global) {
  const STORAGE_KEY = 'rift-map-data';

  const TURRET_ORDER = { defend1: 0, defend2: 1, last: 2, base: 3 };

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
    turrets: [
      { lane: 'top', team: 'blue', type: 'defend1', x: 432, y: 291 },
      { lane: 'top', team: 'blue', type: 'defend2', x: 436, y: 500 },
      { lane: 'top', team: 'blue', type: 'last', x: 377, y: 648 },
      { lane: 'mid', team: 'blue', type: 'defend1', x: 806, y: 515 },
      { lane: 'mid', team: 'blue', type: 'defend2', x: 734, y: 612 },
      { lane: 'mid', team: 'blue', type: 'last', x: 604, y: 688 },
      { lane: 'bot', team: 'blue', type: 'defend1', x: 1264, y: 888 },
      { lane: 'bot', team: 'blue', type: 'defend2', x: 909, y: 852 },
      { lane: 'bot', team: 'blue', type: 'last', x: 647, y: 867 },
      { lane: 'base', team: 'blue', type: 'base', x: 379, y: 833 },
      { lane: 'top', team: 'red', type: 'defend1', x: 701, y: 143 },
      { lane: 'top', team: 'red', type: 'defend2', x: 967, y: 152 },
      { lane: 'top', team: 'red', type: 'last', x: 1155, y: 142 },
      { lane: 'mid', team: 'red', type: 'defend1', x: 1064, y: 396 },
      { lane: 'mid', team: 'red', type: 'defend2', x: 1117, y: 312 },
      { lane: 'mid', team: 'red', type: 'last', x: 1223, y: 254 },
      { lane: 'bot', team: 'red', type: 'defend1', x: 1536, y: 631 },
      { lane: 'bot', team: 'red', type: 'defend2', x: 1432, y: 413 },
      { lane: 'bot', team: 'red', type: 'last', x: 1420, y: 286 },
      { lane: 'base', team: 'red', type: 'base', x: 1361, y: 162 },
    ],
    meetPoints: null,
    /** Frames for all minions on a lane to reach the meet point (same arrival time). */
    meetMarchFrames: 240,
  };

  function defaultMeetPoints(lanePaths) {
    return {
      top: roundPoint(pointOnPath(lanePaths.top, 0.52)),
      mid: roundPoint(pointOnPath(lanePaths.mid, 0.5)),
      bot: roundPoint(pointOnPath(lanePaths.bot, 0.48)),
    };
  }

  function roundPoint(p) {
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  function ensureMeetPoints(config) {
    const paths = buildLanePaths(config);
    if (config.meetPoints?.top && config.meetPoints?.mid && config.meetPoints?.bot) {
      return config.meetPoints;
    }
    return defaultMeetPoints(paths);
  }

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

  function defaultTurretPlacements(config, lanePaths) {
    const list = [];
    const laneSlots = [
      { team: 'blue', type: 'defend1', t: 0.3 },
      { team: 'blue', type: 'defend2', t: 0.22 },
      { team: 'blue', type: 'last', t: 0.14 },
      { team: 'red', type: 'defend1', t: 0.7 },
      { team: 'red', type: 'defend2', t: 0.78 },
      { team: 'red', type: 'last', t: 0.86 },
    ];
    for (const lane of ['top', 'mid', 'bot']) {
      const path = lanePaths[lane];
      for (const s of laneSlots) {
        const pos = pointOnPath(path, s.t);
        list.push({
          lane,
          team: s.team,
          type: s.type,
          x: Math.round(pos.x),
          y: Math.round(pos.y),
        });
      }
    }
    list.push({
      lane: 'base',
      team: 'blue',
      type: 'base',
      x: config.blueBase.x,
      y: config.blueBase.y - 50,
    });
    list.push({
      lane: 'base',
      team: 'red',
      type: 'base',
      x: config.redBase.x,
      y: config.redBase.y + 50,
    });
    return list;
  }

  function turretStats(type) {
    switch (type) {
      case 'base':
        return { maxHp: 2000, radius: 34, range: 280, damage: 38, shootDelay: 38 };
      case 'last':
        return { maxHp: 900, radius: 28, range: 250, damage: 28, shootDelay: 46 };
      case 'defend2':
        return { maxHp: 650, radius: 26, range: 240, damage: 24, shootDelay: 50 };
      default:
        return { maxHp: 550, radius: 24, range: 235, damage: 22, shootDelay: 52 };
    }
  }

  function buildTurrets(config, lanePaths) {
    const placements =
      config.turrets?.length > 0
        ? config.turrets
        : defaultTurretPlacements(config, lanePaths);

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
        range: p.range ?? stats.range,
        damage: stats.damage,
        shootCooldown: 0,
        shootDelay: stats.shootDelay,
        currentTarget: null,
      };
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = JSON.parse(JSON.stringify(DEFAULT_MAP));
        fresh.meetPoints = ensureMeetPoints(fresh);
        return fresh;
      }
      const parsed = JSON.parse(raw);
      const merged = {
        ...DEFAULT_MAP,
        ...parsed,
        lanes: parsed.lanes || DEFAULT_MAP.lanes,
        turrets: parsed.turrets?.length ? parsed.turrets : DEFAULT_MAP.turrets,
      };
      merged.meetPoints = ensureMeetPoints(merged);
      merged.meetMarchFrames = parsed.meetMarchFrames ?? DEFAULT_MAP.meetMarchFrames;
      return merged;
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
    TURRET_ORDER,
    load,
    save,
    clear,
    buildLanePaths,
    buildTurrets,
    pointOnPath,
    defaultTurretPlacements,
    defaultMeetPoints,
    ensureMeetPoints,
    turretStats,
  };
})(window);
