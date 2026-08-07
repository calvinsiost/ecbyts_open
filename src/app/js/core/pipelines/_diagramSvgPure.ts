// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   NATIVE-PIPELINE-DIAGRAM-001 F2 — Renderizador SVG nativo. Pure-logic.

   Constrói o markup SVG do diagrama do pipeline a partir do modelo
   { nodes, edges, startNodeId }, usando o layout (_diagramLayoutPure). Substitui
   o canvas bpmn-js (CDN + marca d'água) por SVG próprio, sem intermediário e
   SEM marca d'água. Esta parte é PURA (string SVG) → cheap-testável sem browser;
   o mount no DOM é uma casca fina no pipelineEditor.

   Sem emojis. Rótulos escapados (anti-XSS). Determinístico; sem DOM/rede.
   ================================================================ */

import { layoutPipeline, type DiagramNodeInput, type DiagramEdgeInput, type LayoutOptions } from './_diagramLayoutPure.js';

export interface Lane {
    readonly y: number;
    readonly h: number;
    readonly label?: string;
}
/** Grupo (fase do processo) — coluna vertical rotulada (Detecção, Caracterização…). */
export interface Group {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly label?: string;
}
export type PositionedNode = DiagramNodeInput & {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    color?: string; // cor REAL do .vpp (obedece a referência)
};
export interface PipelineModel {
    readonly nodes?: ReadonlyArray<PositionedNode>;
    readonly edges?: ReadonlyArray<DiagramEdgeInput>;
    readonly startNodeId?: string | null;
    /** Swim lanes (atores) p/ render FIEL quando o modelo vem com posições originais. */
    readonly lanes?: ReadonlyArray<Lane>;
    /** Grupos (fases) — colunas verticais que cruzam as raias. */
    readonly groups?: ReadonlyArray<Group>;
}

export type PipelineDiagramRenderTheme = 'app-dark' | 'reference-light';
type PipelineDiagramSvgOptions = LayoutOptions & {
    readonly renderTheme?: PipelineDiagramRenderTheme;
};

const POSITIONED_THEMES: Record<
    PipelineDiagramRenderTheme,
    {
        readonly background: string;
        readonly laneFillEven: string;
        readonly laneFillOdd: string;
        readonly laneStroke: string;
        readonly laneLabelFill: string;
        readonly laneLabelText: string;
        readonly groupStroke: string;
        readonly groupHeaderFill: string;
        readonly groupText: string;
        readonly edgeStroke: string;
        readonly markerFill: string;
        readonly nodeStroke: string;
        readonly selectedStroke: string;
        readonly textFill: string;
    }
> = {
    'app-dark': {
        background: '#0b1220',
        laneFillEven: '#0b1220',
        laneFillOdd: '#0d1526',
        laneStroke: '#1e293b',
        laneLabelFill: '#111c33',
        laneLabelText: '#94a3b8',
        groupStroke: '#475569',
        groupHeaderFill: '#1e293b',
        groupText: '#cbd5e1',
        edgeStroke: '#64748b',
        markerFill: '#94a3b8',
        nodeStroke: '#7c4a1e',
        selectedStroke: '#0ea5e9',
        textFill: '#1e293b',
    },
    'reference-light': {
        background: '#c8c8c8',
        laneFillEven: '#eeeeee',
        laneFillOdd: '#e3e3e3',
        laneStroke: '#b8b8b8',
        laneLabelFill: '#f5f5f5',
        laneLabelText: '#4b5563',
        groupStroke: '#a8a8a8',
        groupHeaderFill: '#f2f2f2',
        groupText: '#374151',
        edgeStroke: '#a6a6a6',
        markerFill: '#a6a6a6',
        nodeStroke: '#2f6fca',
        selectedStroke: '#0f766e',
        textFill: '#111827',
    },
};

/** Cor por tipo de nó (coerente com CAT_META do editor). */
const NODE_COLORS: Record<string, string> = {
    trigger: '#22c55e',
    action: '#3b82f6',
    condition: '#f59e0b',
    delay: '#a855f7',
    api_call: '#06b6d4',
    end: '#ef4444',
    data_store: '#64748b', // depósito de dados (BPDataStore) — cinza ardósia
};

function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) => {
        switch (c) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            default:
                return '&#39;';
        }
    });
}

function truncate(s: string, max = 22): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Render FIEL: usa as posições originais (x/y/w/h por nó) + swim lanes. É o que
 * reproduz o diagrama do .vpp como desenhado (vs o auto-layout amontoado).
 */
type Rect = { x: number; y: number; w: number; h: number };

const CORNER_R = 8; // raio do arredondamento dos cantos (0 = canto vivo)

/** Constrói um caminho ORTOGONAL (segmentos H/V) por uma lista de vértices,
 *  arredondando levemente os cantos. Estilo "L"/Manhattan (ângulos retos). */
function orthoPath(pts: Array<[number, number]>): string {
    if (pts.length < 2) return '';
    const f = (n: number) => n.toFixed(1);
    const first = pts[0];
    if (!first) return '';
    let d = `M${f(first[0])},${f(first[1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
        const prev = pts[i - 1];
        const current = pts[i];
        const next = pts[i + 1];
        if (!prev || !current || !next) continue;
        const [px, py] = prev;
        const [cx, cy] = current;
        const [nx, ny] = next;
        const inLen = Math.hypot(cx - px, cy - py);
        const outLen = Math.hypot(nx - cx, ny - cy);
        const r = Math.min(CORNER_R, inLen / 2, outLen / 2);
        const i1x = cx - Math.sign(cx - px) * r;
        const i1y = cy - Math.sign(cy - py) * r;
        const o1x = cx + Math.sign(nx - cx) * r;
        const o1y = cy + Math.sign(ny - cy) * r;
        d += ` L${f(i1x)},${f(i1y)} Q${f(cx)},${f(cy)} ${f(o1x)},${f(o1y)}`;
    }
    const last = pts[pts.length - 1];
    if (!last) return d;
    d += ` L${f(last[0])},${f(last[1])}`;
    return d;
}

/**
 * Caminho ORTOGONAL ("L"/Manhattan) de um conector entre dois retângulos,
 * escolhendo o lado de SAÍDA e ENTRADA conforme a direção dominante. Segmentos
 * só horizontais/verticais com cantos retos (levemente arredondados).
 */
function pointPath(pts: ReadonlyArray<readonly [number, number]>): string {
    if (pts.length < 2) return '';
    const f = (n: number) => n.toFixed(1);
    const first = pts[0];
    if (!first) return '';
    let d = `M${f(first[0])},${f(first[1])}`;
    for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        if (!p) continue;
        d += ` L${f(p[0])},${f(p[1])}`;
    }
    return d;
}

function edgePoints(edge: DiagramEdgeInput): ReadonlyArray<readonly [number, number]> | null {
    const raw = (edge as any).points;
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const pts = raw
        .map((p) => {
            if (Array.isArray(p)) return [Number(p[0]), Number(p[1])] as const;
            return [Number(p?.x), Number(p?.y)] as const;
        })
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    return pts.length >= 2 ? pts : null;
}

function positionedNodeShape(
    n: Required<PositionedNode>,
    color: string,
    stroke: string,
    strokeWidth: number,
    theme: (typeof POSITIONED_THEMES)[PipelineDiagramRenderTheme],
): string {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    const w = n.w ?? 150;
    const h = n.h ?? 40;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (n.type === 'condition') {
        return (
            `<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" ` +
            `fill="${color}" fill-opacity="0.92" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
        );
    }
    if (n.type === 'data_store') {
        const cap = Math.max(6, Math.min(16, h * 0.22));
        return (
            `<path d="M${x},${y + cap} C${x},${y - cap / 2} ${x + w},${y - cap / 2} ${x + w},${y + cap} ` +
            `L${x + w},${y + h - cap} C${x + w},${y + h + cap / 2} ${x},${y + h + cap / 2} ${x},${y + h - cap} Z" ` +
            `fill="${color}" fill-opacity="0.92" stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
            `<ellipse cx="${cx}" cy="${y + cap}" rx="${w / 2}" ry="${cap}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
            `<path d="M${x},${y + h - cap} C${x},${y + h + cap / 2} ${x + w},${y + h + cap / 2} ${x + w},${y + h - cap}" ` +
            `fill="none" stroke="${theme.nodeStroke}" stroke-width="1" stroke-opacity="0.55"/>`
        );
    }
    if (n.type === 'trigger' || n.type === 'end') {
        return (
            `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" ` +
            `fill="${color}" fill-opacity="0.92" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
        );
    }
    return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ` +
        `fill="${color}" fill-opacity="0.92" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
    );
}

function connectorPath(s: Rect, t: Rect): string {
    const scx = s.x + s.w / 2;
    const scy = s.y + s.h / 2;
    const tcx = t.x + t.w / 2;
    const tcy = t.y + t.h / 2;
    const dx = tcx - scx;
    const dy = tcy - scy;
    if (Math.abs(dx) >= Math.abs(dy)) {
        // HORIZONTAL dominante: sai pela lateral, dobra no meio (em X), entra pela lateral
        const x1 = dx >= 0 ? s.x + s.w : s.x;
        const x2 = dx >= 0 ? t.x : t.x + t.w;
        const y1 = scy;
        const y2 = tcy;
        const midX = (x1 + x2) / 2;
        return orthoPath([
            [x1, y1],
            [midX, y1],
            [midX, y2],
            [x2, y2],
        ]);
    }
    // VERTICAL dominante: sai por cima/baixo, dobra no meio (em Y), entra por cima/baixo
    const y1 = dy >= 0 ? s.y + s.h : s.y;
    const y2 = dy >= 0 ? t.y : t.y + t.h;
    const x1 = scx;
    const x2 = tcx;
    const midY = (y1 + y2) / 2;
    return orthoPath([
        [x1, y1],
        [x1, midY],
        [x2, midY],
        [x2, y2],
    ]);
}

function buildPositioned(
    model: PipelineModel,
    selectedId: string | null,
    renderTheme: PipelineDiagramRenderTheme = 'app-dark',
): string {
    const theme = POSITIONED_THEMES[renderTheme] ?? POSITIONED_THEMES['app-dark'];
    const nodes = (model.nodes ?? []) as Required<PositionedNode>[];
    const lanes = model.lanes ?? [];
    const groups = model.groups ?? [];
    const LANE_LABEL_W = 120;
    const GROUP_LABEL_H = 40; // faixa superior p/ rótulos das fases (grupos)
    const pos = new Map(nodes.map((n) => [n.id, n]));
    const W =
        Math.max(
            ...nodes.map((n) => (n.x ?? 0) + (n.w ?? 150)),
            ...groups.map((g) => g.x + g.w),
            100,
        ) + 60;
    const H =
        Math.max(
            ...lanes.map((l) => l.y + l.h),
            ...groups.map((g) => g.y + g.h),
            ...nodes.map((n) => (n.y ?? 0) + (n.h ?? 40)),
            100,
        ) + 20;
    const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-LANE_LABEL_W} ${-GROUP_LABEL_H} ${W + LANE_LABEL_W} ${H + GROUP_LABEL_H}" ` +
            `class="pipeline-diagram-svg" role="img" aria-label="Diagrama do pipeline (fiel)">`,
        `<defs><marker id="pl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
            `<path d="M0,0 L8,4 L0,8 Z" fill="${theme.markerFill}"/></marker></defs>`,
    ];
    if (renderTheme === 'reference-light') {
        parts.push(
            `<rect x="${-LANE_LABEL_W}" y="${-GROUP_LABEL_H}" width="${W + LANE_LABEL_W}" height="${H + GROUP_LABEL_H}" fill="${theme.background}"/>`,
        );
    }
    // faixas (atores) — bandas horizontais
    lanes.forEach((l, i) => {
        parts.push(
            `<rect class="pl-lane" x="0" y="${l.y}" width="${W}" height="${l.h}" ` +
                `fill="${i % 2 ? theme.laneFillOdd : theme.laneFillEven}" stroke="${theme.laneStroke}"/>`,
        );
        parts.push(
            `<rect x="${-LANE_LABEL_W}" y="${l.y}" width="${LANE_LABEL_W}" height="${l.h}" fill="${theme.laneLabelFill}" stroke="${theme.laneStroke}"/>`,
        );
        const cy = l.y + l.h / 2;
        parts.push(
            `<text x="${-LANE_LABEL_W / 2}" y="${cy}" text-anchor="middle" font-size="20" fill="${theme.laneLabelText}" ` +
                `transform="rotate(-90 ${-LANE_LABEL_W / 2} ${cy})">${esc(l.label ?? '')}</text>`,
        );
    });
    // grupos (fases) — colunas verticais com divisórias tracejadas + rótulo no topo
    groups.forEach((g) => {
        parts.push(
            `<rect class="pl-group" x="${g.x}" y="${-GROUP_LABEL_H}" width="${g.w}" height="${H + GROUP_LABEL_H}" ` +
                `fill="none" stroke="${theme.groupStroke}" stroke-width="1.5" stroke-dasharray="8 6"/>`,
        );
        parts.push(
            `<rect x="${g.x}" y="${-GROUP_LABEL_H}" width="${g.w}" height="${GROUP_LABEL_H}" fill="${theme.groupHeaderFill}"/>`,
        );
        parts.push(
            `<text x="${g.x + g.w / 2}" y="${-GROUP_LABEL_H / 2}" text-anchor="middle" dominant-baseline="middle" ` +
                `font-size="22" font-weight="600" fill="${theme.groupText}">${esc(g.label ?? '')}</text>`,
        );
    });
    // conectores — roteamento DIRECIONAL (sai/entra pelo lado que aponta ao alvo,
    // evitando laços feios quando o alvo está à esquerda/acima/abaixo)
    for (const e of model.edges ?? []) {
        const s = pos.get(e.from);
        const t = pos.get(e.to);
        if (!s || !t) continue;
        const storedPoints = edgePoints(e);
        const d = storedPoints
            ? pointPath(storedPoints)
            : connectorPath(
                  { x: s.x ?? 0, y: s.y ?? 0, w: s.w ?? 150, h: s.h ?? 40 },
                  { x: t.x ?? 0, y: t.y ?? 0, w: t.w ?? 150, h: t.h ?? 40 },
              );
        // associação de dados (kind 'data') = linha tracejada; fluxo de controle = sólida
        const dash = (e as any).kind === 'data' ? ' stroke-dasharray="5 4"' : '';
        parts.push(
            `<path class="pl-edge" d="${d}" fill="none" stroke="${theme.edgeStroke}" stroke-width="1.5"${dash} marker-end="url(#pl-arrow)"/>`,
        );
    }
    // nós (cor REAL do .vpp = obedece a referência; texto escuro p/ contraste no fill claro)
    for (const n of nodes) {
        const color = (n as any).color || NODE_COLORS[n.type as string] || NODE_COLORS.action;
        const sel = selectedId && n.id === selectedId;
        const w = n.w ?? 150;
        const h = n.h ?? 40;
        const stroke = sel ? theme.selectedStroke : theme.nodeStroke;
        const strokeWidth = sel ? 2.5 : 1;
        parts.push(`<g class="pl-node${sel ? ' pl-node--selected' : ''}" data-node-id="${esc(n.id)}">`);
        parts.push(positionedNodeShape(n, color, stroke, strokeWidth, theme));
        parts.push(
            `<text x="${(n.x ?? 0) + w / 2}" y="${(n.y ?? 0) + h / 2}" text-anchor="middle" ` +
                `dominant-baseline="middle" font-size="11" fill="${theme.textFill}">${esc(truncate(n.label, 24))}</text>`,
        );
        parts.push('</g>');
    }
    parts.push('</svg>');
    return parts.join('');
}

/**
 * Markup SVG completo do diagrama. `selectedId` destaca um nó. Se os nós trazem
 * posições originais (x/y) usa o render FIEL (+ faixas); senão, auto-layout.
 */
export function buildPipelineDiagramSvg(
    model: PipelineModel,
    opts: PipelineDiagramSvgOptions = {},
    selectedId: string | null = null,
): string {
    const nodes = model.nodes ?? [];
    const renderTheme = opts.renderTheme ?? 'app-dark';
    // render FIEL quando a MAIORIA dos nós tem posição original (≥60%); os sem
    // posição (ex.: nó sem shape no diagrama) caem em (0,0) por padrão.
    const withPos = nodes.filter(
        (n) => Number.isFinite((n as PositionedNode).x) && Number.isFinite((n as PositionedNode).y),
    ).length;
    if (nodes.length > 0 && withPos >= Math.ceil(nodes.length * 0.6))
        return buildPositioned(model, selectedId, renderTheme);
    const layout = layoutPipeline(model.nodes ?? [], model.edges ?? [], model.startNodeId ?? null, opts);
    const parts: string[] = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" ` +
            `class="pipeline-diagram-svg" role="img" aria-label="Diagrama do pipeline">`,
    );
    parts.push(
        `<defs><marker id="pl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
            `<path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8"/></marker></defs>`,
    );
    // conectores primeiro (ficam atrás dos nós)
    for (const e of layout.edges) {
        const [a, b] = e.points;
        if (!a || !b) continue;
        parts.push(
            `<path class="pl-edge" d="M${a[0]},${a[1]} C${a[0] + 32},${a[1]} ${b[0] - 32},${b[1]} ${b[0]},${b[1]}" ` +
                `fill="none" stroke="#94a3b8" stroke-width="2" marker-end="url(#pl-arrow)"/>`,
        );
    }
    // nós
    for (const n of layout.nodes) {
        const color = NODE_COLORS[n.type] ?? NODE_COLORS.action;
        const sel = selectedId && n.id === selectedId;
        parts.push(`<g class="pl-node${sel ? ' pl-node--selected' : ''}" data-node-id="${esc(n.id)}">`);
        parts.push(
            `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="8" ` +
                `fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="${sel ? 3 : 1.5}"/>`,
        );
        parts.push(
            `<text x="${n.x + n.width / 2}" y="${n.y + n.height / 2}" text-anchor="middle" ` +
                `dominant-baseline="middle" font-size="13" fill="#e2e8f0">${esc(truncate(n.label))}</text>`,
        );
        parts.push('</g>');
    }
    parts.push('</svg>');
    return parts.join('');
}
