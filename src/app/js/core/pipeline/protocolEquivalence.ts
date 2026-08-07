// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PROTOCOL EQUIVALENCE - equivalencia visual + estrutural com
   scoring multidimensional (PIPELINE-UNIFIED-PROTOCOL #10).

   "Comparacao pixel insuficiente: Equivalencia visual + estrutural;
   visual >= 95% NAO aprova sozinho se conectores, fases ou dados
   tiverem lacuna critica." (SPEC_PIPELINE_UNIFIED_PROTOCOL.md,
   blind spot "Comparacao pixel insuficiente").

   Seis dimensoes: visualScore, quadrantScores, elementCoverage,
   connectorCoverage, phaseCoverage, dataNatureCoverage. A aprovacao
   exige visual na meta E zero lacuna critica estrutural — numero
   visual alto nunca aprova sozinho.

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   O renderer devolve string escapada (XSS-safe) para o Workbench
   injetar via innerHTML de template estatico.
   ================================================================ */

import type {
    PipelineProtocolConnector,
    PipelineProtocolDocument,
} from '../pipelines/pipelineProtocol.js';
import type { ProtocolValidationFinding } from './protocolValidationFinding.js';

export const PROTOCOL_EQUIVALENCE_VISUAL_TARGET = 95;
export const PROTOCOL_EQUIVALENCE_CRITICAL_COVERAGE_MIN = 90;
export const PROTOCOL_EQUIVALENCE_MAX_MISSING_LISTED = 5;

export type ProtocolEquivalenceDimensionId = 'elements' | 'connectors' | 'phases' | 'dataNatures';

export type ProtocolEquivalenceStatus = 'approved' | 'blocked' | 'missing-data';

export interface ProtocolEquivalenceDimension {
    id: ProtocolEquivalenceDimensionId;
    label: string;
    /** Cobertura 0-100; null quando a referencia nao espera nada nesta dimensao. */
    score: number | null;
    expected: number;
    covered: number;
    missingCount: number;
    missing: string[];
    criticalGap: boolean;
}

export interface ProtocolEquivalenceQuadrantScore {
    id: string;
    score: number | null;
    belowTarget: boolean;
}

export interface ProtocolEquivalenceScore {
    visualScore: number | null;
    visualTarget: number;
    visualApproved: boolean;
    quadrantScores: ProtocolEquivalenceQuadrantScore[];
    elementCoverage: ProtocolEquivalenceDimension;
    connectorCoverage: ProtocolEquivalenceDimension;
    phaseCoverage: ProtocolEquivalenceDimension;
    dataNatureCoverage: ProtocolEquivalenceDimension;
    criticalGaps: ProtocolEquivalenceDimensionId[];
    approved: boolean;
    status: ProtocolEquivalenceStatus;
    statusLabel: string;
    explanation: string;
    findings: ProtocolValidationFinding[];
}

export interface ProtocolEquivalenceInput {
    /** Resultado bruto da comparacao visual (mesmo formato do visual audit). */
    visual?: unknown;
    /** Protocolo de referencia (fonte/original). */
    reference?: PipelineProtocolDocument | null;
    /** Protocolo candidato (pack gerado/editado). */
    candidate?: PipelineProtocolDocument | null;
}

export interface ProtocolEquivalenceOptions {
    visualTarget?: number;
    criticalCoverageMin?: number;
}

interface CoverageItem {
    key: string;
    label: string;
    required: boolean;
}

const DIMENSION_LABEL: Record<ProtocolEquivalenceDimensionId, string> = {
    elements: 'Elementos do processo',
    connectors: 'Conectores',
    phases: 'Fases',
    dataNatures: 'Natureza dos dados',
};

function _asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function _asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function _text(value: unknown): string {
    return String(value ?? '').trim();
}

function _number(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.replace('%', '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function _round2(value: number): number {
    return Number(value.toFixed(2));
}

function _formatPercent(value: number | null): string {
    if (value == null) return 'sem dados';
    const rounded = _round2(value);
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2)}%`;
}

function _visualScore(raw: Record<string, unknown>): number | null {
    for (const key of ['foregroundScore', 'foregroundAgreement', 'scoreForeground', 'agreement', 'score']) {
        const value = _number(raw[key]);
        if (value != null) return value;
    }
    return null;
}

function _quadrantScores(raw: Record<string, unknown>, target: number): ProtocolEquivalenceQuadrantScore[] {
    return _asArray(raw.quadrants).map((entry, index) => {
        const quadrant = _asObject(entry);
        const score = _number(quadrant.score) ?? _number(quadrant.foregroundScore) ?? _number(quadrant.agreement);
        return {
            id: _text(quadrant.id) || `Q${index + 1}`,
            score: score == null ? null : _round2(score),
            belowTarget: score != null && score < target,
        };
    });
}

function _elementItems(doc: PipelineProtocolDocument | null | undefined): CoverageItem[] {
    if (!doc || !Array.isArray(doc.elements)) return [];
    return doc.elements.map((element) => ({
        key: _text(element.id) || _text(element.sourceNodeId),
        label: _text(element.label) || _text(element.id) || 'elemento sem nome',
        required: true,
    })).filter((item) => item.key);
}

function _connectorItems(doc: PipelineProtocolDocument | null | undefined): CoverageItem[] {
    if (!doc || !Array.isArray(doc.connectors)) return [];
    return doc.connectors.map((connector: PipelineProtocolConnector) => ({
        key: _text(connector.id),
        label: _text(connector.label) || _text(connector.id) || 'conector sem nome',
        required: connector.required === true,
    })).filter((item) => item.key);
}

function _phaseItems(doc: PipelineProtocolDocument | null | undefined): CoverageItem[] {
    if (!doc || !Array.isArray(doc.phases)) return [];
    return doc.phases.map((phase) => ({
        key: _text(phase.id),
        label: _text(phase.label) || _text(phase.id) || 'fase sem nome',
        required: true,
    })).filter((item) => item.key);
}

function _dataNatureItems(doc: PipelineProtocolDocument | null | undefined): CoverageItem[] {
    if (!doc || !Array.isArray(doc.dataNatures)) return [];
    return doc.dataNatures.map((nature) => ({
        key: _text(nature.id),
        label: _text(nature.label) || _text(nature.id) || 'natureza sem nome',
        required: true,
    })).filter((item) => item.key);
}

function _candidateElementKeys(doc: PipelineProtocolDocument | null | undefined): Set<string> {
    const keys = new Set<string>();
    for (const element of doc?.elements ?? []) {
        const id = _text(element.id);
        const source = _text(element.sourceNodeId);
        if (id) keys.add(id);
        if (source) keys.add(source);
    }
    return keys;
}

function _candidateConnectorKeys(doc: PipelineProtocolDocument | null | undefined): Set<string> {
    return new Set((doc?.connectors ?? []).map((connector) => _text(connector.id)).filter(Boolean));
}

/* Uma fase esta coberta quando o candidato declara a fase OU tem algum
   elemento/atividade atribuido a ela — evita falso-negativo quando o
   candidato achata a lista de fases mas mantem a atribuicao por item. */
function _candidatePhaseKeys(doc: PipelineProtocolDocument | null | undefined): Set<string> {
    const keys = new Set((doc?.phases ?? []).map((phase) => _text(phase.id)).filter(Boolean));
    for (const element of doc?.elements ?? []) {
        const phaseId = _text(element.phaseId);
        if (phaseId) keys.add(phaseId);
    }
    for (const activity of doc?.activities ?? []) {
        const phaseId = _text(activity.phaseId);
        if (phaseId) keys.add(phaseId);
    }
    return keys;
}

function _candidateDataNatureKeys(doc: PipelineProtocolDocument | null | undefined): Set<string> {
    const keys = new Set((doc?.dataNatures ?? []).map((nature) => _text(nature.id)).filter(Boolean));
    for (const element of doc?.elements ?? []) {
        const natureId = _text(element.dataNatureId);
        if (natureId) keys.add(natureId);
    }
    for (const data of doc?.data ?? []) {
        const natureId = _text(data.dataNatureId);
        if (natureId) keys.add(natureId);
    }
    return keys;
}

function _coverageDimension(
    id: ProtocolEquivalenceDimensionId,
    expectedItems: CoverageItem[],
    candidateKeys: Set<string>,
    criticalCoverageMin: number,
): ProtocolEquivalenceDimension {
    if (expectedItems.length === 0) {
        return {
            id,
            label: DIMENSION_LABEL[id],
            score: null,
            expected: 0,
            covered: 0,
            missingCount: 0,
            missing: [],
            criticalGap: false,
        };
    }
    const missingItems = expectedItems.filter((item) => !candidateKeys.has(item.key));
    const covered = expectedItems.length - missingItems.length;
    const score = _round2((covered / expectedItems.length) * 100);
    /* Lacuna critica: cobertura abaixo do piso OU item obrigatorio faltando
       (conector required). Qualquer uma das duas trava a aprovacao mesmo
       com visual acima de 95%. */
    const missingRequired = missingItems.some((item) => item.required);
    const criticalGap = score < criticalCoverageMin || (id === 'connectors' && missingRequired);
    return {
        id,
        label: DIMENSION_LABEL[id],
        score,
        expected: expectedItems.length,
        covered,
        missingCount: missingItems.length,
        missing: missingItems.slice(0, PROTOCOL_EQUIVALENCE_MAX_MISSING_LISTED).map((item) => item.label),
        criticalGap,
    };
}

function _dimensionFinding(dimension: ProtocolEquivalenceDimension): ProtocolValidationFinding {
    const gap = dimension.score == null ? 0 : _round2(Math.max(0, PROTOCOL_EQUIVALENCE_CRITICAL_COVERAGE_MIN - dimension.score));
    const missingText = dimension.missing.length ? ` Faltando: ${dimension.missing.join(', ')}.` : '';
    return {
        rule: `equivalence.${dimension.id}.critical-gap`,
        severity: 'error',
        message: `${dimension.label} com lacuna critica: cobertura ${_formatPercent(dimension.score)} (${dimension.covered}/${dimension.expected}).${missingText}`,
        score: gap,
        evidence: `${dimension.missingCount} item(ns) sem equivalente no candidato.`,
    };
}

function _visualFinding(score: number, target: number): ProtocolValidationFinding {
    return {
        rule: 'equivalence.visual.below-target',
        severity: 'error',
        message: `Semelhanca visual abaixo da meta: ${_formatPercent(score)} contra meta ${_formatPercent(target)}.`,
        score: _round2(target - score),
        evidence: 'Comparacao da imagem original com o desenho gerado.',
    };
}

function _statusLabel(status: ProtocolEquivalenceStatus): string {
    if (status === 'approved') return 'Aprovado';
    if (status === 'blocked') return 'Bloqueado';
    return 'Sem dados';
}

function _explanation(
    status: ProtocolEquivalenceStatus,
    visualScore: number | null,
    visualTarget: number,
    criticalGaps: ProtocolEquivalenceDimensionId[],
): string {
    if (status === 'missing-data') {
        return 'Sem resultado de comparacao visual: rode a comparacao antes de declarar equivalencia.';
    }
    if (status === 'approved') {
        return `Equivalencia aprovada: visual ${_formatPercent(visualScore)} na meta ${_formatPercent(visualTarget)} e estrutura sem lacuna critica.`;
    }
    const gapLabels = criticalGaps.map((id) => DIMENSION_LABEL[id].toLowerCase()).join(', ');
    if (visualScore != null && visualScore >= visualTarget && criticalGaps.length > 0) {
        return `Visual atingiu ${_formatPercent(visualScore)} (meta ${_formatPercent(visualTarget)}), mas NAO aprova sozinho: lacuna critica em ${gapLabels}.`;
    }
    if (criticalGaps.length > 0) {
        return `Equivalencia bloqueada: visual abaixo da meta e lacuna critica em ${gapLabels}.`;
    }
    return `Equivalencia bloqueada: visual ${_formatPercent(visualScore)} abaixo da meta ${_formatPercent(visualTarget)}.`;
}

/**
 * Compute the multidimensional equivalence between a reference protocol and
 * a candidate protocol, combining the visual comparison with structural
 * coverage. The spec rule is enforced here: a visualScore at or above the
 * target (default 95%) never approves alone when connectors, phases or
 * data natures show a critical gap.
 *
 * @param {ProtocolEquivalenceInput} input visual result + reference/candidate protocols
 * @param {ProtocolEquivalenceOptions} [options] target and critical-coverage overrides
 * @returns {ProtocolEquivalenceScore} multidimensional score with explainable findings
 */
export function computeProtocolEquivalence(
    input: ProtocolEquivalenceInput,
    options: ProtocolEquivalenceOptions = {},
): ProtocolEquivalenceScore {
    const safeInput = input || {};
    const raw = _asObject(safeInput.visual);
    const visualTarget = _number(options.visualTarget) ?? PROTOCOL_EQUIVALENCE_VISUAL_TARGET;
    const criticalCoverageMin = _number(options.criticalCoverageMin) ?? PROTOCOL_EQUIVALENCE_CRITICAL_COVERAGE_MIN;

    const visualScore = _visualScore(raw);
    const quadrantScores = _quadrantScores(raw, visualTarget);
    const reference = safeInput.reference ?? null;
    const candidate = safeInput.candidate ?? null;

    const elementCoverage = _coverageDimension('elements', _elementItems(reference), _candidateElementKeys(candidate), criticalCoverageMin);
    const connectorCoverage = _coverageDimension('connectors', _connectorItems(reference), _candidateConnectorKeys(candidate), criticalCoverageMin);
    const phaseCoverage = _coverageDimension('phases', _phaseItems(reference), _candidatePhaseKeys(candidate), criticalCoverageMin);
    const dataNatureCoverage = _coverageDimension('dataNatures', _dataNatureItems(reference), _candidateDataNatureKeys(candidate), criticalCoverageMin);

    const dimensions = [elementCoverage, connectorCoverage, phaseCoverage, dataNatureCoverage];
    const criticalGaps = dimensions.filter((dimension) => dimension.criticalGap).map((dimension) => dimension.id);

    const hasVisualData = visualScore != null;
    const visualApproved = hasVisualData && (visualScore as number) >= visualTarget;
    const approved = visualApproved && criticalGaps.length === 0;
    const status: ProtocolEquivalenceStatus = !hasVisualData ? 'missing-data' : approved ? 'approved' : 'blocked';

    const findings: ProtocolValidationFinding[] = [];
    for (const dimension of dimensions) {
        if (dimension.criticalGap) findings.push(_dimensionFinding(dimension));
    }
    if (hasVisualData && !visualApproved) findings.push(_visualFinding(visualScore as number, visualTarget));

    return {
        visualScore: visualScore == null ? null : _round2(visualScore),
        visualTarget: _round2(visualTarget),
        visualApproved,
        quadrantScores,
        elementCoverage,
        connectorCoverage,
        phaseCoverage,
        dataNatureCoverage,
        criticalGaps,
        approved,
        status,
        statusLabel: _statusLabel(status),
        explanation: _explanation(status, visualScore, visualTarget, criticalGaps),
        findings,
    };
}

function _esc(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _dimensionRowHtml(dimension: ProtocolEquivalenceDimension): string {
    const scoreLabel = dimension.score == null
        ? 'nada esperado'
        : `${_formatPercent(dimension.score)} (${dimension.covered}/${dimension.expected})`;
    const missingNote = dimension.missingCount > 0
        ? `<small>Faltando ${dimension.missingCount}: ${_esc(dimension.missing.join(', '))}</small>`
        : '';
    return `
            <li data-pipeline-equivalence-dimension="${_esc(dimension.id)}"
                data-pipeline-equivalence-critical="${dimension.criticalGap ? 'true' : 'false'}">
              <span>${_esc(dimension.label)}</span>
              <strong>${_esc(scoreLabel)}</strong>
              ${missingNote}
            </li>`;
}

function _quadrantSummaryHtml(quadrantScores: ProtocolEquivalenceQuadrantScore[]): string {
    if (quadrantScores.length === 0) return '';
    const below = quadrantScores.filter((quadrant) => quadrant.belowTarget);
    const ids = below.slice(0, PROTOCOL_EQUIVALENCE_MAX_MISSING_LISTED).map((quadrant) => quadrant.id);
    const note = below.length
        ? `${below.length} quadrante(s) abaixo da meta: ${ids.join(', ')}`
        : 'todos os quadrantes na meta';
    return `
            <li data-pipeline-equivalence-dimension="quadrants"
                data-pipeline-equivalence-critical="false">
              <span>Quadrantes da comparacao</span>
              <strong>${_esc(quadrantScores.length)} avaliados</strong>
              <small>${_esc(note)}</small>
            </li>`;
}

/**
 * Render the multidimensional equivalence as an escaped HTML section for
 * the Pipeline Pack Workbench. Lists all six spec dimensions (visual,
 * quadrants, elements, connectors, phases, data natures) plus the verdict
 * and the explainable findings — the number never stands alone.
 *
 * @param {ProtocolEquivalenceScore} score score from computeProtocolEquivalence
 * @returns {string} HTML section (all dynamic text escaped)
 */
export function renderProtocolEquivalenceHtml(score: ProtocolEquivalenceScore): string {
    const safeScore = score || ({} as ProtocolEquivalenceScore);
    const findings = Array.isArray(safeScore.findings) ? safeScore.findings : [];
    const findingRows = findings.length
        ? `<ul class="pipeline-equivalence-findings">${findings.map((finding) => `
            <li data-pipeline-equivalence-finding="${_esc(finding.rule)}"
                data-pipeline-equivalence-severity="${_esc(finding.severity)}">${_esc(finding.message)}</li>`).join('')}
          </ul>`
        : '';
    const dimensions = [
        safeScore.elementCoverage,
        safeScore.connectorCoverage,
        safeScore.phaseCoverage,
        safeScore.dataNatureCoverage,
    ].filter((dimension): dimension is ProtocolEquivalenceDimension => Boolean(dimension));

    return `<section class="pipeline-equivalence"
             data-pipeline-equivalence="true"
             data-pipeline-equivalence-status="${_esc(safeScore.status || 'missing-data')}"
             data-pipeline-equivalence-approved="${safeScore.approved ? 'true' : 'false'}">
          <h4>Equivalencia visual e estrutural</h4>
          <p class="pipeline-equivalence-verdict" data-pipeline-equivalence-explanation="true">${_esc(safeScore.explanation || '')}</p>
          <ul class="pipeline-equivalence-dimensions">
            <li data-pipeline-equivalence-dimension="visual"
                data-pipeline-equivalence-critical="${safeScore.visualApproved === false && safeScore.visualScore != null ? 'true' : 'false'}">
              <span>Semelhanca com o desenho original</span>
              <strong>${_esc(_formatPercent(safeScore.visualScore ?? null))} / meta ${_esc(_formatPercent(safeScore.visualTarget ?? null))}</strong>
            </li>
            ${_quadrantSummaryHtml(Array.isArray(safeScore.quadrantScores) ? safeScore.quadrantScores : [])}
            ${dimensions.map(_dimensionRowHtml).join('')}
          </ul>
          ${findingRows}
        </section>`;
}
