const { io: ioClient } = require("socket.io-client");
const { startServer } = require("./server");

function assert(cond, msg) {
  if (!cond) {
    console.error("❌ 測試失敗：" + msg);
    process.exitCode = 1;
  } else {
    console.log("✅ " + msg);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(condFn, timeoutMs) {
  const start = Date.now();
  while (!condFn()) {
    if (Date.now() - start > timeoutMs) return false;
    await sleep(10);
  }
  return true;
}

async function main() {
  const PORT = 4002;
  const { httpServer } = await startServer(PORT);

  // ---------- 第一個連線：建立房間、開始遊戲、走幾步之後存檔 ----------
  const clientA = ioClient(`http://localhost:${PORT}`, { transports: ["websocket"] });
  await new Promise((resolve) => clientA.on("connect", resolve));

  const createResult = await new Promise((resolve) => {
    clientA.emit("create_room", { name: "小明" }, resolve);
  });
  assert(createResult.ok, "建立房間應該成功");
  const roomId = createResult.roomId;

  for (const seat of ["W_S", "W_W", "W_N"]) {
    await new Promise((resolve) => clientA.emit("add_ai", { roomId, seat }, resolve));
  }

  let latestHand = null;
  let canSelfWin = false;
  let hasWinOffer = false;
  let hasCallOffer = false;
  let roundEnded = null;

  clientA.on("your_turn", (payload) => {
    latestHand = payload.hand;
    canSelfWin = payload.canDeclareSelfWin;
  });
  clientA.on("win_offer", () => (hasWinOffer = true));
  clientA.on("call_offer", () => (hasCallOffer = true));
  clientA.on("round_ended", (result) => (roundEnded = result));

  const startResult = await new Promise((resolve) => clientA.emit("start_game", { roomId }, resolve));
  assert(startResult.ok, "開始遊戲應該成功");

  await waitUntil(() => latestHand !== null, 3000);
  assert(latestHand !== null, "真人東家開局應該收到自己的手牌");
  const handBeforeDisconnect = [...latestHand];

  // 存檔
  const saveResult = await new Promise((resolve) => clientA.emit("save_game", {}, resolve));
  assert(saveResult.ok, "存檔應該成功");
  assert(saveResult.roomId === roomId, "存檔回傳的房間代碼應該跟原本一致");

  // 模擬玩家斷線（直接關閉連線，不主動離開房間）
  clientA.close();
  await sleep(200); // 給伺服器一點時間處理 disconnect 事件

  // ---------- 第二個連線：用存檔的房間代碼＋名字重新連進來 ----------
  const clientB = ioClient(`http://localhost:${PORT}`, { transports: ["websocket"] });
  await new Promise((resolve) => clientB.on("connect", resolve));

  let latestHandB = null;
  let canSelfWinB = false;
  let hasWinOfferB = false;
  let hasCallOfferB = false;
  let roundEndedB = null;

  clientB.on("your_turn", (payload) => {
    latestHandB = payload.hand;
    canSelfWinB = payload.canDeclareSelfWin;
  });
  clientB.on("win_offer", () => (hasWinOfferB = true));
  clientB.on("call_offer", () => (hasCallOfferB = true));
  clientB.on("round_ended", (result) => (roundEndedB = result));

  const loadResult = await new Promise((resolve) => {
    clientB.emit("load_game", { roomId, name: "小明" }, resolve);
  });
  assert(loadResult.ok, "用存檔的房間代碼＋名字重新連線應該成功");
  assert(loadResult.seat === "W_E", "重新連線後應該認回原本的東家座位");
  assert(loadResult.resumeEvent === "turnStarted", "重連時正好輪到自己棄牌，應該收到turnStarted的復原事件");
  assert(
    loadResult.resumePayload.hand.length === handBeforeDisconnect.length,
    `復原的手牌張數應該跟斷線前一致（斷線前：${handBeforeDisconnect.length}，復原：${loadResult.resumePayload.hand.length}）`
  );

  // 用復原回來的資訊繼續遊戲，直到這局結束
  latestHandB = loadResult.resumePayload.hand;
  canSelfWinB = loadResult.resumePayload.canDeclareSelfWin;

  let steps = 0;
  while (roundEndedB === null && steps < 50) {
    steps += 1;

    if (hasWinOfferB) {
      hasWinOfferB = false;
      await new Promise((resolve) => clientB.emit("pass_win_on_discard", {}, resolve));
      continue;
    }
    if (hasCallOfferB) {
      hasCallOfferB = false;
      await new Promise((resolve) => clientB.emit("decline_call", {}, resolve));
      continue;
    }
    if (latestHandB !== null) {
      const hand = latestHandB;
      latestHandB = null;
      if (canSelfWinB) {
        await new Promise((resolve) => clientB.emit("declare_self_win", {}, resolve));
      } else {
        await new Promise((resolve) => clientB.emit("request_discard", { tile: hand[0] }, resolve));
      }
      continue;
    }
    await sleep(20);
  }

  assert(roundEndedB !== null, "用重連後的連線應該能繼續跑完這一局並收到round_ended");
  if (roundEndedB) {
    console.log("   本局結果：", roundEndedB.outcome, "贏家：", roundEndedB.winnerSeat);
  }

  clientB.close();
  httpServer.close();
  console.log("\n測試完成。");
}

main().catch((e) => {
  console.error("測試過程發生例外：", e);
  process.exitCode = 1;
});
