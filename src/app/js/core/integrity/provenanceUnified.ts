// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TRUST-017 (claude - novaspec, 2026-05-30) — Provenance Unificado (pure-logic).
 *
 * Helper que combina TRUST-013 (solver provenance), TRUST-016 (ML/NN provenance)
 * e TRUST-012 (freshness classifier) num único endpoint para UI consumer.
 *
 * UI (dashboard provenance, PDF report, EIS dashboard) chama
 * `unifiedProvenanceFor(artifactId, artifactType, computedAtMs, nowMs)` e
 * recebe estrutura única com:
 *   - kind do artifact (solver / ml-model / unknown)
 *   - referência primária (paper DOI/ISBN/arXiv)
 *   - bibliografia ABNT pré-renderizada
 *   - freshness verdict (recent/fresh/stale/outdated)
 *   - integrity flag (provenance completa? validation tests > 0?)
 *   - disclaimer key obrigatório (se ML)
 *   - recommended actions (recompute / view bibliography / verify field data)
 *
 * Anti-pattern evitado: caller não precisa saber se artifact é solver ou ML —
 * unified endpoint resolve internamente via try-both. Se nada cataloged, retorna
 * shape compatible com fallback graceful (sem provenance ≠ erro).
 *
 * Refs:
 *   - TRUST-013 solverProvenance (29/29 = 100% coverage)
 *   - TRUST-016 mlProvenance (22/25 = 88% coverage)
 *   - TRUST-012 freshnessClassifier
 *   - TRUST-015 estratégia 7 camadas correção cálculo
 */

import {
    getProvenance as getSolverProvenance,
    isProvenanceComplete as isSolverComplete,
    listSolversWithProvenance,
    renderBibliographyAbnt as renderSolverBib,
    type SolverProvenance,
} from './solverProvenance.js';
import {
    getMLProvenance,
    isMLProvenanceComplete,
    listMLModelsWithProvenance,
    renderMLBibliographyAbnt,
    type MLProvenance,
} from './mlProvenance.js';
import {
    describeFreshness,
    type FreshnessDescription,
    type FreshnessKind,
} from '../feedback/freshnessClassifier.js';

export type ArtifactKind = 'solver' | 'ml-model' | 'unknown';

export interface UnifiedProvenance {
    artifactId: string;
    kind: ArtifactKind;
    /** Primary reference humanReadable (autor + ano) ou null se não-cataloged */
    primaryRefKey: string | null;
    /** Bibliografia ABNT NBR 6023 (primary + additional + datasets BR) — vazio se não-cataloged */
    bibliographyAbnt: string[];
    /** Freshness do dado (TRUST-012) */
    freshness: FreshnessDescription;
    /** True se artifact tem provenance completa (paper + tests + regulatory basis) */
    isComplete: boolean;
    /** i18n key disclaimer obrigatório (apenas ML; vazio se solver) */
    disclaimerKey: string;
    /** Ações sugeridas para UI mostrar (i18n keys) */
    recommendedActionsKeys: string[];
    /** Raw solver provenance (apenas se kind=solver) */
    solverProvenance?: SolverProvenance | null | undefined;
    /** Raw ML provenance (apenas se kind=ml-model) */
    mlProvenance?: MLProvenance | null | undefined;
}

/**
 * Endpoint unificado de provenance.
 *
 * @param artifactId  ID do solver OU ml-model (tentado em ambos os registries)
 * @param computedAtMs  Epoch ms quando o cálculo/inferência foi executado
 * @param nowMs  Epoch ms de referência para freshness (caller injeta para determinismo)
 * @param freshnessKind  Kind da freshness ('default' / 'sensor' / 'spatial' / 'eis' / 'sample')
 */
export function unifiedProvenanceFor(
    artifactId: string | null | undefined,
    computedAtMs: number | null | undefined,
    nowMs: number,
    freshnessKind: FreshnessKind = 'default',
): UnifiedProvenance {
    const id = typeof artifactId === 'string' ? artifactId : '';

    // Tenta solver primeiro (29/29 coverage), depois ML (22/25)
    const solver = getSolverProvenance(id);
    const ml = solver ? null : getMLProvenance(id);

    const kind: ArtifactKind = solver ? 'solver' : ml ? 'ml-model' : 'unknown';

    const freshness = describeFreshness(computedAtMs ?? null, nowMs, freshnessKind);

    let primaryRefKey: string | null = null;
    let bibliographyAbnt: string[] = [];
    let isComplete = false;
    let disclaimerKey = '';

    if (solver) {
        primaryRefKey = solver.primaryReference.authorYear;
        bibliographyAbnt = renderSolverBib(id);
        isComplete = isSolverComplete(id);
    } else if (ml) {
        primaryRefKey = ml.primaryReference.authorYear;
        bibliographyAbnt = renderMLBibliographyAbnt(id);
        isComplete = isMLProvenanceComplete(id);
        disclaimerKey = ml.disclaimerKey;
    }

    const recommendedActionsKeys = computeRecommendedActions({
        kind,
        freshness,
        isComplete,
    });

    return {
        artifactId: id,
        kind,
        primaryRefKey,
        bibliographyAbnt,
        freshness,
        isComplete,
        disclaimerKey,
        recommendedActionsKeys,
        solverProvenance: solver || undefined,
        mlProvenance: ml || undefined,
    };
}

function computeRecommendedActions(input: {
    kind: ArtifactKind;
    freshness: FreshnessDescription;
    isComplete: boolean;
}): string[] {
    const actions: string[] = [];
    // Provenance incompleta ou desconhecida → recomendar revisão
    if (input.kind === 'unknown') {
        actions.push('provenance.action.unknownArtifact');
    } else if (!input.isComplete) {
        actions.push('provenance.action.incompleteCatalog');
    } else {
        actions.push('provenance.action.viewBibliography');
    }
    // Freshness stale/outdated → recompute
    if (input.freshness.recomputeRecommended) {
        actions.push('provenance.action.recompute');
    }
    // ML → disclaimer obrigatório
    if (input.kind === 'ml-model') {
        actions.push('provenance.action.showDisclaimer');
    }
    return actions;
}

/**
 * Sumário rápido de cobertura unificada para admin dashboard.
 */
export interface UnifiedCoverage {
    solversCataloged: number;
    mlModelsCataloged: number;
    totalCataloged: number;
    /** Estimativa real (29 solvers + 25 ML estimados) */
    totalAvailable: number;
    pctCoverage: number;
}

export function getUnifiedCoverage(): UnifiedCoverage {
    const solversCataloged = listSolversWithProvenance().length;
    const mlModelsCataloged = listMLModelsWithProvenance().length;
    const total = solversCataloged + mlModelsCataloged;
    const totalAvailable = 29 + 25;
    return {
        solversCataloged,
        mlModelsCataloged,
        totalCataloged: total,
        totalAvailable,
        pctCoverage: Math.round((total / totalAvailable) * 100),
    };
}

/**
 * Verifica se artifact ID está cataloged em qualquer registry.
 */
export function isArtifactCataloged(artifactId: string | null | undefined): boolean {
    if (!artifactId) return false;
    return getSolverProvenance(artifactId) != null || getMLProvenance(artifactId) != null;
}

/**
 * Helper: renderiza badge de provenance display-ready (UI dashboard).
 */
export interface ProvenanceBadge {
    icon: '🟢' | '🟡' | '🟠' | '🔴' | '⚪';
    labelKey: string;
    detailsKey: string;
}

export function buildProvenanceBadge(unified: UnifiedProvenance): ProvenanceBadge {
    if (unified.kind === 'unknown') {
        return {
            icon: '⚪',
            labelKey: 'provenance.badge.unknown',
            detailsKey: 'provenance.badge.unknown.details',
        };
    }
    if (!unified.isComplete) {
        return {
            icon: '🟠',
            labelKey: 'provenance.badge.incomplete',
            detailsKey: 'provenance.badge.incomplete.details',
        };
    }
    // Tier final depende de freshness
    if (unified.freshness.tier === 'outdated' || unified.freshness.tier === 'stale') {
        return {
            icon: '🟡',
            labelKey: 'provenance.badge.staleData',
            detailsKey: 'provenance.badge.staleData.details',
        };
    }
    return {
        icon: '🟢',
        labelKey: 'provenance.badge.verified',
        detailsKey: 'provenance.badge.verified.details',
    };
}

/**
 * i18n keys canônicas que F6 KIMI swarm precisa traduzir.
 */
export const PROVENANCE_REQUIRED_I18N_KEYS = Object.freeze([
    'provenance.action.unknownArtifact',
    'provenance.action.incompleteCatalog',
    'provenance.action.viewBibliography',
    'provenance.action.recompute',
    'provenance.action.showDisclaimer',
    'provenance.badge.unknown',
    'provenance.badge.unknown.details',
    'provenance.badge.incomplete',
    'provenance.badge.incomplete.details',
    'provenance.badge.staleData',
    'provenance.badge.staleData.details',
    'provenance.badge.verified',
    'provenance.badge.verified.details',
]);
