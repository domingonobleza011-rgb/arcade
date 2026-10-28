"use client";
import { useEffect, useMemo, useState } from "react";
import { getSocket } from "../lib/socket";
import Room from "../components/Room";
import { GAMES, CATS, META } from "../components/registry";

export default function Home() {
  const [name, setName] = useState("");
  const [game, setGame] = useState("tictactoe");
  const [cat, setCat] = useState("All");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState(null);
  const [me, setMe] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try { setName(localStorage.getItem("arcade-name") || ""); } catch {}
  }, []);

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

  const emit = (ev, data) => {
    setError("");
    try { localStorage.setItem("arcade-name", name); } catch {}
    getSocket().emit(ev, data);
  };
  const leave = () => { getSocket().emit("leave"); setRoom(null); setSearching(false); };

  const list = useMemo(() => GAMES.filter((g) => cat === "All" || g.cat === cat), [cat]);
  const cur = META[game];

  if (room) return <main className="wrap"><Room room={room} me={me} onLeave={leave} /></main>;

  return (
    <main className="wrap">
      <div className="hero">
        <span className="brand-pill">🎮 {GAMES.length} games · realtime multiplayer · live chat</span>
        <h1>Play <span>together</span></h1>
        <p className="sub">Pick a game, then find an opponent or share a room code.</p>
      </div>

      <section className="panel">
        <div className="namebar">
          <label>
            Your name <input value={name} maxLength={16} placeholder="Guest" onChange={(e) => setName(e.target.value)} />
          </label>
        </div>

        <div className="chips" role="tablist" aria-label="Game categories">
          {CATS.map((c) => (
            <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        <div className="games">
          {list.map((g) => (
            <button key={g.id} className="gcard" style={{ "--a": g.a }} aria-pressed={game === g.id} onClick={() => setGame(g.id)}>
              <span className="ic" aria-hidden>{g.icon}</span>
              <b>{g.name}</b>
              <span className="d">{g.blurb}</span>
              <span className={`tag ${g.isNew ? "new" : ""}`}>{g.isNew ? "NEW" : g.players}</span>
            </button>
          ))}
        </div>

        <div className="picked">
          <span className="ic" aria-hidden>{cur.icon}</span>
          <div><b>{cur.name}</b> <span className="meta">· {cur.players} players</span></div>
        </div>

        <div className="row">
          <button className="primary" disabled={searching} onClick={() => emit("find", { game, name })}>
            {searching ? "Searching for an opponent…" : game === "chat" ? "Join public lobby" : "Find opponent"}
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
