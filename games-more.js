// Server-side logic for: chess, ladders (Snakes & Ladders), fighter (Pixel Fighter),
// maze (Maze Chase), pongx (Pong Showdown), racing (Mini Racing).
// Loaded by games-extra.js, which shares its `games` registry with this file.
const rnd = (n) => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isInt = Number.isInteger;

module.exports = function createMore({ io, sys, push, games, other, emitRT }) {
  // =====================================================================
  // CHESS  (full rules: check, mate, stalemate, castling, en passant, promotion)
  // board[row][col], row 0 = rank 8 (black side). Pieces are "wK", "bP", ...
  // =====================================================================
  const BACK = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const BD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const RD = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const cIn = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  function chInit() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let c = 0; c < 8; c++) { b[0][c] = "b" + BACK[c]; b[1][c] = "bP"; b[6][c] = "wP"; b[7][c] = "w" + BACK[c]; }
    return b;
  }
  function chAttacked(b, r, c, by) {
    const pr = by === "w" ? r + 1 : r - 1;
    for (const dc of [-1, 1]) if (cIn(pr, c + dc) && b[pr][c + dc] === by + "P") return true;
    for (const [dr, dc] of KN) { const y = r + dr, x = c + dc; if (cIn(y, x) && b[y][x] === by + "N") return true; }
    for (const [dr, dc] of KG) { const y = r + dr, x = c + dc; if (cIn(y, x) && b[y][x] === by + "K") return true; }
    for (const [dirs, types] of [[BD, "BQ"], [RD, "RQ"]]) {
      for (const [dr, dc] of dirs) {
        let y = r + dr, x = c + dc;
        while (cIn(y, x)) {
          const p = b[y][x];
          if (p) { if (p[0] === by && types.includes(p[1])) return true; break; }
          y += dr; x += dc;
        }
      }
    }
    return false;
  }
  const chKing = (b, color) => {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c] === color + "K") return [r, c];
    return null;
  };
  const chInCheck = (b, color) => {
    const k = chKing(b, color);
    return !!k && chAttacked(b, k[0], k[1], color === "w" ? "b" : "w");
  };

  function chPseudo(s, color) {
    const b = s.board, out = [], opp = color === "w" ? "b" : "w";
    const add = (r, c, y, x, extra) => out.push({ from: [r, c], to: [y, x], ...extra });
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p || p[0] !== color) continue;
        const t = p[1];
        if (t === "P") {
          const dir = color === "w" ? -1 : 1, start = color === "w" ? 6 : 1, last = color === "w" ? 0 : 7;
          const promo = (y) => (y === last ? { promo: true } : {});
          if (cIn(r + dir, c) && !b[r + dir][c]) {
            add(r, c, r + dir, c, promo(r + dir));
            if (r === start && !b[r + 2 * dir][c]) add(r, c, r + 2 * dir, c, { dbl: true });
          }
          for (const dc of [-1, 1]) {
            const y = r + dir, x = c + dc;
            if (!cIn(y, x)) continue;
            if (b[y][x] && b[y][x][0] === opp) add(r, c, y, x, promo(y));
            else if (s.ep && s.ep[0] === y && s.ep[1] === x) add(r, c, y, x, { ep: true });
          }
        } else if (t === "N" || t === "K") {
          for (const [dr, dc] of t === "N" ? KN : KG) {
            const y = r + dr, x = c + dc;
            if (cIn(y, x) && (!b[y][x] || b[y][x][0] === opp)) add(r, c, y, x);
          }
          if (t === "K") {
            const home = color === "w" ? 7 : 0;
            if (r === home && c === 4 && !chAttacked(b, home, 4, opp)) {
              if (s.castle[color + "K"] && b[home][7] === color + "R" && !b[home][5] && !b[home][6] &&
                  !chAttacked(b, home, 5, opp) && !chAttacked(b, home, 6, opp)) add(r, c, home, 6, { castle: "K" });
              if (s.castle[color + "Q"] && b[home][0] === color + "R" && !b[home][1] && !b[home][2] && !b[home][3] &&
                  !chAttacked(b, home, 3, opp) && !chAttacked(b, home, 2, opp)) add(r, c, home, 2, { castle: "Q" });
            }
          }
        } else {
          const dirs = t === "B" ? BD : t === "R" ? RD : [...BD, ...RD];
          for (const [dr, dc] of dirs) {
            let y = r + dr, x = c + dc;
            while (cIn(y, x)) {
              if (!b[y][x]) add(r, c, y, x);
              else { if (b[y][x][0] === opp) add(r, c, y, x); break; }
              y += dr; x += dc;
            }
          }
        }
      }
    }
    return out;
  }
  // returns a new board with the move applied (used for legality and for the real move)
  function chBoardAfter(b, m, color, promoPiece) {
    const nb = b.map((row) => row.slice());
    const [fr, fc] = m.from, [tr, tc] = m.to;
    let piece = nb[fr][fc];
    nb[fr][fc] = null;
    if (m.ep) nb[fr][tc] = null;
    if (m.promo) piece = color + (promoPiece || "Q");
    nb[tr][tc] = piece;
    if (m.castle === "K") { nb[tr][5] = nb[tr][7]; nb[tr][7] = null; }
    if (m.castle === "Q") { nb[tr][3] = nb[tr][0]; nb[tr][0] = null; }
    return nb;
  }
  function chLegal(s, color) {
    return chPseudo(s, color).filter((m) => !chInCheck(chBoardAfter(s.board, m, color), color));
  }
  function chInsufficient(b) {
    const minors = [];
    for (const row of b) for (const p of row) {
      if (!p || p[1] === "K") continue;
      if (p[1] === "P" || p[1] === "R" || p[1] === "Q") return false;
      minors.push(p);
    }
    return minors.length <= 1;
  }
  const chKey = (s) => s.board.map((r) => r.map((p) => p || "--").join("")).join("/") + s.turn + JSON.stringify(s.castle) + (s.ep ? s.ep.join("") : "");

  games.chess = {
    start(r) {
      const [a, b] = r.players;
      r.state = {
        board: chInit(), turn: "w", castle: { wK: 1, wQ: 1, bK: 1, bQ: 1 }, ep: null,
        colors: { [a.id]: "w", [b.id]: "b" }, winner: null, reason: null, last: null,
        half: 0, seen: {}, caps: { w: [], b: [] },
      };
      r.state.seen[chKey(r.state)] = 1;
    },
    view(r) {
      const s = r.state;
      const legal = s.winner ? [] : chLegal(s, s.turn);
      const check = !s.winner || s.reason === "checkmate" ? chInCheck(s.board, s.turn) : false;
      return {
        board: s.board, turn: s.turn, winner: s.winner, reason: s.reason, colors: s.colors, last: s.last, caps: s.caps,
        check: check ? chKing(s.board, s.turn) : null,
        moves: legal.map((m) => [m.from[0], m.from[1], m.to[0], m.to[1], m.promo ? 1 : 0]),
      };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // SNAKES & LADDERS  (turn-based, dice rolled on the server)
  // =====================================================================
  const SL_SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
  const SL_LADDERS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
  games.ladders = {
    start(r) {
      const [a, b] = r.players;
      r.state = { pos: { [a.id]: 0, [b.id]: 0 }, turn: a.id, winner: null, last: null, snakes: SL_SNAKES, ladders: SL_LADDERS };
    },
    view: (r) => ({ ...r.state }),
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // PIXEL FIGHTER  (server tick 30Hz, best of 3 rounds)
  // =====================================================================
  const FT = { W: 800, G: 430, SPD: 235, JUMP: 700, GRAV: 2100, ROUND: 45, TARGET: 2, ATK: 15, RANGE: 74 };
  function ftReset(s) {
    s.f.forEach((f, i) => {
      Object.assign(f, { x: i ? 600 : 200, y: 0, vy: 0, hp: 100, face: i ? -1 : 1, st: "idle", t: 0, kb: 0, pa: false, landed: false });
    });
    s.wait = 60; s.over = 0; s.msg = null; s.time = FT.ROUND * 30;
  }
  function ftTick(r, s) {
    if (r.state !== s) return clearInterval(s.timer);
    const dt = 1 / 30;
    if (s.over > 0) {
      if (--s.over === 0) {
        if (s.winner) { clearInterval(s.timer); emitRT(r); return push(r); }
        s.round++; ftReset(s);
      }
    } else if (s.wait > 0) s.wait--;
    else {
      s.time--;
      const [A, B] = s.f;
      for (const f of s.f) {
        const o = f === A ? B : A, i = f.inp || {};
        if (f.st === "hit") {
          if (--f.t <= 0) f.st = "idle";
          f.x += f.kb * dt; f.kb *= 0.84;
        } else if (f.st === "attack") {
          f.t--;
          const active = f.t <= 9 && f.t >= 5;
          if (active && !f.landed) {
            const dx = (o.x - f.x) * f.face, dh = Math.abs(o.y - f.y);
            if (dx > -10 && dx < FT.RANGE && dh < 70) {
              f.landed = true;
              const blocked = o.st === "block" && o.y === 0 && f.y === 0;
              if (blocked) { o.hp -= 1; o.kb = f.face * 140; }
              else {
                o.hp -= f.y > 0 ? 7 : 10;
                o.st = "hit"; o.t = 10; o.kb = f.face * 380;
                if (o.y > 0) o.vy = Math.max(o.vy, 200);
              }
            }
          }
          if (f.t <= 0) f.st = "idle";
        } else {
          if (i.b && f.y === 0) f.st = "block";
          else {
            const dir = (i.r ? 1 : 0) - (i.l ? 1 : 0);
            f.x += dir * FT.SPD * dt;
            f.st = dir ? "walk" : "idle";
            if (i.j && f.y === 0) { f.vy = FT.JUMP; f.y = 0.01; }
            if (i.a && !f.pa) { f.st = "attack"; f.t = FT.ATK; f.landed = false; }
          }
        }
        f.pa = !!i.a;
        if (f.y > 0 || f.vy > 0) {
          f.vy -= FT.GRAV * dt; f.y += f.vy * dt;
          if (f.y <= 0) { f.y = 0; f.vy = 0; }
        }
        f.x = clamp(f.x, 30, FT.W - 30);
        if (f.y === 0 && f.st !== "attack" && f.st !== "hit") f.face = o.x >= f.x ? 1 : -1;
      }
      // body separation
      const gap = Math.abs(A.x - B.x);
      if (gap < 36 && Math.abs(A.y - B.y) < 70) {
        const push2 = (36 - gap) / 2, dir = A.x <= B.x ? -1 : 1;
        A.x = clamp(A.x + dir * push2, 30, FT.W - 30); B.x = clamp(B.x - dir * push2, 30, FT.W - 30);
      }
      const ko = s.f.filter((f) => f.hp <= 0);
      let w = null, end = false;
      if (ko.length) { end = true; w = ko.length === 2 ? null : s.f.find((f) => f.hp > 0); }
      else if (s.time <= 0) { end = true; w = A.hp === B.hp ? null : A.hp > B.hp ? A : B; }
      if (end) {
        s.f.forEach((f) => { if (f.hp <= 0) f.st = "ko"; });
        if (w) w.score++;
        s.msg = w ? w.id : "draw";
        s.over = 90;
        if (w && w.score >= FT.TARGET) s.winner = w.id;
      }
    }
    emitRT(r);
  }
  games.fighter = {
    start(r) {
      const [a, b] = r.players;
      const s = { f: [{ id: a.id, score: 0, inp: {} }, { id: b.id, score: 0, inp: {} }], round: 1, winner: null, wait: 0, over: 0, msg: null, time: 0 };
      ftReset(s);
      s.timer = setInterval(() => ftTick(r, s), 33);
      r.state = s;
    },
    view: (r) => ({ ids: r.state.f.map((f) => f.id), winner: r.state.winner, target: FT.TARGET }),
    snap: (r) => {
      const s = r.state;
      return {
        f: s.f.map((f) => [f.id, Math.round(f.x), Math.round(f.y), f.face, Math.max(0, f.hp), f.st, f.t, f.score]),
        wait: s.wait, over: s.over, msg: s.msg, round: s.round, secs: Math.max(0, Math.ceil(s.time / 30)), winner: s.winner, target: FT.TARGET,
      };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // MAZE CHASE  (runner vs chaser, roles swap each round, 4 rounds)
  // =====================================================================
  const MZ = { W: 21, H: 15, STEP: 130, ROUNDS: 4, TIME: 440 };
  function mzGen() {
    const { W, H } = MZ;
    const g = Array.from({ length: H }, () => Array(W).fill(1));
    const st = [[1, 1]]; g[1][1] = 0;
    while (st.length) {
      const [x, y] = st[st.length - 1];
      const ns = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [x + dx, y + dy, dx, dy])
        .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && g[ny][nx] === 1);
      if (!ns.length) { st.pop(); continue; }
      const [nx, ny, dx, dy] = ns[rnd(ns.length)];
      g[y + dy / 2][x + dx / 2] = 0; g[ny][nx] = 0; st.push([nx, ny]);
    }
    for (let t = 0, n = 0; t < 600 && n < 28; t++) {
      const x = 1 + rnd(W - 2), y = 1 + rnd(H - 2);
      if (g[y][x] !== 1) continue;
      if ((g[y][x - 1] === 0 && g[y][x + 1] === 0) || (g[y - 1][x] === 0 && g[y + 1][x] === 0)) { g[y][x] = 0; n++; }
    }
    return g;
  }
  function mzRound(s) {
    const g = mzGen(), { W, H } = MZ;
    s.grid = g;
    s.dots = g.map((row, y) => row.map((v, x) => (v === 0 ? 1 : 0)));
    s.dots[1][1] = 0; s.dots[H - 2][W - 2] = 0;
    s.power = [];
    for (let t = 0; t < 200 && s.power.length < 3; t++) {
      const x = 1 + rnd(W - 2), y = 1 + rnd(H - 2);
      if (g[y][x] !== 0 || Math.abs(x - 1) + Math.abs(y - 1) < 10 || Math.abs(x - (W - 2)) + Math.abs(y - (H - 2)) < 6) continue;
      if (s.power.some(([px, py]) => px === x && py === y)) continue;
      s.power.push([x, y]); s.dots[y][x] = 0;
    }
    s.left = s.dots.flat().reduce((a, b) => a + b, 0);
    s.runner = (s.round - 1) % 2; // index into s.p
    s.p.forEach((p, i) => {
      const run = i === s.runner;
      p.x = run ? W - 2 : 1; p.y = run ? H - 2 : 1; p.px = p.x; p.py = p.y; p.dir = [0, 0]; p.want = [0, 0];
    });
    s.boost = 0; s.tick = 0; s.time = MZ.TIME; s.count = 18; s.over = 0; s.msg = null;
  }
  const mzOpen = (s, x, y) => y >= 0 && x >= 0 && y < MZ.H && x < MZ.W && s.grid[y][x] === 0;
  function mzTick(r, s) {
    if (r.state !== s) return clearInterval(s.timer);
    if (s.count > 0) { s.count--; return emitRT(r); }
    if (s.over > 0) {
      if (--s.over === 0) {
        if (s.round >= MZ.ROUNDS) {
          const [a, b] = s.p;
          s.winner = a.score === b.score ? "draw" : a.score > b.score ? a.id : b.id;
          clearInterval(s.timer); emitRT(r); return push(r);
        }
        s.round++; mzRound(s);
      }
      return emitRT(r);
    }
    s.tick++; s.time--;
    if (s.boost > 0) s.boost--;
    const run = s.p[s.runner], cha = s.p[1 - s.runner];
    const runMoves = s.boost > 0 || s.tick % 3 !== 0;
    const chaMoves = s.boost <= 0 || s.tick % 2 === 0;
    const step = (p) => {
      p.px = p.x; p.py = p.y;
      if ((p.want[0] || p.want[1]) && mzOpen(s, p.x + p.want[0], p.y + p.want[1])) p.dir = p.want;
      if (mzOpen(s, p.x + p.dir[0], p.y + p.dir[1])) { p.x += p.dir[0]; p.y += p.dir[1]; } else p.dir = [0, 0];
    };
    s.p.forEach((p) => { p.px = p.x; p.py = p.y; });
    if (runMoves) step(run);
    if (chaMoves) step(cha);
    // pickups
    if (s.dots[run.y][run.x]) { s.dots[run.y][run.x] = 0; s.left--; }
    const pi = s.power.findIndex(([x, y]) => x === run.x && y === run.y);
    if (pi >= 0) { s.power.splice(pi, 1); s.boost = 32; }
    const caught = (run.x === cha.x && run.y === cha.y) || (run.x === cha.px && run.y === cha.py && cha.x === run.px && cha.y === run.py);
    let w = null;
    if (caught) w = cha;
    else if (s.left <= 0 || s.time <= 0) w = run;
    if (w) {
      w.score++; s.msg = { id: w.id, how: caught ? "caught" : s.left <= 0 ? "cleared" : "survived" };
      s.over = 22;
    }
    emitRT(r);
  }
  games.maze = {
    start(r) {
      const [a, b] = r.players;
      const s = { p: [{ id: a.id, score: 0 }, { id: b.id, score: 0 }], round: 1, winner: null };
      mzRound(s);
      s.timer = setInterval(() => mzTick(r, s), MZ.STEP);
      r.state = s;
    },
    view: (r) => ({ ids: r.state.p.map((p) => p.id), winner: r.state.winner, total: MZ.ROUNDS }),
    snap: (r) => {
      const s = r.state;
      return {
        maze: s.grid.map((row) => row.join("")),
        dots: s.dots.map((row) => row.join("")),
        power: s.power, boost: s.boost,
        p: s.p.map((p) => [p.id, p.x, p.y, p.px, p.py, p.score]),
        runner: s.runner, round: s.round, total: MZ.ROUNDS, count: s.count, over: s.over, msg: s.msg,
        secs: Math.max(0, Math.ceil((s.time * MZ.STEP) / 1000)), winner: s.winner, step: MZ.STEP,
      };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // PONG SHOWDOWN  (power-up orbs + smash, first to 5)
  // =====================================================================
  const PX = { W: 800, H: 500, PH: 90, PW: 12, R: 8, X: 30, WIN: 5 };
  const ORBS = ["big", "shrink", "fast", "freeze"];
  function pxServe(s, dir) {
    const ang = (Math.random() - 0.5) * 0.8;
    s.ball = { x: 400, y: 250, vx: Math.cos(ang) * 360 * dir, vy: Math.sin(ang) * 360, fire: 0, last: -1 };
    s.count = 45;
    s.pad.forEach((p) => { p.big = p.shrink = p.freeze = p.smash = 0; });
  }
  const pxH = (p) => PX.PH + (p.big > 0 ? 40 : 0) - (p.shrink > 0 ? 35 : 0);
  function pxTick(r, s) {
    if (r.state !== s) return clearInterval(s.timer);
    const dt = 0.033;
    for (const p of s.pad) {
      p.h = pxH(p);
      if (p.big > 0) p.big--;
      if (p.shrink > 0) p.shrink--;
      if (p.smash > 0) p.smash--;
      if (p.cool > 0) p.cool--;
      if (p.freeze > 0) { p.freeze--; continue; }
      const target = clamp(p.t - p.h / 2, 0, PX.H - p.h), d = target - p.y, m = 680 * dt;
      p.y += Math.abs(d) <= m ? d : Math.sign(d) * m;
      p.y = clamp(p.y, 0, PX.H - p.h);
    }
    if (s.count > 0) s.count--;
    else {
      const b = s.ball;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < PX.R) { b.y = PX.R; b.vy = Math.abs(b.vy); }
      if (b.y > PX.H - PX.R) { b.y = PX.H - PX.R; b.vy = -Math.abs(b.vy); }
      // orb spawn / pickup
      if (!s.orb && --s.orbIn <= 0) {
        s.orb = { x: 300 + rnd(200), y: 90 + rnd(320), type: rnd(ORBS.length), life: 270 };
        s.orbIn = 150;
      }
      if (s.orb) {
        if (--s.orb.life <= 0) s.orb = null;
        else if (b.last >= 0 && Math.hypot(b.x - s.orb.x, b.y - s.orb.y) < PX.R + 18) {
          const me = s.pad[b.last], foe = s.pad[1 - b.last], t = ORBS[s.orb.type];
          if (t === "big") me.big = 270;
          else if (t === "shrink") foe.shrink = 270;
          else if (t === "freeze") foe.freeze = 45;
          else { const k = 1.3, sp = Math.hypot(b.vx, b.vy); const nsp = Math.min(sp * k, 900); b.vx *= nsp / sp; b.vy *= nsp / sp; }
          s.fx = { who: b.last, type: s.orb.type, n: 30 };
          s.orb = null;
        }
      }
      const bounce = (i, dir) => {
        const p = s.pad[i];
        let sp = Math.min(Math.hypot(b.vx, b.vy) * 1.05, 860);
        if (p.smash > 0) { sp = Math.min(sp * 1.45, 1050); b.fire = 1; p.smash = 0; } else b.fire = 0;
        const ang = clamp((b.y - (p.y + p.h / 2)) / (p.h / 2), -1, 1) * 0.95;
        b.vx = Math.cos(ang) * sp * dir; b.vy = Math.sin(ang) * sp;
        b.last = i;
      };
      const [L, Rt] = s.pad;
      if (b.vx < 0 && b.x - PX.R <= PX.X + PX.PW && b.x > PX.X - PX.PW && b.y > L.y - PX.R && b.y < L.y + L.h + PX.R) {
        bounce(0, 1); b.x = PX.X + PX.PW + PX.R;
      } else if (b.vx > 0 && b.x + PX.R >= PX.W - PX.X - PX.PW && b.x < PX.W - PX.X + PX.PW && b.y > Rt.y - PX.R && b.y < Rt.y + Rt.h + PX.R) {
        bounce(1, -1); b.x = PX.W - PX.X - PX.PW - PX.R;
      } else if (b.x < -20 || b.x > PX.W + 20) {
        const sc = b.x < 0 ? 1 : 0;
        s.pad[sc].score++;
        if (s.pad[sc].score >= PX.WIN) {
          s.winner = s.pad[sc].id;
          clearInterval(s.timer); emitRT(r); return push(r);
        }
        s.orb = null; s.orbIn = 110;
        pxServe(s, sc === 1 ? -1 : 1);
      }
    }
    if (s.fx && --s.fx.n <= 0) s.fx = null;
    emitRT(r);
  }
  games.pongx = {
    start(r) {
      const [a, b] = r.players;
      const mk = (id) => ({ id, y: 205, t: 250, h: PX.PH, score: 0, big: 0, shrink: 0, freeze: 0, smash: 0, cool: 0 });
      const s = { pad: [mk(a.id), mk(b.id)], ball: null, count: 0, winner: null, orb: null, orbIn: 120, fx: null };
      pxServe(s, Math.random() < 0.5 ? 1 : -1);
      s.count = 70;
      s.timer = setInterval(() => pxTick(r, s), 33);
      r.state = s;
    },
    view: (r) => ({ ids: r.state.pad.map((p) => p.id), winner: r.state.winner, target: PX.WIN }),
    snap: (r) => {
      const s = r.state, b = s.ball;
      return {
        p: s.pad.map((p) => [Math.round(p.y), p.score, p.h, p.big, p.shrink, p.freeze, p.cool, p.smash]),
        b: [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), b.fire, b.last],
        orb: s.orb ? [Math.round(s.orb.x), Math.round(s.orb.y), s.orb.type, s.orb.life] : null,
        fx: s.fx ? [s.fx.who, s.fx.type, s.fx.n] : null,
        count: s.count, winner: s.winner,
      };
    },
    done: (r) => !!r.state.winner,
  };

  // =====================================================================
  // MINI RACING  (top-down oval, 3 laps, boost pads)
  // =====================================================================
  const RC = { W: 800, H: 500, CX: 400, CY: 250, OA: 372, OB: 228, IA: 210, IB: 96, LAPS: 3, MA: 291, MB: 162 };
  const PADS = [1.25, 3.05, 4.85].map((th) => [Math.round(RC.CX + RC.MA * Math.cos(th)), Math.round(RC.CY + RC.MB * Math.sin(th))]);
  const rcOn = (x, y) => {
    const o = ((x - RC.CX) / RC.OA) ** 2 + ((y - RC.CY) / RC.OB) ** 2;
    const i = ((x - RC.CX) / RC.IA) ** 2 + ((y - RC.CY) / RC.IB) ** 2;
    return o <= 1 && i >= 1;
  };
  const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  function rcTick(r, s) {
    if (r.state !== s) return clearInterval(s.timer);
    const dt = 1 / 30;
    if (s.count > 0) { if (--s.count === 0) s.t0 = Date.now(); return emitRT(r); }
    for (const c of s.cars) {
      if (c.fin) { c.sp *= 0.97; }
      const i = c.fin ? {} : c.inp || {};
      const on = rcOn(c.x, c.y);
      if (c.boost > 0) c.boost--;
      const max = c.boost > 0 ? 440 : on ? 305 : 130;
      if (i.g) c.sp += 270 * dt;
      else if (i.b) c.sp -= (c.sp > 0 ? 460 : 200) * dt;
      else c.sp *= 0.987;
      if (c.sp > max) c.sp = Math.max(max, c.sp - 520 * dt);
      c.sp = clamp(c.sp, -90, 460);
      c.a += ((i.r ? 1 : 0) - (i.l ? 1 : 0)) * 2.7 * dt * clamp(c.sp / 110, -1, 1);
      c.x = clamp(c.x + Math.cos(c.a) * c.sp * dt, 8, RC.W - 8);
      c.y = clamp(c.y + Math.sin(c.a) * c.sp * dt, 8, RC.H - 8);
      PADS.forEach(([px, py]) => { if (Math.hypot(c.x - px, c.y - py) < 24 && c.boost < 10) { c.boost = 22; c.sp = Math.max(c.sp, 330); } });
      const th = Math.atan2(c.y - RC.CY, c.x - RC.CX);
      c.prog += wrap(th - c.th); c.th = th;
      if (!c.fin && c.prog >= RC.LAPS * 2 * Math.PI) {
        c.fin = Date.now() - s.t0;
        if (!s.winner) { s.winner = c.id; s.time = c.fin; }
      }
    }
    const [A, B] = s.cars, d = Math.hypot(A.x - B.x, A.y - B.y);
    if (d < 24 && d > 0) {
      const nx = (A.x - B.x) / d, ny = (A.y - B.y) / d, o = (24 - d) / 2;
      A.x += nx * o; A.y += ny * o; B.x -= nx * o; B.y -= ny * o;
      A.sp *= 0.93; B.sp *= 0.93;
    }
    if (s.winner && !s.ended) {
      s.ended = true;
      s.endAt = Date.now() + 1200;
    }
    emitRT(r);
    if (s.ended && Date.now() >= s.endAt) { clearInterval(s.timer); push(r); }
  }
  games.racing = {
    start(r) {
      const [a, b] = r.players;
      const th0 = -0.09;
      const mk = (id, k) => {
        const x = RC.CX + (RC.MA + k * 32) * Math.cos(th0), y = RC.CY + (RC.MB + k * 20) * Math.sin(th0);
        return { id, x, y, a: Math.atan2(RC.MB * Math.cos(th0), -RC.MA * Math.sin(th0)), sp: 0, th: Math.atan2(y - RC.CY, x - RC.CX), prog: 0, boost: 0, fin: 0, inp: {} };
      };
      const s = { cars: [mk(a.id, -1), mk(b.id, 1)], count: 100, winner: null, t0: 0, time: 0, ended: false };
      s.cars.forEach((c) => { c.prog = c.th; });
      s.timer = setInterval(() => rcTick(r, s), 33);
      r.state = s;
    },
    view: (r) => ({ ids: r.state.cars.map((c) => c.id), winner: r.state.ended ? r.state.winner : null, laps: RC.LAPS, time: r.state.time }),
    snap: (r) => {
      const s = r.state;
      return {
        c: s.cars.map((c) => [c.id, Math.round(c.x), Math.round(c.y), +c.a.toFixed(2), Math.round(c.sp), +Math.max(0, c.prog / (2 * Math.PI)).toFixed(2), c.boost > 0 ? 1 : 0, c.fin]),
        count: s.count, laps: RC.LAPS, winner: s.winner, pads: PADS,
      };
    },
    done: (r) => !!r.state.ended,
  };

  // =====================================================================
  // socket events
  // =====================================================================
  function register(socket, mine) {
    const get = (game) => {
      const r = mine(socket);
      return r && r.game === game && r.state ? r : null;
    };
    const posOk = (p) => Array.isArray(p) && p.length >= 2 && isInt(p[0]) && isInt(p[1]) && p[0] >= 0 && p[1] >= 0 && p[0] < 8 && p[1] < 8;

    // chess
    socket.on("ch:move", (d = {}) => {
      const r = get("chess");
      if (!r) return;
      const s = r.state, color = s.colors[socket.id];
      if (s.winner || color !== s.turn || !posOk(d.from) || !posOk(d.to)) return;
      const m = chLegal(s, color).find((x) => x.from[0] === d.from[0] && x.from[1] === d.from[1] && x.to[0] === d.to[0] && x.to[1] === d.to[1]);
      if (!m) return;
      const promoPiece = m.promo ? (["Q", "R", "B", "N"].includes(d.promo) ? d.promo : "Q") : null;
      const [fr, fc] = m.from, [tr, tc] = m.to;
      const piece = s.board[fr][fc];
      const captured = m.ep ? s.board[fr][tc] : s.board[tr][tc];
      if (captured) s.caps[color].push(captured);
      s.board = chBoardAfter(s.board, m, color, promoPiece);
      // castling rights
      if (piece[1] === "K") { s.castle[color + "K"] = 0; s.castle[color + "Q"] = 0; }
      const corner = (rr, cc) => {
        if (rr === 7 && cc === 0) s.castle.wQ = 0;
        if (rr === 7 && cc === 7) s.castle.wK = 0;
        if (rr === 0 && cc === 0) s.castle.bQ = 0;
        if (rr === 0 && cc === 7) s.castle.bK = 0;
      };
      corner(fr, fc); corner(tr, tc);
      s.ep = m.dbl ? [(fr + tr) / 2, fc] : null;
      s.half = piece[1] === "P" || captured ? 0 : s.half + 1;
      s.last = { from: m.from, to: m.to };
      const opp = color === "w" ? "b" : "w";
      s.turn = opp;
      const key = chKey(s);
      s.seen[key] = (s.seen[key] || 0) + 1;
      const hasMoves = chLegal(s, opp).length > 0;
      if (!hasMoves) {
        if (chInCheck(s.board, opp)) { s.winner = socket.id; s.reason = "checkmate"; }
        else { s.winner = "draw"; s.reason = "stalemate"; }
      } else if (chInsufficient(s.board)) { s.winner = "draw"; s.reason = "insufficient material"; }
      else if (s.half >= 100) { s.winner = "draw"; s.reason = "50-move rule"; }
      else if (s.seen[key] >= 3) { s.winner = "draw"; s.reason = "threefold repetition"; }
      push(r);
    });
    socket.on("ch:resign", () => {
      const r = get("chess");
      if (!r || r.state.winner) return;
      r.state.winner = other(r, socket.id).id; r.state.reason = "resignation";
      push(r);
    });

    // snakes & ladders
    socket.on("sl:roll", () => {
      const r = get("ladders");
      if (!r) return;
      const s = r.state;
      if (s.winner || s.turn !== socket.id) return;
      const roll = 1 + rnd(6), from = s.pos[socket.id], landed = from + roll;
      let to = landed, via = null;
      if (landed > 100) { to = from; via = "stay"; }
      else if (SL_LADDERS[landed]) { to = SL_LADDERS[landed]; via = "ladder"; }
      else if (SL_SNAKES[landed]) { to = SL_SNAKES[landed]; via = "snake"; }
      s.pos[socket.id] = to;
      s.last = { by: socket.id, roll, from, landed: Math.min(landed, 100), to, via, n: ((s.last && s.last.n) || 0) + 1 };
      if (to === 100) s.winner = socket.id;
      else if (!(roll === 6 && via !== "stay")) s.turn = other(r, socket.id).id;
      push(r);
    });

    // fighter
    socket.on("ft:input", (d) => {
      const r = get("fighter");
      const f = r && d && r.state.f.find((x) => x.id === socket.id);
      if (f) f.inp = { l: !!d.l, r: !!d.r, j: !!d.j, a: !!d.a, b: !!d.b };
    });

    // maze
    socket.on("mz:dir", (d) => {
      const r = get("maze");
      const v = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0], x: [0, 0] }[d];
      const p = r && v && r.state.p.find((x) => x.id === socket.id);
      if (p) p.want = v;
    });

    // pong showdown
    socket.on("px:y", (y) => {
      const r = get("pongx");
      if (!r || !Number.isFinite(y)) return;
      const p = r.state.pad.find((q) => q.id === socket.id);
      if (p) p.t = clamp(y, 0, PX.H);
    });
    socket.on("px:smash", () => {
      const r = get("pongx");
      const p = r && r.state.pad.find((q) => q.id === socket.id);
      if (p && p.cool === 0 && r.state.count === 0) { p.smash = 9; p.cool = 60; }
    });

    // racing
    socket.on("rc:input", (d) => {
      const r = get("racing");
      const c = r && d && r.state.cars.find((x) => x.id === socket.id);
      if (c) c.inp = { l: !!d.l, r: !!d.r, g: !!d.g, b: !!d.b };
    });
  }

  return { register };
};
