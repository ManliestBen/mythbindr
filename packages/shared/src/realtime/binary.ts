/**
 * Normalize a Socket.IO binary payload (Buffer / ArrayBuffer / typed-array view)
 * to a plain Uint8Array. Shared by the server (realtime/io) and the client
 * (YSocketProvider) so both decode Yjs/awareness updates identically.
 */
export function toU8(d: unknown): Uint8Array {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  return new Uint8Array(0);
}
