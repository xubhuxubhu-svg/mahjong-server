// 牌局流程（伺服器與單機共用）
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const R = isNode ? require('./rules') : root.MJRules;
  const AI = isNode ? require('./ai') : root.MJAI;
  const CH = isNode ? require('./chars') : root.MJChars;
  const CD = isNode ? require('./cards') : root.MJCards;
  const m = factory(R, AI, CH, CD);
  if (isNode) module.exports = m; else root.MJGame = m;
})(typeof self !== 'undefined' ? self : this, function (R, AI, CH, CD) {
  const DEAD_WALL = 16; // 留16張不摸
  const WIND = R.WIND;
  // 技能（花氣）與商店（價格為「幾台的錢」）
  const SKILL_COST = {
    cuopai: 8, luck: 4, peek: 3, missile: { noclaim: 3, freeze: 5, nohu: 6 },
    debuff: { fog: 3, flip: 3, slip: 4, bad: 5 }, swaptile: 5, safe: 4, ink: 2,
  };
  const SHOP = { double: 8, shield: 6, pack: 15, gold: 10, swapEach: 1, freeSwap: 2, maxSwap: 10 };
  const PACKS = { man: '萬子包', pin: '筒子包', sou: '條子包', dragon: '三元包', pair: '對子包' };
  const LUCK = { man: '萬子', pin: '筒子', sou: '條子', honor: '字牌', pong: '碰碰胡' };
  const AI_LEVEL = { off: 0, low: 0.3, normal: 0.6, high: 1 };

  class Game {
    // players: [{id, name, isAI}] 四位；settings: {rounds, base, perTai, discardTime, claimTime, aiDelay}
    // hooks: {onUpdate(), onEvent(ev)}
    constructor(players, settings, hooks) {
      this.settings = Object.assign({
        rounds: 1, base: 300, perTai: 100, discardTime: 20, claimTime: 10, aiDelay: 700, nextHandTime: 0,
        xianggong: false,   // 相公模式：不自動提示胡牌，胡錯判相公
        guoshui: 'strict',  // 過水：strict 到自己摸牌前都不能胡；loose 只限同一張，別人打出別張就解除
        zhuama: 0,          // 抓馬張數，0 為不抓
        graceMs: 1300,      // 相公模式下每張牌的反應時間
        talk: true,         // 電腦垃圾話
        skills: true,       // 技能與道具
        aiSkill: 'normal',  // 電腦用技能的強度：off low normal high
        prepTime: 25,       // 連線時局前準備秒數
      }, settings || {});
      this.hooks = hooks || {};
      this.players = players.map((p, i) => ({
        id: p.id, name: p.name, isAI: !!p.isAI, auto: false, connected: true, char: (p.char && CH && CH.BY_ID[p.char]) ? p.char : null, rage: 0, awake: false,
        seat: i, score: Math.max(0, Math.min(50000, Number(this.settings && this.settings.startScore) || 0)), ready: false,
      }));
      this.dealer = Math.floor(Math.random() * players.length);
      this.roundWind = 0;
      this.lian = 0;
      this.dealerMoves = 0;
      this.handNo = 0;
      this.phase = 'idle';
      this.gameOver = false;
      this.timers = new Set();
      this.log = [];
      this.stats = players.map(() => ({ hu: 0, zimo: 0, pao: 0 }));
      // 冒險模式的規則調整（遺物、詛咒、魔王）
      this.mods = [CH ? CH.buildMod(this) : null, (CD && this.settings.deck) ? CD.buildMod(this, this.settings.deck) : null].concat(this.settings.mod || []).filter(Boolean);
    }
    // 呼叫所有規則調整（人物＋冒險模式），依回傳型別合併
    hook(name, ...args) {
      let out;
      for (const m of this.mods) {
        if (typeof m[name] !== 'function') continue;
        const r = name === 'onWall' && Array.isArray(out) ? m[name](out, ...args.slice(1), this) : m[name](...args, this);
        if (r === undefined || r === null) continue;
        if (name === 'onWall') out = r;
        else if (typeof r === 'number') out = (out || 0) + r;
        else if (Array.isArray(r)) out = (out || []).concat(r);
        else if (typeof r === 'boolean') out = out || r;
        else if (out === undefined) out = r;
      }
      return out;
    }
    // 被技能指定時：人物能力、防護罩判定。回傳 true 代表被擋下
    targetGuard(att, tgt, silent) {
      const t = this.players[tgt];
      const r = this.hook('onTargeted', att, tgt);
      if (r === 'block' || r === 'reflect') { if (!silent) this.event({ type: 'guard', seat: tgt, how: r }); return true; }
      if (t.fx.shield) { t.fx.shield = Math.max(0, (t.fx.shield | 0) - 1); if (!silent) this.event({ type: 'guard', seat: tgt, how: 'shield' }); return true; }
      this.addRage(tgt, 10);
      return false;
    }
    addRage(seat, n) {
      const p = this.players[seat];
      if (!this.settings.skills || !p.char || p.awake) return;
      n = Math.round(n * (1 + (this.hook('rageBonus', seat) || 0)));
      p.rage = Math.min(100, (p.rage || 0) + n);
    }

    // ---------- 工具 ----------
    later(fn, ms) {
      const t = setTimeout(() => { this.timers.delete(t); if (!this.destroyed) fn(); }, ms * (this.settings.timeScale == null ? 1 : this.settings.timeScale));
      this.timers.add(t);
      return t;
    }
    clearTimers() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }
    destroy() { this.destroyed = true; this.clearTimers(); }
    update() { if (this.hooks.onUpdate) this.hooks.onUpdate(); }
    event(ev) { if (this.hooks.onEvent) this.hooks.onEvent(ev); this.hook('onEvent', ev); }
    addLog(s) { this.log.push(s); if (this.log.length > 30) this.log.shift(); }
    seatWind(i) { return (i - this.dealer + this.N) % this.N; }
    get N() { return this.players.length; }
    seats() { return this.players.map((p, i) => i); }
    pname(i) { return this.players[i].name; }
    isBot(i) { const p = this.players[i]; return p.isAI || p.auto || !p.connected; }
    humansCount() { return this.players.filter(p => !p.isAI).length; }
    useTimers() { return this.humansCount() > 1 && this.settings.discardTime > 0; }
    remaining() { return this.tail - this.head + 1 - DEAD_WALL; }
    isHumanActive(i) { const p = this.players[i]; return !p.isAI && !p.auto && p.connected; }
    noClaim(p) { return p.fx && p.discards < p.fx.noClaimUntil; }
    noHu(p) { return p.fx && p.discards < p.fx.noHuUntil; }
    fogged(p) { return p.fx && p.discards < p.fx.fogUntil; }
    flipped(p) { return p.fx && p.discards < p.fx.flipUntil; }
    canRon(p, k) {
      if (p.xiang || this.noHu(p)) return false;
      if (this.settings.guoshui === 'loose') return p.passHuKind !== k;
      return !p.passHu;
    }
    talk(seat, lines, prob) {
      if (!this.settings.talk || !this.players[seat] || !this.players[seat].isAI) return;
      if (prob != null && Math.random() > prob) return;
      const now = Date.now();
      if (this.lastTalkAt && now - this.lastTalkAt < 2500) return;
      this.lastTalkAt = now;
      const text = Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines;
      this.event({ type: 'talk', seat, text });
    }
    randomAI(except) {
      const c = this.players.filter(p => p.isAI && p.seat !== except);
      return c.length ? c[Math.floor(Math.random() * c.length)].seat : null;
    }

    visibleCounts(seat) {
      const v = new Array(34).fill(0);
      for (const p of this.players) {
        for (const r of p.river) if (!r.taken && !(r.ink && p.seat !== seat)) v[r.k]++;
        for (const m of p.melds) {
          if (m.type === 'akong' && p.seat !== seat) continue;
          for (const k of meldTiles(m)) v[k]++;
        }
      }
      for (const k of this.players[seat].hand) v[k]++;
      for (let i = 0; i < 34; i++) if (v[i] > 4) v[i] = 4;
      return v;
    }
    valuableFor(seat) {
      return [31, 32, 33, 27 + this.roundWind, 27 + this.seatWind(seat)];
    }

    // ---------- 開局 ----------
    startHand() {
      if (this.gameOver) return;
      this.clearTimers();
      this.handNo++;
      this.wall = R.makeWall();
      const w2 = this.hook('onWall', this.wall);
      if (Array.isArray(w2)) this.wall = w2;
      this.head = 0;
      this.tail = this.wall.length - 1;
      this.anyClaim = false;
      this.result = null;
      this.lastDiscard = null;
      this.barrier = null;
      this.claim = null;
      this.pendingSelf = null;
      this.log = [];
      for (const p of this.players) {
        p.hand = []; p.melds = []; p.flowers = []; p.river = [];
        p.lastDraw = null; p.discards = 0; p.passHu = false; p.ready = false; p.forbid = null;
        p.passHuKind = null; p.declared = null; p.xiang = false;
        p.qi = 0; p.used = {}; p.forceNext = null; p.peekQueue = null; p.prepDone = false;
        p.awake = false; p.readTarget = null; p.readUntil = 0; p.readAll = false;
        p.fx = { noClaimUntil: 0, noHuUntil: 0, freeze: false, shield: false, double: false, luck: null, luckLeft: 0,
          fogUntil: 0, flipUntil: 0, slip: false, badLeft: 0, inkLeft: 0, gold: false };
        p.safeInfo = null; p.swapInfo = null;
      }
      this.addLog(`第${this.handNo}局開始，${WIND[this.roundWind]}風圈，莊家：${this.pname(this.dealer)}${this.lian ? `（連${this.lian}）` : ''}`);
      // 發牌：每人16張
      for (let r = 0; r < 16; r++) for (let i = 0; i < this.N; i++) {
        const s = (this.dealer + i) % this.N;
        this.players[s].hand.push(this.wall[this.head++]);
      }
      // 補花
      for (let i = 0; i < this.N; i++) {
        const s = (this.dealer + i) % this.N;
        const p = this.players[s];
        let guard = 0;
        while (p.hand.some(R.isFlower) && guard++ < 20) {
          const fl = p.hand.filter(R.isFlower);
          p.hand = p.hand.filter(k => !R.isFlower(k));
          for (const f of fl) {
            p.flowers.push(f);
            p.hand.push(this.wall[this.tail--]);
          }
        }
        p.hand.sort((a, b) => a - b);
      }
      this.phase = 'play';
      this.hook('onHandStart');
      this.event({ type: 'start' });
      // 開局就八仙
      for (let s = 0; s < this.N; s++) {
        if (this.players[s].flowers.length === 8) { this.winSpecial(s, 'bxgh', null); return; }
      }
      this.update();
      if (this.lian >= 3) {
        const t = this.randomAI(this.dealer);
        if (t != null) this.later(() => this.talk(t, [`莊家連${this.lian}了，很旺喔！`, '這個莊一定要把它拉下來！', '莊家手很順喔，大家小心'], 0.8), 900);
      }
      if (this.settings.skills) this.later(() => this.enterPrep(), 400);
      else this.later(() => this.beginTurn(this.dealer, false), 600);
    }

    // ---------- 局前準備：換牌、買道具 ----------
    enterPrep() {
      if (this.phase !== 'play') return;
      this.stage = 'prep';
      this.turn = this.dealer;
      for (const p of this.players) {
        p.prepDone = false;
        if (p.isAI) this.aiPrep(p.seat);
        else if (this.isBot(p.seat)) p.prepDone = true;
      }
      this.deadline = this.useTimers() ? Date.now() + this.settings.prepTime * 1000 : null;
      this.update();
      if (this.deadline) {
        const hn = this.handNo;
        this.later(() => {
          if (this.handNo !== hn || this.stage !== 'prep') return;
          for (const p of this.players) p.prepDone = true;
          this.checkPrep();
        }, this.settings.prepTime * 1000 + 300);
      }
      this.checkPrep();
    }
    checkPrep() {
      if (this.stage !== 'prep') return;
      if (!this.players.every(p => p.prepDone)) return;
      this.stage = 'between';
      this.deadline = null;
      for (let s = 0; s < this.N; s++) {
        if (this.players[s].flowers.length === 8) { this.winSpecial(s, 'bxgh', null); return; }
      }
      this.update();
      this.later(() => this.beginTurn(this.dealer, false), 500);
    }
    freeSwap(seat) { return SHOP.freeSwap + (this.hook('freeSwap', seat) || 0); }
    shopPrice(item, n, seat) {
      const t = this.settings.perTai;
      if (item === 'swap') return Math.max(0, n - this.freeSwap(seat)) * SHOP.swapEach * t;
      return SHOP[item] * t;
    }
    doPrep(seat, a) {
      const p = this.players[seat];
      if (p.prepDone) return;
      let swap = Array.isArray(a.swap) ? a.swap.filter(k => Number.isInteger(k)).slice(0, SHOP.maxSwap) : [];
      // 檢查換的牌真的在手上
      const tmp = p.hand.slice();
      swap = swap.filter(k => { const i = tmp.indexOf(k); if (i < 0) return false; tmp.splice(i, 1); return true; });
      let cost = this.shopPrice('swap', swap.length, seat);
      if (a.double) { p.fx.double = true; cost += this.shopPrice('double'); }
      if (a.shield) { p.fx.shield = (p.fx.shield | 0) + 1; cost += this.shopPrice('shield'); }
      if (a.gold) { p.fx.gold = true; cost += this.shopPrice('gold'); }
      let packN = 0;
      if (PACKS[a.pack]) { cost += this.shopPrice('pack'); packN = this.applyPack(p, a.pack, swap); }
      const sd = this.hook('shopDiscount', seat) || 0;
      if (sd) cost = Math.round(cost * (1 - sd));
      p.score -= cost;
      if (swap.length) {
        for (const k of swap) removeN(p.hand, k, 1);
        for (let i = 0; i < swap.length; i++) {
          let k = this.wall[this.head++];
          let guard = 0;
          while (R.isFlower(k) && guard++ < 10) { p.flowers.push(k); k = this.wall[this.tail--]; }
          p.hand.push(k);
        }
        for (const k of swap) {
          const pos = this.head + Math.floor(Math.random() * (this.tail - this.head + 2));
          this.wall.splice(pos, 0, k);
          this.tail++;
        }
        p.hand.sort((x, y) => x - y);
      }
      p.prepDone = true;
      const bits = [];
      if (swap.length) bits.push(`換了 ${swap.length} 張牌`);
      if (a.double) bits.push('買了翻倍符');
      if (a.shield) bits.push('買了防護罩');
      if (a.gold) bits.push('買了免死金牌');
      if (PACKS[a.pack]) bits.push(`買了${PACKS[a.pack]}`);
      if (bits.length) {
        this.addLog(`${p.name} ${bits.join('、')}`);
        this.event({ type: 'prep', seat, swap: swap.length, double: !!a.double, shield: !!a.shield, gold: !!a.gold, pack: PACKS[a.pack] ? a.pack : null, packN, cost });
      }
      this.update();
      this.checkPrep();
    }
    // 購買牌型：把手上最沒用的牌（最多6張）換成牌型需要的牌。swap 是玩家另外要換掉的牌，不動它們
    applyPack(p, pack, keepOut) {
      const c = R.toCounts(p.hand);
      const reserved = R.toCounts(keepOut || []);
      const want = (x) => {
        if (x >= 34) return false;
        if (pack === 'man') return x < 9;
        if (pack === 'pin') return x >= 9 && x < 18;
        if (pack === 'sou') return x >= 18 && x < 27;
        if (pack === 'dragon') return x >= 31 && x <= 33;
        if (pack === 'pair') return c[x] === 1;
        return false;
      };
      const fits = (x) => pack === 'pair' ? c[x] >= 2 : want(x);
      // 手牌從最沒用排起
      const score = (k) => {
        if (fits(k)) return 99;
        let n = c[k] * 3;
        if (k < 27) { for (const d of [-2, -1, 1, 2]) { const j = k + d; if (j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(k / 9)) n += c[j]; } }
        return n;
      };
      const cand = [...new Set(p.hand)].filter(k => c[k] - reserved[k] > 0 && !fits(k)).sort((a, b) => score(a) - score(b));
      let n = 0;
      for (const k of cand) {
        if (n >= 6) break;
        const js = [];
        for (let j = this.head; j <= this.tail; j++) if (want(this.wall[j])) js.push(j);
        if (!js.length) break;
        const j = js[Math.floor(Math.random() * js.length)];
        const got = this.wall[j];
        this.wall[j] = k;
        removeN(p.hand, k, 1); p.hand.push(got);
        c[k]--; c[got]++;
        n++;
      }
      p.hand.sort((x, y) => x - y);
      return n;
    }

    aiPrep(seat) {
      const p = this.players[seat];
      const lvl = AI_LEVEL[this.settings.aiSkill] || 0;
      const c = R.toCounts(p.hand);
      const val = this.valuableFor(seat);
      // 免費換掉落單的字牌
      const swap = [];
      for (let k = 27; k < 34 && swap.length < SHOP.freeSwap; k++) if (c[k] === 1 && !val.includes(k)) swap.push(k);
      const sh = R.shanten(p.hand, 5);
      const a = { swap };
      if (lvl && Math.random() < lvl * 0.3) a.shield = true;
      if (lvl && sh <= 3 && Math.random() < lvl * 0.35) a.double = true;
      if (lvl && Math.random() < lvl * 0.2) a.gold = true;
      if (lvl && p.score > 2000 && Math.random() < lvl * 0.25) {
        const suit = [0, 1, 2].map(s => c.slice(s * 9, s * 9 + 9).reduce((x, y) => x + y, 0));
        const b = suit.indexOf(Math.max(...suit));
        a.pack = suit[b] >= 8 ? ['man', 'pin', 'sou'][b] : (c[31] + c[32] + c[33] >= 3 ? 'dragon' : 'pair');
      }
      p.prepDone = false;
      this.doPrep(seat, a);
    }

    // ---------- 技能 ----------
    wallCounts() {
      const c = new Array(34).fill(0);
      for (let j = this.head; j <= this.tail; j++) if (this.wall[j] < 34) c[this.wall[j]]++;
      return c;
    }
    luckPred(p) {
      const t = p.fx.luck;
      if (t === 'man') return x => x < 9;
      if (t === 'pin') return x => x >= 9 && x < 18;
      if (t === 'sou') return x => x >= 18 && x < 27;
      if (t === 'honor') return x => x >= 27 && x < 34;
      const c = R.toCounts(p.hand);
      return x => x < 34 && c[x] >= 1 && c[x] <= 2;
    }
    // 摸牌前：搓牌、神算、氣運會把指定的牌換到要摸的位置
    applyDrawBias(seat, fromBack) {
      const p = this.players[seat];
      if (!p.fx) return;
      let pred = null;
      if (p.forceNext != null) { const k = p.forceNext; p.forceNext = null; pred = x => x === k; }
      else if (p.peekQueue && p.peekQueue.length) { const k = p.peekQueue.shift(); pred = x => x === k; if (!p.peekQueue.length) p.peekQueue = null; }
      else if (p.fx.badLeft > 0) {
        p.fx.badLeft--;
        if (Math.random() < 0.7) {
          const c = R.toCounts(p.hand);
          pred = x => {
            if (x >= 34 || c[x]) return false;
            if (x >= 27) return true;
            for (const d of [-2, -1, 1, 2]) { const j = x + d; if (j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(x / 9) && c[j]) return false; }
            return true;
          };
        }
      }
      else if (p.fx.luck && p.fx.luckLeft > 0) {
        p.fx.luckLeft--;
        if (Math.random() < 0.6) pred = this.luckPred(p);
        if (p.fx.luckLeft <= 0) p.fx.luck = null;
      }
      if (!pred) { const mp = this.hook('drawPred', seat); if (typeof mp === 'function') pred = mp; }
      if (!pred) return;
      const idx = fromBack ? this.tail : this.head;
      const cands = [];
      for (let j = this.head; j <= this.tail; j++) if (pred(this.wall[j])) cands.push(j);
      if (!cands.length) return;
      const j = cands[Math.floor(Math.random() * cands.length)];
      const t = this.wall[idx]; this.wall[idx] = this.wall[j]; this.wall[j] = t;
    }
    useSkill(seat, a) {
      if (!this.settings.skills) return false;
      const p = this.players[seat];
      const disc = this.hook('skillDiscount', seat, a.id) || 0;
      const pay = (c) => Math.max(1, c - disc); // 神明卡之類的折扣，最少 1 氣
      const id = a.id;
      if (p.used[id] && !a._card) return false;
      if (p.cardState && !a._card && id !== 'char') return false; // 冒險卡牌模式：一般技能改用卡牌
      let cost, target = null, sub = null, info = '';
      if (id === 'cuopai') {
        cost = SKILL_COST.cuopai;
        if (!(Number.isInteger(a.k) && a.k >= 0 && a.k < 34)) return false;
        if (!this.wallCounts()[a.k]) return false;
        if (p.qi < pay(cost)) return false;
        p.forceNext = a.k;
        info = '搓牌';
      } else if (id === 'luck') {
        cost = SKILL_COST.luck;
        if (!LUCK[a.pattern] || p.qi < pay(cost)) return false;
        p.fx.luck = a.pattern; p.fx.luckLeft = 5;
        sub = a.pattern;
        info = `氣運值（${LUCK[a.pattern]}）`;
      } else if (id === 'peek') {
        cost = SKILL_COST.peek;
        if (p.qi < pay(cost)) return false;
        const q = [];
        for (let i = 0; i < 3; i++) {
          const j = this.head + (this.N - 1) + i * this.N;
          if (j <= this.tail - DEAD_WALL) q.push(this.wall[j]);
        }
        p.peekQueue = q.filter(k => k < 34);
        info = '神算';
      } else if (id === 'debuff') {
        cost = SKILL_COST.debuff[a.kind];
        target = a.target;
        if (!cost || !(target >= 0 && target < this.N) || target === seat || p.qi < pay(cost)) return false;
        sub = a.kind;
        info = '負面狀態';
      } else if (id === 'swaptile') {
        cost = SKILL_COST.swaptile;
        target = a.target;
        if (!(target >= 0 && target < this.N) || target === seat || p.qi < pay(cost)) return false;
        if (!p.hand.includes(a.k) || !this.players[target].hand.length) return false;
        info = '換牌術';
      } else if (id === 'safe') {
        cost = SKILL_COST.safe;
        if (p.qi < pay(cost)) return false;
        info = '安全牌偵測';
      } else if (id === 'ink') {
        cost = SKILL_COST.ink;
        if (p.qi < pay(cost)) return false;
        p.fx.inkLeft = 3;
        info = '隱形墨水';
      } else if (id === 'char') {
        const c = p.char && CH.BY_ID[p.char];
        if (!c) return false;
        cost = c.skill.cost;
        if (p.qi < pay(cost)) return false;
        if (c.needs === 'target') { target = a.target; if (!(target >= 0 && target < this.N) || target === seat) return false; }
        if (c.needs === 'tile' && !p.hand.includes(a.k)) return false;
        sub = p.char;
        info = c.skill.name;
      } else if (id === 'missile') {
        cost = SKILL_COST.missile[a.kind];
        target = a.target;
        if (!cost || !(target >= 0 && target < this.N) || target === seat || p.qi < pay(cost)) return false;
        sub = a.kind;
        info = '飛彈攻擊';
      } else return false;
      p.qi -= pay(cost);
      if (!a._card) p.used[id] = true;
      this.addLog(`${p.name} 發動 ${info}`);
      let blocked = false, reflected = false;
      if (id === 'debuff' || id === 'swaptile' || id === 'missile') {
        const r = this.hook('onTargeted', seat, target);
        if (r === 'reflect' && id !== 'swaptile') { reflected = true; target = seat; this.addLog(`${this.pname(a.target)} 把攻擊反彈回去了`); }
        else if (r === 'block' || r === 'reflect') { blocked = true; this.addLog(`${this.pname(target)} 讓攻擊落空了`); }
        else if (this.players[target].fx.shield) {
          const t = this.players[target]; t.fx.shield = Math.max(0, (t.fx.shield | 0) - 1); blocked = true; this.addLog(`${t.name} 的防護罩擋下了`);
        } else this.addRage(target, 10);
      }
      const t0 = target != null ? this.players[target] : null;
      if (blocked) {
        // 被擋下，什麼都不發生
      } else if (id === 'char') {
        if (!CH.runSkill(this, seat, a)) { p.qi += pay(cost); delete p.used[id]; return false; }
      } else if (id === 'debuff') {
        if (sub === 'fog') t0.fx.fogUntil = t0.discards + 3;
        else if (sub === 'flip') t0.fx.flipUntil = t0.discards + 3;
        else if (sub === 'slip') t0.fx.slip = true;
        else if (sub === 'bad') t0.fx.badLeft = 3;
        if (p.isAI) this.later(() => this.talk(seat, ['送你一點霉運～', '手滑一下吧', '看得清楚嗎？哈哈'], 0.6), 900);
      } else if (id === 'swaptile') {
        const j = Math.floor(Math.random() * t0.hand.length);
        const got = t0.hand[j];
        t0.hand.splice(j, 1); t0.hand.push(a.k); t0.hand.sort((x, y) => x - y);
        removeN(p.hand, a.k, 1); p.hand.push(got);
        if (p.lastDraw != null && !p.hand.includes(p.lastDraw)) p.lastDraw = null;
        const key = Date.now() + Math.random();
        p.swapInfo = { gave: a.k, got, with: target, key };
        t0.swapInfo = { gave: got, got: a.k, with: seat, key };
      } else if (id === 'safe') {
        this.computeSafe(seat);
      }
      if (id === 'missile' && !blocked) {
        const t = this.players[target];
        if (sub === 'noclaim') t.fx.noClaimUntil = t.discards + 3;
        else if (sub === 'freeze') t.fx.freeze = true;
        else if (sub === 'nohu') t.fx.noHuUntil = t.discards + 1;
        if (p.isAI && !blocked) this.later(() => this.talk(seat, ['吃我一記飛彈！', '看你還能怎樣', '定住你啦！', '不好意思，手滑了～'], 0.7), 900);
      }
      this.event({ type: 'skill', seat, id, target: reflected ? a.target : target, sub, blocked, reflected, jiao: id === 'char' && p.fx.jiao ? p.fx.jiao : undefined });
      if (p.fx.jiao) p.fx.jiao = null;
      this.update();
      return true;
    }
    // 電腦在自己回合用技能（每回合最多一個）
    aiSkills(seat) {
      if (!this.settings.skills) return;
      const lvl = AI_LEVEL[this.settings.aiSkill] || 0;
      if (!lvl) return;
      const p = this.players[seat];
      const n = 5 - p.melds.length;
      const sh = R.shanten(p.hand, n);
      const rnd = Math.random;
      const opps0 = this.seats().filter(o => o !== seat);
      const hot = opps0.filter(o => { const q = this.players[o]; return q.declared || q.melds.length >= 3; });
      // 專屬技能
      if (p.char && !p.used.char && CH.BY_ID[p.char]) {
        const c = CH.BY_ID[p.char];
        if (p.qi >= c.skill.cost && rnd() < lvl * 0.3) {
          const a = { id: 'char' };
          if (c.needs === 'target') a.target = hot.length ? hot[Math.floor(rnd() * hot.length)] : opps0[Math.floor(rnd() * opps0.length)];
          if (c.needs === 'tile') a.k = AI.chooseDiscard(p.hand, p.melds.length, this.visibleCounts(seat), {});
          if (this.useSkill(seat, a)) return;
        }
      }
      // 安全牌偵測：有人快胡時先看哪張危險
      if (!p.used.safe && p.qi >= SKILL_COST.safe && hot.length && sh >= 1 && rnd() < lvl * 0.5 && this.useSkill(seat, { id: 'safe' })) return;
      // 負面狀態：讓快胡的人倒楣
      if (!p.used.debuff && hot.length && p.qi >= 5 && rnd() < lvl * 0.3 && this.useSkill(seat, { id: 'debuff', target: hot[Math.floor(rnd() * hot.length)], kind: 'bad' })) return;
      if (!p.used.debuff && p.qi >= 4 && rnd() < lvl * 0.1 && this.useSkill(seat, { id: 'debuff', target: opps0[Math.floor(rnd() * opps0.length)], kind: ['slip', 'fog', 'flip'][Math.floor(rnd() * 3)] })) return;
      // 隱形墨水
      if (!p.used.ink && p.qi >= SKILL_COST.ink && sh <= 2 && rnd() < lvl * 0.12 && this.useSkill(seat, { id: 'ink' })) return;
      // 換牌術：拿落單字牌去換
      if (!p.used.swaptile && p.qi >= SKILL_COST.swaptile && rnd() < lvl * 0.06) {
        const c = R.toCounts(p.hand);
        const lone = [27, 28, 29, 30, 31, 32, 33].find(k => c[k] === 1);
        if (lone != null && this.useSkill(seat, { id: 'swaptile', target: opps0[Math.floor(rnd() * opps0.length)], k: lone })) return;
      }
      // 搓牌：快聽或已聽時，搓一張最有用的牌
      if (!p.used.cuopai && p.qi >= SKILL_COST.cuopai && sh <= 1 && rnd() < lvl * 0.8) {
        const k0 = AI.chooseDiscard(p.hand, p.melds.length, this.visibleCounts(seat), {});
        const h = p.hand.slice(); h.splice(h.indexOf(k0), 1);
        const wc = this.wallCounts();
        let want = R.waits(h).filter(k => wc[k] > 0);
        if (!want.length) {
          const c = R.toCounts(h);
          const base = R.shantenCounts(c, n);
          for (let k = 0; k < 34; k++) {
            if (!wc[k]) continue;
            c[k]++; if (R.shantenCounts(c, n) < base) want.push(k); c[k]--;
          }
        }
        if (want.length && this.useSkill(seat, { id: 'cuopai', k: want[Math.floor(rnd() * want.length)] })) return;
      }
      // 飛彈：對付快胡的人
      if (!p.used.missile) {
        const opps = this.seats().filter(o => o !== seat);
        const threats = opps.filter(o => { const q = this.players[o]; return q.declared || q.melds.length >= 3 || (q.melds.length >= 2 && this.remaining() < 25); });
        if (threats.length) {
          const t = threats[Math.floor(rnd() * threats.length)];
          const tp = this.players[t];
          if (p.qi >= 6 && (tp.declared || tp.melds.length >= 3) && rnd() < lvl * 0.5 && this.useSkill(seat, { id: 'missile', target: t, kind: 'nohu' })) return;
          if (p.qi >= 3 && tp.melds.length >= 2 && !tp.declared && rnd() < lvl * 0.35 && this.useSkill(seat, { id: 'missile', target: t, kind: 'noclaim' })) return;
        }
        if (p.qi >= 5 && rnd() < lvl * 0.08 && this.useSkill(seat, { id: 'missile', target: opps[Math.floor(rnd() * opps.length)], kind: 'freeze' })) return;
      }
      // 氣運值：早巡依手牌傾向選牌型
      if (!p.used.luck && p.qi >= SKILL_COST.luck && p.discards < 8 && rnd() < lvl * 0.5) {
        const c = R.toCounts(p.hand);
        const suit = [0, 1, 2].map(s => c.slice(s * 9, s * 9 + 9).reduce((x, y) => x + y, 0));
        const honors = c.slice(27, 34).reduce((x, y) => x + y, 0);
        const pairs = c.filter(x => x >= 2).length;
        const best = suit.indexOf(Math.max(...suit));
        let pat = null;
        if (suit[best] >= 9) pat = ['man', 'pin', 'sou'][best];
        else if (honors >= 6) pat = 'honor';
        else if (pairs >= 5) pat = 'pong';
        if (pat && this.useSkill(seat, { id: 'luck', pattern: pat })) return;
      }
    }

    // 從牌牆摸一張（fromBack：補牌），自動補花。回傳牌或 null（流局）
    drawTile(seat, fromBack) {
      const p = this.players[seat];
      let first = true;
      while (true) {
        if (this.remaining() <= 0) return null;
        if (first) { this.applyDrawBias(seat, fromBack); first = false; }
        const k = fromBack ? this.wall[this.tail--] : this.wall[this.head++];
        if (!R.isFlower(k)) return k;
        p.flowers.push(k);
        this.addLog(`${p.name} 補花 ${R.tileName(k)}`);
        this.event({ type: 'flower', seat, k });
        // 八仙過海 / 七搶一
        if (p.flowers.length === 8) { this.winSpecial(seat, 'bxgh', null); return 'END'; }
        for (let o = 0; o < this.N; o++) {
          if (o !== seat && this.players[o].flowers.length === 7) {
            this.players[o].flowers.push(k);
            p.flowers.pop();
            this.winSpecial(o, 'qqy', seat);
            return 'END';
          }
        }
        fromBack = true;
      }
    }

    beginTurn(seat, fromBack, kongDraw) {
      if (this.phase !== 'play') return;
      const p = this.players[seat];
      // 定身：跳過這一巡
      if (!fromBack && p.fx && p.fx.freeze) {
        p.fx.freeze = false;
        this.stage = 'between';
        this.addLog(`${p.name} 被定身，跳過一巡`);
        this.event({ type: 'frozen', seat });
        this.update();
        this.later(() => this.beginTurn((seat + 1) % this.N, false), 900);
        return;
      }
      p.passHu = false;
      p.passHuKind = null;
      const k = this.drawTile(seat, fromBack);
      if (k === 'END') return;
      if (k === null) { this.drawGame(); return; }
      if (this.settings.skills) p.qi = Math.max(0, Math.min(10, p.qi + 1 + (this.hook('qiBonus', seat) || 0)));
      this.hook('onDraw', seat, k);
      p.hand.push(k);
      p.lastDraw = k;
      p.forbid = null;
      this.turn = seat;
      this.kongDraw = !!kongDraw;
      this.lastTileDrawn = this.remaining() === 0;
      this.event({ type: 'draw', seat });
      // 怒氣滿了：覺醒
      if (this.settings.skills && p.char && !p.awake && p.rage >= 100) {
        p.awake = true; p.rage = 0;
        CH.runAwaken(this, seat);
        this.addLog(`${p.name} 怒氣覺醒：${CH.BY_ID[p.char].awaken.name}！`);
        this.event({ type: 'awaken', seat, char: p.char });
      }
      this.enterDiscard(seat, true);
    }

    selfOptions(seat, justDrew) {
      const p = this.players[seat];
      const opts = [];
      if (justDrew && !p.xiang && !this.noHu(p) && R.isWin(p.hand) && !this.hook('huBlock', seat, p.hand)) opts.push({ type: 'zimo' });
      if (p.declared) return opts; // 報聽後不能再換牌
      if (this.remaining() > 0) {
        const c = R.toCounts(p.hand);
        for (let k = 0; k < 34; k++) if (c[k] === 4) opts.push({ type: 'ankong', k });
        if (justDrew) {
          for (const m of p.melds) if (m.type === 'pong' && c[m.k] > 0) opts.push({ type: 'jiakong', k: m.k });
        }
      }
      return opts;
    }

    computeSafe(seat) {
      const p = this.players[seat];
      const danger = [];
      for (const k of new Set(p.hand)) {
        for (let o = 0; o < this.N; o++) {
          if (o === seat) continue;
          const q = this.players[o];
          if (this.canRon(q, k) && !(p.fx && p.fx.noDealIn) && R.isWin(q.hand.concat([k]))) { danger.push(k); break; }
        }
      }
      p.safeInfo = { danger };
    }
    enterDiscard(seat, justDrew) {
      if (this.players[seat].fx && this.players[seat].fx.autoSafe) this.computeSafe(seat);
      this.claim = null;
      this.turn = seat;
      this.stage = 'discard';
      this.pendingSelf = { seat, options: this.selfOptions(seat, justDrew) };
      this.deadline = this.useTimers() ? Date.now() + this.settings.discardTime * 1000 : null;
      this.update();
      const p = this.players[seat];
      if (this.isBot(seat)) {
        this.later(() => this.botDiscardTurn(seat), p.isAI ? this.settings.aiDelay : 400);
      } else if (this.deadline) {
        const hn = this.handNo, st = this.stepId = (this.stepId || 0) + 1;
        this.later(() => { if (this.handNo === hn && this.stepId === st && this.stage === 'discard' && this.turn === seat) this.botDiscardTurn(seat); }, this.settings.discardTime * 1000 + 300);
      }
      if (!p.isAI && !this.isBot(seat)) {
        const hn = this.handNo, cnt = p.discards;
        this.later(() => {
          if (this.handNo === hn && this.stage === 'discard' && this.turn === seat && p.discards === cnt) {
            const t = this.randomAI(seat);
            if (t != null) this.talk(t, ['打快點啦，打到要吃早餐了！', '是在想什麼啦，快一點～', '慢慢想，我去泡個茶先'], 1);
          }
        }, 15000);
      }
    }

    botDiscardTurn(seat) {
      if (this.phase !== 'play' || this.stage !== 'discard' || this.turn !== seat) return;
      const p = this.players[seat];
      const opts = this.pendingSelf ? this.pendingSelf.options : [];
      if (opts.length) {
        const c = AI.chooseSelf({ hand: p.hand, meldsCount: p.melds.length }, opts);
        if (c) { this.act(seat, c); return; }
      }
      const fd = CD ? CD.forcedDiscard(this, seat) : null;
      if (fd != null) { this.act(seat, { type: 'discard', k: fd }); return; }
      if (p.isAI) this.aiSkills(seat);
      if (p.declared && p.lastDraw != null) { this.act(seat, { type: 'discard', k: p.lastDraw }); return; }
      const forbid = (p.forbid || []).concat(p.safeInfo ? p.safeInfo.danger : [], this.hook('aiForbid', seat) || []);
      let k = AI.chooseDiscard(p.hand, p.melds.length, this.visibleCounts(seat), { forbid, valuable: this.valuableFor(seat) });
      // 中了迷霧或顛倒的電腦會看錯牌
      if (p.isAI && ((this.fogged(p) && Math.random() < 0.35) || (this.flipped(p) && Math.random() < 0.2))) k = p.hand[Math.floor(Math.random() * p.hand.length)];
      // 第一巡打完就聽：宣告天聽或地聽
      let declare = false;
      if (p.discards === 0 && !this.anyClaim) {
        const h = p.hand.slice(); h.splice(h.indexOf(k), 1);
        declare = R.waits(h).length > 0;
      }
      this.act(seat, { type: 'discard', k, declare });
    }

    // ---------- 玩家動作入口 ----------
    act(seat, a) {
      if (this.phase === 'ended') {
        if (a.type === 'ready') { this.players[seat].ready = true; this.checkAllReady(); }
        return;
      }
      if (this.phase !== 'play' || !a) return;
      if (this.stage === 'prep') {
        if (a.type === 'prep') this.doPrep(seat, a);
        return;
      }
      if (this.stage === 'discard' && this.turn === seat) {
        const p = this.players[seat];
        const opts = this.pendingSelf ? this.pendingSelf.options : [];
        if (a.type === 'skill' && a.id === 'card') { if (CD) CD.play(this, seat, a); return; }
        if (a.type === 'skill') { this.useSkill(seat, a); return; }
        if (a.type === 'discard') {
          const i = p.hand.indexOf(a.k);
          if (i < 0) return;
          if (p.declared && p.lastDraw != null && a.k !== p.lastDraw) return; // 報聽後只能打摸進來的牌
          if (p.fx && p.fx.slip && !p.declared) {
            // 手滑：打出去的變成隨機一張
            p.fx.slip = false;
            const want = a.k;
            a = Object.assign({}, a, { k: p.hand[Math.floor(Math.random() * p.hand.length)] });
            this.event({ type: 'slip', seat, k: a.k });
            this.addLog(`${p.name} 手滑，打出了 ${R.tileName(a.k)}`);
            return this.act(seat, Object.assign({}, a, { declare: false }));
          }
          p.hand.splice(i, 1);
          if (a.declare && !p.declared && R.waits(p.hand).length) {
            const first = p.discards === 0 && !this.anyClaim;
            p.declared = first ? (seat === this.dealer ? 'tian' : 'di') : 'ting';
            this.event({ type: 'ting', seat, kind: p.declared });
            this.addLog(`${p.name} ${p.declared === 'tian' ? '天聽' : p.declared === 'di' ? '地聽' : '報聽'}！`);
            if (p.isAI) this.later(() => this.talk(seat, ['聽了，皮繃緊一點喔', '天公疼憨人，我聽了', '這把要做大的了'], 0.9), 700);
          }
          return this.doDiscard(seat, a.k);
        }
        if (a.type === 'hu' && this.settings.xianggong && !p.isAI) a = { type: 'zimo' };
        if (a.type === 'zimo') {
          if (opts.some(o => o.type === 'zimo')) return this.winSelf(seat);
          if (this.settings.xianggong) return this.makeXiang(seat);
          return;
        }
        if (a.type === 'ankong' && opts.some(o => o.type === 'ankong' && o.k === a.k)) return this.doAnkong(seat, a.k);
        if (a.type === 'jiakong' && opts.some(o => o.type === 'jiakong' && o.k === a.k)) return this.doJiakong(seat, a.k);
        return;
      }
      if (this.stage === 'claim' && this.claim && this.claim.responders[seat]) {
        const r = this.claim.responders[seat];
        if (r.response) return;
        let resp = { type: 'pass' };
        if (a.type === 'hu' && r.options.some(o => o.type === 'hu')) resp = { type: 'hu' };
        else if (a.type === 'hu' && this.settings.xianggong) { r.response = resp; this.makeXiang(seat); this.tryResolveClaim(); return; }
        else if (a.type === 'pong' && r.options.some(o => o.type === 'pong')) resp = { type: 'pong' };
        else if (a.type === 'kong' && r.options.some(o => o.type === 'kong')) resp = { type: 'kong' };
        else if (a.type === 'chi') {
          const o = r.options.find(o => o.type === 'chi' && a.tiles && o.tiles[0] === a.tiles[0] && o.tiles[1] === a.tiles[1]);
          if (o) resp = { type: 'chi', tiles: o.tiles };
        }
        r.response = resp;
        this.update();
        this.tryResolveClaim();
      }
    }

    makeXiang(seat) {
      const p = this.players[seat];
      if (p.xiang) return;
      p.xiang = true;
      this.event({ type: 'xiang', seat });
      this.addLog(`${p.name} 詐胡，相公！這局不能胡了`);
      const t = this.randomAI(seat);
      if (t != null) this.later(() => this.talk(t, ['相公啦！哈哈哈', '肉喔～牌都看不懂', '詐胡喔，這局你陪打就好'], 1), 900);
      this.update();
    }

    // ---------- 打牌與吃碰槓 ----------
    doDiscard(seat, k) {
      const p = this.players[seat];
      p.hand.sort((a, b) => a - b);
      p.lastDraw = null;
      p.discards++;
      let ink = false;
      if (p.fx && p.fx.inkAll) ink = true;
      else if (p.fx && p.fx.inkLeft > 0) { p.fx.inkLeft--; ink = true; }
      p.river.push({ k, taken: false, ink });
      p.safeInfo = null;
      this.lastDiscard = { seat, k };
      this.pendingSelf = null;
      this.kongDraw = false;
      this.lastDiscard.ink = ink;
      this.event({ type: 'discard', seat, k, ink });
      this.addLog(ink ? `${p.name} 打出一張塗黑的牌` : `${p.name} 打出 ${R.tileName(k)}`);
      this.openClaim(seat, k, false);
    }

    openClaim(from, k, robKong) {
      const responders = {};
      const last = this.remaining() <= 0;
      for (let d = 1; d < this.N; d++) {
        const s = (from + d) % this.N;
        const p = this.players[s];
        const options = [];
        const c = R.toCounts(p.hand);
        if (this.settings.guoshui === 'loose' && p.passHuKind != null && p.passHuKind !== k) p.passHuKind = null;
        if (this.canRon(p, k) && !(this.players[from].fx && this.players[from].fx.noDealIn)) {
          c[k]++;
          if (R.isWinCounts(c) && !this.hook('huBlock', s, p.hand.concat([k]))) options.push({ type: 'hu' });
          c[k]--;
        }
        if (!robKong && !last && !p.declared && !this.noClaim(p)) {
          const np = this.hook('noPong', s);
          if (c[k] >= 2 && !np) options.push({ type: 'pong' });
          if (c[k] >= 3 && !np) options.push({ type: 'kong' });
          if ((d === 1 || p.discards < (p.fx.anyChiUntil || 0)) && k < 27 && !this.hook('noChi', s)) {
            const pos = k % 9;
            const combos = [];
            if (pos >= 2 && c[k - 2] && c[k - 1]) combos.push([k - 2, k - 1]);
            if (pos >= 1 && pos <= 7 && c[k - 1] && c[k + 1]) combos.push([k - 1, k + 1]);
            if (pos <= 6 && c[k + 1] && c[k + 2]) combos.push([k + 1, k + 2]);
            for (const t of combos) options.push({ type: 'chi', tiles: t });
          }
        }
        if (options.length) responders[s] = { options, response: null };
        // 相公模式：真人每張牌都有反應時間，看不出自己能不能胡
        else if (this.settings.xianggong && this.isHumanActive(s)) responders[s] = { options, response: null };
      }
      if (!Object.keys(responders).length) {
        if (robKong) return this.finishJiakong(from);
        if (last) return this.drawGame();
        this.stage = 'between';
        this.update();
        this.later(() => this.beginTurn((from + 1) % this.N, false), 250);
        return;
      }
      this.stage = 'claim';
      this.claim = { from, k, robKong, responders };
      this.deadline = this.useTimers() ? Date.now() + this.settings.claimTime * 1000 : null;
      this.update();
      const hn = this.handNo;
      const st = this.stepId = (this.stepId || 0) + 1;
      for (const s of Object.keys(responders).map(Number)) {
        if (this.isBot(s)) {
          this.later(() => this.botClaim(s), this.players[s].isAI ? Math.min(500, this.settings.aiDelay) : 300);
        } else if (this.settings.xianggong && !responders[s].options.some(o => o.type !== 'hu')) {
          // 看得到的選項都沒有：反應時間到自動過
          this.later(() => {
            if (this.handNo !== hn || this.stepId !== st || this.stage !== 'claim') return;
            const r = this.claim && this.claim.responders[s];
            if (r && !r.response) { r.response = { type: 'pass' }; this.tryResolveClaim(); }
          }, this.settings.graceMs);
        }
      }
      if (this.deadline) {
        this.later(() => {
          if (this.handNo !== hn || this.stepId !== st || this.stage !== 'claim') return;
          for (const s of Object.keys(this.claim.responders)) {
            const r = this.claim.responders[s];
            // 逾時：能胡就幫忙胡（相公模式不幫），否則過
            if (!r.response) r.response = (!this.settings.xianggong && r.options.some(o => o.type === 'hu')) ? { type: 'hu' } : { type: 'pass' };
          }
          this.tryResolveClaim();
        }, this.settings.claimTime * 1000 + 300);
      }
    }

    botClaim(s) {
      if (this.stage !== 'claim' || !this.claim || !this.claim.responders[s]) return;
      const r = this.claim.responders[s];
      if (r.response) return;
      const p = this.players[s];
      const choice = AI.chooseClaim({
        hand: p.hand, meldsCount: p.melds.length, visible: this.visibleCounts(s), tile: this.claim.k,
        valuable: this.valuableFor(s),
      }, r.options);
      this.act(s, choice);
    }

    tryResolveClaim() {
      const cl = this.claim;
      if (!cl) return;
      const order = this.seats().slice(1).map(d => (cl.from + d) % this.N).filter(s => cl.responders[s]);
      // 依優先順序：胡 > 碰槓 > 吃，高優先者已決定就可提早結算
      const pending = (s) => !cl.responders[s].response;
      const has = (s, t) => cl.responders[s].options.some(o => o.type === t);
      const chose = (s, t) => cl.responders[s].response && cl.responders[s].response.type === t;
      // 胡
      for (const s of order) {
        if (has(s, 'hu')) {
          if (pending(s)) return; // 等他決定
          if (chose(s, 'hu')) return this.resolveClaim(s, 'hu');
        }
      }
      for (const s of order) {
        if (has(s, 'pong') || has(s, 'kong')) {
          if (pending(s)) return;
          if (chose(s, 'kong')) return this.resolveClaim(s, 'kong');
          if (chose(s, 'pong')) return this.resolveClaim(s, 'pong');
        }
      }
      for (const s of order) {
        if (pending(s)) return;
        if (chose(s, 'chi')) return this.resolveClaim(s, 'chi', cl.responders[s].response.tiles);
      }
      this.resolveClaim(null);
    }

    resolveClaim(winner, type, tiles) {
      const cl = this.claim;
      // 放棄胡的人：過水
      for (const s of Object.keys(cl.responders).map(Number)) {
        const r = cl.responders[s];
        if (r.options.some(o => o.type === 'hu') && !(s === winner && type === 'hu')) {
          this.players[s].passHu = true;
          this.players[s].passHuKind = cl.k;
        }
      }
      this.claim = null;
      this.deadline = null;
      const k = cl.k;
      if (winner === null) {
        if (cl.robKong) return this.finishJiakong(cl.from);
        if (this.remaining() <= 0) return this.drawGame();
        this.stage = 'between';
        this.update();
        this.later(() => this.beginTurn((cl.from + 1) % this.N, false), 200);
        return;
      }
      if (type === 'hu') return this.winRon(winner, cl.from, k, cl.robKong);
      const p = this.players[winner];
      if (!this.players[cl.from].isAI) this.later(() => this.talk(winner, ['謝啦～這張我要了', '感恩喔', '剛好缺這張', '送得好！'], 0.35), 400);
      const from = this.players[cl.from];
      from.river[from.river.length - 1].taken = true;
      this.addRage(cl.from, 10);
      this.anyClaim = true;
      if (type === 'pong') {
        this.hook('onClaim', winner, 'pong');
        removeN(p.hand, k, 2);
        p.melds.push({ type: 'pong', k, from: cl.from });
        p.forbid = [k];
        this.event({ type: 'pong', seat: winner, k, from: cl.from });
        this.addLog(`${p.name} 碰 ${R.tileName(k)}`);
        this.enterDiscard(winner, false);
      } else if (type === 'kong') {
        removeN(p.hand, k, 3);
        p.melds.push({ type: 'mkong', k, from: cl.from });
        this.event({ type: 'kong', seat: winner, k, from: cl.from });
        this.addLog(`${p.name} 槓 ${R.tileName(k)}`);
        this.stage = 'between';
        this.update();
        this.later(() => this.beginTurn(winner, true, true), 500);
      } else if (type === 'chi') {
        removeN(p.hand, tiles[0], 1); removeN(p.hand, tiles[1], 1);
        const all = [tiles[0], tiles[1], k].sort((a, b) => a - b);
        p.melds.push({ type: 'chi', k: all[0], tiles: all, taken: k, from: cl.from });
        // 避免吃後打同張或筋牌
        const forbid = [k];
        if (all[0] === k && k + 3 < 27 && (k + 3) % 9 > k % 9) forbid.push(k + 3);
        if (all[2] === k && k - 3 >= 0 && (k - 3) % 9 < k % 9) forbid.push(k - 3);
        p.forbid = forbid;
        this.event({ type: 'chi', seat: winner, k, from: cl.from });
        this.addLog(`${p.name} 吃 ${R.tileName(k)}`);
        this.enterDiscard(winner, false);
      }
    }

    doAnkong(seat, k) {
      const p = this.players[seat];
      removeN(p.hand, k, 4);
      p.melds.push({ type: 'akong', k });
      p.lastDraw = null;
      this.pendingSelf = null;
      this.stage = 'between';
      this.event({ type: 'kong', seat, k, hidden: true });
      this.addLog(`${p.name} 暗槓`);
      this.update();
      this.later(() => this.beginTurn(seat, true, true), 500);
    }

    doJiakong(seat, k) {
      const p = this.players[seat];
      removeN(p.hand, k, 1);
      const m = p.melds.find(m => m.type === 'pong' && m.k === k);
      m.type = 'jkong';
      p.lastDraw = null;
      this.pendingSelf = null;
      this.event({ type: 'kong', seat, k });
      this.addLog(`${p.name} 加槓 ${R.tileName(k)}`);
      // 搶槓
      this.openClaim(seat, k, true);
    }
    finishJiakong(seat) {
      this.stage = 'between';
      this.update();
      this.later(() => this.beginTurn(seat, true, true), 400);
    }

    // ---------- 胡牌結算 ----------
    buildCtx(seat, winTile, selfDraw, extra) {
      const p = this.players[seat];
      const handWith = selfDraw ? p.hand.slice() : p.hand.concat([winTile]);
      const before = handWith.slice(); before.splice(before.indexOf(winTile), 1);
      const noClaims = !this.anyClaim;
      const isDealer = seat === this.dealer;
      return Object.assign({
        hand: handWith, melds: p.melds, flowers: p.flowers, winTile, selfDraw,
        seatWind: this.seatWind(seat), roundWind: this.roundWind,
        waitsCount: R.waits(before).length,
        lastTile: this.remaining() <= 0,
        kongDraw: selfDraw && this.kongDraw,
        tianhu: selfDraw && isDealer && noClaims && p.discards === 0,
        dihu: selfDraw && !isDealer && noClaims && p.discards === 0,
        renhu: !selfDraw && !isDealer && noClaims && p.discards === 0,
        ting: p.declared,
      }, extra || {});
    }

    scoreFor(seat, ctx) {
      const sc = R.score(ctx);
      const extra = this.hook('onScore', seat, sc, ctx);
      if (Array.isArray(extra) && extra.length) {
        sc.items = sc.items.concat(extra);
        sc.total = sc.items.reduce((x, i) => x + i[1], 0);
      }
      return sc;
    }
    winSelf(seat) {
      const p = this.players[seat];
      const k = p.lastDraw != null ? p.lastDraw : p.hand[p.hand.length - 1];
      const sc = this.scoreFor(seat, this.buildCtx(seat, k, true));
      this.settle(seat, null, sc, { selfDraw: true, tile: k });
    }
    winRon(seat, from, k, robKong) {
      const sc = this.scoreFor(seat, this.buildCtx(seat, k, false, { robKong: !!robKong }));
      if (robKong) {
        // 被搶槓：把加槓還原成碰
        const fp = this.players[from];
        const m = fp.melds.find(m => m.type === 'jkong' && m.k === k);
        if (m) m.type = 'pong';
      } else {
        const fp = this.players[from];
        if (fp.river.length) fp.river[fp.river.length - 1].taken = true;
      }
      this.players[seat].hand.push(k);
      this.settle(seat, from, sc, { selfDraw: false, tile: k, robKong });
    }
    // 勝利卡：達成條件直接算自摸
    altWin(seat, name, tai) {
      if (this.phase !== 'play') return;
      this.settle(seat, null, { items: [[name, tai]], total: tai }, { selfDraw: true, special: 'alt', altName: name });
    }
    winSpecial(seat, special, from) {
      const sc = this.scoreFor(seat, { special, flowers: this.players[seat].flowers, seatWind: this.seatWind(seat) });
      this.settle(seat, from, sc, { selfDraw: from === null, special });
    }

    settle(winner, loser, sc, info) {
      this.clearTimers();
      this.phase = 'ended';
      this.stage = 'ended';
      this.claim = null;
      this.pendingSelf = null;
      this.deadline = null;
      const { base, perTai } = this.settings;
      const dealerTai = 1 + 2 * this.lian;
      const payers = loser === null ? this.seats().filter(s => s !== winner) : [loser];
      const deltas = new Array(this.N).fill(0);
      const lines = [];
      // 抓馬：從牌尾翻牌，對到胡牌者的方位就加倍
      const horses = [];
      for (let i = 0; i < (this.settings.zhuama || 0) && this.tail >= this.head; i++) {
        const hk = this.wall[this.tail--];
        const seatH = (this.dealer + horseOffset(hk)) % this.N;
        horses.push({ k: hk, seat: seatH, hit: seatH === winner });
      }
      const doubled = !!(this.players[winner].fx && this.players[winner].fx.double);
      const mult = (1 + horses.filter(h => h.hit).length) * (doubled ? 2 : 1);
      let goldSaved = null;
      for (const s of payers) {
        const involvesDealer = winner === this.dealer || s === this.dealer;
        const tai = sc.total + (involvesDealer ? dealerTai : 0);
        const amt = (base + tai * perTai) * mult;
        // 免死金牌：放槍不用付，由銀行代付
        if (loser !== null && this.players[s].fx && this.players[s].fx.gold) { this.players[s].fx.gold = false; goldSaved = s; }
        else deltas[s] -= amt;
        deltas[winner] += amt;
        lines.push({ seat: s, tai, amt });
      }
      this.hook('onSettle', { winner, loser, deltas, selfDraw: loser === null, tai: sc.total, tile: info.tile });
      for (let s = 0; s < this.N; s++) this.players[s].score += deltas[s];
      const dealerItems = [];
      if (winner === this.dealer || payers.includes(this.dealer)) {
        dealerItems.push(['莊家', 1]);
        if (this.lian > 0) dealerItems.push([`連${this.lian}拉${this.lian}`, 2 * this.lian]);
      }
      if (loser === null) this.stats[winner].zimo++; else { this.stats[winner].hu++; this.stats[loser].pao++; }
      this.result = {
        type: 'win', winner, loser, selfDraw: loser === null, tile: info.tile, special: info.special || null, altName: info.altName || null,
        items: sc.items, tai: sc.total, dealerItems, lines, deltas, horses, mult, doubled, goldSaved,
        hands: this.players.map(p => ({ hand: R.sortTiles(p.hand), melds: p.melds, flowers: p.flowers })),
      };
      const w = this.players[winner];
      this.addLog(loser === null ? `${w.name} 自摸！` : `${w.name} 胡牌！${this.pname(loser)} 放槍`);
      this.event({ type: loser === null ? 'zimo' : 'hu', seat: winner, k: info.tile, from: loser });
      if (loser === null) this.later(() => this.talk(winner, ['自摸啦！三家付錢～', '手氣真好，拍謝啦', '自己摸的最香！'], 1), 300);
      else if (!this.players[loser].isAI) this.later(() => this.talk(winner, ['這也敢打？送你啦！', '謝謝老闆！', '放槍了喔～', '就等你這張！'], 1), 300);
      else this.later(() => this.talk(winner, ['謝謝老闆！', '就等這張！'], 0.6), 300);
      if (loser !== null) this.addRage(loser, 30);
      else for (const s of payers) this.addRage(s, 20);
      this.afterHand(winner === this.dealer);
    }

    drawGame() {
      this.clearTimers();
      this.phase = 'ended';
      this.stage = 'ended';
      this.claim = null;
      this.pendingSelf = null;
      this.deadline = null;
      this.result = {
        type: 'draw', deltas: new Array(this.N).fill(0),
        hands: this.players.map(p => ({ hand: R.sortTiles(p.hand), melds: p.melds, flowers: p.flowers })),
      };
      this.addLog('流局');
      this.event({ type: 'drawgame' });
      this.afterHand(true);
    }

    afterHand(stay) {
      // 決定下一局莊家與圈風
      if (stay) {
        this.nextDealer = this.dealer; this.nextLian = this.lian + 1;
        this.nextRound = this.roundWind; this.nextMoves = this.dealerMoves;
      } else {
        this.nextDealer = (this.dealer + 1) % this.N; this.nextLian = 0;
        this.nextMoves = this.dealerMoves + 1;
        this.nextRound = Math.floor(this.nextMoves / this.N);
      }
      this.result.willEnd = this.nextRound >= this.settings.rounds;
      if (this.result.willEnd) {
        this.gameOver = true;
        this.result.final = this.players.map((p, i) => ({ seat: i, name: p.name, score: p.score, ...this.stats[i] }))
          .sort((a, b) => b.score - a.score);
      }
      for (const p of this.players) p.ready = p.isAI || !p.connected;
      this.update();
      if (!this.gameOver) {
        const t = this.settings.nextHandTime;
        if (t > 0) this.later(() => this.nextHand(), t * 1000);
        this.checkAllReady();
      }
    }

    checkAllReady() {
      if (this.gameOver || this.phase !== 'ended') return;
      for (const p of this.players) if (p.isAI || !p.connected) p.ready = true;
      this.update();
      if (this.players.every(p => p.ready)) this.later(() => this.nextHand(), 300);
    }

    nextHand() {
      if (this.phase !== 'ended' || this.gameOver) return;
      this.dealer = this.nextDealer; this.lian = this.nextLian;
      this.roundWind = this.nextRound; this.dealerMoves = this.nextMoves;
      this.startHand();
    }

    // 託管 / 斷線時，讓電腦接手目前該做的事
    kick(seat) {
      if (this.phase === 'ended') return this.checkAllReady();
      if (this.phase === 'play' && this.stage === 'prep' && this.isBot(seat) && !this.players[seat].prepDone) {
        this.players[seat].prepDone = true; this.checkPrep(); return;
      }
      if (this.phase !== 'play' || !this.isBot(seat)) return;
      if (this.stage === 'discard' && this.turn === seat) this.later(() => this.botDiscardTurn(seat), 300);
      if (this.stage === 'claim' && this.claim && this.claim.responders[seat] && !this.claim.responders[seat].response) {
        this.later(() => this.botClaim(seat), 300);
      }
    }

    // ---------- 給某座位看的畫面資料 ----------
    view(seat) {
      const ended = this.phase === 'ended';
      const me = this.players[seat];
      let myHand = null, drawn = null;
      if (me && me.hand) {
        myHand = R.sortTiles(me.hand);
        if (me.lastDraw != null && this.stage === 'discard' && this.turn === seat) {
          myHand.splice(myHand.indexOf(me.lastDraw), 1);
          drawn = me.lastDraw;
        }
      }
      let options = [];
      let claimOpen = false;
      if (this.phase === 'play') {
        if (this.stage === 'discard' && this.turn === seat && this.pendingSelf) options = this.pendingSelf.options;
        if (this.stage === 'claim' && this.claim && this.claim.responders[seat] && !this.claim.responders[seat].response) {
          options = this.claim.responders[seat].options;
          claimOpen = true;
        }
      }
      // 相公模式：不告訴真人能不能胡
      if (this.settings.xianggong && me && !me.isAI) options = options.filter(o => o.type !== 'hu' && o.type !== 'zimo');
      return {
        seat, handNo: this.handNo, phase: this.phase, stage: this.stage, turn: this.turn,
        dealer: this.dealer, roundWind: this.roundWind, lian: this.lian,
        remaining: this.wall ? Math.max(0, this.remaining()) : 0,
        deadlineIn: this.deadline ? Math.max(0, this.deadline - Date.now()) : null,
        claimTile: this.claim ? { k: (this.lastDiscard && this.lastDiscard.ink && this.claim.from !== seat && !this.claim.robKong) ? null : this.claim.k, from: this.claim.from, robKong: this.claim.robKong } : null,
        lastDiscard: this.lastDiscard && this.lastDiscard.ink && this.lastDiscard.seat !== seat && !ended ? { seat: this.lastDiscard.seat, k: null, ink: true } : this.lastDiscard,
        hand: myHand, drawn, options, claimOpen, forbid: me && me.forbid,
        players: this.players.map((p, i) => ({
          name: p.name, isAI: p.isAI, auto: p.auto, connected: p.connected, score: p.score, ready: p.ready,
          seatWind: this.seatWind(i), handCount: p.hand ? p.hand.length : 0,
          melds: (p.melds || []).map(m => (m.type === 'akong' && i !== seat && !ended) ? { type: 'akong', k: null } : m),
          flowers: p.flowers || [],
          river: (p.river || []).map(r => (r.ink && i !== seat && !ended) ? { k: null, ink: true, taken: r.taken } : r),
          waiting: this.claim && this.claim.responders[i] ? !this.claim.responders[i].response : false,
          declared: p.declared || null, xiang: !!p.xiang,
          qi: p.qi || 0, prepDone: !!p.prepDone, char: p.char, rage: p.rage || 0, awake: !!p.awake,
          hand: (ended || !me || i === seat) ? undefined : ((me.readAll || (me.readTarget === i && me.discards < me.readUntil)) ? R.sortTiles(p.hand) : undefined),
          fx: p.fx ? {
            noClaim: this.noClaim(p) ? p.fx.noClaimUntil - p.discards : 0,
            noHu: this.noHu(p), freeze: p.fx.freeze, shield: p.fx.shield, double: p.fx.double,
            luck: p.fx.luck ? (i === seat ? p.fx.luck : 'hidden') : null, luckLeft: i === seat ? p.fx.luckLeft : 0,
            fog: this.fogged(p), flip: this.flipped(p), slip: p.fx.slip, bad: p.fx.badLeft > 0, gold: p.fx.gold,
            ink: i === seat ? p.fx.inkLeft : 0,
            shieldN: p.fx.shield | 0, anyChi: p.discards < (p.fx.anyChiUntil || 0), noDealIn: !!p.fx.noDealIn,
          } : null,
        })),
        result: ended ? this.result : null,
        gameOver: this.gameOver,
        log: this.log.slice(-6),
        settings: { rounds: this.settings.rounds, base: this.settings.base, perTai: this.settings.perTai,
          xianggong: !!this.settings.xianggong, guoshui: this.settings.guoshui, zhuama: this.settings.zhuama || 0 },
        xiangMode: !!this.settings.xianggong && !!me && !me.isAI,
        metaView: me && me.metaView ? me.metaView : null,
        cards: me && me.cardState ? CD.viewFor(this, seat) : null,
        barrier: this.barrier || null,
        skills: !!this.settings.skills,
        used: me && me.used ? Object.keys(me.used) : [],
        peek: me && me.peekQueue ? me.peekQueue.slice() : null,
        safe: me && me.safeInfo ? me.safeInfo.danger : null,
        swapInfo: me && me.swapInfo ? me.swapInfo : null,
        forceNext: me && me.forceNext != null ? me.forceNext : null,
        wallAvail: (me && this.settings.skills && this.stage === 'discard' && this.turn === seat && !me.used.cuopai && me.qi >= SKILL_COST.cuopai) ? this.wallCounts() : null,
        prices: { double: this.shopPrice('double'), shield: this.shopPrice('shield'), pack: this.shopPrice('pack'), gold: this.shopPrice('gold'), swapEach: SHOP.swapEach * this.settings.perTai, freeSwap: this.freeSwap(seat), maxSwap: SHOP.maxSwap },
        skillCost: SKILL_COST,
      };
    }
  }

  // 抓馬對應方位：1、5、9、東、中、春、梅 為莊家位，依序往下家數
  function horseOffset(k) {
    if (k < 27) return (k % 9) % 4;
    if (k <= 30) return k - 27;
    if (k <= 33) return k - 31;
    return (k - 34) % 4;
  }
  function removeN(arr, k, n) {
    for (let i = 0; i < n; i++) { const j = arr.indexOf(k); if (j >= 0) arr.splice(j, 1); }
  }
  function meldTiles(m) {
    if (m.type === 'chi') return m.tiles;
    if (m.type === 'pong') return [m.k, m.k, m.k];
    return [m.k, m.k, m.k, m.k];
  }

  return { Game, meldTiles, SKILL_COST, SHOP, LUCK, PACKS };
});
