"use client";
import { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { TicTacToe, Quiz, Draw, Shooter, Pictionary, Connect4, Checkers, RPS, Memory, Hangman } from "./games";
import { Battleship, DotsBoxes, Reversi, Gomoku, Snake, Pong, Tanks, Scramble, MathRace, QuickDraw } from "./games2";
import { Chess, SnakesLadders, PixelFighter, MazeChase, PongShowdown, MiniRacing } from "./games3";
import { TITLES, META } from "./registry";
import MediaControls from "./MediaControls";

const EMOTES = ["👍", "😂", "😮", "🔥", "😢", "👏", "😎", "🤯"];

const HOWTO = {
  tictactoe: ["Tap a square to place your mark.", "Get three in a row to win."],
  connect4: ["Tap a column to drop your disc.", "Connect four in a row, column, or diagonal."],
  checkers: ["Tap a piece, then a highlighted square.", "Captures are forced. Reach the far row to king."],
  reversi: ["Place a disc to flank opponent pieces.", "All flanked discs flip to your color."],
  gomoku: ["Place stones on the grid.", "Get five in a row to win."],
  battleship: ["Tap enemy waters to fire.", "Sink the whole fleet before they sink yours."],
  dots: ["Tap a line between dots.", "Close a box to score and go again."],
  chess: ["You play White or Black (shown above the board).", "Tap your piece, then a green square to move.", "Checkmate wins — or stalemate is a draw."],
  snakesladders: ["Tap Roll on your turn.", "Ladders 🪜 send you up, snakes 🐍 send you down.", "Need an exact roll to land on 100. Roll a 6 for another turn."],
  snake: ["Steer with WASD, arrows, swipe, or the d-pad.", "Eat food to grow. Don't hit walls or the other snake."],
  pong: ["Move your paddle with mouse/finger or W/S.", "First to 7 wins. Edge hits add spin."],
  pongshow: ["Move with mouse/finger, W/S, or the d-pad.", "Ball speeds up every rally. First to 11 wins."],
  tanks: ["W/S drive, A/D rotate, mouse aims, Fire/Space shoots.", "Shells bounce. First to 3 rounds wins."],
  shooter: ["WASD / d-pad to move. Aim with finger/mouse and hold Fire.", "First to 10 frags wins."],
  fighter: ["A/D move, W jump, Punch and Kick buttons (or J/K).", "Deplete their HP. Best of 3 rounds."],
  maze: ["WASD / d-pad to move.", "Red hunts, green flees. Roles swap after each catch. First to 3 wins."],
  racing: ["W gas, S brake, A/D steer (or d-pad).", "Stay on the oval. First to 3 laps wins."],
  quickdraw: ["Wait for DRAW! — then tap/click/Space as fast as you can.", "Don't fire early or you foul."],
  rps: ["Pick rock, paper, or scissors each round.", "First to 3 wins."],
  memory: ["Flip two cards on your turn.", "Match pairs to score. Most pairs wins."],
  hangman: ["Guess letters to solve the word.", "Fewer wrongs and faster solve wins."],
  quiz: ["Answer each question as fast as you can.", "First correct answer scores double."],
  scramble: ["Unscramble the letters into a word.", "First correct answer scores."],
  mathrace: ["Solve the equation quickly.", "First correct answer wins the point."],
  draw: ["Draw freely on the shared canvas.", "Everyone sees strokes live."],
  pictionary: ["One player draws the secret word.", "Guess in chat. Fast correct guesses score more."],
  chat: ["Type messages and send emotes.", "Just hang out."],
};


export default function Room({ room, me, onLeave }) {
  const s = getSocket();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [floats, setFloats] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const end = useRef(null);
  const howKey = useRef("");


  useEffect(() => {
    if (room.status !== "playing" || room.game === "chat") return;
    const key = room.code + ":" + room.game + ":" + (room.players?.map(p => p.id).join(",") || "");
    if (howKey.current === key) return;
    howKey.current = key;
    setShowHow(true);
    const t = setTimeout(() => setShowHow(false), 5000);
    return () => clearTimeout(t);
  }, [room.status, room.code, room.game, room.players]);

  useEffect(() => {
    const onChat = (m) => setMsgs((x) => [...x.slice(-99), m]);
    const onEmote = (e) => {
      const id = Math.random();
      setFloats((f) => [...f, { ...e, id, left: 8 + Math.random() * 80 }]);
      setTimeout(() => setFloats((f) => f.filter((y) => y.id !== id)), 2200);
    };
    const onHistory = (h) => setMsgs(h);
    s.on("chat", onChat);
    s.on("chat:history", onHistory);
    s.on("emote", onEmote);
    s.emit("chat:sync");
    return () => { s.off("chat", onChat); s.off("chat:history", onHistory); s.off("emote", onEmote); };
  }, [s]);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  const send = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    s.emit("chat", t);
    setText("");
  };

  const Game = {
    tictactoe: TicTacToe, quiz: Quiz, draw: Draw, shooter: Shooter, pictionary: Pictionary, connect4: Connect4,
    checkers: Checkers, rps: RPS, memory: Memory, hangman: Hangman,
    battleship: Battleship, dots: DotsBoxes, reversi: Reversi, gomoku: Gomoku, snake: Snake, pong: Pong,
    tanks: Tanks, scramble: Scramble, mathrace: MathRace, quickdraw: QuickDraw,
    chess: Chess, snakesladders: SnakesLadders, fighter: PixelFighter, maze: MazeChase, pongshow: PongShowdown, racing: MiniRacing,
  }[room.game];
  const isChat = room.game === "chat";

  return (
    <>
      <div className="bar">
        <div>
          <h1 style={{ fontSize: "1.6rem" }}><span aria-hidden>{META[room.game]?.icon}</span>{TITLES[room.game]}</h1>
          <div className="players">
            {room.players.map((p) => (
              <span key={p.id} className={`pill ${p.id === me ? "me" : ""}`}>{p.name}{p.id === me ? " (you)" : ""}</span>
            ))}
          </div>
        </div>
        <div className="row" style={{ margin: 0 }}>
          <span className="code" aria-label="Room code">{room.code}</span>
          <button onClick={() => { navigator.clipboard?.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? "Copied" : "Copy code"}
          </button>
          <button onClick={onLeave}>Leave</button>
        </div>
      </div>

      <MediaControls room={room} me={me} />

      <div className="room" style={isChat ? { gridTemplateColumns: "1fr" } : undefined}>
        {!isChat && <section className="panel stage">
          {room.status === "waiting" ? (
            <div className="waiting">
              <span className="big" aria-hidden>{META[room.game]?.icon}</span>
              <p className="status">Waiting for players ({room.players.length}/{room.min})</p>
              <p className="meta">Share code <span className="code">{room.code}</span> with a friend</p>
            </div>
          ) : (
            <>
              {showHow && HOWTO[room.game] && (
                <div className="howto" role="dialog" aria-label="How to play" onClick={() => setShowHow(false)}>
                  <div className="howto-card" onClick={(e) => e.stopPropagation()}>
                    <h3><span aria-hidden>{META[room.game]?.icon}</span> How to play</h3>
                    <ol>{HOWTO[room.game].map((line, i) => <li key={i}>{line}</li>)}</ol>
                    <div className="meta">
                      <div className="howto-bar"><i /></div>
                      <button onClick={() => setShowHow(false)}>Got it</button>
                    </div>
                  </div>
                </div>
              )}
              <Game room={room} me={me} />
            </>
          )}
        </section>}

        <aside className={`panel side ${isChat ? "wide" : ""}`}>
          <div className="msgs" aria-live="polite">
            {msgs.map((m, i) => m.sys ? (
              <div key={i} className="msg sys">{m.text}</div>
            ) : (
              <div key={i} className={`msg ${m.id === me ? "me" : ""}`}><b>{m.from}:</b> {m.text}{m.t && <span className="time">{new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}</div>
            ))}
            <div ref={end} />
          </div>
          <div className="emotes">
            {EMOTES.map((e) => <button key={e} aria-label={`Send ${e}`} onClick={() => s.emit("emote", e)}>{e}</button>)}
          </div>
          <form className="send" onSubmit={send}>
            <input value={text} maxLength={200} placeholder="Say something" onChange={(e) => setText(e.target.value)} aria-label="Chat message" />
            <button className="primary">Send</button>
          </form>
        </aside>
      </div>

      {floats.map((f) => (
        <div key={f.id} className="float" style={{ left: `${f.left}%` }}>{f.emoji}<small>{f.from}</small></div>
      ))}
    </>
  );
}
