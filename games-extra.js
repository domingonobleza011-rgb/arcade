// Server-side logic for the extra games. Loaded by server.js.
// Games: battleship, dots, reversi, gomoku, snake, pong, tanks, scramble, mathrace, quickdraw
// (+ chess, ladders, fighter, maze, pongx, racing from games-more.js)
const rnd = (n) => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isInt = Number.isInteger;

module.exports = function createExtra({ io, sys, push }) {
  const games = {};
  const other = (r, id) => r.players.find((p) => p.id !== id);
  const emitRT = (r) => io.to(r.code).emit("rt:state", games[r.game].snap(r));
  // chess, ladders, fighter, maze, pongx, racing live in games-more.js
  const more = require("./games-more")({ io, sys, push, games, other, emitRT });

  // =====================================================================
  // BATTLESHIP  (per-viewer state: you never see the enemy fleet)
  // =====================================================================
  const FLEET = [["Carrier", 5], ["Battleship", 4], ["Cruiser", 3], ["Submarine", 3], ["Destroyer", 2]];
  const blank = () => Array.from({ length: 10 }, () => Array(10).fill(0));
  function placeFleet() {
    const g = Array.from({ length: 10 }, () => Array(10).fill(-1));
    FLEET.forEach(([, len], si) => {
      for (;;) {
        const h = Math.random() < 0.5;
        const y = rnd(h ? 10 : 11 - len), x = rnd(h ? 11 - len : 10);
        const cells = Array.from({ length: len }, (_, i) => [y + (h ? 0 : i), x + (h ? i : 0)]);
        if (cells.some(([yy, xx]) => g[yy][xx] !== -1)) continue;
        cells.forEach(([yy, xx]) => (g[yy][xx] = si));
        break;
      }
    });
    return g;
  }
  games.battleship = {
    start(r) {
      const [a, b] = r.players;
      r.state = {
        grid: { [a.id]: placeFleet(), [b.id]: placeFleet() },
        shots: { [a.id]: blank(), [b.id]: blank() },
        hp: { [a.id]: FLEET.map((f) => f[1]), [b.id]: FLEET.map((f) => f[1]) },
        turn: a.id, winner: null, last: null,
      };
    },
    view(r, viewer) {
      const s = r.state, o = other(r, viewer);
      if (!o) return null;
      const sunk = [];
      s.hp[o.id].forEach((h, si) => {
        if (h > 0) return;
        for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (s.grid[o.id][y][x] === si) sunk.push([y, x, si]);
      });
      return {
        turn: s.turn, winner: s.winner, last: s.last, mine: s.grid[viewer], incoming: s.shots[o.id], shots: s.shots[viewer],
        sunk, enemyShips: s.winner ? s.grid[o.id] : null, fleet: FLEET,
        myHp: s.hp[viewer], oppHp: s.hp[o.id],
      };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // DOTS & BOXES  (5x5 boxes)
  // =====================================================================
  const DB = 5;
  games.dots = {
    start(r) {
      const [a, b] = r.players;
      r.state = {
        h: Array.from({ length: DB + 1 }, () => Array(DB).fill(null)),
        v: Array.from({ length: DB }, () => Array(DB + 1).fill(null)),
        boxes: Array.from({ length: DB }, () => Array(DB).fill(null)),
        turn: a.id, scores: { [a.id]: 0, [b.id]: 0 }, winner: null, last: null,
      };
    },
    view: (r) => ({ ...r.state }),
    done: (r) => !!r.state.winner,
  };
  const dbBoxDone = (s, y, x) => y >= 0 && x >= 0 && y < DB && x < DB && s.h[y][x] && s.h[y + 1][x] && s.v[y][x] && s.v[y][x + 1];

  // =====================================================================
  // REVERSI
  // =====================================================================
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const inB = (y, x) => y >= 0 && y < 8 && x >= 0 && x < 8;
  function rvFlips(b, y, x, c) {
    if (b[y][x]) return [];
    const o = c === "B" ? "W" : "B", out = [];
    for (const [dy, dx] of DIRS) {
      let ny = y + dy, nx = x + dx;
      const line = [];
      while (inB(ny, nx) && b[ny][nx] === o) { line.push([ny, nx]); ny += dy; nx += dx; }
      if (line.length && inB(ny, nx) && b[ny][nx] === c) out.push(...line);
    }
    return out;
  }
  function rvMoves(b, c) {
    const m = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (rvFlips(b, y, x, c).length) m.push([y, x]);
    return m;
  }
  const rvCount = (b) => { let B = 0, W = 0; b.forEach((row) => row.forEach((c) => { if (c === "B") B++; else if (c === "W") W++; })); return { B, W }; };
  games.reversi = {
    start(r) {
      const [a, b] = r.players;
      const board = Array.from({ length: 8 }, () => Array(8).fill(null));
      board[3][3] = "W"; board[4][4] = "W"; board[3][4] = "B"; board[4][3] = "B";
      r.state = { board, turn: "B", winner: null, colors: { [a.id]: "B", [b.id]: "W" }, last: null, passed: null, flipped: [] };
    },
    view(r) {
      const s = r.state;
      return { board: s.board, turn: s.turn, winner: s.winner, colors: s.colors, last: s.last, passed: s.passed, flipped: s.flipped, counts: rvCount(s.board), moves: s.winner ? [] : rvMoves(s.board, s.turn) };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // GOMOKU (15x15, five in a row)
  // =====================================================================
  const GM = 15;
  function gmLine(b, y, x, c) {
    for (const [dy, dx] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [[y, x]];
      for (const sgn of [1, -1]) {
        for (let i = 1; i < 5; i++) {
          const ny = y + dy * sgn * i, nx = x + dx * sgn * i;
          if (ny < 0 || nx < 0 || ny >= GM || nx >= GM || b[ny][nx] !== c) break;
          cells.push([ny, nx]);
        }
      }
      if (cells.length >= 5) return cells;
    }
    return null;
  }
  games.gomoku = {
    start(r) {
      const [a, b] = r.players;
      r.state = { board: Array.from({ length: GM }, () => Array(GM).fill(null)), turn: "B", winner: null, colors: { [a.id]: "B", [b.id]: "W" }, last: null, line: null, moves: 0 };
    },
    view: (r) => ({ ...r.state }),
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // SNAKE DUEL (server tick)
  // =====================================================================
  const SN = { W: 32, H: 20 };
  function snFood(s) {
    const occ = new Set();
    s.snakes.forEach((k) => k.body.forEach(([x, y]) => occ.add(x + "," + y)));
    s.food.forEach(([x, y]) => occ.add(x + "," + y));
    for (let t = 0; t < 300; t++) {
      const x = rnd(SN.W), y = rnd(SN.H);
      if (!occ.has(x + "," + y)) return [x, y];
    }
    return null;
  }
  function snTick(r, s) {
    if (r.state !== s) return clearInterval(s.timer);
    if (s.count > 0) { s.count--; return emitRT(r); }
    const heads = s.snakes.map((k) => { k.dir = k.next; return [k.body[0][0] + k.dir[0], k.body[0][1] + k.dir[1]]; });
    const eats = heads.map((h) => s.food.findIndex((f) => f[0] === h[0] && f[1] === h[1]));
    const bodies = s.snakes.map((k, i) => (eats[i] < 0 ? k.body.slice(0, -1) : k.body));
    const dead = heads.map(([x, y]) => x < 0 || y < 0 || x >= SN.W || y >= SN.H || bodies.some((b) => b.some(([bx, by]) => bx === x && by === y)));
    if (heads[0][0] === heads[1][0] && heads[0][1] === heads[1][1]) dead[0] = dead[1] = true;
    s.snakes.forEach((k, i) => {
      k.dead = dead[i];
      if (dead[i]) return;
      k.body.unshift(heads[i]);
      if (eats[i] >= 0) s.food.splice(eats[i], 1); else k.body.pop();
    });
    while (s.food.length < 3) { const f = snFood(s); if (!f) break; s.food.push(f); }
    if (dead[0] || dead[1]) {
      s.winner = dead[0] && dead[1] ? "draw" : dead[0] ? s.snakes[1].id : s.snakes[0].id;
      clearInterval(s.timer);
      emitRT(r);
      return push(r);
    }
    emitRT(r);
  }
  games.snake = {
    start(r) {
      const [a, b] = r.players;
      const s = {
        snakes: [
          { id: a.id, body: [[6, 10], [5, 10], [4, 10]], dir: [1, 0], next: [1, 0] },
          { id: b.id, body: [[25, 9], [26, 9], [27, 9]], dir: [-1, 0], next: [-1, 0] },
        ],
        food: [], count: 27, winner: null,
      };
      for (let i = 0; i < 3; i++) { const f = snFood(s); if (f) s.food.push(f); }
      s.timer = setInterval(() => snTick(r, s), 110);
      r.state = s;
    },
    view: (r) => ({ ids: r.state.snakes.map((k) => k.id), winner: r.state.winner }),
    snap: (r) => {
      const s = r.state;
      return { w: SN.W, h: SN.H, count: s.count, winner: s.winner, food: s.food, snakes: s.snakes.map((k) => ({ id: k.id, body: k.body, alive: !k.dead })) };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // PONG (server tick)
  // =====================================================================
  const PG = { W: 800, H: 500, PH: 90, PW: 12, R: 8, X: 30, WIN: 7 };
  function pgServe(s, dir) {
    const ang = (Math.random() - 0.5) * 0.8;
    s.ball = { x: 400, y: 250, vx: Math.cos(ang) * 380 * dir, vy: Math.sin(ang) * 380 };
    s.count = 45;
  }
  function pgTick(r, s) {
    if (r.state !== s) return clearInterval(s.timer);
    const dt = 0.033;
    for (const p of s.pad) {
      const d = p.t - p.y, m = 650 * dt;
      p.y += Math.abs(d) <= m ? d : Math.sign(d) * m;
    }
    if (s.count > 0) s.count--;
    else {
      const b = s.ball;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < PG.R) { b.y = PG.R; b.vy = Math.abs(b.vy); }
      if (b.y > PG.H - PG.R) { b.y = PG.H - PG.R; b.vy = -Math.abs(b.vy); }
      const bounce = (p, dir) => {
        const sp = Math.min(Math.hypot(b.vx, b.vy) * 1.06, 860);
        const ang = clamp((b.y - (p.y + PG.PH / 2)) / (PG.PH / 2), -1, 1) * 0.95;
        b.vx = Math.cos(ang) * sp * dir; b.vy = Math.sin(ang) * sp;
      };
      const [L, Rt] = s.pad;
      if (b.vx < 0 && b.x - PG.R <= PG.X + PG.PW && b.x > PG.X - PG.PW && b.y > L.y - PG.R && b.y < L.y + PG.PH + PG.R) {
        bounce(L, 1); b.x = PG.X + PG.PW + PG.R;
      } else if (b.vx > 0 && b.x + PG.R >= PG.W - PG.X - PG.PW && b.x < PG.W - PG.X + PG.PW && b.y > Rt.y - PG.R && b.y < Rt.y + PG.PH + PG.R) {
        bounce(Rt, -1); b.x = PG.W - PG.X - PG.PW - PG.R;
      } else if (b.x < -20 || b.x > PG.W + 20) {
        const sc = b.x < 0 ? 1 : 0;
        s.pad[sc].score++;
        if (s.pad[sc].score >= PG.WIN) {
          s.winner = s.pad[sc].id;
          clearInterval(s.timer);
          emitRT(r);
          return push(r);
        }
        pgServe(s, sc === 1 ? -1 : 1);
      }
    }
    emitRT(r);
  }
  games.pong = {
    start(r) {
      const [a, b] = r.players;
      const s = { pad: [{ id: a.id, y: 205, t: 205, score: 0 }, { id: b.id, y: 205, t: 205, score: 0 }], ball: null, count: 0, winner: null };
      pgServe(s, Math.random() < 0.5 ? 1 : -1);
      s.count = 70;
      s.timer = setInterval(() => pgTick(r, s), 33);
      r.state = s;
    },
    view: (r) => ({ ids: r.state.pad.map((p) => p.id), winner: r.state.winner, target: PG.WIN }),
    snap: (r) => {
      const s = r.state;
      return { p: s.pad.map((p) => [Math.round(p.y), p.score]), b: [Math.round(s.ball.x), Math.round(s.ball.y), Math.round(s.ball.vx), Math.round(s.ball.vy)], count: s.count, winner: s.winner };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // TANK BATTLE (server tick, bouncing shells, first to 3 rounds)
  // =====================================================================
  const TK = {
    W: 800, H: 500, R: 17,
    WALLS: [
      { x: 370, y: 150, w: 60, h: 200 }, { x: 140, y: 90, w: 130, h: 22 }, { x: 530, y: 388, w: 130, h: 22 },
      { x: 140, y: 300, w: 22, h: 110 }, { x: 638, y: 90, w: 22, h: 110 }, { x: 230, y: 220, w: 50, h: 60 }, { x: 520, y: 220, w: 50, h: 60 },
    ],
  };
  const tkHit = (x, y, r) => x < r || y < r || x > TK.W - r || y > TK.H - r || TK.WALLS.some((w) => x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h);
  function tkReset(s) {
    s.tanks.forEach((t, i) => { t.x = i ? 730 : 70; t.y = 250; t.a = i ? Math.PI : 0; t.t = t.a; t.hp = 3; t.cool = 0; t.inp = {}; });
    s.shells = []; s.wait = 75; s.msg = null;
  }
  function tkTick(r, s) {
    if (r.state !== s) return clearInterval(s.timer);
    const dt = 0.033;
    if (s.over > 0) { if (--s.over === 0) { s.round++; tkReset(s); } }
    else if (s.wait > 0) s.wait--;
    else {
      for (const t of s.tanks) {
        const i = t.inp || {};
        t.a += ((i.r ? 1 : 0) - (i.l ? 1 : 0)) * 2.4 * dt;
        const mv = ((i.f ? 115 : 0) - (i.b ? 70 : 0)) * dt;
        if (mv) {
          const o = s.tanks.find((q) => q !== t);
          const free = (x, y) => !tkHit(x, y, TK.R) && Math.hypot(x - o.x, y - o.y) > TK.R * 2;
          const nx = t.x + Math.cos(t.a) * mv, ny = t.y + Math.sin(t.a) * mv;
          if (free(nx, t.y)) t.x = nx;
          if (free(t.x, ny)) t.y = ny;
        }
        if (t.cool > 0) t.cool--;
        if (i.fire && t.cool === 0) {
          t.cool = 27;
          s.shells.push({ x: t.x + Math.cos(t.t) * 28, y: t.y + Math.sin(t.t) * 28, vx: Math.cos(t.t) * 340, vy: Math.sin(t.t) * 340, o: t.id, b: 2, age: 0 });
        }
      }
      s.shells = s.shells.filter((sh) => {
        sh.age++;
        const nx = sh.x + sh.vx * dt, ny = sh.y + sh.vy * dt;
        if (tkHit(nx, sh.y, 2)) { if (sh.b-- <= 0) return false; sh.vx = -sh.vx; } else sh.x = nx;
        if (tkHit(sh.x, ny, 2)) { if (sh.b-- <= 0) return false; sh.vy = -sh.vy; } else sh.y = ny;
        for (const t of s.tanks) {
          if (t.hp > 0 && (sh.o !== t.id || sh.age > 10) && Math.hypot(t.x - sh.x, t.y - sh.y) < TK.R + 3) { t.hp--; return false; }
        }
        return true;
      });
      const dead = s.tanks.filter((t) => t.hp <= 0);
      if (dead.length) {
        const winner = dead.length === 2 ? null : s.tanks.find((t) => t.hp > 0);
        if (winner) winner.score++;
        s.msg = winner ? winner.id : "draw";
        s.over = 70;
        if (winner && winner.score >= s.target) {
          s.winner = winner.id;
          clearInterval(s.timer);
          emitRT(r);
          return push(r);
        }
      }
    }
    emitRT(r);
  }
  games.tanks = {
    start(r) {
      const [a, b] = r.players;
      const s = { tanks: [{ id: a.id, score: 0 }, { id: b.id, score: 0 }], shells: [], round: 1, target: 3, winner: null, over: 0 };
      tkReset(s);
      s.timer = setInterval(() => tkTick(r, s), 33);
      r.state = s;
    },
    view: (r) => ({ ids: r.state.tanks.map((t) => t.id), winner: r.state.winner, target: r.state.target }),
    snap: (r) => {
      const s = r.state;
      return {
        t: s.tanks.map((t) => [t.id, Math.round(t.x), Math.round(t.y), +t.a.toFixed(2), +t.t.toFixed(2), t.hp, t.cool, t.score]),
        s: s.shells.map((x) => [Math.round(x.x), Math.round(x.y)]), wait: s.wait, over: s.over, msg: s.msg, round: s.round, winner: s.winner, target: s.target,
      };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // RACE ENGINE: word scramble + math race (first correct answer scores)
  // =====================================================================
  const SCRAMBLE = [
    ["planet", "Space"], ["rocket", "Space"], ["galaxy", "Space"], ["comet", "Space"], ["orbit", "Space"], ["castle", "Place"], ["bridge", "Place"], ["island", "Place"],
    ["jungle", "Nature"], ["thunder", "Nature"], ["volcano", "Nature"], ["rainbow", "Nature"], ["forest", "Nature"], ["ocean", "Nature"], ["dragon", "Fantasy"],
    ["wizard", "Fantasy"], ["phoenix", "Fantasy"], ["unicorn", "Fantasy"], ["pirate", "Adventure"], ["treasure", "Adventure"], ["compass", "Adventure"], ["guitar", "Music"],
    ["piano", "Music"], ["violin", "Music"], ["trumpet", "Music"], ["pizza", "Food"], ["banana", "Food"], ["sandwich", "Food"], ["chocolate", "Food"], ["pancake", "Food"],
    ["elephant", "Animal"], ["dolphin", "Animal"], ["penguin", "Animal"], ["giraffe", "Animal"], ["octopus", "Animal"], ["keyboard", "Tech"], ["monitor", "Tech"],
    ["battery", "Tech"], ["network", "Tech"], ["camera", "Tech"], ["library", "Place"], ["mirror", "Object"], ["lantern", "Object"], ["backpack", "Object"], ["umbrella", "Object"],
  ];
  const scramble = (w) => {
    let out = w;
    for (let t = 0; t < 20 && out === w; t++) out = w.split("").sort(() => Math.random() - 0.5).join("");
    return out;
  };
  function mathQ(i) {
    const n = (lo, hi) => lo + rnd(hi - lo + 1);
    let t, ans;
    if (i < 3) { const x = n(10, 60), y = n(10, 60); t = `${x} + ${y}`; ans = x + y; }
    else if (i < 5) { const x = n(40, 99), y = n(10, 39); t = `${x} − ${y}`; ans = x - y; }
    else if (i < 8) { const x = n(3, 12), y = n(3, 12); t = `${x} × ${y}`; ans = x * y; }
    else { const x = n(2, 9), y = n(2, 9), z = n(5, 40); t = `${x} × ${y} + ${z}`; ans = x * y + z; }
    return { prompt: t, hint: "Solve it", answer: String(ans) };
  }
  const RACE = {
    scramble: { total: 8, secs: 25, lock: 700, make(s) {
      let pick; do pick = SCRAMBLE[rnd(SCRAMBLE.length)]; while (s.used.includes(pick[0]));
      s.used.push(pick[0]);
      return { prompt: scramble(pick[0]).toUpperCase(), hint: pick[1], answer: pick[0] };
    }, check: (text, q) => text.trim().toLowerCase() === q.answer },
    mathrace: { total: 10, secs: 15, lock: 1500, make: (s) => mathQ(s.i), check: (text, q) => /^-?\d+$/.test(text.trim().replace(/[−–]/g, "-")) && String(parseInt(text.trim().replace(/[−–]/g, "-"), 10)) === q.answer },
  };
  function raceNext(r) {
    const s = r.state;
    clearTimeout(s.timer);
    s.i++;
    if (s.i >= s.total) { s.phase = "done"; return push(r); }
    s.q = RACE[r.game].make(s);
    s.phase = "asking"; s.roundWinner = null; s.lock = {};
    s.endsAt = Date.now() + s.secs * 1000;
    push(r);
    s.timer = setTimeout(() => raceReveal(r, null), s.secs * 1000);
  }
  function raceReveal(r, winner) {
    const s = r.state;
    if (!s || s.phase !== "asking") return;
    clearTimeout(s.timer);
    s.phase = "reveal"; s.roundWinner = winner;
    push(r);
    s.timer = setTimeout(() => raceNext(r), 2600);
  }
  const raceGame = {
    start(r) {
      const cfg = RACE[r.game];
      r.state = { i: -1, total: cfg.total, secs: cfg.secs, phase: "idle", q: null, used: [], lock: {}, roundWinner: null, endsAt: 0, scores: Object.fromEntries(r.players.map((p) => [p.id, 0])) };
      raceNext(r);
    },
    view(r) {
      const s = r.state;
      return {
        i: s.i, total: s.total, phase: s.phase, scores: s.scores, secs: s.secs,
        left: Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000)),
        prompt: s.q && s.q.prompt, hint: s.q && s.q.hint,
        reveal: s.phase === "reveal" ? { answer: s.q.answer, winner: s.roundWinner } : null,
      };
    },
    done: (r) => r.state.phase === "done",
  };
  games.scramble = raceGame;
  games.mathrace = raceGame;

  // =====================================================================
  // QUICK DRAW (reaction duel, first to 3)
  // =====================================================================
  function qdRound(r) {
    const s = r.state;
    clearTimeout(s.timer);
    s.phase = "wait"; s.result = null;
    push(r);
    s.timer = setTimeout(() => { s.phase = "go"; s.goAt = Date.now(); push(r); }, 1800 + rnd(3600));
  }
  function qdEnd(r, winner, extra) {
    const s = r.state;
    clearTimeout(s.timer);
    s.scores[winner]++;
    s.phase = "reveal"; s.result = { winner, ...extra };
    push(r);
    s.timer = setTimeout(() => {
      if (s.scores[winner] >= s.target) { s.winner = winner; s.phase = "done"; push(r); }
      else { s.round++; qdRound(r); }
    }, 2400);
  }
  games.quickdraw = {
    start(r) {
      r.state = { phase: "idle", scores: Object.fromEntries(r.players.map((p) => [p.id, 0])), round: 1, target: 3, goAt: 0, result: null, winner: null, timer: null };
      qdRound(r);
    },
    view(r) {
      const s = r.state;
      return { phase: s.phase, scores: s.scores, round: s.round, target: s.target, result: s.result, winner: s.winner };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // socket events
  // =====================================================================
  function register(socket, mine) {
    const get = (game) => {
      const r = mine(socket);
      return r && r.game === game && r.state ? r : null;
    };
    const pos = (p, max) => Array.isArray(p) && isInt(p[0]) && isInt(p[1]) && p[0] >= 0 && p[1] >= 0 && p[0] < max && p[1] < max;

    socket.on("rt:sync", () => {
      const r = mine(socket);
      const g = r && games[r.game];
      if (g && g.snap && r.state) socket.emit("rt:state", g.snap(r));
    });

    socket.on("bs:fire", (p) => {
      const r = get("battleship");
      if (!r || !pos(p, 10)) return;
      const s = r.state;
      if (s.winner || s.turn !== socket.id) return;
      const [y, x] = p;
      if (s.shots[socket.id][y][x]) return;
      const o = other(r, socket.id).id;
      const si = s.grid[o][y][x];
      if (si < 0) {
        s.shots[socket.id][y][x] = 1;
        s.last = { by: socket.id, y, x, res: "miss" };
      } else {
        s.shots[socket.id][y][x] = 2;
        s.hp[o][si]--;
        const sunk = s.hp[o][si] === 0;
        s.last = { by: socket.id, y, x, res: sunk ? "sunk" : "hit", ship: FLEET[si][0] };
        if (s.hp[o].every((h) => h === 0)) s.winner = socket.id;
      }
      if (!s.winner) s.turn = o;
      push(r);
    });

    socket.on("db:line", (d = {}) => {
      const r = get("dots");
      if (!r) return;
      const s = r.state;
      if (s.winner || s.turn !== socket.id || !isInt(d.r) || !isInt(d.c)) return;
      let completed = 0;
      if (d.t === "h") {
        if (d.r < 0 || d.r > DB || d.c < 0 || d.c >= DB || s.h[d.r][d.c]) return;
        s.h[d.r][d.c] = socket.id;
        for (const by of [d.r - 1, d.r]) if (dbBoxDone(s, by, d.c) && !s.boxes[by][d.c]) { s.boxes[by][d.c] = socket.id; completed++; }
      } else if (d.t === "v") {
        if (d.r < 0 || d.r >= DB || d.c < 0 || d.c > DB || s.v[d.r][d.c]) return;
        s.v[d.r][d.c] = socket.id;
        for (const bx of [d.c - 1, d.c]) if (dbBoxDone(s, d.r, bx) && !s.boxes[d.r][bx]) { s.boxes[d.r][bx] = socket.id; completed++; }
      } else return;
      s.last = { t: d.t, r: d.r, c: d.c };
      s.scores[socket.id] += completed;
      const total = Object.values(s.scores).reduce((a, b) => a + b, 0);
      if (total >= DB * DB) {
        const [a, b] = r.players;
        s.winner = s.scores[a.id] === s.scores[b.id] ? "draw" : s.scores[a.id] > s.scores[b.id] ? a.id : b.id;
      } else if (!completed) s.turn = other(r, socket.id).id;
      push(r);
    });

    socket.on("rv:move", (p) => {
      const r = get("reversi");
      if (!r || !pos(p, 8)) return;
      const s = r.state, c = s.colors[socket.id];
      if (s.winner || c !== s.turn) return;
      const [y, x] = p;
      const flips = rvFlips(s.board, y, x, c);
      if (!flips.length) return;
      s.board[y][x] = c;
      flips.forEach(([fy, fx]) => (s.board[fy][fx] = c));
      s.last = [y, x]; s.flipped = flips; s.passed = null;
      const opp = c === "B" ? "W" : "B";
      if (rvMoves(s.board, opp).length) s.turn = opp;
      else if (rvMoves(s.board, c).length) s.passed = opp;
      else {
        const n = rvCount(s.board);
        s.winner = n.B === n.W ? "draw" : n.B > n.W ? "B" : "W";
      }
      push(r);
    });

    socket.on("gm:place", (p) => {
      const r = get("gomoku");
      if (!r || !pos(p, GM)) return;
      const s = r.state, c = s.colors[socket.id];
      if (s.winner || c !== s.turn) return;
      const [y, x] = p;
      if (s.board[y][x]) return;
      s.board[y][x] = c; s.last = [y, x]; s.moves++;
      const line = gmLine(s.board, y, x, c);
      if (line) { s.winner = c; s.line = line; }
      else if (s.moves >= GM * GM) s.winner = "draw";
      else s.turn = c === "B" ? "W" : "B";
      push(r);
    });

    socket.on("sn:dir", (d) => {
      const r = get("snake");
      const v = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[d];
      if (!r || !v || r.state.winner) return;
      const k = r.state.snakes.find((x) => x.id === socket.id);
      if (!k || (v[0] === -k.dir[0] && v[1] === -k.dir[1] && (v[0] !== 0 || v[1] !== 0))) return;
      k.next = v;
    });

    socket.on("pg:y", (y) => {
      const r = get("pong");
      if (!r || !Number.isFinite(y)) return;
      const p = r.state.pad.find((q) => q.id === socket.id);
      if (p) p.t = clamp(y - PG.PH / 2, 0, PG.H - PG.PH);
    });

    socket.on("tk:input", (d) => {
      const r = get("tanks");
      if (!r || !d) return;
      const t = r.state.tanks.find((q) => q.id === socket.id);
      if (!t) return;
      t.inp = { f: !!d.f, b: !!d.b, l: !!d.l, r: !!d.r, fire: !!d.fire };
      if (Number.isFinite(d.aim)) t.t = d.aim;
    });

    socket.on("race:guess", (text) => {
      const r = mine(socket);
      if (!r || !RACE[r.game] || !r.state || r.state.phase !== "asking" || typeof text !== "string") return;
      const s = r.state, now = Date.now();
      if ((s.lock[socket.id] || 0) > now) return;
      if (RACE[r.game].check(text.slice(0, 40), s.q)) {
        s.scores[socket.id]++;
        raceReveal(r, socket.id);
      } else {
        const ms = RACE[r.game].lock;
        s.lock[socket.id] = now + ms;
        socket.emit("race:miss", ms);
      }
    });

    more.register(socket, mine);

    socket.on("qd:hit", () => {
      const r = get("quickdraw");
      if (!r) return;
      const s = r.state, o = other(r, socket.id);
      if (!o) return;
      if (s.phase === "wait") qdEnd(r, o.id, { foul: socket.id });
      else if (s.phase === "go") qdEnd(r, socket.id, { ms: Date.now() - s.goAt });
    });
  }

  return { games, register, perViewer: new Set(["battleship"]), view: (r, v) => games[r.game].view(r, v) };
};
