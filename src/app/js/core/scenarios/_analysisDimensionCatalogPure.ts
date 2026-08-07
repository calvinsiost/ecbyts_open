// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ANALYSIS DIMENSION CATALOG — pure-logic (CFG-26, TEMA G).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4.8 CFG-26 — "Dimensões de análise ampliáveis (hoje 4: CAPEX,
       OPEX, ECBT, ODS). Catálogo curado ganha custos sociais, saúde,
       biodiversidade, risco como dimensões OPCIONAIS. Cada dimension nova
       segue a fórmula-mãe (§5.1-c). Testável: ligar dimensão 'saúde' →
       coluna extra no comparador com fator citável."
     - §5.1-c — cada impacto é função linear `Σ_rotas(α × fator × A(t))`.
     - §2.4.1 (N9) — a curadoria (registrar dimensão) é do admin, versionada.

   O QUE ESTE MÓDULO RESOLVE: as 4 dimensões eram um conjunto FECHADO —
   campos fixos em `ScenarioDelta` (`capex`, `opex`, `ecbtScore`, `ods`) e
   uma union `DeltaDimension` cuja leitura qualitativa era um `===
   'ecbtScore'` cravado. Uma 5ª dimensão exigia editar o delta e cada VM.
   Aqui a dimensão vira DADO: `{ kind, polarity, unit, nameKey, source }`.

   ─── Extensão ADITIVA, jamais substitutiva ───
   O catálogo canônico continua exatamente com as 4 dimensões, nos mesmos
   ids, com a mesma polaridade que o delta já aplicava (custos e nº de ODS
   afetados: DOWN é melhora; ECBT Score: UP é melhora). Dimensão registrada
   entra num canal SEPARADO (`extras`), sem tocar nos 4 campos que os VMs do
   painel consomem — sem registro, a saída do delta é byte a byte a mesma.

   ─── A fórmula-mãe vale para a dimensão nova (§5.1-c) ───
   {@link aggregateExtraDimensionValue} calcula o valor de uma dimensão
   registrada por `Σ_rotas(α × fator × A(t))`, a MESMA álgebra das dimensões
   canônicas — dimensão nova não ganha aritmética própria (N4). Nenhuma rota
   com fator ⇒ `null` (semDado, N3), nunca um 0 forjado que fingiria medição.

   Robustez (N3/N8): definição inválida (forma errada, id colidindo com uma
   dimensão canônica, polaridade/tipo desconhecidos, sem fonte citável) é
   REJEITADA com motivo e NÃO entra. O canônico é IMUTÁVEL.

   ZERO DOM, ZERO IO, determinístico. Todos os retornos são congelados.
   ================================================================ */

// ───────────────────────────── Tipos ─────────────────────────────

/**
 * Forma do valor da dimensão:
 *  - `scalar`       → um número por cenário (CAPEX, OPEX, ECBT Score, e toda
 *                     dimensão registrada: custo social, saúde, risco…).
 *  - `indicatorSet` → uma lista de indicadores oficiais (só o ODS hoje), que
 *                     o delta compara indicador a indicador.
 */
export type DimensionValueKind = 'scalar' | 'indicatorSet';

/** Qual direção do delta é MELHORA para esta dimensão. */
export type DimensionPolarity = 'lowerIsBetter' | 'higherIsBetter';

/** Receita de UMA dimensão de análise. */
export interface AnalysisDimensionDefinition {
    /** Id estável da dimensão (ex.: 'capex', 'health'). */
    readonly id: string;
    /** Forma do valor (ver {@link DimensionValueKind}). */
    readonly kind: DimensionValueKind;
    /** Direção que conta como melhora (ver {@link DimensionPolarity}). */
    readonly polarity: DimensionPolarity;
    /** Unidade do valor (ex.: 'R$', 'R$/ano', 'DALY/ano'). */
    readonly unit: string;
    /** Chave i18n do rótulo (zero string cravada na UI). */
    readonly nameKey: string;
    /**
     * Fonte citável do FATOR da dimensão — é o "fator citável" que o
     * caso-testável do CFG-26 exige na coluna extra. Obrigatória.
     */
    readonly source: string;
}

/** Ids canônicos — as 4 dimensões que o delta já comparava antes do CFG-26. */
export type CanonicalDimensionId = 'capex' | 'opex' | 'ecbtScore' | 'ods';

/**
 * Id de dimensão aceito pelo delta. O `& {}` mantém o autocompletar das 4
 * canônicas SEM fechar o conjunto — o que o CFG-26 pede.
 */
export type AnalysisDimensionId = CanonicalDimensionId | (string & {});

/** Resultado da validação de UMA definição vinda de dado/config. */
export interface AnalysisDimensionValidation {
    readonly id: string | null;
    readonly valid: boolean;
    readonly errors: readonly string[];
}

/** Procedência de uma dimensão do catálogo efetivo (CFG-26). */
export interface AnalysisDimensionProvenance {
    /** 'canonical' = curada em código (imutável); 'registered' = veio de dado. */
    readonly origin: 'canonical' | 'registered';
    /** Fonte citável do fator da dimensão. */
    readonly source: string;
    /** Versão da curadoria que a admitiu (auditoria). */
    readonly version: number;
}

/** Catálogo efetivo: canônicas ∪ registradas por dado, + procedência. */
export interface EffectiveAnalysisDimensionCatalog {
    /** Mapa id→definição (canônicas + registradas válidas), congelado. */
    readonly byId: Readonly<Record<string, AnalysisDimensionDefinition>>;
    /** Ids na ordem: canônicas primeiro, depois registradas. */
    readonly ids: readonly string[];
    /** Ids das 4 dimensões canônicas (imutáveis). */
    readonly canonicalIds: readonly string[];
    /** Ids que entraram por dado/config (curadoria admin). */
    readonly registeredIds: readonly string[];
    /** Validações das definições rejeitadas (procedência da curadoria). */
    readonly rejected: readonly AnalysisDimensionValidation[];
    /** Versão da curadoria aplicada às registradas (auditoria). */
    readonly version: number;
}

// ───────────────────── Catálogo canônico (curado) ─────────────────────

const SPEC_SOURCE = 'SPEC_SCENARIOS_PROCESS_IMPACT.md §5.1';

/**
 * As 4 dimensões que o delta já comparava. A `polarity` reproduz EXATAMENTE a
 * leitura que `deltaDirecao` aplicava: em custos (capex/opex) e no nº de ODS
 * afetados, DOWN é melhora; no ECBT Score (resultado líquido), UP é melhora.
 * Base IMUTÁVEL do catálogo — dado nunca sobrescreve nenhuma destas.
 */
export const CANONICAL_ANALYSIS_DIMENSIONS: Readonly<
    Record<CanonicalDimensionId, AnalysisDimensionDefinition>
> = Object.freeze({
    capex: Object.freeze({
        id: 'capex',
        kind: 'scalar' as DimensionValueKind,
        polarity: 'lowerIsBetter' as DimensionPolarity,
        unit: 'R$',
        nameKey: 'scenario.dimension.capex',
        source: SPEC_SOURCE,
    }),
    opex: Object.freeze({
        id: 'opex',
        kind: 'scalar' as DimensionValueKind,
        polarity: 'lowerIsBetter' as DimensionPolarity,
        unit: 'R$/ano',
        nameKey: 'scenario.dimension.opex',
        source: SPEC_SOURCE,
    }),
    ecbtScore: Object.freeze({
        id: 'ecbtScore',
        kind: 'scalar' as DimensionValueKind,
        polarity: 'higherIsBetter' as DimensionPolarity,
        unit: 'R$',
        nameKey: 'scenario.dimension.ecbtScore',
        source: SPEC_SOURCE,
    }),
    ods: Object.freeze({
        id: 'ods',
        kind: 'indicatorSet' as DimensionValueKind,
        polarity: 'lowerIsBetter' as DimensionPolarity,
        unit: 'indicadores',
        nameKey: 'scenario.dimension.ods',
        source: SPEC_SOURCE,
    }),
});

/** Versão da curadoria canônica (trilha de auditoria — NOT N9). Default 1. */
export const ANALYSIS_DIMENSION_CATALOG_VERSION = 1;

// ───────────────────────────── Guardas ─────────────────────────────

const VALUE_KINDS: ReadonlySet<string> = new Set<string>(['scalar', 'indicatorSet']);
const POLARITIES: ReadonlySet<string> = new Set<string>(['lowerIsBetter', 'higherIsBetter']);

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

// ───────────────────────────── API pública ─────────────────────────────

/**
 * Valida UMA definição de dimensão vinda de dado/config (CFG-26). Uma definição
 * válida tem: id não-vazio que NÃO colide com as 4 canônicas (imutáveis);
 * `kind` e `polarity` entre os valores curados; `unit`; `nameKey` (chave i18n);
 * e `source` — o FATOR CITÁVEL que a coluna extra do comparador exibe.
 *
 * Só dimensão `scalar` pode ser registrada: `indicatorSet` é a forma do ODS,
 * cujo delta compara indicadores oficiais com metadados próprios (goal/
 * indicator/source) e não se generaliza a partir de uma definição de config.
 *
 * @param def - Definição candidata (unknown: vem de dado/config externo).
 * @returns Validação congelada com `valid` + `errors` legíveis + `id`.
 */
export function validateAnalysisDimensionDefinition(def: unknown): AnalysisDimensionValidation {
    if (!def || typeof def !== 'object') {
        return Object.freeze({
            id: null,
            valid: false,
            errors: Object.freeze(['definição não é um objeto']) as readonly string[],
        });
    }
    const d = def as Partial<AnalysisDimensionDefinition>;
    const id = isNonEmptyString(d.id) ? d.id : null;
    const errors: string[] = [];

    if (!isNonEmptyString(d.id)) {
        errors.push("definição sem 'id' não-vazio");
    } else if (Object.prototype.hasOwnProperty.call(CANONICAL_ANALYSIS_DIMENSIONS, d.id)) {
        errors.push(`id '${d.id}' colide com uma dimensão canônica (imutável) — escolha um id novo`);
    }

    if (!isNonEmptyString(d.kind) || !VALUE_KINDS.has(d.kind)) {
        errors.push("'kind' deve ser 'scalar' ou 'indicatorSet'");
    } else if (d.kind === 'indicatorSet') {
        errors.push(
            "'indicatorSet' é a forma do ODS (indicadores oficiais com metadados próprios) — " +
                'uma dimensão registrada por dado é escalar',
        );
    }

    if (!isNonEmptyString(d.polarity) || !POLARITIES.has(d.polarity)) {
        errors.push("'polarity' deve ser 'lowerIsBetter' ou 'higherIsBetter'");
    }
    if (!isNonEmptyString(d.unit)) errors.push("definição sem 'unit'");
    if (!isNonEmptyString(d.nameKey)) {
        errors.push("definição sem chave i18n 'nameKey' (zero string cravada)");
    }
    if (!isNonEmptyString(d.source)) {
        errors.push("definição sem 'source' citável — o fator da dimensão precisa de fonte (CFG-26)");
    }

    return Object.freeze({
        id,
        valid: errors.length === 0,
        errors: Object.freeze(errors) as readonly string[],
    });
}

/** Congela a definição validada antes de entrar no catálogo. */
function freezeDefinition(def: AnalysisDimensionDefinition): AnalysisDimensionDefinition {
    return Object.freeze({
        id: def.id,
        kind: def.kind,
        polarity: def.polarity,
        unit: def.unit,
        nameKey: def.nameKey,
        source: def.source,
    });
}

/**
 * Constrói o catálogo EFETIVO de dimensões = 4 canônicas ∪ definições
 * registradas por dado/config VÁLIDAS (CFG-26). O admin/curador passa um array
 * de definições (tabela versionada, não código); este módulo valida cada uma e
 * a promove. A dimensão nova vira uma COLUNA a mais, sem mexer nas 4 antigas.
 *
 * - As canônicas são sempre incluídas e NUNCA sobrescritas (imutáveis).
 * - Definições inválidas ficam em `rejected` com o motivo e não entram (N3).
 * - Ids registrados duplicados: a PRIMEIRA válida vence; as demais são
 *   rejeitadas (registro determinístico, sem clobber silencioso).
 *
 * @param registered - Definições candidatas vindas de dado/config (default []).
 * @param options - `version` da curadoria (auditoria; default a canônica).
 * @returns Catálogo efetivo congelado com `byId`, `ids`, procedência e rejeições.
 */
export function buildEffectiveAnalysisDimensionCatalog(
    registered: ReadonlyArray<unknown> = [],
    options: { readonly version?: number } = {},
): EffectiveAnalysisDimensionCatalog {
    const byId: Record<string, AnalysisDimensionDefinition> = {};
    const canonicalIds: string[] = [];
    for (const [id, def] of Object.entries(CANONICAL_ANALYSIS_DIMENSIONS)) {
        byId[id] = def;
        canonicalIds.push(id);
    }

    const registeredIds: string[] = [];
    const rejected: AnalysisDimensionValidation[] = [];
    const list = Array.isArray(registered) ? registered : [];
    for (const def of list) {
        const validation = validateAnalysisDimensionDefinition(def);
        if (!validation.valid || validation.id === null) {
            rejected.push(validation);
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(byId, validation.id)) {
            rejected.push(
                Object.freeze({
                    id: validation.id,
                    valid: false,
                    errors: Object.freeze([
                        `id '${validation.id}' já registrado — a primeira definição válida vence`,
                    ]) as readonly string[],
                }),
            );
            continue;
        }
        byId[validation.id] = freezeDefinition(def as AnalysisDimensionDefinition);
        registeredIds.push(validation.id);
    }

    const version =
        typeof options.version === 'number' && Number.isFinite(options.version)
            ? options.version
            : ANALYSIS_DIMENSION_CATALOG_VERSION;

    return Object.freeze({
        byId: Object.freeze(byId),
        ids: Object.freeze([...canonicalIds, ...registeredIds]) as readonly string[],
        canonicalIds: Object.freeze(canonicalIds) as readonly string[],
        registeredIds: Object.freeze(registeredIds) as readonly string[],
        rejected: Object.freeze(rejected) as readonly AnalysisDimensionValidation[],
        version,
    });
}

/**
 * O catálogo com APENAS as 4 dimensões canônicas — o default que reproduz o
 * comportamento do delta antes do CFG-26 (zero regressão).
 */
export const DEFAULT_ANALYSIS_DIMENSION_CATALOG: EffectiveAnalysisDimensionCatalog =
    buildEffectiveAnalysisDimensionCatalog();

/**
 * Definição de uma dimensão no catálogo efetivo, ou `null` quando o id é
 * desconhecido (o delta então não inventa coluna nenhuma — N3).
 */
export function resolveAnalysisDimension(
    catalog: EffectiveAnalysisDimensionCatalog | null | undefined,
    id: string | null | undefined,
): AnalysisDimensionDefinition | null {
    if (!isNonEmptyString(id)) return null;
    const cat = catalog ?? DEFAULT_ANALYSIS_DIMENSION_CATALOG;
    return cat.byId[id] ?? null;
}

/** Guard-rail N9: o usuário só ESCOLHE dimensões que o catálogo curado conhece. */
export function isValidAnalysisDimension(
    catalog: EffectiveAnalysisDimensionCatalog | null | undefined,
    id: string | null | undefined,
): boolean {
    return resolveAnalysisDimension(catalog, id) !== null;
}

/**
 * Procedência de uma dimensão (CFG-26): canônica (curada em código, imutável)
 * ou registrada por dado, com a fonte do fator e a versão da curadoria.
 * `null` quando o id não está no catálogo.
 */
export function analysisDimensionProvenance(
    catalog: EffectiveAnalysisDimensionCatalog | null | undefined,
    id: string | null | undefined,
): AnalysisDimensionProvenance | null {
    const cat = catalog ?? DEFAULT_ANALYSIS_DIMENSION_CATALOG;
    const def = resolveAnalysisDimension(cat, id);
    if (!def) return null;
    const origin = cat.canonicalIds.includes(def.id) ? 'canonical' : 'registered';
    return Object.freeze({
        origin: origin as 'canonical' | 'registered',
        source: def.source,
        version: origin === 'canonical' ? ANALYSIS_DIMENSION_CATALOG_VERSION : cat.version,
    });
}

/**
 * `true` quando SUBIR o valor desta dimensão é melhora. Para um id fora do
 * catálogo devolve `false` — exatamente o que o `deltaDirecao` pré-CFG-26 fazia
 * com qualquer id que não fosse 'ecbtScore' (zero regressão).
 *
 * @param catalog - Catálogo efetivo; omitido → só as canônicas.
 * @param id - Id da dimensão.
 */
export function dimensionUpIsBetter(
    catalog: EffectiveAnalysisDimensionCatalog | null | undefined,
    id: string | null | undefined,
): boolean {
    const def = resolveAnalysisDimension(catalog, id);
    return def !== null && def.polarity === 'higherIsBetter';
}

/** Rota duck-typed com os fatores por dimensão registrada (fórmula-mãe §5.1-c). */
export interface DimensionFactorRoute {
    /** Fração de alocação α da rota. */
    readonly alpha?: number;
    /** Fator por unidade de A(t) para cada dimensão registrada (id → fator). */
    readonly dimensionFactors?: Readonly<Record<string, number | null>> | null;
}

/**
 * Valor de uma dimensão REGISTRADA pela fórmula-mãe (§5.1-c):
 * `Σ_rotas(α_rota × fator_rota × A(t))` — a MESMA álgebra das dimensões
 * canônicas, para que a dimensão nova não ganhe aritmética própria (N4).
 *
 * Rotas sem fator para esta dimensão simplesmente não contribuem; se NENHUMA
 * rota declarar o fator, o resultado é `null` (semDado — N3), nunca um 0
 * forjado que fingiria uma medição que ninguém fez.
 *
 * @param dimensionId - Id da dimensão registrada.
 * @param routes - Rotas do processo (α + `dimensionFactors`).
 * @param activity - Driver de atividade A(t).
 * @returns O valor agregado, ou `null` quando não há fator nenhum.
 */
export function aggregateExtraDimensionValue(
    dimensionId: string,
    routes: ReadonlyArray<DimensionFactorRoute> | null | undefined,
    activity: number,
): number | null {
    if (!isNonEmptyString(dimensionId) || !Array.isArray(routes)) return null;
    if (!isFiniteNumber(activity)) return null;
    let total = 0;
    let contributed = false;
    for (const route of routes) {
        if (!route || typeof route !== 'object') continue;
        const factors = route.dimensionFactors;
        if (!factors || typeof factors !== 'object') continue;
        if (!Object.prototype.hasOwnProperty.call(factors, dimensionId)) continue;
        const factor = factors[dimensionId];
        if (!isFiniteNumber(factor)) continue;
        const share = isFiniteNumber(route.alpha) ? route.alpha : 0;
        total += share * factor * activity;
        contributed = true;
    }
    return contributed ? total : null;
}

/**
 * Valores de TODAS as dimensões registradas de um catálogo, pela fórmula-mãe.
 * Só as registradas — as canônicas continuam vindo dos motores que sempre as
 * produziram (ERP/ECBT/ODS), que este módulo não reimplementa (N4).
 *
 * @param catalog - Catálogo efetivo.
 * @param routes - Rotas do processo.
 * @param activity - Driver de atividade A(t).
 * @returns Mapa congelado id→valor (`null` para dimensão sem fator).
 */
export function aggregateExtraDimensions(
    catalog: EffectiveAnalysisDimensionCatalog | null | undefined,
    routes: ReadonlyArray<DimensionFactorRoute> | null | undefined,
    activity: number,
): Readonly<Record<string, number | null>> {
    const cat = catalog ?? DEFAULT_ANALYSIS_DIMENSION_CATALOG;
    const out: Record<string, number | null> = {};
    for (const id of cat.registeredIds) {
        out[id] = aggregateExtraDimensionValue(id, routes, activity);
    }
    return Object.freeze(out);
}
