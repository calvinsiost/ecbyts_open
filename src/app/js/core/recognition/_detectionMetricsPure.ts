// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DETECTION METRICS PURE — IoU, Non-Maximum Suppression e métricas
   de detecção de objetos (precision / recall / F1 / Average Precision).

   Os detectores de objetos do projeto (objectDetector.ts YOLOS, mlDetector.ts)
   emitem caixas delimitadoras `bbox = {xmin, ymin, xmax, ymax}` com score de
   confiança, MAS não existia nenhuma métrica canônica para:
     1. medir SOBREPOSIÇÃO entre duas caixas (IoU);
     2. SUPRIMIR caixas redundantes da mesma instância (NMS);
     3. AVALIAR detecções contra um ground-truth (precision/recall/F1/AP).

   Este módulo fecha essa lacuna com a forma canônica usada nos benchmarks
   de detecção. Todas as funções são puras e determinísticas.

   --- 1. Intersection over Union (Jaccard de áreas) ---
       IoU = área(A ∩ B) / área(A ∪ B)
       área(A ∪ B) = área(A) + área(B) − área(A ∩ B)
   IoU ∈ [0,1]; 1 = caixas idênticas, 0 = sem sobreposição.

   --- 2. Non-Maximum Suppression (greedy) ---
   Ordena as caixas por score decrescente; mantém a de maior score e
   descarta as que têm IoU ≥ iouThreshold com ela; repete. É o pós-processamento
   padrão de detectores (R-CNN, YOLO, SSD) para remover detecções duplicadas.

   --- 3. Precision / Recall / F1 / Average Precision (PASCAL VOC) ---
   Casa predições (ordenadas por score) a ground-truths por IoU ≥ iouThreshold,
   one-to-one greedy: cada GT casa no máximo UMA predição (a de maior score).
       precision = TP / (TP + FP)
       recall    = TP / (TP + FN)   onde TP+FN = nº de GTs
       F1        = 2·P·R / (P + R)
   Average Precision = área sob a curva precision×recall. Implementado em DOIS
   modos: 'voc2007' (interpolação em 11 pontos de recall {0,0.1,…,1}) e
   'voc2010' / 'all-points' (interpolação em TODOS os pontos, AUC monotônica).

   PUREZA: recebe arrays de objetos {xmin,ymin,xmax,ymax,score}; sem DOM,
   Three.js, modelo ML ou I/O. Mesma entrada → mesma saída.

   PROVENANCE / referência canônica:
     - IoU / Jaccard index: Jaccard, P. (1912) "The distribution of the flora
       in the alpine zone", New Phytologist 11(2):37–50.
     - Non-Maximum Suppression: Felzenszwalb et al. (2010) "Object Detection
       with Discriminatively Trained Part-Based Models", IEEE TPAMI 32(9);
       Neubeck & Van Gool (2006) "Efficient Non-Maximum Suppression", ICPR.
     - mAP / 11-point e all-point AP + protocolo de matching por IoU:
       Everingham, M. et al. (2010) "The PASCAL Visual Object Classes (VOC)
       Challenge", Int. J. Computer Vision 88(2):303–338, §4.2 (DOI
       10.1007/s11263-009-0275-4). O critério IoU > 0.5 vem de §4.2.
     - Precision/Recall/F1: van Rijsbergen, C.J. (1979) "Information Retrieval",
       2nd ed., cap. 7 (ISBN 0-408-70929-4).
   ================================================================ */

/** Caixa delimitadora axis-aligned. Mesmo layout emitido por objectDetector.ts. */
export interface BBox {
    readonly xmin: number;
    readonly ymin: number;
    readonly xmax: number;
    readonly ymax: number;
}

/** Caixa com score de confiança (para NMS e AP). */
export interface ScoredBBox extends BBox {
    /** Confiança da detecção (0..1). */
    readonly score: number;
}

/** Área de uma caixa; 0 se degenerada (xmax ≤ xmin ou ymax ≤ ymin) ou inválida. */
export function boxArea(box: BBox | null | undefined): number {
    if (!box) return 0;
    const w = Number(box.xmax) - Number(box.xmin);
    const h = Number(box.ymax) - Number(box.ymin);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
    return w * h;
}

/**
 * Intersection over Union (Jaccard de áreas) entre duas caixas.
 *
 * Forma fechada de validação: caixas idênticas → 1; disjuntas → 0;
 * [0,0,2,2] vs [1,1,3,3] → ∩=1, ∪=7 → IoU = 1/7.
 *
 * @returns IoU ∈ [0,1]; 0 se qualquer caixa for inválida/degenerada.
 */
export function iou(a: BBox | null | undefined, b: BBox | null | undefined): number {
    const areaA = boxArea(a);
    const areaB = boxArea(b);
    if (areaA === 0 || areaB === 0) return 0;

    const ix0 = Math.max(a!.xmin, b!.xmin);
    const iy0 = Math.max(a!.ymin, b!.ymin);
    const ix1 = Math.min(a!.xmax, b!.xmax);
    const iy1 = Math.min(a!.ymax, b!.ymax);

    const iw = ix1 - ix0;
    const ih = iy1 - iy0;
    if (iw <= 0 || ih <= 0) return 0;

    const inter = iw * ih;
    const union = areaA + areaB - inter;
    return union > 0 ? inter / union : 0;
}

/**
 * Non-Maximum Suppression greedy. Mantém as caixas de maior score, descartando
 * as que têm IoU ≥ iouThreshold com uma já mantida.
 *
 * @param boxes        detecções com score
 * @param iouThreshold limiar de supressão (default 0.5)
 * @returns ÍNDICES (no array original) das caixas mantidas, em ordem de score
 *          decrescente. Não muta a entrada.
 */
export function nonMaxSuppression(
    boxes: ReadonlyArray<ScoredBBox> | null | undefined,
    iouThreshold: number = 0.5,
): number[] {
    const n = boxes?.length ?? 0;
    if (!boxes || n === 0) return [];

    const thr = Number.isFinite(iouThreshold) ? iouThreshold : 0.5;

    // Índices ordenados por score decrescente (estável por índice em empate).
    const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => {
        const si = Number(boxes[i]?.score) || 0;
        const sj = Number(boxes[j]?.score) || 0;
        if (sj !== si) return sj - si;
        return i - j;
    });

    const kept: number[] = [];
    const suppressed = new Uint8Array(n);

    for (const idx of order) {
        if (suppressed[idx]) continue;
        if (boxArea(boxes[idx]) === 0) continue; // ignora caixas degeneradas
        kept.push(idx);
        for (const other of order) {
            if (other === idx || suppressed[other]) continue;
            if (iou(boxes[idx], boxes[other]) >= thr) suppressed[other] = 1;
        }
    }
    return kept;
}

/** Resultado de avaliação de detecções contra ground-truth. */
export interface DetectionEval {
    /** Verdadeiros positivos (predições casadas a um GT). */
    readonly truePositives: number;
    /** Falsos positivos (predições sem GT correspondente). */
    readonly falsePositives: number;
    /** Falsos negativos (GTs não detectados). */
    readonly falseNegatives: number;
    /** TP / (TP + FP); 0 se não há predições. */
    readonly precision: number;
    /** TP / (TP + FN); 0 se não há ground-truths. */
    readonly recall: number;
    /** 2·P·R / (P + R); 0 se P+R = 0. */
    readonly f1: number;
}

/**
 * Casa predições a ground-truths por IoU (one-to-one greedy por score) e calcula
 * precision/recall/F1. Cada GT casa no máximo UMA predição (a de maior score que
 * o atinge), conforme protocolo PASCAL VOC §4.2.
 *
 * Forma fechada: 1 GT, 1 predição com IoU=1 → TP=1, P=R=F1=1.
 * 2 predições para 1 GT (ambas IoU≥thr) → a segunda vira FP (P=0.5, R=1).
 *
 * @param predictions  detecções com score
 * @param groundTruth  caixas verdadeiras (score ignorado)
 * @param iouThreshold IoU mínimo para contar match (default 0.5)
 */
export function evaluateDetections(
    predictions: ReadonlyArray<ScoredBBox> | null | undefined,
    groundTruth: ReadonlyArray<BBox> | null | undefined,
    iouThreshold: number = 0.5,
): DetectionEval {
    const preds = predictions ?? [];
    const gts = groundTruth ?? [];
    const thr = Number.isFinite(iouThreshold) ? iouThreshold : 0.5;
    const numGT = gts.length;

    // Predições por score decrescente.
    const order = Array.from({ length: preds.length }, (_, i) => i).sort((i, j) => {
        const si = Number(preds[i]?.score) || 0;
        const sj = Number(preds[j]?.score) || 0;
        if (sj !== si) return sj - si;
        return i - j;
    });

    const gtMatched = new Uint8Array(numGT);
    let tp = 0;
    let fp = 0;

    for (const pi of order) {
        const pred = preds[pi];
        if (!pred) continue;
        let bestIoU = 0;
        let bestGT = -1;
        for (let gi = 0; gi < numGT; gi++) {
            if (gtMatched[gi]) continue;
            const gt = gts[gi];
            if (!gt) continue;
            const v = iou(pred, gt);
            if (v > bestIoU) {
                bestIoU = v;
                bestGT = gi;
            }
        }
        if (bestGT >= 0 && bestIoU >= thr) {
            gtMatched[bestGT] = 1;
            tp++;
        } else {
            fp++;
        }
    }

    const fn = numGT - tp;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = numGT > 0 ? tp / numGT : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return Object.freeze({
        truePositives: tp,
        falsePositives: fp,
        falseNegatives: fn,
        precision,
        recall,
        f1,
    });
}

/** Modo de cálculo da Average Precision. */
export type APMode = 'voc2007' | 'voc2010' | 'all-points';

/**
 * Average Precision (área sob a curva precision×recall), protocolo PASCAL VOC.
 *
 * Constrói a curva acumulando TP/FP sobre as predições ordenadas por score, e
 * integra a envoltória precision máxima (monotone decreasing) sobre recall:
 *   - 'voc2007': média da precisão interpolada em 11 níveis {0, 0.1, …, 1.0}.
 *   - 'voc2010'/'all-points' (default): soma exata sobre todos os pontos de
 *     mudança de recall — AP = Σ (r_k − r_{k−1}) · p_interp(r_k).
 *
 * Forma fechada de validação:
 *   - Detector perfeito (todos GTs casados, sem FP) → AP = 1 em ambos modos.
 *   - 1 GT, 1 predição com IoU=1 → AP = 1.
 *
 * @returns AP ∈ [0,1]; 0 se não há ground-truths.
 */
export function averagePrecision(
    predictions: ReadonlyArray<ScoredBBox> | null | undefined,
    groundTruth: ReadonlyArray<BBox> | null | undefined,
    iouThreshold: number = 0.5,
    mode: APMode = 'voc2010',
): number {
    const preds = predictions ?? [];
    const gts = groundTruth ?? [];
    const numGT = gts.length;
    if (numGT === 0) return 0;
    if (preds.length === 0) return 0;

    const thr = Number.isFinite(iouThreshold) ? iouThreshold : 0.5;

    const order = Array.from({ length: preds.length }, (_, i) => i).sort((i, j) => {
        const si = Number(preds[i]?.score) || 0;
        const sj = Number(preds[j]?.score) || 0;
        if (sj !== si) return sj - si;
        return i - j;
    });

    const gtMatched = new Uint8Array(numGT);
    const recalls: number[] = [];
    const precisions: number[] = [];
    let tp = 0;
    let fp = 0;

    for (const pi of order) {
        let bestIoU = 0;
        let bestGT = -1;
        for (let gi = 0; gi < numGT; gi++) {
            if (gtMatched[gi]) continue;
            const v = iou(preds[pi], gts[gi]);
            if (v > bestIoU) {
                bestIoU = v;
                bestGT = gi;
            }
        }
        if (bestGT >= 0 && bestIoU >= thr) {
            gtMatched[bestGT] = 1;
            tp++;
        } else {
            fp++;
        }
        recalls.push(tp / numGT);
        precisions.push(tp / (tp + fp));
    }

    // Envoltória de precisão (monotone non-increasing da direita p/ esquerda).
    const precEnv = precisions.slice();
    for (let i = precEnv.length - 2; i >= 0; i--) {
        precEnv[i] = Math.max(precEnv[i] ?? 0, precEnv[i + 1] ?? 0);
    }

    if (mode === 'voc2007') {
        // Interpolação em 11 pontos {0, 0.1, ..., 1.0}.
        let sum = 0;
        for (let t = 0; t <= 10; t++) {
            const rTarget = t / 10;
            let p = 0;
            for (let i = 0; i < recalls.length; i++) {
                const recall = recalls[i] ?? 0;
                const precision = precEnv[i] ?? 0;
                if (recall >= rTarget && precision > p) p = precision;
            }
            sum += p;
        }
        return sum / 11;
    }

    // 'voc2010' / 'all-points': AP = Σ (Δrecall) · precEnv.
    let ap = 0;
    let prevR = 0;
    for (let i = 0; i < recalls.length; i++) {
        const recall = recalls[i] ?? prevR;
        const precision = precEnv[i] ?? 0;
        const dR = recall - prevR;
        if (dR > 0) ap += dR * precision;
        prevR = recall;
    }
    return ap;
}
