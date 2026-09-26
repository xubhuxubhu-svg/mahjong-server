// 台灣十六張麻將 前端
(function () {
  const R = window.MJRules;
  const $ = (id) => document.getElementById(id);
  const IMG = window.MJ_IMAGES || null; // 單檔版會內嵌圖片
  const img = (name) => IMG ? IMG[name] : 'img/' + name + '.gif';
  const tileUrl = (k) => img(R.tileImg(k));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
  };

  // 若是單檔版，把 CSS 裡的圖片路徑換成內嵌圖
  if (IMG) {
    const st = document.createElement('style');
    st.textContent = `.tile.back,.chip .cnt i{background-image:url(${IMG.mjb})}.tbl{background-image:radial-gradient(ellipse at center, rgba(255,255,255,.10) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,.45) 100%),url(${IMG.Nostalgy})}`;
    document.head.appendChild(st);
    document.querySelectorAll('img[src^="img/"]').forEach(el => { el.src = img(el.getAttribute('src').slice(4, -4)); });
  }

  // 頁面內的提示框（取代瀏覽器內建彈窗）
  function dialog(html, buttons) {
    const o = document.createElement('div');
    o.className = 'overlay dlg';
    o.innerHTML = `<div class="res" style="max-width:360px;text-align:center"><p style="font-size:17px;line-height:1.6">${html}</p><div class="dlg-btns"></div></div>`;
    const bx = o.querySelector('.dlg-btns');
    buttons.forEach(([label, fn], i) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (i === 0 ? 'gold' : 'ghost'); b.textContent = label;
      b.onclick = () => { o.remove(); if (fn) fn(); };
      bx.appendChild(b);
    });
    document.getElementById('app').appendChild(o);
  }
  function notice(msg) { dialog(esc(msg), [['好', null]]); }

  // ---------- 製作名單（要改名字或加新素材，改這裡就好） ----------
  const CREDITS = [
    { title: '遊戲製作', lines: ['Eric Hu'] },
    { title: '牌面圖片', lines: ['取自 16mj 台灣十六張麻將（Python 版）', '原始來源：Mahjong 維基百科、TJMJ 開源麻將專案（sourceforge.net/projects/tjmj）、163.20.160.14 相簿'] },
    { title: '大廳音樂', lines: ['Kulakovka（Pixabay 曲目編號 295861）', '授權：Pixabay 內容授權'] },
    { title: '牌桌音樂', lines: [
      'StockTune 曲目（編號 1790410133）・授權：StockTune 免費授權',
      '"Blue Boi" by Lakey Inspired・youtube.com/LakeyInspired',
      '授權：Creative Commons BY-NC 3.0（creativecommons.org/licenses/by-nc/3.0/）',
      '"Christmas Countdown" by Alex-Productions・onsound.eu',
      'Royalty Free Music by free-stock-music.com',
      '授權：Creative Commons BY 3.0（creativecommons.org/licenses/by/3.0/）',
    ] },
    { title: '熱血配樂與音效', lines: ['遊戲程式即時合成'] },
  ];
  function creditsHTML() {
    return CREDITS.map(c => `<div class="cr"><b>${c.title}</b>${c.lines.map(l => `<span>${l}</span>`).join('')}</div>`).join('');
  }

  // ---------- 人物 ----------
  const CH = window.MJChars;
  const charImg = (id) => `chars/${id}.webp`;
  let myChar = store.get('mj16_char');
  if (!myChar || !CH.BY_ID[myChar]) myChar = 'c14';
  function refreshCharBtn() {
    const c = CH.BY_ID[myChar];
    $('charBtn').innerHTML = `<img src="${charImg(c.id)}" alt=""><span><b>${c.name}</b><em>${c.type}</em></span><small>更換角色</small>`;
  }
  function statBars(st) {
    return Object.entries(st).map(([k, v]) => `<div class="sbar"><span>${k}</span><i>${Array.from({ length: 5 }, (_, j) => `<b class="${j < v ? 'on' : ''}"></b>`).join('')}</i></div>`).join('');
  }
  function charDetailHTML(c) {
    return `<div class="cd-top"><img src="${charImg(c.id)}" alt=""><div><div class="cd-name">${c.name}</div><span class="cd-type" style="background:${c.color}">${c.type}</span>
      <p class="cd-intro">${c.intro}</p></div></div>
      <div class="cd-stats">${statBars(c.stats)}</div>
      <div class="cd-abil"><div><b>被動・${c.passive.name}</b><span>${c.passive.desc}</span></div>
      <div><b>專屬技能・${c.skill.name}（${c.skill.cost} 氣）</b><span>${c.skill.desc}</span></div>
      <div><b>怒氣覺醒・${c.awaken.name}</b><span>${c.awaken.desc}</span></div></div>`;
  }
  function openCharPick(onDone) {
    const box = $('charPick');
    let cur = myChar;
    const draw = () => {
      box.innerHTML = `<div class="cp-inner">
        <div class="cp-head"><b>選擇角色</b><button class="btn small ghost" id="cpClose">關閉</button></div>
        <div class="cp-body"><div class="cp-grid">${CH.CHARS.map(c => `<button class="cp-card ${c.id === cur ? 'on' : ''}" data-id="${c.id}" style="--cc:${c.color}">
          <img src="${charImg(c.id)}" alt="" loading="lazy"><b>${c.name}</b><em>${c.type}</em></button>`).join('')}</div>
        <div class="cp-detail">${charDetailHTML(CH.BY_ID[cur])}<button class="btn gold" id="cpOk">選擇${CH.BY_ID[cur].name}</button></div></div></div>`;
      box.querySelectorAll('.cp-card').forEach(b => b.onclick = () => { cur = b.dataset.id; playSound('tick'); draw(); });
      $('cpClose').onclick = () => box.classList.add('hidden');
      $('cpOk').onclick = () => {
        myChar = cur; store.set('mj16_char', cur); refreshCharBtn();
        box.classList.add('hidden');
        if (socket) socket.emit('setChar', cur);
        if (onDone) onDone();
      };
    };
    draw();
    box.classList.remove('hidden');
  }

  // ---------- 狀態 ----------
  let pid = store.get('mj16_pid');
  if (!pid) { pid = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('mj16_pid', pid); }
  let myName = store.get('mj16_name') || '';
  $('nameInput').value = myName;

  let mode = null;      // 'online' | 'solo'
  let socket = null;
  let localGame = null;
  let view = null;
  let roomInfo = null;
  let selected = null;  // {k, idx}
  let voiceOn = store.get('mj16_voice') !== 'off';
  let autoOn = false;
  let chiPicking = false;
  let kongPicking = false;
  let resultShownFor = null;
  let deadlineAt = null;
  let musicOn = store.get('mj16_music') !== 'off';
  let miPref = store.get('mj16_mi') || 'ting';   // 瞇牌時機：ting 聽牌時、win 能自摸時、off 關閉
  let mi = null;              // 目前瞇牌狀態
  let lastDrawKey = null;
  let autoDiscardKey = null;
  let tension = 0, tensionHand = null;
  let freshDiscard = null;
  let resultAnim = null;
  let prepSel = [];           // 局前要換掉的手牌位置
  let prepBuy = { double: false, shield: false, gold: false, pack: '' };
  let prepHandKey = null;
  let skillMode = null;       // 技能面板目前在哪一步
  const LUCK_NAMES = { man: '萬子清一色', pin: '筒子清一色', sou: '條子清一色', honor: '字牌（三元四喜）', pong: '碰碰胡' };
  const MISSILE = { noclaim: ['禁吃碰槓', '3 巡不能吃、碰、槓'], freeze: ['定身', '跳過他下一巡'], nohu: ['禁胡', '他下一巡內不能胡'] };
  const DEBUFF = { fog: ['迷霧', '3 巡內手牌看不清'], flip: ['顛倒', '3 巡內牌面倒過來'], slip: ['手滑', '下一張打出隨機的牌'], bad: ['霉運', '接下來 3 張摸牌變差'] };
  const PACK_NAMES = { man: '萬子包', pin: '筒子包', sou: '條子包', dragon: '三元包', pair: '對子包' };
  let swapTarget = null;      // 換牌術：選好對手後，等你點要換出去的牌
  let charTilePick = false;   // 專屬技能要選一張手牌
  let pendingCard = null;     // 卡牌正在選目標（轉輪、換牌）
  let swapInfoKey = null;
  const TALK = ['打快點啦，打到要吃早餐了！', '這也敢打？送你啦！', '肉喔～', '謝謝老闆！', '你是在打心酸的喔？', '莊家很旺喔',
    '聽了，皮繃緊一點', '這把我要做大牌', '手很順喔～', '等一下就換我了', '我已經看穿你了', '再來一將！'];
  const RETORT = ['你才肉咧！', '等一下就讓你哭', '嘴砲沒有台數啦', '好啦好啦，看牌啦', '先顧好你自己吧', '笑太早了喔'];

  const params = new URLSearchParams(location.search);
  if (params.get('room')) $('codeInput').value = params.get('room');

  // ---------- 畫面切換 ----------
  function show(id) {
    for (const s of ['lobby', 'room', 'table', 'adv']) $(s).classList.toggle('hidden', s !== id);
    if (id === 'adv' && mode !== 'adv') mode = 'advmap';
    if (id === 'lobby') { if (mode === 'advmap') mode = null; refreshAdvBtn(); }
    if ($('advHud')) $('advHud').classList.toggle('hidden', !(id === 'table' && mode === 'adv'));
    if (window.MJAudio) {
      MJAudio.bgm.setMode(id === 'table' ? 'play' : 'lobby');
      if (id !== 'table') { MJAudio.bgm.duck(false); MJAudio.music.setOn(false); }
    }
    const lm = $('lobbyMusic'); if (lm) lm.textContent = musicOn ? '音樂：開' : '音樂：關';
    if (id === 'table') { resize(); maybeRotateTip(); }
  }

  function getName() {
    const n = $('nameInput').value.trim().slice(0, 10) || ('玩家' + Math.floor(Math.random() * 900 + 100));
    $('nameInput').value = n; myName = n; store.set('mj16_name', n);
    return n;
  }
  const SET_IDS = ['setRounds', 'setBase', 'setTime', 'setXiang', 'setGuo', 'setHorse', 'setMi', 'setSkills', 'setAiSkill', 'setStart', 'setBack', 'setCloth'];
  for (const id of SET_IDS) {
    const v = store.get('mj16_' + id);
    if (v != null && $(id) && [...$(id).options].some(o => o.value === v)) $(id).value = v;
    if ($(id)) $(id).addEventListener('change', () => { store.set('mj16_' + id, $(id).value); if (id === 'setMi') { miPref = $(id).value; store.set('mj16_mi', miPref); } });
  }
  if ($('setMi')) $('setMi').value = miPref;
  function lobbySettings() {
    const [base, perTai] = $('setBase').value.split('-').map(Number);
    return {
      rounds: Number($('setRounds').value), base, perTai, discardTime: Number($('setTime').value),
      xianggong: $('setXiang').value === '1', guoshui: $('setGuo').value, zhuama: Number($('setHorse').value),
      skills: $('setSkills').value === '1', aiSkill: $('setAiSkill').value, startScore: Number($('setStart').value),
    };
  }

  // ---------- 連線 ----------
  const canOnline = typeof window.io === 'function' && !window.NO_SOCKET;
  if (!canOnline) {
    document.querySelectorAll('.online-only').forEach(e => e.classList.add('off'));
    $('offlineNote').classList.remove('hidden');
  } else {
    socket = window.io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => socket.emit('hello', { pid, name: myName, char: myChar }));
    socket.on('lobby', () => { if (!isLocal() && mode !== 'advmap') { mode = null; roomInfo = null; view = null; show('lobby'); } });
    socket.on('room', (r) => {
      if (isLocal()) return;
      mode = 'online'; roomInfo = r;
      if (!r.started || (view && view.gameOver && !r.started)) { view = null; renderRoom(); show('room'); }
    });
    socket.on('state', (v) => { if (isLocal()) return; mode = 'online'; onState(v); });
    socket.on('ev', (ev) => { if (mode === 'online') onEvent(ev); });
    socket.on('chat', (c) => { if (mode === 'online') showChat(c); });
    socket.on('notice', (m) => notice(m));
    socket.on('kicked', () => { notice('你已被房主移出房間'); mode = null; show('lobby'); });
    socket.on('disconnect', () => { if (mode === 'online') toastSmall('連線中斷，正在重新連線…'); });
  }

  function send(a) {
    if (isLocal() && localGame) localGame.act(0, a);
    else if (mode === 'online' && socket) socket.emit('act', a);
  }

  // ---------- 大廳按鈕 ----------
  $('soloBtn').onclick = () => {
    unlockAudio();
    dialog('單人模式：要跟幾位電腦打？', [
      ['對 3 位電腦（四人桌）', () => startSolo(3)],
      ['對 2 位電腦（三人桌）', () => startSolo(2)],
      ['對 1 位電腦（雙人桌）', () => startSolo(1)],
      ['取消', null],
    ]);
  };
  const ROOM_MODES = [['quad', '四人對戰（4 位真人）'], ['trio_ai', '三人＋1 電腦（四人桌）'], ['trio', '三人對戰（3 位真人）'], ['duo_ai', '雙人＋2 電腦（四人桌）'], ['duo', '雙人對戰（2 位真人）']];
  const needServer = () => { if (canOnline) return false; notice('對戰模式（雙人、三人、四人真人對戰）要用連線版網址打開遊戲才能玩。這個試玩版沒有伺服器，只能單人模式和冒險模式。'); return true; };
  $('createBtn').onclick = () => {
    unlockAudio(); if (needServer()) return;
    const name = getName();
    dialog('建立房間：選對戰模式', ROOM_MODES.map(([m, label]) => [label, () => {
      socket.emit('hello', { pid, name, char: myChar });
      socket.emit('create', { name, settings: Object.assign(lobbySettings(), { mode: m }) }, (r) => { if (!r.ok) notice(r.msg); });
    }]).concat([['取消', null]]));
  };
  $('joinBtn').onclick = () => {
    unlockAudio(); if (needServer()) return;
    const code = $('codeInput').value.trim();
    if (!/^\d{4}$/.test(code)) { notice('請輸入四位數房號'); return; }
    const name = getName();
    socket.emit('hello', { pid, name, char: myChar });
    socket.emit('join', { code, name }, (r) => { if (!r.ok) notice(r.msg); });
  };

  function isLocal() { return mode === 'solo' || mode === 'adv'; }
  // 在瀏覽器裡開一桌（單人模式、冒險模式共用）
  function startLocal(players, settings, m) {
    if (localGame) localGame.destroy();
    mode = m;
    view = null;
    const g = new window.MJGame.Game(players, settings, {
      onUpdate: () => { if (!g._p) { g._p = true; requestAnimationFrame(() => { g._p = false; if (isLocal() && localGame === g) onState(g.view(0)); }); } },
      onEvent: (ev) => { if (isLocal() && localGame === g) onEvent(ev); },
    });
    localGame = g;
    resultShownFor = null;
    autoOn = false; updateMenu();
    $('result').classList.add('hidden');
    show('table');
    g.startHand();
    return g;
  }
  function destroyLocal() {
    if (localGame) localGame.destroy();
    localGame = null; view = null;
    $('result').classList.add('hidden');
    if (mode === 'adv') mode = 'advmap';
  }
  let soloN = 3;
  function startSolo(n) {
    if (n) soloN = n;
    const name = getName();
    const others = CH.CHARS.filter(c => c.id !== myChar).sort(() => Math.random() - .5).slice(0, soloN);
    const st = lobbySettings();
    startLocal(
      [{ id: 'me', name, char: myChar }].concat(others.map((c, i) => ({ id: 'a' + (i + 1), name: c.name, isAI: true, char: c.id }))),
      { rounds: st.rounds, base: st.base, perTai: st.perTai, discardTime: 0, xianggong: st.xianggong, guoshui: st.guoshui, zhuama: st.zhuama, skills: st.skills, aiSkill: st.aiSkill, startScore: st.startScore, mod: window.MJMeta ? [MJMeta.buildMod()] : [] },
      'solo'
    );
  }

  // ---------- 房間 ----------
  function renderRoom() {
    const r = roomInfo;
    $('roomCode').textContent = r.code;
    const isHost = r.host === pid;
    const seatsEl = $('seats');
    seatsEl.innerHTML = '';
    r.seats.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'seat' + (s ? '' : ' empty');
      if (s) {
        const me = s.pid === pid;
        d.innerHTML = `${s.char ? `<img class="seat-img" src="${charImg(s.char)}" alt="">` : ''}<div class="nm">${esc(s.name)}${me ? '（你）' : ''}</div>
          <div class="tag">${s.isAI ? '電腦玩家' : (r.host === s.pid ? '房主' : '玩家')}${!s.isAI && !s.connected ? '・斷線中' : ''}</div>`;
        if (isHost && !me) {
          const b = document.createElement('button');
          b.className = 'btn small ghost'; b.textContent = '移除';
          b.onclick = () => socket.emit('removeSeat', { seat: i });
          d.appendChild(b);
        }
      } else {
        d.innerHTML = `<div class="tag">空位・等待真人玩家加入</div>`;
      }
      d.dataset.pos = ['下', '右', '上', '左'][r.seats.length === 2 ? [0, 2][i] : r.seats.length === 3 ? [0, 1, 3][i] : i];
      seatsEl.appendChild(d);
    });
    const st = r.settings;
    const baseLabel = `${st.base} 底 ${st.perTai} 台`;
    const rl = { 1: '東風圈（1圈）', 2: '東南風（2圈）', 4: '一將（4圈）' }[st.rounds];
    const tl = st.discardTime ? st.discardTime + ' 秒' : '不限時';
    if (isHost) {
      $('roomSettings').innerHTML = `<div class="set-grid">
        <span>圈數</span><select id="rsRounds"><option value="1">東風圈（1圈）</option><option value="2">東南風（2圈）</option><option value="4">一將（4圈）</option></select>
        <span>底／台</span><select id="rsBase"><option value="300-100">300 底 100 台</option><option value="100-20">100 底 20 台</option><option value="500-100">500 底 100 台</option><option value="100-50">100 底 50 台</option></select>
        <span>出牌時間</span><select id="rsTime"><option value="20">20 秒</option><option value="15">15 秒</option><option value="30">30 秒</option><option value="0">不限時</option></select>
        <span>初始金額</span><select id="rsStart"><option value="0">0</option><option value="5000">5,000</option><option value="10000">10,000</option><option value="20000">20,000</option><option value="30000">30,000</option><option value="50000">50,000</option></select></div>`;
      $('rsRounds').value = st.rounds; $('rsBase').value = `${st.base}-${st.perTai}`; $('rsTime').value = st.discardTime; $('rsStart').value = st.startScore || 0;
      const push = () => { const [b, p] = $('rsBase').value.split('-').map(Number); socket.emit('settings', { rounds: Number($('rsRounds').value), base: b, perTai: p, discardTime: Number($('rsTime').value), startScore: Number($('rsStart').value) }); };
      ['rsRounds', 'rsBase', 'rsTime', 'rsStart'].forEach(id => $(id).onchange = push);
    } else {
      $('roomSettings').innerHTML = `<p class="hint">${rl}・${baseLabel}・出牌 ${tl}</p>`;
    }
    const missing = r.seats.filter(x => !x).length;
    $('roomMode').innerHTML = isHost
      ? `<label>對戰模式 <select id="rmMode">${Object.entries(r.modes).map(([k, n]) => `<option value="${k}" ${k === r.mode ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`
      : `<b>${r.modeName}</b>`;
    if ($('rmMode')) $('rmMode').onchange = (e) => socket.emit('setMode', e.target.value);
    seatsEl.dataset.n = r.seats.length;
    $('startBtn').classList.toggle('hidden', !isHost);
    $('startBtn').disabled = missing > 0;
    $('startBtn').textContent = missing ? `還差 ${missing} 位真人玩家` : '開始打牌';
    $('waitHost').classList.toggle('hidden', isHost);
    $('waitHost').textContent = missing ? `等待其他玩家加入（還差 ${missing} 位）…` : '等待房主開始…';
  }
  $('startBtn').onclick = () => { unlockAudio(); socket.emit('start'); };
  $('leaveBtn').onclick = () => { socket.emit('leave'); mode = null; show('lobby'); };
  $('shareBtn').onclick = () => {
    const url = location.origin + location.pathname + '?room=' + roomInfo.code;
    const text = `來打麻將！房號 ${roomInfo.code}\n${url}`;
    if (navigator.share) { navigator.share({ title: '台灣十六張麻將', text, url }).catch(() => { }); return; }
    const done = () => toastSmall('邀請連結已複製');
    const manual = () => dialog(`複製這個連結給朋友：<br><input readonly value="${esc(url)}" onclick="this.select()">`, [['好', null]]);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, manual);
    else manual();
  };

  // ---------- 尺寸 ----------
  function resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const portrait = H > W * 1.05;
    $('app').classList.toggle('portrait', portrait);
    const rootS = document.documentElement.style;
    let tw, rw, tbn, lrn;
    if (portrait) {
      tw = Math.floor((W - 20) / 9.4);
      tw = Math.max(18, Math.min(52, tw, Math.floor(H * 0.055)));
      const side = Math.max(64, tw * 1.6);
      rw = Math.floor((W - 2 * side - 100) / 6.8);
      rw = Math.max(14, Math.min(rw, Math.floor(tw * 0.85)));
      tbn = Math.max(6, Math.floor((W - 2 * side - 6) / (rw + 1)));
      lrn = 3;
    } else {
      tw = Math.floor((W - 16) / 18.6);
      tw = Math.max(16, Math.min(58, tw, Math.floor(H * 0.115)));
      const th = tw * 1.2;
      const centerH = H - th * 2.05 - 40 - Math.max(40, tw * 0.9);
      const side = Math.max(70, tw * 2);
      const centerW = W - 2 * side;
      tbn = 12;
      // 高度：上下河各 2 排＋中央資訊
      rw = Math.floor(Math.min(tw * 0.75, centerH / (4 * 1.2 + 2.6), (centerW - 100) / 14));
      rw = Math.max(13, rw);
      tbn = Math.max(8, Math.min(16, Math.floor(centerW * 0.8 / (rw + 1))));
      lrn = Math.max(3, Math.min(6, Math.floor((centerW - tbn * 0 - 110) / 2 / (rw + 1))));
      if (lrn * 2 * (rw + 1) + 110 > centerW) lrn = 3;
    }
    rootS.setProperty('--tw', tw + 'px');
    rootS.setProperty('--rw', rw + 'px');
    rootS.setProperty('--tbn', tbn);
    rootS.setProperty('--lrn', lrn);
    rootS.setProperty('--mw', Math.max(15, Math.floor(tw * (portrait ? 0.62 : 0.66))) + 'px');
  }
  window.addEventListener('resize', () => { resize(); if (view) render(); });

  function maybeRotateTip() {
    const tip = $('rotateTip');
    if (window.innerHeight > window.innerWidth && window.innerWidth < 700 && store.get('mj16_rot') !== '1') tip.classList.remove('hidden');
  }
  $('rotateClose').onclick = () => { $('rotateTip').classList.add('hidden'); store.set('mj16_rot', '1'); };

  // ---------- 渲染 ----------
  function tileEl(k, cls) {
    const d = document.createElement('div');
    d.className = 'tile ' + (cls || '');
    if (k == null) d.classList.add('back');
    else d.style.backgroundImage = `url(${tileUrl(k)})`;
    return d;
  }
  function tileHTML(k, cls) {
    return k == null ? `<div class="tile back ${cls || ''}"></div>` : `<div class="tile ${cls || ''}" style="background-image:url(${tileUrl(k)})"></div>`;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  // 畫面位置：0 我（下）、1 右、2 上、3 左。2 人桌坐上下，3 人桌坐左下右
  const rel = (i) => {
    const N = view.players.length;
    const d = (i - view.seat + N) % N;
    if (N === 2) return d === 0 ? 0 : 2;
    if (N === 3) return [0, 1, 3][d];
    return d;
  };
  const allSeats = () => view.players.map((p, i) => i);
  const others = () => allSeats().slice(1).map(d => (view.seat + d) % view.players.length);

  function meldHTML(m, cls) {
    let ks;
    if (m.type === 'chi') ks = m.tiles;
    else if (m.type === 'pong') ks = [m.k, m.k, m.k];
    else if (m.type === 'akong') ks = [null, m.k, m.k, null];
    else ks = [m.k, m.k, m.k, m.k];
    return `<div class="meld">${ks.map((k, j) => tileHTML(k, cls + (m.type === 'chi' && k === m.taken && j === m.tiles.indexOf(m.taken) ? ' taken' : ''))).join('')}</div>`;
  }

  function chipHTML(i) {
    const p = view.players[i];
    const isTurn = view.phase === 'play' && ((view.stage === 'discard' && view.turn === i) || p.waiting);
    const wind = p.seatWind;
    const status = !p.connected && !p.isAI ? '斷線・電腦代打' : (p.auto ? '託管中' : '');
    return `<div class="chip ${isTurn ? 'turn' : ''} ${p.declared ? 'ting' : ''} ${p.awake ? 'awake' : ''}" data-seat="${i}">
      <div class="row"><img class="wind" src="${img((view.turn === i && view.phase === 'play' ? 'lred' : 'l') + wind)}" alt="${R.WIND[wind]}">
      ${view.dealer === i ? `<img class="host" src="${img('host')}" alt="莊">` : ''}</div>
      <div class="nm">${esc(p.name)}</div>
      <div class="sc">${p.score >= 0 ? '' : ''}${p.score}</div>
      ${rel(i) !== 0 ? `<div class="cnt"><i></i>${p.handCount}</div>` : ''}
      ${status ? `<div class="st">${status}</div>` : ''}
      ${p.waiting ? '<div class="think">…</div>' : ''}
      ${p.declared ? `<img class="ting-badge" src="${img('50x50_hear')}" alt="聽">` : ''}
      ${view.skills ? fxTags(p) : ''}
      ${view.skills && p.char ? `<div class="rage ${p.awake ? 'awake' : ''}" title="怒氣"><i style="width:${p.awake ? 100 : p.rage}%"></i></div>` : ''}
      ${p.xiang ? '<div class="xiang-badge">相公</div>' : ''}
      ${view.metaView && view.metaView.tingSuits && view.metaView.tingSuits[i] ? `<div class="ting-suits">聽：${view.metaView.tingSuits[i].join('')}</div>` : ''}
    </div>`;
  }

  function fxTags(p) {
    const t = [];
    if (p.fx) {
      if (p.fx.noClaim) t.push(`<i class="fx bad">禁吃碰${p.fx.noClaim}</i>`);
      if (p.fx.noHu) t.push('<i class="fx bad">禁胡</i>');
      if (p.fx.freeze) t.push('<i class="fx bad">定身</i>');
      if (p.fx.shield) t.push('<i class="fx good">防護罩</i>');
      if (p.fx.double) t.push('<i class="fx gold">翻倍</i>');
      if (p.fx.luck) t.push('<i class="fx good">氣運</i>');
      if (p.fx.fog) t.push('<i class="fx bad">迷霧</i>');
      if (p.fx.flip) t.push('<i class="fx bad">顛倒</i>');
      if (p.fx.slip) t.push('<i class="fx bad">手滑</i>');
      if (p.fx.bad) t.push('<i class="fx bad">霉運</i>');
      if (p.fx.gold) t.push('<i class="fx gold">金牌</i>');
      if (p.fx.ink) t.push(`<i class="fx good">墨水${p.fx.ink}</i>`);
    }
    const qi = `<i class="qi" title="氣">氣${p.qi || 0}</i>`;
    return `<div class="fxrow">${qi}${t.join('')}</div>`;
  }

  function render() {
    if (!view) return;
    const v = view;
    // 對手
    for (const r of [1, 2, 3]) { $('p' + r).innerHTML = ''; $('r' + r).innerHTML = ''; }
    document.querySelector('.tbl').dataset.n = v.players.length;
    for (const i of allSeats()) {
      const r = rel(i);
      if (r === 0) continue;
      const p = v.players[i];
      const el = $('p' + r);
      el.innerHTML = chipHTML(i) +
        (p.hand ? `<div class="readhand" title="讀心">${p.hand.map(k => tileHTML(k, 'm')).join('')}</div>` : '') +
        `<div class="melds">${p.melds.map(m => meldHTML(m, 'm')).join('')}</div>` +
        (p.flowers.length ? `<div class="flowers">${p.flowers.map(k => tileHTML(k, 'm')).join('')}</div>` : '');
    }
    // 河
    for (const i of allSeats()) {
      const r = rel(i);
      const p = v.players[i];
      const el = $('r' + r);
      el.innerHTML = p.river.map((t, j) => {
        const last = v.lastDiscard && v.lastDiscard.seat === i && j === p.river.length - 1 && !t.taken && v.phase === 'play';
        const slam = last && freshDiscard && freshDiscard.seat === i && Date.now() - freshDiscard.t < 450;
        return tileHTML(t.k, 'r' + (last ? ' last' : '') + (slam ? ' slam' : '') + (t.taken ? ' taken' : '') + (t.ink ? ' ink' : ''));
      }).join('');
    }
    // 中央資訊
    const info = $('info');
    const turnRel = v.phase === 'play' ? rel(v.turn) : -1;
    const arrow = ['▼', '▶', '▲', '◀'][turnRel] || '';
    info.innerHTML = `${v.barrier ? `<div class="barrier" title="${esc(v.barrier.desc)}">${esc(v.barrier.name)}</div>` : ''}<div class="rw">${R.WIND[v.roundWind]}風圈</div>
      <div class="rm">第 ${v.handNo} 局${v.lian ? `・連${v.lian}` : ''}</div>
      <div class="rm">剩 ${v.remaining} 張</div>
      <div class="tm" id="timer"></div>
      <div class="arrow">${arrow}</div>`;
    deadlineAt = v.deadlineIn != null ? Date.now() + v.deadlineIn : null;
    tickTimer();

    // 我
    const me = v.players[v.seat];
    $('p0').innerHTML = chipHTML(v.seat);
    $('myMelds').innerHTML = me.melds.map(m => meldHTML(m, 'm')).join('') +
      (me.flowers.length ? `<div class="flowers">${me.flowers.map(k => tileHTML(k, 'm')).join('')}</div>` : '');
    document.querySelector('.me').classList.toggle('declared', !!me.declared && v.phase === 'play');
    document.querySelector('.me').classList.toggle('xiang', !!me.xiang && v.phase === 'play');
    updateTension();
    requestAnimationFrame(placePortraits);
    renderWaits();
    renderPeek();
    renderHand();
    renderActions();
    renderSkillBar();
    renderPrep();
    renderResult();
  }

  // ---------- 技能 ----------
  function myQi() { return view.players[view.seat].qi || 0; }
  function canUseSkills() { return view.skills && myTurnToDiscard() && !(mi && !mi.done) && !view.players[view.seat].declared; }
  function renderPeek() {
    const el = $('peekBox');
    const bits = [];
    if (view.forceNext != null && view.phase === 'play') bits.push(`<span>搓牌：下一張</span>${tileHTML(view.forceNext)}`);
    if (view.peek && view.peek.length && view.phase === 'play') bits.push(`<span>神算：接下來</span>${view.peek.map(k => tileHTML(k)).join('')}`);
    el.innerHTML = bits.join('<span class="sep"></span>');
  }
  function renderSkillBar() {
    const el = $('skillbar');
    if (!view.skills || view.phase !== 'play' || view.stage === 'prep' || autoOn) { el.innerHTML = ''; closeSkillPop(); return; }
    const qi = myQi();
    const on = canUseSkills();
    const cv = view.cards;
    el.innerHTML = `<button class="skill-btn ${on ? 'ready' : ''} ${cv ? 'cardmode' : ''}" id="skillBtn"><b>${cv ? `卡牌 ${cv.hand.length}` : '技能'}</b><span class="qibar">${Array.from({ length: 10 }, (_, i) => `<i class="${i < qi ? 'on' : ''}"></i>`).join('')}</span></button>`;
    $('skillBtn').onclick = (e) => {
      e.stopPropagation(); unlockAudio();
      if (!on) { toastSmall(view.players[view.seat].declared ? '報聽後不能再用技能' : '輪到你打牌時才能用技能'); return; }
      if ($('skillPop').classList.contains('hidden')) openSkillPop(view.cards ? 'cards' : 'menu'); else closeSkillPop();
    };
    if (!on) closeSkillPop();
  }
  function closeSkillPop() { $('skillPop').classList.add('hidden'); skillMode = null; }
  function openSkillPop(step, data) {
    skillMode = step;
    const pop = $('skillPop');
    const qi = myQi(), used = new Set(view.used || []), C = view.skillCost;
    let html = '';
    const card = (id, name, cost, desc) => {
      const dis = used.has(id) || qi < cost;
      return `<button class="scard ${dis ? 'dis' : ''}" data-id="${id}" ${dis ? 'disabled' : ''}><b>${name}</b><em>${cost}氣</em><span>${used.has(id) ? '這局用過了' : desc}</span></button>`;
    };
    const meP = view.players[view.seat];
    const myC = meP.char && CH.BY_ID[meP.char];
    const CDS = window.MJCards;
    const cv = view.cards;
    const targetBtns = (attr) => others().map(i =>
      `<button ${attr}="${i}">${esc(view.players[i].name)}<small>${['下家', '對家', '上家'][rel(i) - 1]}${view.players[i].fx && view.players[i].fx.shield ? '・有防護罩' : ''}</small></button>`).join('');
    if (step === 'cards') {
      const disc = view.players[view.seat].char === 'c08' ? 0 : 0;
      const status = [];
      if (cv.traps.length) status.push(`蓋著的陷阱：${cv.traps.map(t => CDS.CARDS[t].name).join('、')}`);
      if (cv.alt) status.push(`勝利卡：${CDS.CARDS[cv.alt].name}${cv.alt === 'w_yaojiu' ? `（${cv.altCount}／4）` : ''}`);
      if (view.barrier) status.push(`結界：${view.barrier.name}`);
      html = `<div class="sp-title">卡牌（現在 ${qi} 氣・牌堆 ${cv.pile} 張・棄牌 ${cv.used} 張）</div>
        ${status.length ? `<div class="cd-status">${status.join('<br>')}</div>` : ''}
        <div class="scards">${myC ? card('char', '專屬・' + myC.skill.name, myC.skill.cost, myC.skill.desc).replace('class="scard', 'class="scard excl') : ''}
        ${cv.hand.map((id, i) => { const c = CDS.CARDS[id]; const T = CDS.TYPES[c.type];
          let dis = qi < c.cost; let why = '';
          if (c.type === 'trap' && cv.traps.length >= 2) { dis = true; why = '（陷阱最多放 2 張）'; }
          if (c.type === 'field' && view.barrier) { dis = true; why = '（這局已有結界）'; }
          if (c.type === 'win' && cv.alt) { dis = true; why = '（這局已有勝利卡）'; }
          return `<button class="scard gcard ${dis ? 'dis' : ''}" data-card="${i}" style="--tc:${T.color}" ${dis ? 'disabled' : ''}><i class="gtype">${T.name}</i><b>${c.name}</b><em>${c.cost}氣</em><span>${c.desc}${why}</span></button>`; }).join('')}
        ${cv.hand.length ? '' : '<p class="hint">手上沒有卡牌。每局開局抽 3 張，每摸 4 張牌再抽 1 張。</p>'}</div>`;
    } else if (step === 'cardtarget') {
      html = `<div class="sp-title">${CDS.CARDS[cv.hand[data]].name}：對誰？</div><div class="sopts">${targetBtns('data-cdt')}</div>`;
    } else if (step === 'cardswap') {
      html = `<div class="sp-title">換牌術：跟誰換？</div><div class="sopts">${targetBtns('data-cds')}</div>`;
    } else if (step === 'cardluck') {
      html = `<div class="sp-title">氣運值：想做什麼牌型？</div><div class="sopts">${Object.entries(LUCK_NAMES).map(([k, n]) => `<button data-cdl="${k}">${n}</button>`).join('')}</div>`;
    } else if (step === 'menu') {
      html = `<div class="sp-title">技能（現在 ${qi} 氣）</div><div class="scards">
        ${myC ? card('char', '專屬・' + myC.skill.name, myC.skill.cost, myC.skill.desc).replace('class="scard', 'class="scard excl') : ''}
        ${card('cuopai', '搓牌', C.cuopai, '轉輪選一張，下一張就摸到它')}
        ${card('luck', '氣運值', C.luck, '選牌型，接下來 5 巡較容易摸到')}
        ${card('missile', '飛彈攻擊', C.missile.noclaim, '禁吃碰槓、定身、禁胡')}
        ${card('peek', '神算', C.peek, '偷看自己接下來要摸的 3 張')}
        ${card('debuff', '負面狀態', C.debuff.fog, '迷霧、顛倒、手滑、霉運')}
        ${card('swaptile', '換牌術', C.swaptile, '拿一張牌跟對手隨機一張交換')}
        ${card('safe', '安全牌偵測', C.safe, '手牌亮綠光安全、紅光會放槍')}
        ${card('ink', '隱形墨水', C.ink, '接下來 3 張打出的牌別人看不到')}</div>`;
    } else if (step === 'luck') {
      html = `<div class="sp-title">氣運值：想做什麼牌型？</div><div class="sopts">${Object.entries(LUCK_NAMES).map(([k, n]) => `<button data-luck="${k}">${n}</button>`).join('')}</div>`;
    } else if (step === 'missile') {
      html = `<div class="sp-title">飛彈攻擊：打誰？</div><div class="sopts">${others().map(i =>
        `<button data-target="${i}">${esc(view.players[i].name)}<small>${['下家', '對家', '上家'][rel(i) - 1]}${view.players[i].fx && view.players[i].fx.shield ? '・有防護罩' : ''}</small></button>`).join('')}</div>`;
    } else if (step === 'chartarget') {
      html = `<div class="sp-title">${myC.skill.name}：對誰？</div><div class="sopts">${others().map(i =>
        `<button data-ct="${i}">${esc(view.players[i].name)}<small>${['下家', '對家', '上家'][rel(i) - 1]}${view.players[i].fx && view.players[i].fx.shield ? '・有防護罩' : ''}</small></button>`).join('')}</div>`;
    } else if (step === 'debuff' || step === 'swaptile') {
      html = `<div class="sp-title">${step === 'debuff' ? '負面狀態' : '換牌術'}：對誰？</div><div class="sopts">${others().map(i =>
        `<button data-t2="${i}">${esc(view.players[i].name)}<small>${['下家', '對家', '上家'][rel(i) - 1]}${view.players[i].fx && view.players[i].fx.shield ? '・有防護罩' : ''}</small></button>`).join('')}</div>`;
    } else if (step === 'debuff2') {
      html = `<div class="sp-title">對 ${esc(view.players[data].name)} 施放什麼？</div><div class="sopts">${Object.entries(DEBUFF).map(([k, [n, d]]) => {
        const cost = C.debuff[k]; const dis = qi < cost;
        return `<button data-dkind="${k}" ${dis ? 'disabled class="dis"' : ''}>${n}<small>${cost}氣・${d}</small></button>`; }).join('')}</div>`;
    } else if (step === 'missile2') {
      html = `<div class="sp-title">對 ${esc(view.players[data].name)} 發射什麼？</div><div class="sopts">${Object.entries(MISSILE).map(([k, [n, d]]) => {
        const cost = C.missile[k]; const dis = qi < cost;
        return `<button data-kind="${k}" ${dis ? 'disabled class="dis"' : ''}>${n}<small>${cost}氣・${d}</small></button>`; }).join('')}</div>`;
    }
    const top = step === 'menu' || step === 'cards';
    html += `<button class="sp-close">${top ? '關閉' : '返回'}</button>`;
    pop.innerHTML = html;
    pop.classList.remove('hidden');
    pop.querySelector('.sp-close').onclick = (e) => { e.stopPropagation(); if (top) closeSkillPop(); else openSkillPop(cv ? 'cards' : 'menu'); };
    pop.querySelectorAll('[data-card]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const i = Number(b.dataset.card); const c = CDS.CARDS[cv.hand[i]];
      if (c.need === 'target') openSkillPop('cardtarget', i);
      else if (c.need === 'luck') openSkillPop('cardluck', i);
      else if (c.need === 'swap') openSkillPop('cardswap', i);
      else if (c.need === 'cuopai') { closeSkillPop(); pendingCard = i; openCuo(); }
      else { closeSkillPop(); send({ type: 'skill', id: 'card', idx: i }); }
    });
    pop.querySelectorAll('[data-cdt]').forEach(b => b.onclick = (e) => { e.stopPropagation(); closeSkillPop(); send({ type: 'skill', id: 'card', idx: data, target: Number(b.dataset.cdt) }); });
    pop.querySelectorAll('[data-cdl]').forEach(b => b.onclick = (e) => { e.stopPropagation(); closeSkillPop(); send({ type: 'skill', id: 'card', idx: data, pattern: b.dataset.cdl }); });
    pop.querySelectorAll('[data-cds]').forEach(b => b.onclick = (e) => { e.stopPropagation(); closeSkillPop(); pendingCard = data; swapTarget = Number(b.dataset.cds); selected = null; toastSmall(`點一張要跟 ${view.players[swapTarget].name} 交換的手牌`); render(); });
    pop.querySelectorAll('.scard:not(.gcard)').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.id;
      if (id === 'cuopai') { closeSkillPop(); openCuo(); }
      else if (id === 'luck') openSkillPop('luck');
      else if (id === 'missile') openSkillPop('missile');
      else if (id === 'peek') { closeSkillPop(); send({ type: 'skill', id: 'peek' }); }
      else if (id === 'debuff') openSkillPop('debuff');
      else if (id === 'swaptile') openSkillPop('swaptile');
      else if (id === 'safe') { closeSkillPop(); send({ type: 'skill', id: 'safe' }); }
      else if (id === 'ink') { closeSkillPop(); send({ type: 'skill', id: 'ink' }); }
      else if (id === 'char') {
        if (myC.needs === 'target') openSkillPop('chartarget');
        else if (myC.needs === 'tile') { closeSkillPop(); charTilePick = true; selected = null; toastSmall(`點一張手牌發動「${myC.skill.name}」`); render(); }
        else { closeSkillPop(); send({ type: 'skill', id: 'char' }); }
      }
    });
    pop.querySelectorAll('[data-t2]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const t = Number(b.dataset.t2);
      if (step === 'debuff') openSkillPop('debuff2', t);
      else { closeSkillPop(); swapTarget = t; selected = null; toastSmall(`點一張要跟 ${view.players[t].name} 交換的手牌`); render(); }
    });
    pop.querySelectorAll('[data-ct]').forEach(b => b.onclick = (e) => { e.stopPropagation(); closeSkillPop(); send({ type: 'skill', id: 'char', target: Number(b.dataset.ct) }); });
    pop.querySelectorAll('[data-dkind]').forEach(b => b.onclick = (e) => { e.stopPropagation(); closeSkillPop(); send({ type: 'skill', id: 'debuff', target: data, kind: b.dataset.dkind }); });
    pop.querySelectorAll('[data-luck]').forEach(b => b.onclick = (e) => { e.stopPropagation(); closeSkillPop(); send({ type: 'skill', id: 'luck', pattern: b.dataset.luck }); });
    pop.querySelectorAll('[data-target]').forEach(b => b.onclick = (e) => { e.stopPropagation(); openSkillPop('missile2', Number(b.dataset.target)); });
    pop.querySelectorAll('[data-kind]').forEach(b => b.onclick = (e) => { e.stopPropagation(); closeSkillPop(); send({ type: 'skill', id: 'missile', target: data, kind: b.dataset.kind }); });
  }

  // ---------- 搓牌轉輪 ----------
  let cuo = null;
  function openCuo() {
    const box = $('cuoBox');
    const avail = view.wallAvail || new Array(34).fill(1);
    cuo = { phase: 'suit', offset: Math.random() * 256, raf: null, items: [], avail };
    box.classList.remove('hidden');
    buildCuo();
  }
  function closeCuo() {
    if (cuo && cuo.raf) cancelAnimationFrame(cuo.raf);
    cuo = null;
    $('cuoBox').classList.add('hidden');
    $('cuoBox').innerHTML = '';
  }
  function buildCuo() {
    const box = $('cuoBox');
    const av = cuo.avail;
    if (cuo.phase === 'suit') {
      const sum = (a, b) => av.slice(a, b).reduce((x, y) => x + y, 0);
      cuo.items = [
        { k: 0, label: '萬', left: sum(0, 9), val: 0 }, { k: 9, label: '筒', left: sum(9, 18), val: 1 },
        { k: 18, label: '條', left: sum(18, 27), val: 2 }, { k: 27, label: '字', left: sum(27, 34), val: 3 },
      ];
    } else {
      const s = cuo.suit;
      const ks = s < 3 ? Array.from({ length: 9 }, (_, i) => s * 9 + i) : [27, 28, 29, 30, 31, 32, 33];
      cuo.items = ks.map(k => ({ k, label: R.tileName(k), left: av[k], val: k }));
    }
    box.innerHTML = `<div class="cuo-inner">
      <div class="cuo-title">搓牌・${cuo.phase === 'suit' ? '先選花色' : '再選哪一張'}</div>
      <div class="cuo-ring"><div class="cuo-strip" id="cuoStrip"></div><div class="cuo-line"></div></div>
      <div class="cuo-btns"><button class="btn small gold" id="cuoPick">選這張</button><button class="btn small ghost" id="cuoCancel">${cuo.phase === 'suit' ? '取消' : '重選花色'}</button></div>
      <div class="cuo-hint">牌會由上往下轉，停在中間那張就按「選這張」，也可以直接點牌</div></div>`;
    const strip = $('cuoStrip');
    // 重複三次讓轉動不中斷
    const rep = [...cuo.items, ...cuo.items, ...cuo.items];
    strip.innerHTML = rep.map((it, i) => `<div class="cuo-item ${it.left ? '' : 'none'}" data-i="${i % cuo.items.length}">
      ${tileHTML(it.k)}<span>${it.label}${it.left ? '' : '（沒了）'}</span></div>`).join('');
    strip.querySelectorAll('.cuo-item').forEach(el => el.onclick = (e) => { e.stopPropagation(); pickCuo(cuo.items[Number(el.dataset.i)]); });
    $('cuoPick').onclick = (e) => { e.stopPropagation(); pickCuo(centerCuo()); };
    $('cuoCancel').onclick = (e) => { e.stopPropagation(); if (cuo.phase === 'suit') closeCuo(); else { cuo.phase = 'suit'; cuo.offset = 0; buildCuo(); } };
    if (cuo.raf) cancelAnimationFrame(cuo.raf);
    let lastT = performance.now();
    const itemH = () => { const el = strip.querySelector('.cuo-item'); return el ? el.offsetHeight : 60; };
    const loop = (t) => {
      if (!cuo) return;
      const dt = Math.min(50, t - lastT); lastT = t;
      const h = itemH(), total = h * cuo.items.length;
      cuo.offset = (cuo.offset + dt * 0.05) % total;           // 由上往下慢慢轉
      strip.style.transform = `translateY(${cuo.offset - total}px)`;
      // 標出中間那張
      const ringH = strip.parentElement.offsetHeight;
      const center = ringH / 2 - (cuo.offset - total);
      const idx = Math.floor(center / h);
      strip.querySelectorAll('.cuo-item').forEach((el, i) => el.classList.toggle('mid', i === idx));
      cuo.centerIdx = idx % cuo.items.length;
      if (Math.floor(t / 250) !== cuo.lastTick) { cuo.lastTick = Math.floor(t / 250); playSound('tick', { freq: 900 }); }
      cuo.raf = requestAnimationFrame(loop);
    };
    cuo.raf = requestAnimationFrame(loop);
  }
  function centerCuo() { return cuo.items[cuo.centerIdx || 0]; }
  function pickCuo(it) {
    if (!cuo || !it) return;
    if (!it.left) { toastSmall('牌牆裡已經沒有這張了'); return; }
    playSound('pop');
    if (cuo.phase === 'suit') { cuo.suit = it.val; cuo.phase = 'num'; cuo.offset = Math.random() * 400; buildCuo(); return; }
    const k = it.k;
    closeCuo();
    if (pendingCard != null) { const i = pendingCard; pendingCard = null; send({ type: 'skill', id: 'card', idx: i, k }); }
    else send({ type: 'skill', id: 'cuopai', k });
  }

  // ---------- 局前準備 ----------
  function prepping() {
    const me = view.players[view.seat];
    return view.phase === 'play' && view.stage === 'prep' && !me.prepDone && !autoOn;
  }
  function renderPrep() {
    const box = $('prepBox');
    if (!view || view.phase !== 'play' || view.stage !== 'prep') { box.classList.add('hidden'); prepSel = []; prepBuy = { double: false, shield: false, gold: false, pack: '' }; return; }
    const me = view.players[view.seat];
    const key = view.handNo;
    if (prepHandKey !== key) { prepHandKey = key; prepSel = []; prepBuy = { double: false, shield: false, gold: false, pack: '' }; }
    box.classList.remove('hidden');
    if (me.prepDone || autoOn) {
      const wait = view.players.filter(p => !p.prepDone).map(p => p.name);
      box.innerHTML = `<div class="prep-inner"><div class="pp-title">局前準備</div><p class="hint">等待 ${wait.map(esc).join('、') || '開打'}…</p></div>`;
      return;
    }
    const P = view.prices;
    const n = prepSel.length;
    const cost = Math.max(0, n - P.freeSwap) * P.swapEach + (prepBuy.double ? P.double : 0) + (prepBuy.shield ? P.shield : 0) +
      (prepBuy.gold ? P.gold : 0) + (prepBuy.pack ? P.pack : 0);
    box.innerHTML = `<div class="prep-inner">
      <div class="pp-title">局前準備</div>
      <p class="pp-line">點下面的手牌選要換掉的牌：已選 <b>${n}</b> 張（前 ${P.freeSwap} 張免費，之後每張 ${P.swapEach}，最多 ${P.maxSwap} 張）</p>
      <div class="pp-buy">
        <label class="${prepBuy.double ? 'on' : ''}"><input type="checkbox" id="ppDouble" ${prepBuy.double ? 'checked' : ''}>翻倍符 <small>胡了輸贏 ×2・${P.double}</small></label>
        <label class="${prepBuy.shield ? 'on' : ''}"><input type="checkbox" id="ppShield" ${prepBuy.shield ? 'checked' : ''}>防護罩 <small>擋一次攻擊・${P.shield}</small></label>
        <label class="${prepBuy.gold ? 'on' : ''}"><input type="checkbox" id="ppGold" ${prepBuy.gold ? 'checked' : ''}>免死金牌 <small>放槍不用付錢・${P.gold}</small></label>
        <label class="${prepBuy.pack ? 'on' : ''} pack">購買牌型 <small>換入最多 6 張・${P.pack}</small>
          <select id="ppPack"><option value="">不買</option>${Object.entries(PACK_NAMES).map(([k, n]) => `<option value="${k}" ${prepBuy.pack === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <div class="pp-foot"><span>花費：<b>${cost}</b>（你現在 ${me.score} 分）</span><button class="btn small gold" id="ppGo">確定開打</button></div>
    </div>`;
    $('ppDouble').onchange = (e) => { prepBuy.double = e.target.checked; renderPrep(); };
    $('ppShield').onchange = (e) => { prepBuy.shield = e.target.checked; renderPrep(); };
    $('ppGold').onchange = (e) => { prepBuy.gold = e.target.checked; renderPrep(); };
    $('ppPack').onchange = (e) => { prepBuy.pack = e.target.value; renderPrep(); };
    $('ppGo').onclick = () => {
      unlockAudio();
      const swap = prepSel.map(i => view.hand[i]);
      send({ type: 'prep', swap, double: prepBuy.double, shield: prepBuy.shield, gold: prepBuy.gold, pack: prepBuy.pack || null });
      prepSel = [];
    };
  }

  // ---------- 人物圖（紅框位置） ----------
  function placePortraits() {
    if (!view) return;
    const tbl = document.querySelector('.tbl').getBoundingClientRect();
    const portraitMode = window.innerHeight > window.innerWidth;
    const H = Math.max(50, Math.min(150, window.innerHeight * (portraitMode ? 0.1 : 0.17)));
    for (let r0 = 0; r0 < 4; r0++) { const sl = $('ps' + r0); if (sl) { sl.style.display = 'none'; } }
    for (let i = 0; i < view.players.length; i++) {
      const r = rel(i);
      const slot = $('ps' + r);
      const p = view.players[i];
      if (!p || !p.char) { slot.innerHTML = ''; slot.style.display = 'none'; continue; }
      const chip = (r === 0 ? $('p0') : $('p' + r)).querySelector('.chip');
      if (!chip) continue;
      const src = charImg(p.char);
      if (slot.dataset.src !== src) { slot.innerHTML = `<img src="${src}" alt="">`; slot.dataset.src = src; }
      slot.style.display = 'block';
      slot.classList.toggle('awake', !!p.awake);
      slot.style.height = H + 'px'; slot.style.width = (H * 0.8) + 'px';
      const c = chip.getBoundingClientRect();
      let x, y;
      if (r === 2) { x = c.left + c.width / 2 - H * 0.4; y = c.bottom + 4; }
      else if (r === 3) { x = c.right + 6; y = c.top + c.height / 2 - H / 2; }
      else if (r === 1) { x = c.left - 6 - H * 0.8; y = c.top + c.height / 2 - H / 2; }
      else { x = c.left + c.width / 2 - H * 0.4; y = c.top - 4 - H; }
      slot.style.left = (x - tbl.left) + 'px'; slot.style.top = (y - tbl.top) + 'px';
      slot.classList.toggle('flipx', r === 1);
    }
  }
  window.addEventListener('resize', () => requestAnimationFrame(placePortraits));

  // ---------- 局勢緊張度 ----------
  function updateTension() {
    const v = view;
    let lvl = 0, why = '';
    if (v.phase === 'play') {
      const decl = v.players.filter(p => p.declared);
      const bigDecl = decl.some(p => p.declared === 'tian' || p.declared === 'di');
      if (v.lian >= 3) { lvl = 1; why = `莊家連${v.lian}，氣氛開始緊張了…`; }
      if (decl.length) { lvl = 1; why = '有人聽牌了，打牌要小心！'; }
      if (v.remaining <= 12) { lvl = Math.max(lvl, 1); why = why || '牌快摸完了，每一張都關鍵！'; }
      if (v.lian >= 5 || bigDecl || (decl.length && v.remaining <= 8) || decl.length >= 2) {
        lvl = 2;
        why = v.lian >= 5 ? `莊家連${v.lian}！全場注意，肅殺之氣瀰漫牌桌！` : bigDecl ? '天聽地聽出現了！大牌要來了！' : '大戰一觸即發！';
      }
    }
    if (tensionHand !== v.handNo) { tensionHand = v.handNo; tension = 0; }
    if (lvl > tension && v.phase === 'play') {
      toastSmall(why);
      speak(why, 1.15, lvl === 2 ? 1.3 : 1.1);
      if (lvl === 2) playSound('boom');
    }
    if (v.phase === 'play') tension = Math.max(tension, lvl);
    const tbl = document.querySelector('.tbl');
    tbl.classList.toggle('tension1', tension === 1);
    tbl.classList.toggle('tension2', tension === 2);
    if (window.MJAudio) {
      // 熱血時：音樂檔轉小聲，合成的熱血音樂接上；其他時候只放音樂檔
      const hot = v.phase === 'play' && tension === 2;
      MJAudio.music.setLevel(hot ? 2 : 0);
      MJAudio.music.setOn(musicOn && hot);
      MJAudio.bgm.duck(hot);
    }
  }

  function myTurnToDiscard() {
    return view && view.phase === 'play' && view.stage === 'discard' && view.turn === view.seat && !autoOn;
  }

  function renderHand() {
    const v = view;
    const handEl = $('hand');
    handEl.innerHTML = '';
    const canDiscard = myTurnToDiscard();
    handEl.classList.toggle('myturn', canDiscard);
    if (!v.hand) return;
    const tiles = v.hand.map((k, idx) => ({ k, idx, drawn: false }));
    if (v.drawn != null) tiles.push({ k: v.drawn, idx: 'd', drawn: true });
    // 聽牌提示：哪些牌打出去會聽
    let tingSet = null;
    if (canDiscard) {
      tingSet = new Set();
      const all = v.hand.concat(v.drawn != null ? [v.drawn] : []);
      for (const k of new Set(all)) {
        const h = all.slice(); h.splice(h.indexOf(k), 1);
        if (R.waits(h).length) tingSet.add(k);
      }
    }
    if (selected && !tiles.some(t => t.idx === selected.idx && t.k === selected.k)) selected = null;
    if (!canDiscard) selected = null;
    const me = v.players[v.seat];
    const fog = me.fx && me.fx.fog && v.phase === 'play';
    const flip = me.fx && me.fx.flip && v.phase === 'play';
    if (me.declared || fog) tingSet = null;
    const danger = v.safe && canDiscard ? new Set(v.safe) : null;
    let wallSafe = null;
    if (v.metaView && v.metaView.wallSafe && canDiscard && !fog) {
      const seen = new Array(34).fill(0);
      for (const p of v.players) { for (const t of p.river) if (!t.taken && t.k != null) seen[t.k]++; for (const m of p.melds) { if (m.type === 'chi') m.tiles.forEach(k => seen[k]++); else if (m.k != null) seen[m.k] += m.type === 'pong' ? 3 : 4; } }
      wallSafe = seen.map(n => n >= 3);
    }
    handEl.classList.toggle('flipped', !!flip);
    handEl.classList.toggle('fogged', !!fog);
    handEl.classList.toggle('swapping', swapTarget != null);
    if (!canDiscard) { swapTarget = null; charTilePick = false; }
    handEl.classList.toggle('swapping', swapTarget != null || charTilePick);
    for (const t of tiles) {
      const hidden = (t.drawn && mi && !mi.done) || fog;
      const locked = me.declared && !t.drawn;
      const el = tileEl(hidden ? null : t.k, (t.drawn ? 'drawn' : '') + (selected && selected.idx === t.idx ? ' sel' : '') +
        (tingSet && tingSet.has(t.k) ? ' waitmark' : '') + (locked ? ' dim' : '') + (prepping() && prepSel.includes(t.idx) ? ' swapsel' : '') +
        (danger ? (danger.has(t.k) ? ' danger' : ' safe') : '') + (wallSafe && wallSafe[t.k] ? ' wallsafe' : ''));
      el.onclick = () => onTileClick(t);
      handEl.appendChild(el);
    }
    // 打這張會聽什麼
    if (canDiscard && me.char === 'c05' && view.skills && !fog) calcHints(handEl, tiles, v);
    if (canDiscard) $('waits').innerHTML = '';
    if (canDiscard && swapTarget != null) {
      $('waits').innerHTML = `<div class="hand-hint swap-hint">換牌術：點一張要換給 ${esc(v.players[swapTarget].name)} 的牌 <button id="swapCancel">取消</button></div>`;
      $('swapCancel').onclick = (e) => { e.stopPropagation(); swapTarget = null; render(); };
    } else if (canDiscard && selected && !fog) {
      const all = v.hand.concat(v.drawn != null ? [v.drawn] : []);
      const h = all.slice(); h.splice(h.indexOf(selected.k), 1);
      const w = R.waits(h);
      const hint = document.createElement('div');
      hint.className = 'hand-hint';
      hint.innerHTML = w.length ? `打出後聽：${w.map(k => tileHTML(k)).join('')}` : '再點一次打出';
      $('waits').appendChild(hint);
    }
  }

  // 算算姐的被動：每張牌打出後還有幾張有效進張
  function calcHints(handEl, tiles, v) {
    const all = v.hand.concat(v.drawn != null ? [v.drawn] : []);
    const me = v.players[v.seat];
    const n = 5 - me.melds.length;
    const seen = new Array(34).fill(0);
    for (const p of v.players) {
      for (const t of p.river) if (!t.taken && t.k != null) seen[t.k]++;
      for (const m of p.melds) { if (m.type === 'chi') m.tiles.forEach(k => seen[k]++); else if (m.k != null) seen[m.k] += m.type === 'pong' ? 3 : 4; }
    }
    for (const k of all) seen[k]++;
    const cache = {};
    const c = R.toCounts(all);
    for (const k of new Set(all)) {
      c[k]--;
      const base = R.shantenCounts(c, n);
      let u = 0;
      for (let x = 0; x < 34; x++) { const left = 4 - seen[x]; if (left <= 0) continue; c[x]++; if (R.shantenCounts(c, n) < base) u += left; c[x]--; }
      c[k]++;
      cache[k] = u;
    }
    const best = Math.max(...Object.values(cache));
    handEl.querySelectorAll('.tile').forEach((el, i) => {
      const t = tiles[i]; if (!t) return;
      const b = document.createElement('span');
      b.className = 'ukeire' + (cache[t.k] === best ? ' best' : '');
      b.textContent = cache[t.k];
      el.appendChild(b);
    });
  }

  function onTileClick(t) {
    if (prepping() && t.idx !== 'd') {
      const i = prepSel.indexOf(t.idx);
      if (i >= 0) prepSel.splice(i, 1);
      else if (prepSel.length < view.prices.maxSwap) prepSel.push(t.idx);
      playSound('tick');
      renderHand(); renderPrep();
      return;
    }
    if (!myTurnToDiscard()) return;
    if (mi && !mi.done) return;
    if (swapTarget != null) {
      const target = swapTarget; swapTarget = null;
      if (pendingCard != null) { const i = pendingCard; pendingCard = null; send({ type: 'skill', id: 'card', idx: i, target, k: t.k }); }
      else send({ type: 'skill', id: 'swaptile', target, k: t.k });
      return;
    }
    if (charTilePick) {
      charTilePick = false;
      send({ type: 'skill', id: 'char', k: t.k });
      return;
    }
    const me = view.players[view.seat];
    if (me.declared && !t.drawn) { toastSmall('報聽後只能打摸進來的牌'); return; }
    unlockAudio();
    if (selected && selected.idx === t.idx && selected.k === t.k) {
      selected = null;
      send({ type: 'discard', k: t.k });
      playSound('slam');
      return;
    }
    selected = { k: t.k, idx: t.idx };
    playSound('tick');
    if (view.metaView && view.metaView.warn && view.metaView.warn.includes(t.k)) { toast('危險！', view.seat); speak('小心，這張會放槍', 1.2, 1.1); }
    renderHand();
    renderActions();
  }

  function renderActions() {
    const v = view;
    const el = $('actions');
    el.innerHTML = '';
    if (autoOn || v.phase !== 'play') return;
    if (mi && !mi.done) return;
    const opts = v.options || [];
    const me = v.players[v.seat];
    const add = (cls, html, fn) => {
      const b = document.createElement('button');
      b.className = 'act ' + cls; b.innerHTML = html;
      b.onclick = (e) => { e.stopPropagation(); unlockAudio(); fn(); };
      el.appendChild(b);
    };
    const myDiscardTurn = v.stage === 'discard' && v.turn === v.seat;
    // 相公模式：胡的按鈕一直在，自己判斷能不能胡
    const xiangHu = v.xiangMode && !me.xiang && (v.claimOpen || myDiscardTurn);
    // 報聽按鈕：選中的牌打出後會聽
    let tingBtn = false;
    if (myDiscardTurn && !me.declared && selected) {
      const all = v.hand.concat(v.drawn != null ? [v.drawn] : []);
      const h = all.slice(); h.splice(h.indexOf(selected.k), 1);
      tingBtn = R.waits(h).length > 0;
    }
    if (!opts.length && !xiangHu && !tingBtn) { chiPicking = false; kongPicking = false; return; }
    if (xiangHu) add('hu', '胡', () => send({ type: 'hu' }));
    if (tingBtn) add('ting', `<img src="${img('50x50_hear')}" alt="">報聽`, () => {
      const k = selected.k; selected = null;
      send({ type: 'discard', k, declare: true });
      playSound('slam');
    });
    if (v.stage === 'claim') {
      const k = v.claimTile ? v.claimTile.k : null;
      if (chiPicking) {
        for (const o of opts.filter(o => o.type === 'chi')) {
          const ks = [o.tiles[0], o.tiles[1], k].sort((a, b) => a - b);
          add('chi opt', ks.map(x => tileHTML(x)).join(''), () => { chiPicking = false; send({ type: 'chi', tiles: o.tiles }); });
        }
        add('pass', '返回', () => { chiPicking = false; renderActions(); });
        return;
      }
      if (opts.some(o => o.type === 'hu')) add('hu', '胡', () => send({ type: 'hu' }));
      if (opts.some(o => o.type === 'kong')) add('kong', '槓', () => send({ type: 'kong' }));
      if (opts.some(o => o.type === 'pong')) add('pong', '碰', () => send({ type: 'pong' }));
      const chis = opts.filter(o => o.type === 'chi');
      if (chis.length) add('chi', '吃', () => {
        if (chis.length === 1) send({ type: 'chi', tiles: chis[0].tiles });
        else { chiPicking = true; renderActions(); }
      });
      add('pass', '過', () => send({ type: 'pass' }));
    } else if (v.stage === 'discard' && opts.length) {
      if (opts.some(o => o.type === 'zimo')) add('hu', '自摸', () => send({ type: 'zimo' }));
      const kongs = opts.filter(o => o.type === 'ankong' || o.type === 'jiakong');
      if (kongPicking) {
        for (const o of kongs) add('kong opt', tileHTML(o.k) + (o.type === 'ankong' ? '暗槓' : '加槓'), () => { kongPicking = false; send(o); });
        add('pass', '返回', () => { kongPicking = false; renderActions(); });
        return;
      }
      if (kongs.length) add('kong', '槓', () => {
        if (kongs.length === 1) send(kongs[0]); else { kongPicking = true; renderActions(); }
      });
    }
  }

  function renderWaits() {
    const v = view;
    const el = $('waits');
    el.innerHTML = '';
    if (!v.hand || v.phase !== 'play') return;
    if (v.stage === 'discard' && v.turn === v.seat) return;
    const me0 = v.players[v.seat];
    if (me0.fx && me0.fx.fog) { el.innerHTML = '<span>迷霧中，看不清手牌</span>'; return; }
    const w = R.waits(v.hand);
    if (!w.length) return;
    // 算剩餘張數
    const seen = new Array(34).fill(0);
    for (const p of v.players) {
      for (const t of p.river) if (!t.taken && t.k != null) seen[t.k]++;
      for (const m of p.melds) {
        if (m.type === 'chi') m.tiles.forEach(k => seen[k]++);
        else if (m.k != null) seen[m.k] += m.type === 'pong' ? 3 : 4;
      }
    }
    for (const k of v.hand) seen[k]++;
    const left = w.reduce((s, k) => s + Math.max(0, 4 - seen[k]), 0);
    el.innerHTML = `<span>聽</span>${w.map(k => tileHTML(k)).join('')}<span>剩${left}張</span>`;
  }

  function tickTimer() {
    const t = $('timer');
    if (!t) return;
    if (!deadlineAt || !view || view.phase !== 'play') { t.textContent = ''; return; }
    const s = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
    t.textContent = s;
    t.classList.toggle('low', s <= 5);
  }
  setInterval(tickTimer, 250);

  // ---------- 結算畫面 ----------
  function handGroupHTML(h, winTile) {
    let marked = false;
    const tiles = h.hand.map(k => {
      let cls = '';
      if (!marked && k === winTile) { cls = 'win'; marked = true; }
      return tileHTML(k, cls);
    }).join('');
    return `<div class="res-hand">${h.melds.map(m => meldHTML(m, '')).join('')}<div class="grp">${tiles}</div>
      ${h.flowers.length ? `<div class="grp">${h.flowers.map(k => tileHTML(k)).join('')}</div>` : ''}</div>`;
  }

  function renderResult() {
    const v = view;
    const box = $('result');
    if (!v.result) {
      box.classList.add('hidden'); resultShownFor = null;
      if (resultAnim) { resultAnim.cancel(); resultAnim = null; }
      return;
    }
    const r = v.result;
    const key = v.handNo + ':' + r.type;
    if (resultShownFor === key) { updateResultFoot(); return; }
    resultShownFor = key;
    box.innerHTML = buildResultHTML(v, r);
    const on = (id, fn) => { const b = $(id); if (b) b.onclick = (e) => { e.stopPropagation(); fn(); }; };
    on('readyBtn', () => send({ type: 'ready' }));
    on('againBtn', () => { if (mode === 'solo') startSolo(soloN); else socket.emit('start'); });
    on('toRoomBtn', () => socket.emit('backToRoom'));
    on('toLobbyBtn', () => quit());
    updateResultFoot();
    if (mode === 'adv' && window.MJAdv && $('advFoot')) MJAdv.resultFoot(v, $('advFoot'));
    box.classList.add('hidden');
    // 延遲一下再跳出，讓大家看到最後一張
    setTimeout(() => {
      if (!view || !view.result || resultShownFor !== key) return;
      box.classList.remove('hidden');
      resultAnim = playResultAnim(r);
    }, 1300);
  }

  function buildResultHTML(v, r) {
    const P = v.players;
    let html = '<div class="res">';
    if (r.type === 'draw') {
      html += `<div class="res-head"><img class="big" src="${img('liu')}" alt="流"><img class="big" src="${img('g')}" alt="局"></div>
        <p class="res-sub" style="text-align:center">牌摸完了，莊家連莊</p>`;
    } else {
      const w = P[r.winner];
      const title = r.special === 'bxgh' ? '八仙過海' : r.special === 'qqy' ? '七搶一' : r.special === 'alt' ? r.altName : (r.selfDraw ? '自摸' : '胡牌');
      html += `<div class="res-head"><img class="big" src="${img('hu')}" alt="胡"><div><div class="res-title">${esc(w.name)} ${title}！</div>
        <div class="res-sub">${r.loser != null ? esc(P[r.loser].name) + ' 放槍' : '三家付錢'}</div></div></div>`;
      html += handGroupHTML(r.hands[r.winner], r.tile);
      if (r.horses && r.horses.length) {
        html += `<div class="horses"><span class="hl">抓馬</span>${r.horses.map((h, i) =>
          `<div class="horse" data-i="${i}">${tileHTML(null, 'm')}<span class="hseat">${esc(P[h.seat].name)}</span></div>`).join('')}</div>
          <div class="horse-sum pending">${r.horses.some(h => h.hit) ? `中馬 ${r.horses.filter(h => h.hit).length} 匹！` : '沒有中馬'}</div>`;
      }
      if (r.doubled) html += `<div class="dbl-tag">翻倍符生效</div>`;
      if (r.goldSaved != null) html += `<div class="dbl-tag gold">${esc(P[r.goldSaved].name)} 用了免死金牌，由銀行代付</div>`;
      const items = r.items.concat(r.dealerItems);
      html += `<div class="tai">${items.map(([n, t]) => `<span class="ti pending${t >= 4 ? ' bigitem' : ''}" data-t="${t}">${esc(n)}<b>+${t}台</b></span>`).join('')}</div>`;
      html += `<div class="tai-total"><span id="taiNum">0</span><small>台</small><span class="mult pending" id="multTag">${r.mult > 1 ? '×' + r.mult : ''}</span></div>`;
      html += `<p class="res-sub" style="text-align:center">${v.settings.base} 底 ${v.settings.perTai} 台</p>`;
    }
    html += '<div class="later">';
    html += '<table class="pay">';
    for (let i = 0; i < P.length; i++) {
      const d = r.deltas[i];
      html += `<tr><td>${esc(P[i].name)}${i === v.seat ? '（你）' : ''}</td><td class="num ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${d > 0 ? '+' : ''}${d}</td><td class="num">${P[i].score}</td></tr>`;
    }
    html += '</table>';
    html += `<details class="others"><summary>看其他家的牌</summary>${P.map((x, i) => i).filter(i => r.type === 'draw' || i !== r.winner).map(i =>
      `<div class="orow"><b>${esc(P[i].name)}</b>${r.hands[i].hand.map(k => tileHTML(k)).join('')}</div>`).join('')}</details>`;
    if (r.willEnd) {
      html += `<h3 style="text-align:center;color:var(--gold);margin:12px 0 4px">牌局結束・最終排名</h3><table class="pay">`;
      r.final.forEach((f, n) => {
        html += `<tr><td>${['第一', '第二', '第三', '第四'][n]} ${esc(f.name)}</td><td class="num">胡${f.hu}・自摸${f.zimo}・放槍${f.pao}</td><td class="num ${f.score > 0 ? 'pos' : f.score < 0 ? 'neg' : ''}">${f.score}</td></tr>`;
      });
      html += '</table>';
      if (mode === 'solo') html += `<button class="btn gold" id="againBtn">再來一將</button><button class="btn ghost" id="toLobbyBtn">回大廳</button>`;
      else if (roomInfo && roomInfo.host === pid) html += `<button class="btn gold" id="againBtn">再來一將</button><button class="btn ghost" id="toRoomBtn">回房間</button>`;
      else html += `<p class="hint">等待房主決定要不要再來一將</p><button class="btn ghost" id="toLobbyBtn">離開</button>`;
    } else if (mode === 'adv') {
      html += `<div id="advFoot"></div>`;
    } else {
      html += `<button class="btn gold" id="readyBtn">下一局</button><p class="ready-list" id="readyList"></p>`;
    }
    html += '</div><p class="skip-hint" id="skipHint">點一下畫面可以跳過動畫</p></div>';
    return html;
  }

  function updateResultFoot() {
    const v = view, P = v.players, me = P[v.seat];
    const b = $('readyBtn');
    if (b) { b.disabled = !!me.ready; b.textContent = me.ready ? '等待其他玩家…' : '下一局'; }
    const l = $('readyList');
    if (l) {
      const notReady = P.filter(p => !p.ready).map(p => p.name);
      l.textContent = notReady.length && me.ready ? '等待：' + notReady.join('、') : '';
    }
  }

  // 拉霸式台數跳字
  function playResultAnim(r) {
    const box = $('result');
    const res = box.querySelector('.res');
    let cancelled = false, finished = false;
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(() => { if (!cancelled) fn(); }, ms));
    const num = $('taiNum');
    let shown = 0;
    const setNum = (target, dur) => {
      if (!num) return;
      const from = shown, t0 = performance.now();
      shown = target;
      const stepF = (now) => {
        if (cancelled) return;
        const p = Math.min(1, (now - t0) / dur);
        num.textContent = Math.round(from + (target - from) * p);
        if (p < 1) requestAnimationFrame(stepF);
      };
      requestAnimationFrame(stepF);
    };
    const finish = () => {
      if (finished) return;
      finished = true; cancelled = true;
      timers.forEach(clearTimeout);
      box.querySelectorAll('.pending').forEach(e => e.classList.remove('pending'));
      box.querySelectorAll('.later').forEach(e => e.classList.add('show'));
      box.querySelectorAll('.horse').forEach((el) => flipHorse(el, r, false));
      if (num && r.type === 'win') { num.textContent = r.tai + r.dealerItems.reduce((s, x) => s + x[1], 0); num.parentElement.classList.add('final'); }
      const sk = $('skipHint'); if (sk) sk.remove();
    };
    res.addEventListener('click', (e) => { if (!finished && !e.target.closest('button,summary')) finish(); });
    if (r.type !== 'win') { finish(); return { cancel() { cancelled = true; } }; }
    let t = 200;
    // 抓馬翻牌
    const horses = [...box.querySelectorAll('.horse')];
    horses.forEach((el) => { at(t, () => flipHorse(el, r, true)); t += 450; });
    if (horses.length) { at(t, () => { const hs = box.querySelector('.horse-sum'); hs.classList.remove('pending'); if (r.mult > 1) playSound('bell'); }); t += 500; }
    // 一項一項跳出台數
    const items = [...box.querySelectorAll('.ti')];
    let acc = 0;
    items.forEach((el, i) => {
      const val = Number(el.dataset.t);
      const big = val >= 4;
      if (big) t += 250;
      at(t, () => {
        el.classList.remove('pending'); el.classList.add('pop');
        acc += val; setNum(acc, 280);
        playSound('rise', { step: i });
        if (big) { playSound('boom'); shake(); speak(el.firstChild.textContent + '，' + val + '台', 1.2, 1.2); }
      });
      t += big ? 750 : 380;
    });
    at(t + 150, () => {
      if (num) num.parentElement.classList.add('final');
      playSound('stamp');
      const total = r.tai + r.dealerItems.reduce((s, x) => s + x[1], 0);
      speak(`總共${total}台` + (r.mult > 1 ? `，中馬乘${r.mult}` : ''), 1.1, 1.15);
      const m = $('multTag'); if (m) m.classList.remove('pending');
      if (total >= 8) shake(true);
    });
    at(t + 900, finish);
    return { cancel() { cancelled = true; timers.forEach(clearTimeout); } };
  }
  function flipHorse(el, r, withSound) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const h = r.horses[Number(el.dataset.i)];
    el.querySelector('.tile').outerHTML = tileHTML(h.k, 'm');
    el.classList.add('flipped');
    if (h.hit) el.classList.add('hit');
    if (withSound) playSound(h.hit ? 'bell' : 'flip');
  }
  function shake(big) {
    const t = $('table');
    t.classList.remove('shake', 'shake-big'); void t.offsetWidth;
    t.classList.add(big ? 'shake-big' : 'shake');
    setTimeout(() => t.classList.remove('shake', 'shake-big'), 600);
    try { if (navigator.vibrate) navigator.vibrate(big ? [80, 50, 140] : 40); } catch (e) { }
  }

  // ---------- 狀態與事件 ----------
  function onState(v) {
    const newHand = !view || view.handNo !== v.handNo;
    view = v;
    if (newHand) { selected = null; chiPicking = false; kongPicking = false; }
    checkDraw(v);
    if (v.swapInfo && v.swapInfo.key !== swapInfoKey) {
      swapInfoKey = v.swapInfo.key;
      setTimeout(() => toastSmall(`換牌術：給出 ${R.tileName(v.swapInfo.gave)}，換到 ${R.tileName(v.swapInfo.got)}`), 800);
    }
    if (!$('table').classList.contains('hidden')) render();
    else { show('table'); render(); }
    const me = v.players[v.seat];
    if (mode === 'online' && me) { autoOn = !!me.auto; updateMenu(); }
    checkDeclaredAuto(v);
    if (mode === 'adv' && window.MJAdv) MJAdv.hud(v);
  }

  // 摸到牌：判斷要不要瞇牌
  function checkDraw(v) {
    const mine = v.phase === 'play' && v.stage === 'discard' && v.turn === v.seat && v.drawn != null && !autoOn;
    if (!mine) { if (mi && !mi.done) closeMi(); return; }
    const key = v.handNo + ':' + v.remaining + ':' + v.players[v.seat].river.length + ':' + v.drawn;
    if (key === lastDrawKey) return;
    lastDrawKey = key;
    if (mi) closeMi();
    const canWin = R.isWin(v.hand.concat([v.drawn]));
    const tenpai = R.waits(v.hand).length > 0;
    let pref = miPref;
    if (v.xiangMode && pref === 'win') pref = 'ting'; // 相公模式不能洩漏能不能胡
    const want = pref === 'ting' ? tenpai : pref === 'win' ? canWin : false;
    if (want) openMi(v.drawn, canWin);
  }

  // 報聽後：摸到的牌自動打出（能自摸時等你按）
  function checkDeclaredAuto(v) {
    const me = v.players[v.seat];
    if (!me || !me.declared || autoOn) return;
    if (!(v.phase === 'play' && v.stage === 'discard' && v.turn === v.seat && v.drawn != null)) return;
    if (mi && !mi.done) return;
    const key = lastDrawKey;
    if (autoDiscardKey === key) return;
    const canZimo = (v.options || []).some(o => o.type === 'zimo');
    if (canZimo) return;
    autoDiscardKey = key;
    const k = v.drawn;
    setTimeout(() => {
      const w = view;
      if (w && w.phase === 'play' && w.stage === 'discard' && w.turn === w.seat && w.drawn === k && lastDrawKey === key) send({ type: 'discard', k });
    }, v.xiangMode ? 1500 : 650);
  }

  // ---------- 瞇牌 ----------
  function openMi(k, canWin) {
    const box = document.createElement('div');
    box.className = 'mi';
    box.innerHTML = `<div class="mi-box">
      <div class="mi-title">瞇牌</div>
      <div class="mi-tile"><div class="mi-face" style="background-image:url(${tileUrl(k)})"></div><div class="mi-cover"></div></div>
      <div class="mi-hint">按住牌往下推，慢慢瞇開</div>
      <button class="btn small ghost mi-open">直接翻開</button></div>`;
    $('table').appendChild(box);
    mi = { k, canWin, el: box, done: false, prog: 0, lastTick: 0 };
    const tile = box.querySelector('.mi-tile'), cover = box.querySelector('.mi-cover');
    let startY = null, startX = null;
    const setProg = (p) => {
      mi.prog = Math.max(0, Math.min(1, p));
      cover.style.transform = `translateY(${mi.prog * 100}%)`;
      const tick = Math.floor(mi.prog * 10);
      if (tick > mi.lastTick) { mi.lastTick = tick; playSound('rub'); }
    };
    tile.addEventListener('pointerdown', (e) => {
      startY = e.clientY; startX = e.clientX; tile.setPointerCapture(e.pointerId);
      cover.style.transition = 'none'; unlockAudio();
    });
    tile.addEventListener('pointermove', (e) => {
      if (startY == null || mi.done) return;
      const dy = Math.max(0, e.clientY - startY), dx = Math.abs(e.clientX - startX);
      const dist = Math.max(dy, dx * 0.8);
      setProg(dist / (tile.offsetHeight * 1.1));
      if (mi.prog >= 0.75) revealMi();
    });
    const up = () => {
      if (startY == null || mi.done) return;
      startY = null;
      if (mi.prog >= 0.5) revealMi();
      else { cover.style.transition = 'transform .25s'; setProg(mi.prog * 0.6); }
    };
    tile.addEventListener('pointerup', up);
    tile.addEventListener('pointercancel', up);
    box.querySelector('.mi-open').onclick = () => { unlockAudio(); revealMi(); };
    render();
  }
  function revealMi() {
    if (!mi || mi.done) return;
    const m = mi;
    m.done = true;
    const cover = m.el.querySelector('.mi-cover');
    cover.style.transition = 'transform .25s ease-in';
    cover.style.transform = 'translateY(110%)';
    m.el.classList.add('revealed');
    const bigTile = m.k >= 31 && m.k <= 33;
    if (m.canWin && !(view && view.xiangMode)) {
      m.el.classList.add('win');
      playSound('boom'); shake(true);
      toast('自摸！？', view.seat);
    } else if (m.canWin) {
      playSound('slam'); shake();
    } else {
      playSound(bigTile ? 'boom' : 'slam');
      if (bigTile) shake();
    }
    setTimeout(() => { closeMi(); if (view) { render(); checkDeclaredAuto(view); } }, m.canWin ? 1100 : 650);
  }
  function closeMi() {
    if (!mi) return;
    if (mi.el) mi.el.remove();
    mi.done = true;
    mi = null;
  }

  function posOf(seat) {
    const r = rel(seat);
    return [[50, 72], [80, 45], [50, 20], [20, 45]][r];
  }
  function toast(text, seat) {
    const [x, y] = seat == null ? [50, 45] : posOf(seat);
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = text;
    d.style.left = x + '%'; d.style.top = y + '%';
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }
  function toastSmall(text, seat) {
    const [x, y0] = seat == null ? [50, 50] : posOf(seat);
    const y = seat == null ? y0 : y0 + (rel(seat) === 2 ? 9 : rel(seat) === 0 ? -9 : 10);
    const d = document.createElement('div');
    d.className = 'toast small'; d.textContent = text;
    d.style.left = x + '%'; d.style.top = y + '%';
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }
  function showChat(c) {
    if (!view) return;
    const chip = document.querySelector(`.chip[data-seat="${c.seat}"]`);
    const b = document.createElement('div');
    b.className = 'bubble';
    b.textContent = c.text;
    const [x, y] = posOf(c.seat);
    b.style.left = x + '%'; b.style.top = (rel(c.seat) === 0 ? y - 12 : y) + '%';
    $('toasts').appendChild(b);
    setTimeout(() => b.remove(), 3200);
    if (chip) { chip.classList.add('talking'); setTimeout(() => chip.classList.remove('talking'), 1500); }
    // 每個座位不同的聲調
    speak(c.text, 1.15, [1.0, 0.8, 1.35, 0.95][rel(c.seat)]);
  }

  function onSkillEvent(ev) {
    if (ev.id === 'char') {
      const c = CH.BY_ID[ev.sub];
      const go = () => {
        toast(c.skill.name + '！', ev.target != null && !ev.blocked ? ev.target : ev.seat);
        playSound(ev.blocked ? 'bell' : 'stamp');
        if (ev.jiao) setTimeout(() => toastSmall(`擲筊結果：${ev.jiao}`, ev.seat), 600);
      };
      speak(c.skill.name, 1.1, 1.1);
      if (ev.target != null) fireMissile(ev.seat, ev.target, go, 'hex'); else go();
      return;
    }
    if (ev.reflected) setTimeout(() => toast('反彈！', ev.target), 700);
    const names = { cuopai: '搓牌！', luck: '氣運值！', peek: '神算！', missile: '飛彈！', safe: '安全牌偵測！', ink: '隱形墨水！' };
    if (ev.id === 'debuff' || ev.id === 'swaptile') {
      const nm = ev.id === 'debuff' ? DEBUFF[ev.sub][0] : '換牌術';
      speak(nm, 1.15, 1.1);
      fireMissile(ev.seat, ev.target, () => {
        if (ev.blocked) { toast('擋下了！', ev.target); playSound('bell'); }
        else { toast(nm + '！', ev.target); playSound(ev.id === 'debuff' ? 'xiang' : 'pop'); if (ev.id === 'debuff') shake(); }
      }, ev.id === 'debuff' ? 'hex' : 'swap');
      return;
    }
    if (ev.id === 'missile') {
      speak(ev.seat === view.seat ? '發射' : '飛彈來了', 1.2, 1.1);
      fireMissile(ev.seat, ev.target, () => {
        if (ev.blocked) { toast('擋下了！', ev.target); playSound('bell'); speak('防護罩擋下了'); }
        else { toast(MISSILE[ev.sub][0] + '！', ev.target); playSound('boom'); shake(); }
      });
      return;
    }
    toast(names[ev.id] || '技能！', ev.seat);
    speak(names[ev.id].replace('！', ''), 1.1, 1.2);
    playSound(ev.id === 'cuopai' ? 'stamp' : 'bell');
  }
  function fireMissile(from, to, done, style) {
    const [x1, y1] = posOf(from), [x2, y2] = posOf(to);
    const layer = $('toasts');
    const m = document.createElement('div');
    m.className = 'missile' + (style ? ' ' + style : '');
    const ang = Math.atan2((y2 - y1) * layer.offsetHeight, (x2 - x1) * layer.offsetWidth) * 180 / Math.PI;
    m.style.left = x1 + '%'; m.style.top = y1 + '%';
    m.style.setProperty('--ang', ang + 'deg');
    layer.appendChild(m);
    playSound('rub');
    requestAnimationFrame(() => requestAnimationFrame(() => { m.style.left = x2 + '%'; m.style.top = y2 + '%'; }));
    setTimeout(() => {
      m.remove();
      const b = document.createElement('div');
      b.className = 'boomfx'; b.style.left = x2 + '%'; b.style.top = y2 + '%';
      layer.appendChild(b);
      setTimeout(() => b.remove(), 700);
      done();
    }, 750);
  }

  function onEvent(ev) {
    if (!view) return;
    switch (ev.type) {
      case 'discard':
        freshDiscard = { seat: ev.seat, t: Date.now() };
        if (ev.seat !== view.seat) playSound('tile');
        if (voiceOn && ev.seat !== view.seat) speak(ev.k == null ? '墨水牌' : R.tileName(ev.k), 1.25);
        break;
      case 'slip': toast('手滑！', ev.seat); speak('手滑了', 1.1, 1.2); playSound('xiang'); break;
      case 'ting': {
        const label = ev.kind === 'tian' ? '天聽！' : ev.kind === 'di' ? '地聽！' : '聽！';
        toast(label, ev.seat); speak(label.replace('！', ''), 1, 0.9);
        playSound('thunder'); flash(); if (ev.kind !== 'ting') shake(true);
        break;
      }
      case 'xiang': toast('相公！', ev.seat); speak('相公', 1, 0.8); playSound('xiang'); shake(); break;
      case 'talk': showChat({ seat: ev.seat, name: view.players[ev.seat].name, text: ev.text }); break;
      case 'skill': onSkillEvent(ev); break;
      case 'card': {
        const c = window.MJCards.CARDS[ev.card];
        const go = () => { toast(c.name + '！', ev.target != null ? ev.target : ev.seat); playSound(c.type === 'field' ? 'thunder' : c.type === 'win' ? 'stamp' : 'bell'); };
        speak(c.name, 1.1, 1.1);
        if (c.type === 'field') { flash(); setTimeout(() => toastSmall(`結界展開：${c.desc}`), 600); }
        if (c.type === 'win') setTimeout(() => toastSmall(`勝利卡：${c.desc}`), 600);
        if (c.type === 'trap') { toastSmall('蓋了一張陷阱卡'); playSound('flip'); break; }
        if (ev.target != null) fireMissile(ev.seat, ev.target, go, 'hex'); else go();
        break;
      }
      case 'trap': { const c = window.MJCards.CARDS[ev.card]; toast('陷阱發動！', ev.seat); setTimeout(() => toast(c.name + '！', ev.target != null ? ev.target : ev.seat), 600); playSound('boom'); shake(); speak('陷阱發動，' + c.name); break; }
      case 'altprog': toastSmall(`么九王：${ev.n}／${ev.need}`); break;
      case 'awaken': {
        const c = CH.BY_ID[ev.char];
        toast('覺醒！', ev.seat); flash(); shake(true); playSound('thunder');
        setTimeout(() => toastSmall(`${view.players[ev.seat].name}・${c.awaken.name}：${c.awaken.desc}`, ev.seat), 700);
        speak(c.awaken.name, 1, 0.8);
        break;
      }
      case 'guard': toast(ev.how === 'reflect' ? '反彈！' : ev.how === 'shield' ? '擋下了！' : '落空！', ev.seat); playSound('bell'); break;
      case 'frozen': toast('定身！', ev.seat); speak('定身，跳過一巡', 1.1, 0.9); playSound('xiang'); break;
      case 'prep': {
        const bits = [];
        if (ev.swap) bits.push(`換${ev.swap}張`);
        if (ev.double) bits.push('翻倍符');
        if (ev.shield) bits.push('防護罩');
        if (ev.seat !== view.seat) toastSmall(bits.join('・'), ev.seat);
        playSound('pop');
        break;
      }
      case 'pong': toast('碰！', ev.seat); speak('碰'); playSound('claim'); break;
      case 'chi': toast('吃！', ev.seat); speak('吃'); playSound('claim'); break;
      case 'kong': toast(ev.hidden ? '暗槓！' : '槓！', ev.seat); speak('槓'); playSound('claim'); break;
      case 'flower': toastSmall('補花 ' + R.tileName(ev.k), ev.seat); break;
      case 'hu': toast('胡！', ev.seat); speak('胡了'); playSound('win'); shake(); break;
      case 'zimo': toast('自摸！', ev.seat); speak('自摸'); playSound('win'); shake(); break;
      case 'drawgame': toast('流局'); speak('流局'); break;
      case 'draw': if (ev.seat === view.seat) playSound('tick'); break;
    }
  }

  // ---------- 聲音 ----------
  function unlockAudio() {
    if (!window.MJAudio) return;
    MJAudio.unlock();
    MJAudio.bgm.setOn(musicOn);
  }
  // 第一次點畫面就開始播大廳音樂（瀏覽器規定要點過才能出聲）
  document.addEventListener('pointerdown', () => unlockAudio(), { capture: true });
  function playSound(kind, opt) { if (window.MJAudio) MJAudio.play(kind, opt); }
  function flash() {
    const f = document.createElement('div');
    f.className = 'flash';
    $('table').appendChild(f);
    setTimeout(() => f.remove(), 900);
  }
  let zhVoice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices();
    zhVoice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh[-_](HK|CN)/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text, rate, pitch) {
    if (!voiceOn || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW'; if (zhVoice) u.voice = zhVoice;
      u.rate = rate || 1.1;
      u.pitch = pitch || 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { }
  }

  // ---------- 選單 ----------
  function updateMenu() {
    $('autoBtn').textContent = '託管：' + (autoOn ? '開' : '關');
    $('voiceBtn').textContent = '語音：' + (voiceOn ? '開' : '關');
    $('musicBtn').textContent = '背景音樂：' + (musicOn ? '開' : '關');
  }
  updateMenu();
  $('menuBtn').onclick = () => $('menu').classList.toggle('hidden');
  $('closeMenu').onclick = () => $('menu').classList.add('hidden');
  $('autoBtn').onclick = () => {
    autoOn = !autoOn; updateMenu();
    if (isLocal() && localGame) { localGame.players[0].auto = autoOn; localGame.update(); localGame.kick(0); }
    else if (socket) socket.emit('auto', autoOn);
    if (view) render();
  };
  $('voiceBtn').onclick = () => { voiceOn = !voiceOn; store.set('mj16_voice', voiceOn ? 'on' : 'off'); updateMenu(); };
  function toggleMusic() {
    musicOn = !musicOn; store.set('mj16_music', musicOn ? 'on' : 'off'); unlockAudio(); updateMenu();
    if (window.MJAudio && !musicOn) MJAudio.music.setOn(false);
    const lm = $('lobbyMusic'); if (lm) lm.textContent = musicOn ? '音樂：開' : '音樂：關';
  }
  $('musicBtn').onclick = toggleMusic;
  if ($('lobbyMusic')) { $('lobbyMusic').textContent = musicOn ? '音樂：開' : '音樂：關'; $('lobbyMusic').onclick = (e) => { e.stopPropagation(); toggleMusic(); }; }
  // 垃圾話輪盤
  $('talkPanel').innerHTML = TALK.map(p => `<button>${p}</button>`).join('');
  $('talkBtn').onclick = (e) => { e.stopPropagation(); unlockAudio(); $('talkPanel').classList.toggle('hidden'); };
  $('talkPanel').querySelectorAll('button').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    $('talkPanel').classList.add('hidden');
    const text = b.textContent;
    if (mode === 'online' && socket) { socket.emit('chat', text); return; }
    if (!view) return;
    showChat({ seat: view.seat, name: view.players[view.seat].name, text });
    // 電腦回嘴
    if (Math.random() < 0.55) {
      const ais = view.players.map((p, i) => i).filter(i => i !== view.seat && view.players[i].isAI);
      const s2 = ais[Math.floor(Math.random() * ais.length)];
      if (s2 != null) setTimeout(() => showChat({ seat: s2, name: view.players[s2].name, text: RETORT[Math.floor(Math.random() * RETORT.length)] }), 1700);
    }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#talkPanel,#talkBtn')) $('talkPanel').classList.add('hidden'); });
  const fsOk = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  if (!fsOk) $('fsBtn').classList.add('hidden');
  $('fsBtn').onclick = () => {
    const d = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
    $('menu').classList.add('hidden');
  };
  function quit() {
    $('menu').classList.add('hidden');
    $('result').classList.add('hidden');
    if (mode === 'adv') { if (window.MJAdv) MJAdv.abandon(); return; }
    if (mode === 'solo') { if (localGame) localGame.destroy(); localGame = null; mode = null; view = null; show('lobby'); return; }
    if (socket) socket.emit('leave');
    mode = null; view = null; show('lobby');
  }
  $('creditsLobby').innerHTML = creditsHTML();
  $('creditsBtn').onclick = () => { $('menu').classList.add('hidden'); dialog(`<div class="credits-dlg">${creditsHTML()}</div>`, [['關閉', null]]); };
  $('quitBtn').onclick = () => {
    const inGame = (view && view.phase === 'play' && !view.gameOver) || mode === 'adv';
    if (!inGame) return quit();
    dialog(mode === 'adv' ? '離開牌桌？這場算輸，會扣 400 血。' : mode === 'solo' ? '確定要離開這一將嗎？' : '確定離開？你的位子會由電腦代打。', [['離開', quit], ['繼續打', null]]);
  };

  // 冒險模式按鈕
  function refreshAdvBtn() {
    const b = $('advBtn'); if (!b || !window.MJAdv) return;
    const s = MJAdv.hasSave();
    b.innerHTML = s ? `繼續冒險 <small>（第 ${s.ch + 1} 章・血 ${s.hp}）</small>` : '冒險模式 <small>（單人闖關）</small>';
  }
  $('advBtn').onclick = () => { unlockAudio(); getName(); MJAdv.open(); };
  $('charBtn').onclick = () => { unlockAudio(); openCharPick(); };
  $('metaBtn').onclick = () => { unlockAudio(); MJMetaUI.open('tree'); };
  $('cloudBtn').onclick = () => { unlockAudio(); getName(); MJCloud.open(); };
  // 牌背、桌巾（程式繪製）
  const BACKS = ['classic', 'red', 'star', 'gold', 'sakura', 'bamboo'];
  const BACK_N = { classic: '經典綠', red: '喜氣紅', star: '星空藍', gold: '黑金', sakura: '櫻花粉', bamboo: '青竹' };
  const CLOTHS = ['classic', 'shiny', 'banquet', 'navy', 'wood', 'purple'];
  const CLOTH_N = { classic: '經典綠絨布', shiny: '反光綠絨布', banquet: '夜市紅桌墊', navy: '深藍絨布', wood: '木頭桌', purple: '紫色絨布' };
  function applyLook() {
    const b = $('setBack').value, c = $('setCloth').value;
    document.body.dataset.back = b; document.body.dataset.cloth = c;
  }
  ['setBack', 'setCloth'].forEach(id => $(id).addEventListener('change', applyLook));
  const cycle = (id, list, names) => { const i = (list.indexOf($(id).value) + 1) % list.length; $(id).value = list[i]; store.set('mj16_' + id, list[i]); applyLook(); toastSmall((id === 'setBack' ? '牌背：' : '桌巾：') + names[list[i]]); };
  $('backBtn').onclick = () => cycle('setBack', BACKS, BACK_N);
  $('clothBtn').onclick = () => cycle('setCloth', CLOTHS, CLOTH_N);
  applyLook();
  refreshCharBtn();
  window.MJClient = {
    startLocal, destroyLocal, show, dialog, notice, toastSmall, tileHTML, send, getName, refreshAdvBtn, esc,
    get myChar() { return myChar; }, openCharPick, charDetailHTML, charImg,
    playSound: (k, o) => playSound(k, o),
    get game() { return localGame; }, get view() { return view; },
  };

  resize();
  show('lobby');
  window.__mj = { get view() { return view; }, send, get game() { return localGame; } };
})();
