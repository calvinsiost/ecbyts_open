// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   CONSTELLATION LAYOUTS STORE — lógica PURA (sem IO, sem Supabase)
   KEY-FIRST-001 F2 (SPEC_KEY_FIRST_DATA_LOCALITY §4-F2): o layout da
   constelação é CONFIG VISUAL DO MODELO do usuário — vive na chave ECBT
   (model.constellation.layouts[]), não numa tabela na nuvem. Este módulo
   é a única lógica de lista/registro; persistence.ts só faz IO
   (localStorage cache) e o export/import da chave lê/grava daqui.
   ================================================================ */

export interface ConstellationLayoutRecord {
    id: string;
    name: string;
    layout_type: string;
    node_positions: Record<string, { x: number; y: number }>;
    view_state: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

/** Gera id local estável (não é uuid de banco — a fonte é a chave ECBT). PURO. */
export function newLayoutId(now: number, rand: number): string {
    return `lyr_${now.toString(36)}_${Math.floor(Math.abs(rand) * 0xffff).toString(36).padStart(3, '0')}`;
}

/** Normaliza um registro vindo de fora (chave importada, localStorage legado)
 *  para o shape canônico. Tolera campos ausentes; descarta o que não for
 *  objeto. Retorna null se o mínimo (id ou posições) não existir. PURO. */
export function normalizeLayout(raw: any, { id = '', now = '' }: { id?: string; now?: string } = {}): ConstellationLayoutRecord | null {
    if (!raw || typeof raw !== 'object') return null;
    const stamp = typeof raw.updated_at === 'string' && raw.updated_at ? raw.updated_at
        : typeof raw.savedAt === 'string' && raw.savedAt ? raw.savedAt
            : now || new Date(0).toISOString();
    const rid = typeof raw.id === 'string' && raw.id ? raw.id : id;
    if (!rid) return null;
    return {
        id: rid,
        name: typeof raw.name === 'string' && raw.name ? raw.name : 'Layout',
        layout_type: typeof raw.layout_type === 'string' && raw.layout_type ? raw.layout_type
            : typeof raw.layoutType === 'string' && raw.layoutType ? raw.layoutType : 'manual',
        node_positions: raw.node_positions && typeof raw.node_positions === 'object' ? raw.node_positions
            : raw.nodePositions && typeof raw.nodePositions === 'object' ? raw.nodePositions : {},
        view_state: raw.view_state && typeof raw.view_state === 'object' ? raw.view_state
            : raw.viewState && typeof raw.viewState === 'object' ? raw.viewState : {},
        created_at: typeof raw.created_at === 'string' && raw.created_at ? raw.created_at : stamp,
        updated_at: stamp,
    };
}

/** Upsert por id: layoutId presente atualiza (preserva created_at, novo
 *  updated_at), ausente cria. Retorna NOVA lista (imutável). PURO. */
export function upsertLayout(
    list: ReadonlyArray<ConstellationLayoutRecord>,
    entry: { id?: string | null; name?: string; layoutType?: string; nodePositions?: any; viewState?: any },
    { now, genId }: { now: string; genId: () => string },
): { list: ConstellationLayoutRecord[]; id: string } {
    const base = Array.isArray(list) ? list : [];
    if (entry.id) {
        const idx = base.findIndex((l) => l.id === entry.id);
        if (idx >= 0) {
            const prev = base[idx];
            const next: ConstellationLayoutRecord = {
                ...prev,
                name: entry.name || prev.name,
                layout_type: entry.layoutType || prev.layout_type,
                node_positions: entry.nodePositions && typeof entry.nodePositions === 'object' ? entry.nodePositions : prev.node_positions,
                view_state: entry.viewState && typeof entry.viewState === 'object' ? entry.viewState : prev.view_state,
                updated_at: now,
            };
            return { list: base.map((l, i) => (i === idx ? next : l)), id: prev.id };
        }
    }
    const rec: ConstellationLayoutRecord = {
        id: entry.id || genId(),
        name: entry.name || 'Layout',
        layout_type: entry.layoutType || 'manual',
        node_positions: entry.nodePositions && typeof entry.nodePositions === 'object' ? entry.nodePositions : {},
        view_state: entry.viewState && typeof entry.viewState === 'object' ? entry.viewState : {},
        created_at: now,
        updated_at: now,
    };
    return { list: [...base, rec], id: rec.id };
}

/** Resumo para listagens (mesmo shape que o Supabase devolvia: id, name,
 *  layout_type, created_at — ordenado por updated_at desc). PURO. */
export function summarizeLayouts(list: ReadonlyArray<ConstellationLayoutRecord>) {
    return [...(Array.isArray(list) ? list : [])]
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .map((l) => ({ id: l.id, name: l.name, layout_type: l.layout_type, created_at: l.created_at }));
}

/** Payload da chave ECBT: model.constellation = {version, layouts[]}. PURO. */
export function toKeyPayload(list: ReadonlyArray<ConstellationLayoutRecord>) {
    return { version: 1, layouts: Array.isArray(list) ? [...list] : [] };
}

/** Parse do payload da chave (forward-compat: ausente/velho → lista vazia;
 *  registros malformados são descartados, nunca quebram o import). PURO. */
export function fromKeyPayload(data: any, { now = '' }: { now?: string } = {}): ConstellationLayoutRecord[] {
    const rawList = Array.isArray(data?.layouts) ? data.layouts : [];
    const out: ConstellationLayoutRecord[] = [];
    for (const raw of rawList) {
        const rec = normalizeLayout(raw, { now });
        if (rec) out.push(rec);
    }
    return out;
}
