// 16 位人物：介紹、屬性、能力值、被動、專屬技能、怒氣覺醒
// 伺服器與瀏覽器共用
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const R = isNode ? require('./rules') : root.MJRules;
  const m = factory(R);
  if (isNode) module.exports = m; else root.MJChars = m;
})(typeof self !== 'undefined' ? self : this, function (R) {
  const rnd = Math.random;

  // 能力值：攻（台數）、守（防放槍）、速（聽牌速度）、運（摸牌運）、技（技能與氣）
  const CHARS = [
    { id: 'c01', name: '棉花糖', type: '幸運型', color: '#f3c55b',
      intro: '夜市口人見人愛的白色貴賓犬，每天被阿嬤抱著上牌桌。牌技普通，但狗運好到讓人懷疑人生。',
      stats: { 攻: 2, 守: 3, 速: 3, 運: 5, 技: 2 },
      passive: { name: '好狗運', desc: '每次摸牌有 10% 機會摸到有用的牌' },
      skill: { name: '搖尾巴', cost: 4, desc: '接下來 3 巡，摸牌大多是有用的牌' },
      awaken: { name: '狗屎運', desc: '這局剩下的摸牌，六成是有用的牌' } },
    { id: 'c02', name: '阿晴', type: '速度型', color: '#5ac8ff',
      intro: '綁著馬尾的大學生，打牌跟她騎車一樣快，吃碰從不猶豫，最討厭別人想太久。',
      stats: { 攻: 2, 守: 2, 速: 5, 運: 3, 技: 3 },
      passive: { name: '手腳快', desc: '吃、碰、槓之後 +1 氣' },
      skill: { name: '超車', cost: 5, desc: '接下來 3 巡，吃牌不限上家，任何人打的都能吃' },
      awaken: { name: '全速前進', desc: '這局吃牌都不限上家，吃碰後 +2 氣' } },
    { id: 'c03', name: '莓莓', type: '補給型', color: '#ff6b7a',
      intro: '抱著草莓花束來打牌的小女生，說草莓能補充元氣，大家的技能都靠她撐著。',
      stats: { 攻: 2, 守: 3, 速: 3, 運: 3, 技: 5 },
      passive: { name: '草莓補給', desc: '每局開局 +2 氣' },
      skill: { name: '分你吃', cost: 4, desc: '這局用過的一般技能全部可以再用一次' },
      awaken: { name: '草莓派對', desc: '氣全滿，所有技能（包含專屬技能）都可以再用一次' } },
    { id: 'c04', name: '冷月', type: '心眼型', color: '#b7c4d6',
      intro: '話很少的眼鏡女孩，總是冷冷地看著牌桌。有人聽牌，她第一個知道。',
      stats: { 攻: 3, 守: 5, 速: 2, 運: 2, 技: 3 },
      passive: { name: '冷眼旁觀', desc: '只要有人報聽，這局你打牌時自動標出危險牌' },
      skill: { name: '讀心', cost: 4, desc: '看穿一位對手的手牌，直到你下一次打牌' },
      awaken: { name: '全知', desc: '這局看得到所有對手的手牌' } },
    { id: 'c05', name: '算算姐', type: '計算型', color: '#9fe3ff',
      intro: '上班帶著筆電的資料分析師，打牌也在算機率，每張牌打出去有幾張進張她都清清楚楚。',
      stats: { 攻: 3, 守: 3, 速: 4, 運: 2, 技: 4 },
      passive: { name: '精算', desc: '選牌時顯示打出後還有幾張有效進張' },
      skill: { name: '最佳解', cost: 3, desc: '把手上最沒用的 2 張，換成有用的牌' },
      awaken: { name: '演算法', desc: '這局摸牌七成是能讓你更接近聽牌的牌' } },
    { id: 'c06', name: '月華仙子', type: '神秘型', color: '#a58cff',
      intro: '傳說每逢月圓才下凡打一將的仙子，出手無影無蹤，凡人的招數很難碰到她。',
      stats: { 攻: 3, 守: 4, 速: 3, 運: 3, 技: 4 },
      passive: { name: '月影', desc: '別人對你用的攻擊或負面狀態，有一半機會落空' },
      skill: { name: '月蝕', cost: 4, desc: '所有對手中迷霧 2 巡' },
      awaken: { name: '幻月', desc: '這局打出的牌全是墨水牌，而且所有攻擊都對你無效' } },
    { id: 'c07', name: '阿星', type: '坦克型', color: '#ff9aa8',
      intro: '住在海邊石頭下的憨厚大個子，常常搞不清楚狀況，但皮超厚，怎麼打都不痛。',
      stats: { 攻: 2, 守: 5, 速: 1, 運: 3, 技: 2 },
      passive: { name: '皮厚', desc: '每局開局有 40% 機會自帶防護罩' },
      skill: { name: '我什麼都不知道', cost: 3, desc: '清除身上所有負面狀態，再得到一層防護罩' },
      awaken: { name: '肉盾', desc: '這局所有攻擊對你無效，放槍只付一半' } },
    { id: 'c08', name: '臥龍先生', type: '策略型', color: '#7fb8a8',
      intro: '搖著羽扇的老軍師，說打麻將跟打仗一樣，先算三步再出手。',
      stats: { 攻: 3, 守: 3, 速: 2, 運: 2, 技: 5 },
      passive: { name: '運籌帷幄', desc: '飛彈攻擊、負面狀態少花 2 氣' },
      skill: { name: '空城計', cost: 5, desc: '指定對手 2 巡不能吃碰槓，1 巡內不能胡' },
      awaken: { name: '借東風', desc: '立刻 +3 氣，下一張摸到最需要的牌' } },
    { id: 'c09', name: '老吉', type: '經濟型', color: '#d9a23a',
      intro: '背著大包袱走遍各地夜市的流浪商人，肩上的貓頭鷹會幫他偷看牌。',
      stats: { 攻: 3, 守: 3, 速: 3, 運: 3, 技: 3 },
      passive: { name: '精打細算', desc: '局前商店打 7 折；冒險模式賺的金幣多 20%' },
      skill: { name: '貓頭鷹偵察', cost: 2, desc: '偷看自己接下來要摸的 3 張牌' },
      awaken: { name: '大甩賣', desc: '這局胡牌多 +3 台' } },
    { id: 'c10', name: '小紅', type: '連擊型', color: '#e2553f',
      intro: '手腳俐落的女僕，最擅長「上菜」：吃一口、碰一口，一路連到胡牌。',
      stats: { 攻: 4, 守: 2, 速: 4, 運: 3, 技: 2 },
      passive: { name: '服務周到', desc: '吃、碰、槓之後，下一張摸牌一定是有用的牌' },
      skill: { name: '加點', cost: 3, desc: '選一張手牌，換成同花色相鄰的牌' },
      awaken: { name: '全餐', desc: '這局吃碰後 +2 氣' } },
    { id: 'c11', name: '雪鈴', type: '控制型', color: '#8fd8ff',
      intro: '安靜的雪之少女，身邊總是飄著寒氣。被她盯上的人，手會凍到動不了。',
      stats: { 攻: 2, 守: 3, 速: 3, 運: 3, 技: 4 },
      passive: { name: '寒氣', desc: '每局開局，隨機一位對手 1 巡不能吃碰' },
      skill: { name: '冰封', cost: 5, desc: '指定對手定身（跳過一巡），1 巡不能吃碰' },
      awaken: { name: '暴風雪', desc: '所有對手定身一次' } },
    { id: 'c12', name: '麻糬娘娘', type: '守護型', color: '#ffd7d7',
      intro: '軟綿綿的麻糬戴上鳳冠，自稱是廟裡派來保佑大家的，其實只保佑自己。',
      stats: { 攻: 2, 守: 5, 速: 2, 運: 4, 技: 2 },
      passive: { name: '神明保佑', desc: '每局開局自帶一層防護罩' },
      skill: { name: '賜福', cost: 3, desc: '再加一層防護罩' },
      awaken: { name: '天上聖母', desc: '這局別人不能胡你打出的牌' } },
    { id: 'c13', name: '電電鼠', type: '爆發型', color: '#ffe14d',
      intro: '臉頰會放電的黃色小老鼠，平常慢慢蓄電，一爆發就是天價大牌。',
      stats: { 攻: 5, 守: 1, 速: 3, 運: 3, 技: 3 },
      passive: { name: '蓄電', desc: '每摸 3 張牌多 +1 氣' },
      skill: { name: '十萬伏特', cost: 6, desc: '指定對手：氣全部清空，並且定身一次' },
      awaken: { name: '雷電爆發', desc: '這局胡牌台數加倍' } },
    { id: 'c14', name: '獺獺', type: '均衡型', color: '#b98a64',
      intro: '河邊抓魚的水獺，什麼都會一點，心情永遠很好，是新手最好上手的夥伴。',
      stats: { 攻: 3, 守: 3, 速: 3, 運: 3, 技: 3 },
      passive: { name: '抓魚高手', desc: '每摸到一張花牌 +1 氣' },
      skill: { name: '翻滾', cost: 3, desc: '把手上 2 張落單的牌換成牌牆裡隨機的牌' },
      awaken: { name: '滿載而歸', desc: '氣全滿，這局胡牌多 +2 台' } },
    { id: 'c15', name: '呆呆鴨', type: '混亂型', color: '#ffc93c',
      intro: '永遠在頭痛的黃色鴨子，頭一痛就會放出念力，把整桌搞得一團亂。',
      stats: { 攻: 3, 守: 2, 速: 2, 運: 4, 技: 4 },
      passive: { name: '頭痛反彈', desc: '別人對你用的攻擊或負面狀態，有一半機會反彈回去' },
      skill: { name: '念力', cost: 4, desc: '三位對手的手牌各隨機一張互相輪換' },
      awaken: { name: '超能力大爆走', desc: '所有對手手滑，而且牌面顛倒 2 巡' } },
    { id: 'c16', name: '小聖母', type: '祈福型', color: '#e8b33a',
      intro: '提著平安燈的小小媽祖，走到哪裡就保佑到哪裡，擲筊特別準。',
      stats: { 攻: 3, 守: 3, 速: 3, 運: 4, 技: 3 },
      passive: { name: '平安燈', desc: '每局開局自動發動氣運值，依手牌選牌型' },
      skill: { name: '擲筊', cost: 3, desc: '聖筊：下一張摸到最需要的牌；笑筊：+3 氣；陰筊：沒事' },
      awaken: { name: '媽祖遶境', desc: '這局你摸牌五成是有用的牌，對手摸牌三成是沒用的牌' } },
  ];
  // 專屬技能需要選對手或選手牌
  const SKILL_NEEDS = { c04: 'target', c08: 'target', c10: 'tile', c11: 'target', c13: 'target' };
  const BY_ID = {};
  CHARS.forEach(c => { BY_ID[c.id] = c; c.needs = SKILL_NEEDS[c.id] || null; });

  // ---------- 工具 ----------
  function useful(p) {
    const c = R.toCounts(p.hand);
    return (x) => {
      if (x >= 34) return false;
      if (c[x] >= 1 && c[x] <= 2) return true;
      if (x < 27) for (const d of [-2, -1, 1, 2]) { const j = x + d; if (j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(x / 9) && c[j]) return true; }
      return false;
    };
  }
  function useless(p) {
    const u = useful(p);
    return (x) => x < 34 && !u(x);
  }
  function improving(p) {
    const n = 5 - p.melds.length;
    const c = R.toCounts(p.hand);
    const base = R.shantenCounts(c, n);
    const ok = new Array(34).fill(false);
    for (let k = 0; k < 34; k++) { if (c[k] >= 4) continue; c[k]++; if (R.shantenCounts(c, n) < base) ok[k] = true; c[k]--; }
    return (x) => x < 34 && ok[x];
  }
  function wanted(g, seat) {
    const p = g.players[seat];
    const wc = g.wallCounts();
    const w = R.waits(p.hand).filter(k => wc[k]);
    if (w.length) return w[Math.floor(rnd() * w.length)];
    const imp = improving(p);
    const list = [];
    for (let k = 0; k < 34; k++) if (wc[k] && imp(k)) list.push(k);
    return list.length ? list[Math.floor(rnd() * list.length)] : null;
  }
  const addQi = (p, n) => { p.qi = Math.max(0, Math.min(10, (p.qi || 0) + n)); };
  // 從牌牆換入符合條件的牌
  function swapIn(g, p, outK, pred) {
    const js = [];
    for (let j = g.head; j <= g.tail; j++) if (pred(g.wall[j])) js.push(j);
    if (!js.length) return null;
    const j = js[Math.floor(rnd() * js.length)];
    const got = g.wall[j];
    g.wall[j] = outK;
    const i = p.hand.indexOf(outK); p.hand.splice(i, 1); p.hand.push(got);
    p.hand.sort((a, b) => a - b);
    if (p.lastDraw != null && !p.hand.includes(p.lastDraw)) p.lastDraw = null;
    return got;
  }
  function loneTiles(p) {
    const c = R.toCounts(p.hand);
    const u = useful({ hand: [] });
    const score = (k) => {
      let n = c[k] * 3;
      if (k < 27) for (const d of [-2, -1, 1, 2]) { const j = k + d; if (j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(k / 9)) n += c[j]; }
      return n;
    };
    return [...new Set(p.hand)].sort((a, b) => score(a) - score(b));
  }
  function clearDebuffs(p) {
    const d = p.discards;
    Object.assign(p.fx, { fogUntil: 0, flipUntil: 0, slip: false, badLeft: 0, noClaimUntil: 0, noHuUntil: 0, freeze: false });
    return d;
  }

  // ---------- 各人物的行為 ----------
  const B = {
    c01: {
      drawPred(g, s, p) {
        if (p.awake && rnd() < 0.6) return useful(p);
        if (p.fx.dog > 0) { p.fx.dog--; if (rnd() < 0.8) return useful(p); }
        if (rnd() < 0.1) return useful(p);
      },
      skill(g, s, p) { p.fx.dog = 3; return true; },
    },
    c02: {
      onClaim(g, s, p) { addQi(p, p.awake ? 3 : 1); },
      skill(g, s, p) { p.fx.anyChiUntil = p.discards + 3; return true; },
      awaken(g, s, p) { p.fx.anyChiUntil = 999; },
    },
    c03: {
      onHandStart(g, s, p) { addQi(p, 2); },
      skill(g, s, p) { for (const k of Object.keys(p.used)) if (k !== 'char') delete p.used[k]; return true; },
      awaken(g, s, p) { p.qi = 10; p.used = {}; },
    },
    c04: {
      onEvent(g, s, p, ev) { if (ev.type === 'ting' && ev.seat !== s) p.fx.autoSafe = true; },
      skill(g, s, p, a) { p.readTarget = a.target; p.readUntil = p.discards + 1; return true; },
      awaken(g, s, p) { p.readAll = true; },
    },
    c05: {
      drawPred(g, s, p) { if (p.awake && rnd() < 0.7) return improving(p); },
      skill(g, s, p) {
        const lone = loneTiles(p);
        let n = 0;
        for (const k of lone) { if (n >= 2) break; if (swapIn(g, p, k, useful(p)) != null) n++; }
        return n > 0;
      },
    },
    c06: {
      onTargeted(g, s, p) { if (p.awake) return 'block'; if (rnd() < 0.5) return 'block'; },
      skill(g, s, p) { for (let o = 0; o < g.N; o++) if (o !== s) { const q = g.players[o]; if (!g.targetGuard(s, o)) q.fx.fogUntil = q.discards + 2; } return true; },
      awaken(g, s, p) { p.fx.inkAll = true; },
    },
    c07: {
      onHandStart(g, s, p) { if (rnd() < 0.4) p.fx.shield = (p.fx.shield || 0) + 1; },
      onTargeted(g, s, p) { if (p.awake) return 'block'; },
      skill(g, s, p) { clearDebuffs(p); p.fx.shield = (p.fx.shield || 0) + 1; return true; },
      onSettle(g, s, p, info) { if (p.awake && info.loser === s) info.deltas[s] = Math.round(info.deltas[s] / 2); },
    },
    c08: {
      skillDiscount(g, s, p, id) { return id === 'missile' || id === 'debuff' ? 2 : 0; },
      skill(g, s, p, a) { const q = g.players[a.target]; if (g.targetGuard(s, a.target)) return true; q.fx.noClaimUntil = q.discards + 2; q.fx.noHuUntil = q.discards + 1; return true; },
      awaken(g, s, p) { addQi(p, 3); const w = wanted(g, s); if (w != null) p.forceNext = w; },
    },
    c09: {
      shopDiscount(g, s, p) { return 0.3; },
      skill(g, s, p) {
        const q = [];
        for (let i = 0; i < 3; i++) { const j = g.head + (g.N - 1) + i * g.N; if (j <= g.tail - 16) q.push(g.wall[j]); }
        p.peekQueue = q.filter(k => k < 34);
        return true;
      },
      onScore(g, s, p) { return p.awake ? [['大甩賣', 3]] : []; },
    },
    c10: {
      onClaim(g, s, p) { p.fx.served = true; if (p.awake) addQi(p, 2); },
      drawPred(g, s, p) { if (p.fx.served) { p.fx.served = false; return useful(p); } },
      skill(g, s, p, a) {
        const k = a.k;
        if (!p.hand.includes(k)) return false;
        const c = R.toCounts(p.hand);
        let pred;
        if (k < 27) pred = (x) => x < 27 && x !== k && Math.floor(x / 9) === Math.floor(k / 9) && Math.abs(x - k) <= 2 && (c[x] ? true : [x - 1, x + 1].some(j => j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(x / 9) && c[j]));
        else pred = (x) => x >= 27 && x < 34 && x !== k && c[x] >= 1;
        return swapIn(g, p, k, pred) != null || swapIn(g, p, k, useful(p)) != null;
      },
    },
    c11: {
      onHandStart(g, s, p) { const opp = g.seats().filter(o => o !== s); const t = opp[Math.floor(rnd() * opp.length)]; g.players[t].fx.noClaimUntil = 1; },
      skill(g, s, p, a) { const q = g.players[a.target]; if (g.targetGuard(s, a.target)) return true; q.fx.freeze = true; q.fx.noClaimUntil = q.discards + 1; return true; },
      awaken(g, s, p) { for (let o = 0; o < g.N; o++) if (o !== s && !g.targetGuard(s, o)) g.players[o].fx.freeze = true; },
    },
    c12: {
      onHandStart(g, s, p) { p.fx.shield = (p.fx.shield || 0) + 1; },
      skill(g, s, p) { p.fx.shield = (p.fx.shield || 0) + 1; return true; },
      awaken(g, s, p) { p.fx.noDealIn = true; },
    },
    c13: {
      qiBonus(g, s, p) { p.fx.charge = (p.fx.charge || 0) + 1; return p.fx.charge % 3 === 0 ? 1 : 0; },
      skill(g, s, p, a) { const q = g.players[a.target]; if (g.targetGuard(s, a.target)) return true; q.qi = 0; q.fx.freeze = true; return true; },
      onScore(g, s, p, sc) { return p.awake && sc.total > 0 ? [['雷電爆發', sc.total]] : []; },
    },
    c14: {
      onEvent(g, s, p, ev) { if (ev.type === 'flower' && ev.seat === s) addQi(p, 1); },
      skill(g, s, p) {
        const lone = loneTiles(p);
        let n = 0;
        for (const k of lone) { if (n >= 2) break; if (swapIn(g, p, k, (x) => x < 34 && x !== k) != null) n++; }
        return n > 0;
      },
      awaken(g, s, p) { p.qi = 10; },
      onScore(g, s, p) { return p.awake ? [['滿載而歸', 2]] : []; },
    },
    c15: {
      onTargeted(g, s, p) { if (rnd() < 0.5) return 'reflect'; },
      skill(g, s, p) {
        const opp = g.seats().slice(1).map(d => (s + d) % g.N).filter(o => g.players[o].hand.length);
        const give = opp.map(o => { const q = g.players[o]; const i = Math.floor(rnd() * q.hand.length); return q.hand.splice(i, 1)[0]; });
        opp.forEach((o, i) => { const q = g.players[o]; q.hand.push(give[(i + opp.length - 1) % opp.length]); q.hand.sort((a, b) => a - b); if (q.lastDraw != null && !q.hand.includes(q.lastDraw)) q.lastDraw = null; });
        return true;
      },
      awaken(g, s, p) { for (let o = 0; o < g.N; o++) if (o !== s && !g.targetGuard(s, o)) { const q = g.players[o]; q.fx.slip = true; q.fx.flipUntil = q.discards + 2; } },
    },
    c16: {
      onHandStart(g, s, p) {
        const c = R.toCounts(p.hand);
        const suit = [0, 1, 2].map(x => c.slice(x * 9, x * 9 + 9).reduce((a, b) => a + b, 0));
        const b = suit.indexOf(Math.max(...suit));
        p.fx.luck = c.slice(27, 34).reduce((a, b2) => a + b2, 0) >= 6 ? 'honor' : ['man', 'pin', 'sou'][b];
        p.fx.luckLeft = 3;
      },
      drawPred(g, s, p) { if (p.awake && rnd() < 0.5) return useful(p); },
      skill(g, s, p) {
        const r = rnd();
        if (r < 0.5) { const w = wanted(g, s); if (w != null) p.forceNext = w; p.fx.jiao = '聖筊'; }
        else if (r < 0.75) { addQi(p, 3); p.fx.jiao = '笑筊'; }
        else p.fx.jiao = '陰筊';
        return true;
      },
    },
  };

  // 把每位玩家的人物效果組成牌局可呼叫的調整接口
  function buildMod(game) {
    const each = (fn) => { for (const p of game.players) if (p.char && B[p.char]) fn(B[p.char], p, p.seat); };
    const on = () => !!game.settings.skills;
    const b = (seat) => { const p = game.players[seat]; return p && p.char && B[p.char] ? B[p.char] : null; };
    return {
      onHandStart() { if (!on()) return; each((x, p, s) => x.onHandStart && x.onHandStart(game, s, p)); },
      qiBonus(seat) { const x = on() && b(seat); return x && x.qiBonus ? x.qiBonus(game, seat, game.players[seat]) : 0; },
      drawPred(seat) {
        if (!on()) return null;
        const x = b(seat);
        const r = x && x.drawPred ? x.drawPred(game, seat, game.players[seat]) : null;
        if (r) return r;
        // 小聖母覺醒：對手摸牌三成是沒用的牌
        for (const p of game.players) if (p.seat !== seat && p.char === 'c16' && p.awake && rnd() < 0.3) return useless(game.players[seat]);
        return null;
      },
      onClaim(seat) { const x = on() && b(seat); if (x && x.onClaim) x.onClaim(game, seat, game.players[seat]); },
      onEvent(ev) {
        if (!on()) return;
        each((x, p, s) => x.onEvent && x.onEvent(game, s, p, ev));
        if ((ev.type === 'chi' || ev.type === 'kong') && ev.seat != null) { const x = b(ev.seat); if (x && x.onClaim) x.onClaim(game, ev.seat, game.players[ev.seat]); }
      },
      onScore(seat, sc) { const x = on() && b(seat); return x && x.onScore ? x.onScore(game, seat, game.players[seat], sc) : []; },
      onSettle(info) { if (!on()) return; each((x, p, s) => x.onSettle && x.onSettle(game, s, p, info)); },
      skillDiscount(seat, id) { const x = on() && b(seat); return x && x.skillDiscount ? x.skillDiscount(game, seat, game.players[seat], id) : 0; },
      shopDiscount(seat) { const x = on() && b(seat); return x && x.shopDiscount ? x.shopDiscount(game, seat, game.players[seat]) : 0; },
      onTargeted(attacker, target) { const x = on() && b(target); return x && x.onTargeted ? x.onTargeted(game, target, game.players[target], attacker) : undefined; },
    };
  }
  function runSkill(game, seat, a) { const p = game.players[seat]; const x = B[p.char]; return x && x.skill ? x.skill(game, seat, p, a) : false; }
  function runAwaken(game, seat) { const p = game.players[seat]; const x = B[p.char]; if (x && x.awaken) x.awaken(game, seat, p); }

  return { CHARS, BY_ID, buildMod, runSkill, runAwaken, helpers: { useful, useless, improving, wanted } };
});
