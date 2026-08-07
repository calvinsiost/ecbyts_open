// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// GEO-HUD-REORDER-001 :: pure-logic do reorder + visibility dos 5 cards do
// geo-hud (compass / globe / eis / cost / ecbt). Sem DOM/storage/timer.

/** IDs canônicos dos 6 cards do geo-hud, na ordem padrão (HTML index.html).
 *  HUD-CARDS-REDESIGN-001 M3 (Calvin 2026-06-10): 'violations-hud-canvas'
 *  adicionado como 6º slot. Default rows=5 ainda válido (último wrap).
 *
 *  BOOT-ENTRY-UX-001 RF-C3 (#16, 2026-07-10): ordem padrão mudou de
 *  [compass, globe, eis, cost, ecbt, violations] para KPIs-âncora primeiro
 *  (EIS → Custos → ECBT → Compliance) e navegação periférica depois
 *  (bússola/globo). ~80% da atenção fica na metade esquerda/topo (NN/G);
 *  o card mais crítico (compliance/custo) deve estar no topo do stack. */
export const DEFAULT_CARD_ORDER = Object.freeze([
    'eis-hud-canvas',
    'cost-hud-canvas',
    'ecbt-hud-canvas',
    'violations-hud-canvas',
    'compass-canvas',
    'globe-canvas',
] as const);

/**
 * BOOT-ENTRY-UX-001 RF-C3 (#16): ordem canônica pré-RF-C3, usada apenas
 * para detectar usuários existentes que ainda têm o default antigo e
 * migrá-los automaticamente para o novo default (sem afetar quem
 * customizou explicitamente). */
export const OLD_DEFAULT_ORDER_PRE_RF_C3 = Object.freeze([
    'compass-canvas',
    'globe-canvas',
    'eis-hud-canvas',
    'cost-hud-canvas',
    'ecbt-hud-canvas',
    'violations-hud-canvas',
] as const satisfies readonly GeoHudCardId[]);

/**
 * BOOT-ENTRY-UX-001 RF-C3 (#16): ordem recomendada — KPIs primários
 * primeiro (topo do stack), navegacionais secundários por último
 * (zona periférica). Mesma array que DEFAULT_CARD_ORDER; existe como
 * constante separada para documentar a intenção e permitir testes
 * que comparam sem depender da referência de DEFAULT_CARD_ORDER. */
export const RFC3_RECOMMENDED_ORDER = Object.freeze([
    'eis-hud-canvas',
    'cost-hud-canvas',
    'ecbt-hud-canvas',
    'violations-hud-canvas',
    'compass-canvas',
    'globe-canvas',
] as const satisfies readonly GeoHudCardId[]);

export type GeoHudCardId = (typeof DEFAULT_CARD_ORDER)[number];

// BOOT-ENTRY-UX-001 RF-C1 (Fase 3, 2026-07-02): classificação primário/
// secundário dos 6 cards do geo-hud. Fonte única (mesma regra AR-3 que já
// rege GEO_HUD_CARD_IDS/DEFAULT_CARD_ORDER — adicionar aqui propaga para
// wire + CSS sem duplicar listas). NÃO altera default de visibilidade
// (todos seguem visíveis por padrão) — é só uma classificação usada para
// aplicar 1 atributo/CSS de agrupamento visual (RF-C1 fatia 1, ver ADR no
// changelog do geoHudCardOrder.ts). "Primário" = KPI-âncora de alto nível
// que a spec pede em primeiro contato (custo, compliance, saúde ECBT/EIS).
// "Secundário" = suporte de georreferência/navegação (bússola/globo), que
// já existe fora do conjunto de KPIs de negócio.
export const PRIMARY_HUD_CARD_IDS = Object.freeze([
    'eis-hud-canvas',
    'cost-hud-canvas',
    'ecbt-hud-canvas',
    'violations-hud-canvas',
] as const satisfies readonly GeoHudCardId[]);

export const SECONDARY_HUD_CARD_IDS = Object.freeze([
    'compass-canvas',
    'globe-canvas',
] as const satisfies readonly GeoHudCardId[]);

export type GeoHudCardTier = 'primary' | 'secondary';

/** Classificação determinística — nunca retorna undefined p/ ID canônico. */
export function getHudCardTier(id: GeoHudCardId): GeoHudCardTier {
    return (PRIMARY_HUD_CARD_IDS as readonly string[]).includes(id) ? 'primary' : 'secondary';
}

export interface GeoHudCardConfig {
    order: GeoHudCardId[];
    hidden: GeoHudCardId[];
    rows: number;
    cols: number;
    /** Espaçamento vertical entre linhas em pixels (0..40). Default 8. */
    rowGap: number;
    /** Espaçamento horizontal entre colunas em pixels (0..40). Default 8. */
    columnGap: number;
    /**
     * BOOT-ENTRY-UX-001 RF-C1 (#14): quando true, cards secundários
     * (bússola/globo) iniciam colapsados por padrão (progressive
     * disclosure). Usuário pode expandir via toggle no header do HUD.
     * Persistido em localStorage. Default true.
     */
    secondaryCollapsed: boolean;
}

export const MIN_ROWS = 1;
export const MAX_ROWS = 5;
export const MIN_COLS = 1;
export const MAX_COLS = 5;
export const DEFAULT_ROWS = 5;
export const DEFAULT_COLS = 1;
export const MIN_GAP = 0;
export const MAX_GAP = 40;
export const DEFAULT_GAP = 8;
export const MIN_ROW_GAP = MIN_GAP;
export const MAX_ROW_GAP = MAX_GAP;
export const DEFAULT_ROW_GAP = DEFAULT_GAP;
export const MIN_COLUMN_GAP = MIN_GAP;
export const MAX_COLUMN_GAP = MAX_GAP;
export const DEFAULT_COLUMN_GAP = DEFAULT_GAP;

/**
 * BOOT-ENTRY-UX-001 RF-C1 (#14): secundários colapsados por padrão
 * (progressive disclosure — ~4 KPIs-âncora no 1º contato, resto a 1 clique).
 */
export const DEFAULT_SECONDARY_COLLAPSED = true;

/** Chave estável p/ localStorage. */
export const GEO_HUD_ORDER_KEY = 'ecbyts-geo-hud-card-order';

export function defaultConfig(): GeoHudCardConfig {
    return {
        order: [...DEFAULT_CARD_ORDER],
        hidden: [],
        rows: DEFAULT_ROWS,
        cols: DEFAULT_COLS,
        rowGap: DEFAULT_ROW_GAP,
        columnGap: DEFAULT_COLUMN_GAP,
        secondaryCollapsed: DEFAULT_SECONDARY_COLLAPSED,
    };
}

/**
 * BOOT-ENTRY-UX-001 RF-C1 (#14): inverte o estado de collapse dos
 * cards secundários. Imutável — retorna nova config.
 */
export function toggleSecondaryCollapse(config: GeoHudCardConfig): GeoHudCardConfig {
    return { ...config, secondaryCollapsed: !config.secondaryCollapsed };
}

export function clampGap(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_GAP;
    return Math.min(MAX_GAP, Math.max(MIN_GAP, Math.round(n)));
}
export function clampRowGap(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_ROW_GAP;
    return Math.min(MAX_ROW_GAP, Math.max(MIN_ROW_GAP, Math.round(n)));
}
export function clampColumnGap(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_COLUMN_GAP;
    return Math.min(MAX_COLUMN_GAP, Math.max(MIN_COLUMN_GAP, Math.round(n)));
}

/** Clampa rows/cols dentro dos limites válidos. Imutável. */
export function clampRows(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_ROWS;
    return Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(n)));
}
export function clampCols(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_COLS;
    return Math.min(MAX_COLS, Math.max(MIN_COLS, Math.round(n)));
}

/**
 * Resolve dimensões finais do grid garantindo que rows*cols >= visibleCount.
 * Se config inviável (e.g. 1×1 mas 5 cards visíveis), expande rows para caber.
 */
export function resolveGridDims(config: GeoHudCardConfig): { rows: number; cols: number } {
    const rows = clampRows(config.rows ?? DEFAULT_ROWS);
    const cols = clampCols(config.cols ?? DEFAULT_COLS);
    const visibleCount = resolveVisibleOrder(config).length;
    if (rows * cols >= visibleCount) return { rows, cols };
    // Expand rows to fit (UX: prefer crescer vertical antes que cortar elementos)
    const neededRows = Math.min(MAX_ROWS, Math.ceil(visibleCount / cols));
    return { rows: Math.max(rows, neededRows), cols };
}

/** True se id é canônico. */
export function isCanonicalCardId(id: string): id is GeoHudCardId {
    return (DEFAULT_CARD_ORDER as readonly string[]).includes(id);
}

/**
 * Normaliza ordem: filtra IDs desconhecidos + adiciona faltantes ao final.
 * Garante invariante: order.length === DEFAULT_CARD_ORDER.length (sem duplicatas).
 */
export function normalizeOrder(rawOrder: unknown): GeoHudCardId[] {
    const seen = new Set<GeoHudCardId>();
    const result: GeoHudCardId[] = [];
    if (Array.isArray(rawOrder)) {
        for (const id of rawOrder) {
            if (typeof id === 'string' && isCanonicalCardId(id) && !seen.has(id)) {
                seen.add(id);
                result.push(id);
            }
        }
    }
    for (const id of DEFAULT_CARD_ORDER) {
        if (!seen.has(id)) result.push(id);
    }
    return result;
}

/** Normaliza array hidden: filtra IDs desconhecidos + dedup. */
export function normalizeHidden(rawHidden: unknown): GeoHudCardId[] {
    const seen = new Set<GeoHudCardId>();
    const result: GeoHudCardId[] = [];
    if (Array.isArray(rawHidden)) {
        for (const id of rawHidden) {
            if (typeof id === 'string' && isCanonicalCardId(id) && !seen.has(id)) {
                seen.add(id);
                result.push(id);
            }
        }
    }
    return result;
}

/**
 * Move um card de fromIndex para toIndex (operação imutável).
 * Retorna nova array — não modifica entrada. Indices fora do range → no-op.
 */
export function moveCard(order: GeoHudCardId[], fromIndex: number, toIndex: number): GeoHudCardId[] {
    if (
        !Array.isArray(order) ||
        fromIndex < 0 ||
        fromIndex >= order.length ||
        toIndex < 0 ||
        toIndex >= order.length ||
        fromIndex === toIndex
    ) {
        return [...order];
    }
    const result = [...order];
    const [moved] = result.splice(fromIndex, 1);
    if (moved === undefined) return [...order];
    result.splice(toIndex, 0, moved);
    return result;
}

/** Toggle visibilidade de um card. Imutável. */
export function toggleCardVisibility(
    hidden: GeoHudCardId[],
    cardId: GeoHudCardId,
): GeoHudCardId[] {
    if (!isCanonicalCardId(cardId)) return [...hidden];
    const set = new Set(hidden);
    if (set.has(cardId)) set.delete(cardId);
    else set.add(cardId);
    // Preserva ordem da entrada para idempotência
    const result: GeoHudCardId[] = [];
    for (const id of DEFAULT_CARD_ORDER) {
        if (set.has(id)) result.push(id);
    }
    return result;
}

/** True se card está oculto. */
export function isCardHidden(hidden: GeoHudCardId[], cardId: GeoHudCardId): boolean {
    return hidden.includes(cardId);
}

/**
 * Resolve ordem visível: filtra cards ocultos para iteração da UI.
 */
export function resolveVisibleOrder(config: GeoHudCardConfig): GeoHudCardId[] {
    return config.order.filter((id) => !config.hidden.includes(id));
}

/**
 * Parse JSON persistido em config válido. Null/erro → defaultConfig.
 */
export function parsePersistedConfig(raw: string | null): GeoHudCardConfig {
    if (!raw || typeof raw !== 'string') return defaultConfig();
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return defaultConfig();
    }
    if (!parsed || typeof parsed !== 'object') return defaultConfig();
    const obj = parsed as { order?: unknown; hidden?: unknown };
    // GAP_HV_SPLIT (2026-06-09): backward-compat — legacy `gap` cobre ambos.
    const legacyGap = (obj as any).gap;
    const fallbackGap = Number.isFinite(Number(legacyGap)) ? clampGap(Number(legacyGap)) : DEFAULT_GAP;
    // BOOT-ENTRY-UX-001 RF-C1 (#14): backward-compat — ausência do campo
    // significa default (secundários colapsados).
    const rawSecondaryCollapsed = (obj as any).secondaryCollapsed;
    const secondaryCollapsed =
        typeof rawSecondaryCollapsed === 'boolean'
            ? rawSecondaryCollapsed
            : DEFAULT_SECONDARY_COLLAPSED;
    return {
        order: normalizeOrder(obj.order),
        hidden: normalizeHidden(obj.hidden),
        rows: clampRows(Number((obj as any).rows ?? DEFAULT_ROWS)),
        cols: clampCols(Number((obj as any).cols ?? DEFAULT_COLS)),
        rowGap: clampRowGap(Number((obj as any).rowGap ?? fallbackGap)),
        columnGap: clampColumnGap(Number((obj as any).columnGap ?? fallbackGap)),
        secondaryCollapsed,
    };
}

export function serializeConfig(config: GeoHudCardConfig): string {
    const rowGap = clampRowGap((config as any).rowGap ?? (config as any).gap ?? DEFAULT_ROW_GAP);
    const columnGap = clampColumnGap((config as any).columnGap ?? (config as any).gap ?? DEFAULT_COLUMN_GAP);
    return JSON.stringify({
        order: config.order,
        hidden: config.hidden,
        rows: clampRows(config.rows ?? DEFAULT_ROWS),
        cols: clampCols(config.cols ?? DEFAULT_COLS),
        rowGap,
        columnGap,
        secondaryCollapsed: config.secondaryCollapsed ?? DEFAULT_SECONDARY_COLLAPSED,
    });
}

/**
 * BOOT-ENTRY-UX-001 RF-C3 (#16): verifica se uma ordem corresponde
 * exatamente ao default pré-RF-C3 (primários depois de navegacionais).
 * Usado para decidir migração automática — só migra quem nunca customizou.
 */
export function isOldDefaultOrder(order: GeoHudCardId[]): boolean {
    if (order.length !== OLD_DEFAULT_ORDER_PRE_RF_C3.length) return false;
    for (let i = 0; i < order.length; i++) {
        if (order[i] !== OLD_DEFAULT_ORDER_PRE_RF_C3[i]) return false;
    }
    return true;
}

/**
 * BOOT-ENTRY-UX-001 RF-C3 (#16): migra ordem do default antigo para o
 * novo (KPIs primeiro). Só migra se for exatamente o old default.
 * Customizações do usuário são preservadas (sem surpresa). Imutável.
 */
export function migrateOrderForRfC3(order: GeoHudCardId[]): GeoHudCardId[] {
    if (isOldDefaultOrder(order)) {
        return [...RFC3_RECOMMENDED_ORDER];
    }
    return [...order];
}

/**
 * Decide se config requer ALL cards hidden — guarda contra estado vazio
 * acidental (todos ocultos = HUD invisível, UX ruim).
 */
export function isEffectivelyEmpty(config: GeoHudCardConfig): boolean {
    return resolveVisibleOrder(config).length === 0;
}

/**
 * Sanitiza config após carregar: se TODOS estão hidden, reverte para default
 * (impede usuário ficar travado sem HUD se persistiu mal).
 */
export function sanitizeConfig(config: GeoHudCardConfig): GeoHudCardConfig {
    if (isEffectivelyEmpty(config)) {
        return defaultConfig();
    }
    return config;
}
