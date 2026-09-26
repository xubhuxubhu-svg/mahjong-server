// 冒險模式（單人闖關）：地圖、關卡目標、遺物、詛咒、魔王、事件、商店、自動存檔
(function () {
  const R = window.MJRules;
  const C = () => window.MJClient;
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'mj16_adv_v1';
  const rnd = Math.random;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- 資料 ----------
  const CHAPTERS = [
    { name: '夜市', title: '第一章・夜市', ai: 'low', tai: 3, cls: 'ch1',
      opps: ['香腸攤阿伯', '珍奶妹', '套圈圈老闆', '臭豆腐嬸', '彈珠台少年', '雞排哥'],
      boss: { name: '夜市老大・香腸伯', ability: '烤香腸：每摸 4 張牌，就搓一張自己想要的牌', id: 'sausage' } },
    { name: '廟口', title: '第二章・廟口', ai: 'normal', tai: 4, cls: 'ch2',
      opps: ['廟公', '賣香大嬸', '算命仙', '八家將', '乩童', '金紙店老闆'],
      boss: { name: '鐵板神算', ability: '鐵口直斷：看穿你的手牌，絕不放槍給你；每局都帶防護罩', id: 'oracle' } },
    { name: '阿嬤家', title: '第三章・阿嬤家', ai: 'high', tai: 6, cls: 'ch3',
      opps: ['大姑', '三叔公', '表哥', '隔壁王媽媽', '阿嬤的牌友', '小阿姨'],
      boss: { name: '雀神阿嬤', ability: '雀神降臨：摸牌大多是有用的牌；她報聽時你會中迷霧；每局起手 5 氣', id: 'god' } },
  ];
  const NODE = {
    fight: { name: '牌局', icon: '戰' }, elite: { name: '精英牌局', icon: '精' }, shop: { name: '柑仔店', icon: '店' },
    event: { name: '奇遇', icon: '奇' }, rest: { name: '休息', icon: '歇' }, boss: { name: '魔王', icon: '王' },
  };
  const RELICS = {
    cat: { name: '招財貓', icon: '貓', rare: 0, desc: '每次胡牌，金幣多 +40' },
    bamboo: { name: '開運竹', icon: '竹', rare: 0, desc: '胡牌時，手上每張花牌 +1 台' },
    mirror: { name: '八卦鏡', icon: '鏡', rare: 1, desc: '每局開局自帶防護罩' },
    charm: { name: '平安符', icon: '符', rare: 0, desc: '放槍時損血減半' },
    redenv: { name: '紅包袋', icon: '包', rare: 0, desc: '自摸時 +2 台' },
    abacus: { name: '算盤', icon: '算', rare: 0, desc: '每局開局 +2 氣' },
    betel: { name: '檳榔', icon: '檳', rare: 1, desc: '摸牌時有一半機會多 +1 氣' },
    ricewine: { name: '米酒', icon: '酒', rare: 0, desc: '門清胡牌 +2 台' },
    medal: { name: '免死金牌', icon: '牌', rare: 1, desc: '每場戰鬥第一次放槍不損血' },
    cooker: { name: '大同電鍋', icon: '鍋', rare: 0, desc: '每場戰鬥結束回 250 血' },
    bubble: { name: '珍珠奶茶', icon: '奶', rare: 0, desc: '報聽時 +4 氣' },
    sausage: { name: '大腸包小腸', icon: '腸', rare: 0, desc: '吃、碰、槓時 +1 氣' },
    firecracker: { name: '鞭炮', icon: '炮', rare: 1, desc: '胡牌時 +1 台' },
    godcard: { name: '神明卡', icon: '神', rare: 1, desc: '所有技能少花 1 氣' },
    dice: { name: '骰子', icon: '骰', rare: 0, desc: '局前換牌免費張數 +3' },
    ruler: { name: '麻將尺', icon: '尺', rare: 1, desc: '清一色、混一色台數加倍' },
    lantern: { name: '紅燈籠', icon: '燈', rare: 0, desc: '三元牌、風牌的刻子每組多 +1 台' },
    thermos: { name: '保溫杯', icon: '杯', rare: 1, desc: '每場戰鬥第一局開局滿氣' },
    zapper: { name: '捕蚊燈', icon: '蚊', rare: 0, desc: '對手報聽時你 +2 氣' },
    iron: { name: '鐵板燒', icon: '鐵', rare: 1, desc: '碰碰胡再 +4 台' },
    compass: { name: '風水羅盤', icon: '羅', rare: 1, desc: '每局開局自動發動氣運值（依手牌選牌型）' },
    lottery: { name: '八仙彩', icon: '彩', rare: 0, desc: '摸到花牌時 +1 氣' },
  };
  const CURSES = {
    nochi: { name: '禁吃', desc: '這關你不能吃牌' },
    lucky: { name: '對手手氣旺', desc: '對手比較容易摸到有用的牌' },
    halfqi: { name: '氣虛', desc: '你每摸 2 張牌才加 1 氣' },
    noflower: { name: '花落', desc: '你的花牌不算台' },
    short: { name: '牌荒', desc: '牌牆少 20 張，流局來得更快' },
    fog: { name: '起霧', desc: '每局開局你中迷霧 2 巡' },
  };

  // ---------- 存檔 ----------
  let run = null;
  let fight = null;
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(run)); } catch (e) { } }
  function load() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }

  // ---------- 地圖 ----------
  function genMap(ch) {
    const layers = [[{ type: 'fight' }]];
    const weights = [['fight', 44], ['event', 20], ['shop', 11], ['rest', 10], ['elite', 15]];
    const roll = () => { let t = rnd() * 100; for (const [k, w] of weights) { if ((t -= w) < 0) return k; } return 'fight'; };
    for (let l = 1; l <= 5; l++) {
      const n = rnd() < 0.5 ? 2 : 3;
      const row = [];
      for (let i = 0; i < n; i++) row.push({ type: l === 1 ? (rnd() < 0.7 ? 'fight' : 'event') : roll() });
      layers.push(row);
    }
    // 至少一間店、魔王前一層至少一個休息
    if (!layers.slice(2, 5).some(r => r.some(n => n.type === 'shop'))) pick(layers[3]).type = 'shop';
    if (!layers[5].some(n => n.type === 'rest')) layers[5][0].type = 'rest';
    layers.push([{ type: 'boss' }]);
    // 連線
    for (let l = 0; l < layers.length - 1; l++) {
      const a = layers[l], b = layers[l + 1];
      a.forEach((node, i) => {
        const center = a.length === 1 ? (b.length - 1) / 2 : i * (b.length - 1) / (a.length - 1);
        const set = new Set([Math.round(center)]);
        if (rnd() < 0.45) set.add(Math.min(b.length - 1, Math.max(0, Math.round(center) + (rnd() < 0.5 ? -1 : 1))));
        node.next = [...set].sort();
      });
      b.forEach((_, j) => { if (!a.some(n => n.next.includes(j))) { const i = Math.min(a.length - 1, Math.round(j * (a.length - 1) / Math.max(1, b.length - 1))); a[i].next.push(j); a[i].next.sort(); } });
    }
    // 詛咒
    layers.forEach((row) => row.forEach(n => {
      if (n.type === 'elite' || (n.type === 'fight' && rnd() < 0.35)) n.curse = pick(Object.keys(CURSES));
    }));
    return layers;
  }
  function reachable() {
    const map = run.maps[run.ch];
    if (run.layer < 0) return map[0].map((_, i) => i);
    const cur = map[run.layer][run.node];
    return run.layer + 1 < map.length ? cur.next : [];
  }

  // ---------- 開始、繼續 ----------
  function newRun() {
    run = {
      v: 1, ch: 0, layer: -1, node: null, maps: [genMap(0)], hp: 3000, maxHp: 3000, gold: 100,
      relics: [], burned: [], pending: null, over: null, stats: { fights: 0, won: 0, bestTai: 0, hands: 0, gold: 0 },
      char: C().myChar,
    };
    save();
  }
  function open() {
    const saved = load();
    if (saved && !saved.over) {
      C().dialog(`有一趟冒險還沒打完（${CHAPTERS[saved.ch].title}，血 ${saved.hp}）。要繼續嗎？`, [
        ['繼續冒險', () => { run = saved; enterAdv(); }],
        ['重新開始', () => { newRun(); enterAdv(); }],
      ]);
      return;
    }
    newRun();
    enterAdv();
  }
  function enterAdv() {
    C().show('adv');
    if (run.pending) return showNode(run.pending.layer, run.pending.idx, true);
    renderMap();
  }

  // ---------- 畫面工具 ----------
  function screen(html, cls) {
    const el = $('advScreen');
    el.className = 'adv-screen ' + CHAPTERS[run.ch].cls + (cls ? ' ' + cls : '');
    el.innerHTML = statusBar() + `<div class="adv-body">${html}</div>`;
    el.scrollTop = 0;
    el.querySelectorAll('.relic').forEach(r => r.onclick = (e) => { e.stopPropagation(); const d = RELICS[r.dataset.id]; C().toastSmall(`${d.name}：${d.desc}`); });
    const q = el.querySelector('#advQuit');
    if (q) q.onclick = () => C().dialog('回大廳？冒險進度會保留，下次可以繼續。', [['回大廳', () => C().show('lobby')], ['留下來', null]]);
    const mt = el.querySelector('#advMeta');
    if (mt) mt.onclick = () => window.MJMetaUI && MJMetaUI.open();
    const cx = el.querySelector('#advCodex');
    if (cx) cx.onclick = () => codex();
    return el;
  }
  function relicChip(id) { const d = RELICS[id]; return `<button class="relic ${d.rare ? 'rare' : ''}" data-id="${id}" title="${d.name}：${d.desc}">${d.icon}</button>`; }
  const myCharId = () => run.char || C().myChar;
  function statusBar() {
    const pct = Math.max(0, Math.round(run.hp / run.maxHp * 100));
    return `<div class="adv-status">
      <div class="as-row"><img class="as-char" src="${C().charImg(myCharId())}" alt=""><b class="as-ch">${CHAPTERS[run.ch].title}</b>
        <span class="as-hp"><i style="width:${pct}%"></i><em>血 ${run.hp}／${run.maxHp}</em></span>
        <span class="as-gold">金幣 ${run.gold}</span>
        <button class="as-quit" id="advMeta">天賦與裝備</button><button class="as-quit" id="advCodex">遺物圖鑑</button><button class="as-quit" id="advQuit">回大廳</button></div>
      <div class="as-relics">${run.relics.length ? run.relics.map(relicChip).join('') : '<span class="as-none">還沒有遺物</span>'}
        ${run.burned.length ? `<span class="as-burn">已燒：${run.burned.map(k => R.tileName(k)).join('、')}</span>` : ''}</div>
    </div>`;
  }
  const has = (id) => run && run.relics.includes(id);

  // ---------- 遺物圖鑑 ----------
  function codex() {
    const back = $('advScreen').innerHTML;
    const ids = Object.keys(RELICS);
    const box = document.createElement('div');
    box.className = 'overlay dlg codex';
    box.innerHTML = `<div class="res codex-in"><h2>遺物圖鑑</h2>
      <p class="sub">遺物是冒險途中拿到的被動寶物：過關三選一、柑仔店購買、奇遇獲得。拿到就一直生效到這趟冒險結束，可以一直累積。你目前有 ${run.relics.length}／${ids.length} 件。</p>
      <div class="codex-list">${ids.map(id => { const d = RELICS[id]; const own = run.relics.includes(id);
        return `<div class="cx ${own ? 'own' : ''} ${d.rare ? 'rare' : ''}"><i>${d.icon}</i><div><b>${d.name}<em>${d.rare ? '稀有' : '普通'}${own ? '・已擁有' : ''}</em></b><span>${d.desc}</span></div></div>`; }).join('')}</div>
      <button class="btn gold" id="cxClose">關閉</button></div>`;
    document.getElementById('app').appendChild(box);
    box.querySelector('#cxClose').onclick = () => box.remove();
  }

  // ---------- 地圖畫面 ----------
  function renderMap() {
    const map = run.maps[run.ch];
    const can = reachable();
    let html = `<div class="map-wrap"><svg class="map-lines" id="mapLines"></svg><div class="map">`;
    for (let l = map.length - 1; l >= 0; l--) {
      html += `<div class="map-row">${map[l].map((n, i) => {
        const here = run.layer === l && run.node === i;
        const done = l < run.layer || here || (l === run.layer);
        const ok = (run.layer + 1 === l || (run.layer < 0 && l === 0)) && can.includes(i);
        return `<button class="mnode t-${n.type} ${here ? 'here' : ''} ${ok ? 'ok' : ''} ${l <= run.layer && !here ? 'past' : ''}" data-l="${l}" data-i="${i}" ${ok ? '' : 'disabled'}>
          <b>${NODE[n.type].icon}</b><small>${n.type === 'boss' ? CHAPTERS[run.ch].boss.name.split('・').pop() : NODE[n.type].name}</small>${n.curse ? '<i class="curse-dot" title="詛咒">咒</i>' : ''}</button>`;
      }).join('')}</div>`;
    }
    html += `</div></div><p class="map-hint">點亮著的地點前進。「咒」代表那一關有詛咒。</p>`;
    const el = screen(html, 'is-map');
    el.querySelectorAll('.mnode.ok').forEach(b => b.onclick = () => showNode(Number(b.dataset.l), Number(b.dataset.i)));
    requestAnimationFrame(() => {
      drawLines(map);
      const t = el.querySelector('.mnode.ok') || el.querySelector('.mnode.here');
      if (t) t.scrollIntoView({ block: 'center' });
    });
  }
  function drawLines(map) {
    const svg = $('mapLines');
    if (!svg) return;
    const wrap = svg.parentElement.getBoundingClientRect();
    let lines = '';
    for (let l = 0; l < map.length - 1; l++) {
      map[l].forEach((n, i) => {
        const a = document.querySelector(`.mnode[data-l="${l}"][data-i="${i}"]`);
        n.next.forEach(j => {
          const b = document.querySelector(`.mnode[data-l="${l + 1}"][data-i="${j}"]`);
          if (!a || !b) return;
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          const walked = run.layer >= l + 1 && ((run.layer === l + 1 && run.node === j) || run.layer > l + 1) && l <= run.layer;
          lines += `<line x1="${ra.left + ra.width / 2 - wrap.left}" y1="${ra.top + ra.height / 2 - wrap.top}" x2="${rb.left + rb.width / 2 - wrap.left}" y2="${rb.top + rb.height / 2 - wrap.top}" class="${walked ? 'walked' : ''}"/>`;
        });
      });
    }
    svg.setAttribute('width', wrap.width); svg.setAttribute('height', wrap.height);
    svg.innerHTML = lines;
  }
  window.addEventListener('resize', () => { if (run && $('mapLines')) drawLines(run.maps[run.ch]); });

  // ---------- 進入地點 ----------
  function showNode(l, i, resumed) {
    const node = run.maps[run.ch][l][i];
    run.layer = l; run.node = i;
    run.pending = { layer: l, idx: i };
    save();
    if (node.type === 'fight' || node.type === 'elite' || node.type === 'boss') return fightIntro(node, resumed);
    if (node.type === 'shop') return shopScreen(node);
    if (node.type === 'event') return eventScreen(node);
    if (node.type === 'rest') return restScreen();
  }
  function finishNode() {
    run.pending = null;
    save();
    renderMap();
  }

  // ---------- 戰鬥 ----------
  function makeGoal(node) {
    const ch = CHAPTERS[run.ch];
    if (node.type === 'boss') return { kind: 'wins', n: 2, hands: 5, text: '5 局內胡牌 2 次' };
    if (node.type === 'elite') return { kind: 'tai', t: ch.tai + 1, hands: 4, text: `4 局內胡一把 ${ch.tai + 1} 台以上` };
    const r = rnd();
    if (r < 0.6) return { kind: 'tai', t: ch.tai, hands: 3, text: `3 局內胡一把 ${ch.tai} 台以上` };
    if (r < 0.8) return { kind: 'zimo', hands: 3, text: '3 局內自摸一次' };
    return { kind: 'plus', hands: 3, text: '打完 3 局，分數要是正的' };
  }
  function fightIntro(node, resumed) {
    if (!node.goal) { node.goal = makeGoal(node); node.opps = shuffle(CHAPTERS[run.ch].opps).slice(0, 3); save(); }
    const ch = CHAPTERS[run.ch];
    const g = node.goal;
    const boss = node.type === 'boss' ? ch.boss : null;
    const cur = node.curse ? CURSES[node.curse] : null;
    const html = `<div class="intro ${node.type}">
      <div class="intro-kind">${boss ? '魔王戰' : NODE[node.type].name}</div>
      <h2>${boss ? boss.name : `${ch.name}的牌桌`}</h2>
      ${boss ? `<p class="boss-ab"><b>魔王能力</b>${boss.ability}</p>` : ''}
      <div class="intro-goal"><span>過關目標</span><b>${g.text}</b></div>
      ${cur ? `<div class="intro-curse"><span>詛咒・${cur.name}</span>${cur.desc}</div>` : ''}
      <div class="intro-me"><img src="${C().charImg(myCharId())}" alt=""><span>你的角色：<b>${window.MJChars.BY_ID[myCharId()].name}</b>（${window.MJChars.BY_ID[myCharId()].type}）</span></div>
      <div class="intro-opps">對手：${(boss ? [node.opps[0], boss.name, node.opps[1]] : node.opps).join('、')}</div>
      <p class="intro-note">輸掉的分數會直接扣血；贏來的分數會換成金幣。${resumed ? '（上次這場沒打完，重新開始這一場）' : ''}</p>
      <button class="btn big gold" id="fightGo">開打</button>
    </div>`;
    screen(html);
    $('fightGo').onclick = () => startFight(node);
  }

  function usefulPred(p) {
    const c = R.toCounts(p.hand);
    return (x) => {
      if (x >= 34) return false;
      if (c[x] >= 1 && c[x] <= 2) return true;
      if (x < 27) for (const d of [-2, -1, 1, 2]) { const j = x + d; if (j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(x / 9) && c[j]) return true; }
      return false;
    };
  }
  function wantedTile(g, seat) {
    const p = g.players[seat];
    const n = 5 - p.melds.length;
    const wc = g.wallCounts();
    const c = R.toCounts(p.hand);
    // 手上 3n+1 張：看聽什麼；否則找能降低向聽的
    const w = R.waits(p.hand).filter(k => wc[k]);
    if (w.length) return pick(w);
    const base = R.shantenCounts(c, n);
    const good = [];
    for (let k = 0; k < 34; k++) { if (!wc[k]) continue; c[k]++; if (R.shantenCounts(c, n) < base) good.push(k); c[k]--; }
    return good.length ? pick(good) : null;
  }

  function buildMod(node) {
    const bossId = node.type === 'boss' ? CHAPTERS[run.ch].boss.id : null;
    const BOSS = 2;
    const curse = node.curse;
    const addQi = (p, n) => { p.qi = Math.max(0, Math.min(10, (p.qi || 0) + n)); };
    return {
      onWall(wall) {
        let w = wall.filter(k => !run.burned.includes(k));
        if (curse === 'short') {
          let cut = 20;
          for (let i = w.length - 1; i >= 0 && cut > 0; i--) if (w[i] < 34) { w.splice(i, 1); cut--; }
        }
        return w;
      },
      onHandStart(g) {
        const me = g.players[0];
        if (has('abacus')) addQi(me, 2);
        if (has('thermos') && fight.hands === 0) me.qi = 10;
        if (has('mirror')) me.fx.shield = true;
        if (has('compass')) {
          const c = R.toCounts(me.hand);
          const suit = [0, 1, 2].map(s => c.slice(s * 9, s * 9 + 9).reduce((x, y) => x + y, 0));
          const b = suit.indexOf(Math.max(...suit));
          me.fx.luck = c.slice(27, 34).reduce((x, y) => x + y, 0) >= 6 ? 'honor' : ['man', 'pin', 'sou'][b];
          me.fx.luckLeft = 5;
        }
        if (curse === 'fog') me.fx.fogUntil = 2;
        if (bossId === 'oracle') g.players[BOSS].fx.shield = true;
        if (bossId === 'god') addQi(g.players[BOSS], 5);
      },
      qiBonus(seat) {
        if (seat !== 0) return 0;
        let b = 0;
        if (has('betel') && rnd() < 0.5) b += 1;
        if (curse === 'halfqi') { fight.qiFlip = !fight.qiFlip; if (fight.qiFlip) b -= 1; }
        return b;
      },
      drawPred(seat, g) {
        if (seat === 0) return null;
        if (bossId === 'god' && seat === BOSS && rnd() < 0.6) return usefulPred(g.players[seat]);
        if (curse === 'lucky' && rnd() < 0.3) return usefulPred(g.players[seat]);
        return null;
      },
      onDraw(seat, k, g) {
        if (bossId === 'sausage' && seat === BOSS) {
          fight.bossDraws = (fight.bossDraws || 0) + 1;
          if (fight.bossDraws % 4 === 0) {
            const want = wantedTile(g, seat);
            if (want != null) { g.players[seat].forceNext = want; g.event({ type: 'skill', seat, id: 'cuopai' }); }
          }
        }
      },
      aiForbid(seat, g) {
        if (bossId !== 'oracle' || seat !== BOSS) return [];
        const me = g.players[0];
        const out = [];
        for (let k = 0; k < 34; k++) if (g.canRon(me, k) && R.isWin(me.hand.concat([k]))) out.push(k);
        return out;
      },
      noChi(seat) { return seat === 0 && curse === 'nochi'; },
      skillDiscount(seat) { return seat === 0 && has('godcard') ? 1 : 0; },
      freeSwap(seat) { return seat === 0 && has('dice') ? 3 : 0; },
      onScore(seat, sc, ctx) {
        if (seat !== 0) return [];
        const x = [];
        const names = sc.items.map(i => i[0]);
        if (curse === 'noflower') {
          const f = sc.items.filter(i => i[0].startsWith('花')).reduce((s, i) => s + i[1], 0);
          if (f) x.push(['花落（詛咒）', -f]);
        } else if (has('bamboo') && ctx.flowers && ctx.flowers.length) x.push(['開運竹', ctx.flowers.length]);
        if (has('redenv') && ctx.selfDraw) x.push(['紅包袋', 2]);
        if (has('ricewine') && names.some(n => n.startsWith('門清'))) x.push(['米酒', 2]);
        if (has('firecracker')) x.push(['鞭炮', 1]);
        if (has('ruler')) for (const [n, v] of sc.items) if (n === '清一色' || n === '混一色') x.push(['麻將尺', v]);
        if (has('lantern')) { const n = names.filter(n => n.startsWith('三元牌') || n.startsWith('圈風') || n.startsWith('門風')).length; if (n) x.push(['紅燈籠', n]); }
        if (has('iron') && names.includes('碰碰胡')) x.push(['鐵板燒', 4]);
        return x;
      },
      onSettle(info) {
        if (info.loser !== 0) return;
        if (has('medal') && !fight.medalUsed) { fight.medalUsed = true; fight.medalNow = true; info.deltas[0] = 0; return; }
        if (has('charm')) info.deltas[0] = Math.round(info.deltas[0] / 2);
      },
      onEvent(ev, g) {
        const me = g.players[0];
        if (!me || !me.fx) return;
        if (ev.type === 'ting') {
          if (ev.seat === 0 && has('bubble')) addQi(me, 4);
          if (ev.seat !== 0 && has('zapper')) addQi(me, 2);
          if (bossId === 'god' && ev.seat === BOSS) me.fx.fogUntil = me.discards + 2;
        }
        if ((ev.type === 'pong' || ev.type === 'chi' || (ev.type === 'kong')) && ev.seat === 0 && has('sausage')) addQi(me, 1);
        if (ev.type === 'flower' && ev.seat === 0 && has('lottery')) addQi(me, 1);
      },
    };
  }

  function startFight(node) {
    const ch = CHAPTERS[run.ch];
    const lv = ['low', 'normal', 'high'];
    let ai = ch.ai;
    if (node.type !== 'fight') ai = lv[Math.min(2, lv.indexOf(ai) + 1)];
    const boss = node.type === 'boss' ? ch.boss : null;
    const names = boss ? [node.opps[0], boss.name, node.opps[1]] : node.opps;
    fight = { node, goal: node.goal, hands: 0, wins: 0, handled: {}, done: null, medalUsed: false, bossDraws: 0 };
    run.stats.fights++;
    save();
    C().startLocal(
      [{ id: 'me', name: C().getName(), char: myCharId() }, { id: 'a1', name: names[0], isAI: true }, { id: 'a2', name: names[1], isAI: true }, { id: 'a3', name: names[2], isAI: true }],
      { rounds: 99, base: 100, perTai: 50, discardTime: 0, skills: true, aiSkill: ai, zhuama: 0, xianggong: false, guoshui: 'strict', deck: window.MJMeta ? MJMeta.battleDeck() : null, mod: [window.MJMeta ? MJMeta.buildMod() : null, buildMod(node)].filter(Boolean) },
      'adv'
    );
  }

  // 每局結束時更新血量、金幣、目標
  function onHandResult(v) {
    if (!fight || !v.result) return;
    const key = v.handNo;
    if (fight.handled[key]) return fight.handled[key];
    const r = v.result;
    fight.hands++;
    run.stats.hands++;
    const d = r.deltas[v.seat];
    const info = { dmg: 0, gold: 0, won: false, tai: 0, medal: false };
    if (fight.medalNow) { info.medal = true; fight.medalNow = false; }
    if (d < 0) { info.dmg = -d; run.hp = Math.max(0, run.hp - info.dmg); }
    if (d > 0) { info.gold = Math.min(200, Math.round(d / 5)); }
    if (info.gold && myCharId() === 'c09') info.gold = Math.round(info.gold * 1.2); // 老吉：金幣多 20%
    if (info.gold && window.MJMeta) { const mb = MJMeta.bonus(); info.gold = Math.round(info.gold * (1 + mb.gold / 100)); if (mb.legend.night && info.won) info.gold += 50; }
    if (r.type === 'win' && r.winner === v.seat) {
      info.won = true;
      fight.wins++;
      info.tai = r.tai + r.dealerItems.reduce((s, x) => s + x[1], 0);
      run.stats.bestTai = Math.max(run.stats.bestTai, info.tai);
      if (has('cat')) info.gold += 40;
      const g = fight.goal;
      if (g.kind === 'tai' && info.tai >= g.t) fight.done = 'win';
      if (g.kind === 'zimo' && r.selfDraw) fight.done = 'win';
      if (g.kind === 'wins' && fight.wins >= g.n) fight.done = 'win';
    }
    run.gold += info.gold;
    run.stats.gold += info.gold;
    if (!fight.done && fight.hands >= fight.goal.hands) {
      if (fight.goal.kind === 'plus' && v.players[v.seat].score > 0) fight.done = 'win';
      else fight.done = 'lose';
    }
    if (run.hp <= 0) fight.done = 'dead';
    fight.handled[key] = info;
    save();
    return info;
  }

  // 結算畫面下方的冒險區塊
  function resultFoot(v, el) {
    const info = onHandResult(v);
    if (!info) return;
    const g = fight.goal;
    const lines = [];
    if (info.medal) lines.push('<span class="rf-good">免死金牌生效，這次放槍不損血</span>');
    if (info.dmg) lines.push(`<span class="rf-bad">損血 ${info.dmg}</span>`);
    if (info.gold) lines.push(`<span class="rf-good">金幣 +${info.gold}</span>`);
    if (info.won) lines.push(`<span>這把 ${info.tai} 台</span>`);
    let btn = '';
    if (fight.done === 'win') btn = `<button class="btn gold" id="advNext">過關！領獎勵</button>`;
    else if (fight.done === 'lose') btn = `<button class="btn" id="advNext">沒達成目標，扣 ${failPenalty()} 血，繼續冒險</button>`;
    else if (fight.done === 'dead') btn = `<button class="btn" id="advNext">血量歸零…</button>`;
    else btn = `<button class="btn gold" id="advNext">下一局</button>`;
    el.innerHTML = `<div class="adv-foot">
      <div class="rf-line">${lines.join('')}</div>
      <div class="rf-goal">目標：${g.text}（已打 ${fight.hands}／${g.hands} 局${g.kind === 'wins' ? `，胡了 ${fight.wins} 次` : ''}）</div>
      <div class="rf-hp">血 ${run.hp}／${run.maxHp}・金幣 ${run.gold}</div>
      ${btn}</div>`;
    $('advNext').onclick = (e) => {
      e.stopPropagation();
      if (!fight.done) { C().send({ type: 'ready' }); return; }
      endFight(fight.done);
    };
  }
  function failPenalty() { return fight && fight.node.type === 'boss' ? 800 : fight && fight.node.type === 'elite' ? 500 : 400; }

  function endFight(outcome) {
    const node = fight.node;
    C().destroyLocal();
    C().show('adv');
    if (outcome === 'dead') return gameOver(false);
    if (outcome === 'lose') {
      run.hp = Math.max(0, run.hp - failPenalty());
      fight = null;
      if (run.hp <= 0) return gameOver(false);
      if (node.type === 'boss') {
        // 魔王沒打贏：扣血後再挑戰一次
        save();
        C().notice('魔王還站著！扣了血，再挑戰一次。');
        node.goal = null;
        return fightIntro(node, false);
      }
      return finishNode();
    }
    fight = null;
    run.stats.won++;
    if (has('cooker')) run.hp = Math.min(run.maxHp, run.hp + 250);
    const goldGain = node.type === 'boss' ? 150 : node.type === 'elite' ? 100 : 60;
    run.gold += goldGain;
    if (node.type === 'boss') run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * 0.5));
    let drop = null;
    if (window.MJMeta) { const d = MJMeta.dropFor(node.type); d.items = MJMeta.reward({ items: d.items, refine: d.refine, charms: d.charms }); drop = d; }
    save();
    rewardScreen(node, goldGain, drop);
  }

  function relicPool(rareOnly) {
    const ids = Object.keys(RELICS).filter(id => !run.relics.includes(id));
    return shuffle(rareOnly ? ids.filter(id => RELICS[id].rare) .concat(ids.filter(id => !RELICS[id].rare)) : ids);
  }
  function dropHTML(d) {
    if (!d || (!d.items.length && !d.refine && !d.charms)) return '';
    const R2 = MJMeta.RARITY;
    return `<div class="drop"><b>掉落（已放進倉庫）</b>${d.items.map(it => `<span style="color:${R2[it.r].color}">${C().esc(it.name)}（${MJMeta.SLOT[it.slot].name}・${R2[it.r].name}）</span>`).join('')}
      ${d.refine ? `<span>洗練石 ×${d.refine}</span>` : ''}${d.charms ? `<span>護符 ×${d.charms}</span>` : ''}</div>`;
  }
  function rewardScreen(node, goldGain, drop) {
    let pool = Object.keys(RELICS).filter(id => !run.relics.includes(id));
    let choices;
    if (node.type === 'fight') choices = shuffle(pool.filter(id => !RELICS[id].rare)).slice(0, 2).concat(shuffle(pool).slice(0, 1));
    else choices = shuffle(pool.filter(id => RELICS[id].rare)).slice(0, 2).concat(shuffle(pool.filter(id => !RELICS[id].rare)).slice(0, 1));
    choices = [...new Set(choices)].filter(Boolean);
    if (choices.length < 3) choices = [...new Set(choices.concat(shuffle(pool)))].slice(0, 3);
    const html = `<div class="reward">
      <h2>過關！</h2>
      <p>金幣 +${goldGain}${node.type === 'boss' ? `・回血 ${Math.round(run.maxHp * 0.5)}` : ''}</p>
      ${dropHTML(drop)}
      <p class="sub">選一件遺物帶走：</p>
      <div class="relic-cards">${choices.map(id => `<button class="rcard ${RELICS[id].rare ? 'rare' : ''}" data-id="${id}"><i>${RELICS[id].icon}</i><b>${RELICS[id].name}</b><span>${RELICS[id].desc}</span><em>${RELICS[id].rare ? '稀有' : '普通'}</em></button>`).join('')}</div>
      <button class="btn ghost" id="skipRelic">都不要，改拿 50 金幣</button>
    </div>`;
    screen(html);
    const after = () => {
      if (node.type === 'boss') return nextChapter();
      finishNode();
    };
    const next = () => cardReward(node, after);
    document.querySelectorAll('.rcard').forEach(b => b.onclick = () => { run.relics.push(b.dataset.id); C().toastSmall(`得到 ${RELICS[b.dataset.id].name}`); next(); });
    $('skipRelic').onclick = () => { run.gold += 50; next(); };
  }
  // 過關後再挑一張卡牌
  function cardReward(node, after) {
    if (!window.MJCards || !window.MJMeta) return after();
    const ids = MJMeta.rollCards(3, node.type === 'boss' ? 1 : 0);
    const T = MJCards.TYPES, CC = MJCards.CARDS, rare = ['普通', '稀有', '傳說'];
    screen(`<div class="reward"><h2>選一張卡牌</h2><p class="sub">拿到的卡牌會永久收藏，卡牌組還沒滿就會自動放進去。</p>
      <div class="relic-cards">${ids.map(id => { const c = CC[id]; return `<button class="rcard ccard" data-card="${id}" style="--tc:${T[c.type].color}"><i class="gtype">${T[c.type].name}</i><b>${c.name}</b><span>${c.desc}</span><em>${c.cost} 氣・${rare[c.rare]}</em></button>`; }).join('')}</div>
      <button class="btn ghost" id="skipCard">都不要</button></div>`);
    document.querySelectorAll('.ccard').forEach(b => b.onclick = () => { MJMeta.addCard(b.dataset.card); C().toastSmall(`得到卡牌「${CC[b.dataset.card].name}」`); C().playSound('bell'); after(); });
    $('skipCard').onclick = () => after();
  }
  function nextChapter() {
    if (run.ch >= CHAPTERS.length - 1) return gameOver(true);
    run.ch++;
    run.maps.push(genMap(run.ch));
    run.layer = -1; run.node = null; run.pending = null;
    save();
    screen(`<div class="reward chapter"><h2>${CHAPTERS[run.ch].title}</h2><p>${['', '香煙繚繞的廟口，神明都在看。', '最後一關，阿嬤家的牌桌從來沒人贏過。'][run.ch]}</p>
      <button class="btn big gold" id="chGo">出發</button></div>`);
    $('chGo').onclick = () => renderMap();
  }

  // ---------- 商店 ----------
  function shopScreen(node) {
    if (!node.stock) {
      const pool = Object.keys(RELICS).filter(id => !run.relics.includes(id));
      node.stock = shuffle(pool).slice(0, 3).map(id => ({ id, price: RELICS[id].rare ? 260 : 150, sold: false }));
      node.heals = 0;
      if (window.MJMeta && window.MJCards) node.cards = MJMeta.rollCards(2, 0).map(id => ({ id, price: MJCards.PRICE[MJCards.CARDS[id].rare], sold: false }));
      save();
    }
    const html = `<div class="shop">
      <h2>柑仔店</h2>
      <div class="shop-sec"><h3>遺物</h3><div class="relic-cards">${node.stock.map((s, i) => `<button class="rcard ${RELICS[s.id].rare ? 'rare' : ''} ${s.sold ? 'sold' : ''}" data-i="${i}" ${s.sold || run.gold < s.price ? 'disabled' : ''}>
        <i>${RELICS[s.id].icon}</i><b>${RELICS[s.id].name}</b><span>${RELICS[s.id].desc}</span><em>${s.sold ? '已買' : s.price + ' 金'}</em></button>`).join('')}</div></div>
      ${node.cards ? `<div class="shop-sec"><h3>卡牌</h3><div class="relic-cards">${node.cards.map((s, i) => { const c = MJCards.CARDS[s.id]; const T = MJCards.TYPES[c.type];
        return `<button class="rcard ccard ${s.sold ? 'sold' : ''}" data-ci="${i}" style="--tc:${T.color}" ${s.sold || run.gold < s.price ? 'disabled' : ''}><i class="gtype">${T.name}</i><b>${c.name}</b><span>${c.desc}</span><em>${s.sold ? '已買' : s.price + ' 金'}</em></button>`; }).join('')}</div></div>` : ''}
      <div class="shop-sec"><h3>燒牌（100 金／種）</h3><p class="sub">把一種牌的 4 張從這趟冒險的牌牆永久拿掉，做清一色、字一色更容易。最多燒 8 種。</p>
        <button class="btn" id="burnBtn" ${run.gold < 100 || run.burned.length >= 8 ? 'disabled' : ''}>選要燒的牌</button></div>
      <div class="shop-sec"><h3>護符（150 金）</h3><p class="sub">強化裝備到 +7 以上時，失敗不會掉級。會帶回大廳一直保留。</p>
        <button class="btn" id="charmBtn" ${run.gold < 150 ? 'disabled' : ''}>買一個護符</button></div>
      <div class="shop-sec"><h3>補血</h3><button class="btn" id="healBtn" ${run.gold < 100 || node.heals >= 2 || run.hp >= run.maxHp ? 'disabled' : ''}>回 500 血（100 金，還能買 ${2 - node.heals} 次）</button></div>
      <button class="btn ghost big" id="shopLeave">離開柑仔店</button>
    </div>`;
    screen(html);
    document.querySelectorAll('.shop .rcard').forEach(b => b.onclick = () => {
      const s = node.stock[Number(b.dataset.i)];
      if (s.sold || run.gold < s.price) return;
      run.gold -= s.price; s.sold = true; run.relics.push(s.id);
      C().playSound('bell'); save(); shopScreen(node);
    });
    $('burnBtn').onclick = () => burnPicker(100, () => shopScreen(node));
    document.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => {
      const s = node.cards[Number(b.dataset.ci)];
      if (s.sold || run.gold < s.price) return;
      run.gold -= s.price; s.sold = true; MJMeta.addCard(s.id); C().playSound('bell'); save(); shopScreen(node);
    });
    $('healBtn').onclick = () => { run.gold -= 100; node.heals++; run.hp = Math.min(run.maxHp, run.hp + 500); C().playSound('pop'); save(); shopScreen(node); };
    $('shopLeave').onclick = () => finishNode();
    $('charmBtn').onclick = () => { run.gold -= 150; MJMeta.reward({ charms: 1 }); C().playSound('bell'); C().toastSmall('得到護符'); save(); shopScreen(node); };
  }
  function burnPicker(cost, back) {
    const kinds = Array.from({ length: 34 }, (_, k) => k);
    const html = `<div class="burn"><h2>燒牌</h2><p class="sub">點一種牌，這趟冒險就不會再出現它。${cost ? `花費 ${cost} 金。` : '這次免費。'}</p>
      <div class="burn-grid">${kinds.map(k => `<button class="bk ${run.burned.includes(k) ? 'gone' : ''}" data-k="${k}" ${run.burned.includes(k) ? 'disabled' : ''}>${C().tileHTML(k)}</button>`).join('')}</div>
      <button class="btn ghost" id="burnCancel">不燒了</button></div>`;
    screen(html);
    document.querySelectorAll('.bk:not(.gone)').forEach(b => b.onclick = () => {
      const k = Number(b.dataset.k);
      C().dialog(`確定燒掉 ${R.tileName(k)}？`, [['燒掉', () => {
        run.gold -= cost; run.burned.push(k); run.burned.sort((a, b) => a - b); C().playSound('boom'); save(); back();
      }], ['再想想', null]]);
    });
    $('burnCancel').onclick = () => back();
  }

  // ---------- 奇遇 ----------
  const EVENTS = [
    { title: '廟口擲筊', text: '香爐前擺著一對筊杯。添 50 金幣的香油錢，就能向神明求一次。', choices: [
      { label: '添香油錢擲筊（50 金）', need: 50, go: () => { run.gold -= 50; const r = rnd();
        if (r < 0.5) { const id = pick(Object.keys(RELICS).filter(x => !run.relics.includes(x) && !RELICS[x].rare)); if (id) run.relics.push(id); return `聖筊！神明賜你「${id ? RELICS[id].name : '好運'}」。`; }
        if (r < 0.75) return '笑筊，神明笑而不答。';
        run.hp = Math.max(1, run.hp - 300); return '陰筊……走出廟門跌了一跤，損血 300。'; } },
      { label: '雙手合十，離開', go: () => '你拜了拜，安心上路。' }] },
    { title: '阿嬤煮湯圓', text: '路過的阿嬤招手：「少年仔，來吃碗湯圓！」', choices: [
      { label: '吃一碗（回血 600）', go: () => { run.hp = Math.min(run.maxHp, run.hp + 600); return '熱呼呼的湯圓下肚，血回了 600。'; } },
      { label: '打包帶走（血量上限 +300）', go: () => { run.maxHp += 300; run.hp += 300; return '你的血量上限增加了 300。'; } }] },
    { title: '夜市套圈圈', text: '老闆說：「80 塊套一次，套中大獎送你寶貝！」', choices: [
      { label: '套一次（80 金）', need: 80, go: () => { run.gold -= 80; if (rnd() < 0.4) { const id = pick(Object.keys(RELICS).filter(x => !run.relics.includes(x) && RELICS[x].rare)); if (id) { run.relics.push(id); return `套中了！得到稀有遺物「${RELICS[id].name}」。`; } } return '差一點點……什麼都沒套到。'; } },
      { label: '只是路過', go: () => '你繼續往前走。' }] },
    { title: '算命仙', text: '算命仙瞇著眼：「60 金幣，我幫你把一種衰牌從命裡拿掉。」', choices: [
      { label: '請他作法（60 金，免費燒一種牌）', need: 60, go: () => { run.gold -= 60; return 'BURN'; } },
      { label: '不信這套', go: () => '算命仙搖搖頭：「年輕人啊……」' }] },
    { title: '路邊撿到紅包', text: '地上躺著一個紅包，裡面有 120 金幣。', choices: [
      { label: '收下（+120 金）', go: () => { run.gold += 120; return '你把紅包收進口袋。'; } },
      { label: '交給警察（回血 400）', go: () => { run.hp = Math.min(run.maxHp, run.hp + 400); return '好心有好報，你覺得精神百倍。'; } }] },
    { title: '地下賭場', text: '巷子裡有人在擲骰子比大小：「押 100，贏了拿 200！」', choices: [
      { label: '押 100 金', need: 100, go: () => { run.gold -= 100; if (rnd() < 0.5) { run.gold += 200; return '贏了！金幣 +100。'; } return '輸了，100 金幣飛了。'; } },
      { label: '不賭', go: () => '你搖搖頭走開。' }] },
  ];
  function eventScreen(node) {
    if (node.ev == null) { node.ev = Math.floor(rnd() * EVENTS.length); save(); }
    const ev = EVENTS[node.ev];
    const html = `<div class="event"><h2>${ev.title}</h2><p class="ev-text">${ev.text}</p>
      <div class="ev-choices">${ev.choices.map((c, i) => `<button class="btn ${i === 0 ? 'gold' : 'ghost'}" data-i="${i}" ${c.need && run.gold < c.need ? 'disabled' : ''}>${c.label}${c.need && run.gold < c.need ? '（金幣不夠）' : ''}</button>`).join('')}</div></div>`;
    screen(html);
    document.querySelectorAll('.ev-choices .btn').forEach(b => b.onclick = () => {
      const msg = ev.choices[Number(b.dataset.i)].go();
      save();
      if (msg === 'BURN') return burnPicker(0, () => finishNode());
      screen(`<div class="event"><h2>${ev.title}</h2><p class="ev-text">${msg}</p><button class="btn gold big" id="evOk">繼續</button></div>`);
      $('evOk').onclick = () => finishNode();
    });
  }

  // ---------- 休息 ----------
  function restScreen() {
    const heal = Math.round(run.maxHp * 0.3);
    screen(`<div class="event rest"><h2>路邊涼亭</h2><p class="ev-text">找個地方坐下來喘口氣。</p>
      <div class="ev-choices"><button class="btn gold" id="rHeal">睡一覺（回血 ${heal}）</button>
      <button class="btn" id="rBurn" ${run.burned.length >= 8 ? 'disabled' : ''}>整理牌（免費燒一種牌）</button></div></div>`);
    $('rHeal').onclick = () => { run.hp = Math.min(run.maxHp, run.hp + heal); save(); finishNode(); };
    $('rBurn').onclick = () => burnPicker(0, () => finishNode());
  }

  // ---------- 結束 ----------
  function gameOver(victory) {
    run.over = victory ? 'win' : 'dead';
    run.pending = null;
    const s = run.stats;
    clearSave();
    const soul = s.won * 12 + run.ch * 50 + (victory ? 200 : 0) + s.bestTai * 2;
    const wallet = run.gold;
    let before = 0, after = 0;
    if (window.MJMeta) { before = MJMeta.earned(MJMeta.data); MJMeta.reward({ soul, wallet, stones: s.won }); after = MJMeta.earned(MJMeta.data); }
    screen(`<div class="reward over ${victory ? 'victory' : 'dead'}">
      <h2>${victory ? '雀神退位，你就是新雀神！' : '倒在牌桌上了……'}</h2>
      <p>${victory ? '三章全破！' : `止步於${CHAPTERS[run.ch].title}`}</p>
      <div class="over-gain"><b>得到死亡積分 ${soul}</b><span>剩下的 ${wallet} 金幣存進錢包・強化石 +${s.won}</span>${after > before ? `<span class="up">天賦點 +${after - before}！去「天賦與裝備」點天賦吧</span>` : `<span>再累積 ${MJMeta.SOUL_PER_POINT - MJMeta.data.soulTotal % MJMeta.SOUL_PER_POINT} 死亡積分就多 1 天賦點</span>`}</div>
      <div class="over-stats"><span>打了 ${s.fights} 場、過關 ${s.won} 場</span><span>總共 ${s.hands} 局</span><span>最大一把 ${s.bestTai} 台</span><span>累積金幣 ${s.gold}</span><span>收集遺物 ${run.relics.length} 件</span></div>
      <button class="btn big gold" id="overAgain">再冒險一次</button>
      <button class="btn ghost" id="overLobby">回大廳</button></div>`);
    $('overAgain').onclick = () => { newRun(); renderMap(); };
    $('overLobby').onclick = () => C().show('lobby');
    if (window.MJCloud) MJCloud.autoSave();
    const om = document.createElement('button'); om.className = 'btn'; om.textContent = '天賦與裝備'; om.onclick = () => MJMetaUI.open('tree');
    $('overLobby').before(om);
  }

  // ---------- 牌桌上的冒險資訊 ----------
  function hud(v) {
    const el = $('advHud');
    if (!el) return;
    if (!fight || !run) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const pct = Math.max(0, Math.round(run.hp / run.maxHp * 100));
    el.innerHTML = `<div class="hud-hp"><i style="width:${pct}%"></i><em>血 ${run.hp}</em></div>
      <div class="hud-goal">${fight.goal.text}<small>第 ${Math.min(fight.hands + 1, fight.goal.hands)}／${fight.goal.hands} 局${fight.node.curse ? `・咒：${CURSES[fight.node.curse].name}` : ''}</small></div>`;
  }
  function abandon() {
    C().destroyLocal();
    fight = null;
    run.hp = Math.max(0, run.hp - 400);
    if (run.hp <= 0) { C().show('adv'); return gameOver(false); }
    save();
    C().show('adv');
    C().notice('你離開了牌桌，這場算輸，扣 400 血。');
    finishNode();
  }
  function hasSave() { const s = load(); return s && !s.over ? s : null; }

  window.MJAdv = { open, resultFoot, hud, abandon, hasSave, get active() { return !!fight; }, get _run() { return run; } };
  if (window.MJClient && window.MJClient.refreshAdvBtn) window.MJClient.refreshAdvBtn();
})();
