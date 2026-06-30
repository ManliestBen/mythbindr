import { ReactRenderer } from '@tiptap/react';
import { apiGet } from '../lib/api';
import MentionList, { type MentionListHandle } from './MentionList';
import type { ElementT } from '../data/elements';

/**
 * TipTap mention suggestion config: searches the campaign's elements by name and
 * renders the autocomplete dropdown in a fixed-position popup at the caret.
 * Typed loosely (`any`) to avoid wrestling TipTap's suggestion generics.
 */
export function mentionSuggestion(campaignId: string): any {
  return {
    items: async ({ query }: { query: string }) => {
      try {
        const els = await apiGet<{ elements: ElementT[] }>(
          `/api/campaigns/${campaignId}/elements?q=${encodeURIComponent(query)}`,
        ).then((r) => r.elements);
        return els.slice(0, 8).map((e) => ({ id: e.id, label: e.name, type: e.type }));
      } catch {
        return [];
      }
    },
    render: () => {
      let component: ReactRenderer<MentionListHandle> | null = null;
      let wrapper: HTMLDivElement | null = null;
      const place = (rect: DOMRect | null | undefined) => {
        if (!wrapper || !rect) return;
        wrapper.style.left = `${rect.left}px`;
        wrapper.style.top = `${rect.bottom + 4}px`;
      };
      return {
        onStart: (props: any) => {
          component = new ReactRenderer(MentionList, { props, editor: props.editor });
          wrapper = document.createElement('div');
          wrapper.style.position = 'fixed';
          wrapper.style.zIndex = '50';
          wrapper.appendChild(component.element);
          document.body.appendChild(wrapper);
          place(props.clientRect?.());
        },
        onUpdate: (props: any) => {
          component?.updateProps(props);
          place(props.clientRect?.());
        },
        onKeyDown: (props: any) => {
          if (props.event.key === 'Escape') return true;
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          wrapper?.remove();
          wrapper = null;
          component?.destroy();
          component = null;
        },
      };
    },
  };
}
