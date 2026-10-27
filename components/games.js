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
      g.fillStyle = "#0b1422"; g.fillRect(0, 0, 800, 500);
      g.fillStyle = "#27405f"; walls.current.forEach((w) => g.fillRect(w.x, w.y, w.w, w.h));
      g.fillStyle = "#ffd23f"; b.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); });
      p.forEach(([id, name, x, y, aim, hp, , , dead]) => {
        if (dead) return;
        g.fillStyle = id === me ? "#3ddc97" : "#ff6b6b";
        g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
        g.strokeStyle = "#fff"; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(aim) * 22, y + Math.sin(aim) * 22); g.stroke();
        g.fillStyle = "#333"; g.fillRect(x - 16, y - 26, 32, 4);
        g.fillStyle = "#3ddc97"; g.fillRect(x - 16, y - 26, (32 * hp) / 100, 4);
        g.fillStyle = "#eaf2ff"; g.font = "12px sans-serif"; g.textAlign = "center"; g.fillText(name, x, y - 32);
      });
      g.font = "13px sans-serif"; g.textAlign = "right";
      [...p].sort((a, c) => c[6] - a[6]).forEach((q, i) => {
        g.fillStyle = q[0] === me ? "#3ddc97" : "#eaf2ff";
        g.fillText(`${q[1]}  ${q[6]} / ${q[7]}`, 790, 20 + i * 16);
      });
      const self = p.find((q) => q[0] === me);
      g.textAlign = "center"; g.font = "bold 28px sans-serif"; g.fillStyle = "#ffd23f";
      if (over) g.fillText(`${over} wins!`, 400, 250);
      else if (self && self[8]) g.fillText("Respawning…", 400, 250);
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf); clearInterval(send);
      s.off("shot:init", onInit); s.off("shot:state", onState);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("pointerup", mu);
    };
  }, [s, me]);

  return (
    <div style={{ width: "100%" }}>
      <p className="meta">Move with WASD or arrows. Aim with the mouse and hold to shoot. First to 10 frags wins.</p>
      <canvas ref={ref} width={800} height={500} />
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

function hangFigure(wrong) {
  const head = wrong >= 1 ? "O" : " ";
  const body = wrong >= 2 ? "|" : " ";
  const larm = wrong >= 3 ? "/" : " ";
  const rarm = wrong >= 4 ? "\\" : " ";
  const lleg = wrong >= 5 ? "/" : " ";
  const rleg = wrong >= 6 ? "\\" : " ";
  return [
    "  +---+",
    "  |   |",
    `  ${head}   |`,
    ` ${larm}${body}${rarm}  |`,
    ` ${lleg} ${rleg}  |`,
    "      |",
    " =========",
  ].join("\n");
}

export function Hangman({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const isGuesser = st.guesser === me;
  const myTurn = st.turn === me && !st.winner;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name;
  const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");

  const status = st.winner
    ? (st.winner === me ? "You win!" : `${nameOf(st.winner)} wins.`)
    : isGuesser ? (myTurn ? "Guess a letter" : "…")
    : `${nameOf(st.guesser)} is guessing`;

  return (
    <>
      <p className="status">{status}</p>
      <pre className="hang-figure" aria-hidden>{hangFigure(st.wrong || 0)}</pre>
      <p className="hang-word">{st.masked?.split("").join(" ") || ""}</p>
      {st.winner && st.reveal && <p className="meta">The word was <b>{st.reveal}</b></p>}
      <p className="meta">Wrong: {st.wrong}/{st.maxWrong}</p>
      <div className="hang-keys">
        {alphabet.map((ch) => {
          const used = st.guessed?.includes(ch);
          return (
            <button
              key={ch}
              className={`hang-key ${used ? "used" : ""}`}
              disabled={!myTurn || used || !!st.winner}
              onClick={() => s.emit("hang:guess", ch)}
            >
              {ch}
            </button>
          );
        })}
      </div>
      {st.winner && <button className="primary" onClick={() => s.emit("rematch")}>Play again</button>}
    </>
  );
}
