# Arcade

Realtime multiplayer games with room codes, random matchmaking, live chat and emotes.
Next.js + a custom Socket.IO server.
Realtime games are touch-ready: on-screen sticks/buttons, and a fullscreen landscape layout when a phone is turned sideways.

**Games (27):** Chess · Snakes & Ladders · Pixel Fighter · Maze Chase · Pong Showdown · Mini Racing · Tic-tac-toe · Connect Four · Checkers · Reversi · Gomoku · Battleship · Dots & Boxes · Snake Duel · Neon Pong · Tank Battle · Arena shooter · Quick Draw · Rock Paper Scissors · Memory Match · Hangman · Quiz battle · Word Scramble · Math Race · Drawing board · Draw & guess (2–8 players) · Chat rooms

```bash
npm install
npm run dev        # http://localhost:3000 (open two tabs to test)
```

## Deploy (Render / Railway / Fly, NOT Vercel)
Vercel serverless can't hold WebSocket connections. Use any Node host:
- Build command: `npm install && npm run build`
- Start command: `npm start`
It reads the PORT env var. Room state is in memory, so run a single instance.

## Add a game
1. Server: add its id to `MAX` in `server.js`. For turn-based or realtime games, add a `{ start, view, done, snap? }` entry in `games-extra.js` / `games-more.js` and its socket events in `register()`.
2. Client: add a component (`components/games.js` or `components/games2.js`), register it in `components/Room.js`, and add a card to `components/registry.js` (this drives the lobby and room titles).
