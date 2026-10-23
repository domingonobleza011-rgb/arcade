"use client";
import { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { TicTacToe, Quiz, Draw, Shooter, Pictionary } from "./games";

const EMOTES = ["👍", "😂", "😮", "🔥", "😢", "👏", "😎", "🤯"];
const TITLES = { tictactoe: "Tic-tac-toe", quiz: "Quiz battle", draw: "Drawing board", shooter: "Arena shooter", pictionary: "Draw & guess", chat: "Chat room" };

export default function Room({ room, me, onLeave }) {
  const s = getSocket();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [floats, setFloats] = useState([]);
  const [copied, setCopied] = useState(false);
  const end = useRef(null);

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

  const Game = { tictactoe: TicTacToe, quiz: Quiz, draw: Draw, shooter: Shooter, pictionary: Pictionary }[room.game];
  const isChat = room.game === "chat";

  return (
    <>
      <div className="bar">
        <div>
          <h1 style={{ fontSize: "1.6rem" }}>{TITLES[room.game]}</h1>
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

      <div className="room" style={isChat ? { gridTemplateColumns: "1fr" } : undefined}>
        {!isChat && <section className="panel stage">
          {room.status === "waiting" ? (
            <p className="status">Waiting for players ({room.players.length}/{room.min}). Share code <span className="code">{room.code}</span></p>
          ) : (
            <Game room={room} me={me} />
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
