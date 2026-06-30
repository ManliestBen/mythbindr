import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { getSocket } from '../realtime/socket';
import { YSocketProvider } from '../realtime/YSocketProvider';
import { mentionSuggestion } from './mentionSuggestion';

const COLORS = ['#C9A24B', '#7C4DEF', '#4C7CA8', '#C07F46', '#A78BFA', '#5B3FA0'];
function colorFor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Real-time collaborative body editor (Yjs CRDT + live carets). */
export default function CollaborativeEditor({
  elementId,
  campaignId,
  userName,
}: {
  elementId: string;
  campaignId: string;
  userName: string;
}) {
  const ydoc = useMemo(() => new Y.Doc(), [elementId]);
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);
  const [seedFrom, setSeedFrom] = useState<unknown>(undefined);
  const [seeded, setSeeded] = useState(false);

  const provider = useMemo(
    () => new YSocketProvider(getSocket(), elementId, ydoc, awareness, (s) => setSeedFrom(s)),
    [elementId, ydoc, awareness],
  );

  useEffect(() => () => {
    provider.destroy();
    awareness.destroy();
    ydoc.destroy();
  }, [provider, awareness, ydoc]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Mention.configure({
          HTMLAttributes: { class: 'mention' },
          suggestion: mentionSuggestion(campaignId),
        }),
        Collaboration.configure({ document: ydoc, field: 'default' }),
        CollaborationCaret.configure({ provider, user: { name: userName, color: colorFor(userName) } }),
      ],
    },
    [ydoc, provider],
  );

  // Seed the empty doc from a legacy body, exactly once (server picks the seeder).
  useEffect(() => {
    if (!editor || seeded || seedFrom == null) return;
    if (editor.isEmpty) {
      setSeeded(true);
      editor.commands.setContent(seedFrom as never);
    }
  }, [editor, seedFrom, seeded]);

  return (
    <div className="tiptap-editor mt-1 rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm focus-within:border-brand">
      <EditorContent editor={editor} />
      <p className="mt-1 text-[10px] text-fg-muted">
        Live co-editing · type @ to link another element.
      </p>
    </div>
  );
}
