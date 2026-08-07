// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SCENARIO METHANE RECOVERY SCHEDULE — recuperação de metano variável no
   tempo (CFG-30, TEMA G, domínio RSU/aterro).

   SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
     - §2.4 CFG-30 — "Recuperação de metano variável no tempo (ramp-up anos 1–5,
       como no TG). Hoje a característica é estática. Vira curva configurável
       (ex.: captura crescendo até um platô), dentro de faixa validada.
       Testável: curva de recuperação 0%→75% em 5 anos → emissão líquida cai ano
       a ano."
     - §2.4.0 #5 — toda faixa numérica traz a norma/fonte que a fundamenta.

   O QUE FALTAVA: a taxa de recuperação era um ESCALAR — uma única eficiência de
   captura para o horizonte inteiro. Não havia como dizer "o sistema de captura
   entra em operação no ano 1 e sobe até o platô no ano 5", que é como um projeto
   de aproveitamento de biogás realmente acontece: a malha de drenos cresce com
   as células do aterro, o soprador é dimensionado por etapa, e a cobertura final
   (que é o que segura o gás) só chega quando a célula encerra.

   O QUE ESTE MÓDULO FAZ: generaliza o escalar R para uma função escada R(y), a
   taxa da FASE vigente no ano `y` — a MESMA forma do cronograma de crescimento
   do CFG-10 (`_scenarioGrowthPure.ts`), deliberadamente. Com uma fase só, R(y) é
   constante e a conta volta a ser exatamente a de hoje (zero regressão).

   SEMÂNTICA DE FASE — `fromYear` é o ano A PARTIR do qual a taxa passa a valer.
   Com `[{fromYear:2026,recovery:0},{fromYear:2031,recovery:0.75}]` e ano-base
   2026: nada é capturado de 2026 a 2030, e a captura vira 75% EM 2031.

   ─── N3 — a escolha para "fase ausente" (a MESMA do CFG-10, de propósito) ───

   Entre fases não há lacuna: uma fase VIGE até a próxima começar (é a definição
   de função escada). A única lacuna possível é de CABEÇA: anos entre o ano-base
   e o `fromYear` da primeira fase declarada. Para ela a escolha é ANCORAR a
   primeira fase no ano-base, NÃO assumir recuperação 0. Razão:

     - assumir 0 seria AFIRMAR um fato que o usuário não deu ("não captura
       nada"), exatamente o zero-forjado que o N3 proíbe em toda a base — e aqui
       o zero forjado é o pior possível: infla a emissão líquida;
     - devolver semDado apodreceria a curva inteira por um detalhe de
       configuração;
     - ancorar só REUSA um número que o próprio usuário forneceu.

   Manter a mesma política do CFG-10 é parte do ponto: dois módulos de cronograma
   irmãos com regras N3 opostas seriam uma armadilha para quem lê os dois.

   A escolha é reversível e explícita: quem quer cabeça sem captura declara
   `{fromYear: anoBase, recovery: 0}` — que é exatamente o que
   {@link buildRecoveryRamp} monta sozinho. E o ajuste nunca é silencioso: o
   resultado carrega `anchored`, `clamped` e `rejected` para auditoria.

   Fase com `recovery`/`fromYear` não-finito é DESCARTADA (contada em
   `rejected`), nunca coagida a 0. Se todas caírem, vale o escalar de fallback
   (= comportamento de hoje).

   ─── Faixa validada: por que 0..1 não precisa de citação externa ───

   A taxa é a FRAÇÃO do metano gerado que o sistema captura. Ela não pode ser
   negativa (captura negativa não existe) nem passar de 1 (não se captura gás que
   não foi gerado). O limite é DEFINICIONAL, não empírico — e dizer isso é mais
   honesto que pendurar a citação de um relatório que fala de outra coisa. O que
   é empírico é a eficiência PLAUSÍVEL de um projeto real, e essa entra como dado
   do usuário ou como preset curado, com fonte declarada (abaixo).

   ZERO DOM, ZERO IO, determinístico. Objetos retornados congelados.
   ================================================================ */

// ───────────────────────────── Faixa validada ─────────────────────────────

/** Piso da taxa de recuperação: 0 — nada capturado. Captura negativa não existe. */
export const MIN_RECOVERY_RATE = 0;

/** Teto da taxa de recuperação: 1 — não se captura gás que não foi gerado. */
export const MAX_RECOVERY_RATE = 1;

/**
 * Taxa default: 0 (nenhuma captura) — o default do motor quando ninguém informa
 * recuperação. Diferente do CFG-29: aqui o zero NÃO é forjado, é a ausência de
 * um sistema de captura, que é o estado default de um local de disposição.
 */
export const DEFAULT_RECOVERY_RATE = 0;

// ───────────────────────────── Tipos ─────────────────────────────

/** Uma FASE de recuperação: a taxa vale a partir de `fromYear` (inclusive). */
export interface RecoveryPhase {
    /** Ano (ABSOLUTO) a partir do qual a taxa passa a governar a captura. */
    readonly fromYear: number;
    /** Fração do metano gerado capturada nesta fase (0..1). */
    readonly recovery: number;
}

/** Cronograma resolvido — o que de fato governa a curva (auditável). */
export interface ResolvedRecoverySchedule {
    /** Fases normalizadas: `fromYear` crescente, sem duplicata, ancoradas. */
    readonly phases: ReadonlyArray<RecoveryPhase>;
    /** `true` com mais de uma fase — a captura MUDA ao longo do horizonte. */
    readonly phased: boolean;
    /** `true` quando a 1ª fase foi ancorada no ano-base (havia lacuna de cabeça). */
    readonly anchored: boolean;
    /** Nº de fases com taxa fora de 0–1, trazidas para dentro da faixa. */
    readonly clamped: number;
    /** Nº de fases descartadas por dado não-finito (N3 — nunca coagidas a 0). */
    readonly rejected: number;
    /**
     * `true` quando um cronograma por fase foi DESCARTADO por falta de ano-base
     * (as fases são anos ABSOLUTOS; sem âncora não há onde encaixá-las) — nesse
     * caso vale o escalar de fallback, e o descarte fica visível aqui.
     */
    readonly unanchored: boolean;
}

// ───────────────────────────── Helpers ─────────────────────────────

/** Número finito ou `null` (N3: NaN/Infinity nunca viram valor). */
function finiteOrNull(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Ano como inteiro finito, ou `null`. */
function finiteIntOrNull(v: unknown): number | null {
    const n = finiteOrNull(v);
    return n === null ? null : Math.floor(n);
}

/** Traz a taxa para a faixa validada (§ MIN/MAX_RECOVERY_RATE). */
export function clampRecoveryRate(r: number): number {
    return Math.min(MAX_RECOVERY_RATE, Math.max(MIN_RECOVERY_RATE, r));
}

/** Cronograma de uma fase só (o caso constante — comportamento de hoje). */
function constantSchedule(
    rate: number,
    baseYear: number | null,
    extra: { readonly unanchored?: boolean; readonly rejected?: number } = {},
): ResolvedRecoverySchedule {
    const raw = finiteOrNull(rate) ?? DEFAULT_RECOVERY_RATE;
    const value = clampRecoveryRate(raw);
    return Object.freeze({
        phases: Object.freeze([
            Object.freeze({ fromYear: baseYear ?? 0, recovery: value }),
        ]) as ReadonlyArray<RecoveryPhase>,
        phased: false,
        anchored: false,
        clamped: value !== raw ? 1 : 0,
        rejected: extra.rejected ?? 0,
        unanchored: extra.unanchored === true,
    });
}

// ───────────────────────────── Resolução ─────────────────────────────

/**
 * Resolve a recuperação de metano num cronograma normalizado (CFG-30). Aceita as
 * duas formas: o ESCALAR de hoje (uma fase, captura constante) ou um ARRAY de
 * fases `{fromYear, recovery}` (a captura muda nos anos de virada).
 *
 * Normalização (a MESMA do CFG-10): fases com dado não-finito são descartadas
 * (`rejected`, nunca viram 0); taxa fora de 0–1 é trazida para dentro
 * (`clamped`); as fases são ordenadas por `fromYear` e, havendo repetição do
 * mesmo ano, a ÚLTIMA declarada vence; e a primeira fase é ANCORADA no ano-base
 * se começar depois dele — a escolha N3 documentada no cabeçalho.
 *
 * Sem ano-base um cronograma por fase é descartado (`unanchored`), porque
 * `fromYear` é ano ABSOLUTO e não há onde encaixá-lo; vale então o escalar.
 *
 * @param schedule - Array de fases, ou `undefined` para usar só o escalar.
 * @param baseYear - Ano-base t₀ da série (âncora); `null` = série sem âncora.
 * @param fallbackRate - Taxa escalar usada quando não há cronograma utilizável.
 * @returns {@link ResolvedRecoverySchedule} congelado, com os ajustes visíveis.
 */
export function resolveRecoverySchedule(
    schedule: ReadonlyArray<RecoveryPhase> | undefined,
    baseYear: number | null,
    fallbackRate: number = DEFAULT_RECOVERY_RATE,
): ResolvedRecoverySchedule {
    if (!Array.isArray(schedule) || schedule.length === 0) {
        return constantSchedule(fallbackRate, baseYear);
    }
    // Fases são anos ABSOLUTOS: sem âncora não há onde encaixá-las (visível).
    if (baseYear === null) {
        return constantSchedule(fallbackRate, baseYear, { unanchored: true });
    }

    let rejected = 0;
    let clamped = 0;
    const byYear = new Map<number, number>();
    for (const phase of schedule) {
        const year = phase && typeof phase === 'object' ? finiteIntOrNull(phase.fromYear) : null;
        const rawRate = phase && typeof phase === 'object' ? finiteOrNull(phase.recovery) : null;
        // N3: fase sem dado utilizável sai fora — não vira 0 nem ano forjado.
        if (year === null || rawRate === null) {
            rejected += 1;
            continue;
        }
        const rate = clampRecoveryRate(rawRate);
        if (rate !== rawRate) clamped += 1;
        byYear.set(year, rate); // mesmo ano declarado 2×: a última vence (CFG-10).
    }

    if (byYear.size === 0) return constantSchedule(fallbackRate, baseYear, { rejected });

    const sorted = [...byYear.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([fromYear, recovery]) => ({ fromYear, recovery }));

    // Lacuna de CABEÇA → ancora a 1ª fase no ano-base (escolha N3 documentada).
    const first = sorted[0] as { fromYear: number; recovery: number };
    const anchored = first.fromYear > baseYear;
    if (anchored) first.fromYear = baseYear;

    return Object.freeze({
        phases: Object.freeze(sorted.map((p) => Object.freeze(p))) as ReadonlyArray<RecoveryPhase>,
        phased: sorted.length > 1,
        anchored,
        clamped,
        rejected,
        unanchored: false,
    });
}

// ───────────────────────────── Consulta ─────────────────────────────

/**
 * Taxa de recuperação vigente no ano `year`. É a última fase cujo
 * `fromYear ≤ year`; antes da primeira fase vale a própria primeira
 * (carry-backward, a mesma escolha N3 do ancoramento).
 *
 * @param schedule - Cronograma já resolvido.
 * @param year - Ano (absoluto) consultado.
 * @returns A fração capturada naquele ano (0 se o cronograma estiver vazio).
 */
export function recoveryRateAt(schedule: ResolvedRecoverySchedule, year: number): number {
    const phases = schedule.phases;
    if (phases.length === 0) return DEFAULT_RECOVERY_RATE;
    let current = (phases[0] as RecoveryPhase).recovery;
    for (const phase of phases) {
        if (phase.fromYear > year) break;
        current = phase.recovery;
    }
    return current;
}

/**
 * Metano CAPTURADO no ano (o que vira energia/flare): `gerado × R(ano)`.
 *
 * @param grossMethaneT - Metano gerado no ano (t CH₄). Não-finito/negativo → `null`.
 * @param schedule - Cronograma já resolvido.
 * @param year - Ano (absoluto).
 * @returns t CH₄ capturadas, ou `null` sem dado utilizável (N3 — nunca zero forjado).
 */
export function capturedMethaneAt(
    grossMethaneT: number,
    schedule: ResolvedRecoverySchedule,
    year: number,
): number | null {
    if (typeof grossMethaneT !== 'number' || !Number.isFinite(grossMethaneT) || grossMethaneT < 0) {
        return null;
    }
    if (!Number.isFinite(year)) return null;
    return grossMethaneT * recoveryRateAt(schedule, year);
}

/**
 * Metano EMITIDO no ano, líquido da captura: `gerado × (1 − R(ano))`. É esta a
 * série que a cláusula testável do CFG-30 exige que caia ano a ano enquanto a
 * curva de recuperação sobe.
 *
 * @param grossMethaneT - Metano gerado no ano (t CH₄). Não-finito/negativo → `null`.
 * @param schedule - Cronograma já resolvido.
 * @param year - Ano (absoluto).
 * @returns t CH₄ emitidas, ou `null` sem dado utilizável (N3).
 */
export function netMethaneAt(
    grossMethaneT: number,
    schedule: ResolvedRecoverySchedule,
    year: number,
): number | null {
    const captured = capturedMethaneAt(grossMethaneT, schedule, year);
    if (captured === null) return null;
    return grossMethaneT - captured;
}

// ───────────────────────── Curva de ramp-up ─────────────────────────

/** Parâmetros de uma rampa linear de captura (o "ramp-up anos 1–5" do item). */
export interface RecoveryRampSpec {
    /** Ano-base t₀: o primeiro ano da rampa. */
    readonly baseYear: number;
    /** Nº de PASSOS anuais até o platô (5 = platô no ano-base + 5). */
    readonly years: number;
    /** Taxa no ano-base (default 0 — sistema ainda não operando). */
    readonly from?: number;
    /** Taxa no platô. */
    readonly to: number;
}

/**
 * Monta as fases de uma rampa LINEAR de captura, do ano-base ao platô — a forma
 * "captura crescendo até um platô" que o item nomeia.
 *
 * Emite `years + 1` fases (do ano-base ao ano do platô, inclusive), cada uma com
 * a taxa daquele ano. A primeira fase é sempre o ano-base, então a curva NUNCA
 * depende do ancoramento: quem usa este helper declara a cabeça explicitamente.
 *
 * @param spec - Ano-base, nº de passos, taxa inicial e taxa de platô.
 * @returns Array congelado de {@link RecoveryPhase}; VAZIO quando os parâmetros
 *   não são utilizáveis (N3 — sem rampa inventada; o chamador cai no escalar).
 */
export function buildRecoveryRamp(spec: RecoveryRampSpec): ReadonlyArray<RecoveryPhase> {
    const baseYear = finiteIntOrNull(spec?.baseYear);
    const years = finiteIntOrNull(spec?.years);
    const to = finiteOrNull(spec?.to);
    const fromRaw = spec?.from === undefined ? MIN_RECOVERY_RATE : finiteOrNull(spec.from);
    if (baseYear === null || years === null || years < 0 || to === null || fromRaw === null) {
        return Object.freeze([]);
    }
    const from = clampRecoveryRate(fromRaw);
    const target = clampRecoveryRate(to);
    const phases: RecoveryPhase[] = [];
    for (let step = 0; step <= years; step += 1) {
        // years = 0 → degrau único no platô (sem divisão por zero).
        const fraction = years === 0 ? 1 : step / years;
        phases.push(
            Object.freeze({
                fromYear: baseYear + step,
                recovery: from + (target - from) * fraction,
            }),
        );
    }
    return Object.freeze(phases);
}

// ───────────────────────── Preset curado ─────────────────────────

/** Uma curva de recuperação curada, com a procedência dos seus números. */
export interface RecoveryPresetDef {
    /** Chave estável do preset. */
    readonly preset: string;
    /** Chave i18n do rótulo (convenção de catálogo curado do repo). */
    readonly nameKey: string;
    /** Taxa no ano-base. */
    readonly from: number;
    /** Taxa no platô. */
    readonly to: number;
    /** Nº de passos anuais até o platô. */
    readonly years: number;
    /**
     * Procedência DOS NÚMEROS ACIMA. Nunca ''. Curva sem fonte declarada não
     * entra no catálogo curado.
     */
    readonly source: string;
}

const CURADORIA_CFG30 =
    'Curadoria do projeto, versionada — SPEC_SCENARIOS_PROCESS_IMPACT.md §2.4 CFG-30 ("ramp-up anos 1-5", curva 0%->75% em 5 anos). NAO e citacao de levantamento externo: a eficiencia de captura plausivel de um projeto real e dado do usuario, e entra pela curva dele';

/**
 * Catálogo curado de curvas (N8: o usuário ESCOLHE da lista e ajusta). Traz a
 * curva do PRÓPRIO enunciado do CFG-30, para que ela não precise ser redigitada
 * a cada chamada. Ampliar exige trazer os números COM a fonte. Congelado.
 */
export const DEFAULT_RECOVERY_PRESETS: Readonly<Record<string, RecoveryPresetDef>> = Object.freeze({
    // A curva nomeada pela própria §2.4 CFG-30: 0% → 75% em 5 anos.
    ramp5y75: Object.freeze({
        preset: 'ramp5y75',
        nameKey: 'scenarioRecovery.ramp5y75',
        from: 0,
        to: 0.75,
        years: 5,
        source: CURADORIA_CFG30,
    }),
});

/** Versão do catálogo curado — trilha de auditoria da curadoria (N9). */
export const RECOVERY_PRESET_VERSION = 1;

/**
 * Resolve uma chave para o preset de curva curado.
 *
 * @param preset - Chave pedida.
 * @returns O {@link RecoveryPresetDef}, ou `null` fora do catálogo — JAMAIS um
 *   preset default silencioso (N3: pedido inexistente não vira outra curva).
 */
export function resolveRecoveryPreset(preset?: string | null): RecoveryPresetDef | null {
    if (typeof preset !== 'string') return null;
    const key = preset.trim();
    return Object.prototype.hasOwnProperty.call(DEFAULT_RECOVERY_PRESETS, key)
        ? (DEFAULT_RECOVERY_PRESETS[key] as RecoveryPresetDef)
        : null;
}

/** Todos os presets do catálogo (para validação e para o seletor da UI). */
export function listRecoveryPresets(): readonly string[] {
    return Object.freeze(Object.keys(DEFAULT_RECOVERY_PRESETS));
}

/**
 * Monta as fases de um preset curado ancorado num ano-base.
 *
 * @param preset - Chave do preset curado.
 * @param baseYear - Ano-base t₀ onde a curva começa.
 * @returns Fases da curva, ou VAZIO quando o preset não existe (N3) — o chamador
 *   cai no escalar, nunca em outra curva escolhida por engano.
 */
export function buildPresetRamp(
    preset: string | null | undefined,
    baseYear: number,
): ReadonlyArray<RecoveryPhase> {
    const def = resolveRecoveryPreset(preset);
    if (def === null) return Object.freeze([]);
    return buildRecoveryRamp({ baseYear, years: def.years, from: def.from, to: def.to });
}
