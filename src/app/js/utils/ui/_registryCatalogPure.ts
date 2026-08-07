// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_REGISTRY_CATALOG (claude - novaspec, 2026-06-02) — pure-logic Fase 1.
 *
 * Abstração transversal P0 que desbloqueia FC-01 (analytics) + FC-03 (solvers)
 * + FC-04 (recognition) via adaptadores finos ao invés de 3 catálogos
 * duplicados (GitClear 2025: AI gera 8× mais duplicação).
 *
 * Contrato canônico:
 *   - RegistryEntry: shape único que qualquer registry pode mapear via adapter
 *   - buildCatalog(entries): índice Map<group, RegistryEntry[]>
 *   - searchCatalog(index, query, group?): O(1) lookup + filtro textual
 *
 * Pure-logic 100% — sem DOM, sem IDB, sem rede. Testável em node.
 * Componente UI (registryCatalog.ts) é consumidor visual.
 *
 * Refs:
 *   - SPEC `docs/specs/frontier/SPEC_REGISTRY_CATALOG.md`
 *   - FORCE11 Nine Best Practices (arXiv 2012.13117) — metadados legíveis
 *   - Codebase-map M2.5 (reuse catalog)
 */

// =============================================================================
// Contrato canônico (RF1)
// =============================================================================

/**
 * Entrada normalizada de qualquer registry. Adaptador converte shape
 * heterogênea (ModuleMeta, SolverSpec, RecognitionStrategy, ...) para esta.
 *
 * Campos:
 *   - id: identificador único dentro do catálogo
 *   - label: rótulo curto exibido na lista (humanizado, i18n já aplicado)
 *   - group: faceta de filtro (família/categoria/tipo) — pode ser empty string
 *   - meta: metadata livre (descrição, autor, versão, parâmetros, etc.)
 *           — caller renderiza conforme convenção do registry
 *   - ref:  procedência citável OPCIONAL (DOI/norma/URL) — FORCE11 best practice
 */
export interface RegistryEntry {
    readonly id: string;
    readonly label: string;
    readonly group: string;
    readonly meta: Readonly<Record<string, unknown>>;
    readonly ref?: string;
}

/**
 * Adapter contract: registry → RegistryEntry[]. Pure function.
 * Cada feature implementa um adaptador trivial (~30 LOC):
 *   const analyticsAdapter: RegistryAdapter<any[]> = (modules) =>
 *       modules.map(m => ({ id: m.id, label: m.name, group: m.category,
 *                            meta: { description: m.description },
 *                            ref: m.doi }));
 */
export type RegistryAdapter<TRegistry> = (registry: TRegistry) => RegistryEntry[];

/**
 * Índice retornado por buildCatalog. Map<group, entries>. O(1) lookup.
 * Inclui também __all_ids__ para listing completo sem group filter.
 */
export interface CatalogIndex {
    readonly byGroup: ReadonlyMap<string, ReadonlyArray<RegistryEntry>>;
    readonly all: ReadonlyArray<RegistryEntry>;
    readonly groups: ReadonlyArray<string>;
    readonly idMap: ReadonlyMap<string, RegistryEntry>;
}

// =============================================================================
// Validação de entrada
// =============================================================================

export interface ValidationError {
    readonly index: number;
    readonly id: string | null;
    readonly reason: string;
}

/**
 * Valida shape antes de indexar. Pure. Não throw — retorna erros.
 * Caller decide se aborta ou filtra duplicatas.
 */
export function validateEntries(entries: ReadonlyArray<unknown>): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!Array.isArray(entries)) {
        errors.push({ index: -1, id: null, reason: 'entries_not_array' });
        return errors;
    }
    const seenIds = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i] as any;
        if (!e || typeof e !== 'object') {
            errors.push({ index: i, id: null, reason: 'entry_not_object' });
            continue;
        }
        if (typeof e.id !== 'string' || e.id.length === 0) {
            errors.push({ index: i, id: null, reason: 'missing_id' });
            continue;
        }
        if (seenIds.has(e.id)) {
            errors.push({ index: i, id: e.id, reason: 'duplicate_id' });
            continue;
        }
        seenIds.add(e.id);
        if (typeof e.label !== 'string') {
            errors.push({ index: i, id: e.id, reason: 'missing_label' });
        }
        if (typeof e.group !== 'string') {
            errors.push({ index: i, id: e.id, reason: 'missing_group' });
        }
        if (!e.meta || typeof e.meta !== 'object') {
            errors.push({ index: i, id: e.id, reason: 'missing_meta' });
        }
        if (e.ref !== undefined && typeof e.ref !== 'string') {
            errors.push({ index: i, id: e.id, reason: 'invalid_ref_type' });
        }
    }
    return errors;
}

// =============================================================================
// buildCatalog (RF3)
// =============================================================================

/**
 * Constrói índice a partir de RegistryEntry[]. Pure, O(n).
 *
 * Tolerante a entries inválidas — pula com erro em validation list (caller
 * pode logar). Para fail-fast, chamar validateEntries antes.
 *
 * @example
 *   const index = buildCatalog([
 *     { id: 'm1', label: 'Mann-Kendall', group: 'trend', meta: {} },
 *     { id: 'm2', label: 'Theil-Sen',   group: 'trend', meta: {} },
 *     { id: 'g1', label: 'Kriging',     group: 'geostat', meta: {} },
 *   ]);
 *   index.byGroup.get('trend')  // [Mann-Kendall, Theil-Sen]
 *   index.groups               // ['trend', 'geostat']
 *   index.all.length           // 3
 *   index.idMap.get('m1')      // Mann-Kendall entry
 */
export function buildCatalog(entries: ReadonlyArray<RegistryEntry>): CatalogIndex {
    if (!Array.isArray(entries)) {
        return Object.freeze({
            byGroup: new Map(),
            all: Object.freeze([]),
            groups: Object.freeze([]),
            idMap: new Map(),
        });
    }
    const byGroup = new Map<string, RegistryEntry[]>();
    const idMap = new Map<string, RegistryEntry>();
    const all: RegistryEntry[] = [];
    const groupsOrder: string[] = [];
    for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        if (typeof e.id !== 'string' || e.id.length === 0) continue;
        if (idMap.has(e.id)) continue; // skip duplicate (não corrompe índice)
        const frozenEntry = Object.freeze({
            ...e,
            meta: Object.freeze({ ...(e.meta || {}) }),
        });
        idMap.set(e.id, frozenEntry);
        all.push(frozenEntry);
        const group = typeof e.group === 'string' ? e.group : '';
        if (!byGroup.has(group)) {
            byGroup.set(group, []);
            groupsOrder.push(group);
        }
        byGroup.get(group)!.push(frozenEntry);
    }
    // Freeze sub-arrays para invariante (consumidor não muta)
    const frozenByGroup = new Map<string, ReadonlyArray<RegistryEntry>>();
    for (const [g, items] of byGroup) {
        frozenByGroup.set(g, Object.freeze(items.slice()));
    }
    return Object.freeze({
        byGroup: frozenByGroup,
        all: Object.freeze(all),
        groups: Object.freeze(groupsOrder.slice()),
        idMap,
    });
}

// =============================================================================
// searchCatalog
// =============================================================================

export interface SearchOptions {
    /** Filtro por group exato. undefined = todos os grupos */
    readonly group?: string;
    /** Caso true, busca em meta.description também (default true) */
    readonly searchDescription?: boolean;
    /** Limite de resultados (default ilimitado) */
    readonly limit?: number;
}

/**
 * Busca entries por query textual. Pure, O(n) no escopo filtrado.
 *
 * Match heurístico:
 *   - query vazio + group definido → retorna tudo do group (O(1) via byGroup)
 *   - query vazio + sem group → retorna all (O(1))
 *   - query não-vazio → substring case-insensitive em label, id, group,
 *     e meta.description (se string e searchDescription=true)
 *
 * @example
 *   searchCatalog(index, 'mann')              // matches Mann-Kendall
 *   searchCatalog(index, '', { group: 'trend' })  // todos do group
 *   searchCatalog(index, 'krig', { limit: 5 }) // top 5 com "krig"
 */
export function searchCatalog(
    index: CatalogIndex,
    query: string,
    options?: SearchOptions,
): ReadonlyArray<RegistryEntry> {
    if (!index) return [];
    const scope: ReadonlyArray<RegistryEntry> = options?.group
        ? index.byGroup.get(options.group) || []
        : index.all;
    const q = (query || '').trim().toLowerCase();
    const searchDesc = options?.searchDescription !== false;
    let matched: RegistryEntry[];
    if (q.length === 0) {
        matched = scope.slice();
    }
    else {
        matched = [];
        for (const entry of scope) {
            if (_entryMatches(entry, q, searchDesc)) {
                matched.push(entry);
            }
        }
    }
    if (typeof options?.limit === 'number' && options.limit > 0 && matched.length > options.limit) {
        matched = matched.slice(0, options.limit);
    }
    return Object.freeze(matched);
}

/**
 * Match heurístico interno. Não exportado — caller usa searchCatalog.
 */
function _entryMatches(entry: RegistryEntry, q: string, searchDesc: boolean): boolean {
    if (entry.label.toLowerCase().includes(q)) return true;
    if (entry.id.toLowerCase().includes(q)) return true;
    if (entry.group.toLowerCase().includes(q)) return true;
    if (searchDesc && entry.meta) {
        const desc = (entry.meta as any).description;
        if (typeof desc === 'string' && desc.toLowerCase().includes(q)) return true;
    }
    return false;
}

// =============================================================================
// CSV export helper (pure formatting)
// =============================================================================

/**
 * Converte RegistryEntry[] para linhas CSV. Pure. Caller passa para
 * csvExport (utils/helpers) para download blob.
 *
 * Header fixo: id, label, group, ref, meta_json
 * meta_json serializa meta completo (string para preservar arrays/objects).
 *
 * Citações RFC 4180: campos com vírgula/aspa/newline são envoltos em
 * aspas, aspas internas duplicadas.
 */
export function buildCsvRows(entries: ReadonlyArray<RegistryEntry>): string[] {
    const rows: string[] = [];
    rows.push('id,label,group,ref,meta_json');
    if (!Array.isArray(entries)) return rows;
    for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        const cells = [
            _csvCell(e.id),
            _csvCell(e.label),
            _csvCell(e.group),
            _csvCell(e.ref || ''),
            _csvCell(_safeJsonStringify(e.meta || {})),
        ];
        rows.push(cells.join(','));
    }
    return rows;
}

function _csvCell(value: string): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function _safeJsonStringify(obj: unknown): string {
    try {
        return JSON.stringify(obj);
    }
    catch {
        return '{}';
    }
}
