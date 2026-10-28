"use client";
import { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";

export function TicTacToe({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const mark = st.marks[me];
  const myTurn = st.turn === mark && !st.winner;
  const nameOf = (m) => room.players.find((p) => st.marks[p.id] === m)?.name;
  const status = st.winner === "draw" ? "It's a draw."
    : st.winner ? (st.winner === mark ? "You win!" : `${nameOf(st.winner)} wins.`)
    : myTurn ? "Your turn" : `${nameOf(st.turn)}'s turn`;

  return (
    <>
      <p className="status">You are {mark}. {status}</p>
      <div className="board">
        {st.board.map((c, i) => (
          <button key={i} className={`cell ${c || ""}`} disabled={!!c || !myTurn} aria-label={`Cell ${i + 1}`} onClick={() => s.emit("move", i)}>
            {c}
          </button>
        ))}
      </div>
      {st.winner && <button className="primary" onClick={() => s.emit("rematch")}>Play again</button>}
    </>
  );
}

export function Connect4({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const color = st.colors[me];
  const myTurn = st.turn === color && !st.winner;
  const nameOf = (c) => room.players.find((p) => st.colors[p.id] === c)?.name;
  const status = st.winner === "draw" ? "It's a draw."
    : st.winner ? (st.winner === color ? "You win!" : `${nameOf(st.winner)} wins.`)
    : myTurn ? "Your turn — pick a column" : `${nameOf(st.turn)}'s turn`;

  return (
    <>
      <p className="status">You are <span className={`c4-dot ${color}`} /> {color === "R" ? "Red" : "Yellow"}. {status}</p>
      <div className="c4-board" role="grid" aria-label="Connect Four board">
        {Array.from({ length: 7 }, (_, col) => (
          <button
            key={col}
            className="c4-col"
            disabled={!myTurn || st.board[col][0] !== null}
            onClick={() => s.emit("c4:drop", col)}
            aria-label={`Column ${col + 1}`}
          >
            {st.board[col].map((cell, row) => (
              <span key={row} className={`c4-cell ${cell || ""}`} />
            ))}
          </button>
        ))}
      </div>
      {st.winner && <button className="primary" onClick={() => s.emit("rematch")}>Play again</button>}
    </>
  );
}

export function Checkers({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const side = st.sides[me]; // "r" or "b"
  const myTurn = st.turn === side && !st.winner;
  const nameOf = (sd) => room.players.find((p) => st.sides[p.id] === sd)?.name;
  const [sel, setSel] = useState(null);

  useEffect(() => { setSel(null); }, [st.board, st.turn, st.mustContinue]);

  const status = st.winner === "draw" ? "It's a draw."
    : st.winner ? (st.winner === side ? "You win!" : `${nameOf(st.winner)} wins.`)
    : st.mustContinue ? "Continue jumping!"
    : myTurn ? "Your turn — select a piece, then a square" : `${nameOf(st.turn)}'s turn`;

  const onCell = (r, c) => {
    if (!myTurn) return;
    const piece = st.board[r][c];
    if (sel) {
      if (sel.r === r && sel.c === c) { setSel(null); return; }
      s.emit("ck:move", { from: [sel.r, sel.c], to: [r, c] });
      return;
    }
    if (piece && piece.toLowerCase() === side) setSel({ r, c });
  };

  return (
    <>
      <p className="status">You are {side === "r" ? "Red" : "Black"}. {status}</p>
      <div className="ck-board" role="grid">
        {st.board.map((row, r) =>
          row.map((cell, c) => {
            const dark = (r + c) % 2 === 1;
            const selected = sel && sel.r === r && sel.c === c;
            return (
              <button
                key={`${r}-${c}`}
                className={`ck-cell ${dark ? "dark" : "light"} ${selected ? "sel" : ""}`}
                disabled={!dark || !myTurn}
                onClick={() => dark && onCell(r, c)}
                aria-label={`Row ${r + 1} col ${c + 1}`}
              >
                {cell && (
                  <span className={`ck-piece ${cell.toLowerCase()} ${cell === cell.toUpperCase() ? "king" : ""}`}>
                    {cell === cell.toUpperCase() ? "♔" : ""}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      {st.winner && <button className="primary" onClick={() => s.emit("rematch")}>Play again</button>}
    </>
  );
}

export function Quiz({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const [pick, setPick] = useState(null);
  const [left, setLeft] = useState(15);

  useEffect(() => {
    setPick(null);
    if (st.phase !== "asking") return;
    setLeft(15);
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [st.i, st.phase === "asking"]);

  const board = (
    <div className="players">
      {room.players.map((p) => <span key={p.id} className="pill">{p.name}: {st.scores[p.id]}</span>)}
    </div>
  );

  if (st.phase === "done") {
    const [a, b] = [...room.players].sort((x, y) => st.scores[y.id] - st.scores[x.id]);
    const tie = st.scores[a.id] === st.scores[b.id];
    return (
      <>
        <p className="status">{tie ? "Tie game." : a.id === me ? "You win!" : `${a.name} wins.`}</p>
        {board}
        <button className="primary" onClick={() => s.emit("rematch")}>Play again</button>
      </>
    );
  }

  const rv = st.reveal;
  const cls = (i) => rv ? (i === rv.answer ? "right" : rv.picks[me] === i ? "wrong" : "dim") : pick === i ? "picked" : "";
  const otherDone = st.answered.some((id) => id !== me);

  return (
    <>
      {board}
      <p className="meta">Question {st.i + 1} of {st.total} · {rv ? "Next up…" : `${left}s`}</p>
      <h2 className="status">{st.text}</h2>
      <div className="opts">
        {st.options.map((o, i) => (
          <button key={i} className={`opt ${cls(i)}`} disabled={pick !== null || !!rv}
            onClick={() => { setPick(i); s.emit("answer", i); }}>
            {o}
          </button>
        ))}
      </div>
      {!rv && otherDone && pick === null && <p className="meta">Your opponent has answered.</p>}
    </>
  );
}

const COLORS = ["#14213d", "#e5484d", "#ff9f1c", "#2ec27e", "#3584e4", "#9141ac", "#ffffff"];

function seg(g, { x0, y0, x1, y1, c, w }) {
  g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round";
  g.beginPath(); g.moveTo(x0 * 800, y0 * 500); g.lineTo(x1 * 800, y1 * 500); g.stroke();
}

export function Draw({ readOnly = false }) {
  const s = getSocket();
  const ref = useRef(null);
  const last = useRef(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(4);
  const tool = useRef({});
  tool.current = { c: color, w: size };

  useEffect(() => {
    const g = ref.current.getContext("2d");
    const onDraw = (d) => seg(g, d);
    const onClear = () => g.clearRect(0, 0, 800, 500);
    const onHist = (h) => { g.clearRect(0, 0, 800, 500); h.forEach((d) => seg(g, d)); };
    s.on("draw", onDraw); s.on("draw:clear", onClear); s.on("draw:history", onHist);
    s.emit("draw:sync");
    return () => { s.off("draw", onDraw); s.off("draw:clear", onClear); s.off("draw:history", onHist); };
  }, [s]);

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const down = (e) => { if (readOnly) return; ref.current.setPointerCapture(e.pointerId); last.current = pos(e); };
  const move = (e) => {
    if (!last.current) return;
    const [x1, y1] = pos(e);
    const [x0, y0] = last.current;
    const d = { x0, y0, x1, y1, ...tool.current };
    seg(ref.current.getContext("2d"), d);
    s.emit("draw", d);
    last.current = [x1, y1];
  };

  return (
    <div style={{ width: "100%" }}>
      <div className="tools" hidden={readOnly}>
        {COLORS.map((c) => (
          <button key={c} className="sw" style={{ background: c }} aria-pressed={color === c}
            aria-label={c === "#ffffff" ? "Eraser" : `Color ${c}`} onClick={() => setColor(c)} />
        ))}
        <input type="range" min="2" max="24" value={size} onChange={(e) => setSize(+e.target.value)} aria-label="Brush size" />
        <button onClick={() => { ref.current.getContext("2d").clearRect(0, 0, 800, 500); s.emit("draw:clear"); }}>Clear board</button>
      </div>
      <canvas ref={ref} width={800} height={500} style={readOnly ? { cursor: "default" } : undefined} onPointerDown={down} onPointerMove={move}
        onPointerUp={() => (last.current = null)} onPointerCancel={() => (last.current = null)} />
    </div>
  );
}

export function Shooter({ me }) {
  const s = getSocket();
  const ref = useRef(null);
  const st = useRef({ p: [], b: [], over: null });
  const walls = useRef([]);
  const inp = useRef({ u: 0, d: 0, l: 0, r: 0, fire: 0, aim: 0 });
  const mouse = useRef({ x: 400, y: 250 });
  const dirty = useRef(false);

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const onInit = (d) => { walls.current = d.walls; };
    const onState = (d) => { st.current = d; };
    s.on("shot:init", onInit); s.on("shot:state", onState); s.emit("shot:sync");

    const KEYS = { w: "u", arrowup: "u", s: "d", arrowdown: "d", a: "l", arrowleft: "l", d: "r", arrowright: "r" };
    const key = (v) => (e) => {
      if (e.target.tagName === "INPUT") return;
      const k = KEYS[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      if (inp.current[k] !== v) { inp.current[k] = v; dirty.current = true; }
    };
    const kd = key(1), ku = key(0);
    const mm = (e) => {
      const r = cv.getBoundingClientRect();
      mouse.current = { x: ((e.clientX - r.left) / r.width) * 800, y: ((e.clientY - r.top) / r.height) * 500 };
    };
    const md = () => { inp.current.fire = 1; dirty.current = true; };
    const mu = () => { if (inp.current.fire) { inp.current.fire = 0; dirty.current = true; } };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    cv.addEventListener("pointermove", mm); cv.addEventListener("pointerdown", md); window.addEventListener("pointerup", mu);

    const send = setInterval(() => {
      const mp = st.current.p.find((p) => p[0] === me);
      if (mp) {
        const a = Math.atan2(mouse.current.y - mp[3], mouse.current.x - mp[2]);
        if (Math.abs(a - inp.current.aim) > 0.02) { inp.current.aim = a; dirty.current = true; }
      }
      if (dirty.current) { dirty.current = false; s.emit("shot:input", inp.current); }
    }, 33);

    let raf;
    const frame = () => {
      const { p, b, over } = st.current;
      const now = performance.now();
      // floor with a faint grid
      const bg = g.createLinearGradient(0, 0, 0, 500);
      bg.addColorStop(0, "#0b1626"); bg.addColorStop(1, "#08111e");
      g.fillStyle = bg; g.fillRect(0, 0, 800, 500);
      g.strokeStyle = "rgba(80,120,170,.12)"; g.lineWidth = 1;
      for (let x = 0; x <= 800; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 500); g.stroke(); }
      for (let y = 0; y <= 500; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(800, y); g.stroke(); }
      // walls with a lit top edge
      walls.current.forEach((w) => {
        g.fillStyle = "#223b5a"; g.fillRect(w.x, w.y, w.w, w.h);
        g.fillStyle = "#35597f"; g.fillRect(w.x, w.y, w.w, 3);
        g.strokeStyle = "#4b7aaa"; g.lineWidth = 1.5; g.strokeRect(w.x + .5, w.y + .5, w.w - 1, w.h - 1);
      });
      // bullets with glow
      g.save(); g.shadowColor = "#ffd23f"; g.shadowBlur = 12; g.fillStyle = "#fff3b0";
      b.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); });
      g.restore();
      p.forEach(([id, name, x, y, aim, hp, , , dead]) => {
        if (dead) return;
        const mineP = id === me, col = mineP ? "#3ddc97" : "#ff6b6b";
        g.save();
        g.shadowColor = col; g.shadowBlur = 16;
        const grad = g.createRadialGradient(x - 4, y - 4, 2, x, y, 15);
        grad.addColorStop(0, "#fff"); grad.addColorStop(.25, col); grad.addColorStop(1, mineP ? "#14804f" : "#a62f2f");
        g.fillStyle = grad; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
        g.restore();
        g.strokeStyle = "#eaf2ff"; g.lineWidth = 5; g.lineCap = "round";
        g.beginPath(); g.moveTo(x + Math.cos(aim) * 6, y + Math.sin(aim) * 6); g.lineTo(x + Math.cos(aim) * 24, y + Math.sin(aim) * 24); g.stroke();
        g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(x - 17, y - 28, 34, 6);
        g.fillStyle = hp > 50 ? "#3ddc97" : hp > 25 ? "#ffd23f" : "#ff6b6b"; g.fillRect(x - 16, y - 27, (32 * hp) / 100, 4);
        g.fillStyle = "#eaf2ff"; g.font = "600 12px sans-serif"; g.textAlign = "center"; g.fillText(name, x, y - 34);
      });
      // scoreboard
      g.fillStyle = "rgba(5,11,22,.6)"; g.fillRect(620, 6, 174, 14 + p.length * 17);
      g.font = "13px sans-serif"; g.textAlign = "right";
      [...p].sort((a, c) => c[6] - a[6]).forEach((q, i) => {
        g.fillStyle = q[0] === me ? "#3ddc97" : "#eaf2ff";
        g.fillText(`${q[1]}  ${q[6]} / ${q[7]}`, 788, 24 + i * 17);
      });
      const self = p.find((q) => q[0] === me);
      g.textAlign = "center"; g.font = "bold 30px sans-serif"; g.fillStyle = "#ffd23f";
      g.globalAlpha = .75 + .25 * Math.sin(now / 200);
      if (over) g.fillText(`${over} wins!`, 400, 250);
      else if (self && self[8]) g.fillText("Respawning…", 400, 250);
      g.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf); clearInterval(send);
      s.off("shot:init", onInit); s.off("shot:state", onState);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("pointerup", mu);
    };
  }, [s, me]);

  const setDir = (k, v) => { if (inp.current[k] !== v) { inp.current[k] = v; dirty.current = true; } };
  const setFire = (v) => { inp.current.fire = v; dirty.current = true; };

  return (
    <div className="arena-wrap">
      <p className="meta">Move with WASD / arrows or the pad. Aim with mouse / finger and hold to shoot. First to 10 frags wins.</p>
      <p className="landscape-hint">Tip: rotate to landscape for a bigger arena.</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <div className="mctl">
        <div className="dpad">
          <button className="u" onPointerDown={(e) => { e.preventDefault(); setDir("u", 1); }} onPointerUp={() => setDir("u", 0)} onPointerLeave={() => setDir("u", 0)} aria-label="Up">▲</button>
          <button onPointerDown={(e) => { e.preventDefault(); setDir("l", 1); }} onPointerUp={() => setDir("l", 0)} onPointerLeave={() => setDir("l", 0)} aria-label="Left">◀</button>
          <button onPointerDown={(e) => { e.preventDefault(); setDir("d", 1); }} onPointerUp={() => setDir("d", 0)} onPointerLeave={() => setDir("d", 0)} aria-label="Down">▼</button>
          <button onPointerDown={(e) => { e.preventDefault(); setDir("r", 1); }} onPointerUp={() => setDir("r", 0)} onPointerLeave={() => setDir("r", 0)} aria-label="Right">▶</button>
        </div>
        <button className="fire-btn" onPointerDown={(e) => { e.preventDefault(); setFire(1); }} onPointerUp={() => setFire(0)} onPointerLeave={() => setFire(0)} aria-label="Fire">🔥</button>
      </div>
    </div>
  );
}

export function Pictionary({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const [left, setLeft] = useState(st.secs);

  useEffect(() => {
    if (st.phase !== "draw") return;
    setLeft(st.secs);
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [st.turn, st.phase]);

  const nameOf = (id) => room.players.find((p) => p.id === id)?.name;
  const ranked = [...room.players].sort((a, b) => (st.scores[b.id] || 0) - (st.scores[a.id] || 0));
  const board = (
    <div className="players" style={{ justifyContent: "center" }}>
      {ranked.map((p) => (
        <span key={p.id} className={`pill ${p.id === me ? "me" : ""}`}>
          {st.phase !== "done" && p.id === st.drawer ? "✏️ " : st.phase === "draw" && st.guessed.includes(p.id) ? "✓ " : ""}
          {p.name}: {st.scores[p.id] || 0}
        </span>
      ))}
    </div>
  );

  if (st.phase === "done") {
    return (
      <>
        <p className="status">{ranked[0].id === me ? "You win!" : `${ranked[0].name} wins!`}</p>
        {board}
        <button className="primary" onClick={() => s.emit("rematch")}>Play again</button>
      </>
    );
  }

  const isDrawer = st.drawer === me;
  const line = st.phase === "reveal" ? `The word was “${st.word}”.`
    : isDrawer ? `Draw this: ${st.word}`
    : st.word ? `You got it! The word was “${st.word}”.`
    : `Guess the word: ${"_ ".repeat(st.len).trim()} (${st.len} letters)`;

  return (
    <div style={{ width: "100%" }}>
      {board}
      <p className="meta" style={{ margin: "8px 0" }}>
        Turn {st.turn + 1} of {st.total} · {nameOf(st.drawer)} is drawing{st.phase === "draw" ? ` · ${left}s` : ""}
      </p>
      <h2 className="status">{line}</h2>
      <Draw readOnly={!isDrawer || st.phase !== "draw"} />
      <p className="meta">Type your guess in the chat. Just the word, nothing else.</p>
    </div>
  );
}

const RPS_EMOJI = { rock: "🪨", paper: "📄", scissors: "✂️" };

export function RPS({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const myScore = st.scores[me] || 0;
  const opp = room.players.find((p) => p.id !== me);
  const oppScore = opp ? (st.scores[opp.id] || 0) : 0;
  const iPicked = st.picked?.includes(me);
  const done = st.winner || st.phase === "done";

  const status = done
    ? (st.winner === me ? "You win the match!" : st.winner === "draw" ? "Tie match." : `${opp?.name} wins the match.`)
    : st.phase === "reveal"
      ? (st.reveal?.result === me ? "You take the round!" : st.reveal?.result === "draw" ? "Round draw." : `${opp?.name} takes the round.`)
      : iPicked ? "Waiting for opponent…" : "Pick one!";

  return (
    <>
      <p className="status">Best of {st.target * 2 - 1} · First to {st.target}</p>
      <div className="players">
        <span className="pill me">You: {myScore}</span>
        <span className="pill">{opp?.name}: {oppScore}</span>
      </div>
      <p className="meta">Round {st.round}</p>
      <h2 className="status">{status}</h2>
      {st.phase === "reveal" && st.reveal && (
        <div className="rps-reveal">
          <div><span className="rps-big">{RPS_EMOJI[st.reveal.picks[me]]}</span><div>You</div></div>
          <div className="meta">vs</div>
          <div><span className="rps-big">{RPS_EMOJI[st.reveal.picks[opp?.id]]}</span><div>{opp?.name}</div></div>
        </div>
      )}
      {st.phase === "pick" && !done && (
        <div className="rps-opts">
          {["rock", "paper", "scissors"].map((c) => (
            <button key={c} className={`rps-btn ${iPicked ? "dim" : ""}`} disabled={iPicked}
              onClick={() => s.emit("rps:pick", c)} aria-label={c}>
              <span className="rps-big">{RPS_EMOJI[c]}</span>
              <span>{c}</span>
            </button>
          ))}
        </div>
      )}
      {done && <button className="primary" onClick={() => s.emit("rematch")}>Play again</button>}
    </>
  );
}

export function Memory({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const myTurn = st.turn === me && !st.winner && !st.lock;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name;

  const status = st.winner === "draw" ? "It's a draw!"
    : st.winner ? (st.winner === me ? "You win!" : `${nameOf(st.winner)} wins.`)
    : myTurn ? "Your turn — flip a card" : `${nameOf(st.turn)}'s turn`;

  return (
    <>
      <div className="players">
        {room.players.map((p) => (
          <span key={p.id} className={`pill ${p.id === me ? "me" : ""}`}>{p.name}: {st.scores[p.id] || 0}</span>
        ))}
      </div>
      <p className="status">{status}</p>
      <div className="mem-grid">
        {st.cards.map((c, i) => (
          <button
            key={c.id}
            className={`mem-card ${c.matched ? "matched" : ""} ${c.flipped || c.matched ? "up" : ""}`}
            disabled={!myTurn || c.flipped || c.matched || st.lock}
            onClick={() => s.emit("mem:flip", i)}
            aria-label={c.icon ? c.icon : `Card ${i + 1}`}
          >
            <span>{c.icon || "?"}</span>
          </button>
        ))}
      </div>
      {st.winner && <button className="primary" onClick={() => s.emit("rematch")}>Play again</button>}
    </>
  );
}

const KB = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function Gallows({ wrong, mini }) {
  // each wrong guess draws one more part; pathLength=1 lets the stroke animate in
  const parts = [
    <circle key="h" className="part head" cx="120" cy="58" r="17" pathLength="1" />,
    <path key="b" className="part" d="M120 75 V122" pathLength="1" />,
    <path key="la" className="part" d="M120 88 L96 108" pathLength="1" />,
    <path key="ra" className="part" d="M120 88 L144 108" pathLength="1" />,
    <path key="ll" className="part" d="M120 122 L100 152" pathLength="1" />,
    <path key="rl" className="part" d="M120 122 L140 152" pathLength="1" />,
  ];
  return (
    <svg className={`gallows ${mini ? "mini" : ""}`} viewBox="0 0 190 165" aria-hidden>
      <path className="frame" d="M20 160 H100 M60 160 V12 H120 V41 M60 40 L84 12" />
      <g className={wrong >= 6 ? "dead" : ""}>{parts.slice(0, wrong)}</g>
      {wrong >= 6 && (
        <g stroke="#ff3b3b" strokeWidth="2.5" strokeLinecap="round">
          <path d="M113 52 l6 6 M119 52 l-6 6 M123 52 l6 6 M129 52 l-6 6" />
        </g>
      )}
    </svg>
  );
}

export function Hangman({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const opp = room.players.find((p) => p.id !== me);
  const myTurn = st.turn === me && !st.winner;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name;
  const wrongOf = (id) => (st.wrong && st.wrong[id]) || 0;
  const guess = (ch) => { if (myTurn && !st.guessed.includes(ch)) s.emit("hang:guess", ch); };

  // physical keyboard support
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === "INPUT") return;
      if (/^[a-z]$/i.test(e.key)) guess(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const won = st.winner === me;
  const status = st.winner
    ? (won ? "You win!" : `${nameOf(st.winner)} wins.`)
    : myTurn ? "Your turn — pick a letter" : `${nameOf(st.turn)} is thinking…`;
  const cls = st.winner ? (won ? "good" : "bad") : myTurn ? "turn" : "";
  const word = st.reveal || null;
  const slots = (word || st.masked || "").split("");

  const panel = (p, big) => (
    <div className={`hm-pl ${st.turn === p.id && !st.winner ? "active" : ""} ${wrongOf(p.id) >= st.maxWrong ? "out" : ""}`}>
      <span className="nm">{p.id === me ? "You" : p.name}</span>
      <Gallows wrong={wrongOf(p.id)} mini={!big} />
      <span className="hm-lives" aria-label={`${st.maxWrong - wrongOf(p.id)} lives left`}>
        {Array.from({ length: st.maxWrong }, (_, i) => (i < st.maxWrong - wrongOf(p.id) ? "❤️" : "🖤")).join("")}
      </span>
    </div>
  );

  return (
    <div className="hm">
      <p className={`status ${cls}`}>{status}</p>
      <div className="hm-top">
        {panel(room.players.find((p) => p.id === me) || room.players[0], true)}
        {opp && panel(opp, true)}
      </div>
      <span className="hm-cat">Category · {st.category}</span>
      <div className="hm-word" aria-label="Word to guess">
        {slots.map((ch, i) => (
          <div key={i} className={`hm-slot ${ch !== "_" ? "on" : ""} ${word && st.masked[i] === "_" ? "miss" : ""}`}>
            <span>{ch !== "_" ? ch : ""}</span>
          </div>
        ))}
      </div>
      <p className="meta">Take turns on one shared word. A wrong letter costs <b>you</b> a life and passes the turn; a right one lets you keep going.</p>
      <div className="hm-kb">
        {KB.map((row) => (
          <div className="hm-row" key={row}>
            {row.split("").map((ch) => {
              const used = st.guessed.includes(ch);
              const hit = used && (st.reveal || st.masked).includes(ch);
              return (
                <button key={ch} className={`hm-key ${used ? (hit ? "good" : "bad") : ""}`} disabled={!myTurn || used} onClick={() => guess(ch)}>
                  {ch}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {st.winner && <button className="primary" onClick={() => s.emit("rematch")}>Play again</button>}
    </div>
  );
}
