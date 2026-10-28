"use client";
import { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { Arena, HoldBtn, Stick } from "./touch";

const PC = ["#ff6b6b", "#4cc9f0"]; // player colours by seat

// ---------------------------------------------------------------- shared bits
function ScoreBar({ room, me, scores, turn, colors, sub }) {
  return (
    <div className="scorebar">
      {room.players.map((p, i) => (
        <div key={p.id} className={`pc ${turn === p.id ? "active" : ""}`} style={{ "--c": colors?.[p.id] || PC[i] }}>
          <span className="av">{p.name[0]?.toUpperCase()}</span>
          <span className="nm">{p.id === me ? "You" : p.name}{sub && sub[p.id] != null && <small>{sub[p.id]}</small>}</span>
          {scores && <span className="sc">{scores[p.id] ?? 0}</span>}
        </div>
      ))}
    </div>
  );
}

function banner(room, me, winner, turn, turnText = "Your turn") {
  const nm = (id) => room.players.find((p) => p.id === id)?.name;
  if (winner === "draw") return ["It's a draw.", ""];
  if (winner) return winner === me ? ["You win! 🎉", "good"] : [`${nm(winner)} wins.`, "bad"];
  return turn === me ? [turnText, "turn"] : [`${nm(turn)}'s turn`, ""];
}

const Again = ({ show }) => (show ? <button className="primary" onClick={() => getSocket().emit("rematch")}>Play again</button> : null);

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// realtime snapshots from the server (snake / pong / tanks)
function useRT() {
  const s = getSocket();
  const ref = useRef(null);
  useEffect(() => {
    const on = (d) => { ref.current = { ...d, at: performance.now() }; };
    s.on("rt:state", on);
    s.emit("rt:sync");
    return () => s.off("rt:state", on);
  }, [s]);
  return ref;
}

// ================================================================ BATTLESHIP
export function Battleship({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const opp = room.players.find((p) => p.id !== me);
  const myTurn = st.turn === me && !st.winner;
  const [txt, cls] = banner(room, me, st.winner, st.turn, "Your turn — fire at enemy waters");
  const sunk = new Set(st.sunk.map(([y, x]) => y + "," + x));
  const last = st.last;
  const lastText = last ? `${last.by === me ? "You" : opp?.name} ${last.res === "miss" ? "missed" : last.res === "hit" ? "scored a hit!" : `sank the ${last.ship}!`}` : "Shots alternate. Sink all 5 ships to win.";
  const fleetRow = (hp) => st.fleet.map(([n, l], i) => (
    <span key={n} className={`bs-ship ${hp[i] === 0 ? "s" : ""}`} title={n}>{Array.from({ length: l }, (_, k) => <i key={k} />)}</span>
  ));
  const size = { "--bs": "min(7.2vw,30px)" };

  return (
    <>
      <p className={`status ${cls}`}>{txt}</p>
      <p className="meta">{lastText}</p>
      <div className="bs">
        <div className="bs-col">
          <h3>Enemy waters</h3>
          <div className="bs-grid" style={size}>
            {st.shots.map((row, y) => row.map((v, x) => {
              let c = "";
              if (v === 2) c = sunk.has(y + "," + x) ? "sunk" : "hit";
              else if (v === 1) c = "miss";
              else if (st.enemyShips && st.enemyShips[y][x] >= 0) c = "reveal";
              const isLast = last && last.by === me && last.y === y && last.x === x;
              return <button key={y + "-" + x} className={`bs-cell ${c} ${isLast ? "last" : ""}`} disabled={!myTurn || !!v} aria-label={`Fire at row ${y + 1} column ${x + 1}`} onClick={() => s.emit("bs:fire", [y, x])} />;
            }))}
          </div>
          <div className="bs-fleet">{fleetRow(st.oppHp)}</div>
        </div>
        <div className="bs-col">
          <h3>Your fleet</h3>
          <div className="bs-grid" style={size}>
            {st.mine.map((row, y) => row.map((si, x) => {
              const inc = st.incoming[y][x];
              let c = si >= 0 ? "ship" : "";
              if (inc === 2) c = st.myHp[si] === 0 ? "sunk" : "hit";
              else if (inc === 1) c = "miss";
              const isLast = last && last.by !== me && last.y === y && last.x === x;
              return <div key={y + "-" + x} className={`bs-cell ${c} ${isLast ? "last" : ""}`} />;
            }))}
          </div>
          <div className="bs-fleet">{fleetRow(st.myHp)}</div>
        </div>
      </div>
      <Again show={!!st.winner} />
    </>
  );
}

// ================================================================ DOTS & BOXES
export function DotsBoxes({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const myTurn = st.turn === me && !st.winner;
  const [txt, cls] = banner(room, me, st.winner, st.turn, "Your turn — draw a line");
  const N = 5, G = 62, PAD = 24, SIZE = PAD * 2 + N * G;
  const col = (id) => PC[Math.max(0, room.players.findIndex((p) => p.id === id))];
  const initial = (id) => room.players.find((p) => p.id === id)?.name[0]?.toUpperCase();
  const isLast = (t, r, c) => st.last && st.last.t === t && st.last.r === r && st.last.c === c;
  const line = (t, r, c, owner) => {
    const x = PAD + c * G, y = PAD + r * G;
    const horiz = t === "h";
    const props = horiz ? { x: x + 9, y: y - 6, width: G - 18, height: 12 } : { x: x - 6, y: y + 9, width: 12, height: G - 18 };
    return (
      <rect key={t + r + c} {...props} rx="6" className={`ln ${owner ? "own" : ""} ${!myTurn ? "off" : ""}`}
        style={owner ? { fill: col(owner), filter: isLast(t, r, c) ? "drop-shadow(0 0 6px #ffd23f)" : undefined } : undefined}
        onClick={() => !owner && myTurn && s.emit("db:line", { t, r, c })} />
    );
  };
  return (
    <>
      <ScoreBar room={room} me={me} scores={st.scores} turn={st.turn} />
      <p className={`status ${cls}`}>{txt}</p>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="db" role="img" aria-label="Dots and boxes board">
        {st.boxes.map((row, r) => row.map((o, c) => o && (
          <g key={`b${r}${c}`}>
            <rect x={PAD + c * G + 6} y={PAD + r * G + 6} width={G - 12} height={G - 12} rx="8" fill={col(o)} opacity=".85" />
            <text x={PAD + c * G + G / 2} y={PAD + r * G + G / 2 + 8} textAnchor="middle">{initial(o)}</text>
          </g>
        )))}
        {st.h.map((row, r) => row.map((o, c) => line("h", r, c, o)))}
        {st.v.map((row, r) => row.map((o, c) => line("v", r, c, o)))}
        {Array.from({ length: N + 1 }, (_, r) => Array.from({ length: N + 1 }, (_, c) => (
          <circle key={`d${r}${c}`} cx={PAD + c * G} cy={PAD + r * G} r="6" fill="#eef4ff" />
        )))}
      </svg>
      <p className="meta">Closing a box scores a point and gives you another turn.</p>
      <Again show={!!st.winner} />
    </>
  );
}

// ================================================================ REVERSI
export function Reversi({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const mine = st.colors[me];
  const idOf = (c) => room.players.find((p) => st.colors[p.id] === c)?.id;
  const winnerId = st.winner === "draw" ? "draw" : st.winner ? idOf(st.winner) : null;
  const myTurn = st.turn === mine && !st.winner;
  const [txt, cls] = banner(room, me, winnerId, idOf(st.turn), "Your turn — dots show legal moves");
  const legal = new Set(st.moves.map(([y, x]) => y + "," + x));
  const flipped = new Set((st.flipped || []).map(([y, x]) => y + "," + x));
  const scores = { [idOf("B")]: st.counts.B, [idOf("W")]: st.counts.W };
  const passedNote = st.passed && !st.winner ? `${st.passed === mine ? "You have" : "Opponent has"} no legal move — turn skipped.` : "";
  return (
    <>
      <ScoreBar room={room} me={me} scores={scores} turn={st.winner ? null : idOf(st.turn)}
        colors={{ [idOf("B")]: "#9aa7ba", [idOf("W")]: "#f4f7fb" }} sub={{ [idOf("B")]: "Black", [idOf("W")]: "White" }} />
      <p className={`status ${cls}`}>{txt}</p>
      {passedNote && <p className="meta">{passedNote}</p>}
      <div className="rv" role="grid" aria-label="Reversi board">
        {st.board.map((row, y) => row.map((c, x) => {
          const k = y + "," + x;
          const can = myTurn && legal.has(k);
          const isLast = st.last && st.last[0] === y && st.last[1] === x;
          return (
            <button key={k} className={`rv-cell ${can ? "can" : ""} ${isLast ? "last" : ""}`} disabled={!can} aria-label={`Row ${y + 1} column ${x + 1}`} onClick={() => s.emit("rv:move", [y, x])}>
              {c && <span className={`rv-disc ${c} ${flipped.has(k) ? "flip" : ""}`} />}
            </button>
          );
        }))}
      </div>
      <p className="meta">You play {mine === "B" ? "Black (moves first)" : "White"}.</p>
      <Again show={!!st.winner} />
    </>
  );
}

// ================================================================ GOMOKU
export function Gomoku({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const mine = st.colors[me];
  const idOf = (c) => room.players.find((p) => st.colors[p.id] === c)?.id;
  const winnerId = st.winner === "draw" ? "draw" : st.winner ? idOf(st.winner) : null;
  const myTurn = st.turn === mine && !st.winner;
  const [txt, cls] = banner(room, me, winnerId, idOf(st.turn), "Your turn — place a stone");
  const N = 15, G = 36, PAD = 22, SIZE = PAD * 2 + (N - 1) * G;
  const stars = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
  const onLine = new Set((st.line || []).map(([y, x]) => y + "," + x));
  return (
    <>
      <ScoreBar room={room} me={me} turn={st.winner ? null : idOf(st.turn)}
        colors={{ [idOf("B")]: "#9aa7ba", [idOf("W")]: "#f4f7fb" }} sub={{ [idOf("B")]: "Black", [idOf("W")]: "White" }} />
      <p className={`status ${cls}`}>{txt}</p>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="gm" role="grid" aria-label="Gomoku board">
        <defs>
          <linearGradient id="gmWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e9c27e" /><stop offset="1" stopColor="#c99a55" /></linearGradient>
          <radialGradient id="gmB" cx=".35" cy=".3"><stop offset="0" stopColor="#6a6a6a" /><stop offset="1" stopColor="#0b0b0b" /></radialGradient>
          <radialGradient id="gmW" cx=".35" cy=".3"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#c9d2e0" /></radialGradient>
        </defs>
        <rect width={SIZE} height={SIZE} rx="12" fill="url(#gmWood)" />
        {Array.from({ length: N }, (_, i) => (
          <g key={i} stroke="#6b4a1f" strokeWidth="1.2">
            <line x1={PAD} x2={SIZE - PAD} y1={PAD + i * G} y2={PAD + i * G} />
            <line y1={PAD} y2={SIZE - PAD} x1={PAD + i * G} x2={PAD + i * G} />
          </g>
        ))}
        {stars.map(([y, x]) => <circle key={y + "" + x} cx={PAD + x * G} cy={PAD + y * G} r="4" fill="#6b4a1f" />)}
        {st.board.map((row, y) => row.map((c, x) => {
          const cx = PAD + x * G, cy = PAD + y * G;
          if (!c) return <circle key={y + "-" + x} className={`hit ${myTurn ? "" : "off"}`} cx={cx} cy={cy} r={G / 2} onClick={() => myTurn && s.emit("gm:place", [y, x])} />;
          const isLast = st.last && st.last[0] === y && st.last[1] === x;
          return (
            <g key={y + "-" + x}>
              <circle cx={cx + 1.5} cy={cy + 2.5} r={G / 2 - 3} fill="rgba(0,0,0,.3)" />
              <circle cx={cx} cy={cy} r={G / 2 - 3} fill={`url(#gm${c})`} />
              {isLast && <circle cx={cx} cy={cy} r="4.5" fill="#ff4d4d" />}
              {onLine.has(y + "," + x) && <circle cx={cx} cy={cy} r={G / 2 - 1} fill="none" stroke="#3ddc97" strokeWidth="3" />}
            </g>
          );
        }))}
      </svg>
      <p className="meta">You play {mine === "B" ? "Black (moves first)" : "White"}. Five in a row wins.</p>
      <Again show={!!st.winner} />
    </>
  );
}

// ================================================================ SNAKE
export function Snake({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const dir = (d) => s.emit("sn:dir", d);

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const KEYS = { arrowup: "u", w: "u", arrowdown: "d", s: "d", arrowleft: "l", a: "l", arrowright: "r", d: "r" };
    const kd = (e) => {
      if (e.target.tagName === "INPUT") return;
      const d = KEYS[e.key.toLowerCase()];
      if (d) { e.preventDefault(); dir(d); }
    };
    window.addEventListener("keydown", kd);
    let sx = 0, sy = 0;
    const pd = (e) => { sx = e.clientX; sy = e.clientY; };
    const pu = (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      dir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : (dy > 0 ? "d" : "u"));
    };
    cv.addEventListener("pointerdown", pd); cv.addEventListener("pointerup", pu);

    const C = 25;
    let raf;
    const frame = () => {
      const d = rt.current, t = performance.now();
      const bg = g.createLinearGradient(0, 0, 800, 500);
      bg.addColorStop(0, "#08141f"); bg.addColorStop(1, "#0b1d2e");
      g.fillStyle = bg; g.fillRect(0, 0, 800, 500);
      for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) {
        if ((x + y) % 2) { g.fillStyle = "rgba(255,255,255,.022)"; g.fillRect(x * C, y * C, C, C); }
      }
      if (d) {
        // food
        d.food.forEach(([x, y]) => {
          const pulse = 1 + Math.sin(t / 160 + x) * 0.12;
          g.save(); g.shadowColor = "#ffd23f"; g.shadowBlur = 14;
          g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(x * C + C / 2, y * C + C / 2, 7 * pulse, 0, 7); g.fill(); g.restore();
          g.fillStyle = "#fff6c9"; g.beginPath(); g.arc(x * C + C / 2 - 2, y * C + C / 2 - 2, 2.2, 0, 7); g.fill();
        });
        d.snakes.forEach((k, i) => {
          const mineS = k.id === me, base = mineS ? "#3ddc97" : "#ff6b6b", dark = mineS ? "#1a8f63" : "#b53a3a";
          g.save();
          if (k.alive) { g.shadowColor = base; g.shadowBlur = 12; }
          k.body.forEach(([x, y], j) => {
            const f = 1 - (j / Math.max(k.body.length, 1)) * 0.35;
            g.globalAlpha = k.alive ? 1 : 0.35;
            g.fillStyle = j % 2 ? dark : base;
            rr(g, x * C + 1.5, y * C + 1.5, C - 3, C - 3, j === 0 ? 9 : 6);
            g.fill();
          });
          g.restore();
          const [hx, hy] = k.body[0];
          // eyes look along the heading
          const nx = k.body[1] || [hx - 1, hy];
          const vx = hx - nx[0], vy = hy - nx[1];
          g.fillStyle = "#fff";
          [[-1, 1], [1, 1]].forEach(([a]) => {
            const px = hx * C + C / 2 + vx * 5 + (vy ? a * 6 : 0), py = hy * C + C / 2 + vy * 5 + (vx ? a * 6 : 0);
            g.beginPath(); g.arc(px, py, 3.2, 0, 7); g.fill();
            g.fillStyle = "#07101c"; g.beginPath(); g.arc(px + vx * 1.2, py + vy * 1.2, 1.5, 0, 7); g.fill(); g.fillStyle = "#fff";
          });
          g.font = "700 13px sans-serif"; g.textAlign = i ? "right" : "left"; g.fillStyle = base;
          g.fillText(`${room.players.find((p) => p.id === k.id)?.name || ""}: ${k.body.length}`, i ? 790 : 10, 18);
        });
        if (d.count > 0) {
          g.fillStyle = "rgba(5,11,22,.55)"; g.fillRect(0, 0, 800, 500);
          g.textAlign = "center"; g.fillStyle = "#ffd23f"; g.font = "800 90px sans-serif";
          g.fillText(String(Math.ceil(d.count / 9)), 400, 285);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); cv.removeEventListener("pointerdown", pd); cv.removeEventListener("pointerup", pu); };
  }, [s, me, room.players, rt]);

  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : ["Eat 🟡 to grow. Don't crash!", ""];
  const dp = (k, sym) => <HoldBtn className={`pk-${k}`} label={k} onDown={() => dir(k)}>{sym}</HoldBtn>;
  return (
    <Arena ratio={1.6} hint="Arrow keys / WASD, swipe on the board, or use the on-screen pad. You are the green snake."
      controls={<div className="tc-r"><div className="pad">{dp("u", "▲")}{dp("l", "◀")}{dp("d", "▼")}{dp("r", "▶")}</div></div>}>
      <p className={`status ${cls}`}>{txt}</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <div className="again"><Again show={!!st.winner} /></div>
    </Arena>
  );
}

// ================================================================ PONG
export function Pong({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const seat = st.ids.indexOf(me);

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const keys = { u: 0, d: 0 };
    let myY = 250, lastSent = -1;
    const disp = [205, 205];
    const send = () => { const y = Math.round(myY); if (y !== lastSent) { lastSent = y; s.emit("pg:y", y); } };
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
      if (keys.u || keys.d) { myY = Math.max(0, Math.min(500, myY + (keys.d - keys.u) * 14)); send(); }
    }, 30);

    let raf;
    const frame = () => {
      const d = rt.current, now = performance.now();
      g.fillStyle = "#060b17"; g.fillRect(0, 0, 800, 500);
      const grad = g.createRadialGradient(400, 250, 40, 400, 250, 420);
      grad.addColorStop(0, "rgba(76,201,240,.12)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad; g.fillRect(0, 0, 800, 500);
      g.strokeStyle = "rgba(143,166,196,.35)"; g.lineWidth = 3; g.setLineDash([14, 14]);
      g.beginPath(); g.moveTo(400, 0); g.lineTo(400, 500); g.stroke(); g.setLineDash([]);
      if (d) {
        d.p.forEach(([y], i) => { disp[i] += (y - disp[i]) * 0.6; });
        g.textAlign = "center"; g.font = "800 64px sans-serif"; g.fillStyle = "rgba(255,255,255,.14)";
        g.fillText(d.p[0][1], 300, 80); g.fillText(d.p[1][1], 500, 80);
        const cols = ["#4cc9f0", "#ff6b6b"];
        [0, 1].forEach((i) => {
          const x = i ? 758 : 30;
          g.save(); g.shadowColor = cols[i]; g.shadowBlur = i === seat ? 22 : 12;
          const pg = g.createLinearGradient(x, 0, x + 12, 0);
          pg.addColorStop(0, "#fff"); pg.addColorStop(1, cols[i]);
          g.fillStyle = pg; rr(g, x, disp[i], 12, 90, 6); g.fill(); g.restore();
        });
        // ball extrapolated from the last snapshot for smooth motion
        const dt = d.count > 0 ? 0 : Math.min(0.1, (now - d.at) / 1000);
        const bx = d.b[0] + d.b[2] * dt, by = d.b[1] + d.b[3] * dt;
        const sp = Math.hypot(d.b[2], d.b[3]);
        g.save(); g.shadowColor = "#fff"; g.shadowBlur = 18;
        for (let k = 4; k >= 1; k--) {
          g.fillStyle = `rgba(255,255,255,${0.08 * (5 - k)})`;
          g.beginPath(); g.arc(bx - (d.b[2] / (sp || 1)) * k * 7, by - (d.b[3] / (sp || 1)) * k * 7, 8 - k, 0, 7); g.fill();
        }
        g.fillStyle = "#fff"; g.beginPath(); g.arc(bx, by, 8, 0, 7); g.fill(); g.restore();
        g.font = "700 12px sans-serif"; g.fillStyle = "#8fa6c4";
        if (seat >= 0) g.fillText("▲ YOU", seat ? 764 : 36, 492);
        if (d.count > 0 && !d.winner) {
          g.fillStyle = "#ffd23f"; g.font = "800 70px sans-serif"; g.fillText(String(Math.ceil(d.count / 23)), 400, 275);
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
  }, [s, rt, seat]);

  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : [`First to ${st.target} wins`, ""];
  return (
    <Arena ratio={1.6} hint="Move with the mouse / your finger, or W S / ↑ ↓. Hit the ball near a paddle edge to steer it.">
      <ScoreBar room={room} me={me} />
      <p className={`status ${cls}`}>{txt}</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <div className="again"><Again show={!!st.winner} /></div>
    </Arena>
  );
}

// ================================================================ TANK BATTLE
const TK_WALLS = [
  { x: 370, y: 150, w: 60, h: 200 }, { x: 140, y: 90, w: 130, h: 22 }, { x: 530, y: 388, w: 130, h: 22 },
  { x: 140, y: 300, w: 22, h: 110 }, { x: 638, y: 90, w: 22, h: 110 }, { x: 230, y: 220, w: 50, h: 60 }, { x: 520, y: 220, w: 50, h: 60 },
];

function drawTank(g, x, y, a, t, col, dark, hp, cool, label) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = "#141b26"; g.fillRect(-19, -16, 38, 8); g.fillRect(-19, 8, 38, 8);
  g.fillStyle = "#2a3748";
  for (let i = -17; i < 17; i += 6) { g.fillRect(i, -16, 3, 8); g.fillRect(i, 8, 3, 8); }
  const gr = g.createLinearGradient(0, -11, 0, 11);
  gr.addColorStop(0, col); gr.addColorStop(1, dark);
  g.fillStyle = gr; rr(g, -17, -11, 34, 22, 6); g.fill();
  g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 1.5; rr(g, -17, -11, 34, 22, 6); g.stroke();
  g.restore();
  g.save(); g.translate(x, y); g.rotate(t);
  g.fillStyle = "#1d2735"; g.fillRect(4, -3.5, 25, 7);
  g.fillStyle = col; g.fillRect(26, -4.5, 5, 9);
  const tg = g.createRadialGradient(-2, -2, 1, 0, 0, 10);
  tg.addColorStop(0, "#fff"); tg.addColorStop(.3, col); tg.addColorStop(1, dark);
  g.fillStyle = tg; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
  g.restore();
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i < hp ? "#3ddc97" : "rgba(255,255,255,.15)";
    g.fillRect(x - 15 + i * 11, y - 31, 9, 5);
  }
  if (cool > 0) { g.fillStyle = "rgba(255,210,63,.8)"; g.fillRect(x - 15, y + 26, 30 * (cool / 27), 3); }
  g.fillStyle = "#eaf2ff"; g.font = "600 11px sans-serif"; g.textAlign = "center"; g.fillText(label, x, y - 36);
}

export function Tanks({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const inpR = useRef({ f: 0, b: 0, l: 0, r: 0, fire: 0, aim: 0 });
  const dirtyR = useRef(false);
  const taim = useRef(null); // aim angle from the on-screen stick, null when idle
  const setK = (k, v) => { v = v ? 1 : 0; if (inpR.current[k] !== v) { inpR.current[k] = v; dirtyR.current = true; } };

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const inp = inpR.current;
    const mouse = { x: 400, y: 250 };
    const KEYS = { w: "f", arrowup: "f", s: "b", arrowdown: "b", a: "l", arrowleft: "l", d: "r", arrowright: "r", " ": "fire" };
    const key = (v) => (e) => {
      if (e.target.tagName === "INPUT") return;
      const k = KEYS[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      if (inp[k] !== v) { inp[k] = v; dirtyR.current = true; }
    };
    const kd = key(1), ku = key(0);
    const mm = (e) => {
      if (e.pointerType !== "mouse") return;
      const r = cv.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 800; mouse.y = ((e.clientY - r.top) / r.height) * 500;
    };
    const md = (e) => { if (e.pointerType !== "mouse") return; inp.fire = 1; dirtyR.current = true; };
    const mu = (e) => { if (e.pointerType === "mouse" && inp.fire) { inp.fire = 0; dirtyR.current = true; } };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("pointerup", mu);
    cv.addEventListener("pointermove", mm); cv.addEventListener("pointerdown", md);
    const send = setInterval(() => {
      const d = rt.current, mt = d && d.t.find((t) => t[0] === me);
      if (mt) {
        const a = taim.current ?? Math.atan2(mouse.y - mt[2], mouse.x - mt[1]);
        if (Math.abs(a - inp.aim) > 0.02) { inp.aim = a; dirtyR.current = true; }
      }
      if (dirtyR.current) { dirtyR.current = false; s.emit("tk:input", inp); }
    }, 33);

    let raf;
    const frame = () => {
      const d = rt.current;
      // ground
      const bg = g.createLinearGradient(0, 0, 0, 500);
      bg.addColorStop(0, "#2b3a22"); bg.addColorStop(1, "#222f1b");
      g.fillStyle = bg; g.fillRect(0, 0, 800, 500);
      g.strokeStyle = "rgba(0,0,0,.16)"; g.lineWidth = 1;
      for (let x = 0; x <= 800; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 500); g.stroke(); }
      for (let y = 0; y <= 500; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(800, y); g.stroke(); }
      g.strokeStyle = "#0e1510"; g.lineWidth = 8; g.strokeRect(4, 4, 792, 492);
      // walls
      TK_WALLS.forEach((w) => {
        g.save(); g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 10; g.shadowOffsetY = 4;
        g.fillStyle = "#59636f"; g.fillRect(w.x, w.y, w.w, w.h); g.restore();
        g.fillStyle = "#7c8895"; g.fillRect(w.x, w.y, w.w, 4);
        g.strokeStyle = "rgba(0,0,0,.3)"; g.lineWidth = 1;
        for (let y = w.y + 14; y < w.y + w.h; y += 14) { g.beginPath(); g.moveTo(w.x, y); g.lineTo(w.x + w.w, y); g.stroke(); }
      });
      if (d) {
        d.t.forEach(([id, x, y, a, t, hp, cool], i) => {
          const mineT = id === me;
          if (hp > 0) drawTank(g, x, y, a, t, mineT ? "#6fd36f" : "#e86a5a", mineT ? "#2f7d32" : "#8f2e24", hp, cool, mineT ? "YOU" : room.players.find((p) => p.id === id)?.name || "");
          else { g.fillStyle = "rgba(20,20,20,.7)"; g.beginPath(); g.arc(x, y, 18, 0, 7); g.fill(); g.font = "22px serif"; g.textAlign = "center"; g.fillText("💥", x, y + 8); }
        });
        g.save(); g.shadowColor = "#ffb347"; g.shadowBlur = 12; g.fillStyle = "#ffe29a";
        d.s.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); });
        g.restore();
        // HUD
        g.fillStyle = "rgba(5,11,22,.65)"; rr(g, 280, 8, 240, 30, 15); g.fill();
        g.font = "800 15px sans-serif"; g.textAlign = "center";
        const [a, b] = d.t;
        g.fillStyle = a[0] === me ? "#6fd36f" : "#e86a5a"; g.fillText(String(a[7]), 330, 29);
        g.fillStyle = b[0] === me ? "#6fd36f" : "#e86a5a"; g.fillText(String(b[7]), 470, 29);
        g.fillStyle = "#eaf2ff"; g.font = "600 12px sans-serif"; g.fillText(`Round ${d.round} · first to ${d.target}`, 400, 28);
        g.font = "800 40px sans-serif"; g.fillStyle = "#ffd23f";
        if (d.over > 0 && !d.winner) {
          const nm = d.msg === "draw" ? "Both tanks down!" : d.msg === me ? "You take the round!" : `${room.players.find((p) => p.id === d.msg)?.name} takes the round`;
          g.fillText(nm, 400, 260);
        } else if (d.wait > 0 && !d.winner) g.fillText(d.wait > 40 ? "Ready…" : "FIGHT!", 400, 260);
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf); clearInterval(send);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("pointerup", mu);
      cv.removeEventListener("pointermove", mm); cv.removeEventListener("pointerdown", md);
    };
  }, [s, me, room.players, rt]);

  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : ["Outgun your rival — shells ricochet twice!", ""];
  const drive = ({ x, y }) => { setK("r", x > 0.4); setK("l", x < -0.4); setK("b", y > 0.4); setK("f", y < -0.4); };
  const aim = ({ x, y, mag, active }) => { taim.current = active && mag > 0.2 ? Math.atan2(y, x) : null; };
  return (
    <Arena ratio={1.6} hint="W S drive · A D rotate hull · mouse aims the turret · click or Space fires. On a phone: left stick drives, right stick aims, 💥 fires."
      controls={<>
        <div className="tc-l"><Stick label="Drive" onChange={drive} /></div>
        <div className="tc-r">
          <HoldBtn className="atk" label="Fire" onDown={() => setK("fire", 1)} onUp={() => setK("fire", 0)}>💥</HoldBtn>
          <Stick label="Aim turret" onChange={aim} />
        </div>
      </>}>
      <p className={`status ${cls}`}>{txt}</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <div className="again"><Again show={!!st.winner} /></div>
    </Arena>
  );
}

// ================================================================ RACE GAMES
function Race({ room, me, math }) {
  const s = getSocket();
  const st = room.state;
  const [left, setLeft] = useState(st.left);
  const [text, setText] = useState("");
  const [shake, setShake] = useState(false);
  const nm = (id) => room.players.find((p) => p.id === id)?.name;

  useEffect(() => {
    setText("");
    if (st.phase !== "asking") return;
    setLeft(st.left);
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [st.i, st.phase]);

  useEffect(() => {
    const miss = () => { setShake(true); setText(""); setTimeout(() => setShake(false), 400); };
    s.on("race:miss", miss);
    return () => s.off("race:miss", miss);
  }, [s]);

  const submit = (e) => {
    e.preventDefault();
    if (text.trim()) s.emit("race:guess", text.trim());
  };

  if (st.phase === "done") {
    const [a, b] = [...room.players].sort((x, y) => st.scores[y.id] - st.scores[x.id]);
    const tie = st.scores[a.id] === st.scores[b.id];
    return (
      <>
        <ScoreBar room={room} me={me} scores={st.scores} />
        <p className={`status ${tie ? "" : a.id === me ? "good" : "bad"}`}>{tie ? "Tie game." : a.id === me ? "You win! 🎉" : `${a.name} wins.`}</p>
        <Again show />
      </>
    );
  }

  const rv = st.reveal;
  const answered = rv ? (rv.winner === me ? "You got it! +1" : rv.winner ? `${nm(rv.winner)} got it first` : "Time's up — nobody scored") : "";
  return (
    <>
      <ScoreBar room={room} me={me} scores={st.scores} />
      <p className="meta">Round {st.i + 1} of {st.total}{math ? "" : ` · Hint: ${st.hint}`}</p>
      <div className="timebar" aria-hidden><i style={{ width: `${rv ? 0 : (left / st.secs) * 100}%` }} /></div>
      {math
        ? <div className="eq" aria-label={`${st.prompt} equals?`}>{st.prompt} = ?</div>
        : <div className="race-q" aria-label={`Scrambled word: ${st.prompt}`}>{st.prompt.split("").map((ch, i) => <span key={st.i + "-" + i} className="tile" style={{ animationDelay: `${i * 40}ms` }}>{ch}</span>)}</div>}
      {rv ? (
        <>
          <p className={`status ${rv.winner === me ? "good" : rv.winner ? "bad" : ""}`}>{answered}</p>
          <p className="meta">Answer: <b>{rv.answer}</b></p>
        </>
      ) : (
        <form className={`guess ${shake ? "shake" : ""}`} onSubmit={submit}>
          <input autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode={math ? "numeric" : "text"}
            value={text} onChange={(e) => setText(e.target.value)} placeholder={math ? "Your answer" : "Type the word"} aria-label="Your answer" />
          <button className="primary">Go</button>
        </form>
      )}
    </>
  );
}
export const Scramble = (p) => <Race {...p} />;
export const MathRace = (p) => <Race {...p} math />;

// ================================================================ QUICK DRAW
export function QuickDraw({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const opp = room.players.find((p) => p.id !== me);
  const hit = () => { if (st.phase === "wait" || st.phase === "go") s.emit("qd:hit"); };

  useEffect(() => {
    const kd = (e) => { if (e.code === "Space" && e.target.tagName !== "INPUT") { e.preventDefault(); if (!e.repeat) hit(); } };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  });

  const pips = (id) => (
    <span className="stars" aria-label={`${st.scores[id]} of ${st.target}`}>
      {Array.from({ length: st.target }, (_, i) => <i key={i} className={i < st.scores[id] ? "on" : ""}>⭐</i>)}
    </span>
  );
  const r = st.result;
  let big = "", small = "", icon = "";
  if (st.phase === "wait") { big = "Wait for it…"; small = "Don't fire early!"; icon = "🌵"; }
  else if (st.phase === "go") { big = "DRAW!"; small = "Click, tap or press Space"; icon = "🔫"; }
  else if (r) {
    icon = r.winner === me ? "🏆" : "💀";
    if (r.foul) { big = r.foul === me ? "Too early!" : "They flinched!"; small = r.foul === me ? "Point to your rival." : "Point to you."; }
    else { big = r.winner === me ? `${r.ms} ms` : `${opp?.name}: ${r.ms} ms`; small = r.winner === me ? "You drew first!" : "Too slow!"; }
  }
  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : [`Round ${st.round} · first to ${st.target}`, ""];
  return (
    <>
      <div className="scorebar">
        {room.players.map((p, i) => (
          <div key={p.id} className="pc" style={{ "--c": PC[i] }}>
            <span className="av">{p.name[0]?.toUpperCase()}</span>
            <span className="nm">{p.id === me ? "You" : p.name}</span>
            {pips(p.id)}
          </div>
        ))}
      </div>
      <p className={`status ${cls}`}>{txt}</p>
      <div className={`qd ${st.phase === "go" ? "go" : st.phase === "wait" ? "wait" : "reveal"}`} role="button" tabIndex={0}
        onPointerDown={hit} aria-label={big}>
        <span style={{ fontSize: "3rem" }} aria-hidden>{icon}</span>
        <span className="big">{big}</span>
        <span className="meta">{small}</span>
      </div>
      <Again show={!!st.winner} />
    </>
  );
}

// shared helpers re-used by games3.js
export { ScoreBar, banner, Again, rr, useRT };
