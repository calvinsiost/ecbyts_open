// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TRUST-018 (claude - novaspec, 2026-05-30) — Provenance Dashboard view-model (pure-logic).
 *
 * View-model agregador: recebe lista de artifacts usados num relatório/laudo
 * (ex: 5 solvers + 3 ML models + freshness timestamps) e retorna estrutura
 * display-ready para UI consumer (admin dashboard, PDF report appendix).
 *
 * Constrói:
 *   - Grade de badges (icon + tier + freshness por artifact)
 *   - Bibliografia consolidada ABNT NBR 6023 (de-duplicated)
 *   - Cobertura por categoria (solver/ml-model/unknown)
 *   - Recomendações agregadas (recompute / view bib / disclaimer)
 *   - Score overall report (% complete provenance + freshness médio)
 *
 * Pronto para 4 consumers UI:
 *   1. Admin painel `ecbyts-admin` > Provenance Dashboard
 *   2. PDF report appendix "Bibliografia ABNT" (tese USP)
 *   3. EIS dashboard badge "auditável" agregado
 *   4. Audit trail screen (lista artifacts usados no relatório)
 *
 * Refs:
 *   - TRUST-017 provenanceUnified (engine principal)
 *   - TRUST-013 solverProvenance + TRUST-016 mlProvenance
 *   - ABNT NBR 6023:2018 (citações em formato canônico)
 */

import {
    buildProvenanceBadge,
    type UnifiedProvenance,
    unifiedProvenanceFor,
} from './provenanceUnified.js';
import type { FreshnessKind } from '../feedback/freshnessClassifier.js';

export interface ArtifactRequest {
    /** ID do solver OU ML model */
    artifactId: string;
    /** Epoch ms quando este artifact foi computado/inferido */
    computedAtMs: number | null | undefined;
    /** Optional freshness kind override (default 'default') */
    freshnessKind?: FreshnessKind;
    /** Optional label humano para display (caller pode passar) */
    displayLabel?: string;
}

export interface ArtifactRow {
    artifactId: string;
    displayLabel: string;
    unified: UnifiedProvenance;
    badge: {
        icon: '🟢' | '🟡' | '🟠' | '🔴' | '⚪';
        labelKey: string;
        detailsKey: string;
    };
}

export interface DashboardReport {
    /** Linhas display-ready (uma por artifact) */
    rows: ArtifactRow[];
    /** Cobertura por categoria */
    categoryCoverage: {
        solver: number;
        mlModel: number;
        unknown: number;
    };
    /** Total artifacts no relatório */
    totalArtifacts: number;
    /** % com provenance completa (1 - unknown) */
    pctCataloged: number;
    /** % freshness "recent" ou "fresh" (não-stale) */
    pctFresh: number;
    /** Score overall agregado 0-100 (média ponderada de cataloged + fresh) */
    overallScore: number;
    /** Veredict humano-legível */
    verdictKey: string;
    /** Bibliografia ABNT consolidada (de-duplicated, ordenada alfabeticamente) */
    consolidatedBibliographyAbnt: string[];
    /** Disclaimers únicos (i18n keys) presentes nos artifacts ML */
    requiredDisclaimerKeys: string[];
    /** Ações agregadas recomendadas (ordenadas por urgência) */
    aggregatedActionsKeys: string[];
}

/**
 * Constrói o report unificado a partir de uma lista de artifacts.
 *
 * @example
 *   buildProvenanceReport([
 *     { artifactId: 'gaussianPlume', computedAtMs: Date.now() - 3600000 },
 *     { artifactId: 'samAutoMask', computedAtMs: Date.now() - 7200000 },
 *   ], Date.now())
 */
export function buildProvenanceReport(
    artifacts: ReadonlyArray<ArtifactRequest>,
    nowMs: number,
): DashboardReport {
    const list = Array.isArray(artifacts) ? artifacts : [];
    const rows: ArtifactRow[] = list.map((a) => {
        const unified = unifiedProvenanceFor(
            a.artifactId,
            a.computedAtMs ?? null,
            nowMs,
            a.freshnessKind || 'default',
        );
        const badge = buildProvenanceBadge(unified);
        return {
            artifactId: a.artifactId,
            displayLabel: a.displayLabel || a.artifactId,
            unified,
            badge,
        };
    });

    // Coverage por categoria
    const categoryCoverage = {
        solver: rows.filter((r) => r.unified.kind === 'solver').length,
        mlModel: rows.filter((r) => r.unified.kind === 'ml-model').length,
        unknown: rows.filter((r) => r.unified.kind === 'unknown').length,
    };

    const totalArtifacts = rows.length;
    const cataloged = totalArtifacts - categoryCoverage.unknown;
    const fresh = rows.filter(
        (r) => r.unified.freshness.tier === 'recent' || r.unified.freshness.tier === 'fresh',
    ).length;

    const pctCataloged = totalArtifacts > 0 ? Math.round((cataloged / totalArtifacts) * 100) : 100;
    const pctFresh = totalArtifacts > 0 ? Math.round((fresh / totalArtifacts) * 100) : 100;
    const overallScore = Math.round((pctCataloged + pctFresh) / 2);
    const verdictKey = classifyDashboardVerdict(overallScore);

    // Bibliografia consolidada (de-duplicated, ordenada alfabeticamente)
    const bibSet = new Set<string>();
    for (const r of rows) {
        for (const ref of r.unified.bibliographyAbnt) {
            bibSet.add(ref);
        }
    }
    const consolidatedBibliographyAbnt = Array.from(bibSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Disclaimers únicos (apenas ML)
    const disclaimerSet = new Set<string>();
    for (const r of rows) {
        if (r.unified.disclaimerKey) disclaimerSet.add(r.unified.disclaimerKey);
    }
    const requiredDisclaimerKeys = Array.from(disclaimerSet).sort();

    // Ações agregadas (de-duplicated, ordenadas por urgência canônica)
    const actionsSet = new Set<string>();
    for (const r of rows) {
        for (const a of r.unified.recommendedActionsKeys) {
            actionsSet.add(a);
        }
    }
    const aggregatedActionsKeys = sortActionsByUrgency(Array.from(actionsSet));

    return {
        rows,
        categoryCoverage,
        totalArtifacts,
        pctCataloged,
        pctFresh,
        overallScore,
        verdictKey,
        consolidatedBibliographyAbnt,
        requiredDisclaimerKeys,
        aggregatedActionsKeys,
    };
}

function classifyDashboardVerdict(score: number): string {
    if (score >= 90) return 'provenance.dashboard.verdict.excellent';
    if (score >= 75) return 'provenance.dashboard.verdict.good';
    if (score >= 60) return 'provenance.dashboard.verdict.acceptable';
    if (score >= 40) return 'provenance.dashboard.verdict.needsImprovement';
    return 'provenance.dashboard.verdict.critical';
}

const ACTION_URGENCY_ORDER: Record<string, number> = {
    'provenance.action.unknownArtifact': 1,
    'provenance.action.incompleteCatalog': 2,
    'provenance.action.recompute': 3,
    'provenance.action.showDisclaimer': 4,
    'provenance.action.viewBibliography': 5,
};

function sortActionsByUrgency(actions: string[]): string[] {
    return [...actions].sort((a, b) => {
        const oa = ACTION_URGENCY_ORDER[a] ?? 99;
        const ob = ACTION_URGENCY_ORDER[b] ?? 99;
        return oa - ob;
    });
}

/**
 * i18n keys do dashboard (F6 KIMI swarm precisa traduzir).
 */
export const DASHBOARD_REQUIRED_I18N_KEYS = Object.freeze([
    'provenance.dashboard.verdict.excellent',
    'provenance.dashboard.verdict.good',
    'provenance.dashboard.verdict.acceptable',
    'provenance.dashboard.verdict.needsImprovement',
    'provenance.dashboard.verdict.critical',
    'provenance.dashboard.title',
    'provenance.dashboard.coverage.solver',
    'provenance.dashboard.coverage.mlModel',
    'provenance.dashboard.coverage.unknown',
    'provenance.dashboard.bibliographySection',
    'provenance.dashboard.disclaimersSection',
    'provenance.dashboard.actionsSection',
]);

/**
 * Formato compacto: 1 linha por artifact (para summary/badge agregado).
 */
export interface CompactSummary {
    totalArtifacts: number;
    pctCataloged: number;
    pctFresh: number;
    overallScore: number;
    icon: '🟢' | '🟡' | '🟠' | '🔴' | '⚪';
    verdictKey: string;
}

export function buildCompactSummary(
    artifacts: ReadonlyArray<ArtifactRequest>,
    nowMs: number,
): CompactSummary {
    const r = buildProvenanceReport(artifacts, nowMs);
    let icon: '🟢' | '🟡' | '🟠' | '🔴' | '⚪';
    if (r.overallScore >= 90) icon = '🟢';
    else if (r.overallScore >= 75) icon = '🟡';
    else if (r.overallScore >= 60) icon = '🟠';
    else if (r.overallScore >= 40) icon = '🔴';
    else icon = '⚪';
    return {
        totalArtifacts: r.totalArtifacts,
        pctCataloged: r.pctCataloged,
        pctFresh: r.pctFresh,
        overallScore: r.overallScore,
        icon,
        verdictKey: r.verdictKey,
    };
}
