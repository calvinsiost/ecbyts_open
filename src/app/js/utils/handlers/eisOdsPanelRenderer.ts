// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * EIS ODS Panel Renderer (pure, DI-based)
 * Builders puros para os paineis secundarios do dashboard EIS:
 *   - ODS overlay (Objetivos de Desenvolvimento Sustentavel)
 *   - Indicadores paralelos (Phase-1 governance chips)
 *   - Quality Extensions (validity/uniqueness/uncertainty/exception context)
 *
 * Saidas sao strings HTML ou objetos de estado - DOM/wire fica em eis.js.
 *
 * Extracted from app/js/utils/handlers/eis.js (P0-1 monolith refactor).
 */

function safeEscape(escapeHtml: any, value: any): string {
    return escapeHtml?.(String(value ?? '')) ?? String(value ?? '');
}

/**
 * Resolve cor de score ODS (0-5) usando paleta de gates.
 */
export function getOdsScoreColor(score: number | null): string {
    if (score == null || !Number.isFinite(score)) return '#6b7280';
    if (score >= 4.5) return '#22c55e';
    if (score >= 3.5) return '#f59e0b';
    if (score >= 2.5) return '#f97316';
    return '#ef4444';
}

/**
 * Resolve cor por nivel de evidencia (high/medium/low/none).
 */
export function getOdsEvidenceColor(evidence: string): string {
    if (evidence === 'high') return '#22c55e';
    if (evidence === 'medium') return '#f59e0b';
    if (evidence === 'low') return '#f97316';
    return '#6b7280';
}

/**
 * Mapeia confidence.level em classe CSS para chip.
 * @param level - 'high' | 'medium' | 'low'
 */
export function getOdsConfidenceClass(level: string): string {
    if (level === 'high') return 'high';
    if (level === 'medium') return 'medium';
    return 'low';
}

/**
 * Resolve titulo localizado de um eixo ODS conforme idioma corrente.
 * @param axis - eixo ODS (com title, titleEn, titleEs)
 * @param lang - locale codigo (ex: 'en-US', 'pt-BR')
 */
export function getOdsLocaleTitle(axis: any, lang: string): string {
    if (!axis) return '';
    const code = String(lang || 'pt-BR');
    if (code.startsWith('en')) return axis.titleEn || axis.title || '';
    if (code.startsWith('es')) return axis.titleEs || axis.title || '';
    return axis.title || '';
}

/**
 * Ordena entries de overlay.axes na ordem canonica ODS1->ODS17.
 * Mantem ordem para leitura consistente; nao ordena por score.
 */
export function sortOdsEntries(overlay: any): Array<[string, any]> {
    const axes = overlay?.axes || {};
    return Object.entries(axes).sort((a, b) => {
        const na = Number(String(a[0]).replace('ODS', ''));
        const nb = Number(String(b[0]).replace('ODS', ''));
        return (Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0);
    });
}

/**
 * Conta quantos eixos ODS tem evidenceLevel != 'none'.
 */
export function countImplementedOds(entries: Array<[string, any]>): number {
    if (!Array.isArray(entries)) return 0;
    return entries.filter(([, axis]) => axis?.evidenceLevel && axis.evidenceLevel !== 'none').length;
}

/**
 * Constroi HTML de um card ODS individual.
 * @param entry - tupla [key, axis]
 * @param lang - locale codigo
 */
export function buildOdsCardHtml(entry: [string, any], lang: string, escapeHtml: (s: string) => string): string {
    const [key, axis] = entry;
    const hasScore = axis?.score != null;
    const score = hasScore ? Number(axis.score) : null;
    const scoreColor = hasScore ? getOdsScoreColor(score) : '#6b7280';
    const evidence = axis?.evidenceLevel || 'none';
    const evColor = getOdsEvidenceColor(evidence);
    const accent = axis?.color || '#94a3b8';
    const title = getOdsLocaleTitle(axis || {}, lang) || key;
    const scoreLabel = hasScore && score != null && Number.isFinite(score) ? score.toFixed(1) : '—';
    const notes = Array.isArray(axis?.notes) && axis.notes.length > 0 ? axis.notes[0] : '';
    const titleAttr = notes ? `title="${safeEscape(escapeHtml, notes)}"` : '';
    const eligibleE = Number(axis?.eligibleElements || 0);
    const eligibleR = Number(axis?.eligibleReadings || 0);

    return `
                <button type="button" class="eis-ods-card" data-ods-id="${safeEscape(escapeHtml, key)}" data-evidence="${safeEscape(escapeHtml, evidence)}" style="border-left:3px solid ${accent};" ${titleAttr} aria-label="${safeEscape(escapeHtml, key)} ${safeEscape(escapeHtml, title)}">
                    <div class="eis-ods-card-top">
                        <span class="eis-ods-id">${safeEscape(escapeHtml, key)}</span>
                        <span class="eis-ods-score" style="color:${scoreColor}">${scoreLabel}</span>
                    </div>
                    <div class="eis-ods-card-title">${safeEscape(escapeHtml, title)}</div>
                    <div class="eis-ods-meta">
                        <span class="eis-ods-evidence-badge" style="background:${evColor}" aria-label="Evidence: ${safeEscape(escapeHtml, evidence)}">${safeEscape(escapeHtml, evidence)}</span>
                        <span class="eis-ods-elig">E:${eligibleE} R:${eligibleR}</span>
                    </div>
                </button>
            `;
}

/**
 * Constroi HTML completo do painel ODS overlay.
 *
 * @param overlay - resultado de overlay ODS (de computeSimplifiedEIS).
 * @param deps - dependencias injetadas
 *   visible=false significa que panel deve ser ocultado (sem overlay ou disabled).
 */
export function buildOdsPanelHtml(
    overlay: any | null,
    { escapeHtml, getCurrentLanguage }: { escapeHtml?: Function; getCurrentLanguage?: Function } = {},
): { visible: boolean; html: string } {
    if (!overlay || overlay.enabled !== true) {
        return { visible: false, html: '' };
    }

    const composite = Number(overlay.composite || 0);
    const coveragePct = Math.round(Number(overlay.coverage || 0) * 100);
    const conf = overlay.confidence || { score: 0, level: 'low' };
    const confPct = Math.round(Number(conf.score || 0) * 100);
    const confClass = getOdsConfidenceClass(conf.level);

    const lang = (() => {
        try {
            return getCurrentLanguage?.() || 'pt-BR';
        } catch {
            return 'pt-BR';
        }
    })();

    const entries = sortOdsEntries(overlay);
    const cards = entries.map((entry) => buildOdsCardHtml(entry, lang, escapeHtml as any)).join('');
    const implemented = countImplementedOds(entries);

    const html = `
        <div class="eis-ods-header">
            <span class="eis-ods-title">ODS Overlay</span>
            <span class="eis-ods-version">${safeEscape(escapeHtml, overlay.version || 'ods-v2')} · ${implemented}/17</span>
        </div>
        <div class="eis-ods-summary">
            <span class="eis-ods-chip">Composite ${composite.toFixed(2)}</span>
            <span class="eis-ods-chip">Coverage ${coveragePct}%</span>
            <span class="eis-ods-chip eis-ods-chip-${confClass}">Confidence ${confPct}% (${safeEscape(escapeHtml, conf.level || 'low')})</span>
        </div>
        <div class="eis-ods-grid">${cards}</div>
    `;

    return { visible: true, html };
}

/**
 * Constroi HTML do modal de drill-down de um eixo ODS especifico.
 */
export function buildOdsDrillDownHtml({
    id,
    axis,
    overlay,
    escapeHtml,
}: {
    id: string;
    axis: any;
    overlay?: any;
    escapeHtml: Function;
}): string {
    const score = axis?.score != null && Number.isFinite(Number(axis.score)) ? Number(axis.score).toFixed(2) : '—';
    const imp =
        axis?.impactScore != null && Number.isFinite(Number(axis.impactScore))
            ? Number(axis.impactScore).toFixed(2)
            : '—';
    const cov =
        axis?.coverageScore != null && Number.isFinite(Number(axis.coverageScore))
            ? Number(axis.coverageScore).toFixed(2)
            : '—';
    const confS =
        axis?.confidenceScore != null && Number.isFinite(Number(axis.confidenceScore))
            ? Number(axis.confidenceScore).toFixed(2)
            : '—';
    const evidence = axis?.evidenceLevel || 'none';
    const title = axis?.title || id;
    const color = axis?.color || '#94a3b8';
    const notes = Array.isArray(axis?.notes) ? axis.notes : [];
    const notesHtml = notes.length
        ? `<ul class="eis-ods-drill-notes">${notes.map((n: any) => `<li>${safeEscape(escapeHtml, n)}</li>`).join('')}</ul>`
        : '<p class="eis-ods-drill-muted">Sem notas para este eixo.</p>';
    const eligibleE = Number(axis?.eligibleElements || 0);
    const eligibleR = Number(axis?.eligibleReadings || 0);
    const eligibleC = Number(axis?.eligibleCampaigns || 0);
    const version = overlay?.version || 'ods-v2';

    return `
        <div class="eis-ods-drill-inner" style="border-top:4px solid ${color};">
            <header class="eis-ods-drill-head">
                <div>
                    <span class="eis-ods-drill-id">${safeEscape(escapeHtml, id)}</span>
                    <h3 id="eis-ods-drill-title" class="eis-ods-drill-title">${safeEscape(escapeHtml, title)}</h3>
                </div>
                <button type="button" class="eis-ods-drill-close" aria-label="Fechar">&#x2715;</button>
            </header>
            <section class="eis-ods-drill-body">
                <div class="eis-ods-drill-stats">
                    <div class="eis-ods-drill-stat"><span>Final Score</span><strong>${score}</strong></div>
                    <div class="eis-ods-drill-stat"><span>Impact (50%)</span><strong>${imp}</strong></div>
                    <div class="eis-ods-drill-stat"><span>Coverage (30%)</span><strong>${cov}</strong></div>
                    <div class="eis-ods-drill-stat"><span>Confidence (20%)</span><strong>${confS}</strong></div>
                </div>
                <div class="eis-ods-drill-eligible">
                    <span>Elegiveis: <strong>E</strong> ${eligibleE}
                    · <strong>R</strong> ${eligibleR}
                    · <strong>C</strong> ${eligibleC}</span>
                    <span>Evidence: <span class="eis-ods-drill-badge" data-evidence="${safeEscape(escapeHtml, evidence)}">${safeEscape(escapeHtml, evidence)}</span></span>
                </div>
                <h4 class="eis-ods-drill-section">Notas / Gaps</h4>
                ${notesHtml}
                <p class="eis-ods-drill-formula">
                    Formula canonica — <code>score = 0.50·impact + 0.30·coverage + 0.20·confidence</code>
                    (SPEC_EIS_ODS_MONITORING_PACK ${safeEscape(escapeHtml, version)}).
                </p>
            </section>
        </div>
    `;
}

/**
 * Garante a existencia do modal DOM de ODS drill-down e instala listeners idempotentes.
 * Cria o elemento na primeira chamada; reaproveita em chamadas subsequentes.
 * Listeners ESC e backdrop-click sao instalados apenas na criacao.
 */
export function ensureOdsDrillDownModal({ doc }: { doc?: Document } = {}): HTMLElement {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) {
        throw new Error('eisOdsPanelRenderer.ensureOdsDrillDownModal: document indisponivel');
    }

    let modal = d.getElementById('eis-ods-drilldown-modal');
    if (modal) return modal;

    modal = d.createElement('div');
    modal.id = 'eis-ods-drilldown-modal';
    modal.className = 'eis-ods-drilldown-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'eis-ods-drill-title');
    d.body.appendChild(modal);

    modal.addEventListener('click', (ev) => {
        if (ev.target === modal) (modal as HTMLElement).hidden = true;
    });
    d.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !(modal as HTMLElement).hidden) (modal as HTMLElement).hidden = true;
    });

    return modal;
}

/**
 * Resolve overlay ODS ativo para o escopo selecionado.
 * Quando scope != 'model', usa overlay do scopedResult; caso contrario, computa
 * via callback do modelo simplificado.
 */
export function getActiveOdsOverlay({
    currentScopeType = 'model',
    currentScopedResult = null,
    computeModelOverlay,
}: {
    currentScopeType?: string;
    currentScopedResult?: any;
    computeModelOverlay: Function;
}): Record<string, unknown> | null {
    if (currentScopeType !== 'model' && currentScopedResult?.odsOverlay) {
        return currentScopedResult.odsOverlay;
    }
    const modelResult = computeModelOverlay?.();
    return modelResult?.odsOverlay || null;
}

/**
 * Coerce numerico para number ou retorna fallback.
 */
function coerceNumber(value: any, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Resolve indicadores paralelos (phase-1) para o escopo ativo.
 * Combina baseScore, governanceAdjustment e finalScore com possivel SQL bridge.
 */
export function getActiveParallelIndicators({
    currentScopeType = 'model',
    currentScopedResult = null,
    computeModelResult,
    weightedSqlBridge = null,
}: {
    currentScopeType?: string;
    currentScopedResult?: any;
    computeModelResult: Function;
    weightedSqlBridge?: any | null;
}): Record<string, unknown> | null {
    if (currentScopeType !== 'model' && currentScopedResult) {
        return {
            baseScore: coerceNumber(currentScopedResult.baseScore, currentScopedResult.eis || 0),
            governanceAdjustment: coerceNumber(currentScopedResult.governanceAdjustment, 0),
            finalScore: coerceNumber(currentScopedResult.finalScore, currentScopedResult.eis || 0),
            sqlParity: currentScopedResult.sqlParity || null,
            confidence: currentScopedResult.confidence || null,
        };
    }

    const modelResult = computeModelResult?.() || {};
    const aggregationSource = weightedSqlBridge?.source === 'sql' ? 'sql' : modelResult.aggregationSource || 'runtime';
    const sqlScoreValid = aggregationSource === 'sql' && Number.isFinite(weightedSqlBridge?.sqlScore);

    return {
        baseScore: coerceNumber(modelResult.baseScore, modelResult.eis || 0),
        governanceAdjustment: coerceNumber(modelResult.governanceAdjustment, 0),
        finalScore: sqlScoreValid
            ? weightedSqlBridge.sqlScore
            : coerceNumber(modelResult.finalScore, modelResult.eis || 0),
        sqlParity: modelResult.sqlParity || null,
        confidence: modelResult.confidence || null,
        aggregationSource,
    };
}

/**
 * Constroi HTML dos chips de indicadores paralelos (Base/Adj/Final/Conf/Source/Parity).
 *
 * @param indicators - retorno de getActiveParallelIndicators
 */
export function buildParallelIndicatorsHtml(
    indicators: any | null,
    { escapeHtml }: { escapeHtml?: Function } = {},
): string {
    if (!indicators) return '';

    const adj = `${indicators.governanceAdjustment >= 0 ? '+' : ''}${indicators.governanceAdjustment.toFixed(2)}`;
    const conf = indicators.confidence || { score: 0, level: 'low' };
    const confPct = Math.round((conf.score || 0) * 100);
    const parity = indicators.sqlParity;
    const parityLabel = parity?.available
        ? `SQL parity ${parity.matched ? 'OK' : 'DRIFT'} (Δ ${Number(parity.delta || 0).toFixed(2)})`
        : 'SQL parity n/a';
    const confLevel = conf.level || 'low';
    const sourceLabel = indicators.aggregationSource === 'sql' ? 'SQL' : 'Runtime';

    return `
        <span class="eis-parallel-chip">Base ${Number(indicators.baseScore || 0).toFixed(2)}</span>
        <span class="eis-parallel-chip">Adj ${adj}</span>
        <span class="eis-parallel-chip">Final ${Number(indicators.finalScore || 0).toFixed(2)}</span>
        <span class="eis-parallel-chip">Conf ${confPct}% ${safeEscape(escapeHtml, confLevel)}</span>
        <span class="eis-parallel-chip">Source ${safeEscape(escapeHtml, sourceLabel)}</span>
        <span class="eis-parallel-chip">${safeEscape(escapeHtml, parityLabel)}</span>
    `;
}

/**
 * Constroi HTML do painel Quality Extensions (V/U/Unc/Ex).
 * Mostra 4 cards com score, meta numerica e botao Fix data por extensao.
 *
 * @param q - resultado de computeQualityExtensionsFromObservations
 */
export function buildQualityExtensionsHtml(q: any, { translate }: { translate?: Function } = {}): string {
    if (!q) return '';
    const tr = (key: string, fallback: string) => translate?.(key) || fallback;

    const validity = q.validity || { score: 0, valid: 0, total: 0, ratio: 0 };
    const uniqueness = q.uniqueness || { score: 0, duplicates: 0, evaluated: 0, ratio: 0 };
    const uncertainty = q.uncertainty || { score: 0, confidence: 0, lowUncertainty: 0 };
    const exceptionContext = q.exceptionContext || { count: 0, ratio: 0, catastrophicPendingReview: 0 };

    const validityPct = Math.round((validity.ratio || 0) * 100);
    const uniquePct = Math.round((uniqueness.ratio || 0) * 100);
    const uncConfPct = Math.round((uncertainty.confidence || 0) * 100);
    const exceptionRatio = ((exceptionContext.ratio || 0) * 100).toFixed(1);

    const fixLabel = tr('eis.fix_data', 'Fix data');

    return buildQualityExtensionsCardsHtml({
        validity,
        uniqueness,
        uncertainty,
        exceptionContext,
        validityPct,
        uniquePct,
        uncConfPct,
        exceptionRatio,
        fixLabel,
        tr,
    });
}

/**
 * Estende um conjunto de scores 6-axes para 10-axes (extended_10 view) usando
 * extensoes de qualidade calculadas em outra camada.
 *
 * @param baseScores - mapa axisId -> score (T,A,Cp,Ty,Cs,Cm)
 * @param qualityExtensions - retorno de computeQualityExtensionsFromObservations
 */
export function buildExtended10Scores(baseScores: any, qualityExtensions: any): Record<string, unknown> {
    const q = qualityExtensions || {};
    return {
        ...(baseScores || {}),
        V: Number(q?.validity?.score || 0),
        U: Number(q?.uniqueness?.score || 0),
        Unc: Number(q?.uncertainty?.score || 0),
        Ex: Number(q?.exceptionContext?.score || 0),
    };
}

/**
 * Helper interno: constroi os 4 cards de Quality Extensions.
 */
function buildQualityExtensionsCardsHtml({
    validity,
    uniqueness,
    uncertainty,
    exceptionContext,
    validityPct,
    uniquePct,
    uncConfPct,
    exceptionRatio,
    fixLabel,
    tr,
}: any): string {
    return `
        <div class="eis-qx-title">Quality Extensions (v1)</div>
        <div class="eis-qx-grid">
            <div class="eis-qx-card">
                <div class="eis-qx-top"><span>${tr('eis.validity', 'Validity')}</span><b>${validity.score.toFixed(1)}</b></div>
                <div class="eis-qx-meta">${validity.valid}/${validity.total} (${validityPct}%)</div>
                <button class="eis-qx-fix-btn" data-cc-action="cc-d03dac10">${fixLabel}</button>
            </div>
            <div class="eis-qx-card">
                <div class="eis-qx-top"><span>${tr('eis.uniqueness', 'Uniqueness')}</span><b>${uniqueness.score.toFixed(1)}</b></div>
                <div class="eis-qx-meta">dup ${uniqueness.duplicates} · ${uniquePct}% unique (op ${uniqueness.evaluated})</div>
                <button class="eis-qx-fix-btn" data-cc-action="cc-f0aa92de">${fixLabel}</button>
            </div>
            <div class="eis-qx-card">
                <div class="eis-qx-top"><span>${tr('eis.uncertainty', 'Uncertainty')}</span><b>${uncertainty.score.toFixed(1)}</b></div>
                <div class="eis-qx-meta">coverage ${uncConfPct}% · low-unc ${uncertainty.lowUncertainty}</div>
                <button class="eis-qx-fix-btn" data-cc-action="cc-228a26fa">${fixLabel}</button>
            </div>
            <div class="eis-qx-card">
                <div class="eis-qx-top"><span>${tr('eis.exception_context', 'Exception Context')}</span><b>${exceptionContext.count}</b></div>
                <div class="eis-qx-meta">regulatory_exception ratio ${exceptionRatio}% · pending review ${exceptionContext.catastrophicPendingReview || 0}</div>
                <button class="eis-qx-fix-btn" data-cc-action="cc-04c26073">${fixLabel}</button>
            </div>
        </div>
    `;
}
