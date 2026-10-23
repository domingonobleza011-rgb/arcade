import { io } from "socket.io-client";

let socket;
export const getSocket = () => (socket ||= io());
