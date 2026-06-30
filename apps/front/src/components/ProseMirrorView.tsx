import { type ReactNode } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Minimal read-only ProseMirror-JSON renderer (keeps the public share bundle lean — no TipTap). */
function renderNode(node: any, key: number): ReactNode {
  if (!node || typeof node !== 'object') return null;
  const children = Array.isArray(node.content)
    ? node.content.map((c: any, i: number) => renderNode(c, i))
    : null;
  switch (node.type) {
    case 'doc':
      return <div key={key}>{children}</div>;
    case 'paragraph':
      return <p key={key} className="mb-2">{children}</p>;
    case 'heading': {
      const level = Math.min(Number(node.attrs?.level) || 2, 6);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return (
        <Tag key={key} className="mb-2 font-heading font-bold">
          {children}
        </Tag>
      );
    }
    case 'bulletList':
      return <ul key={key} className="mb-2 list-disc pl-5">{children}</ul>;
    case 'orderedList':
      return <ol key={key} className="mb-2 list-decimal pl-5">{children}</ol>;
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'blockquote':
      return (
        <blockquote key={key} className="mb-2 border-l-2 border-app-border pl-3 text-fg-muted">
          {children}
        </blockquote>
      );
    case 'hardBreak':
      return <br key={key} />;
    case 'text':
      return <span key={key}>{node.text}</span>;
    default:
      return children ? <div key={key}>{children}</div> : null;
  }
}

export default function ProseMirrorView({ body }: { body: unknown }) {
  if (body == null) return null;
  if (typeof body === 'string') {
    return (
      <>
        {body.split('\n').map((line, i) => (
          <p key={i} className="mb-2">
            {line}
          </p>
        ))}
      </>
    );
  }
  return <div className="text-sm leading-relaxed">{renderNode(body, 0)}</div>;
}
