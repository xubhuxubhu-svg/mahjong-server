/**
 * 台灣16張麻將 — 規則引擎 v1
 * ------------------------------------------------
 * 這份檔案只處理「規則邏輯」，不含畫面、連線、技能系統。
 * 目標：先把胡牌判定＋基本台數計算做到完全正確，
 * 之後所有系統（技能、連線、特效）都會建立在這個引擎之上。
 *
 * 牌的代號規則：
 *   萬/筒/索：數字 + 字母，例如 "1m" "5p" "9s"
 *   風牌：W_E（東）W_S（南）W_W（西）W_N（北）
 *   三元牌：D_ZHONG（中）D_FA（發）D_BAI（白）
 *   花牌：FL_1 ~ FL_8（春夏秋冬梅蘭竹菊）
 */

// ---------- 一、牌組定義 ----------

const SUITS = ["m", "p", "s"]; // 萬 筒 索
const WINDS = ["W_E", "W_S", "W_W", "W_N"];
const DRAGONS = ["D_ZHONG", "D_FA", "D_BAI"];
const FLOWERS = ["FL_1", "FL_2", "FL_3", "FL_4", "FL_5", "FL_6", "FL_7", "FL_8"];

/** 建立完整144張牌（不分洗牌順序） */
function buildFullWall() {
  const wall = [];
  // 萬筒索 1~9，各4張
  for (const suit of SUITS) {
    for (let n = 1; n <= 9; n++) {
      for (let k = 0; k < 4; k++) wall.push(`${n}${suit}`);
    }
  }
  // 風牌 東南西北，各4張
  for (const w of WINDS) {
    for (let k = 0; k < 4; k++) wall.push(w);
  }
  // 三元牌 中發白，各4張
  for (const d of DRAGONS) {
    for (let k = 0; k < 4; k++) wall.push(d);
  }
  // 花牌 8張，各1張
  for (const f of FLOWERS) wall.push(f);

  // 總數應為 136 + 8 = 144
  return wall;
}

function isFlower(tile) {
  return tile.startsWith("FL_");
}
function isHonor(tile) {
  return tile.startsWith("W_") || tile.startsWith("D_");
}
function isSuited(tile) {
  return !isFlower(tile) && !isHonor(tile);
}
function suitOf(tile) {
  return isSuited(tile) ? tile.slice(-1) : null;
}
function numberOf(tile) {
  return isSuited(tile) ? parseInt(tile.slice(0, -1), 10) : null;
}

// ---------- 二、胡牌判定 ----------
// 台灣16張：手牌16張 + 胡的那張 = 17張，需拆成「5組面子（順子或刻子）+ 1組對子」
// 花牌不計入這17張，花牌一律補牌，另外計台。

/**
 * 判斷牌是否為胡牌型態。
 * tiles：手牌（不含已公開的吃/碰/槓組合，也不含花牌）
 * requiredSets：還需要湊幾組面子（預設5，若已經吃/碰/槓過幾組，
 *               每組固定佔1個面子額度，這裡就要減少對應數量）
 * 回傳 false，或回傳一組可能的拆解結果陣列
 */
function isWinningHand(tiles, requiredSets = 5) {
  const expectedLength = requiredSets * 3 + 2;
  if (tiles.length !== expectedLength) return false;
  const results = [];
  const counts = countTiles(tiles);
  const uniqueTiles = Object.keys(counts);

  for (const pairTile of uniqueTiles) {
    if (counts[pairTile] >= 2) {
      const afterPair = { ...counts };
      afterPair[pairTile] -= 2;
      const sets = [];
      if (tryDecompose(afterPair, sets, requiredSets)) {
        results.push({ pair: [pairTile, pairTile], sets: sets.map(s => ({ ...s })) });
      }
    }
  }

  return results.length > 0 ? results : false;
}

/** 把 counts 遞迴拆成 remain 組面子（順子或刻子），成功則把拆法塞進 sets 並回傳 true */
function tryDecompose(counts, sets, remain) {
  if (remain === 0) {
    return Object.values(counts).every(c => c === 0);
  }
  const tile = Object.keys(counts).find(t => counts[t] > 0);
  if (!tile) return false;

  // 嘗試刻子（三張相同）
  if (counts[tile] >= 3) {
    counts[tile] -= 3;
    sets.push({ type: "刻", tiles: [tile, tile, tile] });
    if (tryDecompose(counts, sets, remain - 1)) return true;
    sets.pop();
    counts[tile] += 3;
  }

  // 嘗試順子（僅限萬筒索，數字連續3張，風牌／三元牌不能組順）
  if (isSuited(tile)) {
    const suit = suitOf(tile);
    const num = numberOf(tile);
    if (num <= 7) {
      const t2 = `${num + 1}${suit}`;
      const t3 = `${num + 2}${suit}`;
      if ((counts[t2] || 0) > 0 && (counts[t3] || 0) > 0) {
        counts[tile] -= 1;
        counts[t2] -= 1;
        counts[t3] -= 1;
        sets.push({ type: "順", tiles: [tile, t2, t3] });
        if (tryDecompose(counts, sets, remain - 1)) return true;
        sets.pop();
        counts[tile] += 1;
        counts[t2] += 1;
        counts[t3] += 1;
      }
    }
  }

  return false;
}

function countTiles(tiles) {
  const counts = {};
  for (const t of tiles) counts[t] = (counts[t] || 0) + 1;
  return counts;
}

// ---------- 三、花牌處理 ----------
// 補花：摸到花牌要立刻亮出、另外補一張牌，直到補到非花牌為止。
// 花牌台數：一年四季（春夏秋冬四張湊齊）、四君子（梅蘭竹菊四張湊齊）、
//          花對正位（座位對應的那張花，例如東家摸到春/梅）等，此處先留函式框架。

const SEAT_FLOWER_MAP = {
  // 座位 -> 對應的季節花與君子花（依台灣常見版本：東=春/梅, 南=夏/蘭, 西=秋/竹, 北=冬/菊）
  W_E: ["FL_1", "FL_5"], // 春 梅
  W_S: ["FL_2", "FL_6"], // 夏 蘭
  W_W: ["FL_3", "FL_7"], // 秋 竹
  W_N: ["FL_4", "FL_8"], // 冬 菊
};

/** 計算花牌台數（先做基本版：正花+1台、四季+1台、四君子+1台、八仙過海+1台可疊加） */
function scoreFlowers(seatWind, flowerTiles) {
  let tai = 0;
  const detail = [];
  const owned = new Set(flowerTiles);

  // 正花：座位對應的兩張花，各+1台
  for (const f of SEAT_FLOWER_MAP[seatWind] || []) {
    if (owned.has(f)) {
      tai += 1;
      detail.push(`正花(${f}) +1台`);
    }
  }

  // 一年四季：FL_1~FL_4 全湊齊
  if (["FL_1", "FL_2", "FL_3", "FL_4"].every(f => owned.has(f))) {
    tai += 1;
    detail.push("一年四季 +1台");
  }

  // 四君子：FL_5~FL_8 全湊齊
  if (["FL_5", "FL_6", "FL_7", "FL_8"].every(f => owned.has(f))) {
    tai += 1;
    detail.push("四君子 +1台");
  }

  // 八仙過海：8張花全湊齊（此處先簡單疊加，實際規則可能更高台數，待確認）
  if (FLOWERS.every(f => owned.has(f))) {
    tai += 1;
    detail.push("八仙過海 +1台（暫定台數，待確認實際規則）");
  }

  return { tai, detail };
}

// ---------- 四、基本台數計算（先做常見、無爭議的項目） ----------
// 注意：台灣麻將台數規則各地版本略有差異（例如莊家倍數、連莊倍數、
// 某些牌型的台數多寡），以下先做最常見、爭議最小的一組，
// 之後要跟你確認採用哪個版本的完整台數表再補完。

function scoreBasic(handResult, context) {
  // handResult: isWinningHand() 回傳結果其中一組拆解
  // context: { isSelfDraw, isDealer, isConcealed, flowerTiles, seatWind, allTiles17 }
  let tai = 0;
  const detail = [];

  if (context.isConcealed) {
    tai += 1;
    detail.push("門清 +1台");
  }
  if (context.isSelfDraw) {
    tai += 1;
    detail.push("自摸 +1台");
  }

  // 對對胡：5組都是刻子
  if (handResult.sets.every(s => s.type === "刻")) {
    tai += 1;
    detail.push("對對胡 +1台（暫定台數）");
  }

  // 三暗刻／五暗刻（此處先僅用組成型態粗略判斷，實際「暗」刻需搭配吃碰記錄，
  // 待串接對局狀態後再精確化）
  const 刻子數 = handResult.sets.filter(s => s.type === "刻").length;
  if (刻子數 === 3) {
    tai += 2;
    detail.push("三暗刻 +2台（暫定，待確認是否需全為暗刻）");
  } else if (刻子數 >= 4) {
    tai += 8;
    detail.push("五暗刻/四暗刻 +8台（暫定，待確認台數與判定條件）");
  }

  // 清一色／混一色／字一色
  const allTiles = [...handResult.pair, ...handResult.sets.flatMap(s => s.tiles)];
  const suits = new Set(allTiles.filter(isSuited).map(suitOf));
  const hasHonor = allTiles.some(isHonor);
  if (allTiles.every(isHonor)) {
    tai += 8;
    detail.push("字一色 +8台（暫定台數）");
  } else if (suits.size === 1 && !hasHonor) {
    tai += 8;
    detail.push("清一色 +8台（暫定台數）");
  } else if (suits.size === 1 && hasHonor) {
    tai += 4;
    detail.push("混一色 +4台（暫定台數）");
  }

  // 花牌台數併入
  const flowerScore = scoreFlowers(context.seatWind, context.flowerTiles || []);
  tai += flowerScore.tai;
  detail.push(...flowerScore.detail);

  return { tai, detail };
}

// ---------- 五、連莊拉莊系統 ----------
// 規則（先採最普遍通用版本，待你確認慣用版本後再調）：
//   - 莊家胡牌，或流局（沒人胡牌）時，莊家連莊（連一、連二…）
//   - 莊家被別家胡走（莊家不是胡牌者），莊家換人，連莊數歸零
//   - 拉莊：連莊數每累積1，該局「非莊家胡到莊家」時，該局台數額外 +連莊數 台
//     （常見說法「拉一」「拉二」即指這個額外加成；此為簡化版本，
//      實際你慣用的桌若有不同算法——例如改成台數翻倍而非固定加台——請告知再調整）

/** 建立一局的莊家狀態 */
function createDealerState(initialDealerSeat) {
  return {
    dealerSeat: initialDealerSeat,
    continuousCount: 0, // 連莊數（0 表示尚未連莊，第一次連莊記為1）
  };
}

/**
 * 一局結束後更新莊家狀態
 * outcome: 'dealerWin'（莊家胡牌）| 'draw'（流局）| 'dealerLose'（莊家被非莊家胡走）
 * winnerNextDealerSeat: 若 outcome 為 dealerLose，換莊後的新莊家座位
 */
function advanceDealerState(state, outcome, winnerNextDealerSeat) {
  if (outcome === "dealerWin" || outcome === "draw") {
    state.continuousCount += 1;
  } else if (outcome === "dealerLose") {
    state.dealerSeat = winnerNextDealerSeat;
    state.continuousCount = 0;
  }
  return state;
}

/**
 * 計算拉莊額外台數
 * isDealerWinner: 這局胡牌的人是不是莊家本人
 * 規則：只有「非莊家胡到莊家所打出/自摸的牌」時才會有拉莊加成
 *      （莊家自己胡牌時，連莊本身已經是加成，這裡不重複計算，避免雙重加成）
 */
function computePullBonus(dealerState, isDealerWinner) {
  if (isDealerWinner) return { tai: 0, detail: [] };
  if (dealerState.continuousCount <= 0) return { tai: 0, detail: [] };
  return {
    tai: dealerState.continuousCount,
    detail: [`拉${dealerState.continuousCount} +${dealerState.continuousCount}台（暫定算法：固定加台，待確認是否應為倍數）`],
  };
}

// ---------- 六、過水限制 ----------
// 規則：玩家「過水」（明明能胡卻選擇不胡）之後，
//   在自己下一次打出一張牌之前，不能再胡別人打出的牌（但仍可以自摸胡）。
//   一旦自己打出任何一張牌，過水狀態解除。

/** 建立四個座位的過水狀態 */
function createPassState() {
  return {
    W_E: false,
    W_S: false,
    W_W: false,
    W_N: false,
  };
}

/** 玩家選擇過水（本可胡但不胡） */
function markPassed(passState, seat) {
  passState[seat] = true;
}

/** 玩家打出一張牌後，解除自己的過水狀態 */
function clearPassOnDiscard(passState, seat) {
  passState[seat] = false;
}

/**
 * 判斷某玩家現在能不能胡「別人打出的這張牌」
 * isSelfDraw 為 true（自摸）時不受過水限制，一律可以胡
 */
function canWinOnDiscard(passState, seat, isSelfDraw) {
  if (isSelfDraw) return true;
  return !passState[seat];
}

// ---------- 七、防相公系統 ----------
// 相公＝多牌、少牌、吃碰槓不符規則。以下提供驗證函式，
// 「防呆模式」＝畫面呼叫這些函式，不合法就不給點選；
// 「硬核模式」＝允許玩家操作，但事後用同一套函式判定是否相公、直接出局。

/**
 * 檢查玩家目前的牌數是否正確
 * concealedCount：手牌（未公開）張數，不含花牌
 * exposedSets：已公開的吃/碰/槓組合陣列，例如 [{type:'吃',tiles:[...]}, {type:'碰',tiles:[...]}]
 * phase：'beforeDraw'（尚未摸牌，應為16張扣掉已公開部分）| 'afterDraw'（摸牌後，應多1張）
 * 換算邏輯：每組「吃/碰」佔3張、「明槓/暗槓/加槓」佔4張但只算作1組面子（多的1張不計入16張基礎），
 *           所以有效基礎張數 = concealedCount + 吃碰數*3 + 槓數*3（槓多出的第4張是額外補牌，不計入基礎）
 */
function validateTileCount(concealedCount, exposedSets, phase) {
  const gangCount = exposedSets.filter(s => s.type === "槓").length;
  const otherCount = exposedSets.filter(s => s.type !== "槓").length;
  // 實際物理牌數：吃/碰各3張，槓實際上是4張（多的1張是靠補牌換來的）
  const physicalExposed = otherCount * 3 + gangCount * 4;
  const totalPhysical = concealedCount + physicalExposed;

  const baseExpected = phase === "afterDraw" ? 17 : 16;
  // 每槓一次都會從死牌堆多補一張牌，所以基準也要跟著多1張
  const expectedPhysical = baseExpected + gangCount;

  if (totalPhysical !== expectedPhysical) {
    return {
      valid: false,
      reason: totalPhysical > expectedPhysical ? "多牌" : "少牌",
      expected: expectedPhysical,
      actual: totalPhysical,
    };
  }
  return { valid: true };
}

/**
 * 驗證「吃」是否合法
 * handTiles：玩家手牌（不含要吃的那張棄牌）
 * discardedTile：被吃的那張牌
 * chiCombo：玩家宣告要組成的三張牌（含discardedTile本身），例如 ["3m","4m","5m"]
 * fromSeat / selfSeat：吃牌規則限定只能吃「上家」打出的牌
 * seatOrder：座位順序陣列，用來判斷上家
 */
function validateChi(handTiles, discardedTile, chiCombo, fromSeat, selfSeat, seatOrder) {
  if (!chiCombo.includes(discardedTile)) {
    return { valid: false, reason: "組合中未包含被吃的那張牌" };
  }
  if (!isSuited(discardedTile)) {
    return { valid: false, reason: "風牌與三元牌不能吃" };
  }
  const suit = suitOf(discardedTile);
  const nums = chiCombo.map(numberOf).sort((a, b) => a - b);
  const sameSuit = chiCombo.every(t => isSuited(t) && suitOf(t) === suit);
  const isConsecutive = sameSuit && nums[1] === nums[0] + 1 && nums[2] === nums[1] + 1;
  if (!isConsecutive) {
    return { valid: false, reason: "三張牌必須是同花色的連續數字" };
  }

  // 只能吃上家的牌
  const selfIdx = seatOrder.indexOf(selfSeat);
  const upstreamSeat = seatOrder[(selfIdx + seatOrder.length - 1) % seatOrder.length];
  if (fromSeat !== upstreamSeat) {
    return { valid: false, reason: "只能吃上家打出的牌" };
  }

  // 手牌裡必須真的有另外兩張（扣掉discardedTile後剩下的兩張）
  const needed = countTiles(chiCombo.filter(t => t !== discardedTile || chiCombo.indexOf(t) !== chiCombo.lastIndexOf(t)));
  // 簡化作法：直接檢查扣除一張discardedTile後，剩下兩張是否都在手牌裡
  const remaining = [...chiCombo];
  remaining.splice(remaining.indexOf(discardedTile), 1);
  const handCounts = countTiles(handTiles);
  const remCounts = countTiles(remaining);
  for (const t of Object.keys(remCounts)) {
    if ((handCounts[t] || 0) < remCounts[t]) {
      return { valid: false, reason: `手牌中沒有足夠的 ${t} 可組成這組吃牌` };
    }
  }

  return { valid: true };
}

/** 驗證「碰」是否合法：手牌需有至少2張與棄牌相同的牌 */
function validatePeng(handTiles, discardedTile) {
  const count = handTiles.filter(t => t === discardedTile).length;
  if (count < 2) {
    return { valid: false, reason: `手牌中只有${count}張 ${discardedTile}，無法碰` };
  }
  return { valid: true };
}

/**
 * 驗證「槓」是否合法
 * type：'concealed'（暗槓，手牌自己湊4張）| 'exposed'（明槓，碰別人打出的第4張）| 'added'（加槓，已碰過再補自己摸到的第4張）
 */
function validateGang(handTiles, tile, type, existingPengSets) {
  if (type === "concealed") {
    const count = handTiles.filter(t => t === tile).length;
    if (count < 4) return { valid: false, reason: `手牌中只有${count}張 ${tile}，無法暗槓` };
    return { valid: true };
  }
  if (type === "exposed") {
    const count = handTiles.filter(t => t === tile).length;
    if (count < 3) return { valid: false, reason: `手牌中只有${count}張 ${tile}，無法明槓` };
    return { valid: true };
  }
  if (type === "added") {
    const hasPeng = (existingPengSets || []).some(s => s.type === "碰" && s.tiles[0] === tile);
    if (!hasPeng) return { valid: false, reason: "尚未碰過這張牌，無法加槓" };
    const count = handTiles.filter(t => t === tile).length;
    if (count < 1) return { valid: false, reason: "手牌中沒有可加槓的這張牌" };
    return { valid: true };
  }
  return { valid: false, reason: "未知的槓牌類型" };
}

module.exports = {
  buildFullWall,
  isFlower,
  isHonor,
  isSuited,
  suitOf,
  numberOf,
  isWinningHand,
  countTiles,
  scoreFlowers,
  scoreBasic,
  createDealerState,
  advanceDealerState,
  computePullBonus,
  createPassState,
  markPassed,
  clearPassOnDiscard,
  canWinOnDiscard,
  validateTileCount,
  validateChi,
  validatePeng,
  validateGang,
  SUITS,
  WINDS,
  DRAGONS,
  FLOWERS,
};
