// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TRUST-019 (claude - novaspec, 2026-05-30) — Provenance Reporter (pure-logic).
 *
 * Gera markdown/texto ABNT-compliant para appendix de PDF report a partir
 * de DashboardReport (TRUST-018). Output pronto para concatenar com Pandoc
 * em PDF final (tese USP Calvin + laudo CETESB + relatório técnico cliente).
 *
 * Pure-logic — sem deps DOM/i18n/fs. Caller (utils/ui/reportPdfBuilder ou
 * Edge Function gerador de PDF) pega output string e injeta no template
 * LaTeX/Markdown/HTML.
 *
 * Compliance:
 *   - ABNT NBR 6023 (referências) — citações de papers
 *   - ABNT NBR 14724 (estrutura trabalho acadêmico) — "Apêndice X"
 *   - ABNT NBR 10520 (citações em texto) — não-aplicável (este módulo só
 *     formata bibliografia final, não cita inline)
 *   - CONAMA Resolução 420/2009 — fundamentação técnica laudo
 *   - Resolução CONFEA 218/1973 — responsabilidade técnica
 */

import type { DashboardReport } from './provenanceDashboard.js';

export type OutputFormat = 'markdown' | 'plain-text' | 'html';

export interface ReportOptions {
    /** Idioma do title/labels (default pt-BR) */
    locale?: 'pt-BR' | 'en-US' | 'es-LA';
    /** Incluir seção de disclaimers obrigatórios LGPD/CDC? (default true) */
    includeDisclaimers?: boolean;
    /** Incluir seção de ações recomendadas? (default false — só p/ admin) */
    includeActions?: boolean;
    /** Título customizado do appendix (default "Apêndice — Bibliografia ABNT") */
    titleOverride?: string;
}

/**
 * Gera markdown para appendix "Bibliografia ABNT" de PDF report.
 * Output pronto para Pandoc → PDF/LaTeX/HTML.
 */
export function renderBibliographyAppendixMarkdown(
    report: DashboardReport,
    options: ReportOptions = {},
): string {
    const locale = options.locale || 'pt-BR';
    const labels = LABELS_BY_LOCALE[locale] ?? (LABELS_BY_LOCALE[PT_BR_LOCALE] as ReportLabels);
    const includeDisclaimers = options.includeDisclaimers !== false;
    const includeActions = options.includeActions === true;
    const title = options.titleOverride || labels.appendixTitle;

    const lines: string[] = [];

    // Header
    lines.push(`## ${title}`, '');
    lines.push(labels.intro.replace('{n}', String(report.totalArtifacts)), '');

    // Score summary
    lines.push(`**${labels.scoreLabel}:** ${report.overallScore}/100`);
    lines.push(`**${labels.cataloged}:** ${report.pctCataloged}% (${report.categoryCoverage.solver} ${labels.solver} + ${report.categoryCoverage.mlModel} ${labels.mlModel} + ${report.categoryCoverage.unknown} ${labels.unknown})`);
    lines.push(`**${labels.freshness}:** ${report.pctFresh}%`, '');

    // Disclaimers (ML apenas) — vai ANTES da bibliografia para destaque LGPD
    if (includeDisclaimers && report.requiredDisclaimerKeys.length > 0) {
        lines.push(`### ${labels.disclaimersTitle}`, '');
        lines.push(labels.disclaimersIntro, '');
        for (const key of report.requiredDisclaimerKeys) {
            lines.push(`- ${disclaimerTextFor(key, locale)}`);
        }
        lines.push('');
    }

    // Bibliografia
    if (report.consolidatedBibliographyAbnt.length > 0) {
        lines.push(`### ${labels.referencesTitle}`, '');
        lines.push(labels.referencesIntro, '');
        for (const ref of report.consolidatedBibliographyAbnt) {
            lines.push(ref, '');
        }
    } else {
        lines.push(`### ${labels.referencesTitle}`, '');
        lines.push(`_${labels.noReferences}_`, '');
    }

    // Ações (opcional, só para admin)
    if (includeActions && report.aggregatedActionsKeys.length > 0) {
        lines.push(`### ${labels.actionsTitle}`, '');
        for (const key of report.aggregatedActionsKeys) {
            lines.push(`- ${actionTextFor(key, locale)}`);
        }
        lines.push('');
    }

    // Footer ABNT compliance
    lines.push(`---`, '');
    lines.push(`_${labels.footerCompliance}_`);

    return lines.join('\n');
}

/**
 * Gera texto plain (sem markup) — útil para CSV export ou email.
 */
export function renderBibliographyAppendixPlainText(
    report: DashboardReport,
    options: ReportOptions = {},
): string {
    const md = renderBibliographyAppendixMarkdown(report, options);
    // Remove markdown markup
    return md
        .replace(/^#+\s/gm, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/^---$/gm, '');
}

/**
 * Gera HTML (sem inline CSS — caller adiciona stylesheet).
 */
export function renderBibliographyAppendixHtml(
    report: DashboardReport,
    options: ReportOptions = {},
): string {
    const locale = options.locale || 'pt-BR';
    const labels = LABELS_BY_LOCALE[locale] ?? (LABELS_BY_LOCALE[PT_BR_LOCALE] as ReportLabels);
    const includeDisclaimers = options.includeDisclaimers !== false;
    const includeActions = options.includeActions === true;
    const title = escapeHtml(options.titleOverride || labels.appendixTitle);

    const sections: string[] = [];
    sections.push(`<section class="provenance-appendix" lang="${locale}">`);
    sections.push(`<h2>${title}</h2>`);
    sections.push(
        `<p>${escapeHtml(labels.intro.replace('{n}', String(report.totalArtifacts)))}</p>`,
    );

    sections.push(`<dl class="provenance-summary">`);
    sections.push(`<dt>${escapeHtml(labels.scoreLabel)}</dt><dd>${report.overallScore}/100</dd>`);
    sections.push(
        `<dt>${escapeHtml(labels.cataloged)}</dt><dd>${report.pctCataloged}% (${report.categoryCoverage.solver} ${escapeHtml(labels.solver)} + ${report.categoryCoverage.mlModel} ${escapeHtml(labels.mlModel)} + ${report.categoryCoverage.unknown} ${escapeHtml(labels.unknown)})</dd>`,
    );
    sections.push(`<dt>${escapeHtml(labels.freshness)}</dt><dd>${report.pctFresh}%</dd>`);
    sections.push(`</dl>`);

    if (includeDisclaimers && report.requiredDisclaimerKeys.length > 0) {
        sections.push(`<h3>${escapeHtml(labels.disclaimersTitle)}</h3>`);
        sections.push(`<p>${escapeHtml(labels.disclaimersIntro)}</p>`);
        sections.push(`<ul class="provenance-disclaimers">`);
        for (const key of report.requiredDisclaimerKeys) {
            sections.push(`<li>${escapeHtml(disclaimerTextFor(key, locale))}</li>`);
        }
        sections.push(`</ul>`);
    }

    sections.push(`<h3>${escapeHtml(labels.referencesTitle)}</h3>`);
    if (report.consolidatedBibliographyAbnt.length > 0) {
        sections.push(`<p>${escapeHtml(labels.referencesIntro)}</p>`);
        sections.push(`<ol class="provenance-references abnt-6023">`);
        for (const ref of report.consolidatedBibliographyAbnt) {
            sections.push(`<li>${escapeHtml(ref)}</li>`);
        }
        sections.push(`</ol>`);
    } else {
        sections.push(`<p><em>${escapeHtml(labels.noReferences)}</em></p>`);
    }

    if (includeActions && report.aggregatedActionsKeys.length > 0) {
        sections.push(`<h3>${escapeHtml(labels.actionsTitle)}</h3>`);
        sections.push(`<ul class="provenance-actions">`);
        for (const key of report.aggregatedActionsKeys) {
            sections.push(`<li>${escapeHtml(actionTextFor(key, locale))}</li>`);
        }
        sections.push(`</ul>`);
    }

    sections.push(`<footer class="provenance-compliance"><small>${escapeHtml(labels.footerCompliance)}</small></footer>`);
    sections.push(`</section>`);
    return sections.join('\n');
}

/**
 * Dispatcher principal: chama o renderer correto baseado em format.
 */
export function renderBibliographyAppendix(
    report: DashboardReport,
    format: OutputFormat = 'markdown',
    options: ReportOptions = {},
): string {
    switch (format) {
        case 'plain-text':
            return renderBibliographyAppendixPlainText(report, options);
        case 'html':
            return renderBibliographyAppendixHtml(report, options);
        case 'markdown':
        default:
            return renderBibliographyAppendixMarkdown(report, options);
    }
}

// ── Helpers privados ─────────────────────────────────────────────────────

interface ReportLabels {
    appendixTitle: string;
    intro: string;
    scoreLabel: string;
    cataloged: string;
    freshness: string;
    solver: string;
    mlModel: string;
    unknown: string;
    disclaimersTitle: string;
    disclaimersIntro: string;
    referencesTitle: string;
    referencesIntro: string;
    noReferences: string;
    actionsTitle: string;
    footerCompliance: string;
}

// pt-BR é garantido no catálogo — fallback determinístico para locale
// desconhecido (mantém runtime idêntico ao default do caller).
const PT_BR_LOCALE = 'pt-BR';
const LABELS_BY_LOCALE: Record<string, ReportLabels> = Object.freeze({
    'pt-BR': Object.freeze({
        appendixTitle: 'Apêndice — Bibliografia ABNT',
        intro: 'Este relatório utilizou {n} artefatos analíticos auditáveis. Provenance acadêmica completa abaixo.',
        scoreLabel: 'Score de provenance',
        cataloged: 'Catalogados',
        freshness: 'Frescor de dados',
        solver: 'solvers físicos',
        mlModel: 'modelos ML',
        unknown: 'não-catalogados',
        disclaimersTitle: 'Avisos legais obrigatórios (LGPD Art 20 + CDC Art 6º)',
        disclaimersIntro: 'Os modelos abaixo possuem incerteza estrutural — output requer revisão humana antes de uso forense:',
        referencesTitle: 'Referências bibliográficas (ABNT NBR 6023:2018)',
        referencesIntro: 'Bibliografia consolidada, de-duplicada, ordenada alfabeticamente:',
        noReferences: 'Nenhuma referência cadastrada para este conjunto.',
        actionsTitle: 'Ações recomendadas',
        footerCompliance: 'Compliance: ABNT NBR 14724 + ABNT NBR 6023:2018 + CONAMA Res 420/2009 + Resolução CONFEA 218/1973',
    }),
    'en-US': Object.freeze({
        appendixTitle: 'Appendix — ABNT Bibliography',
        intro: 'This report used {n} auditable analytical artifacts. Full academic provenance below.',
        scoreLabel: 'Provenance score',
        cataloged: 'Cataloged',
        freshness: 'Data freshness',
        solver: 'physical solvers',
        mlModel: 'ML models',
        unknown: 'uncataloged',
        disclaimersTitle: 'Required legal notices (LGPD Art 20 + CDC Art 6º)',
        disclaimersIntro: 'The models below have structural uncertainty — output requires human review before forensic use:',
        referencesTitle: 'Bibliographic references (ABNT NBR 6023:2018)',
        referencesIntro: 'Consolidated bibliography, de-duplicated, alphabetically ordered:',
        noReferences: 'No references registered for this set.',
        actionsTitle: 'Recommended actions',
        footerCompliance: 'Compliance: ABNT NBR 14724 + ABNT NBR 6023:2018 + CONAMA Res 420/2009 + Resolução CONFEA 218/1973',
    }),
    'es-LA': Object.freeze({
        appendixTitle: 'Apéndice — Bibliografía ABNT',
        intro: 'Este informe utilizó {n} artefactos analíticos auditables. Procedencia académica completa a continuación.',
        scoreLabel: 'Puntaje de procedencia',
        cataloged: 'Catalogados',
        freshness: 'Frescura de datos',
        solver: 'solvers físicos',
        mlModel: 'modelos ML',
        unknown: 'no catalogados',
        disclaimersTitle: 'Avisos legales obligatorios (LGPD Art 20 + CDC Art 6º)',
        disclaimersIntro: 'Los modelos siguientes tienen incertidumbre estructural — la salida requiere revisión humana antes del uso forense:',
        referencesTitle: 'Referencias bibliográficas (ABNT NBR 6023:2018)',
        referencesIntro: 'Bibliografía consolidada, deduplicada, ordenada alfabéticamente:',
        noReferences: 'Sin referencias registradas para este conjunto.',
        actionsTitle: 'Acciones recomendadas',
        footerCompliance: 'Cumplimiento: ABNT NBR 14724 + ABNT NBR 6023:2018 + CONAMA Res 420/2009 + Resolución CONFEA 218/1973',
    }),
});

const DISCLAIMER_TEXTS: Record<string, Record<string, string>> = {
    'pt-BR': {
        'ml.disclaimer.segmentation': 'Segmentação automática: output não-determinístico; máscaras geradas requerem revisão visual.',
        'ml.disclaimer.classification': 'Classificação: top-1 sujeito a vieses do dataset de treinamento.',
        'ml.disclaimer.detection': 'Detecção: objetos pequenos (<32px) podem ser sub-detectados.',
        'ml.disclaimer.regression': 'Regressão: extrapolação geográfica perigosa — calibração local recomendada.',
        'ml.disclaimer.embedding': 'Similaridade não equivale a semelhança semântica fina.',
        'ml.disclaimer.neuralNetwork': 'Rede neural: caixa-preta com explicabilidade limitada.',
    },
    'en-US': {
        'ml.disclaimer.segmentation': 'Automatic segmentation: non-deterministic; generated masks require visual review.',
        'ml.disclaimer.classification': 'Classification: top-1 subject to training dataset biases.',
        'ml.disclaimer.detection': 'Detection: small objects (<32px) may be under-detected.',
        'ml.disclaimer.regression': 'Regression: geographic extrapolation risky — local calibration recommended.',
        'ml.disclaimer.embedding': 'Similarity does not equate to fine semantic resemblance.',
        'ml.disclaimer.neuralNetwork': 'Neural network: black-box with limited explainability.',
    },
    'es-LA': {
        'ml.disclaimer.segmentation': 'Segmentación automática: no-determinística; máscaras generadas requieren revisión visual.',
        'ml.disclaimer.classification': 'Clasificación: top-1 sujeto a sesgos del dataset de entrenamiento.',
        'ml.disclaimer.detection': 'Detección: objetos pequeños (<32px) pueden subdetectarse.',
        'ml.disclaimer.regression': 'Regresión: extrapolación geográfica riesgosa — calibración local recomendada.',
        'ml.disclaimer.embedding': 'Similitud no equivale a semejanza semántica fina.',
        'ml.disclaimer.neuralNetwork': 'Red neuronal: caja-negra con explicabilidad limitada.',
    },
};

function disclaimerTextFor(key: string, locale: string): string {
    return DISCLAIMER_TEXTS[locale]?.[key] || DISCLAIMER_TEXTS[PT_BR_LOCALE]?.[key] || key;
}

const ACTION_TEXTS: Record<string, Record<string, string>> = {
    'pt-BR': {
        'provenance.action.unknownArtifact': 'Artefato não catalogado — investigar e adicionar ao registry.',
        'provenance.action.incompleteCatalog': 'Catalogação incompleta — completar referência primária + datasets validação.',
        'provenance.action.recompute': 'Dados desatualizados — recomputar antes de uso em laudo.',
        'provenance.action.showDisclaimer': 'Exibir aviso legal obrigatório ao usuário antes de visualizar output.',
        'provenance.action.viewBibliography': 'Bibliografia disponível para consulta.',
    },
    'en-US': {
        'provenance.action.unknownArtifact': 'Uncataloged artifact — investigate and add to registry.',
        'provenance.action.incompleteCatalog': 'Incomplete catalog — complete primary reference + validation datasets.',
        'provenance.action.recompute': 'Stale data — recompute before forensic use.',
        'provenance.action.showDisclaimer': 'Display mandatory legal notice to user before showing output.',
        'provenance.action.viewBibliography': 'Bibliography available for consultation.',
    },
    'es-LA': {
        'provenance.action.unknownArtifact': 'Artefacto no catalogado — investigar y añadir al registry.',
        'provenance.action.incompleteCatalog': 'Catalogación incompleta — completar referencia primaria + datasets validación.',
        'provenance.action.recompute': 'Datos desactualizados — recomputar antes del uso forense.',
        'provenance.action.showDisclaimer': 'Mostrar aviso legal obligatorio al usuario antes de visualizar salida.',
        'provenance.action.viewBibliography': 'Bibliografía disponible para consulta.',
    },
};

function actionTextFor(key: string, locale: string): string {
    return ACTION_TEXTS[locale]?.[key] || ACTION_TEXTS[PT_BR_LOCALE]?.[key] || key;
}

function escapeHtml(str: string): string {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
