// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Getis-Ord Gi* — análise local de pontos quentes/frios (hot-spot / cold-spot).
 *
 * Complementa o Moran's I / Geary's C globais (spatialAutocorrelation.ts) e o
 * Local Moran (LISA): enquanto o LISA detecta clusters E outliers via covariância
 * de desvios, o Gi* responde a pergunta operacional "ONDE estão as concentrações
 * de valores ALTOS (hot-spot) ou BAIXOS (cold-spot) estatisticamente
 * significativas?" — útil para priorizar áreas de contaminação em monitoramento
 * ambiental. O resultado de cada ponto é um z-score (normal padrão).
 *
 * Estatística (Ord & Getis 1995, versão Gi* que inclui a própria localização i):
 *
 *            Σⱼ wᵢⱼ xⱼ  −  X̄ · Σⱼ wᵢⱼ
 *   Gi*(i) = ─────────────────────────────────────────────────
 *            S · √[ ( n · Σⱼ wᵢⱼ²  −  (Σⱼ wᵢⱼ)² ) / (n − 1) ]
 *
 *   X̄ = (1/n) Σⱼ xⱼ          (média global)
 *   S  = √( (1/n) Σⱼ xⱼ²  −  X̄² )   (desvio padrão populacional global)
 *
 * As somas em j percorrem TODAS as n localizações, incluindo j = i (Gi* requer
 * wᵢᵢ ≠ 0; aqui assumimos auto-vizinhança = 1 quando o ponto não tem peso
 * próprio na matriz fornecida). z > +1.96 → hot-spot (95%); z < −1.96 → cold-spot.
 *
 * Referências acadêmicas:
 *   - Getis, A. & Ord, J.K. (1992) "The Analysis of Spatial Association by Use
 *     of Distance Statistics", Geographical Analysis, 24(3), pp. 189–206.
 *     DOI: 10.1111/j.1538-4632.1992.tb00261.x
 *   - Ord, J.K. & Getis, A. (1995) "Local Spatial Autocorrelation Statistics:
 *     Distributional Issues and an Application", Geographical Analysis, 27(4),
 *     pp. 286–306. DOI: 10.1111/j.1538-4632.1995.tb00912.x  (define o Gi*)
 *   - Abramowitz, M. & Stegun, I.A. (1964) Handbook of Mathematical Functions,
 *     §26.2.17 — aproximação polinomial para a CDF da normal padrão.
 */

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * CDF da normal padrão — Abramowitz & Stegun §26.2.17.
 * Erro máximo: |ε(x)| ≤ 7.5 × 10⁻⁸
 * @param {number} z
 * @returns {number} P(Z ≤ z)
 */
function normalCDF(z: number): number {
    const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const p = 1.0 - pdf * poly;
    return z >= 0 ? p : 1 - p;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Resultado por localização do Gi*. */
export interface GiStarPoint {
    /** Índice da localização (ordem do array de entrada). */
    readonly i: number;
    /** Estatística Gi* padronizada (z-score, normal padrão). */
    readonly z: number;
    /** p-valor bicaudal aproximado (A&S §26.2.17). */
    readonly pValueApprox: number;
    /**
     * Classificação a 95% de confiança (|z| > 1.96):
     *   'hot_spot'  — agrupamento de valores ALTOS (z > +1.96)
     *   'cold_spot' — agrupamento de valores BAIXOS (z < −1.96)
     *   'ns'        — não significativo
     */
    readonly classification: 'hot_spot' | 'cold_spot' | 'ns';
}

/**
 * Calcula a estatística local Gi* (Ord & Getis 1995) para cada localização.
 *
 * IMPORTANTE: o Gi* inclui a própria localização i nas somas (auto-vizinhança).
 * A diagonal (wᵢᵢ) é definida pelo modo, SOBRESCREVENDO o que vier na matriz:
 *   includeSelf = true  (default) → wᵢᵢ = 1 → estatística Gi* (Ord & Getis 1995)
 *   includeSelf = false           → wᵢᵢ = 0 → estatística Gi  (Getis & Ord 1992)
 * Assim o resultado independe de a matriz W ser diagonal-zero (estilo Moran/Geary,
 * como a de `buildSpatialWeightMatrix`) ou já trazer a auto-aresta. A entrada não
 * é mutada.
 *
 * @param {number[]} values - Valores observados (mesma ordem das linhas de W).
 * @param {number[][]} W    - Matriz de pesos espaciais, quadrada n×n.
 * @param {{includeSelf?: boolean}} [opts]
 * @returns {Readonly<{points: ReadonlyArray<GiStarPoint>, n: number, includeSelf: boolean}>}
 * @throws {RangeError} se values.length !== W.length ou n < 2
 */
export function computeGetisOrdGiStar(
    values: number[],
    W: number[][],
    opts: { includeSelf?: boolean } = {},
): Readonly<{ points: ReadonlyArray<GiStarPoint>; n: number; includeSelf: boolean }> {
    const n = values.length;
    if (n !== W.length) {
        throw new RangeError(`computeGetisOrdGiStar: values.length (${n}) must equal W.length (${W.length})`);
    }
    if (n < 2) {
        throw new RangeError(`computeGetisOrdGiStar: requires at least 2 locations, got ${n}`);
    }

    const includeSelf = opts.includeSelf !== false; // default true → Gi*

    // Estatísticas globais: X̄ e S (desvio padrão populacional).
    let sumX = 0;
    let sumX2 = 0;
    for (let j = 0; j < n; j++) {
        const xj = values[j] as number;
        sumX += xj;
        sumX2 += xj * xj;
    }
    const xBar = sumX / n;
    const variance = sumX2 / n - xBar * xBar;
    // Guarda numérica: variância negativa minúscula por erro de ponto flutuante.
    const S = Math.sqrt(Math.max(variance, 0));

    const points: GiStarPoint[] = new Array(n);

    for (let i = 0; i < n; i++) {
        const row = W[i] as number[];

        // Σⱼ wᵢⱼ xⱼ , Σⱼ wᵢⱼ , Σⱼ wᵢⱼ²  (j percorre todas as localizações)
        let sumWx = 0;
        let sumW = 0;
        let sumW2 = 0;
        for (let j = 0; j < n; j++) {
            let wij = row[j] as number;
            // Auto-vizinhança (diagonal) é definida pelo modo, sobrescrevendo o que
            // vier na matriz: Gi* (includeSelf) força wᵢᵢ = 1; Gi força wᵢᵢ = 0.
            // Isso torna o resultado independente de a matriz de pesos ser
            // diagonal-zero (estilo Moran/Geary) ou já trazer a auto-aresta.
            if (i === j) wij = includeSelf ? 1 : 0;
            sumWx += wij * (values[j] as number);
            sumW += wij;
            sumW2 += wij * wij;
        }

        let z: number;
        if (S === 0) {
            // Todos os valores iguais → estatística indefinida; tratar como ns.
            z = 0;
        } else {
            const numerator = sumWx - xBar * sumW;
            // denominador = S · √[ (n·Σw² − (Σw)²) / (n−1) ]
            const inner = (n * sumW2 - sumW * sumW) / (n - 1);
            const denom = S * Math.sqrt(Math.max(inner, 0));
            z = denom === 0 ? 0 : numerator / denom;
        }

        const pValueApprox = 2 * (1 - normalCDF(Math.abs(z)));

        let classification: GiStarPoint['classification'];
        if (z > 1.96) {
            classification = 'hot_spot';
        } else if (z < -1.96) {
            classification = 'cold_spot';
        } else {
            classification = 'ns';
        }

        points[i] = Object.freeze({ i, z, pValueApprox, classification });
    }

    return Object.freeze({ points: Object.freeze(points), n, includeSelf });
}

/**
 * Sumariza um resultado Gi* em contagens de hot/cold/ns e a localização de pico.
 *
 * @param {ReadonlyArray<GiStarPoint>} points - Saída de computeGetisOrdGiStar().points
 * @returns {Readonly<{hotCount:number, coldCount:number, nsCount:number, maxHot: GiStarPoint|null, maxCold: GiStarPoint|null}>}
 */
export function summarizeGiStar(
    points: ReadonlyArray<GiStarPoint>,
): Readonly<{ hotCount: number; coldCount: number; nsCount: number; maxHot: GiStarPoint | null; maxCold: GiStarPoint | null }> {
    let hotCount = 0;
    let coldCount = 0;
    let nsCount = 0;
    let maxHot: GiStarPoint | null = null;
    let maxCold: GiStarPoint | null = null;

    for (const p of points) {
        if (p.classification === 'hot_spot') hotCount++;
        else if (p.classification === 'cold_spot') coldCount++;
        else nsCount++;

        if (maxHot === null || p.z > maxHot.z) maxHot = p;
        if (maxCold === null || p.z < maxCold.z) maxCold = p;
    }

    return Object.freeze({ hotCount, coldCount, nsCount, maxHot, maxCold });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const getisOrdHotspotMeta = {
    name: 'getisOrdHotspot',
    description: 'Getis-Ord Gi* local hot-spot / cold-spot analysis',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
        references: [
            'Getis & Ord (1992) DOI:10.1111/j.1538-4632.1992.tb00261.x',
            'Ord & Getis (1995) DOI:10.1111/j.1538-4632.1995.tb00912.x',
        ],
    },
    inputSchema: {
        type: 'object',
        properties: {
            values: { type: 'array', items: { type: 'number' }, minItems: 2 },
            W: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Spatial weight matrix n×n' },
            includeSelf: { type: 'boolean', default: true, description: 'true → Gi* (inclui i); false → Gi' },
        },
        required: ['values', 'W'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            points: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        i: { type: 'number' },
                        z: { type: 'number' },
                        pValueApprox: { type: 'number' },
                        classification: { type: 'string', enum: ['hot_spot', 'cold_spot', 'ns'] },
                    },
                },
            },
            n: { type: 'number' },
            includeSelf: { type: 'boolean' },
        },
        required: ['points', 'n'],
    },
};
