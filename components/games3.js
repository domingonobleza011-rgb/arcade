"use client";
import { useEffect, useState } from "react";
import { getSocket } from "../lib/socket";
import { ScoreBar, banner, Again } from "./games2";

const PC = ["#ff6b6b", "#4cc9f0"];

// ================================================================ CHESS
const GLY = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
const glyph = (p) => GLY[p[1]] + "\uFE0E"; // \uFE0E stops phones turning pawns into emoji

export function Chess({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const mine = st.colors[me];
  const flip = mine === "b";
  const [sel, setSel] = useState(null);
  const [promo, setPromo] = useState(null);
  const [conf, setConf] = useState(false);
  const idOf = (c) => room.players.find((p) => st.colors[p.id] === c)?.id;
  const myTurn = st.turn === mine && !st.winner;

  useEffect(() => { setSel(null); setPromo(null); setConf(false); }, [st.turn, st.winner, st.last]);

  const targets = sel ? st.moves.filter((m) => m[0] === sel[0] && m[1] === sel[1]) : [];
  const tmap = new Map(targets.map((m) => [m[2] + "," + m[3], m]));
  const hasMoves = new Set(st.moves.map((m) => m[0] + "," + m[1]));

  const tap = (r, c) => {
    if (!myTurn) return;
    const m = tmap.get(r + "," + c);
    if (m) {
      if (m[4]) return setPromo({ from: [m[0], m[1]], to: [m[2], m[3]] });
      return s.emit("ch:move", { from: [m[0], m[1]], to: [m[2], m[3]] });
    }
    const p = st.board[r][c];
    if (p && p[0] === mine && hasMoves.has(r + "," + c)) setSel([r, c]);
    else setSel(null);
  };
  const choose = (pc) => { s.emit("ch:move", { ...promo, promo: pc }); setPromo(null); };

  let [txt, cls] = banner(room, me, st.winner, idOf(st.turn), "Your move");
  if (st.winner && st.reason) txt += ` (${st.reason})`;
  else if (st.check && !st.winner) txt += " — check!";

  const rows = [...Array(8).keys()], cols = [...Array(8).keys()];
  const R = flip ? [...rows].reverse() : rows, C = flip ? [...cols].reverse() : cols;
  const capRow = (color) => (
    <span className="ch-caps">{st.caps[color].map((p, i) => <i key={i} className={p[0] === "w" ? "w" : "b"}>{glyph(p)}</i>)}</span>
  );

  return (
    <>
      <ScoreBar room={room} me={me} turn={st.winner ? null : idOf(st.turn)}
        colors={{ [idOf("w")]: "#f4f7fb", [idOf("b")]: "#9aa7ba" }} sub={{ [idOf("w")]: "White", [idOf("b")]: "Black" }} />
      <p className={`status ${cls}`}>{txt}</p>
      <div className="ch-wrap">
        <div className="ch-cap-row">{capRow(flip ? "w" : "b")}</div>
        <div className="ch" role="grid" aria-label="Chess board">
          {R.map((r) => C.map((c) => {
            const p = st.board[r][c], k = r + "," + c;
            const dark = (r + c) % 2 === 1;
            const isSel = sel && sel[0] === r && sel[1] === c;
            const t = tmap.get(k);
            const last = st.last && ((st.last.from[0] === r && st.last.from[1] === c) || (st.last.to[0] === r && st.last.to[1] === c));
            const chk = st.check && st.check[0] === r && st.check[1] === c;
            const first = C[0] === c, bottom = R[7] === r;
            return (
              <button key={k} className={`ch-sq ${dark ? "d" : "l"} ${isSel ? "sel" : ""} ${last ? "last" : ""} ${chk ? "chk" : ""} ${t ? (p ? "cap" : "mv") : ""}`}
                aria-label={`${"abcdefgh"[c]}${8 - r}${p ? " " + p : ""}`} onClick={() => tap(r, c)}>
                {first && <small className="rk">{8 - r}</small>}
                {bottom && <small className="fl">{"abcdefgh"[c]}</small>}
                {p && <span className={`ch-p ${p[0]}`}>{glyph(p)}</span>}
              </button>
            );
          }))}
        </div>
        <div className="ch-cap-row">{capRow(flip ? "b" : "w")}</div>
      </div>
      {promo && (
        <div className="promo" role="dialog" aria-label="Choose promotion">
          <span>Promote to</span>
          {["Q", "R", "B", "N"].map((pc) => <button key={pc} onClick={() => choose(pc)} aria-label={pc}><span className={`ch-p ${mine}`}>{glyph(mine + pc)}</span></button>)}
        </div>
      )}
      <div className="row" style={{ justifyContent: "center", margin: 0 }}>
        {!st.winner && (conf
          ? <><button onClick={() => s.emit("ch:resign")}>Confirm resign</button><button onClick={() => setConf(false)}>Cancel</button></>
          : <button onClick={() => setConf(true)}>Resign</button>)}
        <Again show={!!st.winner} />
      </div>
    </>
  );
}

// ================================================================ SNAKES & LADDERS
const S = 52;
const sq = (n) => {
  const r = Math.floor((n - 1) / 10), c = r % 2 === 0 ? (n - 1) % 10 : 9 - ((n - 1) % 10);
  return [c * S + S / 2, (9 - r) * S + S / 2];
};
const SNAKE_COL = ["#e5484d", "#ff9f1c", "#9141ac", "#2ec27e", "#3584e4", "#d6336c", "#f08c00", "#0ca678", "#7048e8", "#c92a2a"];
const DIE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function SnakeArt({ a, b, i }) {
  const [x1, y1] = sq(a), [x2, y2] = sq(b);
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len, k = (i % 2 ? 1 : -1) * Math.min(70, len * 0.28);
  const c1 = [x1 + dx * 0.33 + nx * k, y1 + dy * 0.33 + ny * k], c2 = [x1 + dx * 0.66 - nx * k, y1 + dy * 0.66 - ny * k];
  const d = `M${x1},${y1} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x2},${y2}`;
  const col = SNAKE_COL[i % SNAKE_COL.length];
  const ang = Math.atan2(c1[1] - y1, c1[0] - x1);
  return (
    <g>
      <path d={d} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="13" strokeLinecap="round" transform="translate(2,3)" />
      <path d={d} fill="none" stroke={col} strokeWidth="11" strokeLinecap="round" />
      <path d={d} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10" />
      <g transform={`translate(${x1},${y1}) rotate(${(ang * 180) / Math.PI})`}>
        <ellipse rx="10" ry="8" fill={col} />
        <circle cx="3" cy="-3.5" r="2.4" fill="#fff" /><circle cx="3" cy="3.5" r="2.4" fill="#fff" />
        <circle cx="3.6" cy="-3.5" r="1.1" fill="#111" /><circle cx="3.6" cy="3.5" r="1.1" fill="#111" />
        <path d="M10,0 l7,-3 M10,0 l7,3" stroke="#ff3b3b" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </g>
  );
}

function Ladder({ a, b }) {
  const [x1, y1] = sq(a), [x2, y2] = sq(b);
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 7, ny = (dx / len) * 7;
  const rungs = Math.max(3, Math.floor(len / 15));
  return (
    <g stroke="#c58b4a" strokeLinecap="round">
      <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} strokeWidth="4" />
      <line x1={x1 - nx} y1={y1 - ny} x2={x2 - nx} y2={y2 - ny} strokeWidth="4" />
      {Array.from({ length: rungs }, (_, i) => {
        const t = (i + 0.5) / rungs;
        return <line key={i} x1={x1 + dx * t + nx} y1={y1 + dy * t + ny} x2={x1 + dx * t - nx} y2={y1 + dy * t - ny} strokeWidth="3" stroke="#e3b074" />;
      })}
    </g>
  );
}

export function Ladders({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const myTurn = st.turn === me && !st.winner;
  const [txt, cls] = banner(room, me, st.winner, st.turn, "Your turn — roll the dice");
  const nm = (id) => (id === me ? "You" : room.players.find((p) => p.id === id)?.name);
  const L = st.last;

  let note = "Race to 100. Ladders lift you, snakes drop you. Roll a 6 to go again.";
  if (L) {
    note = `${nm(L.by)} rolled a ${L.roll}`;
    if (L.via === "stay") note += " — needs an exact roll to finish";
    else if (L.via === "ladder") note += ` — climbed a ladder 🪜 ${L.landed}→${L.to}`;
    else if (L.via === "snake") note += ` — bitten by a snake 🐍 ${L.landed}→${L.to}`;
    else note += ` → ${L.to}`;
    if (L.roll === 6 && L.via !== "stay" && !st.winner) note += " · bonus roll!";
  }

  const tokens = room.players.map((p, i) => {
    const pos = st.pos[p.id];
    const same = room.players.some((q) => q.id !== p.id && st.pos[q.id] === pos);
    const [bx, by] = pos > 0 ? sq(pos) : [S / 2 + 16 + i * 26 - 13, S * 10 + 20];
    return { p, i, x: bx + (same && pos > 0 ? (i ? 9 : -9) : 0), y: by };
  });

  return (
    <>
      <ScoreBar room={room} me={me} scores={st.pos} turn={st.turn} />
      <p className={`status ${cls}`}>{txt}</p>
      <div className="sl">
        <svg viewBox={`0 0 ${S * 10} ${S * 10 + 40}`} className="sl-board" role="img" aria-label="Snakes and Ladders board">
          <rect x="0" y="0" width={S * 10} height={S * 10 + 40} rx="12" fill="#10213a" />
          {Array.from({ length: 100 }, (_, i) => {
            const n = i + 1, [cx, cy] = sq(n);
            const snakeHead = st.snakes[n], ladderBase = st.ladders[n];
            return (
              <g key={n}>
                <rect x={cx - S / 2 + 1} y={cy - S / 2 + 1} width={S - 2} height={S - 2} rx="6"
                  fill={n === 100 ? "#ffd23f" : ladderBase ? "#2d4f3a" : snakeHead ? "#4f2d3a" : (Math.floor((n - 1) / 10) + n) % 2 ? "#1d3557" : "#274472"} />
                <text x={cx - S / 2 + 5} y={cy - S / 2 + 14} fontSize="11" fill={n === 100 ? "#3b2d00" : "#9fb4d4"} fontWeight="700">{n === 100 ? "100 ★" : n}</text>
              </g>
            );
          })}
          {Object.entries(st.ladders).map(([a, b]) => <Ladder key={"l" + a} a={+a} b={+b} />)}
          {Object.entries(st.snakes).map(([a, b], i) => <SnakeArt key={"s" + a} a={+a} b={+b} i={i} />)}
          <text x={S * 10 - 12} y={S * 10 + 24} textAnchor="end" fontSize="12" fill="#8fa6c4">START ◂ tokens wait here</text>
          {tokens.map(({ p, i, x, y }) => (
            <g key={p.id} style={{ transform: `translate(${x}px,${y}px)`, transition: "transform .7s cubic-bezier(.3,1.4,.5,1)" }}>
              <circle r="11" fill="rgba(0,0,0,.4)" cx="1.5" cy="2.5" />
              <circle r="11" fill={PC[i]} stroke="#fff" strokeWidth="2" />
              <text y="4.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#07101c">{p.name[0]?.toUpperCase()}</text>
            </g>
          ))}
        </svg>
        <div className="sl-side">
          <div className={`die ${L ? "roll" : ""}`} key={L ? L.n : 0} aria-label={L ? `Dice shows ${L.roll}` : "Dice"}>{L ? DIE[L.roll - 1] : "🎲"}</div>
          <button className="primary roll-btn" disabled={!myTurn} onClick={() => s.emit("sl:roll")}>{myTurn ? "🎲 Roll dice" : st.winner ? "Game over" : "Waiting…"}</button>
          <p className="meta" style={{ textAlign: "center", maxWidth: 240 }}>{note}</p>
        </div>
      </div>
      <Again show={!!st.winner} />
    </>
  );
}
