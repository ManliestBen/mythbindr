import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { mentionSuggestion } from './mentionSuggestion';

/**
 * Rich-text body editor (ProseMirror JSON). Supports @mention cross-linking to
 * other elements in the same campaign. Mounts with `value` once; the caller only
 * renders it after the element has loaded, so no reactive content sync is needed.
 */
export default function RichTextEditor({
  value,
  onChange,
  campaignId,
}: {
  value: unknown;
  onChange: (json: unknown) => void;
  campaignId: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: mentionSuggestion(campaignId),
      }),
    ],
    content: (value as never) ?? '',
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  return (
    <div className="tiptap-editor mt-1 rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm focus-within:border-brand">
      <EditorContent editor={editor} />
      <p className="mt-1 text-[10px] text-fg-muted">Type @ to link another element.</p>
    </div>
  );
}
