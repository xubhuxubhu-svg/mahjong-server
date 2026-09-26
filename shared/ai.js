// 電腦玩家：以向聽數與進張數決定出牌、吃碰槓
(function (root, factory) {
  const R = (typeof module === 'object' && module.exports) ? require('./rules') : root.MJRules;
  const m = factory(R);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.MJAI = m;
})(typeof self !== 'undefined' ? self : this, function (R) {

  // visible: 長度34的已見張數（河、明牌、自己手牌）
  function ukeire(c, n, visible, base) {
    let total = 0;
    for (let k = 0; k < 34; k++) {
      const left = 4 - visible[k];
      if (left <= 0) continue;
      c[k]++;
      const s = R.shantenCounts(c, n);
      c[k]--;
      if (s < base) total += left;
    }
    return total;
  }

  // 挑出要打的牌。forbid：不可打的牌種（避免吃碰後打同張）
  function chooseDiscard(hand, meldsCount, visible, opts) {
    opts = opts || {};
    const n = 5 - meldsCount;
    const c = R.toCounts(hand);
    const kinds = [...new Set(hand)];
    let cands = [];
    for (const k of kinds) {
      if (opts.forbid && opts.forbid.includes(k) && kinds.length > 1) continue;
      c[k]--;
      const s = R.shantenCounts(c, n);
      c[k]++;
      cands.push({ k, s });
    }
    if (!cands.length) cands = kinds.map(k => ({ k, s: 9 }));
    const minS = Math.min(...cands.map(x => x.s));
    let best = null;
    for (const x of cands) {
      if (x.s !== minS) continue;
      c[x.k]--;
      const u = ukeire(c, n, visible, x.s);
      c[x.k]++;
      // 安全度：場上已見越多越安全；字牌、么九優先打
      let safety = visible[x.k] * 0.6;
      if (x.k >= 27) safety += 1.2 + (opts.valuable && opts.valuable.includes(x.k) ? -1.5 : 0);
      else if (x.k % 9 === 0 || x.k % 9 === 8) safety += 0.5;
      const val = u * 10 + safety + Math.random() * 0.3;
      if (!best || val > best.val) best = { k: x.k, val };
    }
    return best.k;
  }

  function bestAfterRemove(hand, remove, meldsCount, visible) {
    const h = hand.slice();
    for (const r of remove) { const i = h.indexOf(r); if (i >= 0) h.splice(i, 1); }
    // 吃碰後要打一張，看打完的最佳向聽
    const n = 5 - meldsCount;
    const c = R.toCounts(h);
    let best = 99;
    for (const k of new Set(h)) {
      c[k]--; const s = R.shantenCounts(c, n); c[k]++;
      if (s < best) best = s;
    }
    return best;
  }

  // 面對別人打出的牌要不要吃碰槓胡
  // options: [{type:'hu'}|{type:'pong'}|{type:'kong'}|{type:'chi', tiles:[a,b]}]
  function chooseClaim(ctx, options) {
    if (options.some(o => o.type === 'hu')) return { type: 'hu' };
    const { hand, meldsCount, visible, tile, valuable } = ctx;
    const n = 5 - meldsCount;
    const cur = R.shanten(hand, n);
    let choice = { type: 'pass' };
    let bestS = cur;
    const kongOpt = options.find(o => o.type === 'kong');
    if (kongOpt) {
      // 明槓：不影響向聽就槓
      const h = hand.filter(k => k !== tile);
      const s = R.shanten(h, n - 1);
      if (s <= cur) return { type: 'kong' };
    }
    const pongOpt = options.find(o => o.type === 'pong');
    if (pongOpt) {
      const s = bestAfterRemove(hand, [tile, tile], meldsCount + 1, visible);
      const isValuable = valuable && valuable.includes(tile);
      if ((s < bestS && (cur <= 3 || isValuable)) || (isValuable && s <= bestS)) { bestS = s; choice = { type: 'pong' }; }
    }
    for (const o of options.filter(o => o.type === 'chi')) {
      const s = bestAfterRemove(hand, o.tiles, meldsCount + 1, visible);
      if (s < bestS && cur <= 2) { bestS = s; choice = { type: 'chi', tiles: o.tiles }; }
    }
    return choice;
  }

  // 自己回合的特殊動作：自摸、暗槓、加槓
  function chooseSelf(ctx, options) {
    if (options.some(o => o.type === 'zimo')) return { type: 'zimo' };
    const { hand, meldsCount } = ctx;
    const n = 5 - meldsCount;
    const cur = R.shanten(hand, n);
    for (const o of options) {
      if (o.type === 'ankong') {
        const h = hand.filter(k => k !== o.k);
        if (R.shanten(h, n - 1) <= cur) return o;
      }
      if (o.type === 'jiakong') {
        const h = hand.slice(); h.splice(h.indexOf(o.k), 1);
        if (R.shanten(h, n) <= cur) return o;
      }
    }
    return null;
  }

  return { chooseDiscard, chooseClaim, chooseSelf };
});
