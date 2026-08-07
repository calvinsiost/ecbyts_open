// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RESULT REGISTRY — catálogo curado de RESULTADOS (peça B do Motor de
   Pergunta Genérico, SCENARIOS-PROCESS-IMPACT §5.3-a/§5.3-d).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
   - §5.3-a (B) — RESULTADO = "o que eu observo": uma dimensão de saída
     (CAPEX, OPEX, ECBT, ODS, e as registradas por dado do CFG-26).
     Generaliza o Impacto_d da §5.1.
   - §5.3-e guard-rail 3 — ODS e ECBT são "sistema de verdade": aqui eles
     TÊM lugar — como RESULTADO (o usuário os interroga), nunca como
     alavanca (ver _leverRegistryPure.SYSTEM_OF_TRUTH_PREFIXES).
   - N3 — extrair devolve null (semDado) quando a métrica não existe;
     nunca 0 forjado.

   REUSO: lê a forma RealScenarioMetrics do motor
   (_scenarioImpactEnginePure) ESTRUTURALMENTE (sem importá-lo — módulo
   build-free). A direção "bom" (melhoraQuandoSobe) replica a tabela
   LOWER_IS_BETTER já curada em _scenarioComparatorVMPure
   (capex/opex: menor é melhor; ecbt: maior é melhor).

   BUILD-FREE (TEST-HEALTH-001#9): TS-only, sem mirror de build; testes
   via `node --experimental-strip-types --test`. Se ganhar mirror, este
   arquivo não tem imports relativos a ajustar.

   ZERO DOM, ZERO IO, determinístico.
   ================================================================ */

/**
 * Forma mínima das métricas de um cenário que os resultados leem —
 * estruturalmente `RealScenarioMetrics` (motor de impacto), mantida
 * estrutural para preservar a pureza deste catálogo.
 */
export interface ResultMetricsLike {
    /** CAPEX (R$). null = semDado (N3). */
    readonly capex: number | null;
    /** OPEX (R$/ano). null = semDado. */
    readonly opex: number | null;
    /** ECBT Score V_net (R$). null = semDado. */
    readonly ecbt: number | null;
    /** ODS afetados (cada um com goal + impact score [0,1] | null). */
    readonly ods?: ReadonlyArray<{
        readonly goal: number;
        readonly impact?: number | null;
    }> | null;
    /** Dimensões registradas por dado (CFG-26), id → valor. */
    readonly extras?: Readonly<Record<string, number | null>> | null;
}

/**
 * UM RESULTADO do catálogo (peça B, §5.3-a). `extrair` lê UMA dimensão das
 * métricas; `melhoraQuandoSobe` define a direção do "bom" (sinal do delta).
 */
export interface ResultDef {
    /** Id estável (ex.: 'ecbtScore', 'capex', 'ods:13', 'extra:health'). */
    readonly id: string;
    /** Chave i18n do nome leigo. */
    readonly nomeKey: string;
    /** Unidade curta (ex.: 'R$', 'R$/ano', 'índice [0,1]'). */
    readonly unidade: string;
    /** Direção do "bom" (LOWER_IS_BETTER invertido). */
    readonly melhoraQuandoSobe: boolean;
    /**
     * Lê a dimensão das métricas de UM cenário.
     * @param metrics - métricas do cenário (base ou alternativo).
     * @returns o valor da dimensão, ou null (semDado — N3, nunca 0 forjado).
     */
    readonly extrair: (metrics: ResultMetricsLike) => number | null;
}

function finiteOrNull(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * CATÁLOGO CURADO das dimensões monetárias canônicas (guard-rail §5.3-e-1).
 * Direções = LOWER_IS_BETTER do comparador: CAPEX/OPEX melhoram quando
 * caem; ECBT Score melhora quando sobe. Congelado.
 */
export const RESULT_REGISTRY: readonly ResultDef[] = Object.freeze([
    Object.freeze({
        id: 'capex',
        nomeKey: 'scenarios.result.capex',
        unidade: 'R$',
        melhoraQuandoSobe: false,
        extrair: (m: ResultMetricsLike) => finiteOrNull(m?.capex),
    }),
    Object.freeze({
        id: 'opex',
        nomeKey: 'scenarios.result.opex',
        unidade: 'R$/ano',
        melhoraQuandoSobe: false,
        extrair: (m: ResultMetricsLike) => finiteOrNull(m?.opex),
    }),
    Object.freeze({
        id: 'ecbtScore',
        nomeKey: 'scenarios.result.ecbtScore',
        unidade: 'R$',
        melhoraQuandoSobe: true,
        extrair: (m: ResultMetricsLike) => finiteOrNull(m?.ecbt),
    }),
]);

const ODS_ID_PATTERN = /^ods:(\d{1,2})$/;
const EXTRA_ID_PATTERN = /^extra:([a-zA-Z][\w-]*)$/;

/**
 * Resolve um resultado do catálogo — as 3 dimensões canônicas + duas
 * famílias dinâmicas curadas:
 * - `ods:<goal>` (goal 1..17) — o impact score [0,1] do ODS; sistema de
 *   verdade como RESULTADO (guard-rail §5.3-e-3). melhoraQuandoSobe=true
 *   (score de condição ambiental/social maior = melhor).
 * - `extra:<dim>` — dimensão registrada por dado (CFG-26), lida de
 *   `metrics.extras`; null (semDado) quando nenhuma rota declara o fator.
 *
 * @param id - id do resultado.
 * @returns a definição, ou null quando fora do catálogo (N8: nunca inventa).
 */
export function resolveResult(id: string): ResultDef | null {
    if (typeof id !== 'string') return null;
    const canonical = RESULT_REGISTRY.find((r) => r.id === id);
    if (canonical) return canonical;

    const odsMatch = ODS_ID_PATTERN.exec(id);
    if (odsMatch) {
        const goal = Number(odsMatch[1]);
        if (goal < 1 || goal > 17) return null;
        return Object.freeze({
            id,
            nomeKey: `scenarios.result.ods.${goal}`,
            unidade: 'índice [0,1]',
            melhoraQuandoSobe: true,
            extrair: (m: ResultMetricsLike) => {
                const entry = m?.ods?.find((o) => o.goal === goal);
                return finiteOrNull(entry?.impact);
            },
        });
    }

    const extraMatch = EXTRA_ID_PATTERN.exec(id);
    if (extraMatch) {
        const dim = extraMatch[1] as string;
        return Object.freeze({
            id,
            nomeKey: `scenarios.result.extra.${dim}`,
            unidade: '',
            melhoraQuandoSobe: false,
            extrair: (m: ResultMetricsLike) => finiteOrNull(m?.extras?.[dim]),
        });
    }

    return null;
}
