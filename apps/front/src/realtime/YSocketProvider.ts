import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import type { Socket } from 'socket.io-client';

/* eslint-disable @typescript-eslint/no-explicit-any */

function toU8(d: unknown): Uint8Array {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array((d as ArrayBufferView).buffer);
  return new Uint8Array(0);
}

/**
 * Minimal Yjs provider over the shared Socket.IO connection. Relays doc updates
 * and awareness for one element room. CollaborationCaret reads `.awareness`.
 */
export class YSocketProvider {
  awareness: Awareness;
  private destroyed = false;

  constructor(
    private socket: Socket,
    private elementId: string,
    private doc: Y.Doc,
    awareness: Awareness,
    private onSeed?: (seedFrom: unknown) => void,
  ) {
    this.awareness = awareness;
    this.join = this.join.bind(this);
    this.onDocUpdate = this.onDocUpdate.bind(this);
    this.onAwarenessUpdate = this.onAwarenessUpdate.bind(this);
    this.onInit = this.onInit.bind(this);
    this.onRemoteUpdate = this.onRemoteUpdate.bind(this);
    this.onRemoteAwareness = this.onRemoteAwareness.bind(this);

    doc.on('update', this.onDocUpdate);
    awareness.on('update', this.onAwarenessUpdate);
    socket.on('yjs:init', this.onInit);
    socket.on('yjs:update', this.onRemoteUpdate);
    socket.on('yjs:awareness', this.onRemoteAwareness);
    socket.on('connect', this.join);
    if (socket.connected) this.join();
  }

  private join() {
    this.socket.emit('yjs:join', { elementId: this.elementId });
  }

  private onDocUpdate(update: Uint8Array, origin: unknown) {
    if (origin === this) return; // applied from remote
    this.socket.emit('yjs:update', { elementId: this.elementId, update });
  }

  private onAwarenessUpdate(
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) {
    if (origin === 'remote') return;
    const changed = [...added, ...updated, ...removed];
    this.socket.emit('yjs:awareness', {
      elementId: this.elementId,
      update: encodeAwarenessUpdate(this.awareness, changed),
    });
  }

  private onInit({ elementId, state, seedFrom }: any) {
    if (elementId !== this.elementId) return;
    Y.applyUpdate(this.doc, toU8(state), this);
    if (seedFrom != null) this.onSeed?.(seedFrom);
  }

  private onRemoteUpdate({ elementId, update }: any) {
    if (elementId !== this.elementId) return;
    Y.applyUpdate(this.doc, toU8(update), this);
  }

  private onRemoteAwareness({ elementId, update }: any) {
    if (elementId !== this.elementId) return;
    applyAwarenessUpdate(this.awareness, toU8(update), 'remote');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    this.socket.emit('yjs:leave', { elementId: this.elementId });
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    this.socket.off('yjs:init', this.onInit);
    this.socket.off('yjs:update', this.onRemoteUpdate);
    this.socket.off('yjs:awareness', this.onRemoteAwareness);
    this.socket.off('connect', this.join);
  }
}
