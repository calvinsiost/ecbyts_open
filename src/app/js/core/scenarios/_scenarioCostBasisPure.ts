// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO COST BASIS — pure-logic (CFG-23, TEMA F).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-23 — "Base de custo selecionável (budgeted / realizado /
       forecast / blended). Hoje fixa em 'budgeted'. Vira opção curada;
       default = budgeted. Testável: base=realizado → pipeline ERP consome
       os custos realizados."
     - §2.4.0 guard-rail #1 (escolher entre opções curadas) e #2 (default são).

   ─── DOIS EIXOS QUE A PALAVRA "basis" JUNTA, E QUE NÃO SÃO O MESMO ───

   `core/erp/_costEntryAdapterPure.ts` já tem um `basis: 'actual' | 'budgeted'`,
   e ele NÃO é este item. Aquele decide QUAL CONTA recebe o crédito:

     ERP basis (caixa × competência)  → credita Caixa (A.1) se pago,
                                        Fornecedores (P.1) se a pagar.
     CFG-23 base de custo (dado)      → QUAIS LINHAS entram no pipeline:
                                        as orçadas, as realizadas, as previstas.

   Confundi-los é o bug caro: pedir "realizado" e receber o número do ORÇAMENTO
   com etiqueta de realizado é o mesmo erro de forma que o CFG-15 proíbe na
   conversão de moeda (o 1:1 mudo) — o valor sai plausível, com a etiqueta
   errada, e ninguém vê. Por isso {@link selectCostRowsForBasis} devolve
   `semDado` quando a base pedida não tem linha, e JAMAIS silenciosamente
   entrega as linhas de outra base.

   Os dois eixos se relacionam num ponto só, e declarado: custo REALIZADO já foi
   desembolsado, então a base `actual` posta pelo lado do CAIXA (`ledgerBasis`).
   Orçado e previsto postam por Fornecedores. Isso NÃO move CAPEX/OPEX — os dois
   saem do DÉBITO (Imobilizado A.3 e despesas D.x), e o crédito é o outro lado do
   lançamento —, e a suíte crava essa invariância com `assert.equal`.

   ─── A convenção da linha SEM base declarada ───

   Os `costs[]` de hoje não trazem base. Tratá-las como ORÇAMENTO é exatamente o
   que o código cravado já afirmava (`costRollupToJournalEntries(rollup,
   { basis: 'budgeted' })`), então o default reproduz o comportamento atual byte
   a byte (guard-rail §2.4.0 #2). A diferença é que a premissa deixa de ser
   invisível: `undeclaredRows` mostra sobre quantas linhas ela incidiu, e pedir
   `actual` num modelo só de linhas sem base responde `semDado` — não o orçamento
   fantasiado de realizado.

   ─── `blended` é composição POR EXERCÍCIO, não mistura de números ───

   A base combinada não soma orçado com realizado (isso duplicaria o custo do
   mesmo ano). Ela escolhe, EM CADA ano fiscal, a melhor base disponível na ordem
   realizado → previsto → orçado: o exercício já fechado entra pelo realizado, o
   ano futuro entra pelo previsto ou pelo orçado. Quais bases entraram fica em
   `used`, para o consumidor poder dizer de onde veio cada trecho da série.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

/** As bases de custo curadas (N8: o usuário escolhe da lista, não digita). */
export type CostBasisId = 'budgeted' | 'actual' | 'forecast' | 'blended';

/** Lado do razão em que a base posta o crédito — o eixo do ERP, não deste item. */
export type LedgerBasis = 'actual' | 'budgeted';

/** Uma base de custo curada, citável. */
export interface CostBasisDef {
    /** Id curado da base. */
    readonly id: CostBasisId;
    /** Rótulo legível (pt-BR), para o seletor. */
    readonly name: string;
    /**
     * Bases DE LINHA que esta base consome, em ordem de precedência. Bases
     * simples têm um único elemento; `blended` tem os três, e a ordem é a
     * precedência por exercício (realizado ganha do previsto, que ganha do orçado).
     */
    readonly draws: readonly CostBasisId[];
    /**
     * Como o lançamento é creditado no razão (eixo caixa × competência do ERP).
     * `actual` credita Caixa porque custo realizado já foi desembolsado; as
     * demais creditam Fornecedores, como o pipeline sempre fez.
     */
    readonly ledgerBasis: LedgerBasis;
    /** Fonte citável da definição. Nunca ''. */
    readonly source: string;
}

const SPEC_SOURCE =
    'SPEC_SCENARIOS_PROCESS_IMPACT.md §2.4 CFG-23 (vocabulário das bases) + core/erp/_costEntryAdapterPure.ts §11.4/CPC 26 (lado do crédito no razão)';

function basis(id: CostBasisId, name: string, draws: readonly CostBasisId[], ledgerBasis: LedgerBasis): CostBasisDef {
    return Object.freeze({
        id,
        name,
        draws: Object.freeze(draws),
        ledgerBasis,
        source: SPEC_SOURCE,
    });
}

/**
 * Bases curadas. A lista é a da §2.4 CFG-23, sem acréscimo: configurabilidade
 * aqui é escolher entre estas quatro, nunca declarar uma base nova por texto.
 */
export const CURATED_COST_BASES: Readonly<Record<CostBasisId, CostBasisDef>> = Object.freeze({
    budgeted: basis('budgeted', 'Orçado', ['budgeted'], 'budgeted'),
    actual: basis('actual', 'Realizado', ['actual'], 'actual'),
    forecast: basis('forecast', 'Previsto', ['forecast'], 'budgeted'),
    // Precedência por exercício: o ano fechado entra pelo realizado; o ano
    // aberto, pelo previsto; e o que não tem nenhum dos dois, pelo orçado.
    blended: basis('blended', 'Combinado', ['actual', 'forecast', 'budgeted'], 'budgeted'),
});

/** As bases que uma LINHA pode declarar (`blended` é composição, não linha). */
const ROW_LEVEL_BASES: readonly CostBasisId[] = Object.freeze(['budgeted', 'actual', 'forecast']);

/** Versão do catálogo curado — trilha de auditoria da curadoria (N9). */
export const COST_BASIS_CATALOG_VERSION = 1;

/** Base default: orçado — a que o pipeline já usava cravada. */
export const DEFAULT_COST_BASIS_ID: CostBasisId = 'budgeted';

/** Base de custo resolvida (CFG-23) — mesma forma do CFG-18/19/20/22. */
export interface ResolvedCostBasis {
    /** A base curada em vigor. Nunca `null`: sem pedido válido, é o default. */
    readonly basis: CostBasisDef;
    /** Id pedido pelo chamador; `null` quando não pediu (auditoria). */
    readonly requested: string | null;
    /**
     * `true` quando um id FOI pedido e não está no catálogo curado (N8).
     * O default entra no lugar com o descarte VISÍVEL — porque cair calado no
     * orçamento é justamente o erro que este módulo existe para impedir.
     */
    readonly unknown: boolean;
    /** `true` quando a base em vigor é o default (orçado) — o caminho de hoje. */
    readonly isDefault: boolean;
    /** Versão do catálogo curado que resolveu (trilha de auditoria, N9). */
    readonly catalogVersion: number;
}

/** Apelidos aceitos (o pt-BR da própria spec e sinônimos correntes) → id curado. */
const COST_BASIS_ALIASES: Readonly<Record<string, CostBasisId>> = Object.freeze({
    realizado: 'actual',
    realized: 'actual',
    orcado: 'budgeted',
    orçado: 'budgeted',
    budget: 'budgeted',
    previsto: 'forecast',
    projetado: 'forecast',
    combinado: 'blended',
    misto: 'blended',
});

function isCuratedId(value: string): value is CostBasisId {
    return Object.prototype.hasOwnProperty.call(CURATED_COST_BASES, value);
}

/**
 * Resolve um id para a base curada correspondente.
 *
 * Aceita qualquer caixa ('ACTUAL' → actual) e os apelidos em português que a
 * própria spec usa ('realizado' → actual, 'orçado' → budgeted): isso é
 * normalização de ESCRITA da mesma opção curada, não abertura de campo livre.
 * Id fora do catálogo devolve `null` (N8).
 *
 * @param id - Id ou apelido da base pedida.
 * @returns A {@link CostBasisDef} curada, ou `null` se não é do catálogo.
 */
export function resolveCostBasisDef(id?: string | null): CostBasisDef | null {
    if (typeof id !== 'string') return null;
    const key = id.trim().toLowerCase();
    const canonical = COST_BASIS_ALIASES[key] ?? key;
    return isCuratedId(canonical) ? CURATED_COST_BASES[canonical] : null;
}

/**
 * Resolve a base de custo do cenário (CFG-23).
 *
 * Id ausente, vazio ou fora do catálogo cai no default `budgeted`, que reproduz
 * exatamente o comportamento pré-CFG-23 (guard-rail §2.4.0 #2, zero regressão) —
 * e, quando o id FOI pedido e não existe, `unknown` marca o descarte em vez de
 * fingir que o usuário pediu orçado.
 *
 * @param id - Id ou apelido da base pedida pelo chamador.
 * @returns {@link ResolvedCostBasis} congelada; nunca lança.
 */
export function resolveCostBasis(id?: string | null): ResolvedCostBasis {
    const requested = typeof id === 'string' && id.trim().length > 0 ? id : null;
    const resolved = resolveCostBasisDef(id);
    const def = resolved ?? CURATED_COST_BASES[DEFAULT_COST_BASIS_ID];
    return Object.freeze({
        basis: def,
        requested,
        unknown: requested !== null && resolved === null,
        isDefault: def.id === DEFAULT_COST_BASIS_ID,
        catalogVersion: COST_BASIS_CATALOG_VERSION,
    });
}

/**
 * Os ids de base oferecíveis, em ordem estável (para um seletor).
 *
 * É a metade "escolher entre opções curadas" do guard-rail §2.4.0 #1: a tela
 * oferece ESTA lista e não um campo de texto livre.
 *
 * @returns Ids curados, ordenados alfabeticamente, congelados.
 */
export function listCostBasisIds(): readonly string[] {
    return Object.freeze([...Object.keys(CURATED_COST_BASES)].sort());
}

// ───────────────────────────── Seleção de linhas ─────────────────────────────

/** A forma mínima de uma linha de custo para efeito de base (estrutural). */
export interface CostBasisRowLike {
    /** Base declarada na linha; ausente = orçamento, pela convenção do cabeçalho. */
    readonly basis?: string;
    /** Ano fiscal da linha — a chave da composição `blended`. */
    readonly fiscalYear?: number | string;
}

/** A base de UMA linha, e se ela foi declarada ou veio da convenção. */
export interface RowCostBasis {
    /** A base de linha em vigor (`budgeted` quando nada foi declarado). */
    readonly id: CostBasisId;
    /** `true` quando a linha declarou a base; `false` = convenção aplicada. */
    readonly declared: boolean;
}

/**
 * A base declarada NA LINHA, ou a convenção quando a linha não declara nenhuma.
 *
 * `blended` não é base de linha (é composição de bases), então uma linha que o
 * declare cai na convenção — declarar "combinado" numa linha não diz de onde o
 * número veio, e o módulo não adivinha.
 *
 * @param row - Linha de custo (forma estrutural mínima).
 * @returns {@link RowCostBasis} congelada.
 */
export function resolveRowCostBasis(row: CostBasisRowLike | null | undefined): RowCostBasis {
    const raw = typeof row?.basis === 'string' ? row.basis.trim().toLowerCase() : '';
    const canonical = COST_BASIS_ALIASES[raw] ?? raw;
    const declared = ROW_LEVEL_BASES.includes(canonical as CostBasisId);
    return Object.freeze({
        id: declared ? (canonical as CostBasisId) : DEFAULT_COST_BASIS_ID,
        declared,
    });
}

/** O resultado de selecionar as linhas que a base pedida consome. */
export interface CostBasisSelection<T> {
    /**
     * `active` = a base pedida tem linha · `semDado` = ela NÃO tem (N3).
     * Em `semDado` a lista sai vazia: nenhuma linha de outra base é entregue no
     * lugar, que é o ponto inteiro do item.
     */
    readonly status: 'active' | 'semDado';
    /** As linhas que a base pedida consome, na ordem original. */
    readonly rows: readonly T[];
    /** Bases de linha efetivamente consumidas (`blended` pode usar mais de uma). */
    readonly used: readonly CostBasisId[];
    /** Bases de linha PRESENTES no conjunto (para a tela dizer o que existe). */
    readonly available: readonly CostBasisId[];
    /** Linhas sem base declarada, contadas pela convenção (proveniência). */
    readonly undeclaredRows: number;
    /** Linhas descartadas por pertencerem a outra base (proveniência). */
    readonly rejectedRows: number;
}

/** Chave de agrupamento por exercício; linhas sem ano usável caem num grupo só. */
function yearKey(row: CostBasisRowLike | null | undefined): string {
    const y = Number(row?.fiscalYear);
    return Number.isFinite(y) && y > 0 ? String(y) : '';
}

/**
 * Escolhe, entre as linhas, as que a base pedida consome.
 *
 * Base simples entrega as linhas daquela base. `blended` compõe POR EXERCÍCIO:
 * em cada ano fiscal vale a primeira base disponível na ordem realizado →
 * previsto → orçado, de modo que o ano fechado entre pelo realizado e o ano
 * aberto pelo previsto/orçado — sem somar duas bases do mesmo ano, o que
 * duplicaria o custo.
 *
 * N3 — o coração do item: base pedida SEM nenhuma linha devolve
 * `status: 'semDado'` e lista VAZIA. O chamador então responde `null`, e não o
 * número de outra base com a etiqueta da base pedida.
 *
 * @param rows - Linhas de custo, na ordem de origem.
 * @param resolved - Base resolvida (ou a `CostBasisDef` curada).
 * @returns {@link CostBasisSelection} congelada; nunca lança.
 */
export function selectCostRowsForBasis<T extends CostBasisRowLike>(
    rows: readonly T[] | null | undefined,
    resolved: ResolvedCostBasis | CostBasisDef,
): CostBasisSelection<T> {
    const def = 'basis' in resolved ? resolved.basis : resolved;
    const all = Array.isArray(rows) ? rows : [];

    // Passo 1 — a base de cada linha e o que existe em cada exercício.
    const rowBasis: RowCostBasis[] = [];
    const rowYear: string[] = [];
    const present = new Set<CostBasisId>();
    const basesByYear = new Map<string, Set<CostBasisId>>();
    let undeclaredRows = 0;
    for (let i = 0; i < all.length; i++) {
        const rb = resolveRowCostBasis(all[i]);
        const key = yearKey(all[i]);
        rowBasis.push(rb);
        rowYear.push(key);
        present.add(rb.id);
        if (!rb.declared) undeclaredRows += 1;
        const set = basesByYear.get(key) ?? new Set<CostBasisId>();
        set.add(rb.id);
        basesByYear.set(key, set);
    }

    // Passo 2 — por exercício, a primeira base disponível na ordem de precedência
    // da base pedida. Base simples tem um único `draws`: vira "filtra por ela".
    const winnerByYear = new Map<string, CostBasisId>();
    for (const [key, inYear] of basesByYear) {
        for (const wanted of def.draws) {
            if (inYear.has(wanted)) {
                winnerByYear.set(key, wanted);
                break;
            }
        }
    }

    // Passo 3 — ficam as linhas cuja base venceu o próprio exercício.
    const kept: T[] = [];
    const used = new Set<CostBasisId>();
    for (let i = 0; i < all.length; i++) {
        const rb = rowBasis[i] as RowCostBasis;
        if (winnerByYear.get(rowYear[i] as string) !== rb.id) continue;
        kept.push(all[i] as T);
        used.add(rb.id);
    }

    return Object.freeze({
        status: kept.length > 0 ? 'active' : 'semDado',
        rows: Object.freeze(kept) as readonly T[],
        used: sortCostBasisIds(used),
        available: sortCostBasisIds(present),
        undeclaredRows,
        rejectedRows: all.length - kept.length,
    });
}

/**
 * Ordena ids de base na ordem canônica do catálogo (orçado, realizado, previsto).
 *
 * Existe para que QUALQUER agregação de proveniência — a de uma lista de linhas
 * ou a de um modelo inteiro, elemento a elemento — produza a mesma lista para o
 * mesmo conjunto. Ordem de iteração de `Set` é ordem de inserção, e deixá-la
 * vazar faria a proveniência mudar conforme a ordem dos elementos.
 *
 * @param ids - Ids a ordenar (qualquer iterável; duplicatas colapsam).
 * @returns Lista congelada, em ordem canônica.
 */
export function sortCostBasisIds(ids: Iterable<CostBasisId>): readonly CostBasisId[] {
    const order = (id: CostBasisId): number => ROW_LEVEL_BASES.indexOf(id);
    return Object.freeze([...new Set(ids)].sort((a, b) => order(a) - order(b))) as readonly CostBasisId[];
}
