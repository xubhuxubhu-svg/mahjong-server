/**
 * 台灣16張麻將 — 房間與對局流程管理（純邏輯層，不含網路）
 * ------------------------------------------------
 * 設計理念：把「連線層」（之後接 socket.io）跟「遊戲邏輯層」分開，
 *          這樣邏輯層可以直接寫測試驗證，不需要真的開連線就能確認對不對，
 *          之後 server.js 只是薄薄一層，把 socket 事件轉呼叫這裡的函式，
 *          再把這裡發出的事件（EventEmitter）轉發給對應的玩家。
 *
 * 一個 Room 代表一桌四人（AI或真人混合），管理座位、對局狀態、
 * 呼叫規則引擎（rules_engine.js）做胡牌/台數/連莊拉莊/過水判定。
 */

const EventEmitter = require("events");
const {
  isFlower,
  isSuited,
  suitOf,
  numberOf,
  isWinningHand,
  countTiles,
  scoreBasic,
  createDealerState,
  advanceDealerState,
  computePullBonus,
  createPassState,
  markPassed,
  clearPassOnDiscard,
  canWinOnDiscard,
  validatePeng,
  validateGang,
  buildFullWall,
} = require("./rules_engine");

const SEAT_ORDER = ["W_E", "W_S", "W_W", "W_N"];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextSeat(seat) {
  const idx = SEAT_ORDER.indexOf(seat);
  return SEAT_ORDER[(idx + 1) % SEAT_ORDER.length];
}

/** 找出手牌能與 tile 組成哪些合法的吃牌組合（可能不只一種） */
function findChiOptions(hand, tile) {
  if (!isSuited(tile)) return [];
  const suit = suitOf(tile);
  const num = numberOf(tile);
  const counts = countTiles(hand);
  const options = [];
  const patterns = [
    [num - 2, num - 1],
    [num - 1, num + 1],
    [num + 1, num + 2],
  ];
  for (const [a, b] of patterns) {
    if (a < 1 || b > 9) continue;
    const ta = `${a}${suit}`;
    const tb = `${b}${suit}`;
    if ((counts[ta] || 0) > 0 && (counts[tb] || 0) > 0) {
      options.push([ta, tile, tb].sort((x, y) => numberOf(x) - numberOf(y)));
    }
  }
  return options;
}

/** 從手牌陣列中移除指定的幾張牌（就地修改），若手牌沒有該牌則丟出錯誤 */
function removeTilesFromHand(hand, tiles) {
  for (const t of tiles) {
    const idx = hand.indexOf(t);
    if (idx === -1) throw new Error(`手牌中沒有 ${t}，無法完成這個操作`);
    hand.splice(idx, 1);
  }
}

/** 手牌是否仍算「門清」：只要沒有吃/碰/明槓，暗槓不影響門清狀態 */
function isHandConcealed(exposedSets) {
  return exposedSets.every(s => s.concealed === true);
}

class Room extends EventEmitter {
  constructor(roomId, options = {}) {
    super();
    this.roomId = roomId;
    this.aiDelayMs = options.aiDelayMs || 0; // AI「思考」停頓時間，0表示不停頓（方便自動化測試用）
    this.seats = {
      W_E: null,
      W_S: null,
      W_W: null,
      W_N: null,
    }; // { type: 'human'|'ai', playerId, name }
    this.dealerState = null;
    this.passState = null;
    this.engine = null; // { wall, wallIndex, hands, flowers, discardPile }
    this.currentSeat = null;
    this.phase = "lobby"; // lobby | awaiting_action | awaiting_win_decision | round_over | game_over
    this.pendingWinQueue = [];
    this.pendingDiscard = null; // { seat, tile }
    this.pendingCallOffer = null; // { seat, type:'peng'|'gang'|'chi', tile, discardSeat, options? }
    this.roundNumber = 0;
    this.lastRoundResult = null;
  }

  addHuman(seat, playerId, name) {
    if (this.seats[seat]) throw new Error(`座位 ${seat} 已經有人`);
    this.seats[seat] = { type: "human", playerId, name };
    this.emit("seatsUpdated", this.getSeatsSummary());
  }

  addAI(seat, name = "電腦玩家") {
    if (this.seats[seat]) throw new Error(`座位 ${seat} 已經有人`);
    this.seats[seat] = { type: "ai", playerId: null, name };
    this.emit("seatsUpdated", this.getSeatsSummary());
  }

  getSeatsSummary() {
    const out = {};
    for (const s of SEAT_ORDER) {
      out[s] = this.seats[s] ? { type: this.seats[s].type, name: this.seats[s].name } : null;
    }
    return out;
  }

  allSeatsFilled() {
    return SEAT_ORDER.every(s => this.seats[s] !== null);
  }

  /** 開始整場遊戲（第一局），固定東家為初始莊家 */
  startGame() {
    if (!this.allSeatsFilled()) throw new Error("四個座位都要填滿才能開始遊戲");
    this.dealerState = createDealerState("W_E");
    this.startRound();
  }

  /** 開始新的一局（發牌、補花、莊家多摸一張） */
  startRound() {
    this.roundNumber += 1;
    this.passState = createPassState();
    this.engine = this._initRound(this.dealerState.dealerSeat);
    this.currentSeat = this.dealerState.dealerSeat;
    this.phase = "awaiting_action";
    this.pendingWinQueue = [];
    this.pendingDiscard = null;
    this.pendingCallOffer = null;

    this.emit("roundStarted", {
      roundNumber: this.roundNumber,
      dealerSeat: this.dealerState.dealerSeat,
      continuousCount: this.dealerState.continuousCount,
    });

    this._beginTurn(this.currentSeat, /* alreadyDrawn = */ true);
  }

  _initRound(dealerSeat) {
    const wall = shuffle(buildFullWall());
    let wallIndex = 0;
    const hands = {};
    const flowers = {};
    const exposedSets = {};
    for (const seat of SEAT_ORDER) {
      hands[seat] = [];
      flowers[seat] = [];
      exposedSets[seat] = [];
    }
    for (const seat of SEAT_ORDER) {
      while (hands[seat].length < 16) {
        const tile = wall[wallIndex++];
        if (isFlower(tile)) flowers[seat].push(tile);
        else hands[seat].push(tile);
      }
    }
    // 莊家多摸一張準備開局第一次棄牌
    while (true) {
      const tile = wall[wallIndex++];
      if (isFlower(tile)) {
        flowers[dealerSeat].push(tile);
      } else {
        hands[dealerSeat].push(tile);
        break;
      }
    }
    return { wall, wallIndex, hands, flowers, exposedSets, discardPile: [] };
  }

  _drawTile(seat) {
    const e = this.engine;
    while (e.wallIndex < e.wall.length) {
      const tile = e.wall[e.wallIndex++];
      if (isFlower(tile)) {
        e.flowers[seat].push(tile);
        continue;
      }
      e.hands[seat].push(tile);
      return tile;
    }
    return null; // 牌牆已空
  }

  /**
   * 開始某座位的回合。alreadyDrawn=true 表示手上牌數已經到位（開局莊家、
   * 或剛吃/碰完要立刻棄牌的情況），否則要先幫這家摸一張牌。
   */
  _beginTurn(seat, alreadyDrawn) {
    this.currentSeat = seat;

    if (!alreadyDrawn) {
      const drawn = this._drawTile(seat);
      if (drawn === null) {
        this._resolveRoundEnd({ outcome: "draw", winnerSeat: null });
        return;
      }
    }

    this._presentTurnState(seat);
  }

  /** 手牌已經到位（摸完牌，或剛吃/碰/槓完），檢查自摸或交給AI／通知真人 */
  _presentTurnState(seat) {
    const seatInfo = this.seats[seat];
    const hand = this.engine.hands[seat];
    const requiredSets = 5 - this.engine.exposedSets[seat].length;
    const canSelfWin = isWinningHand(hand, requiredSets) !== false;

    if (seatInfo.type === "ai") {
      this._aiTakeTurn(seat, canSelfWin);
      return;
    }

    this.phase = "awaiting_action";
    this.emit("turnStarted", {
      seat,
      hand: [...hand],
      exposedSets: this.engine.exposedSets[seat],
      canDeclareSelfWin: canSelfWin,
    });
  }

  /** 簡化版AI回合決策：能自摸就自摸，否則隨機棄牌（之後可替換成真正策略） */
  _aiTakeTurn(seat, canSelfWin) {
    const run = () => {
      if (canSelfWin) {
        this._resolveSelfWin(seat);
        return;
      }
      const hand = this.engine.hands[seat];
      const idx = Math.floor(Math.random() * hand.length);
      const tile = hand.splice(idx, 1)[0];
      this._doDiscard(seat, tile);
    };
    if (this.aiDelayMs > 0) setTimeout(run, this.aiDelayMs);
    else run();
  }

  /** 玩家（真人）宣告自摸胡牌 */
  declareSelfWin(seat) {
    if (this.phase !== "awaiting_action" || this.currentSeat !== seat) {
      throw new Error("現在不是你可以自摸的時機");
    }
    const requiredSets = 5 - this.engine.exposedSets[seat].length;
    if (isWinningHand(this.engine.hands[seat], requiredSets) === false) {
      throw new Error("目前手牌不成胡牌型，不能宣告自摸");
    }
    this._resolveSelfWin(seat);
  }

  _resolveSelfWin(seat) {
    const requiredSets = 5 - this.engine.exposedSets[seat].length;
    const winCheck = isWinningHand(this.engine.hands[seat], requiredSets);
    const score = scoreBasic(winCheck[0], {
      isConcealed: isHandConcealed(this.engine.exposedSets[seat]),
      isSelfDraw: true,
      seatWind: seat,
      flowerTiles: this.engine.flowers[seat],
    });
    this._resolveRoundEnd({
      outcome: seat === this.dealerState.dealerSeat ? "dealerWin" : "dealerLose",
      winnerSeat: seat,
      isSelfDraw: true,
      tai: score.tai,
      detail: score.detail,
    });
  }

  /** 玩家（真人）棄牌 */
  requestDiscard(seat, tile) {
    if (this.phase !== "awaiting_action" || this.currentSeat !== seat) {
      throw new Error("現在不是你的棄牌時機");
    }
    const hand = this.engine.hands[seat];
    const idx = hand.indexOf(tile);
    if (idx === -1) throw new Error("手牌中沒有這張牌");
    hand.splice(idx, 1);
    this._doDiscard(seat, tile);
  }

  _doDiscard(seat, tile) {
    this.engine.discardPile.push({ seat, tile });
    this.emit("tileDiscarded", { seat, tile });

    const candidates = [];
    for (let offset = 1; offset < SEAT_ORDER.length; offset++) {
      const otherSeat = SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + offset) % SEAT_ORDER.length];
      if (!canWinOnDiscard(this.passState, otherSeat, false)) continue;
      const requiredSets = 5 - this.engine.exposedSets[otherSeat].length;
      const candidateHand = [...this.engine.hands[otherSeat], tile];
      if (isWinningHand(candidateHand, requiredSets) !== false) {
        candidates.push(otherSeat);
      }
    }

    this.pendingDiscard = { seat, tile };
    this.pendingWinQueue = candidates;
    this._processNextWinCandidate();
  }

  _processNextWinCandidate() {
    if (this.pendingWinQueue.length === 0) {
      this._checkCallOpportunities();
      return;
    }

    const seat = this.pendingWinQueue[0];
    const seatInfo = this.seats[seat];

    if (seatInfo.type === "ai") {
      // 簡化版AI：能胡就胡（之後可加入「保留更高台數」的判斷）
      if (this.aiDelayMs > 0) setTimeout(() => this._resolveWinOnDiscard(seat), this.aiDelayMs);
      else this._resolveWinOnDiscard(seat);
      return;
    }

    this.phase = "awaiting_win_decision";
    this.emit("winOffer", { seat, tile: this.pendingDiscard.tile, fromSeat: this.pendingDiscard.seat });
  }

  /** 玩家（真人）宣告胡別人打出的牌 */
  declareWinOnDiscard(seat) {
    if (this.phase !== "awaiting_win_decision" || this.pendingWinQueue[0] !== seat) {
      throw new Error("現在不是你可以胡這張牌的時機");
    }
    this._resolveWinOnDiscard(seat);
  }

  /** 玩家（真人）選擇過水（本可胡但不胡） */
  passWinOnDiscard(seat) {
    if (this.phase !== "awaiting_win_decision" || this.pendingWinQueue[0] !== seat) {
      throw new Error("現在不是輪到你決定要不要胡的時機");
    }
    markPassed(this.passState, seat);
    this.pendingWinQueue.shift();
    this._processNextWinCandidate();
  }

  // ---------- 胡牌之後：碰／槓／吃的優先權處理 ----------
  // 優先權：胡 > 碰／槓 > 吃（吃只能是棄牌者的下家）

  _checkCallOpportunities() {
    clearPassOnDiscard(this.passState, this.pendingDiscard.seat);
    const { seat: discardSeat, tile } = this.pendingDiscard;

    const pengGang = this._findPengGangCandidate(discardSeat, tile);
    if (pengGang) {
      const seatInfo = this.seats[pengGang.seat];
      if (seatInfo.type === "ai") {
        // AI 目前版本一律不主動碰／槓別人的棄牌（先求流程穩定，
        // 之後可依「能不能讓牌型更好」加入真正判斷）
        this._checkChiOpportunity(discardSeat, tile);
        return;
      }
      this.phase = "awaiting_call_decision";
      this.pendingCallOffer = { seat: pengGang.seat, type: pengGang.type, tile, discardSeat };
      this.emit("callOffer", { ...this.pendingCallOffer });
      return;
    }

    this._checkChiOpportunity(discardSeat, tile);
  }

  _findPengGangCandidate(discardSeat, tile) {
    // 先找槓（3張在手，湊棄牌成第4張），優先權比碰高
    for (let offset = 1; offset < SEAT_ORDER.length; offset++) {
      const seat = SEAT_ORDER[(SEAT_ORDER.indexOf(discardSeat) + offset) % SEAT_ORDER.length];
      const count = this.engine.hands[seat].filter(t => t === tile).length;
      if (count >= 3) return { seat, type: "gang" };
    }
    for (let offset = 1; offset < SEAT_ORDER.length; offset++) {
      const seat = SEAT_ORDER[(SEAT_ORDER.indexOf(discardSeat) + offset) % SEAT_ORDER.length];
      const count = this.engine.hands[seat].filter(t => t === tile).length;
      if (count >= 2) return { seat, type: "peng" };
    }
    return null;
  }

  _checkChiOpportunity(discardSeat, tile) {
    const seat = nextSeat(discardSeat);
    const seatInfo = this.seats[seat];
    const options = findChiOptions(this.engine.hands[seat], tile);

    if (options.length > 0 && seatInfo.type === "human") {
      this.phase = "awaiting_call_decision";
      this.pendingCallOffer = { seat, type: "chi", tile, discardSeat, options };
      this.emit("callOffer", { ...this.pendingCallOffer });
      return;
    }

    // AI 目前版本一律不主動吃牌，或沒有可吃的組合，直接輪到下家正常摸牌
    this._beginTurn(nextSeat(discardSeat), false);
  }

  /** 玩家（真人）宣告碰別人打出的牌 */
  declarePeng(seat) {
    this._assertCallOffer(seat, "peng");
    const { tile } = this.pendingCallOffer;
    const hand = this.engine.hands[seat];
    const check = validatePeng(hand, tile);
    if (!check.valid) throw new Error(check.reason);

    removeTilesFromHand(hand, [tile, tile]);
    this.engine.exposedSets[seat].push({ type: "碰", tiles: [tile, tile, tile] });
    this.pendingCallOffer = null;
    this.emit("meldFormed", { seat, type: "碰", tiles: [tile, tile, tile] });
    this._beginTurn(seat, true);
  }

  /** 玩家（真人）宣告明槓（碰別人打出的牌湊成第4張） */
  declareGangFromDiscard(seat) {
    this._assertCallOffer(seat, "gang");
    const { tile } = this.pendingCallOffer;
    const hand = this.engine.hands[seat];
    const check = validateGang(hand, tile, "exposed");
    if (!check.valid) throw new Error(check.reason);

    removeTilesFromHand(hand, [tile, tile, tile]);
    this.engine.exposedSets[seat].push({ type: "槓", tiles: [tile, tile, tile, tile] });
    this.pendingCallOffer = null;
    this.emit("meldFormed", { seat, type: "槓", tiles: [tile, tile, tile, tile] });

    this.currentSeat = seat;
    const drawn = this._drawTile(seat);
    if (drawn === null) {
      this._resolveRoundEnd({ outcome: "draw", winnerSeat: null });
      return;
    }
    this._presentTurnState(seat);
  }

  /** 玩家（真人）宣告吃牌，chiCombo為三張牌組合（需與offer中的options其中一組相同） */
  declareChi(seat, chiCombo) {
    this._assertCallOffer(seat, "chi");
    const { tile, options } = this.pendingCallOffer;
    const sorted = [...chiCombo].sort();
    const matched = options.find(opt => [...opt].sort().every((t, i) => t === sorted[i]));
    if (!matched) throw new Error("不是合法的吃牌組合");

    const hand = this.engine.hands[seat];
    const remaining = [...matched];
    remaining.splice(remaining.indexOf(tile), 1);
    removeTilesFromHand(hand, remaining);
    this.engine.exposedSets[seat].push({ type: "吃", tiles: [...matched] });
    this.pendingCallOffer = null;
    this.emit("meldFormed", { seat, type: "吃", tiles: [...matched] });
    this._beginTurn(seat, true);
  }

  /** 玩家（真人）放棄這次碰／槓／吃的機會 */
  declineCall(seat) {
    this._assertCallOffer(seat, null);
    const { type, discardSeat, tile } = this.pendingCallOffer;
    this.pendingCallOffer = null;
    if (type === "peng" || type === "gang") {
      this._checkChiOpportunity(discardSeat, tile);
    } else {
      this._beginTurn(nextSeat(discardSeat), false);
    }
  }

  _assertCallOffer(seat, expectedType) {
    if (
      this.phase !== "awaiting_call_decision" ||
      !this.pendingCallOffer ||
      this.pendingCallOffer.seat !== seat ||
      (expectedType && this.pendingCallOffer.type !== expectedType)
    ) {
      throw new Error("現在不是你可以做這個操作的時機");
    }
  }

  /** 玩家（真人）在自己回合宣告暗槓（手牌自己湊滿4張） */
  declareConcealedGang(seat, tile) {
    if (this.phase !== "awaiting_action" || this.currentSeat !== seat) {
      throw new Error("現在不是你可以暗槓的時機");
    }
    const hand = this.engine.hands[seat];
    const check = validateGang(hand, tile, "concealed");
    if (!check.valid) throw new Error(check.reason);

    removeTilesFromHand(hand, [tile, tile, tile, tile]);
    this.engine.exposedSets[seat].push({ type: "槓", tiles: [tile, tile, tile, tile], concealed: true });
    this.emit("meldFormed", { seat, type: "暗槓", tiles: [tile, tile, tile, tile], concealed: true });

    const drawn = this._drawTile(seat);
    if (drawn === null) {
      this._resolveRoundEnd({ outcome: "draw", winnerSeat: null });
      return;
    }
    this._presentTurnState(seat);
  }

  /** 玩家（真人）在自己回合宣告加槓（已經碰過，補摸到第4張時升級成槓） */
  declareAddedGang(seat, tile) {
    if (this.phase !== "awaiting_action" || this.currentSeat !== seat) {
      throw new Error("現在不是你可以加槓的時機");
    }
    const hand = this.engine.hands[seat];
    const check = validateGang(hand, tile, "added", this.engine.exposedSets[seat]);
    if (!check.valid) throw new Error(check.reason);

    removeTilesFromHand(hand, [tile]);
    const pengIdx = this.engine.exposedSets[seat].findIndex(s => s.type === "碰" && s.tiles[0] === tile);
    this.engine.exposedSets[seat][pengIdx] = { type: "槓", tiles: [tile, tile, tile, tile], addedFrom: "碰" };
    this.emit("meldFormed", { seat, type: "加槓", tiles: [tile, tile, tile, tile] });
    // 注意：正式規則中加槓有可能被別家「搶槓」胡牌，這個版本先不處理，之後再補

    const drawn = this._drawTile(seat);
    if (drawn === null) {
      this._resolveRoundEnd({ outcome: "draw", winnerSeat: null });
      return;
    }
    this._presentTurnState(seat);
  }

  _resolveWinOnDiscard(seat) {
    const requiredSets = 5 - this.engine.exposedSets[seat].length;
    const candidateHand = [...this.engine.hands[seat], this.pendingDiscard.tile];
    const winCheck = isWinningHand(candidateHand, requiredSets);
    const score = scoreBasic(winCheck[0], {
      isConcealed: isHandConcealed(this.engine.exposedSets[seat]),
      isSelfDraw: false,
      seatWind: seat,
      flowerTiles: this.engine.flowers[seat],
    });
    this._resolveRoundEnd({
      outcome: seat === this.dealerState.dealerSeat ? "dealerWin" : "dealerLose",
      winnerSeat: seat,
      isSelfDraw: false,
      tai: score.tai,
      detail: score.detail,
    });
  }

  _resolveRoundEnd(result) {
    let pullBonus = { tai: 0, detail: [] };
    if (result.winnerSeat) {
      const isDealerWinner = result.winnerSeat === this.dealerState.dealerSeat;
      pullBonus = computePullBonus(this.dealerState, isDealerWinner);
    }

    const dealerBefore = this.dealerState.dealerSeat;
    advanceDealerState(
      this.dealerState,
      result.outcome,
      result.outcome === "dealerLose" ? result.winnerSeat : undefined
    );

    this.phase = "round_over";
    const payload = {
      roundNumber: this.roundNumber,
      outcome: result.outcome,
      winnerSeat: result.winnerSeat || null,
      isSelfDraw: result.isSelfDraw || false,
      tai: (result.tai || 0) + pullBonus.tai,
      detail: [...(result.detail || []), ...pullBonus.detail],
      dealerBefore,
      dealerAfter: this.dealerState.dealerSeat,
      continuousAfter: this.dealerState.continuousCount,
    };
    this.lastRoundResult = payload;
    this.emit("roundEnded", payload);
  }

  /** 房主／畫面按下「繼續下一局」時呼叫 */
  nextRound() {
    if (this.phase !== "round_over") throw new Error("目前這局還沒結束，不能開下一局");
    this.startRound();
  }

  // ---------- 儲存／讀取進度 ----------
  // 設計重點（參考大富翁專案踩過的坑）：
  //   1. 存檔要用「座位＋名字」認回身分，不能用socket連線id，因為重連後id一定不同
  //   2. 讀取存檔時要沿用同一個房間代碼，方便其他還在線上的玩家不用重新輸入代碼
  //   3. 復原時要依照「目前正在等哪個座位做什麼動作」重新把對應事件送給認回身分的玩家，
  //      不然畫面會卡住不知道要幹嘛（例如正在等他決定要不要碰牌，重連後要再問一次）

  /** 把整個房間狀態轉成一個可以存起來、之後可以還原的純資料物件 */
  serialize() {
    const seatsSnapshot = {};
    for (const seat of SEAT_ORDER) {
      seatsSnapshot[seat] = this.seats[seat]
        ? { type: this.seats[seat].type, name: this.seats[seat].name }
        : null;
    }
    return {
      roomId: this.roomId,
      seats: seatsSnapshot,
      dealerState: this.dealerState ? { ...this.dealerState } : null,
      passState: this.passState ? { ...this.passState } : null,
      engine: this.engine
        ? {
            wall: [...this.engine.wall],
            wallIndex: this.engine.wallIndex,
            hands: JSON.parse(JSON.stringify(this.engine.hands)),
            flowers: JSON.parse(JSON.stringify(this.engine.flowers)),
            exposedSets: JSON.parse(JSON.stringify(this.engine.exposedSets)),
            discardPile: [...this.engine.discardPile],
          }
        : null,
      currentSeat: this.currentSeat,
      phase: this.phase,
      pendingWinQueue: [...this.pendingWinQueue],
      pendingDiscard: this.pendingDiscard,
      pendingCallOffer: this.pendingCallOffer,
      roundNumber: this.roundNumber,
      lastRoundResult: this.lastRoundResult,
    };
  }

  /** 從存檔資料重建一個房間（座位沿用同樣的名字／AI設定，真人要重新認領座位） */
  static fromSnapshot(snapshot) {
    const room = new Room(snapshot.roomId);
    for (const seat of SEAT_ORDER) {
      const s = snapshot.seats[seat];
      if (s) {
        room.seats[seat] = { type: s.type, playerId: null, name: s.name };
      }
    }
    room.dealerState = snapshot.dealerState;
    room.passState = snapshot.passState;
    room.engine = snapshot.engine;
    room.currentSeat = snapshot.currentSeat;
    room.phase = snapshot.phase;
    room.pendingWinQueue = snapshot.pendingWinQueue || [];
    room.pendingDiscard = snapshot.pendingDiscard || null;
    room.pendingCallOffer = snapshot.pendingCallOffer || null;
    room.roundNumber = snapshot.roundNumber || 0;
    room.lastRoundResult = snapshot.lastRoundResult || null;
    return room;
  }

  /**
   * 真人重新連上後，依照目前房間正在等什麼，決定要重新送什麼事件給他，
   * 避免他重連後畫面卡住、不知道現在該做什麼。
   */
  getResumeSnapshotForSeat(seat) {
    const seatsSummary = this.getSeatsSummary();

    if (this.phase === "awaiting_action" && this.currentSeat === seat && this.engine) {
      const hand = this.engine.hands[seat];
      const requiredSets = 5 - this.engine.exposedSets[seat].length;
      return {
        seatsSummary,
        event: "turnStarted",
        payload: {
          seat,
          hand: [...hand],
          exposedSets: this.engine.exposedSets[seat],
          canDeclareSelfWin: isWinningHand(hand, requiredSets) !== false,
        },
      };
    }

    if (this.phase === "awaiting_win_decision" && this.pendingWinQueue[0] === seat) {
      return {
        seatsSummary,
        event: "winOffer",
        payload: { seat, tile: this.pendingDiscard.tile, fromSeat: this.pendingDiscard.seat },
      };
    }

    if (this.phase === "awaiting_call_decision" && this.pendingCallOffer && this.pendingCallOffer.seat === seat) {
      return { seatsSummary, event: "callOffer", payload: { ...this.pendingCallOffer } };
    }

    if (this.phase === "round_over") {
      return { seatsSummary, event: "roundEnded", payload: this.lastRoundResult };
    }

    return { seatsSummary, event: "waiting", payload: { currentSeat: this.currentSeat, phase: this.phase } };
  }

  /** 真人重新連線，用名字認回自己原本的座位（座位必須是還沒被目前連線佔用的human座位） */
  reclaimSeatByName(name, playerId) {
    const seat = SEAT_ORDER.find(
      s => this.seats[s] && this.seats[s].type === "human" && this.seats[s].name === name && !this.seats[s].playerId
    );
    if (!seat) {
      throw new Error("找不到可以認領的座位，請確認名字是否正確，或這個座位已經有人在線上");
    }
    this.seats[seat].playerId = playerId;
    return seat;
  }

  /** 玩家斷線時呼叫，把座位標記成「沒人連著」，之後才能被重新認領 */
  markSeatDisconnected(seat) {
    if (this.seats[seat]) {
      this.seats[seat].playerId = null;
    }
  }
}

module.exports = { Room, SEAT_ORDER };
