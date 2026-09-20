const { Room } = require("./game_manager");

function assert(cond, msg) {
  if (!cond) {
    console.error("❌ 測試失敗：" + msg);
    process.exitCode = 1;
  } else {
    console.log("✅ " + msg);
  }
}

// ---------- 測試一：手動情境下，存檔→復原後，等待真人棄牌的狀態應正確還原 ----------
console.log("＝＝＝ 測試：存檔／復原 — 輪到真人棄牌時 ＝＝＝");
{
  const room = new Room("SAVE1");
  room.addHuman("W_E", "socket-old-1", "小明");
  room.addAI("W_S");
  room.addAI("W_W");
  room.addAI("W_N");

  room.dealerState = { dealerSeat: "W_E", continuousCount: 2 };
  room.passState = { W_E: false, W_S: false, W_W: false, W_N: false };
  room.engine = {
    wall: ["1s", "2s", "3s"],
    wallIndex: 0,
    hands: { W_E: ["1m", "2m", "3m"], W_S: [], W_W: [], W_N: [] },
    flowers: { W_E: [], W_S: [], W_W: [], W_N: [] },
    exposedSets: { W_E: [], W_S: [], W_W: [], W_N: [] },
    discardPile: [],
  };
  room.currentSeat = "W_E";
  room.phase = "awaiting_action";
  room.roundNumber = 3;

  const snapshot = room.serialize();
  const jsonRoundTrip = JSON.parse(JSON.stringify(snapshot)); // 模擬真的存成檔案再讀回來
  const restored = Room.fromSnapshot(jsonRoundTrip);

  assert(restored.roomId === "SAVE1", "還原後房間代碼應該一樣");
  assert(restored.seats.W_E.type === "human" && restored.seats.W_E.name === "小明", "還原後東家應該還是叫小明的真人座位");
  assert(restored.seats.W_E.playerId === null, "還原後真人的連線id應該重置為null，等待重新認領");
  assert(restored.seats.W_S.type === "ai", "還原後AI座位應該還是AI");
  assert(restored.dealerState.continuousCount === 2, "還原後連莊數應該正確保留");
  assert(restored.engine.hands.W_E.length === 3, "還原後手牌內容應該正確保留");
  assert(restored.roundNumber === 3, "還原後局數應該正確保留");

  // 真人重新連線，用名字認領座位
  const seat = restored.reclaimSeatByName("小明", "socket-new-2");
  assert(seat === "W_E", "應該正確認回東家座位");
  assert(restored.seats.W_E.playerId === "socket-new-2", "認領後應該綁定新的連線id");

  const resume = restored.getResumeSnapshotForSeat("W_E");
  assert(resume.event === "turnStarted", "復原時正好輪到他棄牌，應該重送turnStarted事件");
  assert(resume.payload.hand.length === 3, "重送的手牌內容應該正確");
}

// ---------- 測試二：存檔時剛好是別家胡牌詢問（winOffer）狀態，復原後應該正確 ----------
console.log("\n＝＝＝ 測試：存檔／復原 — 等待真人決定要不要胡的狀態 ＝＝＝");
{
  const room = new Room("SAVE2");
  room.addHuman("W_S", "socket-old", "小華");
  room.addAI("W_E");
  room.addAI("W_W");
  room.addAI("W_N");

  room.dealerState = { dealerSeat: "W_E", continuousCount: 0 };
  room.passState = { W_E: false, W_S: false, W_W: false, W_N: false };
  room.engine = {
    wall: [],
    wallIndex: 0,
    hands: { W_E: [], W_S: ["9p", "9p"], W_W: [], W_N: [] },
    flowers: { W_E: [], W_S: [], W_W: [], W_N: [] },
    exposedSets: { W_E: [], W_S: [], W_W: [], W_N: [] },
    discardPile: [{ seat: "W_E", tile: "9p" }],
  };
  room.currentSeat = "W_E";
  room.phase = "awaiting_win_decision";
  room.pendingWinQueue = ["W_S"];
  room.pendingDiscard = { seat: "W_E", tile: "9p" };
  room.roundNumber = 1;

  const restored = Room.fromSnapshot(JSON.parse(JSON.stringify(room.serialize())));
  restored.reclaimSeatByName("小華", "socket-new");
  const resume = restored.getResumeSnapshotForSeat("W_S");
  assert(resume.event === "winOffer", "復原時正好在問他要不要胡，應該重送winOffer事件");
  assert(resume.payload.tile === "9p", "重送的胡牌詢問應該包含正確的那張牌");
}

// ---------- 測試三：認領流程與失敗情境 ----------
console.log("\n＝＝＝ 測試：認領流程與失敗情境 ＝＝＝");
{
  const room = new Room("SAVE3");
  room.addHuman("W_E", "socket-old", "阿強"); // 一開始就有人連著（socket-old）
  room.addAI("W_S");
  room.addAI("W_W");
  room.addAI("W_N");

  // 座位還有人連著（socket-old），這時候不該讓別的連線認領走
  let threwWhileStillConnected = false;
  try {
    room.reclaimSeatByName("阿強", "socket-y");
  } catch (e) {
    threwWhileStillConnected = true;
  }
  assert(threwWhileStillConnected, "座位還有人連著時，不應該讓別的連線認領走");

  // 用錯誤的名字認領，不管有沒有斷線都應該失敗
  let threwWrongName = false;
  try {
    room.reclaimSeatByName("不存在的名字", "socket-x");
  } catch (e) {
    threwWrongName = true;
  }
  assert(threwWrongName, "用錯誤的名字認領應該丟出錯誤");

  // 模擬斷線，之後才可以被重新認領
  room.markSeatDisconnected("W_E");
  const seat = room.reclaimSeatByName("阿強", "socket-w");
  assert(seat === "W_E", "斷線標記後應該可以重新認領同一個座位");
  assert(room.seats.W_E.playerId === "socket-w", "認領後應該綁定新的連線id");
}

console.log("\n測試完成。");
