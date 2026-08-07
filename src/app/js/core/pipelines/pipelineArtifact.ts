// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE → CHAVE ECBT — kind portável 'pipeline' (Calvin 2026-06-15).

   Permite exportar/importar um pipeline ({ nodes, edges, startNodeId }) como
   uma chave .ecbt portável, reusando o registry kind-aware de portableArtifacts
   (encodeKey/decodeKey). Atende ao objetivo "reproduzir um diagrama BPMN e
   exportar como chave ECBT": o pipeline (vindo de import BPMN ou desenhado no
   editor nativo) vira uma chave ECBT assinada.

   Parte pura (validate/toArtifact/fromArtifact) → cheap-testável. O encode/decode
   da chave em si é runtime (encoder/decoder via portableArtifacts).
   ================================================================ */

import { registerKind } from '../io/portableArtifacts.js';

export const PIPELINE_ARTIFACT_KIND = 'pipeline';
const SCHEMA_VERSION = 1;

export interface PipelineArtifact {
    name: string;
    nodes: Array<{
        id: string;
        type: string;
        label: string;
        action?: string;
        x?: number;
        y?: number;
        w?: number;
        h?: number;
        color?: string;
        lane?: string;
        phase?: string;
        contextLabel?: string;
        targetModule?: string;
        moduleInputParams?: Record<string, unknown>;
    }>;
    edges: Array<{ from: string; to: string; label?: string; kind?: string }>;
    startNodeId: string | null;
    /** Swim lanes (atores) — preservadas p/ render FIEL do diagrama. */
    lanes?: Array<{ y: number; h: number; label?: string }>;
    /** Grupos (fases) — colunas verticais preservadas p/ render FIEL. */
    groups?: Array<{ x: number; y: number; w: number; h: number; label?: string }>;
}

// ----------------------------------------------------------------
// HANDLER UNIFICADO — o kind 'pipeline' aceita DUAS formas (despacho por forma),
// resolvendo a colisão histórica entre dois registros do mesmo kind:
//   - NATIVA:  { nodes[], edges[], startNodeId, lanes? } — diagrama fiel (este módulo)
//   - LEGADA:  { id, name, xml }                          — BPMN serializado (pipelinePortable)
// Antes, registerKind era last-wins e a importação dependia da ordem de load.
// Agora o handler único trata ambas; pipelinePortable delega para cá.
// ----------------------------------------------------------------

/** Tem xml BPMN não-vazio (roteamento to/fromArtifact da forma legada). */
function _hasXml(o: any): boolean {
    return !!o && typeof o === 'object' && typeof o.xml === 'string' && o.xml.trim() !== '';
}
/** Forma legada COMPLETA (id+name+xml) — usada na validação (espelha _isPipelineShape). */
function _isLegacyXmlShape(o: any): boolean {
    return (
        !!o && typeof o === 'object'
        && typeof o.id === 'string' && o.id.trim() !== ''
        && typeof o.name === 'string' && o.name.trim() !== ''
        && _hasXml(o)
    );
}
/** Validação da forma legada (BPMN xml) — espelha o handler portável legado. */
function _validateLegacyXml(p: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const trimmed = String(p.xml).trim();
    if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<bpmn:') && !trimmed.startsWith('<definitions')) {
        errors.push('xml: não parece BPMN válido (esperado <?xml ou <bpmn: ou <definitions)');
    }
    if (String(p.xml).length > 1_000_000) errors.push('xml: excede 1 MB (limite de segurança)');
    if (String(p.name).length > 200) errors.push('name: excede 200 caracteres');
    return { valid: errors.length === 0, errors };
}
/** Normaliza a forma legada (preserva id/xml/provenance, trunca name). */
function _legacyToArtifact(o: any): any {
    const art: any = {
        id: String(o.id || ''),
        name: String(o.name || '').slice(0, 200),
        xml: String(o.xml || ''),
        updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
    };
    if (typeof o.authorId === 'string') art.authorId = o.authorId;
    if (typeof o.marketplaceAssetId === 'string') art.marketplaceAssetId = o.marketplaceAssetId;
    return art;
}
/** Reconstrói a forma legada (gera id se ausente, marca importedFrom). */
function _legacyFromArtifact(a: any): any {
    const out: any = {
        id: typeof a.id === 'string' && a.id ? a.id : `imported-pipe-${Date.now()}`,
        name: String(a.name || 'Pipeline importado').slice(0, 200),
        xml: String(a.xml || ''),
        updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : '',
        importedFrom: a.marketplaceAssetId ? 'library' : 'file',
    };
    if (typeof a.authorId === 'string') out.authorId = a.authorId;
    if (typeof a.marketplaceAssetId === 'string') out.marketplaceAssetId = a.marketplaceAssetId;
    return out;
}

const MOJIBAKE_SEQUENCE_RE = /(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2[\u0080-\u00bf]|\ufffd)/;

function _repairText(value: any): string {
    const text = String(value ?? '');
    if (!MOJIBAKE_SEQUENCE_RE.test(text)) return text;
    try {
        const bytes = Uint8Array.from(Array.from(text), (char) => char.charCodeAt(0) & 0xff);
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        return decoded && !decoded.includes('\ufffd') ? decoded : text;
    } catch {
        return text;
    }
}

function _hasGeometry(node: any): boolean {
    return ['x', 'y', 'w', 'h'].some((key) => Number.isFinite(node?.[key]));
}

function _edgeRefs(edges: any[]): Set<string> {
    const refs = new Set<string>();
    for (const edge of edges) {
        if (edge?.from != null || edge?.source != null) refs.add(String(edge.from ?? edge.source));
        if (edge?.to != null || edge?.target != null) refs.add(String(edge.to ?? edge.target));
    }
    return refs;
}

function _dropDetachedDuplicateNodes(nodes: any[], edges: any[]): any[] {
    const refs = _edgeRefs(edges);
    return nodes.filter((node, index) => {
        if (!node || refs.has(String(node.id)) || _hasGeometry(node)) return true;
        const key = `${String(node.type ?? 'action')}|${_repairText(node.label ?? node.id)}`;
        return !nodes.some((other, otherIndex) => (
            otherIndex !== index
            && refs.has(String(other?.id))
            && `${String(other?.type ?? 'action')}|${_repairText(other?.label ?? other?.id)}` === key
        ));
    });
}

function _normalizeLanes(lanes: any[]): Array<{ y: number; h: number; label?: string }> {
    return lanes.map((l: any) => ({
        y: Number(l.y) || 0,
        h: Number(l.h) || 0,
        ...(l.label != null ? { label: _repairText(l.label) } : {}),
    }));
}

function _normalizeGroups(groups: any[]): Array<{ x: number; y: number; w: number; h: number; label?: string }> {
    return groups.map((g: any) => ({
        x: Number(g.x) || 0,
        y: Number(g.y) || 0,
        w: Number(g.w) || 0,
        h: Number(g.h) || 0,
        ...(g.label != null ? { label: _repairText(g.label) } : {}),
    }));
}

function _rangeLabel(value: number, ranges: any[], startKey: 'x' | 'y', sizeKey: 'w' | 'h'): string | undefined {
    const found = ranges.find((range) => Number.isFinite(value) && value >= range[startKey] && value <= range[startKey] + range[sizeKey]);
    return found?.label ? String(found.label) : undefined;
}

function _nodeContext(node: any, lanes: any[], groups: any[]): { lane?: string; phase?: string } {
    const x = Number(node.x);
    const y = Number(node.y);
    const w = Number(node.w) || 0;
    const h = Number(node.h) || 0;
    return {
        lane: _repairText(node.lane ?? _rangeLabel(y + h / 2, lanes, 'y', 'h') ?? ''),
        phase: _repairText(node.phase ?? _rangeLabel(x + w / 2, groups, 'x', 'w') ?? ''),
    };
}

function _labelCounts(nodes: any[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const node of nodes) {
        const label = _repairText(node?.label ?? node?.id);
        counts.set(label, (counts.get(label) || 0) + 1);
    }
    return counts;
}

function _neighborLabel(node: any, nodes: any[], edges: any[]): string {
    const byId = new Map(nodes.map((entry) => [String(entry?.id), entry]));
    const edge = edges.find((item) => String(item?.from ?? item?.source) === String(node?.id) || String(item?.to ?? item?.target) === String(node?.id));
    if (!edge) return '';
    const otherId = String(edge.from ?? edge.source) === String(node?.id) ? String(edge.to ?? edge.target) : String(edge.from ?? edge.source);
    const other = byId.get(otherId);
    return other ? _repairText(other.label ?? other.id) : '';
}

function _contextKeys(nodes: any[], edges: any[], lanes: any[], groups: any[]): string[] {
    return nodes.map((node) => {
        const label = _repairText(node?.label ?? node?.id);
        const context = _nodeContext(node, lanes, groups);
        const neighbor = _neighborLabel(node, nodes, edges);
        return [label, context.phase || '', context.lane || '', neighbor].join('|');
    });
}

function _countValues(values: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
}

function _normalizeModuleInputParams(value: any): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
        const key = _repairText(rawKey).trim();
        if (!key) continue;
        out[key] = typeof rawValue === 'string' ? _repairText(rawValue) : rawValue;
    }
    return Object.keys(out).length ? out : undefined;
}

/** Valida o payload de pipeline (despacha: forma legada xml OU forma nativa). */
export function validatePipelineArtifact(payload: unknown): { valid: boolean; errors: string[] } {
    const p = payload as any;
    if (!p || typeof p !== 'object') {
        return { valid: false, errors: ['payload não é objeto'] };
    }
    // Forma LEGADA (BPMN xml) — só quando NÃO há nós nativos.
    if (_isLegacyXmlShape(p) && !Array.isArray(p.nodes)) {
        return _validateLegacyXml(p);
    }
    // Forma NATIVA ({ nodes, edges }).
    const errors: string[] = [];
    if (!Array.isArray(p.nodes)) errors.push('nodes deve ser array');
    if (!Array.isArray(p.edges)) errors.push('edges deve ser array');
    if (Array.isArray(p.nodes) && p.nodes.some((n: any) => !n || n.id === undefined || n.id === null)) {
        errors.push('todo nó precisa de id');
    }
    return { valid: errors.length === 0, errors };
}

/** Normaliza o pipeline para o formato portável (despacha legado xml / nativo). */
export function pipelineToArtifact(payload: unknown): any {
    const p = payload as any;
    if (_hasXml(p) && !Array.isArray(p?.nodes)) {
        return _legacyToArtifact(p);
    }
    const edges = Array.isArray(p?.edges) ? p.edges : [];
    const nodes = _dropDetachedDuplicateNodes(Array.isArray(p?.nodes) ? p.nodes : [], edges);
    const lanes = Array.isArray(p?.lanes) && p.lanes.length ? _normalizeLanes(p.lanes) : [];
    const groups = Array.isArray(p?.groups) && p.groups.length ? _normalizeGroups(p.groups) : [];
    const counts = _labelCounts(nodes);
    const contextKeys = _contextKeys(nodes, edges, lanes, groups);
    const contextTotals = _countValues(contextKeys);
    const contextSeen = new Map<string, number>();
    return {
        name: _repairText(p?.name ?? ''),
        startNodeId: p?.startNodeId != null ? String(p.startNodeId) : null,
        nodes: nodes.map((n: any, index: number) => {
            const label = _repairText(n.label ?? n.id);
            const context = _nodeContext(n, lanes, groups);
            const node: PipelineArtifact['nodes'][number] = {
                id: String(n.id),
                type: String(n.type ?? 'action'),
                label,
            };
            if (n.action != null) node.action = _repairText(n.action);
            if (context.lane) node.lane = context.lane;
            if (context.phase) node.phase = context.phase;
            if (typeof n.contextLabel === 'string' && n.contextLabel.trim()) {
                node.contextLabel = _repairText(n.contextLabel.trim());
            }
            if (typeof n.targetModule === 'string' && n.targetModule.trim()) {
                node.targetModule = _repairText(n.targetModule.trim());
            }
            const moduleInputParams = _normalizeModuleInputParams(n.moduleInputParams);
            if (moduleInputParams) node.moduleInputParams = moduleInputParams;
            if ((counts.get(label) || 0) > 1 && context.lane && context.phase && !node.contextLabel) {
                const neighbor = _neighborLabel(n, nodes, edges);
                const key = contextKeys[index] || '';
                const seen = (contextSeen.get(key) || 0) + 1;
                contextSeen.set(key, seen);
                const total = contextTotals.get(key) || 0;
                const sequence = total > 1 ? ` — item ${seen} de ${total}` : '';
                node.contextLabel = `${label} — ${context.phase} / ${context.lane}${sequence}${neighbor ? ` — ligado a ${neighbor}` : ''}`;
            }
            // preserva posição original (render FIEL) quando presente
            for (const k of ['x', 'y', 'w', 'h'] as const) {
                if (Number.isFinite(n[k])) node[k] = Number(n[k]);
            }
            if (typeof n.color === 'string' && n.color) node.color = n.color; // cor REAL do .vpp
            return node;
        }),
        edges: edges.map((e: any) => {
            const edge: PipelineArtifact['edges'][number] = {
                from: String(e.from ?? e.source),
                to: String(e.to ?? e.target),
            };
            if (e.label != null) edge.label = _repairText(e.label);
            if (e.kind != null) edge.kind = String(e.kind); // 'data' = associação de dados (tracejada)
            return edge;
        }),
        ...(lanes.length ? { lanes } : {}),
        ...(groups.length ? { groups } : {}),
    };
}

/** Reconstrói o pipeline a partir do artefato decodificado (despacha por forma). */
export function pipelineFromArtifact(artifact: unknown): any {
    const a = artifact as any;
    if (_hasXml(a) && !Array.isArray(a?.nodes)) {
        return _legacyFromArtifact(a);
    }
    return pipelineToArtifact(a);
}

let _registered = false;
/** Registra o kind 'pipeline' no registry portável (idempotente). */
export function registerPipelineArtifactKind(): void {
    if (_registered) return;
    registerKind({
        kind: PIPELINE_ARTIFACT_KIND,
        schemaVersion: SCHEMA_VERSION,
        validate: validatePipelineArtifact,
        toArtifact: pipelineToArtifact,
        fromArtifact: pipelineFromArtifact,
        // grava o pipeline importado no registry → aparece na lista + render fiel no editor.
        // Despacha por forma: nativo {nodes} grava model; legado {xml} grava xml.
        applyImport: async (obj: unknown) => {
            try {
                const reg: any = await import('./registry.js');
                const o = obj as any;
                if (o && Array.isArray(o.nodes)) {
                    const model = pipelineToArtifact(o);
                    reg.savePipeline({
                        name: model.name || 'Pipeline importado',
                        xml: '',
                        model: {
                            nodes: model.nodes,
                            edges: model.edges,
                            startNodeId: model.startNodeId,
                            ...(model.lanes ? { lanes: model.lanes } : {}),
                            ...(model.groups ? { groups: model.groups } : {}),
                        },
                    });
                    return true;
                }
                if (_hasXml(o)) {
                    const saved = reg.savePipeline(_legacyFromArtifact(o));
                    return !!saved?.id;
                }
                return false;
            } catch {
                return false;
            }
        },
    });
    _registered = true;
}
