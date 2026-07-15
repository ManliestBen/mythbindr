import { describe, expect, it } from 'vitest';
import { remapImportedElements, type ImportedElementSrc } from './importRemap';

describe('remapImportedElements', () => {
  it('round-trips two cross-linked elements: fresh ids, no old id strings survive, links/mentions point at the new ids', () => {
    const elementA: ImportedElementSrc = {
      id: 'old-a',
      type: 'npc',
      name: 'Alice',
      body: {
        type: 'doc',
        content: [
          {
            type: 'mention',
            attrs: { id: 'old-b', label: 'Bob' },
          },
        ],
      },
      tags: ['ally'],
      links: [{ targetId: 'old-b', relType: 'knows', source: 'mention' }],
      data: {},
      playerVisible: true,
      secrets: '',
    };
    const elementB: ImportedElementSrc = {
      id: 'old-b',
      type: 'npc',
      name: 'Bob',
      body: { type: 'doc', content: [] },
      tags: [],
      links: [],
      data: {},
      playerVisible: false,
      secrets: 'hidden agenda',
    };

    const { idMap, docs } = remapImportedElements([elementA, elementB]);

    // Both got fresh ObjectIds distinct from the old string ids.
    expect(idMap.get('old-a')).toBeDefined();
    expect(idMap.get('old-b')).toBeDefined();
    const newIdA = String(idMap.get('old-a'));
    const newIdB = String(idMap.get('old-b'));

    // No old id string appears anywhere in the output docs.
    const serialized = JSON.stringify(docs);
    expect(serialized).not.toContain('old-a');
    expect(serialized).not.toContain('old-b');

    const [docA, docB] = docs;
    expect(String(docA._id)).toBe(newIdA);
    expect(String(docB._id)).toBe(newIdB);

    // A's body mention id === B's new id (as string).
    const mentionNode = (docA.body as { content: { attrs: { id: string } }[] }).content[0];
    expect(mentionNode.attrs.id).toBe(newIdB);

    // A's links[0].targetId equals B's new ObjectId.
    const links = docA.links as { targetId: unknown }[];
    expect(String(links[0].targetId)).toBe(newIdB);
  });

  it('drops a link whose target id is not part of the import', () => {
    const elementA: ImportedElementSrc = {
      id: 'old-a',
      type: 'npc',
      name: 'Alice',
      body: { type: 'doc', content: [] },
      links: [{ targetId: 'not-in-import', relType: 'knows', source: 'relationship' }],
    };
    const { docs } = remapImportedElements([elementA]);
    expect(docs[0].links).toEqual([]);
  });

  it('gives an element with no id field a doc with a fresh _id', () => {
    const elementNoId: ImportedElementSrc = {
      type: 'npc',
      name: 'Nameless',
      body: { type: 'doc', content: [] },
    };
    const { docs } = remapImportedElements([elementNoId]);
    expect(docs[0]._id).toBeDefined();
  });

  it('truncates names longer than 200 chars to 200', () => {
    const longName = 'x'.repeat(250);
    const element: ImportedElementSrc = {
      id: 'old-a',
      type: 'npc',
      name: longName,
      body: { type: 'doc', content: [] },
    };
    const { docs } = remapImportedElements([element]);
    expect((docs[0].name as string).length).toBe(200);
  });

  it('defaults source to relationship when not mention', () => {
    const elementA: ImportedElementSrc = {
      id: 'old-a',
      type: 'npc',
      name: 'Alice',
      body: { type: 'doc', content: [] },
      links: [{ targetId: 'old-b' }],
    };
    const elementB: ImportedElementSrc = { id: 'old-b', type: 'npc', name: 'Bob' };
    const { docs } = remapImportedElements([elementA, elementB]);
    const links = docs[0].links as { source: string }[];
    expect(links[0].source).toBe('relationship');
  });
});
