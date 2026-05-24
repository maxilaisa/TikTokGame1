/** Shared map path config (1920×1080 canvas coords). */
(function (global) {
  const STORAGE_KEY = 'rift-map-paths';

  function defaults(W, H) {
    const blueBase = { x: 200, y: H - 200 };
    const redBase = { x: W - 200, y: 200 };
    return {
      blueBase,
      redBase,
      lanes: {
        top: [
          { x: 320, y: H - 380 },
          { x: 420, y: 420 },
          { x: 1100, y: 260 },
        ],
        mid: [
          { x: 520, y: H - 420 },
          { x: W * 0.5, y: H * 0.5 },
          { x: W - 520, y: 320 },
        ],
        bot: [
          { x: 480, y: H - 120 },
          { x: 1150, y: H - 160 },
          { x: W - 420, y: H * 0.48 },
        ],
      },
    };
  }

  function load(W, H) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults(W, H);
      const parsed = JSON.parse(raw);
      if (!parsed.blueBase || !parsed.redBase || !parsed.lanes) return defaults(W, H);
      return parsed;
    } catch {
      return defaults(W, H);
    }
  }

  function save(config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Full paths for gameplay: blue → waypoints → red */
  function buildLanePaths(config) {
    const { blueBase, redBase, lanes } = config;
    const out = {};
    for (const lane of ['top', 'mid', 'bot']) {
      const mid = lanes[lane] || [];
      out[lane] = [blueBase, ...mid, redBase];
    }
    return out;
  }

  function toExportJson(config) {
    return JSON.stringify(config, null, 2);
  }

  global.RIFT_MAP = {
    STORAGE_KEY,
    defaults,
    load,
    save,
    clear,
    buildLanePaths,
    toExportJson,
  };
})(window);
