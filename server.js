// 台灣16張麻將 連線伺服器
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Game } = require('./shared/game');
const CH = require('./shared/chars');
const validChar = (c) => (c && CH.BY_ID[c]) ? c : 'c14';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 20000 });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.get('/health', (req, res) => res.send('ok'));

// ================= 跨裝置存檔：暱稱＋4 碼密碼 =================
// 有設定 DATABASE_URL（PostgreSQL）就存資料庫，沒有就存成伺服器上的檔案
const crypto = require('crypto');
const fs = require('fs');
app.use('/api', express.json({ limit: '2mb' }));
const SAVE_FILE = path.join(__dirname, 'data', 'saves.json');
const store = (() => {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    // 資料庫網址後面的 sslmode、channel_binding 參數拿掉，統一由下面的加密設定處理，避免各家格式不同連不上
    const url = (() => {
      const raw = process.env.DATABASE_URL.trim().replace(/^["']|["']$/g, '');
      try { const u = new URL(raw); u.searchParams.delete('sslmode'); u.searchParams.delete('channel_binding'); return u.toString(); } catch (e) { return raw; }
    })();
    const pool = new Pool({ connectionString: url, ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false } });
    pool.on('error', (e) => console.error('資料庫連線錯誤：', e.message));
    let made = null; // 第一次用到才建表格；失敗的話下次再試，不讓伺服器當掉
    const ready = () => (made = made || pool.query('CREATE TABLE IF NOT EXISTS saves (name TEXT PRIMARY KEY, salt TEXT, hash TEXT, data JSONB, updated TIMESTAMPTZ DEFAULT now())').catch((e) => { made = null; throw e; }));
    ready().then(() => console.log('資料庫連線成功'), (e) => console.error('資料庫暫時連不上：', e.message));
    return {
      kind: 'db',
      async get(name) { await ready(); const r = await pool.query('SELECT * FROM saves WHERE name=$1', [name]); return r.rows[0] || null; },
      async put(rec) { await ready(); await pool.query('INSERT INTO saves (name, salt, hash, data, updated) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (name) DO UPDATE SET data=$4, updated=now()', [rec.name, rec.salt, rec.hash, rec.data]); },
    };
  }
  let db = {};
  try { db = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch (e) { }
  return {
    kind: 'file',
    async get(name) { return db[name] || null; },
    async put(rec) { db[rec.name] = Object.assign({}, rec, { updated: new Date().toISOString() }); fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true }); fs.writeFileSync(SAVE_FILE, JSON.stringify(db)); },
  };
})();
const hashPin = (salt, pin) => crypto.createHash('sha256').update(salt + ':' + pin).digest('hex');
const fails = new Map(); // 密碼打錯太多次就先鎖 10 分鐘
function locked(name) { const f = fails.get(name); return f && f.n >= 5 && Date.now() - f.t < 10 * 60 * 1000; }
function failed(name) { const f = fails.get(name) || { n: 0, t: 0 }; if (Date.now() - f.t > 10 * 60 * 1000) f.n = 0; f.n++; f.t = Date.now(); fails.set(name, f); }
function checkInput(b) {
  const name = String((b && b.name) || '').trim().slice(0, 10);
  const pin = String((b && b.pin) || '');
  if (!name) return { err: '請先輸入暱稱' };
  if (!/^\d{4}$/.test(pin)) return { err: '密碼要是 4 位數字' };
  return { name, pin };
}
app.post('/api/save', async (req, res) => {
  try {
    const c = checkInput(req.body); if (c.err) return res.status(400).json({ ok: false, msg: c.err });
    if (locked(c.name)) return res.status(429).json({ ok: false, msg: '密碼錯太多次，請 10 分鐘後再試' });
    const data = req.body.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ ok: false, msg: '沒有可以存的資料' });
    const old = await store.get(c.name);
    if (old && old.hash !== hashPin(old.salt, c.pin)) { failed(c.name); return res.status(403).json({ ok: false, msg: '這個暱稱已經有存檔，密碼不對。如果不是你的存檔，請換一個暱稱。' }); }
    const salt = old ? old.salt : crypto.randomBytes(8).toString('hex');
    await store.put({ name: c.name, salt, hash: hashPin(salt, c.pin), data });
    res.json({ ok: true, created: !old });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, msg: '伺服器存檔失敗，請稍後再試' }); }
});
app.post('/api/load', async (req, res) => {
  try {
    const c = checkInput(req.body); if (c.err) return res.status(400).json({ ok: false, msg: c.err });
    if (locked(c.name)) return res.status(429).json({ ok: false, msg: '密碼錯太多次，請 10 分鐘後再試' });
    const rec = await store.get(c.name);
    if (!rec) return res.status(404).json({ ok: false, msg: '找不到這個暱稱的存檔' });
    if (rec.hash !== hashPin(rec.salt, c.pin)) { failed(c.name); return res.status(403).json({ ok: false, msg: '密碼不對' }); }
    fails.delete(c.name);
    res.json({ ok: true, data: rec.data, updated: rec.updated });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, msg: '伺服器讀取失敗，請稍後再試' }); }
});

const rooms = new Map();      // code -> room
const playerRoom = new Map(); // pid -> code
const AI_NAMES = ['阿土伯', '小美', '金城武', '錢夫人', '大老師', '阿嬤', '孫小美', '沙隆巴斯'];

function newCode() {
  let c;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c));
  return c;
}
function cleanName(n) {
  n = String(n || '').trim().slice(0, 10);
  return n || '玩家' + Math.floor(Math.random() * 900 + 100);
}
function pickAIName(room) {
  const used = new Set(room.seats.filter(Boolean).map(s => s.name));
  const free = AI_NAMES.filter(n => !used.has(n));
  return (free[Math.floor(Math.random() * free.length)] || '電腦') ;
}
// 電腦玩家：挑一位還沒人用的人物，名字就用人物名
function makeAI(room) {
  const used = new Set(room.seats.filter(Boolean).map(s => s.char));
  const free = CH.CHARS.filter(c => !used.has(c.id));
  const c = free[Math.floor(Math.random() * free.length)] || CH.CHARS[0];
  return { isAI: true, name: c.name, char: c.id };
}

// 對戰模式：幾人桌、哪幾個座位是電腦（座位 0 下、1 右、2 上、3 左）
const MODES = {
  duo: { name: '雙人對戰', size: 2, ai: [] },
  duo_ai: { name: '雙人＋2 電腦', size: 4, ai: [1, 3] },
  trio: { name: '三人對戰', size: 3, ai: [] },
  trio_ai: { name: '三人＋1 電腦', size: 4, ai: [3] },
  quad: { name: '四人對戰', size: 4, ai: [] },
};
// 換模式：真人照順序坐進真人座位，電腦座位補上電腦
function applyMode(room, mode) {
  const M = MODES[mode];
  const humans = room.seats.filter(s => s && !s.isAI);
  const humanSlots = [...Array(M.size).keys()].filter(i => !M.ai.includes(i));
  if (humans.length > humanSlots.length) return false;
  room.mode = mode;
  room.seats = new Array(M.size).fill(null);
  humans.forEach((h, k) => { room.seats[humanSlots[k]] = h; });
  for (const i of M.ai) room.seats[i] = makeAI(room);
  return true;
}

function roomInfo(room) {
  return {
    code: room.code, host: room.host, settings: room.settings, started: !!room.game,
    mode: room.mode, modeName: MODES[room.mode].name, modes: Object.fromEntries(Object.entries(MODES).map(([k, v]) => [k, v.name])),
    seats: room.seats.map(s => s ? { name: s.name, isAI: s.isAI, connected: s.isAI || !!s.socketId, pid: s.isAI ? null : s.pid, char: s.char } : null),
  };
}

function broadcastRoom(room) {
  for (const s of room.seats) {
    if (s && !s.isAI && s.socketId) io.to(s.socketId).emit('room', roomInfo(room));
  }
}

function pushState(room) {
  if (!room.game) return;
  room.seats.forEach((s, i) => {
    if (s && !s.isAI && s.socketId) io.to(s.socketId).emit('state', room.game.view(i));
  });
}

function startGame(room) {
  if (room.seats.some(s => !s)) return false; // 真人還沒到齊
  if (room.game) room.game.destroy();
  const g = new Game(
    room.seats.map((s, i) => ({ id: s.pid || 'ai' + i, name: s.name, isAI: s.isAI, char: s.char })),
    room.settings,
    {
      onUpdate: () => {
        if (room.pushPending) return;
        room.pushPending = true;
        setImmediate(() => { room.pushPending = false; pushState(room); });
      },
      onEvent: (ev) => {
        room.seats.forEach((s, i) => {
          if (!s || s.isAI || !s.socketId) return;
          // 隱形墨水：別人看不到那張牌
          const e = (ev.type === 'discard' && ev.ink && i !== ev.seat) ? Object.assign({}, ev, { k: null }) : ev;
          io.to(s.socketId).emit('ev', e);
        });
      },
    }
  );
  room.game = g;
  room.seats.forEach((s, i) => { if (s && !s.isAI) g.players[i].connected = !!s.socketId; });
  broadcastRoom(room);
  g.startHand();
}

function leaveRoom(pid) {
  const code = playerRoom.get(pid);
  if (!code) return;
  playerRoom.delete(pid);
  const room = rooms.get(code);
  if (!room) return;
  const i = room.seats.findIndex(s => s && s.pid === pid);
  if (i < 0) return;
  if (room.game && !room.game.gameOver) {
    // 牌局中離開：由電腦代打
    const s = room.seats[i];
    room.seats[i] = { isAI: true, name: s.name + '(代打)', char: s.char };
    const gp = room.game.players[i];
    gp.isAI = true; gp.name = room.seats[i].name;
    room.game.kick(i);
  } else {
    room.seats[i] = null;
  }
  if (room.host === pid) {
    const h = room.seats.find(s => s && !s.isAI);
    room.host = h ? h.pid : null;
  }
  if (!room.seats.some(s => s && !s.isAI)) {
    if (room.game) room.game.destroy();
    rooms.delete(code);
    return;
  }
  broadcastRoom(room);
  pushState(room);
}

io.on('connection', (socket) => {
  let pid = null;

  socket.on('hello', ({ pid: p, name, char } = {}) => {
    socket.data.char = validChar(char);
    pid = String(p || '').slice(0, 40) || ('p' + Math.random().toString(36).slice(2));
    socket.data.pid = pid;
    socket.data.name = cleanName(name);
    // 重新連線
    const code = playerRoom.get(pid);
    const room = code && rooms.get(code);
    if (room) {
      const i = room.seats.findIndex(s => s && s.pid === pid);
      if (i >= 0) {
        room.seats[i].socketId = socket.id;
        socket.join(code);
        if (room.game) {
          room.game.players[i].connected = true;
          room.game.update();
        }
        socket.emit('room', roomInfo(room));
        if (room.game) socket.emit('state', room.game.view(i));
        broadcastRoom(room);
        return;
      }
    }
    socket.emit('lobby');
  });

  socket.on('create', ({ name, settings } = {}, cb) => {
    if (!pid) return;
    leaveRoom(pid);
    const code = newCode();
    const st = settings || {};
    const room = {
      code, host: pid, game: null,
      settings: {
        rounds: [1, 2, 4].includes(st.rounds) ? st.rounds : 1,
        base: [100, 300, 500].includes(st.base) ? st.base : 300,
        perTai: [20, 50, 100].includes(st.perTai) ? st.perTai : 100,
        discardTime: [0, 15, 20, 30].includes(st.discardTime) ? st.discardTime : 20,
        claimTime: 10,
        xianggong: !!st.xianggong,
        guoshui: st.guoshui === 'loose' ? 'loose' : 'strict',
        zhuama: [0, 2, 4, 6].includes(st.zhuama) ? st.zhuama : 0,
        startScore: [0, 5000, 10000, 20000, 30000, 50000].includes(st.startScore) ? st.startScore : 0,
      },
      seats: [],
    };
    room.seats = [{ pid, name: cleanName(name), isAI: false, socketId: socket.id, char: socket.data.char }];
    applyMode(room, MODES[st.mode] ? st.mode : 'quad');
    rooms.set(code, room);
    playerRoom.set(pid, code);
    socket.join(code);
    if (cb) cb({ ok: true, code });
    broadcastRoom(room);
  });
  socket.on('setMode', (mode) => {
    const room = hostRoom();
    if (!room || (room.game && !room.game.gameOver) || !MODES[mode]) return;
    if (!applyMode(room, mode)) { socket.emit('notice', '房間裡的真人玩家比這個模式的座位多，不能切換'); return; }
    broadcastRoom(room);
  });

  socket.on('join', ({ code, name } = {}, cb) => {
    if (!pid) return;
    code = String(code || '').trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, msg: '找不到這個房間號碼' });
    if (playerRoom.get(pid) === code) return cb && cb({ ok: true, code });
    if (room.game && !room.game.gameOver) return cb && cb({ ok: false, msg: '這桌已經開打了' });
    const i = room.seats.findIndex(s => !s);
    if (i < 0) return cb && cb({ ok: false, msg: '這桌已經坐滿了' });
    leaveRoom(pid);
    room.seats[i] = { pid, name: cleanName(name), isAI: false, socketId: socket.id, char: socket.data.char };
    playerRoom.set(pid, code);
    socket.join(code);
    if (cb) cb({ ok: true, code });
    broadcastRoom(room);
  });

  const hostRoom = () => {
    const room = rooms.get(playerRoom.get(pid));
    return room && room.host === pid ? room : null;
  };


  socket.on('removeSeat', ({ seat } = {}) => {
    const room = hostRoom();
    if (!room || room.game && !room.game.gameOver) return;
    const s = room.seats[seat];
    if (!s || s.pid === pid || s.isAI) return;
    if (!s.isAI) {
      playerRoom.delete(s.pid);
      if (s.socketId) io.to(s.socketId).emit('kicked');
    }
    room.seats[seat] = null;
    broadcastRoom(room);
  });
  socket.on('settings', (st = {}) => {
    const room = hostRoom();
    if (!room || room.game && !room.game.gameOver) return;
    if ([1, 2, 4].includes(st.rounds)) room.settings.rounds = st.rounds;
    if ([100, 300, 500].includes(st.base)) room.settings.base = st.base;
    if ([20, 50, 100].includes(st.perTai)) room.settings.perTai = st.perTai;
    if ([0, 15, 20, 30].includes(st.discardTime)) room.settings.discardTime = st.discardTime;
    if (typeof st.xianggong === 'boolean') room.settings.xianggong = st.xianggong;
    if (st.guoshui === 'loose' || st.guoshui === 'strict') room.settings.guoshui = st.guoshui;
    if ([0, 2, 4, 6].includes(st.zhuama)) room.settings.zhuama = st.zhuama;
    if ([0, 5000, 10000, 20000, 30000, 50000].includes(st.startScore)) room.settings.startScore = st.startScore;
    broadcastRoom(room);
  });
  socket.on('start', () => {
    const room = hostRoom();
    if (!room || (room.game && !room.game.gameOver)) return;
    if (startGame(room) === false) socket.emit('notice', '真人玩家還沒到齊，不能開始');
  });
  socket.on('backToRoom', () => {
    const room = hostRoom();
    if (!room || !room.game || !room.game.gameOver) return;
    room.game.destroy();
    room.game = null;
    room.seats = room.seats.map(s => (s && s.isAI && s.name.endsWith('(代打)')) ? null : s);
    applyMode(room, room.mode);
    broadcastRoom(room);
    for (const s of room.seats) if (s && !s.isAI && s.socketId) io.to(s.socketId).emit('room', roomInfo(room));
  });

  socket.on('act', (a) => {
    const room = rooms.get(playerRoom.get(pid));
    if (!room || !room.game) return;
    const i = room.seats.findIndex(s => s && s.pid === pid);
    if (i < 0) return;
    room.game.act(i, a);
  });

  socket.on('auto', (on) => {
    const room = rooms.get(playerRoom.get(pid));
    if (!room || !room.game) return;
    const i = room.seats.findIndex(s => s && s.pid === pid);
    if (i < 0) return;
    room.game.players[i].auto = !!on;
    room.game.update();
    room.game.kick(i);
  });

  socket.on('chat', (msg) => {
    const room = rooms.get(playerRoom.get(pid));
    if (!room) return;
    const i = room.seats.findIndex(s => s && s.pid === pid);
    if (i < 0) return;
    const text = String(msg || '').slice(0, 30);
    if (!text.trim()) return;
    io.to(room.code).emit('chat', { seat: i, name: room.seats[i].name, text });
  });

  socket.on('setChar', (c) => {
    socket.data.char = validChar(c);
    const room = rooms.get(playerRoom.get(pid));
    if (!room || (room.game && !room.game.gameOver)) return;
    const s = room.seats.find(s => s && s.pid === pid);
    if (s) { s.char = socket.data.char; broadcastRoom(room); }
  });

  socket.on('leave', () => { if (pid) { leaveRoom(pid); socket.emit('lobby'); } });

  socket.on('disconnect', () => {
    if (!pid) return;
    const room = rooms.get(playerRoom.get(pid));
    if (!room) return;
    const i = room.seats.findIndex(s => s && s.pid === pid);
    if (i < 0 || room.seats[i].socketId !== socket.id) return;
    room.seats[i].socketId = null;
    if (room.game) {
      room.game.players[i].connected = false;
      room.game.update();
      room.game.kick(i);
    }
    broadcastRoom(room);
    // 沒開打的房間，斷線 2 分鐘就移除座位
    const myPid = pid;
    setTimeout(() => {
      const r = rooms.get(playerRoom.get(myPid));
      if (!r) return;
      const s = r.seats.find(s => s && s.pid === myPid);
      if (s && !s.socketId && (!r.game || r.game.gameOver)) leaveRoom(myPid);
    }, 120000);
  });
});

// 定期清掉沒有真人在線的房間
setInterval(() => {
  for (const [code, room] of rooms) {
    const online = room.seats.some(s => s && !s.isAI && s.socketId);
    if (online) { room.idleSince = null; continue; }
    room.idleSince = room.idleSince || Date.now();
    if (Date.now() - room.idleSince > 15 * 60 * 1000) {
      if (room.game) room.game.destroy();
      for (const s of room.seats) if (s && s.pid) playerRoom.delete(s.pid);
      rooms.delete(code);
    }
  }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('麻將伺服器啟動於連接埠 ' + PORT + '，存檔方式：' + (store.kind === 'db' ? '資料庫' : '伺服器檔案')));
