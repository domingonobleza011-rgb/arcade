const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const port = process.env.PORT || 3000;
const app = next({ dev });
const handle = app.getRequestHandler();

const MAX = { tictactoe: 2, quiz: 2, draw: 8, shooter: 8 };
const EMOTES = ["👍", "😂", "😮", "🔥", "😢", "👏", "😎", "🤯"];
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const BANK = [
  { text: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Mercury"], answer: 1 },
  { text: "What is the capital of Japan?", options: ["Kyoto", "Osaka", "Tokyo", "Nagoya"], answer: 2 },
  { text: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
  { text: "Which gas do plants absorb from the air?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Helium"], answer: 1 },
  { text: "Who painted the Mona Lisa?", options: ["Van Gogh", "Picasso", "Da Vinci", "Monet"], answer: 2 },
  { text: "What is the largest ocean?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
  { text: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
  { text: "Which element has the symbol Fe?", options: ["Iron", "Fluorine", "Lead", "Tin"], answer: 0 },
  { text: "What is the fastest land animal?", options: ["Lion", "Horse", "Cheetah", "Greyhound"], answer: 2 },
  { text: "Which language has the most native speakers?", options: ["English", "Spanish", "Hindi", "Mandarin Chinese"], answer: 3 },
];

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const rooms = new Map();
const queues = { tictactoe: [], quiz: [], draw: [], shooter: [] };
const newCode = () => {
  let c;
  do c = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
  while (rooms.has(c));
  return c;
};

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer);

  const sys = (r, text) => io.to(r.code).emit("chat", { sys: true, text });

  function publicState(r) {
    const s = r.state;
    if (!s) return null;
    if (r.game === "tictactoe") return { board: s.board, turn: s.turn, winner: s.winner, marks: s.marks };
    if (r.game === "quiz") {
      const q = s.qs[s.i];
      return {
        i: s.i, total: s.qs.length, phase: s.phase, scores: s.scores,
        text: q && q.text, options: q && q.options, answered: Object.keys(s.picks || {}),
        reveal: s.phase === "reveal" ? { answer: q.answer, picks: s.picks } : null,
      };
    }
    return null;
  }
  const push = (r) =>
    io.to(r.code).emit("room", {
      code: r.code, game: r.game, status: r.status, max: MAX[r.game], players: r.players, state: publicState(r),
    });

  function nextQ(r) {
    const s = r.state;
    s.i++;
    if (s.i >= s.qs.length) { s.phase = "done"; return push(r); }
    s.phase = "asking"; s.picks = {}; s.first = null;
    push(r);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => reveal(r), 15000);
  }
  function reveal(r) {
    const s = r.state;
    if (!s || s.phase !== "asking") return;
    clearTimeout(s.timer);
    s.phase = "reveal";
    push(r);
    s.timer = setTimeout(() => nextQ(r), 3000);
  }

  function start(r) {
    if (r.state && r.state.timer) clearTimeout(r.state.timer);
    r.status = "playing";
    if (r.game === "tictactoe") {
      const [a, b] = r.players;
      r.state = { board: Array(9).fill(null), turn: "X", winner: null, marks: { [a.id]: "X", [b.id]: "O" } };
    }
    if (r.game === "quiz") {
      r.state = {
        qs: shuffle(BANK).slice(0, 5), i: -1, phase: "idle", picks: {},
        scores: Object.fromEntries(r.players.map((p) => [p.id, 0])),
      };
      return nextQ(r);
    }
    push(r);
  }

  // ---- shooter: server-authoritative top-down arena, 30 ticks/sec ----
  const WALLS = [
    { x: 360, y: 150, w: 80, h: 200 }, { x: 100, y: 90, w: 120, h: 20 },
    { x: 580, y: 390, w: 120, h: 20 }, { x: 100, y: 390, w: 20, h: 80 }, { x: 680, y: 30, w: 20, h: 80 },
  ];
  const SPAWNS = [[50,50],[750,50],[50,450],[750,450],[400,60],[400,440],[200,250],[600,250]];
  const RAD = 14, WIN = 10;
  const hitWall = (x, y, r) =>
    x < r || y < r || x > 800 - r || y > 500 - r ||
    WALLS.some((w) => x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h);
  function spawn(p) {
    const [x, y] = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    p.x = x; p.y = y; p.hp = 100; p.dead = 0;
  }
  function addShooter(r, id, name) {
    if (!r.sim) r.sim = { players: {}, bullets: [], over: 0, winner: null, timer: setInterval(() => tick(r), 33) };
    const p = { id, name, kills: 0, deaths: 0, cool: 0, aim: 0, inp: {} };
    spawn(p);
    r.sim.players[id] = p;
  }
  function tick(r) {
    const s = r.sim, dt = 1 / 30;
    if (s.over && --s.over === 0) {
      s.winner = null; s.bullets = [];
      Object.values(s.players).forEach((p) => { p.kills = 0; p.deaths = 0; spawn(p); });
    }
    for (const p of Object.values(s.players)) {
      if (p.dead) { if (--p.dead === 0) spawn(p); continue; }
      if (s.over) continue;
      const i = p.inp, dx = (i.r ? 1 : 0) - (i.l ? 1 : 0), dy = (i.d ? 1 : 0) - (i.u ? 1 : 0);
      if (dx || dy) {
        const m = Math.hypot(dx, dy);
        const nx = p.x + (dx / m) * 200 * dt, ny = p.y + (dy / m) * 200 * dt;
        if (!hitWall(nx, p.y, RAD)) p.x = nx;
        if (!hitWall(p.x, ny, RAD)) p.y = ny;
      }
      if (p.cool > 0) p.cool--;
      if (i.fire && p.cool === 0) {
        p.cool = 8;
        s.bullets.push({ x: p.x, y: p.y, vx: Math.cos(p.aim) * 450, vy: Math.sin(p.aim) * 450, o: p.id, life: 40 });
      }
    }
    s.bullets = s.bullets.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (--b.life <= 0 || hitWall(b.x, b.y, 2)) return false;
      for (const p of Object.values(s.players)) {
        if (p.id === b.o || p.dead || Math.hypot(p.x - b.x, p.y - b.y) > RAD + 3) continue;
        p.hp -= 25;
        if (p.hp <= 0) {
          p.dead = 60; p.deaths++;
          const k = s.players[b.o];
          if (k) {
            k.kills++;
            sys(r, `${k.name} fragged ${p.name}`);
            if (k.kills >= WIN && !s.over) { s.over = 150; s.winner = k.name; }
          }
        }
        return false;
      }
      return true;
    });
    io.to(r.code).volatile.emit("shot:state", {
      p: Object.values(s.players).map((p) => [p.id, p.name, Math.round(p.x), Math.round(p.y), +p.aim.toFixed(2), p.hp, p.kills, p.deaths, p.dead ? 1 : 0]),
      b: s.bullets.map((b) => [Math.round(b.x), Math.round(b.y)]),
      over: s.over ? s.winner : null,
    });
  }

  function newRoom(game) {
    const r = { code: newCode(), game, players: [], status: "waiting", state: null, history: [] };
    rooms.set(r.code, r);
    return r;
  }

  function join(socket, r, name) {
    if (r.players.length >= MAX[r.game]) return socket.emit("err", "That room is full.");
    socket.join(r.code);
    socket.data = { code: r.code, name };
    r.players.push({ id: socket.id, name });
    sys(r, `${name} joined`);
    if (r.game === "draw" || r.game === "shooter") {
      r.status = "playing";
      if (r.game === "shooter") addShooter(r, socket.id, name);
      push(r);
    }
    else if (r.players.length === 2) start(r);
    else push(r);
  }

  function leave(socket) {
    for (const g in queues) queues[g] = queues[g].filter((x) => x.id !== socket.id);
    const d = socket.data;
    if (!d || !d.code) return;
    const r = rooms.get(d.code);
    socket.leave(d.code);
    socket.data = {};
    if (!r) return;
    r.players = r.players.filter((p) => p.id !== socket.id);
    if (r.sim) delete r.sim.players[socket.id];
    if (r.state && r.state.timer) clearTimeout(r.state.timer);
    if (!r.players.length) { if (r.sim) clearInterval(r.sim.timer); return void rooms.delete(r.code); }
    if (r.game !== "draw" && r.game !== "shooter") { r.status = "waiting"; r.state = null; }
    sys(r, `${d.name} left`);
    push(r);
  }

  const mine = (socket) => rooms.get(socket.data && socket.data.code);
  const cleanName = (n) => String(n || "").trim().slice(0, 16) || "Guest";

  io.on("connection", (socket) => {
    socket.data = {};

    socket.on("find", ({ game, name } = {}) => {
      if (!MAX[game]) return;
      leave(socket);
      const q = queues[game];
      while (q.length) {
        const w = q.shift();
        const ws = io.sockets.sockets.get(w.id);
        if (!ws) continue;
        const r = newRoom(game);
        join(ws, r, w.name);
        join(socket, r, cleanName(name));
        return;
      }
      q.push({ id: socket.id, name: cleanName(name) });
      socket.emit("searching");
    });

    socket.on("create", ({ game, name } = {}) => {
      if (!MAX[game]) return;
      leave(socket);
      join(socket, newRoom(game), cleanName(name));
    });

    socket.on("join", ({ code, name } = {}) => {
      const r = rooms.get(String(code || "").toUpperCase().trim());
      if (!r) return socket.emit("err", "No room with that code.");
      leave(socket);
      join(socket, r, cleanName(name));
    });

    socket.on("leave", () => leave(socket));
    socket.on("disconnect", () => leave(socket));

    // chat + emotes
    socket.on("chat", (text) => {
      const r = mine(socket);
      const now = Date.now();
      if (!r || typeof text !== "string" || now - (socket.data.last || 0) < 300) return;
      socket.data.last = now;
      io.to(r.code).emit("chat", { id: socket.id, from: socket.data.name, text: text.slice(0, 200) });
    });
    socket.on("emote", (emoji) => {
      const r = mine(socket);
      if (!r || !EMOTES.includes(emoji)) return;
      io.to(r.code).emit("emote", { from: socket.data.name, emoji });
    });

    // tic-tac-toe
    socket.on("move", (i) => {
      const r = mine(socket);
      if (!r || r.game !== "tictactoe" || !r.state) return;
      const s = r.state;
      if (s.winner || !Number.isInteger(i) || i < 0 || i > 8 || s.board[i] || s.marks[socket.id] !== s.turn) return;
      s.board[i] = s.turn;
      const w = LINES.find(([a, b, c]) => s.board[a] && s.board[a] === s.board[b] && s.board[a] === s.board[c]);
      s.winner = w ? s.turn : s.board.every(Boolean) ? "draw" : null;
      if (!s.winner) s.turn = s.turn === "X" ? "O" : "X";
      push(r);
    });

    // quiz battle
    socket.on("answer", (choice) => {
      const r = mine(socket);
      if (!r || r.game !== "quiz" || !r.state || r.state.phase !== "asking") return;
      const s = r.state;
      if (s.picks[socket.id] !== undefined || !Number.isInteger(choice)) return;
      s.picks[socket.id] = choice;
      if (choice === s.qs[s.i].answer) {
        s.scores[socket.id] += s.first ? 1 : 2; // first correct answer earns a bonus
        s.first = s.first || socket.id;
      }
      if (Object.keys(s.picks).length === r.players.length) reveal(r);
      else push(r);
    });

    socket.on("rematch", () => {
      const r = mine(socket);
      if (!r || r.players.length !== 2 || !r.state) return;
      const done = r.game === "tictactoe" ? r.state.winner : r.state.phase === "done";
      if (!done) return;
      r.players.reverse();
      start(r);
    });

    // shooter
    socket.on("shot:sync", () => socket.emit("shot:init", { walls: WALLS }));
    socket.on("shot:input", (d) => {
      const r = mine(socket);
      const p = r && r.sim && r.sim.players[socket.id];
      if (!p || !d) return;
      p.inp = { u: !!d.u, d: !!d.d, l: !!d.l, r: !!d.r, fire: !!d.fire };
      if (Number.isFinite(d.aim)) p.aim = d.aim;
    });

    // drawing board
    socket.on("draw", (d) => {
      const r = mine(socket);
      if (!r || r.game !== "draw" || !d) return;
      if (!["x0", "y0", "x1", "y1", "w"].every((k) => typeof d[k] === "number") || typeof d.c !== "string" || d.c.length > 9) return;
      const seg = { x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1, w: d.w, c: d.c };
      r.history.push(seg);
      if (r.history.length > 8000) r.history.shift();
      socket.to(r.code).emit("draw", seg);
    });
    socket.on("draw:clear", () => {
      const r = mine(socket);
      if (!r || r.game !== "draw") return;
      r.history = [];
      socket.to(r.code).emit("draw:clear");
    });
    socket.on("draw:sync", () => {
      const r = mine(socket);
      if (r && r.game === "draw") socket.emit("draw:history", r.history);
    });
  });

  httpServer.listen(port, "0.0.0.0", () => console.log(`> Ready on http://localhost:${port}`));
});
