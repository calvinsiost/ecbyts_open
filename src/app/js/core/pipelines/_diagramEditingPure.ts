// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE DIAGRAM EDITING PURE
   Helpers for native pipeline diagram editing: drag-safe node movement,
   lane/phase movement, palette application and deterministic auto-arrange.
   No DOM, no storage, no network.
   ================================================================ */

type AnyRecord = Record<string, unknown>;

export interface DiagramEditDelta {
    readonly dx?: number;
    readonly dy?: number;
}

export interface DiagramMoveOptions {
    readonly grid?: number;
    readonly minX?: number;
    readonly minY?: number;
    readonly cascadeNodes?: boolean;
}

export interface DiagramAutoArrangeOptions {
    readonly startX?: number;
    readonly startY?: number;
    readonly phaseWidth?: number;
    readonly laneHeight?: number;
    readonly nodeWidth?: number;
    readonly nodeHeight?: number;
    readonly gapX?: number;
    readonly gapY?: number;
    readonly grid?: number;
}

export const PIPELINE_DIAGRAM_PALETTES = Object.freeze({
    reference: Object.freeze({
        id: 'reference',
        label: 'Referência DD-38',
        colors: Object.freeze({
            trigger: '#c3f57a',
            action: '#ffc080',
            condition: '#ff992e',
            data_store: '#c0c000',
            delay: '#a855f7',
            api_call: '#06b6d4',
            end: '#f57a7a',
        }),
    }),
    calm: Object.freeze({
        id: 'calm',
        label: 'Leitura calma',
        colors: Object.freeze({
            trigger: '#86efac',
            action: '#93c5fd',
            condition: '#fbbf24',
            data_store: '#c4b5fd',
            delay: '#f0abfc',
            api_call: '#67e8f9',
            end: '#fca5a5',
        }),
    }),
    contrast: Object.freeze({
        id: 'contrast',
        label: 'Alto contraste',
        colors: Object.freeze({
            trigger: '#00ff99',
            action: '#ffffff',
            condition: '#ffd400',
            data_store: '#7dd3fc',
            delay: '#c084fc',
            api_call: '#22d3ee',
            end: '#ff4d6d',
        }),
    }),
});

function isRecord(value: unknown): value is AnyRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
    return String(value ?? '').trim();
}

function num(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function snap(value: number, grid = 1): number {
    const g = Math.max(1, Math.abs(grid || 1));
    return Math.round(value / g) * g;
}

function cloneModel<T>(model: T): T {
    return JSON.parse(JSON.stringify(model ?? {})) as T;
}

function matchLabel(value: unknown, target: unknown): boolean {
    return text(value).toLowerCase() === text(target).toLowerCase();
}

function getNodeId(node: unknown): string {
    return isRecord(node) ? text(node.id) : '';
}

function withMovedRect<T extends AnyRecord>(item: T, delta: DiagramEditDelta, options: DiagramMoveOptions = {}): T {
    const dx = num(delta.dx);
    const dy = num(delta.dy);
    const x = Math.max(num(options.minX), snap(num(item.x) + dx, options.grid));
    const y = Math.max(num(options.minY), snap(num(item.y) + dy, options.grid));
    return Object.freeze({ ...item, x, y }) as T;
}

export function normalizePipelinePaletteId(value: unknown): keyof typeof PIPELINE_DIAGRAM_PALETTES {
    const id = text(value) as keyof typeof PIPELINE_DIAGRAM_PALETTES;
    return PIPELINE_DIAGRAM_PALETTES[id] ? id : 'reference';
}

export function applyPipelinePalette(model: unknown, paletteId: unknown = 'reference'): AnyRecord {
    const out = cloneModel<AnyRecord>(isRecord(model) ? model : {});
    const palette = PIPELINE_DIAGRAM_PALETTES[normalizePipelinePaletteId(paletteId)];
    const colors = palette.colors as Readonly<Record<string, string>>;
    out.nodes = (Array.isArray(out.nodes) ? out.nodes : []).map((node) => {
        const record = isRecord(node) ? node : {};
        const type = text(record.type) || 'action';
        return Object.freeze({ ...record, color: colors[type] || colors.action });
    });
    out.diagramPalette = palette.id;
    return Object.freeze(out);
}

export function movePipelineNode(model: unknown, nodeId: unknown, delta: DiagramEditDelta, options: DiagramMoveOptions = {}): AnyRecord {
    const out = cloneModel<AnyRecord>(isRecord(model) ? model : {});
    const targetId = text(nodeId);
    out.nodes = (Array.isArray(out.nodes) ? out.nodes : []).map((node) => {
        if (!isRecord(node) || getNodeId(node) !== targetId) return node;
        return withMovedRect(node, delta, options);
    });
    return Object.freeze(out);
}

export function movePipelineGroup(model: unknown, groupLabelOrIndex: unknown, delta: DiagramEditDelta, options: DiagramMoveOptions = {}): AnyRecord {
    const out = cloneModel<AnyRecord>(isRecord(model) ? model : {});
    const target = text(groupLabelOrIndex);
    const index = Number(groupLabelOrIndex);
    const movedLabels = new Set<string>();
    out.groups = (Array.isArray(out.groups) ? out.groups : []).map((group, groupIndex) => {
        if (!isRecord(group)) return group;
        const hit = Number.isInteger(index) ? groupIndex === index : matchLabel(group.label, target);
        if (!hit) return group;
        movedLabels.add(text(group.label));
        return withMovedRect(group, delta, options);
    });
    if (options.cascadeNodes) {
        out.nodes = (Array.isArray(out.nodes) ? out.nodes : []).map((node) =>
            isRecord(node) && movedLabels.has(text(node.phase)) ? withMovedRect(node, delta, options) : node,
        );
    }
    return Object.freeze(out);
}

export function movePipelineLane(model: unknown, laneLabelOrIndex: unknown, delta: DiagramEditDelta, options: DiagramMoveOptions = {}): AnyRecord {
    const out = cloneModel<AnyRecord>(isRecord(model) ? model : {});
    const target = text(laneLabelOrIndex);
    const index = Number(laneLabelOrIndex);
    const movedLabels = new Set<string>();
    const laneDelta = { dx: 0, dy: num(delta.dy) };
    out.lanes = (Array.isArray(out.lanes) ? out.lanes : []).map((lane, laneIndex) => {
        if (!isRecord(lane)) return lane;
        const hit = Number.isInteger(index) ? laneIndex === index : matchLabel(lane.label, target);
        if (!hit) return lane;
        movedLabels.add(text(lane.label));
        return withMovedRect(lane, laneDelta, options);
    });
    if (options.cascadeNodes) {
        out.nodes = (Array.isArray(out.nodes) ? out.nodes : []).map((node) =>
            isRecord(node) && movedLabels.has(text(node.lane)) ? withMovedRect(node, laneDelta, options) : node,
        );
    }
    return Object.freeze(out);
}

function uniqueText(values: readonly unknown[], fallback: readonly string[]): readonly string[] {
    const out: string[] = [];
    for (const value of values) {
        const item = text(value);
        if (item && !out.includes(item)) out.push(item);
    }
    return Object.freeze(out.length ? out : [...fallback]);
}

export function autoArrangePipeline(model: unknown, options: DiagramAutoArrangeOptions = {}): AnyRecord {
    const out = cloneModel<AnyRecord>(isRecord(model) ? model : {});
    const nodes = Array.isArray(out.nodes) ? out.nodes.filter(isRecord) : [];
    const startX = options.startX ?? 120;
    const startY = options.startY ?? 80;
    const phaseWidth = options.phaseWidth ?? 360;
    const laneHeight = options.laneHeight ?? 130;
    const nodeWidth = options.nodeWidth ?? 118;
    const nodeHeight = options.nodeHeight ?? 34;
    const gapX = options.gapX ?? 34;
    const gapY = options.gapY ?? 32;
    const grid = options.grid ?? 10;
    const phases = uniqueText(
        [...(Array.isArray(out.groups) ? out.groups.map((g) => (isRecord(g) ? g.label : '')) : []), ...nodes.map((n) => n.phase)],
        ['Fluxo'],
    );
    const lanes = uniqueText(
        [...(Array.isArray(out.lanes) ? out.lanes.map((l) => (isRecord(l) ? l.label : '')) : []), ...nodes.map((n) => n.lane)],
        ['Atividades'],
    );
    const orderByCell = new Map<string, number>();
    out.lanes = lanes.map((label, index) => Object.freeze({ label, y: startY + index * laneHeight, h: laneHeight }));
    out.groups = phases.map((label, index) =>
        Object.freeze({ label, x: startX + index * phaseWidth, y: startY - 20, w: phaseWidth, h: lanes.length * laneHeight + 40 }),
    );
    out.nodes = nodes.map((node) => {
        const phaseIndex = Math.max(0, phases.indexOf(text(node.phase)));
        const laneIndex = Math.max(0, lanes.indexOf(text(node.lane)));
        const cellKey = `${phaseIndex}:${laneIndex}`;
        const order = orderByCell.get(cellKey) ?? 0;
        orderByCell.set(cellKey, order + 1);
        const isStart = text(node.id) === text(out.startNodeId) || text(node.type) === 'trigger';
        const isEnd = text(node.type) === 'end';
        const x = isStart ? startX - 100 : isEnd ? startX + phases.length * phaseWidth + 30 : startX + phaseIndex * phaseWidth + 24 + order * gapX;
        const y = startY + laneIndex * laneHeight + 18 + (order % 3) * gapY;
        return Object.freeze({ ...node, x: snap(x, grid), y: snap(y, grid), w: num(node.w, nodeWidth), h: num(node.h, nodeHeight) });
    });
    return Object.freeze(out);
}

export function summarizePipelineDiagramEditing(model: unknown): AnyRecord {
    const root = isRecord(model) ? model : {};
    const nodes = Array.isArray(root.nodes) ? root.nodes.filter(isRecord) : [];
    const edges = Array.isArray(root.edges) ? root.edges.filter(isRecord) : [];
    const lanes = Array.isArray(root.lanes) ? root.lanes.filter(isRecord) : [];
    const groups = Array.isArray(root.groups) ? root.groups.filter(isRecord) : [];
    const positioned = nodes.filter((node) => Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y))).length;
    const edgeEndpoints = new Set(nodes.map((node) => text(node.id)));
    const brokenEdges = edges.filter((edge) => !edgeEndpoints.has(text(edge.from)) || !edgeEndpoints.has(text(edge.to))).length;
    const recommendations = [
        positioned < nodes.length ? 'Ha blocos sem posicao manual; use Auto-organizar.' : '',
        !lanes.length ? 'Adicione raias para separar responsaveis.' : '',
        !groups.length ? 'Adicione fases para separar etapas do fluxo.' : '',
        brokenEdges ? 'Corrija conectores apontando para blocos inexistentes.' : '',
    ].filter(Boolean);
    return Object.freeze({
        nodeCount: nodes.length,
        edgeCount: edges.length,
        laneCount: lanes.length,
        groupCount: groups.length,
        positionedNodeCount: positioned,
        brokenEdgeCount: brokenEdges,
        editable: nodes.length > 0,
        recommendations: Object.freeze(recommendations),
    });
}
