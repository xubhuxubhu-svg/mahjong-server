/**
 * 台灣16張麻將 — 連線伺服器（薄連線層）
 * ------------------------------------------------
 * 只負責：把 socket.io 事件轉呼叫 game_manager.js 的房間邏輯，
 *        並把房間邏輯發出的事件轉發給對應的玩家／整個房間。
 * 遊戲規則本身完全不在這裡，全部在 rules_engine.js / game_manager.js，
 * 這樣之後要接3D畫面或除錯，邏輯跟連線是分開的，比較好維護。
 */

const http = require("http");
const { Server } = require("socket.io");
const { Room } = require("./game_manager");

const rooms = new Map();
const savedGames = new Map(); // roomId -> { snapshot, savedAt }

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function broadcastPublic(io, room, event, payload) {
  io.to(room.roomId).emit(event, payload);
}

/** 只把私密資訊（例如手牌）傳給該座位對應的真人玩家 */
function emitToSeat(io, room, seat, event, payload) {
  const seatInfo = room.seats[seat];
  if (seatInfo && seatInfo.type === "human" && seatInfo.playerId) {
    io.to(seatInfo.playerId).emit(event, payload);
  }
}

function wireRoomEvents(io, room) {
  room.on("seatsUpdated", (seats) => broadcastPublic(io, room, "seats_updated", seats));

  room.on("roundStarted", (info) => broadcastPublic(io, room, "round_started", info));

  room.on("turnStarted", (payload) => {
    // 手牌只給本人，其他玩家只需要知道「輪到誰」
    emitToSeat(io, room, payload.seat, "your_turn", {
      hand: payload.hand,
      canDeclareSelfWin: payload.canDeclareSelfWin,
    });
    broadcastPublic(io, room, "turn_changed", { seat: payload.seat });
  });

  room.on("tileDiscarded", (payload) => broadcastPublic(io, room, "tile_discarded", payload));

  room.on("winOffer", (payload) => {
    emitToSeat(io, room, payload.seat, "win_offer", payload);
  });

  room.on("callOffer", (payload) => {
    emitToSeat(io, room, payload.seat, "call_offer", payload);
  });

  room.on("roundEnded", (result) => broadcastPublic(io, room, "round_ended", result));
}

function startServer(port) {
  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    socket.on("create_room", ({ name } = {}, cb) => {
      const roomId = makeRoomId();
      const room = new Room(roomId);
      rooms.set(roomId, room);
      wireRoomEvents(io, room);

      socket.join(roomId);
      room.addHuman("W_E", socket.id, name || "玩家");
      socket.data.roomId = roomId;
      socket.data.seat = "W_E";
      socket.data.name = name || "玩家";
      cb && cb({ ok: true, roomId, seat: "W_E" });
    });

    socket.on("join_room", ({ roomId, seat, name } = {}, cb) => {
      const room = rooms.get(roomId);
      if (!room) return cb && cb({ ok: false, error: "房間不存在" });
      try {
        room.addHuman(seat, socket.id, name || "玩家");
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.seat = seat;
        socket.data.name = name || "玩家";
        cb && cb({ ok: true, seat });
      } catch (e) {
        cb && cb({ ok: false, error: e.message });
      }
    });

    socket.on("add_ai", ({ roomId, seat } = {}, cb) => {
      const room = rooms.get(roomId);
      if (!room) return cb && cb({ ok: false, error: "房間不存在" });
      try {
        room.addAI(seat);
        cb && cb({ ok: true });
      } catch (e) {
        cb && cb({ ok: false, error: e.message });
      }
    });

    socket.on("start_game", ({ roomId } = {}, cb) => {
      const room = rooms.get(roomId);
      if (!room) return cb && cb({ ok: false, error: "房間不存在" });
      try {
        room.startGame();
        cb && cb({ ok: true });
      } catch (e) {
        cb && cb({ ok: false, error: e.message });
      }
    });

    // 以下操作都是「已經在房間裡的自己」才能做，直接用連線時記錄的 roomId/seat
    const withOwnRoom = (fn) => (payload, cb) => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return cb && cb({ ok: false, error: "找不到房間，可能尚未加入" });
      try {
        fn(room, socket.data.seat, payload);
        cb && cb({ ok: true });
      } catch (e) {
        cb && cb({ ok: false, error: e.message });
      }
    };

    socket.on("request_discard", withOwnRoom((room, seat, { tile }) => room.requestDiscard(seat, tile)));
    socket.on("declare_self_win", withOwnRoom((room, seat) => room.declareSelfWin(seat)));
    socket.on("declare_win_on_discard", withOwnRoom((room, seat) => room.declareWinOnDiscard(seat)));
    socket.on("pass_win_on_discard", withOwnRoom((room, seat) => room.passWinOnDiscard(seat)));
    socket.on("declare_peng", withOwnRoom((room, seat) => room.declarePeng(seat)));
    socket.on("declare_gang_from_discard", withOwnRoom((room, seat) => room.declareGangFromDiscard(seat)));
    socket.on("declare_chi", withOwnRoom((room, seat, { chiCombo }) => room.declareChi(seat, chiCombo)));
    socket.on("decline_call", withOwnRoom((room, seat) => room.declineCall(seat)));
    socket.on("declare_concealed_gang", withOwnRoom((room, seat, { tile }) => room.declareConcealedGang(seat, tile)));
    socket.on("declare_added_gang", withOwnRoom((room, seat, { tile }) => room.declareAddedGang(seat, tile)));
    socket.on("next_round", withOwnRoom((room) => room.nextRound()));

    // ---------- 儲存／讀取進度 ----------
    socket.on("save_game", (_, cb) => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return cb && cb({ ok: false, error: "找不到房間，可能尚未加入" });
      savedGames.set(room.roomId, { snapshot: room.serialize(), savedAt: Date.now() });
      cb && cb({ ok: true, roomId: room.roomId });
    });

    socket.on("load_game", ({ roomId, name } = {}, cb) => {
      if (!roomId || !name) {
        return cb && cb({ ok: false, error: "需要提供房間代碼與名字" });
      }

      let room = rooms.get(roomId);
      if (!room) {
        // 房間目前沒有在跑，改從存檔重建（沿用同一個房間代碼，方便其他人也能用同代碼加入）
        const saved = savedGames.get(roomId);
        if (!saved) return cb && cb({ ok: false, error: "找不到這個房間代碼的存檔" });
        room = Room.fromSnapshot(saved.snapshot);
        rooms.set(roomId, room);
        wireRoomEvents(io, room);
      }

      try {
        const seat = room.reclaimSeatByName(name, socket.id);
        socket.join(room.roomId);
        socket.data.roomId = room.roomId;
        socket.data.seat = seat;
        socket.data.name = name;

        const resume = room.getResumeSnapshotForSeat(seat);
        cb && cb({
          ok: true,
          roomId: room.roomId,
          seat,
          seatsSummary: resume.seatsSummary,
          resumeEvent: resume.event,
          resumePayload: resume.payload,
        });
      } catch (e) {
        cb && cb({ ok: false, error: e.message });
      }
    });

    socket.on("disconnect", () => {
      const room = rooms.get(socket.data.roomId);
      if (room && socket.data.seat) {
        room.markSeatDisconnected(socket.data.seat);
      }
    });
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log(`麻將伺服器啟動於 port ${port}`);
      resolve({ httpServer, io });
    });
  });
}

module.exports = { startServer };

if (require.main === module) {
  startServer(process.env.PORT || 3000);
}
