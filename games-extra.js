// Server-side logic for the extra games. Loaded by server.js.
// Games: battleship, dots, reversi, gomoku, snake, pong, tanks, scramble, mathrace, quickdraw
const rnd = (n) => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isInt = Number.isInteger;

module.exports = function createExtra({ io, sys, push }) {
  const games = {};
  const other = (r, id) => r.players.find((p) => p.id !== id);
  const emitRT = (r) => io.to(r.code).emit("rt:state", games[r.game].snap(r));

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
  // CHESS
  // =====================================================================
  const CH_PCS = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  function chInit() {
    return [
      ["r","n","b","q","k","b","n","r"],
      ["p","p","p","p","p","p","p","p"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["P","P","P","P","P","P","P","P"],
      ["R","N","B","Q","K","B","N","R"],
    ];
  }
  function chSide(pc) { return pc ? (pc === pc.toUpperCase() ? "w" : "b") : null; }
  function chClone(b) { return b.map((r) => r.slice()); }
  function chFindKing(b, side) {
    const k = side === "w" ? "K" : "k";
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (b[y][x] === k) return [y, x];
    return null;
  }
  function chAttacked(b, y, x, bySide) {
    const enemy = bySide === "w";
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    // knights
    for (const [dy, dx] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const ny = y + dy, nx = x + dx;
      if (ny < 0 || nx < 0 || ny > 7 || nx > 7) continue;
      const p = b[ny][nx];
      if (p && chSide(p) === bySide && p.toLowerCase() === "n") return true;
    }
    // king
    for (const [dy, dx] of dirs) {
      const ny = y + dy, nx = x + dx;
      if (ny < 0 || nx < 0 || ny > 7 || nx > 7) continue;
      const p = b[ny][nx];
      if (p && chSide(p) === bySide && p.toLowerCase() === "k") return true;
    }
    // pawns
    const pdir = bySide === "w" ? -1 : 1;
    for (const dx of [-1, 1]) {
      const ny = y + pdir, nx = x + dx;
      if (ny < 0 || nx < 0 || ny > 7 || nx > 7) continue;
      const p = b[ny][nx];
      if (p && chSide(p) === bySide && p.toLowerCase() === "p") return true;
    }
    // sliding
    for (const [dy, dx] of dirs) {
      for (let i = 1; i < 8; i++) {
        const ny = y + dy * i, nx = x + dx * i;
        if (ny < 0 || nx < 0 || ny > 7 || nx > 7) break;
        const p = b[ny][nx];
        if (!p) continue;
        if (chSide(p) !== bySide) break;
        const t = p.toLowerCase();
        const diag = dy !== 0 && dx !== 0;
        const orth = dy === 0 || dx === 0;
        if (t === "q") return true;
        if (t === "b" && diag) return true;
        if (t === "r" && orth) return true;
        break;
      }
    }
    return false;
  }
  function chInCheck(b, side) {
    const k = chFindKing(b, side);
    if (!k) return true;
    return chAttacked(b, k[0], k[1], side === "w" ? "b" : "w");
  }
  function chMoves(b, y, x) {
    const pc = b[y][x];
    if (!pc) return [];
    const side = chSide(pc);
    const t = pc.toLowerCase();
    const out = [];
    const add = (ny, nx) => {
      if (ny < 0 || nx < 0 || ny > 7 || nx > 7) return false;
      const tgt = b[ny][nx];
      if (tgt && chSide(tgt) === side) return false;
      out.push([ny, nx]);
      return !tgt;
    };
    if (t === "p") {
      const dir = side === "w" ? -1 : 1;
      const start = side === "w" ? 6 : 1;
      if (!b[y + dir]?.[x]) {
        out.push([y + dir, x]);
        if (y === start && !b[y + dir * 2]?.[x]) out.push([y + dir * 2, x]);
      }
      for (const dx of [-1, 1]) {
        const ny = y + dir, nx = x + dx;
        if (ny < 0 || nx < 0 || ny > 7 || nx > 7) continue;
        if (b[ny][nx] && chSide(b[ny][nx]) !== side) out.push([ny, nx]);
      }
    } else if (t === "n") {
      for (const [dy, dx] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(y + dy, x + dx);
    } else if (t === "k") {
      for (const [dy, dx] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) add(y + dy, x + dx);
    } else {
      const dirs = t === "b" ? [[-1,-1],[-1,1],[1,-1],[1,1]]
        : t === "r" ? [[-1,0],[1,0],[0,-1],[0,1]]
        : [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      for (const [dy, dx] of dirs) {
        for (let i = 1; i < 8; i++) if (!add(y + dy * i, x + dx * i)) break;
      }
    }
    // filter moves that leave own king in check
    return out.filter(([ny, nx]) => {
      const nb = chClone(b);
      nb[ny][nx] = nb[y][x];
      nb[y][x] = null;
      // promote for check test
      if (nb[ny][nx].toLowerCase() === "p" && (ny === 0 || ny === 7)) nb[ny][nx] = side === "w" ? "Q" : "q";
      return !chInCheck(nb, side);
    });
  }
  function chHasMoves(b, side) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if (chSide(b[y][x]) === side && chMoves(b, y, x).length) return true;
    }
    return false;
  }
  games.chess = {
    start(r) {
      const [a, b] = r.players;
      r.state = { board: chInit(), turn: "w", ids: { w: a.id, b: b.id }, winner: null, last: null, check: false };
    },
    view: (r) => ({ ...r.state }),
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // SNAKES AND LADDERS
  // =====================================================================
  const SNL_SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
  const SNL_LADDERS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
  games.snakesladders = {
    start(r) {
      const [a, b] = r.players;
      r.state = {
        pos: { [a.id]: 0, [b.id]: 0 },
        turn: a.id, winner: null, last: null, rolling: false,
      };
    },
    view: (r) => ({ ...r.state, snakes: SNL_SNAKES, ladders: SNL_LADDERS }),
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // PIXEL FIGHTER (realtime side-view)
  // =====================================================================
  const FG = { W: 800, H: 360, FLOOR: 300 };
  function fgTick(r) {
    const s = r.state;
    if (!s || s.winner) return;
    s.cool = Math.max(0, (s.cool || 0) - 1);
    for (const f of s.f) {
      if (f.hit > 0) f.hit--;
      if (f.atk > 0) f.atk--;
      const inp = f.inp || {};
      const facing = f.id === s.f[0].id ? 1 : -1;
      // opponent relative
      const opp = s.f.find((q) => q.id !== f.id);
      if (opp && f.x < opp.x) f.face = 1; else f.face = -1;
      if (f.hit > 0) continue;
      let dx = 0;
      if (inp.l) dx -= 1;
      if (inp.r) dx += 1;
      f.x = clamp(f.x + dx * 4.2, 40, FG.W - 40);
      // gravity / jump
      if (inp.u && f.y >= FG.FLOOR) f.vy = -11;
      f.vy = (f.vy || 0) + 0.55;
      f.y = Math.min(FG.FLOOR, f.y + f.vy);
      if (f.y >= FG.FLOOR) { f.y = FG.FLOOR; f.vy = 0; }
      if (inp.punch && f.atk === 0 && f.cool === 0) {
        f.atk = 12; f.cool = 18; f.kind = "p";
      } else if (inp.kick && f.atk === 0 && f.cool === 0) {
        f.atk = 16; f.cool = 26; f.kind = "k";
      }
      if (f.atk === 8 || f.atk === 10) {
        // active frames
        const range = f.kind === "k" ? 70 : 52;
        const dmg = f.kind === "k" ? 14 : 9;
        if (opp && Math.abs(f.x - opp.x) < range && Math.abs(f.y - opp.y) < 50 && opp.hit === 0) {
          opp.hp = Math.max(0, opp.hp - dmg);
          opp.hit = 14;
          opp.x = clamp(opp.x + f.face * 18, 40, FG.W - 40);
          if (opp.hp <= 0) {
            f.wins = (f.wins || 0) + 1;
            if (f.wins >= 2) s.winner = f.id;
            else {
              s.round = (s.round || 1) + 1;
              s.f.forEach((q, i) => { q.hp = 100; q.x = i ? 620 : 180; q.y = FG.FLOOR; q.hit = 0; q.atk = 0; });
            }
          }
        }
      }
      f.cool = Math.max(0, (f.cool || 0) - 1);
    }
    // separate overlap
    const [a, b] = s.f;
    if (Math.abs(a.x - b.x) < 36) {
      const mid = (a.x + b.x) / 2;
      a.x = mid - 18; b.x = mid + 18;
    }
    emitRT(r);
  }
  games.fighter = {
    start(r) {
      const [a, b] = r.players;
      r.state = {
        f: [
          { id: a.id, x: 180, y: FG.FLOOR, hp: 100, face: 1, atk: 0, cool: 0, hit: 0, wins: 0, inp: {} },
          { id: b.id, x: 620, y: FG.FLOOR, hp: 100, face: -1, atk: 0, cool: 0, hit: 0, wins: 0, inp: {} },
        ],
        round: 1, target: 2, winner: null,
      };
      if (r._fgTick) clearInterval(r._fgTick);
      r._fgTick = setInterval(() => fgTick(r), 33);
    },
    view: (r) => ({ ids: r.state.f.map((f) => f.id), winner: r.state.winner, round: r.state.round, target: r.state.target }),
    snap: (r) => {
      const s = r.state;
      return {
        f: s.f.map((f) => [f.id, Math.round(f.x), Math.round(f.y), f.hp, f.face, f.atk, f.kind || "", f.hit, f.wins || 0]),
        round: s.round, target: s.target, winner: s.winner,
      };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // MAZE CHASE
  // =====================================================================
  const MZ = { W: 21, H: 15, C: 28 };
  function mazeGen() {
    // simple open maze with walls on odd cells pattern + borders
    const g = Array.from({ length: MZ.H }, (_, y) =>
      Array.from({ length: MZ.W }, (_, x) => (x === 0 || y === 0 || x === MZ.W - 1 || y === MZ.H - 1 || (x % 2 === 0 && y % 2 === 0)) ? 1 : 0)
    );
    // punch some corridors
    for (let i = 0; i < 40; i++) {
      const x = 1 + rnd(MZ.W - 2), y = 1 + rnd(MZ.H - 2);
      g[y][x] = 0;
    }
    return g;
  }
  function mazeTick(r) {
    const s = r.state;
    if (!s || s.winner) return;
    for (const p of s.p) {
      const inp = p.inp || {};
      let nx = p.x, ny = p.y;
      if (inp.u) ny -= 1;
      else if (inp.d) ny += 1;
      else if (inp.l) nx -= 1;
      else if (inp.r) nx += 1;
      if (nx >= 0 && ny >= 0 && nx < MZ.W && ny < MZ.H && !s.grid[ny][nx]) {
        p.x = nx; p.y = ny;
      }
      p.inp = {}; // step-based
    }
    const [a, b] = s.p;
    if (a.x === b.x && a.y === b.y) {
      // hunter catches
      const hunter = s.p.find((p) => p.role === "h");
      const prey = s.p.find((p) => p.role === "p");
      hunter.score = (hunter.score || 0) + 1;
      if (hunter.score >= 3) s.winner = hunter.id;
      else {
        // swap roles and reset positions
        for (const p of s.p) {
          p.role = p.role === "h" ? "p" : "h";
          p.x = p.role === "h" ? 1 : MZ.W - 2;
          p.y = p.role === "h" ? 1 : MZ.H - 2;
        }
        s.round = (s.round || 1) + 1;
      }
    }
    emitRT(r);
  }
  games.maze = {
    start(r) {
      const [a, b] = r.players;
      const grid = mazeGen();
      r.state = {
        grid,
        p: [
          { id: a.id, x: 1, y: 1, role: "h", score: 0, inp: {} },
          { id: b.id, x: MZ.W - 2, y: MZ.H - 2, role: "p", score: 0, inp: {} },
        ],
        round: 1, winner: null,
      };
      if (r._mzTick) clearInterval(r._mzTick);
      r._mzTick = setInterval(() => mazeTick(r), 120);
    },
    view: (r) => ({ ids: r.state.p.map((p) => p.id), winner: r.state.winner, round: r.state.round }),
    snap: (r) => {
      const s = r.state;
      return {
        grid: s.grid,
        p: s.p.map((p) => [p.id, p.x, p.y, p.role, p.score || 0]),
        round: s.round, winner: s.winner, w: MZ.W, h: MZ.H,
      };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // PONG SHOWDOWN (faster, first to 11)
  // =====================================================================
  const PS = { W: 800, H: 500, PH: 100, PW: 12, BS: 9, WIN: 11 };
  function psTick(r) {
    const s = r.state;
    if (!s || s.winner) return;
    // move paddles toward targets
    for (const p of s.pad) p.y += (p.t - p.y) * 0.35;
    s.ball.x += s.ball.vx;
    s.ball.y += s.ball.vy;
    if (s.ball.y < 8 || s.ball.y > PS.H - 8) { s.ball.vy *= -1; s.ball.y = clamp(s.ball.y, 8, PS.H - 8); }
    for (let i = 0; i < 2; i++) {
      const p = s.pad[i];
      const px = i ? PS.W - 30 - PS.PW : 30;
      if (s.ball.x > px - 6 && s.ball.x < px + PS.PW + 6 && s.ball.y > p.y && s.ball.y < p.y + PS.PH) {
        s.ball.vx = (i ? -1 : 1) * Math.min(16, Math.abs(s.ball.vx) * 1.06 + 0.3);
        const rel = (s.ball.y - (p.y + PS.PH / 2)) / (PS.PH / 2);
        s.ball.vy = rel * 8;
        s.ball.x = i ? px - 6 : px + PS.PW + 6;
      }
    }
    if (s.ball.x < 0) {
      s.pad[1].score++;
      if (s.pad[1].score >= PS.WIN) s.winner = s.pad[1].id;
      s.ball = { x: 400, y: 250, vx: 6, vy: (Math.random() * 4 - 2) };
    } else if (s.ball.x > PS.W) {
      s.pad[0].score++;
      if (s.pad[0].score >= PS.WIN) s.winner = s.pad[0].id;
      s.ball = { x: 400, y: 250, vx: -6, vy: (Math.random() * 4 - 2) };
    }
    emitRT(r);
  }
  games.pongshow = {
    start(r) {
      const [a, b] = r.players;
      r.state = {
        pad: [
          { id: a.id, y: 200, t: 200, score: 0 },
          { id: b.id, y: 200, t: 200, score: 0 },
        ],
        ball: { x: 400, y: 250, vx: 6, vy: 2 },
        winner: null,
      };
      if (r._psTick) clearInterval(r._psTick);
      r._psTick = setInterval(() => psTick(r), 16);
    },
    view: (r) => ({ ids: r.state.pad.map((p) => p.id), winner: r.state.winner, target: PS.WIN }),
    snap: (r) => {
      const s = r.state;
      return {
        p: s.pad.map((p) => [Math.round(p.y), p.score]),
        b: [Math.round(s.ball.x), Math.round(s.ball.y), +s.ball.vx.toFixed(2), +s.ball.vy.toFixed(2)],
        winner: s.winner,
      };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // MINI RACING
  // =====================================================================
  const RC = { W: 800, H: 500 };
  function raceTrackDist(x, y) {
    // oval track center 400,250 radii 280x160
    const dx = (x - 400) / 280, dy = (y - 250) / 160;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function racingTick(r) {
    const s = r.state;
    if (!s || s.winner) return;
    for (const c of s.cars) {
      const inp = c.inp || {};
      if (inp.l) c.a -= 0.07;
      if (inp.r) c.a += 0.07;
      if (inp.f) c.spd = Math.min(6.5, c.spd + 0.18);
      else if (inp.b) c.spd = Math.max(-2.5, c.spd - 0.2);
      else c.spd *= 0.98;
      c.x += Math.cos(c.a) * c.spd;
      c.y += Math.sin(c.a) * c.spd;
      // soft walls for track
      const d = raceTrackDist(c.x, c.y);
      if (d < 0.45 || d > 1.05) {
        c.spd *= 0.7;
        // push back toward ring
        const ang = Math.atan2(c.y - 250, c.x - 400);
        const target = d < 0.45 ? 0.5 : 1.0;
        c.x = 400 + Math.cos(ang) * 280 * target;
        c.y = 250 + Math.sin(ang) * 160 * target;
      }
      // lap detection via checkpoint angle
      let ang = Math.atan2(c.y - 250, c.x - 400);
      if (ang < 0) ang += Math.PI * 2;
      if (c.prevAng !== undefined) {
        // crossing finish (angle near 0 from high)
        if (c.prevAng > 5.5 && ang < 0.8 && c.spd > 0) {
          c.laps = (c.laps || 0) + 1;
          if (c.laps >= 3) s.winner = c.id;
        }
      }
      c.prevAng = ang;
    }
    emitRT(r);
  }
  games.racing = {
    start(r) {
      const [a, b] = r.players;
      r.state = {
        cars: [
          { id: a.id, x: 400 + 280, y: 250, a: Math.PI / 2, spd: 0, laps: 0, inp: {} },
          { id: b.id, x: 400 + 250, y: 250, a: Math.PI / 2, spd: 0, laps: 0, inp: {} },
        ],
        winner: null,
      };
      if (r._rcTick) clearInterval(r._rcTick);
      r._rcTick = setInterval(() => racingTick(r), 33);
    },
    view: (r) => ({ ids: r.state.cars.map((c) => c.id), winner: r.state.winner }),
    snap: (r) => {
      const s = r.state;
      return {
        c: s.cars.map((c) => [c.id, Math.round(c.x), Math.round(c.y), +c.a.toFixed(2), c.laps || 0, +c.spd.toFixed(2)]),
        winner: s.winner,
      };
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

    socket.on("qd:hit", () => {
      const r = get("quickdraw");
      if (!r) return;
      const s = r.state, o = other(r, socket.id);
      if (!o) return;
      if (s.phase === "wait") qdEnd(r, o.id, { foul: socket.id });
      else if (s.phase === "go") qdEnd(r, socket.id, { ms: Date.now() - s.goAt });
  
    socket.on("ch:move", (d = {}) => {
      const r = get("chess");
      if (!r || !isInt(d.fy) || !isInt(d.fx) || !isInt(d.ty) || !isInt(d.tx)) return;
      const s = r.state;
      if (s.winner) return;
      const side = s.turn;
      if (s.ids[side] !== socket.id) return;
      const moves = chMoves(s.board, d.fy, d.fx);
      if (!moves.some(([y, x]) => y === d.ty && x === d.tx)) return;
      const pc = s.board[d.fy][d.fx];
      s.board[d.ty][d.tx] = pc;
      s.board[d.fy][d.fx] = null;
      if (pc.toLowerCase() === "p" && (d.ty === 0 || d.ty === 7)) s.board[d.ty][d.tx] = side === "w" ? "Q" : "q";
      s.last = [d.fy, d.fx, d.ty, d.tx];
      const opp = side === "w" ? "b" : "w";
      s.turn = opp;
      s.check = chInCheck(s.board, opp);
      if (!chHasMoves(s.board, opp)) {
        s.winner = s.check ? s.ids[side] : "draw";
      }
      push(r);
    });

    socket.on("snl:roll", () => {
      const r = get("snakesladders");
      if (!r) return;
      const s = r.state;
      if (s.winner || s.turn !== socket.id || s.rolling) return;
      s.rolling = true;
      const die = 1 + rnd(6);
      let pos = s.pos[socket.id] + die;
      if (pos > 100) pos = s.pos[socket.id]; // bounce rule simplified: stay if overshoot
      else {
        if (SNL_LADDERS[pos]) pos = SNL_LADDERS[pos];
        if (SNL_SNAKES[pos]) pos = SNL_SNAKES[pos];
      }
      s.pos[socket.id] = pos;
      s.last = { by: socket.id, die, pos };
      if (pos >= 100) s.winner = socket.id;
      else if (die !== 6) s.turn = other(r, socket.id).id; // extra turn on 6
      s.rolling = false;
      push(r);
    });

    socket.on("fg:input", (d) => {
      const r = get("fighter");
      if (!r || !d) return;
      const f = r.state.f.find((q) => q.id === socket.id);
      if (f) f.inp = { l: !!d.l, r: !!d.r, u: !!d.u, punch: !!d.punch, kick: !!d.kick };
    });

    socket.on("mz:dir", (d) => {
      const r = get("maze");
      if (!r || !d) return;
      const p = r.state.p.find((q) => q.id === socket.id);
      if (p) p.inp = { u: d === "u", d: d === "d", l: d === "l", r: d === "r" };
    });

    socket.on("ps:y", (y) => {
      const r = get("pongshow");
      if (!r || !Number.isFinite(y)) return;
      const p = r.state.pad.find((q) => q.id === socket.id);
      if (p) p.t = clamp(y - PS.PH / 2, 0, PS.H - PS.PH);
    });

    socket.on("rc:input", (d) => {
      const r = get("racing");
      if (!r || !d) return;
      const c = r.state.cars.find((q) => q.id === socket.id);
      if (c) c.inp = { f: !!d.f, b: !!d.b, l: !!d.l, r: !!d.r };
    });

  });

    socket.on("ch:move", (d = {}) => {
      const r = get("chess");
      if (!r || !isInt(d.fy) || !isInt(d.fx) || !isInt(d.ty) || !isInt(d.tx)) return;
      const s = r.state;
      if (s.winner) return;
      const side = s.turn;
      if (s.ids[side] !== socket.id) return;
      const moves = chMoves(s.board, d.fy, d.fx);
      if (!moves.some(([y, x]) => y === d.ty && x === d.tx)) return;
      const pc = s.board[d.fy][d.fx];
      s.board[d.ty][d.tx] = pc;
      s.board[d.fy][d.fx] = null;
      if (pc.toLowerCase() === "p" && (d.ty === 0 || d.ty === 7)) s.board[d.ty][d.tx] = side === "w" ? "Q" : "q";
      s.last = [d.fy, d.fx, d.ty, d.tx];
      const opp = side === "w" ? "b" : "w";
      s.turn = opp;
      s.check = chInCheck(s.board, opp);
      if (!chHasMoves(s.board, opp)) {
        s.winner = s.check ? s.ids[side] : "draw";
      }
      push(r);
    });

    socket.on("snl:roll", () => {
      const r = get("snakesladders");
      if (!r) return;
      const s = r.state;
      if (s.winner || s.turn !== socket.id || s.rolling) return;
      s.rolling = true;
      const die = 1 + rnd(6);
      let pos = s.pos[socket.id] + die;
      if (pos > 100) pos = s.pos[socket.id]; // bounce rule simplified: stay if overshoot
      else {
        if (SNL_LADDERS[pos]) pos = SNL_LADDERS[pos];
        if (SNL_SNAKES[pos]) pos = SNL_SNAKES[pos];
      }
      s.pos[socket.id] = pos;
      s.last = { by: socket.id, die, pos };
      if (pos >= 100) s.winner = socket.id;
      else if (die !== 6) s.turn = other(r, socket.id).id; // extra turn on 6
      s.rolling = false;
      push(r);
    });

    socket.on("fg:input", (d) => {
      const r = get("fighter");
      if (!r || !d) return;
      const f = r.state.f.find((q) => q.id === socket.id);
      if (f) f.inp = { l: !!d.l, r: !!d.r, u: !!d.u, punch: !!d.punch, kick: !!d.kick };
    });

    socket.on("mz:dir", (d) => {
      const r = get("maze");
      if (!r || !d) return;
      const p = r.state.p.find((q) => q.id === socket.id);
      if (p) p.inp = { u: d === "u", d: d === "d", l: d === "l", r: d === "r" };
    });

    socket.on("ps:y", (y) => {
      const r = get("pongshow");
      if (!r || !Number.isFinite(y)) return;
      const p = r.state.pad.find((q) => q.id === socket.id);
      if (p) p.t = clamp(y - PS.PH / 2, 0, PS.H - PS.PH);
    });

    socket.on("rc:input", (d) => {
      const r = get("racing");
      if (!r || !d) return;
      const c = r.state.cars.find((q) => q.id === socket.id);
      if (c) c.inp = { f: !!d.f, b: !!d.b, l: !!d.l, r: !!d.r };
    });

  }

  return { games, register, perViewer: new Set(["battleship"]), view: (r, v) => games[r.game].view(r, v) };
};
