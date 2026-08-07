// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VISUAL BEAUTY SCORE — indicador programático de estética da UI
   VISUAL-BEAUTY-001 (Calvin 2026-06-15: "incluir score de beleza visual").
   Pesquisa: .runtime/research/visual-beauty-score-2026-06-15.md

   Fundamentação: Ngo, Teo & Byrne 2003 (14 medidas de estética de interface,
   DOI 10.1016/S0020-0255(02)00404-8) + Birkhoff 1933 (M=ordem/complexidade) +
   Lavie & Tractinsky 2004 (estética clássica = consistência/organização) +
   best practices 2025 (60-30-10, escala tipográfica, tokens).

   Mesmo padrão NÃO-COMPENSATÓRIO dos outros scores do repo (friendliness,
   deliverable): findings objetivos → penalidade por dimensão → média geométrica
   ponderada (uma dimensão feia NÃO é mascarada) → veto → grade A-F + sensibilidade
   (OECD Handbook on Composite Indicators; arXiv 2008.13637).

   Pure: sem DOM, determinístico, frozen. Domain-agnostic (recebe findings).
   ================================================================ */

export type BeautyDimension =
    | 'color_harmony'
    | 'typography'
    | 'spacing_rhythm'
    | 'consistency'
    | 'readability'
    | 'simplicity';

/** Severidade do achado estético (espelha blocker/slows/annoys). */
export type BeautySeverity = 'ugly' | 'noisy' | 'minor';

export interface BeautyFinding {
    readonly id: string;
    readonly dimension: BeautyDimension;
    readonly severity: BeautySeverity;
    /** Alcance: nº de elementos/arquivos afetados (≥1). Amplifica a penalidade. */
    readonly reach?: number;
    readonly resolved?: boolean;
    /** Seção/tela/arquivo (para breakdown por tela). */
    readonly section?: string;
    /** Evidência objetiva (ex.: "32 cores hardcoded em libraries.css"). */
    readonly evidence?: string;
}

export const BEAUTY_DIMENSIONS: ReadonlyArray<BeautyDimension> = Object.freeze([
    'color_harmony',
    'typography',
    'spacing_rhythm',
    'consistency',
    'readability',
    'simplicity',
]);

/** Penalidade base por severidade. ~8 "ugly" zeram uma dimensão. */
export const BEAUTY_SEVERITY_WEIGHT: Readonly<Record<BeautySeverity, number>> = Object.freeze({
    ugly: 12,
    noisy: 4,
    minor: 1,
});

export const BEAUTY_DIMENSION_WEIGHT: Readonly<Record<BeautyDimension, number>> = Object.freeze({
    color_harmony: 1,
    typography: 1,
    spacing_rhythm: 1,
    consistency: 1,
    readability: 1.2, // legibilidade pesa um pouco mais (Lavie: clássica)
    simplicity: 1,
});

export const BEAUTY_GRADE_THRESHOLDS = Object.freeze([
    { grade: 'A', min: 90 },
    { grade: 'B', min: 80 },
    { grade: 'C', min: 70 },
    { grade: 'D', min: 60 },
    { grade: 'F', min: 0 },
] as const);

/** Teto do overall quando há >=1 achado "ugly" aberto (veto anti-compensatório). */
export const UGLY_VETO_CAP = 79;
const REACH_STEP = 0.15;
const REACH_CAP = 2.0;
const GEO_EPSILON = 1;

export interface BeautyDimensionScore {
    readonly dimension: BeautyDimension;
    readonly score: number;
    readonly penalty: number;
    readonly openFindings: number;
    readonly uglies: number;
}

export interface VisualBeautyScoreResult {
    readonly overall: number;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    readonly vetoApplied: boolean;
    readonly perDimension: ReadonlyArray<BeautyDimensionScore>;
    readonly topOffenders: ReadonlyArray<{ id: string; dimension: BeautyDimension; penalty: number; evidence: string }>;
    readonly totals: {
        readonly findings: number;
        readonly open: number;
        readonly resolved: number;
        readonly openUglies: number;
        readonly sectionsWithDebt: number;
    };
}

export interface BeautyOptions {
    readonly severityWeight?: Partial<Record<BeautySeverity, number>>;
    readonly dimensionWeight?: Partial<Record<BeautyDimension, number>>;
    readonly reachStep?: number;
    /** 'geometric' (não-compensatório, default) | 'arithmetic' (p/ sensibilidade). */
    readonly aggregation?: 'geometric' | 'arithmetic';
    /**
     * Total de telas/arquivos avaliados (repo-wide). Quando fornecido, o repoScore
     * é a média sobre TODAS as telas — as SEM débito contam como 100. Sem isto, a
     * média é só das telas com findings (não-monotônica: limpar uma tela a removia
     * do pool e podia BAIXAR o número, contradizendo "cada tela melhorada sobe").
     */
    readonly totalSections?: number;
}

function _reachFactor(reach: unknown, reachStep: number): number {
    const r = typeof reach === 'number' && Number.isFinite(reach) && reach >= 1 ? reach : 1;
    return Math.min(REACH_CAP, 1 + reachStep * (r - 1));
}

/** Penalidade de um achado (0 se resolvido/ inválido). */
export function beautyFindingPenalty(
    f: BeautyFinding,
    severityWeight: Record<BeautySeverity, number> = BEAUTY_SEVERITY_WEIGHT,
    reachStep: number = REACH_STEP,
): number {
    if (!f || f.resolved) return 0;
    const base = severityWeight[f.severity];
    if (base == null) return 0;
    return base * _reachFactor(f.reach, reachStep);
}

function _gradeFor(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    for (const t of BEAUTY_GRADE_THRESHOLDS) {
        if (score >= t.min) return t.grade;
    }
    return 'F';
}

/** Calcula o score de beleza visual a partir de findings objetivos. */
export function computeVisualBeautyScore(
    findings: ReadonlyArray<BeautyFinding>,
    opts: BeautyOptions = {},
): VisualBeautyScoreResult {
    const list = Array.isArray(findings) ? findings : [];
    const severityWeight = { ...BEAUTY_SEVERITY_WEIGHT, ...(opts.severityWeight || {}) };
    const dimensionWeight = { ...BEAUTY_DIMENSION_WEIGHT, ...(opts.dimensionWeight || {}) };
    const reachStep = typeof opts.reachStep === 'number' ? opts.reachStep : REACH_STEP;
    const aggregation = opts.aggregation === 'arithmetic' ? 'arithmetic' : 'geometric';

    const penaltyByDim = new Map<BeautyDimension, number>();
    const openByDim = new Map<BeautyDimension, number>();
    const uglyByDim = new Map<BeautyDimension, number>();
    for (const d of BEAUTY_DIMENSIONS) {
        penaltyByDim.set(d, 0);
        openByDim.set(d, 0);
        uglyByDim.set(d, 0);
    }

    let resolved = 0;
    let openUglies = 0;
    const sectionsWithDebt = new Set<string>();
    const offenders: Array<{ id: string; dimension: BeautyDimension; penalty: number; evidence: string }> = [];

    for (const f of list) {
        if (!f || !BEAUTY_DIMENSIONS.includes(f.dimension)) continue;
        if (f.resolved) {
            resolved++;
            continue;
        }
        const p = beautyFindingPenalty(f, severityWeight, reachStep);
        penaltyByDim.set(f.dimension, (penaltyByDim.get(f.dimension) || 0) + p);
        openByDim.set(f.dimension, (openByDim.get(f.dimension) || 0) + 1);
        if (f.severity === 'ugly') {
            uglyByDim.set(f.dimension, (uglyByDim.get(f.dimension) || 0) + 1);
            openUglies++;
        }
        if (typeof f.section === 'string' && f.section.trim()) sectionsWithDebt.add(f.section.trim());
        offenders.push({
            id: f.id,
            dimension: f.dimension,
            penalty: Math.round(p * 100) / 100,
            evidence: typeof f.evidence === 'string' ? f.evidence : '',
        });
    }

    const perDimension: BeautyDimensionScore[] = BEAUTY_DIMENSIONS.map((dimension) => {
        const penalty = penaltyByDim.get(dimension) || 0;
        const score = Math.max(0, Math.min(100, 100 - penalty));
        return Object.freeze({
            dimension,
            score: Math.round(score * 100) / 100,
            penalty: Math.round(penalty * 100) / 100,
            openFindings: openByDim.get(dimension) || 0,
            uglies: uglyByDim.get(dimension) || 0,
        });
    });

    // Agregação NÃO-COMPENSATÓRIA (média geométrica ponderada): uma dimensão feia
    // não é mascarada pelas bonitas.
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

    const vetoApplied = openUglies > 0 && overall > UGLY_VETO_CAP;
    if (vetoApplied) overall = UGLY_VETO_CAP;
    overall = Math.round(overall * 100) / 100;

    offenders.sort((a, b) => b.penalty - a.penalty || a.id.localeCompare(b.id));
    const findingsTotal = resolved + offenders.length;

    return Object.freeze({
        overall,
        grade: _gradeFor(overall),
        vetoApplied,
        perDimension: Object.freeze(perDimension),
        topOffenders: Object.freeze(offenders.slice(0, 12).map((o) => Object.freeze(o))),
        totals: Object.freeze({
            findings: findingsTotal,
            open: offenders.length,
            resolved,
            openUglies,
            sectionsWithDebt: sectionsWithDebt.size,
        }),
    });
}

export interface BeautySectionScore {
    readonly section: string;
    readonly overall: number;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    readonly open: number;
    readonly uglies: number;
}

/** Score POR SEÇÃO (arquivo/tela/componente) — aponta os piores. */
export function computeVisualBeautyBySection(
    findings: ReadonlyArray<BeautyFinding>,
    opts: BeautyOptions = {},
): ReadonlyArray<BeautySectionScore> {
    const bySection = new Map<string, BeautyFinding[]>();
    for (const f of Array.isArray(findings) ? findings : []) {
        if (!f) continue;
        const s = typeof f.section === 'string' && f.section.trim() ? f.section.trim() : '__unassigned';
        const arr = bySection.get(s) || [];
        arr.push(f);
        bySection.set(s, arr);
    }
    const out: BeautySectionScore[] = [];
    for (const [section, fs] of bySection) {
        const r = computeVisualBeautyScore(fs, opts);
        out.push(
            Object.freeze({
                section,
                overall: r.overall,
                grade: r.grade,
                open: r.totals.open,
                uglies: r.totals.openUglies,
            }),
        );
    }
    out.sort((a, b) => a.overall - b.overall || a.section.localeCompare(b.section)); // pior primeiro
    return Object.freeze(out);
}

export interface RepoBeauty {
    /** Média das notas POR TELA (granular, ratchet-friendly) — a métrica headline. */
    readonly repoScore: number;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    /** Telas no divisor da média (todas, se totalSections fornecido; senão só com débito). */
    readonly sectionCount: number;
    /** Telas COM débito (≥1 finding) — subconjunto que precisa elevação. */
    readonly debtSections: number;
    /** As telas (arquivos) com menor nota — prioridade de elevação. */
    readonly worstSections: ReadonlyArray<{ section: string; overall: number; grade: string }>;
}

/**
 * Score REPO-WIDE = média das notas por tela (como quality:screens). Mais
 * granular que a média geométrica global (que satura): cada tela melhorada sobe
 * o número, viabilizando o ratchet de elevação.
 */
export function computeVisualBeautyRepo(
    findings: ReadonlyArray<BeautyFinding>,
    opts: BeautyOptions = {},
): RepoBeauty {
    const sections = computeVisualBeautyBySection(findings, opts);
    const debtSections = sections.length;
    // Divisor: TODAS as telas quando totalSections é fornecido (telas limpas = 100),
    // tornando a métrica MONOTÔNICA (limpar uma tela sempre sobe o número). Sem isto,
    // cai no comportamento antigo (média só das telas com débito).
    const total =
        typeof opts.totalSections === 'number' && opts.totalSections > debtSections
            ? opts.totalSections
            : debtSections;
    if (total === 0) {
        return Object.freeze({ repoScore: 100, grade: 'A', sectionCount: 0, debtSections: 0, worstSections: Object.freeze([]) });
    }
    const sumDebt = sections.reduce((acc, s) => acc + s.overall, 0);
    const cleanSections = total - debtSections; // telas sem débito contam 100
    const mean = (sumDebt + cleanSections * 100) / total;
    const repoScore = Math.round(mean * 100) / 100;
    return Object.freeze({
        repoScore,
        grade: _gradeFor(repoScore),
        sectionCount: total,
        debtSections,
        worstSections: Object.freeze(
            sections
                .slice(0, 12) // já ordenadas pior-primeiro
                .map((s) => Object.freeze({ section: s.section, overall: s.overall, grade: s.grade })),
        ),
    });
}

export interface BeautySensitivity {
    readonly base: number;
    readonly arithmetic: number;
    readonly noReach: number;
    /** Robustez: |geométrico − aritmético|. Alto = a escolha não-compensatória importa. */
    readonly spread: number;
}

/** Análise de sensibilidade (OECD Handbook §6 — robustez do índice composto). */
export function computeVisualBeautySensitivity(
    findings: ReadonlyArray<BeautyFinding>,
): BeautySensitivity {
    const base = computeVisualBeautyScore(findings).overall;
    const arithmetic = computeVisualBeautyScore(findings, { aggregation: 'arithmetic' }).overall;
    const noReach = computeVisualBeautyScore(findings, { reachStep: 0 }).overall;
    return Object.freeze({
        base,
        arithmetic,
        noReach,
        spread: Math.round(Math.abs(base - arithmetic) * 100) / 100,
    });
}

/** Resumo de uma linha para CLI/relatório. */
export function summarizeVisualBeautyScore(r: VisualBeautyScoreResult): string {
    const worst = [...r.perDimension].sort((a, b) => a.score - b.score)[0];
    return (
        `beleza visual: ${r.overall}/100 [${r.grade}]` +
        (r.vetoApplied ? ' (veto: achado feio aberto)' : '') +
        ` · ${r.totals.open} violações` +
        (worst ? ` · pior dimensão ${worst.dimension} ${worst.score}` : '')
    );
}
