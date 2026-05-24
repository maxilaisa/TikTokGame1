# TikTok Live War

Interactive overlay game for TikTok LIVE streams, designed for **OBS / TikTok Studio** browser sources and deployed on **Railway**.

| Viewer action | In-game effect |
|---------------|----------------|
| **Follow** | **Joins the game** as your champion (avatar on the map) — must follow your account |
| **Like** | Fires shots (only if they already followed and are in-game) |
| **Gift / donation** | Heals + bonus shots for their champion (must be in-game) |

## Quick start (local)

1. Install [Node.js 18+](https://nodejs.org/).
2. Copy `.env.example` to `.env` and set `TIKTOK_USERNAME` to your TikTok handle (no `@`).
3. **Go LIVE on TikTok**, then run:

```bash
npm install
npm start
```

4. Open `http://localhost:3000`, enter your username if needed, click **Connect to LIVE**.
5. Add a **Browser Source** in OBS pointing at your game URL (1920×1080 recommended). Crop out the connect panel after connecting.

## Deploy on Railway

1. Push this repo to GitHub.
2. Create a project at [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. In Railway **Variables**, add:
   - `TIKTOK_USERNAME` = your TikTok username (no `@`)
4. Railway sets `PORT` automatically. After deploy, open your public URL (e.g. `https://your-app.up.railway.app`).
5. Use that URL as your OBS browser source while you are LIVE.

Health check: `GET /health`

## How it works

- **Backend** (`server.js`) uses [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) to listen for follow, like, and gift events from your live room.
- **WebSocket** (Socket.IO) pushes events to the browser game in real time.
- **Frontend** (`public/js/game.js`) — **3 AI minions per team per lane** (melee → mage → marksman). Per lane: **2 defend + 1 last** turret + **base turret** at nexus (destroy base = that team loses). Lanes **without a follower** are minion-only 1v1 ties (no respawns). Place turrets via `/map-editor.html`.

## Tips for streaming

- You must be **LIVE** before connecting; otherwise TikTok has no room to join.
- High-traffic streams may throttle **like** events (TikTok limitation, not this app).
- Gift streaks are handled so troops spawn when the streak **ends** (final gift count).
- For a cleaner overlay, hide `#setup-panel` via OBS crop after the first successful connect.
- Optional: get a free [Euler Stream](https://www.eulerstream.com) API key if connections fail often and configure it in `server.js` via `SignConfig`.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Game overlay |
| `/health` | GET | Status for Railway |
| `/api/connect` | POST | Body `{ "username": "handle" }` — connect to LIVE |
| `/api/disconnect` | POST | Disconnect TikTok |
| `/api/avatar?url=...` | GET | Proxy profile images for canvas |

## Disclaimer

TikTok does not offer an official public LIVE events API for hobby projects. This app uses community reverse-engineered libraries. For production-scale streams, consider [Euler Stream’s WebSocket API](https://www.eulerstream.com/docs/sign-server/websockets).
