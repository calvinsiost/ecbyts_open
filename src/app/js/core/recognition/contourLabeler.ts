// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2 (P1-7 G3 Raster Upload Georef - OCR label-to-contour matching)

/**
 * contourLabeler.js - associa rótulos OCR a isolinhas extraídas.
 *
 * Posição no pipeline G3:
 *   contourExtractor (pixel chains)
 *     → contourLabeler  ← elevationClassifier (classifica texto)
 *     → contourGeoreferencer (pixel → geo 3D)
 *     → export GeoJSON / 3D lines
 *
 * Algoritmo:
 *  1. Classifica cada rótulo OCR via classifyElevationLabel.
 *  2. Para cada rótulo classificado como elevação, calcula distância mínima
 *     de sua posição pixel ao ponto mais próximo de cada cadeia.
 *  3. Atribui o rótulo à cadeia mais próxima dentro do raio configurado.
 *  4. Cada cadeia recebe no máximo um rótulo (vence o de maior confiança;
 *     em empate de confiança, vence o mais próximo).
 *  5. Retorna cadeias rotuladas, não-rotuladas e rótulos órfãos.
 *
 * @module core/recognition/contourLabeler
 */

import { classifyElevationLabel, classifyElevationBatch } from './elevationClassifier.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Raio de busca padrão em pixels para associar rótulo a cadeia. */
const DEFAULT_SEARCH_RADIUS_PX = 60;

/** Mapa de prioridade de confiança para desempate. */
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1, none: 0 };

// ---------------------------------------------------------------------------
// Helpers de distância
// ---------------------------------------------------------------------------

/**
 * Distância euclidiana quadrática entre dois pontos 2D (evita sqrt quando possível).
 */
function _dist2(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

/**
 * Retorna distância mínima (em pixels) de um ponto (px, py) a qualquer ponto
 * de uma cadeia de contorno.
 *
 * Para cadeias longas, amostra 1 em cada `stride` pontos para eficiência;
 * quando encontra candidato próximo, refina nos vizinhos imediatos.
 *
 * @param px - coordenada x do rótulo (pixel)
 * @param py - coordenada y do rótulo (pixel)
 * @param chain - pontos da cadeia
 * @param stride - passo de amostragem inicial
 * @returns distância em pixels (Infinity se cadeia vazia)
 */
export function pointToChainMinDist(
    px: number,
    py: number,
    chain: Array<{ x: number; y: number }>,
    stride: number = 4,
): number {
    if (!Array.isArray(chain) || chain.length === 0) return Infinity;

    const step = Math.max(1, Math.floor(stride));
    let minDist2 = Infinity;
    let bestIdx = 0;

    // Varredura rápida com passo
    for (let i = 0; i < chain.length; i += step) {
        const p = chain[i];
        if (!p) continue;
        const d2 = _dist2(px, py, Number(p.x) || 0, Number(p.y) || 0);
        if (d2 < minDist2) {
            minDist2 = d2;
            bestIdx = i;
        }
    }

    // Refina na janela ao redor do melhor candidato
    const lo = Math.max(0, bestIdx - step);
    const hi = Math.min(chain.length - 1, bestIdx + step);
    for (let i = lo; i <= hi; i++) {
        const p = chain[i];
        if (!p) continue;
        const d2 = _dist2(px, py, Number(p.x) || 0, Number(p.y) || 0);
        if (d2 < minDist2) minDist2 = d2;
    }

    return Math.sqrt(minDist2);
}

/**
 * Calcula centroide de uma cadeia (para estimativa de posição representativa).
 */
export function chainCentroid(chain: Array<{ x: number; y: number }>): { cx: number; cy: number } {
    if (!Array.isArray(chain) || chain.length === 0) return { cx: 0, cy: 0 };
    let sumX = 0;
    let sumY = 0;
    for (const p of chain) {
        sumX += Number(p.x) || 0;
        sumY += Number(p.y) || 0;
    }
    return { cx: sumX / chain.length, cy: sumY / chain.length };
}

// ---------------------------------------------------------------------------
// Classificação e matching
// ---------------------------------------------------------------------------

interface OcrLabel {
    /** texto OCR (ex: "450m", "cota 100") */
    text: string;
    /** posição x no espaço pixel da imagem */
    x: number;
    /** posição y no espaço pixel da imagem */
    y: number;
}

interface ClassifiedLabel {
    text: string;
    x: number;
    y: number;
    isElevation: boolean;
    value: number | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
    reason: string;
    prefix: string | null;
    unit: string | null;
}

interface LabeledChain {
    /** pontos pixel */
    chain: Array<{ x: number; y: number }>;
    elevation: number;
    confidence: 'high' | 'medium' | 'low';
    /** rótulo original OCR */
    labelText: string;
    /** posição x do rótulo */
    labelX: number;
    /** posição y do rótulo */
    labelY: number;
    /** distância rótulo → cadeia */
    distancePx: number;
}

interface LabelingResult {
    /** cadeias com elevação atribuída */
    labeled: LabeledChain[];
    /** cadeias sem rótulo */
    unlabeled: Array<{ chain: Array<{ x: number; y: number }> }>;
    /** rótulos sem cadeia no raio de busca */
    orphanLabels: ClassifiedLabel[];
    stats: { total: number; labeled: number; unlabeled: number; orphans: number };
}

/**
 * Classifica rótulos OCR e associa cada um à cadeia de contorno mais próxima.
 *
 * @param ocrLabels - rótulos extraídos por OCR com posição pixel
 * @param chains - cadeias de pixel (output contourExtractor)
 */
type MatchOptions = {
    maxSearchRadiusPx?: number;
    classifyOpts?: Record<string, any>;
    allowMultiplePerChain?: boolean;
};

type MatchCandidate = {
    label: ClassifiedLabel;
    dist: number;
};

function _resolveMaxSearchRadius(opts: MatchOptions): number {
    return Number(opts.maxSearchRadiusPx) > 0 ? Number(opts.maxSearchRadiusPx) : DEFAULT_SEARCH_RADIUS_PX;
}

function _normalizeMatchArrays(
    ocrLabels: OcrLabel[],
    chains: Array<Array<{ x: number; y: number }>>,
): { labelsArray: OcrLabel[]; chainsArray: Array<Array<{ x: number; y: number }>> } {
    return {
        labelsArray: Array.isArray(ocrLabels) ? ocrLabels : [],
        chainsArray: Array.isArray(chains) ? chains : [],
    };
}

function _classifyOcrLabel(lbl: OcrLabel, classifyOpts: Record<string, any>): ClassifiedLabel {
    if (!lbl || typeof lbl.text !== 'string') {
        return {
            text: '',
            x: 0,
            y: 0,
            isElevation: false,
            value: null,
            confidence: 'none',
            reason: 'invalid input',
            prefix: null,
            unit: null,
        };
    }
    const result = classifyElevationLabel(lbl.text, classifyOpts);
    return {
        text: lbl.text,
        x: Number(lbl.x) || 0,
        y: Number(lbl.y) || 0,
        ...result,
    };
}

function _buildEmptyLabelingResult(
    chainsArray: Array<Array<{ x: number; y: number }>>,
    elevationLabels: ClassifiedLabel[],
): LabelingResult {
    return {
        labeled: [],
        unlabeled: chainsArray.map((chain) => ({ chain })),
        orphanLabels: elevationLabels as any,
        stats: {
            total: chainsArray.length,
            labeled: 0,
            unlabeled: chainsArray.length,
            orphans: elevationLabels.length,
        },
    };
}

function _findCandidatesByChain(
    elevationLabels: ClassifiedLabel[],
    chainsArray: Array<Array<{ x: number; y: number }>>,
    maxR: number,
): Array<Array<MatchCandidate>> {
    const candidatesByChain: Array<Array<MatchCandidate>> = new Array(chainsArray.length).fill(null).map(() => []);

    for (const lbl of elevationLabels) {
        let bestChainIdx = -1;
        let bestDist = maxR + 1;

        for (let ci = 0; ci < chainsArray.length; ci++) {
            const dist = pointToChainMinDist(lbl.x, lbl.y, chainsArray[ci] as Array<{ x: number; y: number }>);
            if (dist <= maxR && dist < bestDist) {
                bestDist = dist;
                bestChainIdx = ci;
            }
        }

        if (bestChainIdx >= 0) {
            (candidatesByChain[bestChainIdx] as MatchCandidate[]).push({ label: lbl, dist: bestDist });
        }
    }

    return candidatesByChain;
}

function _compareCandidates(a: MatchCandidate, b: MatchCandidate): number {
    const rank = CONFIDENCE_RANK as Record<string, number>;
    const rankDiff = (rank[b.label.confidence] || 0) - (rank[a.label.confidence] || 0);
    if (rankDiff !== 0) return rankDiff;
    return a.dist - b.dist;
}

function _assignLabelsToChains(
    chainsArray: Array<Array<{ x: number; y: number }>>,
    candidatesByChain: Array<Array<MatchCandidate>>,
    elevationLabels: ClassifiedLabel[],
    allowMulti: boolean,
): { labeled: LabeledChain[]; assignedChainIdxs: Set<number>; usedLabelIdxs: Set<number> } {
    const assignedChainIdxs = new Set<number>();
    const labeled: LabeledChain[] = [];
    const usedLabelIdxs = new Set<number>();

    for (let ci = 0; ci < chainsArray.length; ci++) {
        const chain = chainsArray[ci];
        if (!chain) continue;
        const candidates = candidatesByChain[ci] as MatchCandidate[];
        if (!candidates || candidates.length === 0) continue;

        candidates.sort(_compareCandidates);

        const best = candidates[0];
        if (!best) continue;
        const lblIdx = elevationLabels.indexOf(best.label);

        if (!allowMulti && usedLabelIdxs.has(lblIdx)) {
            continue;
        }

        labeled.push({
            chain: chain,
            elevation: best.label.value as number,
            confidence: best.label.confidence as 'high' | 'low' | 'medium',
            labelText: best.label.text,
            labelX: best.label.x,
            labelY: best.label.y,
            distancePx: best.dist,
        });
        assignedChainIdxs.add(ci);
        usedLabelIdxs.add(lblIdx);
    }

    return { labeled, assignedChainIdxs, usedLabelIdxs };
}

/**
 * Classifica rótulos OCR e associa cada um à cadeia de contorno mais próxima.
 *
 * @param ocrLabels - rótulos extraídos por OCR com posição pixel
 * @param chains - cadeias de pixel (output contourExtractor)
 */
export function matchLabelsToContours(
    ocrLabels: OcrLabel[],
    chains: Array<Array<{ x: number; y: number }>>,
    opts: MatchOptions = {},
): LabelingResult {
    const maxR = _resolveMaxSearchRadius(opts);
    const classifyOpts = opts.classifyOpts || {};
    const allowMulti = opts.allowMultiplePerChain === true;

    const { labelsArray, chainsArray } = _normalizeMatchArrays(ocrLabels, chains);

    const classified = labelsArray.map((lbl) => _classifyOcrLabel(lbl, classifyOpts));
    const elevationLabels = classified.filter((l) => l.isElevation);

    if (chainsArray.length === 0 || elevationLabels.length === 0) {
        return _buildEmptyLabelingResult(chainsArray, elevationLabels);
    }

    const candidatesByChain = _findCandidatesByChain(elevationLabels, chainsArray, maxR);
    const { labeled, assignedChainIdxs, usedLabelIdxs } = _assignLabelsToChains(
        chainsArray,
        candidatesByChain,
        elevationLabels,
        allowMulti,
    );

    const unlabeled = chainsArray.filter((_, idx) => !assignedChainIdxs.has(idx)).map((chain) => ({ chain }));
    const orphanLabels = elevationLabels.filter((_, idx) => !usedLabelIdxs.has(idx));

    return {
        labeled,
        unlabeled,
        orphanLabels: orphanLabels as any,
        stats: {
            total: chainsArray.length,
            labeled: labeled.length,
            unlabeled: unlabeled.length,
            orphans: orphanLabels.length,
        },
    } as any;
}

/**
 * Pipeline completo: OCR labels + chains → cadeias com nível atribuído,
 * prontas para passar para `assignContourLevels` do contourGeoreferencer.
 *
 * Conveniência: transforma o resultado de `matchLabelsToContours` no formato
 * aceito por `assignContourLevels({levels})`.
 */
export function buildLabeledContourInput(
    ocrLabels: OcrLabel[],
    chains: Array<Array<{ x: number; y: number }>>,
    opts: object = {},
): { chainsWithLevels: Array<{ chain: any; level: number }>; stats: object; orphanLabels: ClassifiedLabel[] } {
    const result = matchLabelsToContours(ocrLabels, chains, opts);

    // Reconstrói lista na ordem original: labeled primeiro, depois unlabeled (level=0)
    const labeled = result.labeled.map((lc: any) => ({
        chain: lc.chain,
        level: lc.elevation,
        confidence: lc.confidence,
        labelText: lc.labelText,
    }));
    const unlabeled = result.unlabeled.map((uc: any) => ({
        chain: uc.chain,
        level: 0,
        confidence: 'none',
        labelText: null,
    }));

    return {
        chainsWithLevels: [...labeled, ...unlabeled] as any,
        stats: result.stats,
        orphanLabels: result.orphanLabels,
    };
}

/**
 * Batch helper: aceita array de strings (sem posição) e chains,
 * usando centroide de cada cadeia como posição proxy do rótulo.
 *
 * Útil quando OCR retorna apenas texto sem coordenada, e
 * existe correspondência 1:1 entre labels e chains (ex: mapas
 * onde cada isolinha está numerada na ordem de extração).
 */
export function assignLabelsByOrder(
    labelTexts: string[],
    chains: Array<Array<{ x: number; y: number }>>,
    classifyOpts: Record<string, any> = {},
): { chainsWithLevels: Array<{ chain: any; level: number }>; stats: object } {
    if (!Array.isArray(labelTexts) || !Array.isArray(chains)) {
        return { chainsWithLevels: [], stats: { total: 0, labeled: 0, unlabeled: 0 } };
    }

    const batch = classifyElevationBatch(labelTexts, classifyOpts);
    const chainsWithLevels = chains.map((chain: any, idx: number) => {
        const cls = batch.classifications[idx];
        if (cls && cls.isElevation) {
            return { chain, level: cls.value, confidence: cls.confidence, labelText: cls.original };
        }
        return { chain, level: 0, confidence: 'none', labelText: labelTexts[idx] || null };
    });

    const labeled = chainsWithLevels.filter((c: any) => c.confidence !== 'none').length;
    return {
        chainsWithLevels: chainsWithLevels as any,
        stats: {
            total: chains.length,
            labeled,
            unlabeled: chains.length - labeled,
        },
    };
}
