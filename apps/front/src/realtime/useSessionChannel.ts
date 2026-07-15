import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionStatePayload } from '@mythbindr/shared';
import { qk } from '../lib/queryKeys';
import { getSocket } from './socket';
import type { GameSessionT } from '../data/session';

/**
 * Join a game session's realtime room. Every `session:state` broadcast is
 * written into the React Query cache (same key `useSession` reads), and
 * `onRemoteState` fires so the page can decide whether to adopt it into
 * local editing state (see RunSession's guard).
 */
export function useSessionChannel(
  cid: string | undefined,
  sessionId: string | undefined,
  onRemoteState: (s: GameSessionT, seq: number) => void,
): void {
  const qc = useQueryClient();
  const cb = useRef(onRemoteState);
  cb.current = onRemoteState;

  useEffect(() => {
    if (!cid || !sessionId) return;
    const socket = getSocket();
    const onState = (p: SessionStatePayload) => {
      if (p.sessionId !== sessionId) return;
      const s = p.session as unknown as GameSessionT;
      qc.setQueryData(qk.session(cid), s);
      cb.current(s, p.seq);
    };
    const join = () => socket.emit('session:join', { sessionId });
    socket.on('session:state', onState);
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.emit('session:leave', { sessionId });
      socket.off('session:state', onState);
      socket.off('connect', join);
    };
  }, [cid, sessionId, qc]);
}
