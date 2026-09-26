// 養成系統：死亡積分、天賦樹、裝備（套裝、強化、洗練、分解），存在這台裝置的瀏覽器
(function () {
  const R = window.MJRules;
  const KEY = 'mj16_meta_v1';
  const rnd = Math.random;
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  // ================= 天賦樹 =================
  const BRANCH = {
    A: { name: '雀聖', role: '進攻系', color: '#ff7a5c', desc: '讓胡牌的台數變大。適合喜歡做大牌、自摸拚高台的人。點滿後，8 台以上的大牌輸贏直接乘 1.5 倍。' },
    D: { name: '無漏', role: '防守系', color: '#5ab4ff', desc: '減少放槍的損失、提早看出危險。適合穩穩打、不想輸大錢的人。點滿後，牌局最後 10 張內你打的牌不會被胡。' },
    S: { name: '千術', role: '策略系', color: '#c08cff', desc: '改善起手、干擾對手、讓技能更便宜。適合喜歡用技能操控牌局的人。點滿後，每局有一次機會把爛牌換成好牌。' },
  };
  // [編號, 系, 層, 左右, 名稱, 短說明, 詳細功能說明, 前置（陣列；'X|Y' 代表二選一）]
  const NODES = [
    ['A1', 'A', 1, 'L', '銳利目光', '報聽胡牌 +1 台', '你有報聽（包含天聽、地聽）而且胡牌時，台數多 +1 台。建議搭配「報聽」按鈕一起用。', []],
    ['A2', 'A', 1, 'R', '染手專精', '清、混一色 +1 台', '胡牌牌型有清一色或混一色時，再多 +1 台。搭配「氣運值」或「購買牌型」效果更好。', []],
    ['A3', 'A', 2, 'L', '自摸狂熱', '自摸 +1 台', '自己摸到胡牌時，多 +1 台。三家都要付，自摸一次賺得更多。', ['A1']],
    ['A4', 'A', 2, 'R', '役牌精通', '字牌刻子每組 +1 台', '胡牌時，手上每一組三元牌（中發白）或圈風、門風的刻子，各再多 +1 台。', ['A2']],
    ['A5', 'A', 3, 'L', '連擊火種', '連續胡牌，下局 +3 氣', '這局你胡牌的話，下一局開局直接多 3 氣，可以馬上用技能繼續壓制。', ['A3|A4']],
    ['A6', 'A', 3, 'R', '爆發力', '怒氣累積 +25%', '所有讓你累積怒氣的情況（放槍、被自摸、被吃碰、被攻擊），怒氣都多累積 25%，更快進入覺醒。', ['A3']],
    ['A7', 'A', 4, 'C', '役滿之路', '8 台以上輸贏 ×1.5', '終極天賦。你胡的牌達到 8 台以上時（不含莊家與連莊台數），這局輸贏直接乘 1.5 倍。', ['A5', 'A6']],
    ['D1', 'D', 1, 'L', '金剛不壞', '放槍損失 -10%', '你放槍或被自摸時，要付出的分數減少 10%（冒險模式就是扣血減少 10%）。', []],
    ['D2', 'D', 1, 'R', '看穿眼', '看見報聽者聽的花色', '對手報聽時，他的名牌旁會顯示他聽的是哪幾種花色（萬、筒、條、字），打牌時避開那些花色就比較安全。', []],
    ['D3', 'D', 2, 'L', '化骨綿掌', '放槍字牌損失減半', '你打出的字牌（東南西北中發白）被別人胡時，付出的分數只要一半。', ['D1']],
    ['D4', 'D', 2, 'R', '壁之利用', '見 3 張的牌標示較安全', '場上（河裡加上吃碰）已經出現 3 張的牌，在你手牌上會有綠色「安」字，代表別人很難用它胡牌。', ['D2']],
    ['D5', 'D', 3, 'L', '流局之王', '流局沒放槍，下局 +2 氣', '這局撐到流局，下一局開局多 2 氣。專門對付大家都在拚的長局。', ['D3|D4']],
    ['D6', 'D', 3, 'R', '避坑指南', '打危險牌前警告', '你選到一張會讓別人胡的牌時，畫面會跳出「危險！」並語音提醒，給你反悔的機會。', ['D4']],
    ['D7', 'D', 4, 'C', '絕境封牌', '最後 10 張不會放槍', '終極天賦。牌牆剩 10 張以內時，你打出的任何牌別人都不能胡。', ['D5', 'D6']],
    ['S1', 'S', 1, 'L', '起手優化', '起手不會太爛', '每局發牌後，如果你的手牌離聽牌還差 4 步以上，系統會把最沒用的牌換掉，直到差 3 步以內。', []],
    ['S2', 'S', 1, 'R', '神之骰子', '局前免費換牌 +1', '局前準備時，免費換牌的張數多 1 張。', []],
    ['S3', 'S', 2, 'L', '干擾波段', '吃碰後下家摸牌變差', '你吃、碰、槓之後，你的下家下一次摸牌比較容易摸到沒用的牌。', ['S1']],
    ['S4', 'S', 2, 'R', '籌碼掠奪', '胡牌多贏 15%', '你胡牌時，多贏 15%（由銀行補給你，對手不用多付）。冒險模式換算的金幣也跟著變多。', ['S2']],
    ['S5', 'S', 3, 'L', '轉運符文', '連 2 局沒胡，自動氣運', '連續 2 局沒有胡牌的話，下一局開局自動發動「氣運值」，依你的手牌選牌型。', ['S3|S4']],
    ['S6', 'S', 3, 'R', '技能精通', '所有技能 -1 氣', '所有技能（包含專屬技能）都少花 1 氣，最少 1 氣。', ['S3']],
    ['S7', 'S', 4, 'C', '天選之手', '每局一次爛牌變好牌', '終極天賦。每局第一次要摸到沒用的牌時，自動換成對你有用的牌。', ['S5', 'S6']],
  ].map(([id, b, tier, side, name, short, desc, req]) => ({ id, b, tier, side, name, short, desc, req, cost: tier === 4 ? 3 : 1 }));
  const NODE = {}; NODES.forEach(n => NODE[n.id] = n);
  const TALENT_CAP = 20;
  const SOUL_PER_POINT = 100;
  const branchSpent = (m, b) => NODES.filter(n => n.b === b && m.talents[n.id]).reduce((s, n) => s + n.cost, 0);
  const spent = (m) => NODES.filter(n => m.talents[n.id]).reduce((s, n) => s + n.cost, 0);
  const earned = (m) => Math.min(TALENT_CAP, Math.floor(m.soulTotal / SOUL_PER_POINT));
  function reqStatus(m, n) {
    const parts = n.req.map(r => { const alts = r.split('|'); return { alts, ok: alts.some(a => m.talents[a]) }; });
    const gate = n.tier === 4 ? branchSpent(m, n.b) >= 6 : true;
    return { parts, gate, ok: parts.every(p => p.ok) && gate };
  }
  function canLearn(m, n) {
    if (m.talents[n.id]) return false;
    return reqStatus(m, n).ok && earned(m) - spent(m) >= n.cost;
  }

  // ================= 裝備 =================
  const SLOTS = [
    { id: 'head', name: '頭飾', main: 'rage', nouns: ['髮簪', '斗笠', '鳳冠', '頭巾', '毛帽'] },
    { id: 'eye', name: '眼鏡', main: 'scout', nouns: ['墨鏡', '圓框眼鏡', '單片眼鏡', '護目鏡', '老花眼鏡'] },
    { id: 'body', name: '上衣', main: 'def', nouns: ['花襯衫', '唐裝', '西裝', '羽織', '背心'] },
    { id: 'hand', name: '手部', main: 'luck', nouns: ['手套', '玉扳指', '護腕', '佛珠', '金戒指'] },
    { id: 'acc', name: '飾品', main: 'qi', nouns: ['平安符', '玉珮', '香火袋', '幸運骰', '招財貓'] },
    { id: 'back', name: '牌背', main: 'tai', nouns: ['龍紋牌背', '櫻花牌背', '黃金牌背', '墨竹牌背', '星空牌背'] },
  ];
  const SLOT = {}; SLOTS.forEach(s => SLOT[s.id] = s);
  const MAIN = {
    rage: { name: '怒氣累積', base: 10, fmt: v => `+${v.toFixed(0)}%` },
    scout: { name: '開局免費神算機率', base: 15, fmt: v => `${v.toFixed(0)}%` },
    def: { name: '放槍損失減少', base: 6, fmt: v => `-${v.toFixed(1)}%` },
    luck: { name: '好牌機率', base: 4, fmt: v => `+${v.toFixed(1)}%` },
    qi: { name: '開局 +2 氣機率', base: 25, fmt: v => `${v.toFixed(0)}%` },
    tai: { name: '胡牌 +1 台機率', base: 20, fmt: v => `${v.toFixed(0)}%` },
  };
  const RARITY = [
    { name: '普通', color: '#c9c9c9', subs: 1, salvage: 1 },
    { name: '精良', color: '#6fdc8c', subs: 2, salvage: 2 },
    { name: '稀有', color: '#5ab4ff', subs: 3, salvage: 4 },
    { name: '史詩', color: '#c08cff', subs: 3, salvage: 7 },
    { name: '傳說', color: '#ffb13a', subs: 4, salvage: 12 },
  ];
  const SUBS = {
    qi: { name: '開局氣 +1', minR: 0 }, rage: { name: '怒氣累積 +10%', minR: 0 }, def: { name: '放槍損失 -5%', minR: 0 },
    zimo: { name: '自摸 +1 台', minR: 2 }, flower: { name: '花牌每張 +1 台', minR: 1 }, skill: { name: '技能 -1 氣', minR: 4 },
    swap: { name: '局前免費換牌 +1', minR: 0 }, gold: { name: '冒險金幣 +8%', minR: 0 }, luck: { name: '好牌機率 +3%', minR: 0 },
    shield: { name: '開局防護罩 10%', minR: 0 },
  };
  const SETS = {
    gamble: { name: '賭神', b2: '自摸 +1 台', b4: '起手對子保底 2 對', b6: '你覺醒時，所有對手定身一次' },
    saint: { name: '雀聖', b2: '門清 +1 台', b4: '報聽後第一次摸牌，一半機會摸到胡牌', b6: '報聽胡牌台數 ×1.5' },
    night: { name: '夜市', b2: '冒險金幣 +15%', b4: '吃、碰、槓後 +1 氣', b6: '每局開局隨機得到：+3 氣、防護罩或氣運值' },
    temple: { name: '廟口', b2: '開局防護罩機率 +20%', b4: '放槍損失 -20%', b6: '每場一次：放槍不用付錢' },
    thief: { name: '千王', b2: '所有技能 -1 氣', b4: '每局開局自動神算（看接下來 3 張）', b6: '搓牌只要 1 氣' },
  };
  const LEGEND_FX = {
    gamble: '傳說：自摸時對手怒氣 -20', saint: '傳說：天聽、地聽再 +2 台', night: '傳說：胡牌 +50 冒險金幣',
    temple: '傳說：每局開局 +1 層防護罩', thief: '傳說：每局開局 +2 氣',
  };
  const ENH = [null, [100, 50], [100, 50], [100, 50], [90, 80], [80, 120], [70, 160], [55, 220], [40, 300], [30, 400], [20, 550]]; // 強化到 +N 的 [成功率, 金幣]
  const ENH_STONES = (lv) => 1 + Math.floor(lv / 3);
  const LOCK_COST = [0, 1, 3, 6];
  const INV_CAP = 60;

  function rollSubs(r, n, exclude) {
    const pool = Object.keys(SUBS).filter(k => SUBS[k].minR <= r && !(exclude || []).includes(k));
    const out = [];
    for (let i = 0; i < n && pool.length; i++) { const k = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; out.push(k); }
    return out;
  }
  function makeItem(r, slotId, setId) {
    const slot = slotId ? SLOT[slotId] : pick(SLOTS);
    const set = r >= 3 ? (setId || pick(Object.keys(SETS))) : null;
    const prefix = set ? SETS[set].name + '・' : pick(['', '', '舊', '好用的', '閃亮', '幸運', '老牌', '精緻']);
    return {
      uid: Date.now().toString(36) + Math.floor(rnd() * 1e6).toString(36), slot: slot.id, r, set,
      name: prefix + pick(slot.nouns), lv: 0, subs: rollSubs(r, RARITY[r].subs), legend: r === 4,
    };
  }
  function rollRarity(minR, weights) {
    const w = weights || [45, 30, 15, 8, 2];
    let r;
    do { let t = rnd() * 100; r = 0; for (; r < 5; r++) { if ((t -= w[r]) < 0) break; } r = Math.min(4, r); } while (r < minR);
    return r;
  }
  const mainVal = (it) => MAIN[SLOT[it.slot].main].base * (1 + 0.1 * it.lv) * (1 + it.r * 0.25);

  // ================= 存檔 =================
  let meta = null;
  function blank() {
    return { v: 1, soul: 0, soulTotal: 0, talents: {}, wallet: 0, stones: 0, refine: 0, charms: 0, inv: [], eq: {}, gift: false, runs: 0 };
  }
  function load() {
    if (meta) return meta;
    try { const s = localStorage.getItem(KEY); meta = s ? Object.assign(blank(), JSON.parse(s)) : blank(); } catch (e) { meta = blank(); }
    if (!meta.gift) {
      // 新手禮包：讓你馬上可以試天賦和裝備
      meta.gift = true;
      meta.soul += 200; meta.soulTotal += 200; meta.wallet += 500; meta.stones += 6; meta.refine += 2; meta.charms += 1;
      meta.inv.push(makeItem(1, 'hand'), makeItem(2, 'back'), makeItem(3, 'body', 'temple'), makeItem(0, 'acc'));
      save();
    }
    if (!meta.cards && window.MJCards) {
      // 起始卡牌組
      meta.cards = {}; meta.deck = MJCards.STARTER.slice();
      for (const id of meta.deck) meta.cards[id] = (meta.cards[id] || 0) + 1;
      save();
    }
    return meta;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch (e) { } }

  // ================= 合計加成 =================
  function equipped(m) { return Object.values(m.eq).map(uid => m.inv.find(i => i.uid === uid)).filter(Boolean); }
  function setCounts(m) { const c = {}; for (const it of equipped(m)) if (it.set) c[it.set] = (c[it.set] || 0) + 1; return c; }
  function bonus(m) {
    m = m || load();
    const b = { rage: 0, scout: 0, def: 0, luck: 0, qi: 0, tai: 0, startQi: 0, zimo: 0, flower: 0, skill: 0, swap: 0, gold: 0, shield: 0, legend: {} };
    for (const it of equipped(m)) {
      b[SLOT[it.slot].main] += mainVal(it);
      for (const s of it.subs) {
        if (s === 'qi') b.startQi += 1; else if (s === 'rage') b.rage += 10; else if (s === 'def') b.def += 5; else if (s === 'zimo') b.zimo += 1;
        else if (s === 'flower') b.flower += 1; else if (s === 'skill') b.skill += 1; else if (s === 'swap') b.swap += 1; else if (s === 'gold') b.gold += 8;
        else if (s === 'luck') b.luck += 3; else if (s === 'shield') b.shield += 10;
      }
      if (it.legend && it.set) b.legend[it.set] = true;
    }
    const sc = setCounts(m);
    b.set = (id, n) => (sc[id] || 0) >= n;
    if (b.set('temple', 2)) b.shield += 20;
    if (b.set('temple', 4)) b.def += 20;
    if (b.set('night', 2)) b.gold += 15;
    if (b.set('gamble', 2)) b.zimo += 1;
    if (b.set('thief', 2)) b.skill += 1;
    b.def = Math.min(60, b.def);
    return b;
  }
  const T = (id) => !!load().talents[id];

  // ================= 牌局規則調整（只作用在你，座位 0） =================
  function swapWith(g, p, outK, pred) {
    const js = [];
    for (let j = g.head; j <= g.tail; j++) if (g.wall[j] < 34 && pred(g.wall[j])) js.push(j);
    if (!js.length) return false;
    const j = pick(js);
    const got = g.wall[j]; g.wall[j] = outK;
    p.hand.splice(p.hand.indexOf(outK), 1); p.hand.push(got); p.hand.sort((a, b) => a - b);
    return true;
  }
  function loneSorted(p) {
    const c = R.toCounts(p.hand);
    const score = (k) => { let n = c[k] * 3; if (k < 27) for (const d of [-2, -1, 1, 2]) { const j = k + d; if (j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(k / 9)) n += c[j]; } return n; };
    return [...new Set(p.hand)].sort((a, b) => score(a) - score(b));
  }
  function usefulFor(p) {
    const c = R.toCounts(p.hand);
    return (x) => { if (x >= 34) return false; if (c[x] >= 1 && c[x] <= 2) return true; if (x < 27) for (const d of [-2, -1, 1, 2]) { const j = x + d; if (j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(x / 9) && c[j]) return true; } return false; };
  }
  function autoLuck(p) {
    const c = R.toCounts(p.hand);
    const suit = [0, 1, 2].map(x => c.slice(x * 9, x * 9 + 9).reduce((a, b) => a + b, 0));
    p.fx.luck = c.slice(27, 34).reduce((a, b) => a + b, 0) >= 6 ? 'honor' : ['man', 'pin', 'sou'][suit.indexOf(Math.max(...suit))];
    p.fx.luckLeft = 5;
  }
  function suitsOf(ks) { return [...new Set(ks.map(k => k < 9 ? '萬' : k < 18 ? '筒' : k < 27 ? '條' : '字'))]; }

  function buildMod() {
    const b = bonus();
    const st = { winLast: false, noWin: 0, drawLast: false, firstDraw: true, chosen: false, afterTing: false, templeUsed: false, s3: null, hands: 0 };
    const me = (g) => g.players[0];
    return {
      onHandStart(g) {
        const p = me(g);
        st.firstDraw = true; st.chosen = false; st.afterTing = false; st.hands++;
        p.metaView = { tingSuits: {}, wallSafe: T('D4'), warn: null };
        if (!g.settings.skills) return;
        let q = b.startQi;
        if (T('A5') && st.winLast) q += 3;
        if (T('D5') && st.drawLast) q += 2;
        if (rnd() * 100 < b.qi) q += 2;
        if (b.legend.thief) q += 2;
        p.qi = Math.min(10, (p.qi || 0) + q);
        if (rnd() * 100 < b.shield) p.fx.shield = (p.fx.shield | 0) + 1;
        if (b.legend.temple) p.fx.shield = (p.fx.shield | 0) + 1;
        if (T('S5') && st.noWin >= 2) autoLuck(p);
        if (b.set('night', 6)) { const r = rnd(); if (r < 0.34) p.qi = Math.min(10, p.qi + 3); else if (r < 0.67) p.fx.shield = (p.fx.shield | 0) + 1; else autoLuck(p); }
        // 起手優化、賭神 4 件
        if (T('S1')) { for (let i = 0; i < 6 && R.shanten(p.hand, 5) > 3; i++) { const k = loneSorted(p)[0]; if (!swapWith(g, p, k, usefulFor(p))) break; } }
        if (b.set('gamble', 4)) {
          for (let i = 0; i < 4; i++) {
            const c = R.toCounts(p.hand);
            if (c.filter(x => x >= 2).length >= 2) break;
            const singles = [...new Set(p.hand)].filter(k => c[k] === 1);
            const out = loneSorted(p).find(k => c[k] === 1);
            if (out == null || !swapWith(g, p, out, (x) => singles.includes(x) && x !== out)) break;
          }
        }
      },
      qiBonus() { return 0; },
      onDraw(seat, k, g) {
        if (seat !== 0) return;
        const p = me(g);
        if (st.firstDraw) {
          st.firstDraw = false;
          if (g.settings.skills && (b.set('thief', 4) || rnd() * 100 < b.scout)) {
            const q = []; for (let i = 0; i < 3; i++) { const j = g.head + (g.N - 1) + i * g.N; if (j <= g.tail - 16 && g.wall[j] < 34) q.push(g.wall[j]); }
            p.peekQueue = q;
          }
        }
        if (T('D7') && g.remaining() <= 10) p.fx.noDealIn = true;
        if (T('D6')) {
          const danger = [];
          for (const x of new Set(p.hand)) for (let o = 1; o < g.N; o++) { const q = g.players[o]; if (g.canRon(q, x) && R.isWin(q.hand.concat([x]))) { danger.push(x); break; } }
          p.metaView.warn = danger;
        }
      },
      drawPred(seat, g) {
        const p = g.players[seat];
        if (seat === 0) {
          if (b.set('saint', 4) && st.afterTing) { st.afterTing = false; if (rnd() < 0.5) { const w = R.waits(p.hand); if (w.length) return (x) => w.includes(x); } }
          if (T('S7') && !st.chosen) {
            const u = usefulFor(p);
            if (g.wall[g.head] < 34 && !u(g.wall[g.head])) { st.chosen = true; return u; }
          }
          if (rnd() * 100 < b.luck) return usefulFor(p);
          return null;
        }
        if (st.s3 === seat) { st.s3 = null; const u = usefulFor(p); return (x) => x < 34 && !u(x); }
        return null;
      },
      skillDiscount(seat, id, g) {
        if (seat !== 0) return 0;
        let d = b.skill + (T('S6') ? 1 : 0);
        if (id === 'cuopai' && b.set('thief', 6)) d += 20;
        return d;
      },
      freeSwap(seat) { return seat === 0 ? b.swap + (T('S2') ? 1 : 0) : 0; },
      rageBonus(seat) { return seat === 0 ? b.rage / 100 + (T('A6') ? 0.25 : 0) : 0; },
      onScore(seat, sc, ctx) {
        if (seat !== 0 || !ctx) return [];
        const x = [];
        const names = sc.items.map(i => i[0]);
        if (T('A1') && ctx.ting) x.push(['銳利目光', 1]);
        if (T('A2') && (names.includes('清一色') || names.includes('混一色'))) x.push(['染手專精', 1]);
        if (T('A3') && ctx.selfDraw) x.push(['自摸狂熱', 1]);
        if (T('A4')) { const n = names.filter(n => n.startsWith('三元牌') || n.startsWith('圈風') || n.startsWith('門風') || n === '大三元' || n === '小三元').length; if (n) x.push(['役牌精通', n]); }
        if (b.zimo && ctx.selfDraw) x.push(['裝備・自摸', b.zimo]);
        if (b.flower && ctx.flowers && ctx.flowers.length) x.push(['裝備・花牌', b.flower * ctx.flowers.length]);
        if (b.set('saint', 2) && names.some(n => n.startsWith('門清'))) x.push(['雀聖套裝', 1]);
        if (b.set('saint', 6) && ctx.ting) { const t = Math.ceil(sc.total / 2); if (t) x.push(['雀聖六件', t]); }
        if (b.legend.saint && (ctx.ting === 'tian' || ctx.ting === 'di')) x.push(['雀聖傳說', 2]);
        if (rnd() * 100 < b.tai) x.push(['牌背加持', 1]);
        return x;
      },
      onSettle(info, g) {
        const d = info.deltas;
        if (info.winner === 0) {
          st.winLast = true; st.noWin = 0;
          let mult = 1;
          if (T('A7') && info.tai >= 8) mult = 1.5;
          if (mult > 1) for (let i = 0; i < 4; i++) d[i] = Math.round(d[i] * mult);
          if (T('S4')) d[0] = Math.round(d[0] * 1.15);
          if (b.legend.gamble && info.selfDraw) for (let o = 1; o < g.N; o++) g.players[o].rage = Math.max(0, (g.players[o].rage || 0) - 20);
        } else { st.winLast = false; st.noWin++; }
        st.drawLast = false;
        if (d[0] < 0) {
          if (b.set('temple', 6) && info.loser === 0 && !st.templeUsed) { st.templeUsed = true; d[0] = 0; return; }
          let cut = b.def + (T('D1') ? 10 : 0);
          let v = d[0] * (1 - Math.min(70, cut) / 100);
          if (T('D3') && info.loser === 0 && info.tile >= 27) v /= 2;
          d[0] = Math.round(v);
        }
      },
      onEvent(ev, g) {
        const p = me(g);
        if (ev.type === 'drawgame') { st.drawLast = true; st.winLast = false; st.noWin++; }
        if (ev.type === 'ting' && ev.seat === 0) st.afterTing = true;
        if (ev.type === 'ting' && ev.seat !== 0 && T('D2') && p.metaView) {
          const q = g.players[ev.seat];
          p.metaView.tingSuits[ev.seat] = suitsOf(R.waits(q.hand));
        }
        if (ev.seat === 0 && (ev.type === 'pong' || ev.type === 'chi' || ev.type === 'kong')) {
          if (T('S3')) st.s3 = 1;
          if (b.set('night', 4) && g.settings.skills) p.qi = Math.min(10, p.qi + 1);
        }
        if (ev.type === 'awaken' && ev.seat === 0 && b.set('gamble', 6)) for (let o = 1; o < g.N; o++) g.players[o].fx.freeze = true;
      },
    };
  }

  // ================= 取得資源 =================
  function reward(r) {
    const m = load();
    m.soul += r.soul || 0; m.soulTotal += r.soul || 0;
    m.wallet += r.wallet || 0; m.stones += r.stones || 0; m.refine += r.refine || 0; m.charms += r.charms || 0;
    const items = [];
    for (const it of (r.items || [])) { if (m.inv.length < INV_CAP) { m.inv.push(it); items.push(it); } else { m.stones += RARITY[it.r].salvage; } }
    save();
    return items;
  }
  // 冒險過關掉落
  function dropFor(kind) {
    const items = [];
    let refine = 0, charms = 0;
    if (kind === 'boss') { items.push(makeItem(rollRarity(3))); items.push(makeItem(rollRarity(2))); refine = 2; if (rnd() < 0.5) charms = 1; }
    else if (kind === 'elite') { items.push(makeItem(rollRarity(1, [0, 45, 35, 16, 4]))); if (rnd() < 0.4) refine = 1; if (rnd() < 0.3) charms = 1; }
    else { if (rnd() < 0.45) items.push(makeItem(rollRarity(0))); if (rnd() < 0.2) refine = 1; }
    return { items, refine, charms };
  }

  // ================= 卡牌 =================
  const CD = () => window.MJCards;
  const inDeck = (m, id) => m.deck.filter(x => x === id).length;
  function deckOK(m) { return m.deck.length >= CD().DECK_MIN && m.deck.length <= CD().DECK_MAX; }
  function battleDeck() { const m = load(); return deckOK(m) ? m.deck.slice() : CD().STARTER.slice(); }
  function addCard(id) {
    const m = load();
    m.cards[id] = (m.cards[id] || 0) + 1;
    if (m.deck.length < CD().DECK_MAX && inDeck(m, id) < CD().COPY_MAX) m.deck.push(id);
    save();
  }
  function rollCards(n, minRare) {
    const ids = CD().LIST;
    const w = [60, 30, 10];
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 200) {
      let t = rnd() * 100, r = 0; for (; r < 3; r++) { if ((t -= w[r]) < 0) break; } r = Math.min(2, Math.max(minRare || 0, r));
      const pool = ids.filter(id => CD().CARDS[id].rare === r && !out.includes(id));
      if (pool.length) out.push(pick(pool));
    }
    return out;
  }

  // ================= 操作 =================
  const ops = {
    deckAdd(id) { const m = load(); if ((m.cards[id] || 0) > inDeck(m, id) && inDeck(m, id) < CD().COPY_MAX && m.deck.length < CD().DECK_MAX) { m.deck.push(id); save(); return true; } return false; },
    deckRemove(id) { const m = load(); const i = m.deck.indexOf(id); if (i >= 0) { m.deck.splice(i, 1); save(); } },
    learn(id) { const m = load(); const n = NODE[id]; if (!canLearn(m, n)) return false; m.talents[id] = true; save(); return true; },
    resetTalents() { const m = load(); if (m.wallet < 200) return false; m.wallet -= 200; m.talents = {}; save(); return true; },
    equip(uid) { const m = load(); const it = m.inv.find(i => i.uid === uid); if (!it) return; m.eq[it.slot] = uid; save(); },
    unequip(slot) { const m = load(); delete m.eq[slot]; save(); },
    salvage(uid) {
      const m = load(); const it = m.inv.find(i => i.uid === uid); if (!it) return 0;
      if (Object.values(m.eq).includes(uid)) return 0;
      m.inv = m.inv.filter(i => i.uid !== uid);
      const n = RARITY[it.r].salvage + Math.floor(it.lv / 2);
      m.stones += n; save(); return n;
    },
    enhance(uid, useCharm) {
      const m = load(); const it = m.inv.find(i => i.uid === uid);
      if (!it || it.lv >= 10) return { ok: false, msg: '已經強化到最高 +10' };
      const [rate, gold] = ENH[it.lv + 1];
      const st = ENH_STONES(it.lv);
      if (m.wallet < gold) return { ok: false, msg: `錢包金幣不夠（要 ${gold}）` };
      if (m.stones < st) return { ok: false, msg: `強化石不夠（要 ${st} 顆）` };
      if (useCharm && m.charms < 1) return { ok: false, msg: '沒有護符' };
      m.wallet -= gold; m.stones -= st;
      let res;
      if (rnd() * 100 < rate) {
        it.lv++;
        if ((it.lv === 5 || it.lv === 10) && it.subs.length < 5) { const ns = rollSubs(it.r, 1, it.subs); if (ns.length) it.subs.push(ns[0]); }
        res = { ok: true, result: 'up', lv: it.lv };
      } else if (it.lv >= 6) {
        if (useCharm) { m.charms--; res = { ok: true, result: 'kept', lv: it.lv }; }
        else { it.lv--; res = { ok: true, result: 'down', lv: it.lv }; }
      } else res = { ok: true, result: 'fail', lv: it.lv };
      save(); return res;
    },
    refineRoll(uid, locks) {
      const m = load(); const it = m.inv.find(i => i.uid === uid);
      const cost = 1 + LOCK_COST[locks.length];
      if (!it) return null;
      if (m.refine < cost) return { err: `洗練石不夠（要 ${cost} 顆）` };
      m.refine -= cost; save();
      const kept = it.subs.filter((s, i) => locks.includes(i));
      const fresh = rollSubs(it.r, it.subs.length - kept.length, kept);
      const next = it.subs.map((s, i) => locks.includes(i) ? s : fresh.shift() || s);
      return { next };
    },
    refineApply(uid, subs) { const m = load(); const it = m.inv.find(i => i.uid === uid); if (it) { it.subs = subs; save(); } },
  };

  window.MJMeta = {
    NODES, NODE, BRANCH, SLOTS, SLOT, MAIN, RARITY, SUBS, SETS, LEGEND_FX, ENH, ENH_STONES, LOCK_COST, TALENT_CAP, SOUL_PER_POINT,
    load, save, bonus, buildMod, reward, dropFor, makeItem, ops, mainVal, equipped, setCounts,
    spent, earned, branchSpent, reqStatus, canLearn, battleDeck, addCard, rollCards, deckOK, inDeck,
    get data() { return load(); },
  };
})();
