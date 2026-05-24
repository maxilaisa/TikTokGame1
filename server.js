import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebcastPushConnection } from 'tiktok-live-connector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_USERNAME = process.env.TIKTOK_USERNAME || '';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/** @type {WebcastPushConnection | null} */
let tiktokConnection = null;
let currentUsername = '';
let connectionStatus = 'idle';

function pickProfileUrl(data) {
  const user = data.user || data;
  const urls = user?.profilePictureUrl || user?.profilePicture?.urls;
  if (Array.isArray(urls) && urls.length) return urls[0];
  if (typeof urls === 'string') return urls;
  return user?.avatarThumb?.url?.[0] || user?.avatarMedium?.url?.[0] || null;
}

function pickUniqueId(data) {
  return data.uniqueId || data.user?.uniqueId || data.user?.nickname || 'viewer';
}

function broadcast(event, payload) {
  io.emit('game-event', { event, ...payload, ts: Date.now() });
}

function detachTikTok() {
  if (!tiktokConnection) return;
  try {
    tiktokConnection.removeAllListeners();
    tiktokConnection.disconnect();
  } catch {
    /* ignore */
  }
  tiktokConnection = null;
}

function wireTikTokEvents(connection) {
  connection.on('follow', (data) => {
    broadcast('follow', {
      uniqueId: pickUniqueId(data),
      profileUrl: pickProfileUrl(data),
    });
  });

  connection.on('like', (data) => {
    const count = Math.min(data.likeCount || 1, 20);
    broadcast('like', {
      uniqueId: pickUniqueId(data),
      profileUrl: pickProfileUrl(data),
      likeCount: count,
    });
  });

  connection.on('gift', (data) => {
    if (data.giftType === 1 && !data.repeatEnd) return;

    const diamonds =
      (data.diamondCount || data.extendedGiftInfo?.diamond_count || 1) *
      (data.repeatCount || 1);
    const troopCount = Math.max(1, Math.min(50, Math.ceil(diamonds / 5)));

    broadcast('gift', {
      uniqueId: pickUniqueId(data),
      profileUrl: pickProfileUrl(data),
      giftName: data.giftName || data.extendedGiftInfo?.name || 'Gift',
      repeatCount: data.repeatCount || 1,
      diamonds,
      troopCount,
    });
  });

  connection.on('connected', () => {
    connectionStatus = 'connected';
    io.emit('tiktok-status', { status: connectionStatus, username: currentUsername });
  });

  connection.on('disconnected', () => {
    connectionStatus = 'disconnected';
    io.emit('tiktok-status', { status: connectionStatus, username: currentUsername });
  });
}

async function connectToTikTok(username) {
  const uniqueId = username.replace(/^@/, '').trim();
  if (!uniqueId) throw new Error('TikTok username is required');

  detachTikTok();
  connectionStatus = 'connecting';
  currentUsername = uniqueId;
  io.emit('tiktok-status', { status: connectionStatus, username: currentUsername });

  const connection = new WebcastPushConnection(uniqueId, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
  });

  wireTikTokEvents(connection);
  tiktokConnection = connection;

  const state = await connection.connect();
  connectionStatus = 'connected';
  io.emit('tiktok-status', {
    status: connectionStatus,
    username: currentUsername,
    roomId: state?.roomId,
  });
  return state;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, tiktok: connectionStatus, username: currentUsername });
});

app.get('/api/avatar', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).send('url required');
  }
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error('fetch failed');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.set('Cache-Control', 'public, max-age=86400');
    res.type(response.headers.get('content-type') || 'image/jpeg');
    res.send(buffer);
  } catch {
    res.status(502).send('avatar fetch failed');
  }
});

app.post('/api/connect', async (req, res) => {
  const username = req.body?.username || req.query?.username || DEFAULT_USERNAME;
  try {
    const state = await connectToTikTok(username);
    res.json({ ok: true, username: currentUsername, roomId: state?.roomId });
  } catch (err) {
    connectionStatus = 'error';
    io.emit('tiktok-status', {
      status: connectionStatus,
      username: currentUsername,
      error: err.message,
    });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/disconnect', (_req, res) => {
  detachTikTok();
  connectionStatus = 'idle';
  currentUsername = '';
  io.emit('tiktok-status', { status: connectionStatus });
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  socket.emit('tiktok-status', {
    status: connectionStatus,
    username: currentUsername,
  });

  socket.on('connect-tiktok', async (username) => {
    try {
      await connectToTikTok(username || DEFAULT_USERNAME);
    } catch (err) {
      socket.emit('tiktok-status', {
        status: 'error',
        username: currentUsername,
        error: err.message,
      });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`TikTok Live War running on http://localhost:${PORT}`);
  if (DEFAULT_USERNAME) {
    connectToTikTok(DEFAULT_USERNAME).catch((err) => {
      console.warn('Auto-connect failed:', err.message);
    });
  }
});
