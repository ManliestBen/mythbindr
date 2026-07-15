import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useElements, type ElementT } from '../data/elements';
import { segmentForType } from '../data/elementTypes';
import Skeleton from '../components/Skeleton';

/**
 * Relationship map: every element is a node, every link (@mention or typed
 * relationship) an edge. A tiny built-in force layout — no chart deps — is
 * plenty at campaign scale, and seeing the web often reveals orphaned prep.
 */

const TYPE_COLOR: Record<string, string> = {
  npc: '#C9A24B',
  location: '#34D399',
  encounter: '#F87171',
  item: '#60A5FA',
  quest: '#A78BFA',
  faction: '#FB923C',
  pc: '#22D3EE',
  note: '#9CA3AF',
};

interface Node {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  degree: number;
}

const W = 900;
const H = 620;

function layout(elements: ElementT[]): { nodes: Node[]; edges: [number, number][] } {
  const idx = new Map(elements.map((e, i) => [e.id, i]));
  const nodes: Node[] = elements.map((e, i) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    // Deterministic ring start so the sim converges the same way each render.
    x: W / 2 + Math.cos((i / Math.max(elements.length, 1)) * 2 * Math.PI) * 220,
    y: H / 2 + Math.sin((i / Math.max(elements.length, 1)) * 2 * Math.PI) * 200,
    degree: 0,
  }));
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    const a = idx.get(e.id);
    if (a === undefined) continue;
    for (const l of e.links) {
      const b = idx.get(l.targetId);
      if (b === undefined || a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
      nodes[a].degree++;
      nodes[b].degree++;
    }
  }

  // Force sim: pairwise repulsion, spring on edges, mild centering.
  for (let it = 0; it < 180; it++) {
    const fx = new Array(nodes.length).fill(0);
    const fy = new Array(nodes.length).fill(0);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[i].x - nodes[j].x;
        let dy = nodes[i].y - nodes[j].y;
        const d2 = Math.max(dx * dx + dy * dy, 25);
        const f = 5200 / d2;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        fx[i] += dx * f;
        fy[i] += dy * f;
        fx[j] -= dx * f;
        fy[j] -= dy * f;
      }
    }
    for (const [a, b] of edges) {
      const dx = nodes[b].x - nodes[a].x;
      const dy = nodes[b].y - nodes[a].y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const f = (d - 110) * 0.02;
      fx[a] += (dx / d) * f;
      fy[a] += (dy / d) * f;
      fx[b] -= (dx / d) * f;
      fy[b] -= (dy / d) * f;
    }
    const cool = 1 - it / 180;
    for (let i = 0; i < nodes.length; i++) {
      fx[i] += (W / 2 - nodes[i].x) * 0.005;
      fy[i] += (H / 2 - nodes[i].y) * 0.005;
      nodes[i].x += Math.max(Math.min(fx[i], 18), -18) * cool;
      nodes[i].y += Math.max(Math.min(fy[i], 18), -18) * cool;
      nodes[i].x = Math.max(30, Math.min(W - 30, nodes[i].x));
      nodes[i].y = Math.max(24, Math.min(H - 24, nodes[i].y));
    }
  }
  return { nodes, edges };
}

export default function CampaignMap() {
  const { cid } = useParams();
  const navigate = useNavigate();
  const { data: elements, isLoading } = useElements(cid ?? '', {});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);

  const graph = useMemo(() => {
    const visible = (elements ?? []).filter((e) => !hidden.has(e.type));
    return layout(visible);
  }, [elements, hidden]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <Skeleton rows={4} />
      </div>
    );
  }

  const types = Array.from(new Set((elements ?? []).map((e) => e.type)));
  const hoverIdx = graph.nodes.findIndex((n) => n.id === hover);
  const neighbor = new Set<number>();
  if (hoverIdx >= 0) {
    for (const [a, b] of graph.edges) {
      if (a === hoverIdx) neighbor.add(b);
      if (b === hoverIdx) neighbor.add(a);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">Relationship map</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Every @mention and relationship, drawn as a web. Click a node to open it —
        lonely nodes are prep the players haven&rsquo;t met yet.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() =>
              setHidden((cur) => {
                const next = new Set(cur);
                if (next.has(t)) next.delete(t);
                else next.add(t);
                return next;
              })
            }
            className={[
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
              hidden.has(t)
                ? 'border-app-border text-fg-muted opacity-50'
                : 'border-app-border text-fg',
            ].join(' ')}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: TYPE_COLOR[t] ?? '#888' }}
            />
            {t}
          </button>
        ))}
      </div>

      {graph.nodes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-app-border p-10 text-center text-sm text-fg-muted">
          Nothing to map yet — create some elements and @mention them from each other.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-app-border bg-app-surface">
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label="Element relationship graph">
            {graph.edges.map(([a, b], i) => {
              const dim = hoverIdx >= 0 && a !== hoverIdx && b !== hoverIdx;
              return (
                <line
                  key={i}
                  x1={graph.nodes[a].x}
                  y1={graph.nodes[a].y}
                  x2={graph.nodes[b].x}
                  y2={graph.nodes[b].y}
                  stroke="currentColor"
                  className="text-fg-muted"
                  strokeOpacity={dim ? 0.08 : 0.3}
                />
              );
            })}
            {graph.nodes.map((n, i) => {
              const dim = hoverIdx >= 0 && i !== hoverIdx && !neighbor.has(i);
              const r = 6 + Math.min(n.degree, 6);
              const seg = segmentForType(n.type);
              return (
                <g
                  key={n.id}
                  opacity={dim ? 0.25 : 1}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => seg && navigate(`/campaigns/${cid}/${seg}/${n.id}`)}
                  className="cursor-pointer"
                >
                  <circle cx={n.x} cy={n.y} r={r} fill={TYPE_COLOR[n.type] ?? '#888'} />
                  <text
                    x={n.x}
                    y={n.y - r - 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill="currentColor"
                    className="select-none text-fg"
                  >
                    {n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
