// Single source of truth for the lobby cards and room titles.
export const CATS = ["All", "Board", "Arcade", "Brain", "Social"];

export const GAMES = [
  { id: "tictactoe", name: "Tic-tac-toe", icon: "⭕", cat: "Board", a: "#ff6b6b", players: "2", blurb: "Classic three in a row." },
  { id: "connect4", name: "Connect Four", icon: "🔴", cat: "Board", a: "#ffd23f", players: "2", blurb: "Drop discs and connect four." },
  { id: "checkers", name: "Checkers", icon: "♟️", cat: "Board", a: "#c0763c", players: "2", blurb: "Kings, multi-jumps, forced captures." },
  { id: "reversi", name: "Reversi", icon: "⚫", cat: "Board", a: "#3ddc97", players: "2", blurb: "Flank your opponent and flip their discs. New!", isNew: true },
  { id: "gomoku", name: "Gomoku", icon: "⚪", cat: "Board", a: "#e8c07a", players: "2", blurb: "Get five in a row on a 15×15 grid. New!", isNew: true },
  { id: "battleship", name: "Battleship", icon: "🚢", cat: "Board", a: "#4cc9f0", players: "2", blurb: "Hunt the hidden fleet before it hunts you. New!", isNew: true },
  { id: "dots", name: "Dots & Boxes", icon: "🔲", cat: "Board", a: "#b388ff", players: "2", blurb: "Close boxes, earn bonus turns. New!", isNew: true },
  { id: "snake", name: "Snake Duel", icon: "🐍", cat: "Arcade", a: "#3ddc97", players: "2", blurb: "Realtime snake. Last one alive wins. New!", isNew: true },
  { id: "pong", name: "Neon Pong", icon: "🏓", cat: "Arcade", a: "#4cc9f0", players: "2", blurb: "First to 7 with ever-faster rallies. New!", isNew: true },
  { id: "tanks", name: "Tank Battle", icon: "🪖", cat: "Arcade", a: "#9bbf4d", players: "2", blurb: "Bouncing shells, first to 3 rounds. Mobile ready!", isNew: true },
  { id: "shooter", name: "Arena shooter", icon: "🔫", cat: "Arcade", a: "#ff6b6b", players: "2–8", blurb: "Top-down free-for-all to 10 frags. Mobile ready!" },
  { id: "chess", name: "Chess", icon: "♟️", cat: "Board", a: "#e8c07a", players: "2", blurb: "Classic chess. Checkmate to win. New!", isNew: true },
  { id: "snakesladders", name: "Snakes & Ladders", icon: "🪜", cat: "Board", a: "#3ddc97", players: "2", blurb: "Roll the dice, climb ladders, dodge snakes. New!", isNew: true },
  { id: "fighter", name: "Pixel Fighter", icon: "🥊", cat: "Arcade", a: "#ff6b6b", players: "2", blurb: "Side-view brawler. Punch, kick, KO. New!", isNew: true },
  { id: "maze", name: "Maze Chase", icon: "🌀", cat: "Arcade", a: "#b388ff", players: "2", blurb: "One hunts, one flees. Swap roles each round. New!", isNew: true },
  { id: "pongshow", name: "Pong Showdown", icon: "⚡", cat: "Arcade", a: "#ffd23f", players: "2", blurb: "High-speed pong, first to 11. New!", isNew: true },
  { id: "racing", name: "Mini Racing", icon: "🏎️", cat: "Arcade", a: "#4cc9f0", players: "2", blurb: "Top-down dual race. First to 3 laps. New!", isNew: true },
  { id: "quickdraw", name: "Quick Draw", icon: "🤠", cat: "Arcade", a: "#ff9f1c", players: "2", blurb: "Wait for it… then fire first. New!", isNew: true },
  { id: "rps", name: "Rock Paper Scissors", icon: "✊", cat: "Arcade", a: "#ff9f1c", players: "2", blurb: "First to 3 wins." },
  { id: "memory", name: "Memory Match", icon: "🧠", cat: "Brain", a: "#f78fb3", players: "2", blurb: "Flip cards, find pairs." },
  { id: "hangman", name: "Hangman", icon: "🔤", cat: "Brain", a: "#ffd23f", players: "2", blurb: "Race to solve the word. Redesigned!", isNew: true },
  { id: "quiz", name: "Quiz battle", icon: "❓", cat: "Brain", a: "#b388ff", players: "2", blurb: "5 questions, fastest answer scores double." },
  { id: "scramble", name: "Word Scramble", icon: "🔀", cat: "Brain", a: "#4cc9f0", players: "2", blurb: "Unscramble the word before your rival. New!", isNew: true },
  { id: "mathrace", name: "Math Race", icon: "➗", cat: "Brain", a: "#3ddc97", players: "2", blurb: "Mental maths sprint, first correct answer wins. New!", isNew: true },
  { id: "draw", name: "Drawing board", icon: "🎨", cat: "Social", a: "#ff6b6b", players: "2–8", blurb: "Sketch together in real time." },
  { id: "pictionary", name: "Draw & guess", icon: "🖌️", cat: "Social", a: "#ffd23f", players: "2–8", blurb: "Draw the secret word, others guess in chat." },
  { id: "chat", name: "Chat room", icon: "💬", cat: "Social", a: "#8fa6c4", players: "up to 30", blurb: "Public lobby or private room." },
];

export const TITLES = Object.fromEntries(GAMES.map((g) => [g.id, g.name]));
export const META = Object.fromEntries(GAMES.map((g) => [g.id, g]));
