// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Pure-logic view-model do comparador de cenários (SCENARIOS-IMPACT-001).
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2 F1/F7, §5.1).
 *
 * ZERO DOM, ZERO IO, determinístico — testável isoladamente. Recebe as
 * métricas-resumo do cenário Base e do Alternativo e devolve o VM congelado
 * (delta + sinal por dimensão + ODS consolidados) que a UI renderiza.
 *
 * Semântica de sinal (§F7): em custos (CAPEX/OPEX) e nº de ODS afetados MENOS
 * é melhora; no ECBT Score (resultado líquido) MAIS é melhora. `delta === null`
 * (falta dado num dos lados) ⇒ 'semDado' — NUNCA forja 0 (N3 da spec).
 */

/** As 4 dimensões comparadas (ordem canônica da tabela). */
export type Dimension = 'capex' | 'opex' | 'ecbt' | 'ods';

/** Sinal qualitativo de um delta numa dimensão. */
export type DeltaSinal = 'melhora' | 'piora' | 'neutro' | 'semDado';

/** Um ODS afetado, com indicador oficial citável + fonte. */
export interface OdsImpacto {
    /** Número do Objetivo (1–17). */
    goal: number;
    /** Indicador oficial (ex.: '6.4.1'). */
    indicator: string;
    /** URL da fonte oficial (odsbrasil.gov.br). */
    source: string;
    /** Sinal do impacto sobre este ODS. */
    sinal: DeltaSinal;
}

/** Métricas-resumo de UM cenário (Base ou Alternativo). */
export interface ScenarioMetrics {
    /** Investimento (CAPEX) em R$. `null` = sem dado (N3, nunca 0 forjado). */
    capex: number | null;
    /** Custo operacional (OPEX) em R$/ano. `null` = sem dado. */
    opex: number | null;
    /** ECBT Score (resultado líquido) em R$. `null` = sem dado. */
    ecbt: number | null;
    /** ODS afetados por este cenário. */
    ods: OdsImpacto[];
}

/**
 * Forma mínima das métricas REAIS do motor (`_scenarioImpactEnginePure`) que a
 * VM precisa. Mantida estrutural (não importa o tipo do motor) para preservar a
 * pureza/independência deste módulo de VM. CAPEX/OPEX/ECBT podem ser `null`
 * (sem dado) e cada ODS carrega ao menos goal/indicator/source/sinal.
 */
export interface RealMetricsLike {
    readonly capex: number | null;
    readonly opex: number | null;
    readonly ecbt: number | null;
    readonly ods: ReadonlyArray<{
        readonly goal: number;
        readonly indicator: string;
        readonly source: string;
        readonly sinal: DeltaSinal;
    }>;
}

/** Uma célula da tabela (uma dimensão): base, alt, delta, sinal, unidade. */
export interface ScenarioCell {
    /** Valor base, ou null quando ausente. */
    base: number | null;
    /** Valor alternativo, ou null quando ausente. */
    alt: number | null;
    /** alt − base, ou null quando algum lado é ausente. */
    delta: number | null;
    /** Sinal qualitativo do delta. */
    sinal: DeltaSinal;
    /** Unidade curta exibida (ex.: 'R$', 'R$/ano', ''). */
    unidade: string;
}

/**
 * As 3 parcelas monetizadas que compõem o veredito consolidado (S1 — para o
 * tooltip/detalhe). Cada parcela é a CONTRIBUIÇÃO (com sinal já normalizado)
 * dessa dimensão ao valor econômico-ambiental de ciclo de vida — não o delta
 * cru. `null` = a dimensão não tinha dado nos dois lados (N3, nunca 0 forjado).
 */
export interface ConsolidatedParcels {
    /** Contribuição do ΔCAPEX (investimento): custo → entra como −ΔCAPEX. */
    capex: number | null;
    /** Contribuição do ΔOPEX (custo operacional): custo → entra como −ΔOPEX. */
    opex: number | null;
    /** Contribuição do ΔECBT (resultado líquido monetizado): entra como +ΔECBT. */
    ecbt: number | null;
}

/**
 * Veredito ÚNICO consolidado (S1 — decisão Calvin 2026-07-08): combina
 * ΔCAPEX + ΔOPEX + ΔECBT monetizado num único valor econômico-ambiental de ciclo
 * de vida, com a DECOMPOSIÇÃO das 3 parcelas exposta para o tooltip/detalhe.
 *
 * Convenção de sinal (coerente com a semântica do comparador, §F7): o veredito é
 * um GANHO LÍQUIDO econômico-ambiental — mais é melhor. Aumento de custo
 * (CAPEX/OPEX) reduz o veredito; melhora do resultado líquido (ECBT) o aumenta:
 *
 *   valor = ΔECBT − ΔCAPEX − ΔOPEX
 *
 * `valor === null` (+ `semDado=true`) quando QUALQUER das 3 parcelas não tem dado
 * nos dois lados — nunca se forja 0 para uma parcela ausente (N3). O tooltip usa
 * `parcelas` para mostrar quanto cada dimensão contribuiu.
 */
export interface ConsolidatedVerdict {
    /** Valor único econômico-ambiental (R$). null = sem dado (N3). */
    valor: number | null;
    /** Sinal qualitativo do veredito (melhora = ganho líquido). */
    sinal: DeltaSinal;
    /** Decomposição das 3 parcelas (para o tooltip/detalhe). */
    parcelas: ConsolidatedParcels;
    /** True iff alguma parcela faltou dado (veredito = null). */
    semDado: boolean;
    /** Unidade curta exibida (R$). */
    unidade: string;
}

/** View-model completo do comparador (4 dimensões + ODS + veredito consolidado). */
export interface ScenarioComparatorVM {
    /** Uma célula por dimensão. */
    dims: Record<Dimension, ScenarioCell>;
    /** Lista consolidada e ordenada de ODS afetados (base ∪ alt). */
    odsAfetados: OdsImpacto[];
    /**
     * Veredito ÚNICO consolidado (ΔCAPEX+ΔOPEX+ΔECBT monetizado) com decomposição
     * das 3 parcelas para o tooltip/detalhe (S1). null quando falta parcela (N3).
     */
    consolidado: ConsolidatedVerdict;
}

/** Parâmetros de processo que parametrizam um cenário-stub. */
export interface ScenarioParams {
    /** Subtipo produtivo. */
    subtype: 'mining' | 'petroleum';
    /** Vazão (t/h). */
    throughput: number;
    /** Taxa de recuperação (0–1). */
    recoveryRate: number;
    /** Rendimento (0–1). */
    yield: number;
}

/** Um cenário-stub determinístico completo (seed + params + métricas). */
export interface StubScenario {
    /** Semente textual reprodutível. */
    seed: string;
    /** Parâmetros de processo. */
    params: ScenarioParams;
    /** Métricas-resumo derivadas. */
    metrics: ScenarioMetrics;
}

/** Unidades canônicas por dimensão (rótulo curto exibido na tabela). */
const DIMENSION_UNITS: Record<Dimension, string> = Object.freeze({
    capex: 'R$',
    opex: 'R$/ano',
    ecbt: 'R$',
    ods: '',
});

/**
 * Dimensões onde MENOS é melhor (delta negativo = melhora): custos.
 * ECBT é o contrário (mais resultado líquido = melhora). Esta tabela é a
 * fonte-da-verdade da semântica de sinal (§F7 da spec).
 */
const LOWER_IS_BETTER: Record<Dimension, boolean> = Object.freeze({
    capex: true,
    opex: true,
    ecbt: false,
    ods: true,
});

/**
 * Resolve o sinal qualitativo de um delta numérico numa dimensão.
 * `delta === null` (sem dado em algum lado) → 'semDado'. `delta === 0` → 'neutro'.
 * Caso contrário aplica LOWER_IS_BETTER para decidir melhora/piora.
 */
function resolveSinal(dim: Dimension, delta: number | null): DeltaSinal {
    if (delta === null || !Number.isFinite(delta)) return 'semDado';
    if (delta === 0) return 'neutro';
    const lowerIsBetter = LOWER_IS_BETTER[dim];
    const isImprovement = lowerIsBetter ? delta < 0 : delta > 0;
    return isImprovement ? 'melhora' : 'piora';
}

/**
 * Monta UMA célula da dimensão a partir dos valores base/alt.
 * delta = alt − base, mas SOMENTE quando ambos os lados têm número finito;
 * caso contrário delta = null e sinal = 'semDado' (N3 — sem 0 forjado).
 */
function buildCell(dim: Dimension, base: number | null, alt: number | null): ScenarioCell {
    const hasBoth =
        typeof base === 'number' && Number.isFinite(base) && typeof alt === 'number' && Number.isFinite(alt);
    const delta = hasBoth ? (alt as number) - (base as number) : null;
    return Object.freeze({
        base: typeof base === 'number' && Number.isFinite(base) ? base : null,
        alt: typeof alt === 'number' && Number.isFinite(alt) ? alt : null,
        delta,
        sinal: resolveSinal(dim, delta),
        unidade: DIMENSION_UNITS[dim],
    });
}

/**
 * Resolve a lista de ODS afetados combinando os ODS do base e do alternativo.
 * Une por (goal, indicator); o sinal vem do lado alternativo quando presente
 * (é o cenário mutado que "afeta" o ODS), senão herda o do base.
 */
function buildOdsAfetados(base: OdsImpacto[], alt: OdsImpacto[]): OdsImpacto[] {
    const byKey = new Map<string, OdsImpacto>();
    for (const o of base) byKey.set(`${o.goal}:${o.indicator}`, o);
    for (const o of alt) byKey.set(`${o.goal}:${o.indicator}`, o);
    return Object.freeze(
        Array.from(byKey.values())
            .map((o) => Object.freeze({ ...o }))
            .sort((a, b) => a.goal - b.goal || a.indicator.localeCompare(b.indicator)),
    ) as OdsImpacto[];
}

/**
 * Monta o veredito ÚNICO consolidado (S1) a partir das células de CAPEX, OPEX e
 * ECBT. Combina as 3 parcelas monetizadas num único valor econômico-ambiental de
 * ciclo de vida (`ΔECBT − ΔCAPEX − ΔOPEX`, mais = melhora) e expõe a decomposição
 * das 3 parcelas para o tooltip/detalhe.
 *
 * Rigor N3: se QUALQUER das 3 parcelas não tem delta (sem dado num dos lados), o
 * veredito é `null` (+ `semDado=true`) — nunca se soma um 0 forjado por uma
 * parcela ausente. A decomposição ainda mostra o que existe (parcelas presentes
 * ficam com seu valor; ausentes ficam `null`).
 */
function buildConsolidatedVerdict(
    capex: ScenarioCell,
    opex: ScenarioCell,
    ecbt: ScenarioCell,
): ConsolidatedVerdict {
    // Contribuição de cada parcela, com o sinal já normalizado para "mais = melhor":
    // custos entram negativos (aumento de custo piora), ECBT entra positivo.
    const pCapex = capex.delta === null ? null : -capex.delta;
    const pOpex = opex.delta === null ? null : -opex.delta;
    const pEcbt = ecbt.delta === null ? null : ecbt.delta;

    const parcelas: ConsolidatedParcels = Object.freeze({ capex: pCapex, opex: pOpex, ecbt: pEcbt });

    // N3: sem TODAS as 3 parcelas presentes não há veredito consolidado honesto.
    const allPresent = pCapex !== null && pOpex !== null && pEcbt !== null;
    const valor = allPresent ? (pEcbt as number) + (pCapex as number) + (pOpex as number) : null;

    // Sinal: mais = melhora (é um ganho líquido econômico-ambiental).
    let sinal: DeltaSinal;
    if (valor === null || !Number.isFinite(valor)) sinal = 'semDado';
    else if (valor === 0) sinal = 'neutro';
    else sinal = valor > 0 ? 'melhora' : 'piora';

    return Object.freeze({
        valor,
        sinal,
        parcelas,
        semDado: !allPresent,
        unidade: 'R$',
    });
}

/**
 * Constrói o view-model do comparador a partir das métricas-resumo do cenário
 * base e do alternativo. Calcula delta e sinal por dimensão, consolida os ODS e
 * monta o veredito ÚNICO consolidado com decomposição (S1).
 *
 * @param base - Métricas do cenário base (modelo original).
 * @param alt - Métricas do cenário alternativo (após a mutação).
 * @returns VM congelado pronto para a tabela comparadora renderizar.
 */
export function buildScenarioComparatorVM(base: ScenarioMetrics, alt: ScenarioMetrics): ScenarioComparatorVM {
    const dims: Record<Dimension, ScenarioCell> = {
        capex: buildCell('capex', base.capex, alt.capex),
        opex: buildCell('opex', base.opex, alt.opex),
        ecbt: buildCell('ecbt', base.ecbt, alt.ecbt),
        ods: buildCell('ods', base.ods.length > 0 ? base.ods.length : null, alt.ods.length > 0 ? alt.ods.length : null),
    };
    return Object.freeze({
        dims: Object.freeze(dims),
        odsAfetados: buildOdsAfetados(base.ods, alt.ods),
        consolidado: buildConsolidatedVerdict(dims.capex, dims.opex, dims.ecbt),
    });
}

/**
 * Adapta as métricas REAIS do motor (`computeRealScenarioMetrics`) para o
 * formato `ScenarioMetrics` que a VM consome. É a ponte stub→real: a UI passa a
 * popular as colunas com números calculados de verdade (CAPEX/OPEX via ERP,
 * ECBT via computeEcbtScore, ODS via os medidores oficiais) sem mudar a tabela.
 *
 * Preserva N3: `null` continua `null` (sem dado) — nunca 0 forjado.
 *
 * @param real - Métricas reais do motor (capex/opex/ecbt podem ser null).
 * @returns `ScenarioMetrics` pronto para `buildScenarioComparatorVM`.
 */
export function realMetricsToScenarioMetrics(real: RealMetricsLike): ScenarioMetrics {
    const ods: OdsImpacto[] = (real.ods ?? []).map((o) =>
        Object.freeze({
            goal: o.goal,
            indicator: o.indicator,
            source: o.source,
            sinal: o.sinal,
        }),
    );
    return Object.freeze({
        capex: typeof real.capex === 'number' && Number.isFinite(real.capex) ? real.capex : null,
        opex: typeof real.opex === 'number' && Number.isFinite(real.opex) ? real.opex : null,
        ecbt: typeof real.ecbt === 'number' && Number.isFinite(real.ecbt) ? real.ecbt : null,
        ods: Object.freeze(ods) as OdsImpacto[],
    });
}

/**
 * Atalho: monta o VM do comparador diretamente a partir das métricas REAIS de
 * Base e Alternativo (saídas do motor). Equivalente a adaptar cada lado com
 * `realMetricsToScenarioMetrics` e chamar `buildScenarioComparatorVM`.
 *
 * @param baseReal - Métricas reais do cenário base (sem mutação).
 * @param altReal - Métricas reais do cenário alternativo (após a mutação).
 * @returns VM congelado pronto para a tabela comparadora.
 */
export function buildRealScenarioComparatorVM(
    baseReal: RealMetricsLike,
    altReal: RealMetricsLike,
): ScenarioComparatorVM {
    return buildScenarioComparatorVM(
        realMetricsToScenarioMetrics(baseReal),
        realMetricsToScenarioMetrics(altReal),
    );
}

// ---------------------------------------------------------------------------
// STUB determinístico — só para a UI demonstrar o fluxo nesta fase UI-First.
// ---------------------------------------------------------------------------

/**
 * Hash determinístico simples (FNV-1a 32-bit) de uma string seed → inteiro.
 * Determinístico e sem dependências — mesmo seed sempre gera o mesmo cenário.
 */
function seedHash(seed: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** PRNG determinístico (mulberry32) a partir de um inteiro de estado. */
function mulberry32(state: number): () => number {
    let a = state >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Catálogo de ODS-stub citáveis (mineração) — característica → indicador oficial. */
const STUB_ODS: ReadonlyArray<Omit<OdsImpacto, 'sinal'>> = Object.freeze([
    { goal: 6, indicator: '6.4.1', source: 'https://odsbrasil.gov.br/objetivo/objetivo?n=6' },
    { goal: 12, indicator: '12.5.1', source: 'https://odsbrasil.gov.br/objetivo/objetivo?n=12' },
    { goal: 13, indicator: '13.2.2', source: 'https://odsbrasil.gov.br/objetivo/objetivo?n=13' },
    { goal: 8, indicator: '8.5.1', source: 'https://odsbrasil.gov.br/objetivo/objetivo?n=8' },
]);

/** Sobrescritas opcionais para gerar o cenário alternativo a partir das mutações. */
export interface StubOverrides {
    subtype?: 'mining' | 'petroleum';
    throughput?: number;
    recoveryRate?: number;
    yield?: number;
}

/**
 * Gera um cenário-stub realista e DETERMINÍSTICO a partir de um seed textual.
 * Mesmo seed → mesmo cenário (reprodutível). Usado pela UI desta fase para
 * popular a coluna Base ao "clonar o modelo atual". As métricas são plausíveis
 * para uma operação de mineração mas NÃO são dado real — a álgebra real liga
 * numa fase seguinte (a UI já estará pronta).
 *
 * @param seed - Semente textual (ex.: 'base-default'). Determinístico.
 * @param overrides? - Sobrescreve as 3 taxas para gerar o cenário alternativo
 *   a partir das mutações do usuário, mantendo a base custo↔taxa coerente.
 */
export function buildStubScenario(seed: string, overrides?: StubOverrides): StubScenario {
    const rnd = mulberry32(seedHash(seed));
    const subtype = overrides?.subtype ?? 'mining';
    // Taxas plausíveis (faixas de mineração) determinísticas a partir do seed.
    const throughput = overrides?.throughput ?? Math.round(800 + rnd() * 1200); // t/h
    const recoveryRate = overrides?.recoveryRate ?? Number((0.7 + rnd() * 0.2).toFixed(3)); // 0.70–0.90
    const yld = overrides?.yield ?? Number((0.55 + rnd() * 0.3).toFixed(3)); // 0.55–0.85
    // Custos plausíveis ligados às taxas (mais throughput → mais CAPEX; menor
    // recuperação → mais OPEX por tonelada útil). NÃO é a fórmula real, é um
    // proxy determinístico coerente para a demonstração de pixels.
    const capex = Math.round(throughput * 1.0e4 * (0.9 + rnd() * 0.2)); // R$
    const opex = Math.round(throughput * 365 * 24 * (1 - recoveryRate) * 12); // R$/ano
    const ecbt = Math.round(capex * 0.15 * yld - opex * 0.6); // R$ líquido (proxy)
    const odsSinal: DeltaSinal = recoveryRate >= 0.8 ? 'melhora' : 'neutro';
    const ods = STUB_ODS.map((o) => Object.freeze({ ...o, sinal: odsSinal })) as OdsImpacto[];
    return Object.freeze({
        seed,
        params: Object.freeze({ subtype, throughput, recoveryRate, yield: yld }),
        metrics: Object.freeze({ capex, opex, ecbt, ods: Object.freeze(ods) as OdsImpacto[] }),
    });
}
