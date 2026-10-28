"use client";
import { useEffect, useRef } from "react";
import { getSocket } from "../lib/socket";
import { ScoreBar, banner, Again, rr, useRT } from "./games2";
import { Arena, HoldBtn, useInput } from "./touch";

const wrapA = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const nameOf = (room, id) => room.players.find((p) => p.id === id)?.name || "";

// ================================================================ PIXEL FIGHTER
const GROUND = 430;

function buildFightBg() {
  const c = document.createElement("canvas");
  c.width = 800; c.height = 500;
  const g = c.getContext("2d");
  const bands = ["#1b1038", "#241247", "#2f1757", "#401c66", "#57226f", "#742a73", "#9a3a73", "#c4506f", "#e8706a"];
  bands.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 46, 800, 48); });
  g.fillStyle = "rgba(255,255,255,.8)";
  for (let i = 0; i < 40; i++) g.fillRect((i * 97) % 800, (i * 53) % 190, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
  g.fillStyle = "#ffe9a8"; g.fillRect(612, 70, 60, 60); g.fillStyle = "#fff6d2"; g.fillRect(620, 78, 44, 44);
  g.fillStyle = "#2a1450";
  for (let x = 0; x < 800; x += 20) g.fillRect(x, 300 - Math.abs(Math.sin(x / 130) * 90 + Math.sin(x / 47) * 22), 20, 300);
  g.fillStyle = "#1a0c33";
  for (let x = 0; x < 800; x += 20) g.fillRect(x, 350 - Math.abs(Math.sin(x / 90 + 2) * 55), 20, 300);
  // dojo
  g.fillStyle = "#12091f"; g.fillRect(300, 290, 200, 140);
  g.fillRect(280, 280, 240, 14); g.fillRect(310, 262, 180, 14); g.fillRect(340, 246, 120, 14); g.fillRect(380, 232, 40, 14);
  g.fillStyle = "#ffcf6a"; [330, 380, 430].forEach((x) => g.fillRect(x, 330, 24, 40));
  // floor
  g.fillStyle = "#3b2418"; g.fillRect(0, GROUND, 800, 70);
  g.fillStyle = "#5a3825"; g.fillRect(0, GROUND, 800, 8);
  g.fillStyle = "#2a190f";
  for (let x = 0; x < 800; x += 80) g.fillRect(x, GROUND + 8, 4, 62);
  for (let y = GROUND + 30; y < 500; y += 24) g.fillRect(0, y, 800, 2);
  return c;
}

function drawFighter(g, x, y, face, stt, t, col, dark, flash, tms) {
  const u = 5;
  const gy = GROUND - y;
  // shadow
  g.fillStyle = "rgba(0,0,0,.35)";
  g.fillRect(x - 24 + y / 12, GROUND + 2, 48 - y / 6, 6);
  g.save();
  g.translate(Math.round(x), Math.round(gy));
  g.scale(face, 1);
  if (stt === "ko") g.rotate(-Math.PI / 2);
  if (stt === "hit") g.translate(-8, 0);
  const R = (px, py, w, h, c) => { g.fillStyle = flash ? "#fff" : c; g.fillRect(px * u, py * u, w * u, h * u); };
  const skin = "#f1c27d";
  const air = y > 0;
  const step = stt === "walk" ? Math.floor(tms / 110) % 2 : 0;
  // legs
  if (air) { R(-4, -7, 3, 5, "#222"); R(1, -8, 3, 5, "#222"); R(-4, -3, 4, 3, "#111"); R(1, -4, 4, 3, "#111"); }
  else {
    R(-4, -9 + step, 3, 9 - step, "#222"); R(1, -9 + (1 - step), 3, 9 - (1 - step), "#222");
    R(-4, -2, 4, 2, "#111"); R(1, -2, 4, 2, "#111");
  }
  // torso
  R(-5, -19, 10, 10, col); R(-5, -12, 10, 2, dark); R(-1, -19, 2, 4, "#fff");
  // head
  R(-4, -26, 8, 7, skin); R(-4, -27, 8, 3, "#1a1a1a"); R(-4, -24, 8, 2, dark); R(-8, -24, 4, 1, dark); R(-9, -22, 3, 1, dark);
  R(1, -22, 2, 1, "#111");
  if (stt === "hit") R(0, -20, 4, 1, "#7a1f1f");
  // arms
  if (stt === "attack") {
    const e = t > 9 ? (15 - t) / 6 : t >= 5 ? 1 : t / 5;
    R(-6, -17, 3, 6, col);
    if (air) { R(2, -10, 3 + e * 9, 4, col); R(5 + e * 9, -10, 4, 4, skin); R(-4, -9, 4, 4, "#222"); }
    else { R(3, -17, 3 + e * 9, 4, col); R(6 + e * 9, -17, 4, 4, skin); }
  } else if (stt === "block") {
    R(3, -21, 5, 11, col); R(3, -21, 5, 3, skin);
    g.fillStyle = "rgba(120,200,255,.35)"; g.fillRect(2 * u, -23 * u, 9 * u, 15 * u);
  } else {
    R(-6, -17, 3, 6, col); R(4, -17, 3, 5, col); R(6, -17, 3, 3, skin);
  }
  g.restore();
}

export function Fighter({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const set = useInput({ a: "l", arrowleft: "l", d: "r", arrowright: "r", w: "j", arrowup: "j", " ": "a", j: "a", f: "a", s: "b", arrowdown: "b", k: "b" }, (i) => s.emit("ft:input", i));

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    const bg = buildFightBg();
    const disp = {}, prev = {}, sparks = [];
    let raf;
    const frame = () => {
      const d = rt.current, now = performance.now();
      g.drawImage(bg, 0, 0);
      if (d) {
        d.f.forEach(([id, x, y, face, hp, stt, t, score], i) => {
          const q = (disp[id] ||= { x, y });
          q.x += (x - q.x) * 0.6; q.y += (y - q.y) * 0.6;
          if (stt === "hit" && prev[id] !== "hit") {
            for (let k = 0; k < 9; k++) sparks.push({ x: q.x, y: GROUND - q.y - 70, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 7 - 1, l: 14 });
          }
          prev[id] = stt;
          const mineF = id === me;
          drawFighter(g, q.x, q.y, face, stt, t, mineF ? "#e8453c" : "#3a86ff", mineF ? "#8f1d17" : "#1c4aa8", stt === "hit" && t % 2 === 0, now);
          g.fillStyle = mineF ? "#ffd23f" : "#eaf2ff"; g.font = "700 12px monospace"; g.textAlign = "center";
          g.fillText(mineF ? "YOU" : nameOf(room, id), q.x, GROUND - q.y - 142);
        });
        for (let k = sparks.length - 1; k >= 0; k--) {
          const p = sparks[k]; p.x += p.vx; p.y += p.vy; p.vy += 0.5;
          if (--p.l <= 0) { sparks.splice(k, 1); continue; }
          g.fillStyle = p.l % 2 ? "#fff" : "#ffd23f"; g.fillRect(Math.round(p.x), Math.round(p.y), 5, 5);
        }
        // HUD
        const bar = (x, w, hp, right) => {
          g.fillStyle = "#000"; g.fillRect(x - 3, 15, w + 6, 26);
          g.fillStyle = "#4a1313"; g.fillRect(x, 18, w, 20);
          const hw = (w * hp) / 100;
          g.fillStyle = hp > 50 ? "#3ddc97" : hp > 25 ? "#ffd23f" : "#ff6b6b";
          g.fillRect(right ? x + w - hw : x, 18, hw, 20);
          g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(right ? x + w - hw : x, 18, hw, 5);
        };
        const [A, B] = d.f;
        bar(24, 300, A[4], false); bar(476, 300, B[4], true);
        g.font = "700 13px monospace";
        g.textAlign = "left"; g.fillStyle = "#fff"; g.fillText(A[0] === me ? "YOU" : nameOf(room, A[0]), 24, 58);
        g.textAlign = "right"; g.fillText(B[0] === me ? "YOU" : nameOf(room, B[0]), 776, 58);
        for (let k = 0; k < d.target; k++) {
          g.fillStyle = k < A[7] ? "#ffd23f" : "rgba(255,255,255,.2)"; g.fillRect(24 + k * 18, 64, 12, 12);
          g.fillStyle = k < B[7] ? "#ffd23f" : "rgba(255,255,255,.2)"; g.fillRect(764 - k * 18, 64, 12, 12);
        }
        g.fillStyle = "#000"; g.fillRect(364, 12, 72, 36);
        g.fillStyle = "#ffd23f"; g.font = "800 26px monospace"; g.textAlign = "center"; g.fillText(String(d.secs), 400, 40);
        g.font = "800 54px monospace"; g.lineWidth = 6; g.strokeStyle = "#000"; g.fillStyle = "#ffd23f";
        const big = (txt) => { g.strokeText(txt, 400, 235); g.fillText(txt, 400, 235); };
        if (d.over > 0) {
          const ko = d.f.some((f) => f[4] <= 0);
          big(ko ? "K.O.!" : "TIME!");
          g.font = "700 20px monospace"; g.fillStyle = "#fff";
          g.fillText(d.msg === "draw" ? "Draw — no point" : d.msg === me ? "You take the round" : `${nameOf(room, d.msg)} takes the round`, 400, 270);
        } else if (d.wait > 0) big(d.wait > 28 ? `ROUND ${d.round}` : "FIGHT!");
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [rt, me, room.players]);

  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : ["Best of 3 — land hits, block to cut damage", ""];
  return (
    <Arena ratio={1.6} hint="A/D or ←/→ move · W/↑ jump · Space or J attack · S/↓ block"
      controls={<>
        <div className="tc-l fight-l">
          <HoldBtn label="Left" onDown={() => set("l", 1)} onUp={() => set("l", 0)}>◀</HoldBtn>
          <HoldBtn label="Right" onDown={() => set("r", 1)} onUp={() => set("r", 0)}>▶</HoldBtn>
        </div>
        <div className="tc-r fight-r">
          <HoldBtn className="blue" label="Block" onDown={() => set("b", 1)} onUp={() => set("b", 0)}>🛡</HoldBtn>
          <HoldBtn className="up" label="Jump" onDown={() => set("j", 1)} onUp={() => set("j", 0)}>⤒</HoldBtn>
          <HoldBtn className="atk" label="Attack" onDown={() => set("a", 1)} onUp={() => set("a", 0)}>👊</HoldBtn>
        </div>
      </>}>
      <p className={`status ${cls}`}>{txt}</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <div className="again"><Again show={!!st.winner} /></div>
    </Arena>
  );
}

// ================================================================ MAZE CHASE
const CELL = 40;

export function Maze({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const dir = (d) => s.emit("mz:dir", d);

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
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      dir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : (dy > 0 ? "d" : "u"));
    };
    cv.addEventListener("pointerdown", pd); cv.addEventListener("pointerup", pu);

    const face = {};
    let raf;
    const frame = () => {
      const d = rt.current, now = performance.now();
      g.fillStyle = "#04060f"; g.fillRect(0, 0, 840, 600);
      if (d) {
        d.maze.forEach((row, y) => {
          for (let x = 0; x < 21; x++) {
            if (row[x] === "1") {
              g.fillStyle = "#16225e"; g.fillRect(x * CELL, y * CELL, CELL, CELL);
              g.fillStyle = "#2e45c9"; rr(g, x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6, 7); g.fill();
              g.fillStyle = "#0b1346"; rr(g, x * CELL + 8, y * CELL + 8, CELL - 16, CELL - 16, 4); g.fill();
            }
          }
        });
        d.dots.forEach((row, y) => {
          for (let x = 0; x < 21; x++) if (row[x] === "1") { g.fillStyle = "#ffe9a8"; g.beginPath(); g.arc(x * CELL + 20, y * CELL + 20, 3.4, 0, 7); g.fill(); }
        });
        d.power.forEach(([x, y]) => {
          g.save(); g.shadowColor = "#4cc9f0"; g.shadowBlur = 16; g.fillStyle = "#7be3ff";
          g.beginPath(); g.arc(x * CELL + 20, y * CELL + 20, 8 + Math.sin(now / 150) * 2, 0, 7); g.fill(); g.restore();
        });
        const k = Math.min(1, (now - d.at) / d.step);
        d.p.forEach(([id, x, y, px, py], i) => {
          const cx = (px + (x - px) * k) * CELL + 20, cy = (py + (y - py) * k) * CELL + 20;
          if (x !== px || y !== py) face[id] = [x - px, y - py];
          const [fx, fy] = face[id] || [i === d.runner ? -1 : 1, 0];
          const isRun = i === d.runner, mineP = id === me;
          g.save();
          if (isRun) {
            g.shadowColor = d.boost > 0 ? "#7be3ff" : "#ffd23f"; g.shadowBlur = 16;
            g.fillStyle = "#ffd23f";
            const m = Math.abs(Math.sin(now / 90)) * 0.6 + 0.05, a = Math.atan2(fy, fx);
            g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 15, a + m, a + Math.PI * 2 - m); g.closePath(); g.fill();
          } else {
            g.shadowColor = "#ff4d4d"; g.shadowBlur = 16;
            g.fillStyle = d.boost > 0 ? "#5a6cff" : "#ff4d4d";
            g.beginPath(); g.arc(cx, cy - 2, 15, Math.PI, 0); g.lineTo(cx + 15, cy + 14);
            for (let j = 0; j < 3; j++) g.lineTo(cx + 15 - (j + 0.5) * 10, cy + 8 + (Math.floor(now / 120) % 2 ? 0 : 4)), g.lineTo(cx + 15 - (j + 1) * 10, cy + 14);
            g.closePath(); g.fill();
            g.shadowBlur = 0; g.fillStyle = "#fff";
            [-5, 5].forEach((ox) => { g.beginPath(); g.arc(cx + ox, cy - 3, 4, 0, 7); g.fill(); });
            g.fillStyle = "#0a1030";
            [-5, 5].forEach((ox) => { g.beginPath(); g.arc(cx + ox + fx * 1.8, cy - 3 + fy * 1.8, 2, 0, 7); g.fill(); });
          }
          g.restore();
          if (mineP) {
            g.fillStyle = "#3ddc97"; g.beginPath(); g.moveTo(cx, cy - 26); g.lineTo(cx - 6, cy - 34); g.lineTo(cx + 6, cy - 34); g.closePath(); g.fill();
          }
        });
        // HUD strip over the top wall row
        g.fillStyle = "rgba(2,5,15,.8)"; g.fillRect(0, 0, 840, 30);
        g.font = "800 15px sans-serif"; g.textBaseline = "middle";
        const meIdx = d.p.findIndex((p) => p[0] === me), runner = d.runner === meIdx;
        g.textAlign = "left"; g.fillStyle = runner ? "#ffd23f" : "#ff6b6b";
        g.fillText(`${runner ? "RUNNER · eat dots, dodge the ghost" : "CHASER · catch the runner"}`, 12, 15);
        g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText(`Round ${d.round}/${d.total} · ${d.secs}s`, 420, 15);
        g.textAlign = "right"; g.fillStyle = "#eaf2ff";
        g.fillText(d.p.map((p) => `${p[0] === me ? "You" : nameOf(room, p[0])} ${p[5]}`).join("  ·  "), 828, 15);
        g.textBaseline = "alphabetic";
        g.textAlign = "center";
        if (d.count > 0) {
          g.fillStyle = "rgba(4,6,15,.6)"; g.fillRect(0, 30, 840, 570);
          g.fillStyle = "#ffd23f"; g.font = "800 90px sans-serif"; g.fillText(String(Math.ceil((d.count * d.step) / 1000)), 420, 330);
          g.font = "700 20px sans-serif"; g.fillStyle = "#fff";
          g.fillText(runner ? "You are the RUNNER" : "You are the CHASER", 420, 380);
        } else if (d.over > 0 && d.msg) {
          g.fillStyle = "rgba(4,6,15,.55)"; g.fillRect(0, 30, 840, 570);
          g.fillStyle = "#ffd23f"; g.font = "800 44px sans-serif";
          const how = { caught: "Caught!", cleared: "Maze cleared!", survived: "Survived!" }[d.msg.how];
          g.fillText(how, 420, 310);
          g.font = "700 20px sans-serif"; g.fillStyle = "#fff";
          g.fillText(`${d.msg.id === me ? "You score" : nameOf(room, d.msg.id) + " scores"} the round`, 420, 350);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); cv.removeEventListener("pointerdown", pd); cv.removeEventListener("pointerup", pu); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, me, room.players]);

  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : ["Roles swap every round — 4 rounds total", ""];
  const dp = (k, sym) => <HoldBtn className={`pk-${k}`} label={k} onDown={() => dir(k)}>{sym}</HoldBtn>;
  return (
    <Arena ratio={1.4} hint="Arrow keys / WASD or swipe. Runner: clear every dot or survive the clock. Chaser: catch them. Cyan orbs make the runner faster."
      controls={<div className="tc-r"><div className="pad">{dp("u", "▲")}{dp("l", "◀")}{dp("d", "▼")}{dp("r", "▶")}</div></div>}>
      <ScoreBar room={room} me={me} />
      <p className={`status ${cls}`}>{txt}</p>
      <canvas ref={ref} className="arena" width={840} height={600} />
      <div className="again"><Again show={!!st.winner} /></div>
    </Arena>
  );
}

// ================================================================ PONG SHOWDOWN
const ORB_ICON = ["⬆", "⬇", "⚡", "❄"];
const ORB_COL = ["#3ddc97", "#ff6b6b", "#ffd23f", "#7be3ff"];
const ORB_TXT = ["BIG PADDLE", "FOE SHRUNK", "SPEED UP", "FOE FROZEN"];

export function PongShowdown({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const seat = st.ids.indexOf(me);
  const smash = () => s.emit("px:smash");

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const keys = { u: 0, d: 0 };
    let myY = 250, lastSent = -1;
    const disp = [205, 205];
    const send = () => { const y = Math.round(myY); if (y !== lastSent) { lastSent = y; s.emit("px:y", y); } };
    const mm = (e) => {
      const r = cv.getBoundingClientRect();
      myY = ((e.clientY - r.top) / r.height) * 500;
      send();
    };
    const pdn = (e) => { mm(e); if (e.pointerType === "mouse") smash(); };
    const kd = (v) => (e) => {
      if (e.target.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") { keys.u = v; e.preventDefault(); }
      if (k === "arrowdown" || k === "s") { keys.d = v; e.preventDefault(); }
      if (k === " " && v) { e.preventDefault(); if (!e.repeat) smash(); }
    };
    const down = kd(1), up = kd(0);
    cv.addEventListener("pointermove", mm); cv.addEventListener("pointerdown", pdn);
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    const tick = setInterval(() => {
      if (keys.u || keys.d) { myY = Math.max(0, Math.min(500, myY + (keys.d - keys.u) * 14)); send(); }
    }, 30);

    let raf;
    const frame = () => {
      const d = rt.current, now = performance.now();
      g.fillStyle = "#0a0615"; g.fillRect(0, 0, 800, 500);
      const grad = g.createRadialGradient(400, 250, 40, 400, 250, 440);
      grad.addColorStop(0, "rgba(255,92,200,.16)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad; g.fillRect(0, 0, 800, 500);
      g.strokeStyle = "rgba(255,140,220,.3)"; g.lineWidth = 3; g.setLineDash([10, 16]);
      g.beginPath(); g.moveTo(400, 0); g.lineTo(400, 500); g.stroke(); g.setLineDash([]);
      if (d) {
        d.p.forEach(([y], i) => { disp[i] += (y - disp[i]) * 0.6; });
        g.textAlign = "center"; g.font = "800 64px sans-serif"; g.fillStyle = "rgba(255,255,255,.14)";
        g.fillText(d.p[0][1], 300, 80); g.fillText(d.p[1][1], 500, 80);
        const cols = ["#ff5cc8", "#ffb347"];
        [0, 1].forEach((i) => {
          const [, , h, big, shr, frz, cool] = d.p[i];
          const x = i ? 758 : 30, col = frz > 0 ? "#7be3ff" : cols[i];
          g.save(); g.shadowColor = col; g.shadowBlur = i === seat ? 24 : 12;
          const pg = g.createLinearGradient(x, 0, x + 12, 0);
          pg.addColorStop(0, "#fff"); pg.addColorStop(1, col);
          g.fillStyle = pg; rr(g, x, disp[i], 12, h, 6); g.fill(); g.restore();
          // status pips beside the paddle
          const px = i ? x - 16 : x + 24;
          let yy = disp[i] + 12;
          [[big > 0, "⬆"], [shr > 0, "⬇"], [frz > 0, "❄"]].forEach(([on, ic]) => { if (on) { g.font = "14px sans-serif"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText(ic, px, yy); yy += 18; } });
          if (i === seat) {
            g.fillStyle = "rgba(255,255,255,.15)"; g.fillRect(x - 6, disp[i] + h + 8, 24, 4);
            g.fillStyle = cool > 0 ? "#ff9f1c" : "#3ddc97"; g.fillRect(x - 6, disp[i] + h + 8, 24 * (1 - cool / 60), 4);
          }
        });
        if (d.orb) {
          const [ox, oy, type, life] = d.orb;
          if (life > 60 || Math.floor(now / 120) % 2) {
            g.save(); g.shadowColor = ORB_COL[type]; g.shadowBlur = 22;
            g.fillStyle = ORB_COL[type]; g.beginPath(); g.arc(ox, oy, 17 + Math.sin(now / 160) * 2, 0, 7); g.fill(); g.restore();
            g.fillStyle = "#0a0615"; g.font = "800 17px sans-serif"; g.textAlign = "center"; g.fillText(ORB_ICON[type], ox, oy + 6);
          }
        }
        const dt = d.count > 0 ? 0 : Math.min(0.1, (now - d.at) / 1000);
        const bx = d.b[0] + d.b[2] * dt, by = d.b[1] + d.b[3] * dt, sp = Math.hypot(d.b[2], d.b[3]), fire = d.b[4];
        g.save(); g.shadowColor = fire ? "#ff7a1c" : "#fff"; g.shadowBlur = fire ? 30 : 18;
        for (let k = 5; k >= 1; k--) {
          g.fillStyle = fire ? `rgba(255,${120 + k * 20},40,${0.1 * (6 - k)})` : `rgba(255,255,255,${0.08 * (6 - k)})`;
          g.beginPath(); g.arc(bx - (d.b[2] / (sp || 1)) * k * 8, by - (d.b[3] / (sp || 1)) * k * 8, 8 - k * 0.8, 0, 7); g.fill();
        }
        g.fillStyle = fire ? "#ffd27a" : "#fff"; g.beginPath(); g.arc(bx, by, 8, 0, 7); g.fill(); g.restore();
        if (d.fx) {
          const [who, type, n] = d.fx;
          g.globalAlpha = Math.min(1, n / 12);
          g.font = "800 22px sans-serif"; g.textAlign = "center"; g.fillStyle = ORB_COL[type];
          g.fillText(ORB_TXT[type], who ? 600 : 200, 150 - (30 - n));
          g.globalAlpha = 1;
        }
        g.font = "700 12px sans-serif"; g.fillStyle = "#c9a8e8"; g.textAlign = "center";
        if (seat >= 0) g.fillText("▲ YOU", seat ? 764 : 36, 492);
        if (d.count > 0 && !d.winner) { g.fillStyle = "#ffd23f"; g.font = "800 70px sans-serif"; g.fillText(String(Math.ceil(d.count / 23)), 400, 275); }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf); clearInterval(tick);
      cv.removeEventListener("pointermove", mm); cv.removeEventListener("pointerdown", pdn);
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, rt, seat]);

  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : [`First to ${st.target} · knock the ball into orbs for power-ups`, ""];
  return (
    <Arena ratio={1.6} hint="Move with mouse / finger or W S / ↑ ↓. SMASH (click or Space) as the ball arrives for a fast fireball."
      controls={<div className="tc-r"><HoldBtn className="atk smash" label="Smash" onDown={smash}>💥<small>SMASH</small></HoldBtn></div>}>
      <ScoreBar room={room} me={me} />
      <p className={`status ${cls}`}>{txt}</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <div className="again"><Again show={!!st.winner} /></div>
    </Arena>
  );
}

// ================================================================ MINI RACING
const RC = { CX: 400, CY: 250, OA: 372, OB: 228, IA: 210, IB: 96, MA: 291, MB: 162 };

function drawCar(g, x, y, a, col, dark, boost, now) {
  g.save(); g.translate(x, y); g.rotate(a);
  if (boost) {
    g.fillStyle = `rgba(255,${150 + Math.random() * 80},40,.9)`;
    g.beginPath(); g.moveTo(-17, -4); g.lineTo(-30 - Math.random() * 12, 0); g.lineTo(-17, 4); g.fill();
  }
  g.fillStyle = "rgba(0,0,0,.35)"; rr(g, -16, -8, 36, 20, 6); g.fill();
  g.fillStyle = "#111"; [[-11, -11], [8, -11], [-11, 7], [8, 7]].forEach(([wx, wy]) => g.fillRect(wx, wy, 8, 4));
  const gr = g.createLinearGradient(0, -9, 0, 9);
  gr.addColorStop(0, col); gr.addColorStop(1, dark);
  g.fillStyle = gr; rr(g, -17, -8, 34, 16, 6); g.fill();
  g.fillStyle = "rgba(0,0,0,.55)"; rr(g, -3, -6, 11, 12, 3); g.fill();
  g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(-1, -5, 4, 3);
  g.fillStyle = "#fff3b0"; g.fillRect(15, -6, 3, 3); g.fillRect(15, 3, 3, 3);
  g.restore();
}

export function Racing({ room, me }) {
  const s = getSocket();
  const st = room.state;
  const ref = useRef(null);
  const rt = useRT();
  const set = useInput({ arrowleft: "l", a: "l", arrowright: "r", d: "r", arrowup: "g", w: "g", arrowdown: "b", s: "b", " ": "g" }, (i) => s.emit("rc:input", i));

  useEffect(() => {
    const cv = ref.current, g = cv.getContext("2d");
    const disp = {};
    const puffs = [];
    // static track layer
    const tr = document.createElement("canvas");
    tr.width = 800; tr.height = 500;
    const t = tr.getContext("2d");
    t.fillStyle = "#1f5a2e"; t.fillRect(0, 0, 800, 500);
    for (let i = 0; i < 260; i++) { t.fillStyle = i % 2 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.07)"; t.fillRect((i * 73) % 800, (i * 41) % 500, 18, 4); }
    t.fillStyle = "#3a3f4a";
    t.beginPath(); t.ellipse(RC.CX, RC.CY, RC.OA, RC.OB, 0, 0, Math.PI * 2); t.fill();
    t.fillStyle = "#1f5a2e";
    t.beginPath(); t.ellipse(RC.CX, RC.CY, RC.IA, RC.IB, 0, 0, Math.PI * 2); t.fill();
    for (let i = 0; i < 120; i++) { t.fillStyle = "rgba(255,255,255,.03)"; t.fillRect((i * 57) % 800, (i * 37) % 500, 3, 3); }
    [[RC.OA, RC.OB], [RC.IA, RC.IB]].forEach(([a, b]) => {
      t.lineWidth = 8; t.strokeStyle = "#e63946"; t.setLineDash([22, 22]);
      t.beginPath(); t.ellipse(RC.CX, RC.CY, a, b, 0, 0, Math.PI * 2); t.stroke();
      t.strokeStyle = "#fff"; t.lineDashOffset = 22;
      t.beginPath(); t.ellipse(RC.CX, RC.CY, a, b, 0, 0, Math.PI * 2); t.stroke();
      t.setLineDash([]); t.lineDashOffset = 0;
    });
    t.strokeStyle = "rgba(255,255,255,.25)"; t.lineWidth = 3; t.setLineDash([16, 18]);
    t.beginPath(); t.ellipse(RC.CX, RC.CY, RC.MA, RC.MB, 0, 0, Math.PI * 2); t.stroke(); t.setLineDash([]);
    // start / finish
    const sx = RC.CX + RC.IA + 4, ex = RC.CX + RC.OA - 4;
    for (let x = sx, i = 0; x < ex; x += 12, i++) for (let r = 0; r < 2; r++) { t.fillStyle = (i + r) % 2 ? "#fff" : "#111"; t.fillRect(x, RC.CY + r * 8 - 8, 12, 8); }

    let raf;
    const frame = () => {
      const d = rt.current, now = performance.now();
      g.drawImage(tr, 0, 0);
      if (d) {
        d.pads.forEach(([px, py]) => {
          const th = Math.atan2((py - RC.CY) / RC.MB, (px - RC.CX) / RC.MA);
          const a = Math.atan2(RC.MB * Math.cos(th), -RC.MA * Math.sin(th));
          g.save(); g.translate(px, py); g.rotate(a);
          g.fillStyle = "rgba(255,210,63,.18)"; rr(g, -22, -24, 44, 48, 8); g.fill();
          g.strokeStyle = "#ffd23f"; g.lineWidth = 4; g.lineCap = "round";
          const off = (now / 120) % 1;
          for (let k = 0; k < 3; k++) { const xx = -12 + k * 12 + off * 4; g.beginPath(); g.moveTo(xx, -9); g.lineTo(xx + 7, 0); g.lineTo(xx, 9); g.stroke(); }
          g.restore();
        });
        // positions
        const order = [...d.c].sort((a, b) => b[5] - a[5]).map((c) => c[0]);
        d.c.forEach(([id, x, y, a, sp, , boost]) => {
          const q = (disp[id] ||= { x, y, a });
          q.x += (x - q.x) * 0.6; q.y += (y - q.y) * 0.6; q.a += wrapA(a - q.a) * 0.6;
          if (boost || Math.abs(sp) > 250) puffs.push({ x: q.x - Math.cos(q.a) * 16, y: q.y - Math.sin(q.a) * 16, l: boost ? 14 : 8, c: boost ? "255,170,60" : "230,230,230" });
          const mineC = id === me;
          drawCar(g, q.x, q.y, q.a, mineC ? "#3ddc97" : "#ff6b6b", mineC ? "#14804f" : "#a62f2f", boost, now);
          g.fillStyle = mineC ? "#bff5de" : "#ffd0d0"; g.font = "700 11px sans-serif"; g.textAlign = "center";
          g.fillText(mineC ? "YOU" : nameOf(room, id), q.x, q.y - 20);
        });
        for (let k = puffs.length - 1; k >= 0; k--) {
          const p = puffs[k];
          if (--p.l <= 0) { puffs.splice(k, 1); continue; }
          g.fillStyle = `rgba(${p.c},${p.l / 18})`; g.fillRect(p.x - 2, p.y - 2, 4, 4);
        }
        // HUD
        const mc = d.c.find((c) => c[0] === me);
        g.fillStyle = "rgba(5,11,22,.7)"; rr(g, 215, 150, 370, 200, 14); g.fill();
        g.textAlign = "center";
        if (mc) {
          g.fillStyle = "#fff"; g.font = "800 24px sans-serif";
          g.fillText(`LAP ${Math.min(d.laps, Math.floor(mc[5]) + 1)} / ${d.laps}`, 400, 210);
          g.fillStyle = "#8fa6c4"; g.font = "700 15px sans-serif";
          g.fillText(`P${order.indexOf(me) + 1} of 2  ·  ${Math.max(0, Math.round(mc[4] * 0.5))} km/h`, 400, 236);
          g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(300, 256, 200, 8);
          g.fillStyle = mc[6] ? "#ffd23f" : "#3ddc97"; g.fillRect(300, 256, Math.min(200, Math.max(0, mc[4]) / 440 * 200), 8);
          const opp = d.c.find((c) => c[0] !== me);
          if (opp) { g.fillStyle = "#ffb4b4"; g.font = "600 13px sans-serif"; g.fillText(`${nameOf(room, opp[0])}: lap ${Math.min(d.laps, Math.floor(opp[5]) + 1)}`, 400, 290); }
        }
        if (d.count > 0) {
          g.fillStyle = "#ffd23f"; g.font = "800 90px sans-serif"; g.fillText(d.count > 66 ? "3" : d.count > 33 ? "2" : "1", 400, 330);
          g.font = "700 18px sans-serif"; g.fillStyle = "#fff"; g.fillText("Get ready…", 400, 140);
        } else if (d.winner) {
          g.fillStyle = "#ffd23f"; g.font = "800 40px sans-serif"; g.fillText("FINISH!", 400, 332);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [rt, me, room.players]);

  const secs = st.time ? (st.time / 1000).toFixed(2) : null;
  const [txt, cls] = st.winner ? banner(room, me, st.winner, null) : [`First to finish ${st.laps} laps wins`, ""];
  return (
    <Arena ratio={1.6} hint="↑ / W gas · ↓ / S brake · ← → steer. Yellow chevrons are boost pads. Stay on the asphalt — grass is slow."
      controls={<>
        <div className="tc-l fight-l">
          <HoldBtn label="Steer left" onDown={() => set("l", 1)} onUp={() => set("l", 0)}>◀</HoldBtn>
          <HoldBtn label="Steer right" onDown={() => set("r", 1)} onUp={() => set("r", 0)}>▶</HoldBtn>
        </div>
        <div className="tc-r fight-r">
          <HoldBtn className="blue" label="Brake" onDown={() => set("b", 1)} onUp={() => set("b", 0)}>🛑</HoldBtn>
          <HoldBtn className="atk" label="Gas" onDown={() => set("g", 1)} onUp={() => set("g", 0)}>⛽<small>GAS</small></HoldBtn>
        </div>
      </>}>
      <p className={`status ${cls}`}>{txt}{st.winner && secs ? ` · ${secs}s` : ""}</p>
      <canvas ref={ref} className="arena" width={800} height={500} />
      <div className="again"><Again show={!!st.winner} /></div>
    </Arena>
  );
}
