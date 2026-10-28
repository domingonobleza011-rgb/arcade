"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Virtual analog stick. onChange({ x, y, mag, active }) with x,y in [-1,1].
export function Stick({ onChange, label = "Stick", size = 128 }) {
  const base = useRef(null);
  const knob = useRef(null);
  const id = useRef(null);

  const move = (e) => {
    const r = base.current.getBoundingClientRect();
    const R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const d = Math.hypot(dx, dy), lim = R * 0.7;
    if (d > lim) { dx = (dx / d) * lim; dy = (dy / d) * lim; }
    knob.current.style.transform = `translate(${dx}px,${dy}px)`;
    onChange({ x: dx / lim, y: dy / lim, mag: Math.min(1, d / lim), active: true });
  };
  const down = (e) => {
    if (id.current !== null) return;
    id.current = e.pointerId;
    base.current.setPointerCapture(e.pointerId);
    move(e);
  };
  const end = (e) => {
    if (e.pointerId !== id.current) return;
    id.current = null;
    knob.current.style.transform = "translate(0,0)";
    onChange({ x: 0, y: 0, mag: 0, active: false });
  };
  return (
    <div ref={base} className="stick" style={{ width: size, height: size }} role="group" aria-label={label}
      onPointerDown={down} onPointerMove={(e) => e.pointerId === id.current && move(e)} onPointerUp={end} onPointerCancel={end}>
      <i ref={knob} />
    </div>
  );
}

// Press-and-hold button (works with multi-touch). onDown/onUp fire once per press.
export function HoldBtn({ children, onDown, onUp, className = "", label, style }) {
  const [on, setOn] = useState(false);
  const id = useRef(null);
  const press = (e) => {
    e.preventDefault();
    if (id.current !== null) return;
    id.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setOn(true); onDown && onDown();
  };
  const release = (e) => {
    if (e.pointerId !== id.current) return;
    id.current = null; setOn(false); onUp && onUp();
  };
  return (
    <button type="button" className={`hb ${on ? "on" : ""} ${className}`} style={style} aria-label={label}
      onPointerDown={press} onPointerUp={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </button>
  );
}

// Direction pad built from HoldBtns. keys: array of ["u","d","l","r"] to show. onChange(dirs) with {u,d,l,r}.
export function Pad({ onChange, keys = ["u", "d", "l", "r"] }) {
  const st = useRef({ u: 0, d: 0, l: 0, r: 0 });
  const set = (k, v) => { st.current = { ...st.current, [k]: v }; onChange(st.current); };
  const sym = { u: "▲", d: "▼", l: "◀", r: "▶" };
  return (
    <div className="pad">
      {keys.map((k) => (
        <HoldBtn key={k} className={`pk-${k}`} label={{ u: "Up", d: "Down", l: "Left", r: "Right" }[k]} onDown={() => set(k, 1)} onUp={() => set(k, 0)}>{sym[k]}</HoldBtn>
      ))}
    </div>
  );
}

// Wraps a realtime canvas game. On touch phones held sideways it fills the screen with the
// controls floating over the canvas; held upright the controls sit under the canvas and a
// button offers fullscreen + landscape lock. Desktop is unchanged (controls are hidden by CSS).
export function Arena({ children, controls, hint, ratio = 1.6 }) {
  const [min, setMin] = useState(false);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer:coarse) and (orientation:portrait)");
    const on = () => setPortrait(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const rotate = async () => {
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    try { await screen.orientation?.lock?.("landscape"); } catch {}
  };

  return (
    <div className={`fsw ${min ? "min" : ""}`} style={{ "--arn": ratio }}>
      {portrait && (
        <button type="button" className="rotate" onClick={rotate}>🔄 Rotate to landscape for the best view</button>
      )}
      <div className="fsw-stage">
        {children}
        <button type="button" className="fsw-x" onClick={() => setMin((v) => !v)} aria-label={min ? "Expand" : "Exit full screen"}>{min ? "⤢" : "✕"}</button>
        {controls && <div className="tc">{controls}</div>}
      </div>
      {hint && <p className="meta fsw-hint">{hint}</p>}
    </div>
  );
}

// Keyboard + touch input merged into one state object.
// keymap: { "arrowup": "u", "w": "u", " ": "a", ... } (keys are e.key lower-cased).
// send(state) is called whenever any flag flips. Returns set(name, 0|1) for on-screen controls.
export function useInput(keymap, send) {
  const inp = useRef({});
  const sendRef = useRef(send);
  sendRef.current = send;
  const set = useCallback((k, v) => {
    v = v ? 1 : 0;
    if ((inp.current[k] || 0) === v) return;
    inp.current = { ...inp.current, [k]: v };
    sendRef.current(inp.current);
  }, []);
  useEffect(() => {
    const h = (v) => (e) => {
      if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
      const k = keymap[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      set(k, v);
    };
    const kd = h(1), ku = h(0);
    const clear = () => Object.keys(inp.current).forEach((k) => set(k, 0));
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", clear); clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set]);
  return set;
}
