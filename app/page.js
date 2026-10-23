"use client";
import { useEffect, useState } from "react";
import { getSocket } from "../lib/socket";
import Room from "../components/Room";

const GAMES = [
  { id: "tictactoe", name: "Tic-tac-toe", blurb: "Three in a row. 2 players." },
  { id: "quiz", name: "Quiz battle", blurb: "5 questions. The first correct answer scores double. 2 players." },
  { id: "draw", name: "Drawing board", blurb: "Sketch together in real time. Up to 8 players." },
  { id: "shooter", name: "Arena shooter", blurb: "Top-down free-for-all. First to 10 frags wins. Up to 8 players. Desktop only." },
  { id: "pictionary", name: "Draw & guess", blurb: "One player draws a secret word, everyone else guesses in chat. 4 to 5 players." },
];

export default function Home() {
  const [name, setName] = useState("");
  const [game, setGame] = useState("tictactoe");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState(null);
  const [me, setMe] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = getSocket();
    const onRoom = (r) => { setMe(s.id); setRoom(r); setSearching(false); setError(""); };
    const onErr = (m) => { setError(m); setSearching(false); };
    const onSearching = () => setSearching(true);
    s.on("room", onRoom);
    s.on("err", onErr);
    s.on("searching", onSearching);
    return () => { s.off("room", onRoom); s.off("err", onErr); s.off("searching", onSearching); };
  }, []);

  const emit = (ev, data) => { setError(""); getSocket().emit(ev, data); };
  const leave = () => { getSocket().emit("leave"); setRoom(null); setSearching(false); };

  if (room) return <main className="wrap"><Room room={room} me={me} onLeave={leave} /></main>;

  return (
    <main className="wrap">
      <h1>Play together</h1>
      <p className="sub">Pick a game, then find an opponent or share a room code.</p>
      <section className="panel">
        <label>
          Your name <input value={name} maxLength={16} placeholder="Guest" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="games">
          {GAMES.map((g) => (
            <button key={g.id} className="game" aria-pressed={game === g.id} onClick={() => setGame(g.id)}>
              <b>{g.name}</b>
              <span>{g.blurb}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button className="primary" disabled={searching} onClick={() => emit("find", { game, name })}>
            {searching ? "Searching for an opponent…" : "Find opponent"}
          </button>
          {searching && <button onClick={leave}>Cancel</button>}
          <button onClick={() => emit("create", { game, name })}>Create room</button>
        </div>
        <div className="row">
          <input placeholder="Room code" value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Room code" />
          <button disabled={code.length !== 4} onClick={() => emit("join", { code, name })}>Join with code</button>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
      </section>
    </main>
  );
}
