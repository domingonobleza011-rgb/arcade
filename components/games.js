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
