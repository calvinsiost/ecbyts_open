// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// PALETTE-ORGANIZE :: pure-logic da ORGANIZAÇÃO da Command Palette (Ctrl+K /
// Ctrl+Shift+P) para reduzir carga cognitiva (friendliness TD-8, dimensão
// cognitive). Sem DOM, sem window, sem timer, sem I/O. O render fica no modal
// (commandPalette.ts) — aqui só decidimos AGRUPAMENTO, RANKING e VISÃO INICIAL.
//
// Motivação: a paleta exibe centenas de ações numa LISTA PLANA. Ver N categorias
// colapsáveis (em vez de centenas de itens) reduz a sobrecarga. A busca/ranking
// por relevância é preservada — só a visão inicial (sem query) muda para
// agrupada quando há comandos demais.
//
// Tudo aqui é determinístico e frozen: 2 execuções com a mesma entrada produzem
// estruturas idênticas (ordenação total, sem dependência de iteração de chaves).

/**
 * Forma mínima de um comando que a organização pura precisa. O comando real da
 * palette tem mais campos (handler, icon, keywords...) — aqui só lemos os campos
 * de organização, e preservamos o objeto original intacto nas seções.
 */
export interface OrganizableCommand {
    /** ID estável (usado para casar com recentIds e dedup). */
    id: string;
    /** Label de exibição (ordenação dentro da categoria; também usado na busca). */
    label: string;
    /** Categoria de agrupamento. Ausência → bucket "Outros"/UNCATEGORIZED. */
    category?: string;
    /** Outros campos do comando real são preservados, mas ignorados aqui. */
    [key: string]: unknown;
}

/** Uma seção: header de categoria (ou "Recentes") + itens já ordenados. */
export interface CommandSection<T extends OrganizableCommand = OrganizableCommand> {
    /** Rótulo da seção (categoria, ou "Recentes" via recentLabel). */
    category: string;
    /** Comandos da seção, na ordem final de exibição. */
    items: ReadonlyArray<T>;
}

/** Resultado de selectInitialView. */
export interface InitialView<T extends OrganizableCommand = OrganizableCommand> {
    /** 'flat' = lista plana (poucos comandos); 'grouped' = seções por categoria. */
    mode: 'flat' | 'grouped';
    /** Seções a renderizar (flat → seção única sem header semântico). */
    sections: ReadonlyArray<CommandSection<T>>;
}

/** Categoria de fallback para comandos sem `category`. */
export const UNCATEGORIZED = 'Outros';

/** Rótulo padrão da seção de comandos recentes. */
export const RECENT_SECTION_LABEL = 'Recentes';

/** Limite padrão acima do qual a visão inicial vira agrupada. */
export const DEFAULT_MAX_FLAT = 30;

/**
 * Acessor de label estável. Em runtime a palette pode usar label_pt; para manter
 * a lógica pura e testável, ordenamos por `label`. O wire pode injetar um
 * getLabel customizado (ex.: lang-aware) — desde que seja puro/determinístico.
 */
export type GetLabel<T extends OrganizableCommand> = (cmd: T) => string;

const defaultGetLabel: GetLabel<OrganizableCommand> = (cmd) => String(cmd.label ?? '');

/** Normaliza texto para busca/ordenação: lowercase, sem acento, trim. */
export function normalizeText(text: unknown): string {
    if (typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // Remove acentos
        .trim();
}

/** Resolve a categoria de um comando, com fallback determinístico. */
function categoryOf(cmd: OrganizableCommand): string {
    const c = typeof cmd.category === 'string' ? cmd.category.trim() : '';
    return c.length > 0 ? c : UNCATEGORIZED;
}

/**
 * Comparador estável de strings (locale-independente para ser determinístico
 * entre ambientes). Compara case-insensitive primeiro, depois case-sensitive
 * como desempate, garantindo ordem total.
 */
function compareStrings(a: string, b: string): number {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

/**
 * Congela profundamente as seções (cada seção + seu array de items) para impedir
 * mutação acidental no render. Os objetos de comando em si NÃO são clonados
 * (preservamos a referência original esperada pelo handler), apenas o array.
 */
function freezeSections<T extends OrganizableCommand>(
    sections: Array<CommandSection<T>>,
): ReadonlyArray<CommandSection<T>> {
    for (const s of sections) {
        Object.freeze(s.items);
        Object.freeze(s);
    }
    return Object.freeze(sections);
}

/**
 * Agrupa comandos por `command.category` em seções ordenadas.
 * - Categorias em ordem alfabética (case-insensitive, determinística).
 * - Itens dentro da categoria em ordem alfabética de label.
 * Comandos sem categoria caem em {@link UNCATEGORIZED}.
 *
 * @returns `[{category, items}]` frozen e determinístico.
 */
export function groupByCategory<T extends OrganizableCommand>(
    commands: ReadonlyArray<T>,
    options: { getLabel?: GetLabel<T> } = {},
): ReadonlyArray<CommandSection<T>> {
    const getLabel = options.getLabel ?? (defaultGetLabel as GetLabel<T>);
    const list = Array.isArray(commands) ? commands : [];

    const buckets = new Map<string, T[]>();
    for (const cmd of list) {
        if (!cmd || typeof cmd.id !== 'string') continue;
        const cat = categoryOf(cmd);
        const bucket = buckets.get(cat);
        if (bucket) {
            bucket.push(cmd);
        } else {
            buckets.set(cat, [cmd]);
        }
    }

    const categories = [...buckets.keys()].sort(compareStrings);
    const sections: Array<CommandSection<T>> = categories.map((category) => {
        const items = [...(buckets.get(category) as T[])].sort((a, b) =>
            compareStrings(getLabel(a), getLabel(b)),
        );
        return { category, items };
    });
    return freezeSections(sections);
}

/**
 * Score de relevância determinístico (fuzzy "barato"):
 *   exact-id (1000) > label-startsWith (500) > label-includes (300) >
 *   category-includes (100). 0 = sem match.
 */
function relevanceScore(cmd: OrganizableCommand, normQuery: string, label: string): number {
    const normLabel = normalizeText(label);
    const normId = normalizeText(cmd.id);
    const normCat = normalizeText(categoryOf(cmd));
    if (normId === normQuery) return 1000;
    if (normLabel.startsWith(normQuery)) return 500;
    if (normLabel.includes(normQuery)) return 300;
    if (normCat.includes(normQuery)) return 100;
    return 0;
}

/**
 * Ranqueia/organiza comandos conforme houver ou não query.
 *
 * SEM query: prioriza recentes (na ordem de `recentIds`, mais recente primeiro)
 * numa seção "Recentes", seguida das demais categorias (agrupadas, alfabéticas).
 * Um comando recente NÃO se repete nas seções de categoria.
 *
 * COM query: retorna UMA seção plana (category = query) filtrada por relevância
 * decrescente: exact-id > label-startsWith > label-includes > category-includes.
 * Empates desempatam por label (alfabético) → determinístico.
 *
 * @returns seções frozen e determinísticas.
 */
export function rankCommands<T extends OrganizableCommand>(
    commands: ReadonlyArray<T>,
    params: { recentIds?: ReadonlyArray<string>; query?: string; recentLabel?: string; getLabel?: GetLabel<T> } = {},
): ReadonlyArray<CommandSection<T>> {
    const getLabel = params.getLabel ?? (defaultGetLabel as GetLabel<T>);
    const list = Array.isArray(commands) ? commands.filter((c) => c && typeof c.id === 'string') : [];
    const query = typeof params.query === 'string' ? params.query : '';
    const normQuery = normalizeText(query);

    // --- COM query: lista plana ranqueada por relevância ---
    if (normQuery.length > 0) {
        const scored = list
            .map((cmd, index) => ({ cmd, index, score: relevanceScore(cmd, normQuery, getLabel(cmd)) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                const byLabel = compareStrings(getLabel(a.cmd), getLabel(b.cmd));
                if (byLabel !== 0) return byLabel;
                return a.index - b.index; // estabilidade total
            })
            .map((entry) => entry.cmd);
        return freezeSections([{ category: query, items: scored }]);
    }

    // --- SEM query: Recentes (se houver) + categorias ---
    const recentIds = Array.isArray(params.recentIds) ? params.recentIds : [];
    const recentLabel = typeof params.recentLabel === 'string' ? params.recentLabel : RECENT_SECTION_LABEL;
    const byId = new Map<string, T>();
    for (const cmd of list) {
        if (!byId.has(cmd.id)) byId.set(cmd.id, cmd);
    }

    const recentItems: T[] = [];
    const usedRecent = new Set<string>();
    for (const id of recentIds) {
        if (usedRecent.has(id)) continue;
        const cmd = byId.get(id);
        if (cmd) {
            recentItems.push(cmd);
            usedRecent.add(id);
        }
    }

    const remaining = list.filter((cmd) => !usedRecent.has(cmd.id));
    const categorySections = groupByCategory(remaining, { getLabel });

    const sections: Array<CommandSection<T>> =
        recentItems.length > 0 ? [{ category: recentLabel, items: recentItems }, ...categorySections] : [...categorySections];

    return freezeSections(sections);
}

/**
 * Decide a VISÃO INICIAL (sem query) para reduzir carga cognitiva:
 * - total de comandos ≤ maxFlat → modo 'flat' (uma seção, na ordem original).
 * - acima de maxFlat → modo 'grouped' (Recentes + categorias colapsáveis).
 *
 * Trocar centenas de itens planos por N categorias é o ponto central de TD-8.
 *
 * @returns `{mode, sections}` frozen e determinístico.
 */
export function selectInitialView<T extends OrganizableCommand>(
    commands: ReadonlyArray<T>,
    params: {
        recentIds?: ReadonlyArray<string>;
        maxFlat?: number;
        recentLabel?: string;
        getLabel?: GetLabel<T>;
    } = {},
): InitialView<T> {
    const list = Array.isArray(commands) ? commands.filter((c) => c && typeof c.id === 'string') : [];
    const maxFlat =
        typeof params.maxFlat === 'number' && Number.isFinite(params.maxFlat) && params.maxFlat >= 0
            ? params.maxFlat
            : DEFAULT_MAX_FLAT;

    if (list.length <= maxFlat) {
        const sections = freezeSections<T>([{ category: '', items: [...list] }]);
        return Object.freeze({ mode: 'flat', sections });
    }

    // Repassa só as props definidas (exactOptionalPropertyTypes não aceita
    // `prop: undefined` num campo opcional).
    const forwarded: { recentIds?: ReadonlyArray<string>; query: string; recentLabel?: string; getLabel?: GetLabel<T> } =
        { query: '' };
    if (params.recentIds !== undefined) forwarded.recentIds = params.recentIds;
    if (params.recentLabel !== undefined) forwarded.recentLabel = params.recentLabel;
    if (params.getLabel !== undefined) forwarded.getLabel = params.getLabel;
    const sections = rankCommands(list, forwarded);
    return Object.freeze({ mode: 'grouped', sections });
}
