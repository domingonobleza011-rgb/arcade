"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { getSocket } from "../lib/socket";

const PC = ["#ff6b6b", "#4cc9f0"];
const Again = ({ show }) => (show ? <button className="primary" onClick={() => getSocket().emit("rematch")}>Play again</button> : null);

function banner(room, me, winner, turn, turnText = "Your turn") {
  const nm = (id) => room.players.find((p) => p.id === id)?.name;
  if (winner === "draw") return ["It's a draw.", ""];
  if (winner) return winner === me ? ["You win! 🎉", "good"] : [`${nm(winner)} wins.`, "bad"];
  return turn === me ? [turnText, "turn"] : [`${nm(turn)}'s turn`, ""];
}

function useRT() {
  const s = getSocket();
  const ref = useRef(null);
  useEffect(() => {
    const on = (d) => { ref.current = d; };
    s.on("rt:state", on);
    s.emit("rt:sync");
    return () => s.off("rt:state", on);
  }, [s]);
  return ref;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

const CH_PCS = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

function chSide(pc) { return pc ? (pc === pc.toUpperCase() ? "w" : "b") : null; }

// Local legal-move preview (mirrors server roughly for UX)
function localMoves(board, y, x, turn) {
  const pc = board[y][x];
  if (!pc || chSide(pc) !== turn) return [];
  const t = pc.toLowerCase();
  const side = chSide(pc);
  const out = [];
  const add = (ny, nx) => {
    if (ny < 0 || nx < 0 || ny > 7 || nx > 7) return false;
    const tgt = board[ny][nx];
    if (tgt && chSide(tgt) === side) return false;
    out.push([ny, nx]);
    return !tgt;
  };
  if (t === "p") {
    const dir = side === "w" ? -1 : 1;
    const start = side === "w" ? 6 : 1;
    if (!board[y + dir]?.[x]) {
      out.push([y + dir, x]);
      if (y === start && !board[y + dir * 2]?.[x]) out.push([y + dir * 2, x]);
    }
    for (const dx of [-1, 1]) {
      const ny = y + dir, nx = x + dx;
      if (ny >= 0 && nx >= 0 && ny < 8 && nx < 8 && board[ny][nx] && chSide(board[ny][nx]) !== side) out.push([ny, nx]);
    }
  } else if (t === "n") {
    for (const [dy, dx] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(y + dy, x + dx);
  } else if (t === "k") {
    for (const [dy, dx] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) add(y + dy, x + dx);
  } else {
    const dirs = t === "b" ? [[-1,-1],[-1,1],[1,-1],[1,1]]
      : t === "r" ? [[-1,0],[1,0],[0,-1],[0,1]]
      : [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dy, dx] of dirs) for (let i = 1; i < 8; i++) if (!add(y + dy * i, x + dx * i)) break;
  }
  return out;
}

export function Chess({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const mySide = st.ids.w === me ? "w" : "b";
  const myTurn = st.turn === mySide && !st.winner;
  const [sel, setSel] = useState(null);
  const moves = useMemo(() => (sel ? localMoves(st.board, sel[0], sel[1], st.turn) : []), [sel, st.board, st.turn]);

  // flip board so each player sees own pieces at bottom
  const flip = mySide === "b";

  const click = (y, x) => {
    if (!myTurn) return;
    const ry = flip ? 7 - y : y, rx = flip ? 7 - x : x;
    if (sel) {
      if (moves.some(([my, mx]) => my === ry && mx === rx)) {
        s.emit("ch:move", { fy: sel[0], fx: sel[1], ty: ry, tx: rx });
        setSel(null);
        return;
      }
      setSel(null);
    }
    if (chSide(st.board[ry][rx]) === mySide) setSel([ry, rx]);
  };

  const [txt, cls] = st.winner
    ? banner(room, me, st.winner, null)
    : [st.check ? (myTurn ? "Check! Your move" : "Check!") : (myTurn ? "Your turn" : "Opponent's turn"), myTurn ? "turn" : ""];

  const last = st.last || [];
  return (
    <div>
      <p className={`status ${cls}`}>{txt}</p>
      <div className="chess" role="grid">
        {Array.from({ length: 8 }, (_, y) =>
          Array.from({ length: 8 }, (_, x) => {
            const ry = flip ? 7 - y : y, rx = flip ? 7 - x : x;
            const pc = st.board[ry][rx];
            const light = (ry + rx) % 2 === 0;
            const isSel = sel && sel[0] === ry && sel[1] === rx;
            const isMv = moves.some(([my, mx]) => my === ry && mx === rx);
            const isCap = isMv && pc;
            const isLast = last.length === 4 && ((last[0] === ry && last[1] === rx) || (last[2] === ry && last[3] === rx));
            return (
              <button
                key={`${y}-${x}`}
                type="button"
                className={`sq ${light ? "light" : "dark"}${isSel ? " sel" : ""}${isMv && !isCap ? " mv" : ""}${isCap ? " cap" : ""}${isLast ? " last" : ""}`}
                onClick={() => click(y, x)}
                aria-label={`${ry},${rx} ${pc || "empty"}`}
              >
                {pc ? CH_PCS[pc] : ""}
              </button>
            );
          })
        )}
      </div>
      <p className="meta" style={{ marginTop: 10 }}>You are {mySide === "w" ? "White ♔" : "Black ♚"}. Tap a piece, then a square.</p>
      <div style={{ textAlign: "center", marginTop: 10 }}><Again show={!!st.winner} /></div>
    </div>
  );
}

export function SnakesLadders({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const myTurn = st.turn === me && !st.winner;
  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : [myTurn ? "Your turn — roll the dice!" : "Waiting for opponent…", myTurn ? "turn" : ""];

  // board cells 1-100 in snakes pattern
  const cells = [];
  for (let row = 9; row >= 0; row--) {
    const base = row * 10;
    const nums = row % 2 === 0
      ? Array.from({ length: 10 }, (_, i) => base + i + 1)
      : Array.from({ length: 10 }, (_, i) => base + 10 - i);
    cells.push(...nums);
  }

  const posA = st.pos[room.players[0].id] || 0;
  const posB = st.pos[room.players[1]?.id] || 0;

  return (
    <div>
      <p className={`status ${cls}`}>{txt}</p>
      {st.last && (
        <p className="meta" style={{ textAlign: "center" }}>
          {room.players.find((p) => p.id === st.last.by)?.name} rolled <b>{st.last.die}</b> → square {st.last.pos}
        </p>
      )}
      <div className="snl">
        {cells.map((n) => {
          const hasA = posA === n, hasB = posB === n;
          const snake = st.snakes?.[n], ladder = st.ladders?.[n];
          return (
            <div key={n} className={`cell ${(Math.floor((n - 1) / 10) % 2 === 0) === ((n - 1) % 10 % 2 === 0) ? "light" : "dark"}`}>
              <span style={{ opacity: 0.7 }}>{n}</span>
              {snake && <span style={{ position: "absolute", bottom: 2, fontSize: "0.7rem" }}>🐍</span>}
              {ladder && <span style={{ position: "absolute", bottom: 2, fontSize: "0.7rem" }}>ladder</span>}
              {hasA && <span className={`tok a${hasB ? " both-a" : ""}`} title={room.players[0].name} />}
              {hasB && <span className={`tok b${hasA ? " both-b" : ""}`} title={room.players[1]?.name} />}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button className="dice-btn primary" disabled={!myTurn} onClick={() => s.emit("snl:roll")} aria-label="Roll dice">🎲</button>
        <p className="meta">Roll a 6 for an extra turn. First to 100 wins.</p>
        <Again show={!!st.winner} />
      </div>
    </div>
  );
}

export function PixelFighter({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const mob = useRef({ l: 0, r: 0, u: 0, punch: 0, kick: 0 });

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const KEYS = { a: "l", arrowleft: "l", d: "r", arrowright: "r", w: "u", arrowup: "u", " ": "punch", j: "punch", k: "kick" };
    const inp = { l: 0, r: 0, u: 0, punch: 0, kick: 0 };
    const key = (v) => (e) => {
      if (e.target.tagName === "INPUT") return;
      const k = KEYS[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      inp[k] = v;
    };
    const kd = key(1), ku = key(0);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const send = setInterval(() => {
      const m = mob.current;
      s.emit("fg:input", {
        l: inp.l || m.l, r: inp.r || m.r, u: inp.u || m.u,
        punch: inp.punch || m.punch, kick: inp.kick || m.kick,
      });
    }, 33);
    let raf;
    const frame = () => {
      const d = rt.current;
      g.fillStyle = "#0a1220"; g.fillRect(0, 0, 800, 360);
      // floor
      g.fillStyle = "#1a2a40"; g.fillRect(0, 300, 800, 60);
      g.strokeStyle = "rgba(255,255,255,.08)";
      for (let x = 0; x < 800; x += 40) { g.beginPath(); g.moveTo(x, 300); g.lineTo(x, 360); g.stroke(); }
      if (d) {
        d.f.forEach((q, i) => {
          const [id, x, y, hp, face, atk, kind, hit, wins] = q;
          const col = id === me ? "#3ddc97" : "#ff6b6b";
          const dark = id === me ? "#1a8f63" : "#b53a3a";
          g.save();
          if (hit > 0) g.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 40);
          // body
          g.fillStyle = col;
          rr(g, x - 18, y - 56, 36, 56, 8); g.fill();
          // head
          g.beginPath(); g.arc(x, y - 68, 14, 0, 7); g.fill();
          // arms / attack
          if (atk > 0) {
            g.fillStyle = kind === "k" ? "#b388ff" : "#ff9f1c";
            const reach = kind === "k" ? 48 : 36;
            rr(g, face > 0 ? x + 10 : x - 10 - reach, y - (kind === "k" ? 30 : 40), reach, kind === "k" ? 14 : 10, 4);
            g.fill();
          }
          g.restore();
          // name / wins
          g.fillStyle = "#eaf2ff"; g.font = "600 12px sans-serif"; g.textAlign = "center";
          const nm = room.players.find((p) => p.id === id)?.name || "?";
          g.fillText(`${nm}  ★${wins}`, x, y - 90);
        });
        if (d.winner) {
          g.fillStyle = "#ffd23f"; g.font = "800 36px sans-serif"; g.textAlign = "center";
          g.fillText(d.winner === me ? "KO! You win!" : "KO!", 400, 160);
        } else {
          g.fillStyle = "rgba(255,255,255,.5)"; g.font = "700 18px sans-serif"; g.textAlign = "center";
          g.fillText(`Round ${d.round} · first to ${d.target}`, 400, 28);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf); clearInterval(send);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
    };
  }, [s, me, room.players, rt]);

  // HP bars from last snap
  const [hp, setHp] = useState([100, 100]);
  useEffect(() => {
    const id = setInterval(() => {
      const d = rt.current;
      if (d?.f) setHp(d.f.map((q) => q[3]));
    }, 100);
    return () => clearInterval(id);
  }, [rt]);

  const hold = (k, v) => () => { mob.current[k] = v; };
  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : ["Land punches & kicks — best of 3!", ""];

  return (
    <div className="arena-wrap">
      <p className={`status ${cls}`}>{txt}</p>
      <div className="fighter-ui">
        <span className="meta">{room.players[0]?.name}</span>
        <div className="hpbar"><i style={{ width: `${hp[0] || 0}%`, background: PC[0] }} /></div>
        <div className="hpbar"><i style={{ width: `${hp[1] || 0}%`, background: PC[1] }} /></div>
        <span className="meta">{room.players[1]?.name}</span>
      </div>
      <p className="landscape-hint">Tip: rotate to landscape for a bigger arena.</p>
      <canvas ref={ref} className="arena" width={800} height={360} />
      <p className="meta" style={{ marginTop: 8 }}><kbd>A</kbd><kbd>D</kbd> move · <kbd>W</kbd> jump · <kbd>J</kbd>/<kbd>Space</kbd> punch · <kbd>K</kbd> kick</p>
      <div className="mctl">
        <div className="dpad">
          <button className="u" onPointerDown={hold("u", 1)} onPointerUp={hold("u", 0)} onPointerLeave={hold("u", 0)} aria-label="Jump">▲</button>
          <button onPointerDown={hold("l", 1)} onPointerUp={hold("l", 0)} onPointerLeave={hold("l", 0)} aria-label="Left">◀</button>
          <button onPointerDown={hold("u", 0)} style={{visibility:"hidden"}} aria-hidden>▼</button>
          <button onPointerDown={hold("r", 1)} onPointerUp={hold("r", 0)} onPointerLeave={hold("r", 0)} aria-label="Right">▶</button>
        </div>
        <div className="atk-row">
          <button className="atk-btn punch" onPointerDown={hold("punch", 1)} onPointerUp={hold("punch", 0)} onPointerLeave={hold("punch", 0)}>PUNCH</button>
          <button className="atk-btn kick" onPointerDown={hold("kick", 1)} onPointerUp={hold("kick", 0)} onPointerLeave={hold("kick", 0)}>KICK</button>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 10 }}><Again show={!!st.winner} /></div>
    </div>
  );
}

export function MazeChase({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const dir = (d) => s.emit("mz:dir", d);
    const KEYS = { arrowup: "u", w: "u", arrowdown: "d", s: "d", arrowleft: "l", a: "l", arrowright: "r", d: "r" };
    const kd = (e) => {
      if (e.target.tagName === "INPUT") return;
      const d = KEYS[e.key.toLowerCase()];
      if (d) { e.preventDefault(); dir(d); }
    };
    window.addEventListener("keydown", kd);
    let raf;
    const frame = () => {
      const d = rt.current;
      g.fillStyle = "#060b17"; g.fillRect(0, 0, 800, 500);
      if (d) {
        const cw = 800 / d.w, ch = 500 / d.h;
        for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
          if (d.grid[y][x]) {
            g.fillStyle = "#1e3a5f";
            g.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
          }
        }
        d.p.forEach((q) => {
          const [id, x, y, role, score] = q;
          const col = role === "h" ? "#ff6b6b" : "#3ddc97";
          g.save(); g.shadowColor = col; g.shadowBlur = 12;
          g.fillStyle = col;
          g.beginPath(); g.arc(x * cw + cw / 2, y * ch + ch / 2, Math.min(cw, ch) * 0.38, 0, 7); g.fill();
          g.restore();
          g.fillStyle = "#fff"; g.font = "700 11px sans-serif"; g.textAlign = "center";
          g.fillText(role === "h" ? "HUNT" : "FLEE", x * cw + cw / 2, y * ch - 4);
        });
        g.fillStyle = "rgba(255,255,255,.6)"; g.font = "700 16px sans-serif"; g.textAlign = "center";
        g.fillText(`Round ${d.round}`, 400, 24);
        if (d.winner) {
          g.fillStyle = "#ffd23f"; g.font = "800 36px sans-serif";
          g.fillText(d.winner === me ? "You win!" : "Caught!", 400, 250);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); };
  }, [s, me, rt]);

  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : ["Hunter catches prey — roles swap. First to 3 catches wins.", ""];
  return (
    <div className="arena-wrap">
      <p className={`status ${cls}`}>{txt}</p>
      <p className="landscape-hint">Tip: rotate to landscape for a bigger maze.</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <p className="meta" style={{ marginTop: 8 }}>WASD / arrows or d-pad. Red hunts, green flees.</p>
      <div className="dpad">
        <button className="u" onPointerDown={() => s.emit("mz:dir", "u")} aria-label="Up">▲</button>
        <button onPointerDown={() => s.emit("mz:dir", "l")} aria-label="Left">◀</button>
        <button onPointerDown={() => s.emit("mz:dir", "d")} aria-label="Down">▼</button>
        <button onPointerDown={() => s.emit("mz:dir", "r")} aria-label="Right">▶</button>
      </div>
      <div style={{ textAlign: "center", marginTop: 10 }}><Again show={!!st.winner} /></div>
    </div>
  );
}

export function PongShowdown({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const seat = st.ids.indexOf(me);

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const keys = { u: 0, d: 0 };
    let myY = 250, lastSent = -1;
    const disp = [200, 200];
    const send = () => { const y = Math.round(myY); if (y !== lastSent) { lastSent = y; s.emit("ps:y", y); } };
    const mm = (e) => {
      const r = cv.getBoundingClientRect();
      myY = ((e.clientY - r.top) / r.height) * 500;
      send();
    };
    const kd = (v) => (e) => {
      const k = e.key.toLowerCase();
      if (e.target.tagName === "INPUT") return;
      if (k === "arrowup" || k === "w") { keys.u = v; e.preventDefault(); }
      if (k === "arrowdown" || k === "s") { keys.d = v; e.preventDefault(); }
    };
    const down = kd(1), up = kd(0);
    cv.addEventListener("pointermove", mm); cv.addEventListener("pointerdown", mm);
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    const tick = setInterval(() => {
      if (keys.u || keys.d) { myY = Math.max(0, Math.min(500, myY + (keys.d - keys.u) * 16)); send(); }
    }, 30);
    let raf;
    const frame = () => {
      const d = rt.current;
      g.fillStyle = "#080510"; g.fillRect(0, 0, 800, 500);
      const grad = g.createRadialGradient(400, 250, 20, 400, 250, 400);
      grad.addColorStop(0, "rgba(255,210,63,.15)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad; g.fillRect(0, 0, 800, 500);
      g.strokeStyle = "rgba(255,210,63,.35)"; g.lineWidth = 3; g.setLineDash([12, 12]);
      g.beginPath(); g.moveTo(400, 0); g.lineTo(400, 500); g.stroke(); g.setLineDash([]);
      if (d) {
        d.p.forEach(([y], i) => { disp[i] += (y - disp[i]) * 0.55; });
        g.textAlign = "center"; g.font = "800 56px sans-serif"; g.fillStyle = "rgba(255,255,255,.18)";
        g.fillText(d.p[0][1], 280, 70); g.fillText(d.p[1][1], 520, 70);
        const cols = ["#ffd23f", "#ff6b6b"];
        [0, 1].forEach((i) => {
          const x = i ? 758 : 30;
          g.save(); g.shadowColor = cols[i]; g.shadowBlur = i === seat ? 24 : 12;
          g.fillStyle = cols[i]; rr(g, x, disp[i], 12, 100, 6); g.fill(); g.restore();
        });
        const [bx, by] = d.b;
        g.save(); g.shadowColor = "#fff"; g.shadowBlur = 18;
        g.fillStyle = "#fff"; g.beginPath(); g.arc(bx, by, 9, 0, 7); g.fill(); g.restore();
        if (d.winner) {
          g.fillStyle = "#ffd23f"; g.font = "800 40px sans-serif"; g.textAlign = "center";
          g.fillText(d.winner === me ? "Showdown won!" : "Defeat", 400, 250);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf); clearInterval(tick);
      cv.removeEventListener("pointermove", mm); cv.removeEventListener("pointerdown", mm);
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up);
    };
  }, [s, rt, seat, me]);

  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : [`First to ${st.target} — high speed!`, ""];
  return (
    <div className="arena-wrap">
      <p className={`status ${cls}`}>{txt}</p>
      <p className="landscape-hint">Tip: rotate to landscape for a bigger court.</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <p className="meta" style={{ marginTop: 8 }}>Drag finger / mouse, or <kbd>W</kbd><kbd>S</kbd>. Ball speeds up every hit.</p>
      <div className="dpad">
        <button className="u" onPointerDown={() => { /* continuous via keys style */ }} onPointerDownCapture={(e) => {
          const iv = setInterval(() => s.emit("ps:y", Math.max(0, (rt.current?.p?.[seat]?.[0] || 200) - 20)), 40);
          const up = () => { clearInterval(iv); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointerup", up);
        }} aria-label="Up">▲</button>
        <button onPointerDownCapture={(e) => {
          const iv = setInterval(() => s.emit("ps:y", Math.min(500, (rt.current?.p?.[seat]?.[0] || 200) + 120)), 40);
          const up = () => { clearInterval(iv); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointerup", up);
        }} aria-label="Down">▼</button>
      </div>
      <div style={{ textAlign: "center", marginTop: 10 }}><Again show={!!st.winner} /></div>
    </div>
  );
}

export function MiniRacing({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const mob = useRef({ f: 0, b: 0, l: 0, r: 0 });

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const inp = { f: 0, b: 0, l: 0, r: 0 };
    const KEYS = { w: "f", arrowup: "f", s: "b", arrowdown: "b", a: "l", arrowleft: "l", d: "r", arrowright: "r" };
    const key = (v) => (e) => {
      if (e.target.tagName === "INPUT") return;
      const k = KEYS[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      inp[k] = v;
    };
    const kd = key(1), ku = key(0);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const send = setInterval(() => {
      const m = mob.current;
      s.emit("rc:input", { f: inp.f || m.f, b: inp.b || m.b, l: inp.l || m.l, r: inp.r || m.r });
    }, 33);
    let raf;
    const frame = () => {
      const d = rt.current;
      g.fillStyle = "#0a1a0a"; g.fillRect(0, 0, 800, 500);
      // track oval
      g.strokeStyle = "#2a4a2a"; g.lineWidth = 70;
      g.beginPath(); g.ellipse(400, 250, 280, 160, 0, 0, 7); g.stroke();
      g.strokeStyle = "#3ddc97"; g.lineWidth = 2; g.setLineDash([10, 10]);
      g.beginPath(); g.ellipse(400, 250, 280, 160, 0, 0, 7); g.stroke(); g.setLineDash([]);
      // start line
      g.strokeStyle = "#fff"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(400 + 250, 250); g.lineTo(400 + 310, 250); g.stroke();
      if (d) {
        d.c.forEach((q, i) => {
          const [id, x, y, a, laps, spd] = q;
          const col = id === me ? "#4cc9f0" : "#ff6b6b";
          g.save();
          g.translate(x, y); g.rotate(a);
          g.fillStyle = col;
          rr(g, -14, -8, 28, 16, 4); g.fill();
          g.fillStyle = "#fff"; g.fillRect(6, -5, 6, 10);
          g.restore();
          g.fillStyle = "#eaf2ff"; g.font = "600 12px sans-serif"; g.textAlign = "center";
          const nm = room.players.find((p) => p.id === id)?.name || "?";
          g.fillText(`${nm} L${laps}/3`, x, y - 18);
        });
        if (d.winner) {
          g.fillStyle = "#ffd23f"; g.font = "800 36px sans-serif"; g.textAlign = "center";
          g.fillText(d.winner === me ? "You win the race!" : "Race over", 400, 250);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf); clearInterval(send);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
    };
  }, [s, me, room.players, rt]);

  const hold = (k, v) => () => { mob.current[k] = v; };
  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : ["First to 3 laps wins. Stay on the track!", ""];
  return (
    <div className="arena-wrap">
      <p className={`status ${cls}`}>{txt}</p>
      <p className="landscape-hint">Tip: rotate to landscape for a bigger track.</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <p className="meta" style={{ marginTop: 8 }}><kbd>W</kbd> gas · <kbd>S</kbd> brake · <kbd>A</kbd><kbd>D</kbd> steer</p>
      <div className="mctl">
        <div className="dpad">
          <button className="u" onPointerDown={hold("f", 1)} onPointerUp={hold("f", 0)} onPointerLeave={hold("f", 0)} aria-label="Gas">▲</button>
          <button onPointerDown={hold("l", 1)} onPointerUp={hold("l", 0)} onPointerLeave={hold("l", 0)} aria-label="Left">◀</button>
          <button onPointerDown={hold("b", 1)} onPointerUp={hold("b", 0)} onPointerLeave={hold("b", 0)} aria-label="Brake">▼</button>
          <button onPointerDown={hold("r", 1)} onPointerUp={hold("r", 0)} onPointerLeave={hold("r", 0)} aria-label="Right">▶</button>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 10 }}><Again show={!!st.winner} /></div>
    </div>
  );
}
