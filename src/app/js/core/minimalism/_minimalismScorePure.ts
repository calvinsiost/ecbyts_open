// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   MINIMALISM SCORE — métrica programática de RUÍDO de UI
   UI-MINIMALISM-001. Calvin 2026-06-15: "criar spec de user friendly
   UI e minimalismo… começar pela tela do print".

   Pesquisa/provenance (§10/§14 da spec):
   - Nielsen NN/g heurística #8 "Aesthetic and Minimalist Design";
     Progressive Disclosure.
   - Tufte, E. — "The Visual Display of Quantitative Information"
     (data-ink ratio: maximizar tinta-de-dado, não esvaziar a tela).

   ORTOGONAL ao Friendliness (KQ1): friendliness mede FACILIDADE; este
   mede RUÍDO. Uma tela pode ser amigável E verbosa. Espelha o padrão
   não-compensatório do `_friendlinessScorePure` (média geométrica
   ponderada + penalidade severidade×alcance + veto blocker→F + grade
   A-F + sensibilidade OECD). Determinístico — sem DOM, sem rede, sem
   THREE; mesma entrada → mesmo resultado.
   ================================================================ */

export type ClutterDimension =
    // razão essencial-à-tarefa / decorativo (Tufte data-ink ratio).
    | 'signal_to_noise'
    // info repetida (mesma string/valor exibido ≥2×; ex.: "Local" 3×).
    | 'redundancy'
    // texto que podia ser curto/icônico (rótulos longos, frases negativas).
    | 'verbosity'
    // avançado sempre-visível (controles raros no estado default).
    | 'progressive_disclosure'
    // ação/info primária se destaca (existe 1 CTA primário claro?).
    | 'visual_hierarchy'
    // a tela faz 1 job ou vários (≥3 concerns distintos = job-mixing).
    | 'concern_cohesion'
    // guia quando vazio ("0 X" sem CTA; negativo-only "sem Y").
    | 'empty_state_clarity';

export type ClutterSeverity = 'blocker' | 'slows' | 'annoys';

export interface ClutterFinding {
    readonly id: string;
    readonly dimension: ClutterDimension;
    readonly severity: ClutterSeverity;
    /** Quantos tipos de usuário/personas afetados (>=1). NN/G frequência. */
    readonly reach?: number;
    readonly resolved?: boolean;
    /** Tela/rota responsável (módulo/área) — habilita breakdown por tela. */
    readonly screen?: string;
    /** Evidência objetiva do sinal (ex.: "Local exibido 3×"). */
    readonly evidence?: string;
    readonly note?: string;
}

export const MINIMALISM_DIMENSIONS: ReadonlyArray<ClutterDimension> = Object.freeze([
    'signal_to_noise',
    'redundancy',
    'verbosity',
    'progressive_disclosure',
    'visual_hierarchy',
    'concern_cohesion',
    'empty_state_clarity',
]);

/** Penalidade base por severidade (pontos de ruído). ~8 blockers zeram uma dim.
 *  Mesma razão 3:1 entre tiers do friendliness (auditável à mão, não ML). */
export const SEVERITY_PENALTY: Readonly<Record<ClutterSeverity, number>> = Object.freeze({
    blocker: 12,
    slows: 4,
    annoys: 1,
});

/** Peso por dimensão na agregação. Mantidos iguais (1.0) — a sensibilidade
 *  (computeMinimalismSensitivity) mostra o impacto de variar os pesos. */
export const DIMENSION_WEIGHT: Readonly<Record<ClutterDimension, number>> = Object.freeze({
    signal_to_noise: 1,
    redundancy: 1,
    verbosity: 1,
    progressive_disclosure: 1,
    visual_hierarchy: 1,
    concern_cohesion: 1,
    empty_state_clarity: 1,
});

/** Grade A≥90 / B≥80 / C≥70 / D≥60 / F (espelha friendliness/Maze). */
export const GRADE_THRESHOLDS = Object.freeze([
    { grade: 'A', min: 90 },
    { grade: 'B', min: 80 },
    { grade: 'C', min: 70 },
    { grade: 'D', min: 60 },
    { grade: 'F', min: 0 },
] as const);

/** Teto do overall quando há >=1 bloqueio não-resolvido (veto, anti-N1).
 *  Ex.: painel com ≥3 concerns distintos = job-mixing → não pode ser A/B. */
export const BLOCKER_VETO_CAP = 79;
/** Multiplicador de alcance por unidade acima de 1 (NN/G). Clamp em CAP. */
const REACH_STEP = 0.15;
const REACH_CAP = 2.0;
/** Epsilon para evitar ln(0) na média geométrica. */
const GEO_EPSILON = 1;

export type MinimalismGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface DimensionScore {
    readonly dimension: ClutterDimension;
    readonly score: number;
    readonly penalty: number;
    readonly openFindings: number;
    readonly blockers: number;
}

export interface MinimalismScoreResult {
    readonly overall: number;
    readonly grade: MinimalismGrade;
    readonly vetoApplied: boolean;
    readonly perDimension: ReadonlyArray<DimensionScore>;
    readonly topOffenders: ReadonlyArray<{ id: string; dimension: ClutterDimension; penalty: number }>;
    /** IDs dos bloqueios abertos (job-mixing/destrutivo-sem-confirm). */
    readonly blockers: ReadonlyArray<string>;
    readonly totals: {
        readonly findings: number;
        readonly open: number;
        readonly resolved: number;
        readonly openBlockers: number;
        readonly screensWithClutter: number;
        readonly resolvedCreditPct: number;
    };
}

/**
 * Pesos/parâmetros injetáveis (padrão do friendliness/integrity). Habilita a
 * análise de sensibilidade — passo de robustez que o OECD/JRC Handbook on
 * Composite Indicators exige (arXiv 2008.13637 "should policy makers trust
 * composite indices").
 */
export interface MinimalismOptions {
    readonly severityWeight?: Partial<Record<ClutterSeverity, number>>;
    readonly dimensionWeight?: Partial<Record<ClutterDimension, number>>;
    readonly reachStep?: number;
    /** 'geometric' (não-compensatório, default) | 'arithmetic' (compensatório). */
    readonly aggregation?: 'geometric' | 'arithmetic';
}

function _reachFactor(reach: unknown, reachStep: number): number {
    const r = typeof reach === 'number' && Number.isFinite(reach) && reach >= 1 ? reach : 1;
    return Math.min(REACH_CAP, 1 + reachStep * (r - 1));
}

/** Penalidade de um finding (0 se resolvido ou inválido). Pesos injetáveis. */
export function findingPenalty(
    f: ClutterFinding,
    severityWeight: Record<ClutterSeverity, number> = SEVERITY_PENALTY,
    reachStep: number = REACH_STEP,
): number {
    if (!f || f.resolved) return 0;
    const base = severityWeight[f.severity];
    if (base == null) return 0;
    return base * _reachFactor(f.reach, reachStep);
}

function _gradeFor(score: number): MinimalismGrade {
    for (const t of GRADE_THRESHOLDS) {
        if (score >= t.min) return t.grade;
    }
    return 'F';
}

/**
 * Calcula o minimalism score a partir de findings estruturados de ruído.
 * Determinístico: mesma entrada → mesmo resultado.
 */
export function computeMinimalismScore(
    findings: ReadonlyArray<ClutterFinding>,
    opts: MinimalismOptions = {},
): MinimalismScoreResult {
    const list = Array.isArray(findings) ? findings : [];
    const severityWeight = { ...SEVERITY_PENALTY, ...(opts.severityWeight || {}) };
    const dimensionWeight = { ...DIMENSION_WEIGHT, ...(opts.dimensionWeight || {}) };
    const reachStep = typeof opts.reachStep === 'number' ? opts.reachStep : REACH_STEP;
    const aggregation = opts.aggregation === 'arithmetic' ? 'arithmetic' : 'geometric';

    const penaltyByDim = new Map<ClutterDimension, number>();
    const openByDim = new Map<ClutterDimension, number>();
    const blockersByDim = new Map<ClutterDimension, number>();
    for (const d of MINIMALISM_DIMENSIONS) {
        penaltyByDim.set(d, 0);
        openByDim.set(d, 0);
        blockersByDim.set(d, 0);
    }

    let resolved = 0;
    let openBlockers = 0;
    const blockerIds: string[] = [];
    const screensWithClutter = new Set<string>();
    const offenders: Array<{ id: string; dimension: ClutterDimension; penalty: number }> = [];

    for (const f of list) {
        if (!f || !MINIMALISM_DIMENSIONS.includes(f.dimension)) continue;
        if (f.resolved) {
            resolved++;
            continue;
        }
        const p = findingPenalty(f, severityWeight, reachStep);
        penaltyByDim.set(f.dimension, (penaltyByDim.get(f.dimension) || 0) + p);
        openByDim.set(f.dimension, (openByDim.get(f.dimension) || 0) + 1);
        if (f.severity === 'blocker') {
            blockersByDim.set(f.dimension, (blockersByDim.get(f.dimension) || 0) + 1);
            openBlockers++;
            blockerIds.push(f.id);
        }
        if (typeof f.screen === 'string' && f.screen.trim()) screensWithClutter.add(f.screen.trim());
        offenders.push({ id: f.id, dimension: f.dimension, penalty: Math.round(p * 100) / 100 });
    }

    const perDimension: DimensionScore[] = MINIMALISM_DIMENSIONS.map((dimension) => {
        const penalty = penaltyByDim.get(dimension) || 0;
        const score = Math.max(0, Math.min(100, 100 - penalty));
        return Object.freeze({
            dimension,
            score: Math.round(score * 100) / 100,
            penalty: Math.round(penalty * 100) / 100,
            openFindings: openByDim.get(dimension) || 0,
            blockers: blockersByDim.get(dimension) || 0,
        });
    });

    // Agregação. Default NÃO-COMPENSATÓRIA (média geométrica ponderada): impede
    // "comprar" minimalismo bom numa dimensão escondendo job-mixing grave.
    // 'arithmetic' existe só p/ a sensibilidade demonstrar o ganho da escolha.
    let lnSum = 0;
    let arithSum = 0;
    let wSum = 0;
    for (const d of perDimension) {
        const w = dimensionWeight[d.dimension] ?? 1;
        lnSum += w * Math.log(d.score + GEO_EPSILON);
        arithSum += w * d.score;
        wSum += w;
    }
    let overall =
        wSum <= 0
            ? 0
            : aggregation === 'arithmetic'
              ? arithSum / wSum
              : Math.exp(lnSum / wSum) - GEO_EPSILON;
    overall = Math.max(0, Math.min(100, overall));

    // Veto: bloqueio aberto (job-mixing/destrutivo-sem-confirm) capa o overall.
    const vetoApplied = openBlockers > 0 && overall > BLOCKER_VETO_CAP;
    if (vetoApplied) overall = BLOCKER_VETO_CAP;
    overall = Math.round(overall * 100) / 100;

    offenders.sort((a, b) => b.penalty - a.penalty || a.id.localeCompare(b.id));
    const findingsTotal = resolved + offenders.length;

    return Object.freeze({
        overall,
        grade: _gradeFor(overall),
        vetoApplied,
        perDimension: Object.freeze(perDimension),
        topOffenders: Object.freeze(offenders.slice(0, 10)),
        blockers: Object.freeze(blockerIds.slice().sort()),
        totals: Object.freeze({
            findings: findingsTotal,
            open: offenders.length,
            resolved,
            openBlockers,
            screensWithClutter: screensWithClutter.size,
            resolvedCreditPct:
                findingsTotal > 0 ? Math.round((resolved / findingsTotal) * 1000) / 10 : 0,
        }),
    });
}

export interface DimensionBreakdown {
    readonly dimension: ClutterDimension;
    readonly score: number;
    readonly penalty: number;
    readonly openFindings: number;
    readonly blockers: number;
    readonly findingIds: ReadonlyArray<string>;
}

/**
 * Breakdown POR DIMENSÃO de ruído — qual tipo de clutter mais pesa. Mesma
 * penalidade severidade×alcance do score; score da dimensão = 100 − Σpenalidade.
 * Ordenado por dívida (penalidade desc) — o topo é "qual ruído drenar primeiro".
 * Resolvidos não entram (crédito já contado no overall).
 */
export function computeMinimalismByDimension(
    findings: ReadonlyArray<ClutterFinding>,
): ReadonlyArray<DimensionBreakdown> {
    const list = Array.isArray(findings) ? findings : [];
    const acc = new Map<ClutterDimension, { penalty: number; open: number; blockers: number; ids: string[] }>();
    for (const d of MINIMALISM_DIMENSIONS) acc.set(d, { penalty: 0, open: 0, blockers: 0, ids: [] });

    for (const f of list) {
        if (!f || f.resolved || !MINIMALISM_DIMENSIONS.includes(f.dimension)) continue;
        const e = acc.get(f.dimension)!;
        e.penalty += findingPenalty(f);
        e.open += 1;
        if (f.severity === 'blocker') e.blockers += 1;
        e.ids.push(f.id);
    }

    const out: DimensionBreakdown[] = [];
    for (const [dimension, e] of acc) {
        out.push(
            Object.freeze({
                dimension,
                score: Math.round(Math.max(0, Math.min(100, 100 - e.penalty)) * 100) / 100,
                penalty: Math.round(e.penalty * 100) / 100,
                openFindings: e.open,
                blockers: e.blockers,
                findingIds: Object.freeze(e.ids.slice().sort()),
            }),
        );
    }
    // Mais dívida primeiro; tiebreak determinístico por nome da dimensão.
    out.sort((a, b) => b.penalty - a.penalty || a.dimension.localeCompare(b.dimension));
    return Object.freeze(out);
}

export interface SensitivityScenario {
    readonly label: string;
    readonly overall: number;
    readonly grade: MinimalismGrade;
}

export interface MinimalismSensitivity {
    readonly baseline: { overall: number; grade: MinimalismGrade };
    readonly min: number;
    readonly max: number;
    readonly range: number;
    /** A nota NÃO muda em nenhum cenário? (índice de confiança do score). */
    readonly gradeStable: boolean;
    readonly distinctGrades: ReadonlyArray<MinimalismGrade>;
    readonly scenarios: ReadonlyArray<SensitivityScenario>;
    /** Verdito legível: robusto / sensível-a-pesos / sensível-à-agregação. */
    readonly verdict: 'robust' | 'weight_sensitive' | 'aggregation_sensitive';
}

/**
 * Análise de SENSIBILIDADE / robustez — o passo final do OECD/JRC Handbook on
 * Composite Indicators. Responde "o número é confiável ou é artefato dos pesos
 * arbitrários?". Perturba one-at-a-time (OAT): cada peso de severidade ±50%, o
 * fator de alcance, e troca a agregação geométrica↔aritmética (mostra o ganho
 * da escolha não-compensatória). Refs: arXiv 2008.13637; OECD Handbook 2008.
 */
export function computeMinimalismSensitivity(
    findings: ReadonlyArray<ClutterFinding>,
): MinimalismSensitivity {
    const base = computeMinimalismScore(findings);
    const scenarios: SensitivityScenario[] = [
        { label: 'baseline', overall: base.overall, grade: base.grade },
    ];

    const sevKeys: ClutterSeverity[] = ['blocker', 'slows', 'annoys'];
    for (const k of sevKeys) {
        for (const [tag, mult] of [['−50%', 0.5], ['+50%', 1.5]] as const) {
            const r = computeMinimalismScore(findings, {
                severityWeight: { [k]: SEVERITY_PENALTY[k] * mult },
            });
            scenarios.push({ label: `sev:${k} ${tag}`, overall: r.overall, grade: r.grade });
        }
    }
    // Alcance ignorado (reachStep 0) vs amplificado (0.3).
    for (const [tag, step] of [['reach:off', 0], ['reach:×2', 0.3]] as const) {
        const r = computeMinimalismScore(findings, { reachStep: step });
        scenarios.push({ label: tag, overall: r.overall, grade: r.grade });
    }
    // Escolha de agregação: compensatória (aritmética) vs não-compensatória.
    const arith = computeMinimalismScore(findings, { aggregation: 'arithmetic' });
    scenarios.push({ label: 'agg:arithmetic', overall: arith.overall, grade: arith.grade });

    const overalls = scenarios.map((s) => s.overall);
    const min = Math.min(...overalls);
    const max = Math.max(...overalls);
    const grades = scenarios.map((s) => s.grade);
    const distinct = [...new Set(grades)];
    const weightGrades = scenarios.filter((s) => s.label !== 'agg:arithmetic').map((s) => s.grade);
    const weightStable = new Set(weightGrades).size === 1;

    let verdict: MinimalismSensitivity['verdict'];
    if (distinct.length === 1) verdict = 'robust';
    else if (weightStable) verdict = 'aggregation_sensitive';
    else verdict = 'weight_sensitive';

    return Object.freeze({
        baseline: Object.freeze({ overall: base.overall, grade: base.grade }),
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        range: Math.round((max - min) * 100) / 100,
        gradeStable: distinct.length === 1,
        distinctGrades: Object.freeze(distinct),
        scenarios: Object.freeze(scenarios),
        verdict,
    });
}

/** Resumo de 1 linha para CLI/console. */
export function summarizeMinimalismScore(r: MinimalismScoreResult): string {
    const dims = r.perDimension.map((d) => `${(d.dimension[0] ?? '?')}=${d.score}`).join(' ');
    return `minimalism ${r.overall}/100 [${r.grade}]${r.vetoApplied ? ' (veto)' : ''} · ${dims} · open=${r.totals.open} (blockers=${r.totals.openBlockers}) · resolved=${r.totals.resolvedCreditPct}%`;
}
