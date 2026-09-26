// 台灣16張麻將：牌型、胡牌判定、聽牌、向聽數、台數計算
// 伺服器與瀏覽器共用
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.MJRules = m;
})(typeof self !== 'undefined' ? self : this, function () {
  // 牌種編號：0-8 萬、9-17 筒、18-26 條、27-30 東南西北、31 中 32 發 33 白、34-41 春夏秋冬梅蘭菊竹
  const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const SUIT = ['萬', '筒', '條'];
  const HONOR = ['東', '南', '西', '北', '中', '發', '白'];
  const FLOWER = ['春', '夏', '秋', '冬', '梅', '蘭', '菊', '竹'];
  const WIND = ['東', '南', '西', '北'];

  function tileName(k) {
    if (k < 27) return NUM[k % 9] + SUIT[Math.floor(k / 9)];
    if (k < 34) return HONOR[k - 27];
    return FLOWER[k - 34];
  }
  function tileImg(k) {
    if (k < 9) return 'MJw' + (k + 1);
    if (k < 18) return 'MJt' + (k - 8);
    if (k < 27) return 'MJs' + (k - 17);
    if (k < 31) return 'MJf' + (k - 26);
    if (k < 34) return 'MJd' + (k - 30);
    return 'MJh' + (k - 33);
  }
  const isSuit = (k) => k < 27;
  const isHonor = (k) => k >= 27 && k < 34;
  const isFlower = (k) => k >= 34;

  function makeWall(rng) {
    rng = rng || Math.random;
    const w = [];
    for (let k = 0; k < 34; k++) for (let i = 0; i < 4; i++) w.push(k);
    for (let k = 34; k < 42; k++) w.push(k);
    for (let i = w.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = w[i]; w[i] = w[j]; w[j] = t;
    }
    return w;
  }

  function toCounts(arr) {
    const c = new Array(34).fill(0);
    for (const k of arr) if (k < 34) c[k]++;
    return c;
  }
  function sortTiles(arr) { return arr.slice().sort((a, b) => a - b); }

  function meldsOnly(c, i) {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) return true;
    if (c[i] >= 3) {
      c[i] -= 3; const ok = meldsOnly(c, i); c[i] += 3;
      if (ok) return true;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      const ok = meldsOnly(c, i);
      c[i]++; c[i + 1]++; c[i + 2]++;
      if (ok) return true;
    }
    return false;
  }

  function isWinCounts(c) {
    let total = 0;
    for (let i = 0; i < 34; i++) total += c[i];
    if (total % 3 !== 2) return false;
    for (let i = 0; i < 34; i++) {
      if (c[i] >= 2) {
        c[i] -= 2;
        const ok = meldsOnly(c, 0);
        c[i] += 2;
        if (ok) return true;
      }
    }
    return false;
  }
  function isWin(tiles) { return isWinCounts(toCounts(tiles)); }

  // 聽哪些牌（tiles 為 3n+1 張）；exclude 為場上已見張數（可省略）
  function waits(tiles) {
    const c = toCounts(tiles);
    const res = [];
    for (let k = 0; k < 34; k++) {
      if (c[k] >= 4) continue;
      c[k]++;
      if (isWinCounts(c)) res.push(k);
      c[k]--;
    }
    return res;
  }

  // 所有拆法：{pair, melds:[{t:'pong'|'chi', k}]}
  function decompositions(tiles) {
    const c = toCounts(tiles);
    const out = [];
    function rec(i, cur, pair) {
      while (i < 34 && c[i] === 0) i++;
      if (i >= 34) { out.push({ pair, melds: cur.slice() }); return; }
      if (c[i] >= 3) {
        c[i] -= 3; cur.push({ t: 'pong', k: i }); rec(i, cur, pair); cur.pop(); c[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        cur.push({ t: 'chi', k: i }); rec(i, cur, pair); cur.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
    }
    for (let p = 0; p < 34; p++) {
      if (c[p] >= 2) { c[p] -= 2; rec(0, [], p); c[p] += 2; }
    }
    return out;
  }

  // 向聽數：n 為還需要的面子數。-1 代表已胡
  function shanten(tiles, n) { return shantenCounts(toCounts(tiles), n); }
  function shantenCounts(c, n) {
    let best = 2 * n;
    let m = 0, t = 0, head = 0;
    function dfs(i) {
      while (i < 34 && c[i] === 0) i++;
      if (i >= 34) {
        const tt = Math.min(t, n - m);
        const s = 2 * n - 2 * m - tt - head;
        if (s < best) best = s;
        return;
      }
      if (best === -1) return;
      if (m < n) {
        if (c[i] >= 3) { c[i] -= 3; m++; dfs(i); m--; c[i] += 3; }
        if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
          c[i]--; c[i + 1]--; c[i + 2]--; m++; dfs(i); m--; c[i]++; c[i + 1]++; c[i + 2]++;
        }
      }
      if (c[i] >= 2 && !head) { c[i] -= 2; head = 1; dfs(i); head = 0; c[i] += 2; }
      if (m + t < n) {
        if (c[i] >= 2) { c[i] -= 2; t++; dfs(i); t--; c[i] += 2; }
        if (i < 27 && i % 9 <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; t++; dfs(i); t--; c[i]++; c[i + 1]++; }
        if (i < 27 && i % 9 <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; t++; dfs(i); t--; c[i]++; c[i + 2]++; }
      }
      c[i]--; dfs(i); c[i]++;
    }
    dfs(0);
    return best;
  }

  // 花：座位 s（0東1南2西3北）對應 春夏秋冬 34+s、梅蘭菊竹 38+s
  function flowerItems(flowers, seatWind) {
    const items = [];
    const has = (k) => flowers.includes(k);
    const set1 = [34, 35, 36, 37].every(has);
    const set2 = [38, 39, 40, 41].every(has);
    if (set1) items.push(['花槓（春夏秋冬）', 2]);
    else if (has(34 + seatWind)) items.push(['花牌 ' + FLOWER[seatWind], 1]);
    if (set2) items.push(['花槓（梅蘭菊竹）', 2]);
    else if (has(38 + seatWind)) items.push(['花牌 ' + FLOWER[4 + seatWind], 1]);
    return items;
  }

  // 台數（不含莊家與連莊）
  // ctx: hand(暗手牌含胡的那張), melds[{type:'chi'|'pong'|'mkong'|'akong'|'jkong', k}], flowers, winTile,
  //      selfDraw, seatWind, roundWind, waitsCount, lastTile, kongDraw, robKong, tianhu, dihu, renhu, special
  function score(ctx) {
    const fItems = flowerItems(ctx.flowers || [], ctx.seatWind);
    if (ctx.special === 'bxgh') return finalize([['八仙過海', 8]].concat(fItems.filter(i => !i[0].startsWith('花槓'))));
    if (ctx.special === 'qqy') return finalize([['七搶一', 8]]);

    const exposed = ctx.melds || [];
    const decs = decompositions(ctx.hand);
    if (!decs.length) return finalize([['胡牌', 0]]);
    let bestRes = null;
    for (const d of decs) {
      const r = scoreDecomp(ctx, d, exposed, fItems);
      if (!bestRes || r.total > bestRes.total) bestRes = r;
    }
    return bestRes;
  }

  function finalize(items) {
    const total = items.reduce((s, i) => s + i[1], 0);
    return { items, total };
  }

  function scoreDecomp(ctx, d, exposed, fItems) {
    const items = [];
    const win = ctx.winTile;
    const ron = !ctx.selfDraw;
    const all = [];
    for (const m of exposed) {
      if (m.type === 'chi') all.push({ t: 'chi', k: m.k, concealed: false });
      else if (m.type === 'pong') all.push({ t: 'pong', k: m.k, concealed: false });
      else if (m.type === 'akong') all.push({ t: 'kong', k: m.k, concealed: true });
      else all.push({ t: 'kong', k: m.k, concealed: false });
    }
    const winInChi = d.melds.some(m => m.t === 'chi' && win >= m.k && win <= m.k + 2);
    for (const m of d.melds) {
      let concealed = true;
      if (m.t === 'pong' && ron && m.k === win && !winInChi && d.pair !== win) concealed = false;
      all.push({ t: m.t, k: m.k, concealed });
    }
    const pair = d.pair;
    const triplets = all.filter(m => m.t !== 'chi');
    const tripKinds = triplets.map(m => m.k);
    const exposedOpen = exposed.filter(m => m.type !== 'akong').length;
    const menqing = exposedOpen === 0;

    if (ctx.ting === 'tian') items.push(['天聽', 8]);
    else if (ctx.ting === 'di') items.push(['地聽', 4]);
    if (ctx.tianhu) items.push(['天胡', 24]);
    else if (ctx.dihu) items.push(['地胡', 16]);
    else if (ctx.renhu) items.push(['人胡', 16]);

    if (menqing && ctx.selfDraw) items.push(['門清自摸', 3]);
    else if (menqing) items.push(['門清', 1]);
    else if (ctx.selfDraw) items.push(['自摸', 1]);

    // 三元
    const dragonT = tripKinds.filter(k => k >= 31 && k <= 33).length;
    if (dragonT === 3) items.push(['大三元', 8]);
    else if (dragonT === 2 && pair >= 31 && pair <= 33) items.push(['小三元', 4]);
    else for (const k of tripKinds) if (k >= 31 && k <= 33) items.push(['三元牌 ' + HONOR[k - 27], 1]);

    // 風
    const windT = tripKinds.filter(k => k >= 27 && k <= 30).length;
    if (windT === 4) items.push(['大四喜', 16]);
    else if (windT === 3 && pair >= 27 && pair <= 30) items.push(['小四喜', 8]);
    else {
      if (tripKinds.includes(27 + ctx.roundWind)) items.push(['圈風 ' + WIND[ctx.roundWind], 1]);
      if (tripKinds.includes(27 + ctx.seatWind)) items.push(['門風 ' + WIND[ctx.seatWind], 1]);
    }

    if (all.every(m => m.t !== 'chi')) items.push(['碰碰胡', 4]);

    const anke = all.filter(m => m.t !== 'chi' && m.concealed).length;
    if (anke >= 5) items.push(['五暗刻', 8]);
    else if (anke === 4) items.push(['四暗刻', 5]);
    else if (anke === 3) items.push(['三暗刻', 2]);

    // 花色
    const kinds = all.map(m => m.k).concat([pair]);
    const suits = new Set(kinds.filter(k => k < 27).map(k => Math.floor(k / 9)));
    const honors = kinds.some(k => k >= 27);
    if (suits.size === 0) items.push(['字一色', 16]);
    else if (suits.size === 1 && !honors) items.push(['清一色', 8]);
    else if (suits.size === 1 && honors) items.push(['混一色', 4]);

    // 平胡
    const noFlower = !(ctx.flowers && ctx.flowers.length);
    if (all.every(m => m.t === 'chi') && !honors && noFlower && ron && ctx.waitsCount >= 2) items.push(['平胡', 2]);

    // 求人
    let quan = false;
    if (exposedOpen === 5 && ron) { items.push(['全求人', 2]); quan = true; }
    else if (exposedOpen === 5 && ctx.selfDraw) items.push(['半求人', 1]);

    if (ctx.waitsCount === 1 && !quan) items.push(['獨聽', 1]);

    if (ctx.lastTile && ctx.selfDraw) items.push(['海底撈月', 1]);
    if (ctx.lastTile && ron) items.push(['河底撈魚', 1]);
    if (ctx.kongDraw && ctx.selfDraw) items.push(['槓上開花', 1]);
    if (ctx.robKong) items.push(['搶槓', 1]);

    for (const f of fItems) items.push(f);
    return finalize(items);
  }

  return {
    tileName, tileImg, isSuit, isHonor, isFlower, makeWall, toCounts, sortTiles,
    isWin, isWinCounts, waits, decompositions, shanten, shantenCounts, score, flowerItems,
    WIND, FLOWER,
  };
});
