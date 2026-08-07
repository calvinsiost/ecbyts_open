// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO HORIZON — pure-logic (CFG-09, TEMA D).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-09 — "Horizonte de projeção configurável (não travado em
       2030/2050/2100). O tipo fechado vira FAIXA: o usuário escolhe qualquer
       ano-marco entre o ano-base e um teto (ex.: 2035, 2045), com 2030 como
       default. Testável: horizonte=2045 → série anual ano-base→2045."
     - §5.2 (a) — horizonte por marcos institucionais (2030 Agenda/TG, 2050
       net-zero, 2100 SSP longo), série ANUAL do ano-base ao horizonte.

   O QUE FALTAVA (verificado antes de escrever): o horizonte NÃO era um
   parâmetro do cenário — era duas coisas independentes, cada uma travada de
   um jeito diferente:
     1. `_scenarioProjectionPure.ts` tipava `TimeHorizon = 2030 | 2050 | 2100`,
        uma UNIÃO FECHADA: 2045 era literalmente inexprimível. E o laço
        `for (year = baseYear; year <= horizon)` não validava nada — horizonte
        anterior ao ano-base devolvia série VAZIA em silêncio.
     2. `_scenarioNpvPure.ts` tinha `horizonYears` (forma RELATIVA), sem teto
        (H = 1e9 travaria o laço de PV) e sem nenhuma ligação com o ano-marco
        absoluto da projeção.
   Resultado: dois horizontes, dois defaults (5 anos vs. marco), nenhuma
   conversão entre eles. Este módulo é a peça única que faltava — resolve UM
   pedido de horizonte nas DUAS representações (ano-marco absoluto + duração
   relativa), dentro de uma faixa validada.

   NÃO é motor: não projeta, não desconta, não calcula. Só RESOLVE o parâmetro
   (mesmo papel de `resolveEcbtScenarioConfig` no CFG-24) — os motores
   (`_scenarioProjectionPure`, `_scenarioNpvPure`) passam a consumir daqui em
   vez de cada um cravar o seu.

   Faixa (guard-rail, não palpite): mínimo 1 ano (série anual precisa de ao
   menos um passo) e teto de 100 anos a partir do ano-base — o mesmo horizonte
   que o GWP-100 do IPCC integra (§5.2 b) e que cobre o marco SSP longo de 2100
   a partir de qualquer ano-base moderno. Pedido acima do teto é CLAMPADO (com
   `adjusted=true`, visível), pedido inutilizável cai no default do consumidor.

   N3 (nunca inventar dado): um ano-marco ABSOLUTO só vira duração se houver
   ÂNCORA (ano-base). Sem âncora o `horizonYear` volta `null` — o módulo não
   inventa um ano-base para fechar a conta.

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

// ───────────────────────────── Faixa curada ─────────────────────────────

/**
 * Marcos institucionais CURADOS (§5.2 a) — SUGESTÕES para a tela, NÃO a lista
 * fechada de valores aceitos (era exatamente esse fechamento que o CFG-09
 * derruba). Qualquer ano dentro da faixa é aceito.
 */
export const CURATED_HORIZON_MILESTONES: readonly number[] = Object.freeze([2030, 2050, 2100]);

/** Marco default (§5.2 a): 2030 — Agenda 2030/ODS e horizonte original do TG. */
export const DEFAULT_HORIZON_MILESTONE = 2030;

/** Duração mínima da série (uma série anual precisa de ao menos 1 passo). */
export const MIN_HORIZON_YEARS = 1;

/** Teto de projeção: 100 anos (janela do GWP-100 do IPCC, §5.2 b). */
export const MAX_HORIZON_YEARS = 100;

/** Duração usada quando o consumidor não declara outra (legado do ΔNPV S1). */
export const DEFAULT_HORIZON_YEARS = 5;

// ───────────────────────────── Tipos ─────────────────────────────

/**
 * Pedido de horizonte. As duas formas são aceitas; `horizonYear` (ano-marco
 * ABSOLUTO, o que o usuário escolhe na tela) tem PRECEDÊNCIA sobre
 * `horizonYears` (duração relativa, a forma que o cálculo de PV consome).
 */
export interface HorizonSpec {
    /** Ano-base t₀ da série (âncora). Sem ele não há conversão absoluto↔relativo. */
    readonly baseYear?: number | undefined;
    /** Ano-marco absoluto do horizonte — QUALQUER ano na faixa (CFG-09). */
    readonly horizonYear?: number | undefined;
    /** Horizonte em ANOS após t₀ (forma relativa). */
    readonly horizonYears?: number | undefined;
}

/** Defaults do CONSUMIDOR (cada motor tem o seu; o módulo não impõe um só). */
export interface HorizonDefaults {
    /** Ano-base assumido quando o pedido não declara. */
    readonly baseYear?: number | undefined;
    /** Duração assumida quando o pedido não declara nada utilizável. */
    readonly horizonYears?: number | undefined;
}

/** Horizonte resolvido — a MESMA faixa nas duas representações. */
export interface ResolvedHorizon {
    /** Ano-base t₀; `null` quando o consumidor trabalha só em anos relativos. */
    readonly baseYear: number | null;
    /** Ano-marco absoluto; `null` sem âncora (N3 — não se inventa t₀). */
    readonly horizonYear: number | null;
    /** Duração da série em anos após t₀ — SEMPRE resolvida, dentro da faixa. */
    readonly horizonYears: number;
    /** `true` quando o pedido não pôde ser honrado (fora da faixa / sem âncora). */
    readonly adjusted: boolean;
    /** `true` quando o ano-marco resolvido é um dos marcos curados (§5.2 a). */
    readonly milestone: boolean;
}

// ───────────────────────────── Helpers ─────────────────────────────

/** Ano/duração como inteiro finito, ou `null` (N3: NaN/Infinity nunca viram valor). */
function finiteIntOrNull(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

/**
 * Duração (anos) do ano-base até um marco institucional, dentro da faixa.
 * Serve de default para consumidores que pensam em ANO-MARCO (a projeção
 * §5.2) em vez de duração — ex.: ano-base 2026 + marco 2030 ⇒ 4 anos.
 *
 * @param baseYear - Ano-base t₀ da série.
 * @param milestone - Ano-marco desejado (default 2030, §5.2 a).
 * @returns Duração em anos, clampada em [MIN_HORIZON_YEARS, MAX_HORIZON_YEARS].
 */
export function horizonYearsToMilestone(
    baseYear: number,
    milestone: number = DEFAULT_HORIZON_MILESTONE,
): number {
    const b = finiteIntOrNull(baseYear);
    const m = finiteIntOrNull(milestone);
    if (b === null || m === null) return DEFAULT_HORIZON_YEARS;
    return Math.min(MAX_HORIZON_YEARS, Math.max(MIN_HORIZON_YEARS, m - b));
}

/**
 * O ano-marco pedido cabe na faixa projetável a partir do ano-base? Guard-rail
 * para a tela (CFG-11) validar a escolha ANTES de chamar o motor.
 *
 * @param baseYear - Ano-base t₀ da série.
 * @param horizonYear - Ano-marco absoluto pedido.
 * @returns `true` se `horizonYear − baseYear` está em [MIN, MAX] anos.
 */
export function isHorizonYearUsable(baseYear: number, horizonYear: number): boolean {
    const b = finiteIntOrNull(baseYear);
    const h = finiteIntOrNull(horizonYear);
    if (b === null || h === null) return false;
    const span = h - b;
    return span >= MIN_HORIZON_YEARS && span <= MAX_HORIZON_YEARS;
}

// ───────────────────────────── Resolução ─────────────────────────────

/**
 * Resolve UM pedido de horizonte nas duas representações (CFG-09) — a peça
 * que torna o horizonte um PARÂMETRO DO CENÁRIO em vez de uma constante
 * recravada em cada consumidor.
 *
 * Precedência: `horizonYear` (ano-marco absoluto, o que o usuário escolhe) >
 * `horizonYears` (duração) > default do consumidor. Um ano-marco só é
 * convertido em duração quando há ÂNCORA (`baseYear`); sem âncora o pedido
 * absoluto é descartado (com `adjusted=true`, nunca em silêncio) porque
 * inventar um t₀ seria fabricar dado (N3).
 *
 * Faixa: pedido < 1 ano é INUTILIZÁVEL (cai no default do consumidor); pedido
 * acima de {@link MAX_HORIZON_YEARS} é CLAMPADO no teto. Nos dois casos
 * `adjusted=true` deixa o ajuste auditável.
 *
 * @param spec - O pedido de horizonte (ano-base, ano-marco e/ou duração).
 * @param defaults - Defaults do consumidor (cada motor tem o seu).
 * @returns {@link ResolvedHorizon} congelado — mesma faixa em ano e em duração.
 */
export function resolveHorizon(spec?: HorizonSpec, defaults?: HorizonDefaults): ResolvedHorizon {
    const baseYear = finiteIntOrNull(spec?.baseYear) ?? finiteIntOrNull(defaults?.baseYear);

    const fallbackRaw = finiteIntOrNull(defaults?.horizonYears);
    const fallback =
        fallbackRaw !== null && fallbackRaw >= MIN_HORIZON_YEARS
            ? Math.min(fallbackRaw, MAX_HORIZON_YEARS)
            : DEFAULT_HORIZON_YEARS;

    const yearRaw = finiteIntOrNull(spec?.horizonYear);
    const yearsRaw = finiteIntOrNull(spec?.horizonYears);
    const hadRequest = yearRaw !== null || yearsRaw !== null;

    // Ano-marco absoluto vira duração SÓ com âncora (N3: não se inventa t₀).
    let requested: number | null = null;
    if (yearRaw !== null && baseYear !== null) requested = yearRaw - baseYear;
    else if (yearsRaw !== null) requested = yearsRaw;

    let horizonYears = fallback;
    let adjusted = hadRequest;
    if (requested !== null && requested >= MIN_HORIZON_YEARS) {
        horizonYears = Math.min(requested, MAX_HORIZON_YEARS);
        adjusted = requested > MAX_HORIZON_YEARS;
    }

    const horizonYear = baseYear === null ? null : baseYear + horizonYears;
    return Object.freeze({
        baseYear,
        horizonYear,
        horizonYears,
        adjusted,
        milestone: horizonYear !== null && CURATED_HORIZON_MILESTONES.includes(horizonYear),
    });
}
