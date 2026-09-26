// 卡牌構築（冒險模式）：技能卡、法術卡、陷阱卡、結界卡、勝利卡
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const R = isNode ? require('./rules') : root.MJRules;
  const m = factory(R);
  if (isNode) module.exports = m; else root.MJCards = m;
})(typeof self !== 'undefined' ? self : this, function (R) {
  const rnd = Math.random;
  const TYPES = {
    skill: { name: '技能卡', color: '#3b7bd8' }, spell: { name: '法術卡', color: '#2d9a6a' }, trap: { name: '陷阱卡', color: '#a8332a' },
    field: { name: '結界卡', color: '#8a4fd0' }, win: { name: '勝利卡', color: '#d9a23a' },
  };
  // need：target 選對手、luck 選牌型、cuopai 轉輪、swap 選對手再選手牌
  const LIST = [
    // 技能卡（沿用原本的技能）
    ['cuopai', 'skill', '搓牌', 8, 2, '轉輪選一張，下一張就摸到它', { skill: 'cuopai', need: 'cuopai' }],
    ['luck', 'skill', '氣運值', 4, 0, '選牌型，接下來 5 巡較容易摸到', { skill: 'luck', need: 'luck' }],
    ['peek', 'skill', '神算', 3, 0, '偷看自己接下來要摸的 3 張', { skill: 'peek' }],
    ['m_noclaim', 'skill', '禁吃碰飛彈', 3, 0, '指定對手 3 巡不能吃、碰、槓', { skill: 'missile', kind: 'noclaim', need: 'target' }],
    ['m_freeze', 'skill', '定身飛彈', 5, 1, '指定對手跳過下一巡', { skill: 'missile', kind: 'freeze', need: 'target' }],
    ['m_nohu', 'skill', '禁胡飛彈', 6, 1, '指定對手下一巡內不能胡', { skill: 'missile', kind: 'nohu', need: 'target' }],
    ['d_fog', 'skill', '迷霧', 3, 0, '指定對手 3 巡看不清手牌', { skill: 'debuff', kind: 'fog', need: 'target' }],
    ['d_flip', 'skill', '顛倒', 3, 0, '指定對手 3 巡牌面倒過來', { skill: 'debuff', kind: 'flip', need: 'target' }],
    ['d_slip', 'skill', '手滑', 4, 1, '指定對手下一張打出隨機的牌', { skill: 'debuff', kind: 'slip', need: 'target' }],
    ['d_bad', 'skill', '霉運', 5, 1, '指定對手接下來 3 張摸牌變差', { skill: 'debuff', kind: 'bad', need: 'target' }],
    ['swaptile', 'skill', '換牌術', 5, 1, '拿一張手牌跟對手隨機一張交換', { skill: 'swaptile', need: 'swap' }],
    ['safe', 'skill', '安全感應', 4, 0, '手牌亮綠光安全、紅光會放槍', { skill: 'safe' }],
    ['ink', 'skill', '隱形墨水', 2, 0, '接下來 3 張打出的牌別人看不到', { skill: 'ink' }],
    // 法術卡（新效果）
    ['qi3', 'spell', '補氣', 0, 0, '立刻 +3 氣', {}],
    ['guard', 'spell', '護身', 3, 0, '得到一層防護罩', {}],
    ['cleanse', 'spell', '淨化', 2, 0, '清除自己身上所有負面狀態', {}],
    ['wave', 'spell', '牌浪', 2, 0, '手上最沒用的 3 張換成牌牆裡隨機的牌', {}],
    ['fogall', 'spell', '大霧', 5, 1, '所有對手中迷霧 2 巡', {}],
    ['chain', 'spell', '同色連鎖', 3, 1, '接下來 4 巡，摸牌偏向你手上最多的花色', {}],
    ['tsumo', 'spell', '摸打詛咒', 4, 1, '指定對手 3 巡摸到什麼就打什麼', { need: 'target' }],
    ['breakting', 'spell', '破聽', 4, 1, '取消指定對手的報聽', { need: 'target' }],
    ['double', 'spell', '雙倍奉還', 4, 2, '這局你胡牌，輸贏加倍', {}],
    // 陷阱卡（蓋著，條件成立時自動發動；最多同時放 2 張，整場都有效）
    ['t_mirror', 'trap', '反射鏡', 3, 0, '下一次被攻擊時，反彈回攻擊的人', {}],
    ['t_mine', 'trap', '地雷', 3, 1, '下一個吃、碰、槓你的牌的人，氣清空並定身', {}],
    ['t_revenge', 'trap', '以牙還牙', 4, 1, '下一次被攻擊時擋下，並讓對方中霉運', {}],
    ['t_ambush', 'trap', '埋伏', 5, 2, '下一個報聽的對手，報聽立刻被取消', {}],
    // 結界卡（這一局所有人都受影響，包含你）
    ['f_nopong', 'field', '禁碰結界', 5, 1, '這局所有人都不能碰、槓', {}],
    ['f_nochi', 'field', '禁吃結界', 3, 0, '這局所有人都不能吃', {}],
    ['f_flush', 'field', '一色結界', 6, 2, '這局只有清一色、混一色、字一色才能胡', {}],
    ['f_closed', 'field', '門清結界', 5, 1, '這局有吃、碰、明槓的人不能胡', {}],
    // 勝利卡（這局達成條件就直接算你自摸）
    ['w_yaojiu', 'win', '么九王', 6, 1, '這局打出 4 張么九或字牌都沒被吃碰，直接胡 5 台', {}],
    ['w_dragon', 'win', '三元王', 6, 2, '這局手上（含碰）同時有中、發、白各 3 張，直接胡 8 台', {}],
    ['w_flower', 'win', '花開富貴', 5, 1, '這局你拿到 5 張以上花牌，直接胡 6 台', {}],
  ];
  const CARDS = {};
  LIST.forEach(([id, type, name, cost, rare, desc, x]) => { CARDS[id] = Object.assign({ id, type, name, cost, rare, desc }, x); });
  const STARTER = ['cuopai', 'luck', 'peek', 'm_noclaim', 'd_fog', 'safe', 'qi3', 'qi3', 'guard', 't_mirror'];
  const DECK_MIN = 10, DECK_MAX = 15, COPY_MAX = 2, HAND_MAX = 5;
  const PRICE = [80, 150, 260];

  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function drawCards(st, n) {
    for (let i = 0; i < n && st.hand.length < HAND_MAX; i++) {
      if (!st.pile.length) { if (!st.used.length) break; st.pile = shuffle(st.used); st.used = []; }
      st.hand.push(st.pile.pop());
    }
  }
  const isYaojiu = (k) => k >= 27 || k % 9 === 0 || k % 9 === 8;
  function lone(p) {
    const c = R.toCounts(p.hand);
    const score = (k) => { let n = c[k] * 3; if (k < 27) for (const d of [-2, -1, 1, 2]) { const j = k + d; if (j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(k / 9)) n += c[j]; } return n; };
    return [...new Set(p.hand)].sort((a, b) => score(a) - score(b));
  }
  function swapWall(g, p, outK, pred) {
    const js = []; for (let j = g.head; j <= g.tail; j++) if (g.wall[j] < 34 && pred(g.wall[j])) js.push(j);
    if (!js.length) return false;
    const j = js[Math.floor(rnd() * js.length)]; const got = g.wall[j]; g.wall[j] = outK;
    p.hand.splice(p.hand.indexOf(outK), 1); p.hand.push(got); p.hand.sort((a, b) => a - b);
    if (p.lastDraw != null && !p.hand.includes(p.lastDraw)) p.lastDraw = null;
    return true;
  }
  function allTiles(p, extra) {
    const t = p.hand.slice().concat(extra || []);
    for (const m of p.melds) { if (m.type === 'chi') t.push(...m.tiles); else t.push(m.k, m.k, m.k); }
    return t;
  }

  // 牌局規則調整（持有卡牌組的玩家，冒險模式是座位 0）
  function buildMod(game, deck) {
    const SEAT = 0;
    const st = { pile: shuffle(deck.filter(id => CARDS[id])), hand: [], used: [], traps: [], drawN: 0, alt: null, altCount: 0, lastMine: null, chain: 0 };
    const me = () => game.players[SEAT];
    return {
      onHandStart() {
        const p = me();
        p.cardState = st;
        st.alt = null; st.altCount = 0; st.lastMine = null; st.chain = 0; st.drawN = 0;
        drawCards(st, 3);
      },
      onDraw(seat, k, g) {
        if (seat === SEAT) {
          st.drawN++;
          if (st.drawN % 4 === 0) drawCards(st, 1);
          const p = me();
          if (st.alt === 'w_dragon') {
            const c = R.toCounts(allTiles(p));
            if (c[31] >= 3 && c[32] >= 3 && c[33] >= 3) g.later(() => g.altWin(SEAT, '三元王', 8), 0);
          }
        }
        // 么九王：我上一張打出的么九字牌沒被吃碰，就算一張
        if (st.alt === 'w_yaojiu' && st.lastMine) {
          const r = me().river[st.lastMine.idx];
          if (r && !r.taken && isYaojiu(r.k)) {
            st.altCount++;
            g.event({ type: 'altprog', seat: SEAT, n: st.altCount, need: 4 });
            if (st.altCount >= 4) g.later(() => g.altWin(SEAT, '么九王', 5), 0);
          }
          st.lastMine = null;
        }
      },
      drawPred(seat, g) {
        if (seat === SEAT && st.chain > 0) {
          st.chain--;
          const c = R.toCounts(me().hand);
          const suit = [0, 1, 2].map(x => c.slice(x * 9, x * 9 + 9).reduce((a, b) => a + b, 0));
          const b = suit.indexOf(Math.max(...suit));
          if (rnd() < 0.7) return (x) => x < 27 && Math.floor(x / 9) === b;
        }
        return null;
      },
      onTargeted(att, tgt, g) {
        if (tgt !== SEAT) return undefined;
        const i = st.traps.findIndex(t => t === 't_mirror' || t === 't_revenge');
        if (i < 0) return undefined;
        const t = st.traps.splice(i, 1)[0];
        g.event({ type: 'trap', seat: SEAT, card: t, target: att });
        if (t === 't_revenge') { g.players[att].fx.badLeft = 3; return 'block'; }
        return 'reflect';
      },
      noChi() { return game.barrier && game.barrier.id === 'f_nochi'; },
      noPong() { return game.barrier && game.barrier.id === 'f_nopong'; },
      huBlock(seat, hand) {
        const b = game.barrier; if (!b) return false;
        const p = game.players[seat];
        if (b.id === 'f_closed') return p.melds.some(m => m.type !== 'akong');
        if (b.id === 'f_flush') {
          const t = allTiles(p).concat(hand.slice(p.hand.length));
          const suits = new Set(t.filter(k => k < 27).map(k => Math.floor(k / 9)));
          return suits.size > 1;
        }
        return false;
      },
      onEvent(ev, g) {
        const p = me();
        if (ev.type === 'discard' && ev.seat === SEAT) st.lastMine = { idx: p.river.length - 1 };
        if ((ev.type === 'pong' || ev.type === 'chi' || ev.type === 'kong') && ev.from === SEAT && ev.seat !== SEAT) {
          const i = st.traps.indexOf('t_mine');
          if (i >= 0) { st.traps.splice(i, 1); const q = g.players[ev.seat]; q.qi = 0; q.fx.freeze = true; g.event({ type: 'trap', seat: SEAT, card: 't_mine', target: ev.seat }); }
        }
        if (ev.type === 'ting' && ev.seat !== SEAT) {
          const i = st.traps.indexOf('t_ambush');
          if (i >= 0) { st.traps.splice(i, 1); g.players[ev.seat].declared = null; g.event({ type: 'trap', seat: SEAT, card: 't_ambush', target: ev.seat }); }
        }
        if (ev.type === 'flower' && ev.seat === SEAT && st.alt === 'w_flower' && p.flowers.length >= 5) g.later(() => g.altWin(SEAT, '花開富貴', 6), 0);
      },
    };
  }

  // 摸打詛咒：被詛咒的電腦摸什麼打什麼（在牌局的電腦出牌前檢查）
  function forcedDiscard(game, seat) {
    const p = game.players[seat];
    if (p.fx && p.fx.tsumoUntil > p.discards && p.lastDraw != null) return p.lastDraw;
    return null;
  }

  function play(game, seat, a) {
    const p = game.players[seat];
    const st = p.cardState;
    if (!st || !game.settings.skills) return false;
    if (game.stage !== 'discard' || game.turn !== seat) return false;
    const idx = a.idx;
    const id = st.hand[idx];
    const c = CARDS[id];
    if (!c) return false;
    const pay = Math.max(0, c.cost - (game.hook('skillDiscount', seat, 'card') || 0));
    const target = a.target;
    if (c.need === 'target' && !(target >= 0 && target < 4 && target !== seat)) return false;
    let ok = true;
    if (c.type === 'skill') {
      ok = game.useSkill(seat, Object.assign({}, a, { id: c.skill, kind: c.kind, _card: true }));
      if (!ok) return false;
    } else {
      if (p.qi < pay) return false;
      if (c.type === 'trap' && st.traps.length >= 2) return false;
      if (c.type === 'field' && game.barrier) return false;
      if (c.type === 'win' && st.alt) return false;
      p.qi -= pay;
      const guard = () => game.targetGuard(seat, target);
      switch (id) {
        case 'qi3': p.qi = Math.min(10, p.qi + 3); break;
        case 'guard': p.fx.shield = (p.fx.shield | 0) + 1; break;
        case 'cleanse': Object.assign(p.fx, { fogUntil: 0, flipUntil: 0, slip: false, badLeft: 0, noClaimUntil: 0, noHuUntil: 0, freeze: false }); break;
        case 'wave': { let n = 0; for (const k of lone(p)) { if (n >= 3) break; if (swapWall(game, p, k, (x) => x !== k)) n++; } break; }
        case 'fogall': for (let o = 0; o < game.players.length; o++) if (o !== seat && !game.targetGuard(seat, o)) game.players[o].fx.fogUntil = game.players[o].discards + 2; break;
        case 'chain': st.chain = 4; break;
        case 'tsumo': if (!guard()) game.players[target].fx.tsumoUntil = game.players[target].discards + 3; break;
        case 'breakting': if (!guard()) game.players[target].declared = null; break;
        case 'double': p.fx.double = true; break;
        default:
          if (c.type === 'trap') st.traps.push(id);
          else if (c.type === 'field') game.barrier = { id, name: c.name, owner: seat, desc: c.desc };
          else if (c.type === 'win') { st.alt = id; st.altCount = 0; }
      }
      game.event({ type: 'card', seat, card: id, target: c.need === 'target' ? target : null });
      game.addLog(`${p.name} 打出卡牌「${c.name}」`);
    }
    st.hand.splice(idx, 1);
    st.used.push(id);
    game.update();
    return true;
  }

  function viewFor(game, seat) {
    const st = game.players[seat].cardState;
    return { hand: st.hand.slice(), pile: st.pile.length, used: st.used.length, traps: st.traps.slice(), alt: st.alt, altCount: st.altCount };
  }

  return { CARDS, LIST: LIST.map(x => x[0]), TYPES, STARTER, DECK_MIN, DECK_MAX, COPY_MAX, HAND_MAX, PRICE, buildMod, play, viewFor, forcedDiscard };
});
