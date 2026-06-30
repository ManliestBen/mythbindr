import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Lazily-created shared Socket.IO connection (same origin → proxied to :4000 in dev). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', withCredentials: true });
  }
  return socket;
}
