// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   FRIENDLINESS SCORE — métrica programática de usabilidade
   FRIEND-SCORE-001. Calvin 2026-06-13: "crie um score programático".

   Pesquisa (.runtime/research/friendliness-score-2026-06-13.md):
   Google HEART + SUM (Maze) + Friction Score (Mouseflow) + UX Debt
   (NN/G severidade × frequência). Agregação NÃO-COMPENSATÓRIA (média
   geométrica) alinhada ao framework do autor (EIS/integrity/severity)
   — uma dimensão ruim NÃO é mascarada por outra boa.

   Consome findings ESTRUTURADOS (catalogados pela auditoria de personas
   + ui-ux-audit — zero re-walk) e produz um número determinístico 0-100,
   por dimensão + grade + ofensores. Sem DOM, sem rede, sem humano.
   ================================================================ */

export type FriendlinessDimension =
    | 'learnability'
    | 'efficiency'
    | 'error'
    | 'cognitive'
    | 'delight'
    // configurability (Calvin 2026-06-14 Via Negativa): atrito de ajuste —
    // settings que o usuário quer e não tem, hardcoded que devia ser
    // preferência, configurável mas escondido, OU over-config (decision
    // fatigue: settings que ninguém muda = smart default faltando).
    | 'configurability'
    // accessibility (FRIEND-SCORE-001 corrId 6252d1ad, 2026-06-15): fricção de
    // acessibilidade por axe-core (WCAG: contraste/teclado/ARIA/leitor de tela).
    // Antes os findings dessa dimensão eram DESCARTADOS sem aviso (axe-core
    // inerte); agora contam — um blocker de a11y derruba o score honestamente.
    | 'accessibility'
    // agent_experience (mesmo corrId): fricção p/ AGENTES de IA usarem o produto
    // (raw i18n keys, labels ausentes) — sinais de _autoSignalToFindingPure.
    | 'agent_experience';

export type FrictionSeverity = 'blocker' | 'slows' | 'annoys';

export interface FrictionFinding {
    readonly id: string;
    readonly dimension: FriendlinessDimension;
    readonly severity: FrictionSeverity;
    /** Quantos tipos de usuário/personas afetados (>=1). NN/G frequência. */
    readonly reach?: number;
    readonly resolved?: boolean;
    /** Seção de código responsável (módulo/área) — habilita breakdown por seção. */
    readonly section?: string;
    readonly note?: string;
}

export const FRIENDLINESS_DIMENSIONS: ReadonlyArray<FriendlinessDimension> = Object.freeze([
    'learnability',
    'efficiency',
    'error',
    'cognitive',
    'delight',
    'configurability',
    'accessibility',
    'agent_experience',
]);

/** Penalidade base por severidade (pontos de fricção). ~8 blockers zeram. */
export const SEVERITY_WEIGHT: Readonly<Record<FrictionSeverity, number>> = Object.freeze({
    blocker: 12,
    slows: 4,
    annoys: 1,
});

/** Peso por dimensão na agregação. SUM diz igual; mantemos igual (1.0). */
export const DIMENSION_WEIGHT: Readonly<Record<FriendlinessDimension, number>> = Object.freeze({
    learnability: 1,
    efficiency: 1,
    error: 1,
    cognitive: 1,
    delight: 1,
    configurability: 1,
    accessibility: 1,
    agent_experience: 1,
});

/** Grade calibrado pelos benchmarks Maze (≥90 pronto / 70-89 ajuste / <70 rework). */
export const GRADE_THRESHOLDS = Object.freeze([
    { grade: 'A', min: 90 },
    { grade: 'B', min: 80 },
    { grade: 'C', min: 70 },
    { grade: 'D', min: 60 },
    { grade: 'F', min: 0 },
] as const);

/** Teto do overall quando há >=1 bloqueio não-resolvido (veto, anti-N1). */
export const BLOCKER_VETO_CAP = 79;
/** Multiplicador de alcance por unidade acima de 1 (NN/G). Clamp em CAP. */
const REACH_STEP = 0.15;
const REACH_CAP = 2.0;
/** Epsilon para evitar ln(0) na média geométrica. */
const GEO_EPSILON = 1;

export interface DimensionScore {
    readonly dimension: FriendlinessDimension;
    readonly score: number;
    readonly penalty: number;
    readonly openFindings: number;
    readonly blockers: number;
}

export interface FriendlinessScoreResult {
    readonly overall: number;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    readonly vetoApplied: boolean;
    readonly perDimension: ReadonlyArray<DimensionScore>;
    readonly topOffenders: ReadonlyArray<{ id: string; dimension: FriendlinessDimension; penalty: number }>;
    readonly totals: {
        readonly findings: number;
        readonly open: number;
        readonly resolved: number;
        readonly openBlockers: number;
        readonly sectionsWithDebt: number;
        readonly resolvedCreditPct: number;
    };
}

/**
 * Pesos/parâmetros injetáveis (padrão do core/integrity/integrityScore).
 * Habilita a análise de sensibilidade — passo de robustez que o OECD/JRC
 * Handbook on Composite Indicators exige e que a literatura (arXiv 2008.13637
 * "should policy makers trust composite indices") aponta como crítico.
 */
export interface FriendlinessOptions {
    readonly severityWeight?: Partial<Record<FrictionSeverity, number>>;
    readonly dimensionWeight?: Partial<Record<FriendlinessDimension, number>>;
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
    f: FrictionFinding,
    severityWeight: Record<FrictionSeverity, number> = SEVERITY_WEIGHT,
    reachStep: number = REACH_STEP,
): number {
    if (!f || f.resolved) return 0;
    const base = severityWeight[f.severity];
    if (base == null) return 0;
    return base * _reachFactor(f.reach, reachStep);
}

function _gradeFor(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    for (const t of GRADE_THRESHOLDS) {
        if (score >= t.min) return t.grade;
    }
    return 'F';
}

/**
 * Calcula o friendliness score a partir de findings estruturados.
 * Determinístico: mesma entrada → mesmo resultado.
 */
export function computeFriendlinessScore(
    findings: ReadonlyArray<FrictionFinding>,
    opts: FriendlinessOptions = {},
): FriendlinessScoreResult {
    const list = Array.isArray(findings) ? findings : [];
    const severityWeight = { ...SEVERITY_WEIGHT, ...(opts.severityWeight || {}) };
    const dimensionWeight = { ...DIMENSION_WEIGHT, ...(opts.dimensionWeight || {}) };
    const reachStep = typeof opts.reachStep === 'number' ? opts.reachStep : REACH_STEP;
    const aggregation = opts.aggregation === 'arithmetic' ? 'arithmetic' : 'geometric';

    // Penalidade acumulada por dimensão + contadores.
    const penaltyByDim = new Map<FriendlinessDimension, number>();
    const openByDim = new Map<FriendlinessDimension, number>();
    const blockersByDim = new Map<FriendlinessDimension, number>();
    for (const d of FRIENDLINESS_DIMENSIONS) {
        penaltyByDim.set(d, 0);
        openByDim.set(d, 0);
        blockersByDim.set(d, 0);
    }

    let resolved = 0;
    let openBlockers = 0;
    const sectionsWithDebt = new Set<string>();
    const offenders: Array<{ id: string; dimension: FriendlinessDimension; penalty: number }> = [];

    for (const f of list) {
        if (!f || !FRIENDLINESS_DIMENSIONS.includes(f.dimension)) continue;
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
        }
        if (typeof f.section === 'string' && f.section.trim()) sectionsWithDebt.add(f.section.trim());
        offenders.push({ id: f.id, dimension: f.dimension, penalty: Math.round(p * 100) / 100 });
    }

    const perDimension: DimensionScore[] = FRIENDLINESS_DIMENSIONS.map((dimension) => {
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

    // Agregação. Default NÃO-COMPENSATÓRIA (média geométrica ponderada): uma
    // dimensão ruim não é mascarada. 'arithmetic' existe só p/ a sensitivity
    // demonstrar o ganho da escolha não-compensatória (OECD Handbook §6).
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

    // Veto: bloqueio aberto capa o overall (não pode ser A/B com bloqueio).
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
        totals: Object.freeze({
            findings: findingsTotal,
            open: offenders.length,
            resolved,
            openBlockers,
            sectionsWithDebt: sectionsWithDebt.size,
            resolvedCreditPct:
                findingsTotal > 0 ? Math.round((resolved / findingsTotal) * 1000) / 10 : 0,
        }),
    });
}

export interface SectionScore {
    readonly section: string;
    readonly score: number;
    readonly penalty: number;
    readonly openFindings: number;
    readonly blockers: number;
    /** Dimensões tocadas pelos findings abertos desta seção (ordenadas). */
    readonly dimensions: ReadonlyArray<FriendlinessDimension>;
    readonly findingIds: ReadonlyArray<string>;
}

/** Seção default quando um finding não declara `section`. */
export const UNASSIGNED_SECTION = 'unassigned';

/**
 * Agrega a fricção POR SEÇÃO DE CÓDIGO (Calvin 2026-06-13: "avaliar por
 * seção de código"). Mesma penalidade severidade×alcance do score por
 * dimensão; score da seção = 100 − Σpenalidade. Ordenado por dívida
 * (penalidade desc) — o topo é "qual pedaço do código precisa de UX".
 * Findings resolvidos não entram (crédito já contado no overall).
 */
export function computeFriendlinessBySection(
    findings: ReadonlyArray<FrictionFinding>,
): ReadonlyArray<SectionScore> {
    const list = Array.isArray(findings) ? findings : [];
    const acc = new Map<
        string,
        { penalty: number; open: number; blockers: number; dims: Set<FriendlinessDimension>; ids: string[] }
    >();

    for (const f of list) {
        if (!f || f.resolved || !FRIENDLINESS_DIMENSIONS.includes(f.dimension)) continue;
        const section = typeof f.section === 'string' && f.section.trim() ? f.section.trim() : UNASSIGNED_SECTION;
        let e = acc.get(section);
        if (!e) {
            e = { penalty: 0, open: 0, blockers: 0, dims: new Set(), ids: [] };
            acc.set(section, e);
        }
        e.penalty += findingPenalty(f);
        e.open += 1;
        if (f.severity === 'blocker') e.blockers += 1;
        e.dims.add(f.dimension);
        e.ids.push(f.id);
    }

    const out: SectionScore[] = [];
    for (const [section, e] of acc) {
        out.push(
            Object.freeze({
                section,
                score: Math.round(Math.max(0, Math.min(100, 100 - e.penalty)) * 100) / 100,
                penalty: Math.round(e.penalty * 100) / 100,
                openFindings: e.open,
                blockers: e.blockers,
                dimensions: Object.freeze([...e.dims].sort()),
                findingIds: Object.freeze(e.ids.slice().sort()),
            }),
        );
    }
    // Mais dívida primeiro; tiebreak determinístico por nome da seção.
    out.sort((a, b) => b.penalty - a.penalty || a.section.localeCompare(b.section));
    return Object.freeze(out);
}

export interface SensitivityScenario {
    readonly label: string;
    readonly overall: number;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface FriendlinessSensitivity {
    readonly baseline: { overall: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' };
    readonly min: number;
    readonly max: number;
    readonly range: number;
    /** A nota NÃO muda em nenhum cenário? (índice de confiança do score). */
    readonly gradeStable: boolean;
    readonly distinctGrades: ReadonlyArray<'A' | 'B' | 'C' | 'D' | 'F'>;
    readonly scenarios: ReadonlyArray<SensitivityScenario>;
    /** Verdito legível: robusto / sensível-a-pesos / sensível-à-agregação. */
    readonly verdict: 'robust' | 'weight_sensitive' | 'aggregation_sensitive';
}

/**
 * Análise de SENSIBILIDADE / robustez — o passo final do OECD/JRC Handbook on
 * Composite Indicators que os scores internos (incl. core/integrity, pesos
 * "provisional until Calibration Protocol") ainda pulavam. Responde "o número
 * é confiável ou é artefato dos pesos arbitrários?".
 *
 * Perturba one-at-a-time (OAT): cada peso de severidade ±50%, o fator de
 * alcance, e troca a agregação geométrica↔aritmética (mostra o ganho da
 * escolha não-compensatória). Se a NOTA não muda em nenhum cenário → robusto.
 * Refs: arXiv 2008.13637; OECD Handbook 2008 §Robustness.
 */
export function computeFriendlinessSensitivity(
    findings: ReadonlyArray<FrictionFinding>,
): FriendlinessSensitivity {
    const base = computeFriendlinessScore(findings);
    const scenarios: SensitivityScenario[] = [
        { label: 'baseline', overall: base.overall, grade: base.grade },
    ];

    const sevKeys: FrictionSeverity[] = ['blocker', 'slows', 'annoys'];
    for (const k of sevKeys) {
        for (const [tag, mult] of [['−50%', 0.5], ['+50%', 1.5]] as const) {
            const r = computeFriendlinessScore(findings, {
                severityWeight: { [k]: SEVERITY_WEIGHT[k] * mult },
            });
            scenarios.push({ label: `sev:${k} ${tag}`, overall: r.overall, grade: r.grade });
        }
    }
    // Alcance ignorado (reachStep 0) vs amplificado (0.3).
    for (const [tag, step] of [['reach:off', 0], ['reach:×2', 0.3]] as const) {
        const r = computeFriendlinessScore(findings, { reachStep: step });
        scenarios.push({ label: tag, overall: r.overall, grade: r.grade });
    }
    // Escolha de agregação: compensatória (aritmética) vs não-compensatória.
    const arith = computeFriendlinessScore(findings, { aggregation: 'arithmetic' });
    scenarios.push({ label: 'agg:arithmetic', overall: arith.overall, grade: arith.grade });

    const overalls = scenarios.map((s) => s.overall);
    const min = Math.min(...overalls);
    const max = Math.max(...overalls);
    const grades = scenarios.map((s) => s.grade);
    const distinct = [...new Set(grades)];
    const weightGrades = scenarios.filter((s) => s.label !== 'agg:arithmetic').map((s) => s.grade);
    const weightStable = new Set(weightGrades).size === 1;

    let verdict: FriendlinessSensitivity['verdict'];
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
export function summarizeFriendlinessScore(r: FriendlinessScoreResult): string {
    const dims = r.perDimension.map((d) => `${d.dimension[0]}=${d.score}`).join(' ');
    return `friendliness ${r.overall}/100 [${r.grade}]${r.vetoApplied ? ' (veto)' : ''} · ${dims} · open=${r.totals.open} (blockers=${r.totals.openBlockers}) · resolved=${r.totals.resolvedCreditPct}%`;
}
