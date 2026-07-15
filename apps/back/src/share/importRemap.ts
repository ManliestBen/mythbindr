import mongoose from 'mongoose';
import { deriveBodyText } from '../elements/bodyText';

export interface ImportedElementSrc {
  id?: unknown;
  type?: unknown;
  name?: unknown;
  body?: unknown;
  tags?: unknown;
  links?: unknown;
  data?: unknown;
  playerVisible?: unknown;
  secrets?: unknown;
}

/**
 * Build the idMap + remapped element docs for a campaign import. Pure aside
 * from minting new ObjectIds. Pre-assigns new ids so cross-element links and
 * @mentions can be remapped, then walks each element's body/links swapping
 * old id strings for the new ones. Callers still need to filter `srcElements`
 * by known ELEMENT_TYPES and spread `campaignId`/`updatedBy` onto each doc
 * before inserting.
 */
export function remapImportedElements(srcElements: ImportedElementSrc[]): {
  idMap: Map<string, mongoose.Types.ObjectId>;
  docs: Array<Record<string, unknown>>;
} {
  const idMap = new Map<string, mongoose.Types.ObjectId>();
  for (const e of srcElements) {
    if (typeof e.id === 'string') idMap.set(e.id, new mongoose.Types.ObjectId());
  }
  const remapIds = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(remapIds);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = typeof v === 'string' && idMap.has(v) ? String(idMap.get(v)) : remapIds(v);
      }
      return out;
    }
    return node;
  };

  const docs = srcElements.map((e) => {
    const body = remapIds(e.body);
    const links = Array.isArray(e.links)
      ? (e.links as { targetId?: string; relType?: string; source?: string }[])
          .filter((l) => l.targetId && idMap.has(l.targetId))
          .map((l) => ({
            targetId: idMap.get(l.targetId as string),
            relType: String(l.relType ?? ''),
            source: l.source === 'mention' ? 'mention' : 'relationship',
          }))
      : [];
    return {
      _id: typeof e.id === 'string' ? idMap.get(e.id) : new mongoose.Types.ObjectId(),
      type: e.type,
      name: String(e.name).slice(0, 200),
      body,
      bodyText: deriveBodyText(body),
      tags: Array.isArray(e.tags) ? e.tags : [],
      links,
      data: e.data && typeof e.data === 'object' ? e.data : {},
      playerVisible: Boolean(e.playerVisible),
      secrets: String(e.secrets ?? ''),
    };
  });

  return { idMap, docs };
}
