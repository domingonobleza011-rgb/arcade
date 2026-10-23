# Arcade

Realtime multiplayer games (Tic-tac-toe, Quiz battle, Drawing board, Arena shooter) with room codes,
random matchmaking, live chat and emotes. Next.js + a custom Socket.IO server.

    npm install
    npm run dev        # http://localhost:3000 (open two tabs to test)

## Deploy (Render / Railway / Fly, NOT Vercel)
Vercel serverless can't hold WebSocket connections. Use any Node host:
- Build command: `npm install && npm run build`
- Start command: `npm start`
It reads the PORT env var. Room state is in memory, so run a single instance.

## Add a game
1. Add its id to `MAX` in `server.js` and handle its events there.
2. Add a component in `components/games.js` and register it in `components/Room.js` and the lobby list.
