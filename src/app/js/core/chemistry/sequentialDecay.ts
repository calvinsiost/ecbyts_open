// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SEQUENTIAL DECAY — First-order decay chains (reductive dechlorination)
   Decaimento sequencial de primeira ordem em cadeias pai-filha

   Implementa:
   - Solução analítica de Bateman para cadeias lineares C1→C2→…→Cn
   - Cadeias pré-definidas PCE→TCE→cis-DCE→VC→eteno (desalogenação redutiva)
   - Modelo BIOCHLOR 1D simplificado (advecção + dispersão + decaimento)
   - Balanço de aceptores de elétrons (Chapelle et al. 2002)
   - Ajuste de taxas de decaimento por série temporal (grid search)

   Este módulo é puro: sem DOM, sem IDB, sem Three.js.

   Referencias academicas:
   - Bateman, H. (1910). The solution of a system of differential equations
     occurring in the theory of radioactive transformations.
     Proc. Cambridge Phil. Soc. 15:423-427.
   - Clement, T.P. (1997). A modular computer code for simulating reactive
     multispecies transport in 3-dimensional groundwater systems.
     PNNL-11720. Pacific Northwest National Laboratory.
   - Aziz, C.E., Newell, C.J., Gonzales, J.R., et al. (1999).
     BIOCHLOR — Natural attenuation decision support system.
     USEPA EPA/600/R-00/009.
   - Chapelle, F.H., Bradley, P.M., et al. (2002). Hypoxic terminal
     electron-accepting processes.
     Environ. Sci. Technol. 36:750-757.
     DOI: 10.1021/es0109415
   - Abramowitz, M. & Stegun, I.A. (1964). Handbook of Mathematical Functions.
     National Bureau of Standards. (erfc series 7.1.26)
   ================================================================ */

// ----------------------------------------------------------------
// Constantes e utilidades internas
// ----------------------------------------------------------------

/** Tolerância para considerar duas taxas como iguais (caso degenerado L'Hôpital) */
const K_EQUALITY_TOL = 1e-12;

/** Perturbação aplicada no caso degenerado para evitar divisão por zero */
const K_DEGENERATE_EPS = 1e-9;

/** Pesos moleculares (g/mol) para compostos organoclorados relevantes */
const MW: Readonly<Record<string, number>> = Object.freeze({
    PCE: 165.83, // tetracloroeteno
    TCE: 131.39, // tricloroeteno
    DCE: 96.94, // dicloroeteno (cis ou trans)
    VC: 62.5, // cloreto de vinila
    ethene: 28.05, // etileno
});

/**
 * Complemento da função erro (erfc) via série racional de Abramowitz & Stegun 7.1.26.
 *
 * @param {number} x - argumento
 * @returns {number} erfc(x)
 */
function erfc(x: number): number {
    // Para x negativo, usar simetria: erfc(-x) = 2 - erfc(x)
    if (x < 0) return 2 - erfc(-x);

    // Coeficientes de Horner da série A&S 7.1.26
    const t = 1.0 / (1.0 + 0.3275911 * x);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-x * x);
}

/**
 * Calcula exp(x) de forma segura, retornando 0 para x << 0 e 1 para x=0.
 *
 * @param {number} x - expoente
 * @returns {number}
 */
function safeExp(x: number): number {
    if (x < -700) return 0;
    return Math.exp(x);
}

// ----------------------------------------------------------------
// DECHLORINATION_CHAINS - Cadeias pré-definidas com k1 da literatura
// Fonte: Aziz et al. (1999) BIOCHLOR Table 2 - cenário anaeróbio típico
// ----------------------------------------------------------------

/**
 * Cadeias de desalogenação redutiva pré-definidas com constantes de taxa
 * de primeira ordem k (1/day) derivadas de Aziz et al. (1999) BIOCHLOR.
 *
 * @type {Readonly<Object>}
 */
export const DECHLORINATION_CHAINS: Readonly<Record<string, ReadonlyArray<{ name: string; k: number }>>> = Object.freeze(
    {
        /**
         * Cadeia completa PCE→TCE→cis-DCE→VC→eteno.
         * A cis-DCE é o gargalo típico da desalogenação redutiva (t½≈630d).
         */
        PCE_chain: Object.freeze([
            Object.freeze({ name: 'PCE', k: 0.0045 }), // t½≈154d
            Object.freeze({ name: 'TCE', k: 0.0092 }), // t½≈75d
            Object.freeze({ name: 'cis-DCE', k: 0.0011 }), // t½≈630d (gargalo)
            Object.freeze({ name: 'VC', k: 0.00069 }), // t½≈1000d
            Object.freeze({ name: 'ethene', k: 0.001 }),
        ]),
        /**
         * Cadeia TCE→cis-DCE→VC→eteno (sem PCE como precursor).
         */
        TCE_chain: Object.freeze([
            Object.freeze({ name: 'TCE', k: 0.0092 }),
            Object.freeze({ name: 'cis-DCE', k: 0.0011 }),
            Object.freeze({ name: 'VC', k: 0.00069 }),
            Object.freeze({ name: 'ethene', k: 0.001 }),
        ]),
        /**
         * Cadeia benzeno - sem produtos principais de desalogenação.
         */
        benzene_chain: Object.freeze([Object.freeze({ name: 'benzene', k: 0.005 })]),
    },
);

// ----------------------------------------------------------------
// solveBatemanChain - Solução analítica de Bateman para cadeias lineares
// ----------------------------------------------------------------

export interface ChainSpecies {
    /** Nome da espécie */
    name: string;
    /** Constante de decaimento de primeira ordem (1/day) */
    k: number;
    /** Concentração inicial (qualquer unidade, ex: μg/L) */
    C0?: number;
}

export interface BatemanResult {
    /** Array de tempos (dias) */
    t: number[];
    /** Concentrações por espécie: { nome: number[] } */
    species: Record<string, number[]>;
    /** Massa total a cada instante de tempo */
    totalMass: number[];
    /** Identificador do método */
    method: string;
}

/**
 * Resolve analiticamente a cadeia de decaimento linear C1→C2→…→Cn
 * usando as equações de Bateman (1910).
 *
 * @param {ChainSpecies[]} chain - Espécies na cadeia, ordenadas de precursor a produto
 * @param {number|number[]} t    - Tempo(s) de avaliação em dias
 * @returns {Readonly<BatemanResult>}
 */
export function solveBatemanChain(chain: ChainSpecies[], t: number | number[]): Readonly<BatemanResult> {
    if (!Array.isArray(chain) || chain.length === 0) {
        throw new RangeError('solveBatemanChain: chain deve ser array não-vazio');
    }

    // Normalizar t para array
    const tArr = Array.isArray(t) ? t : [t];
    const n = chain.length;

    // Extrair k e C0 com perturbação para casos degenerados entre pares
    const ks = chain.map((s) => {
        if (typeof s.k !== 'number' || s.k < 0) {
            throw new RangeError(`solveBatemanChain: k inválido para '${s.name}': ${s.k}`);
        }
        return s.k;
    });
    const C0s = chain.map((s) => (typeof s.C0 === 'number' ? s.C0 : 0));

    // Verificar e resolver colisões de k aplicando ε incremental
    const ksWork = ks.slice();
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (Math.abs((ksWork[i] ?? 0) - (ksWork[j] ?? 0)) < K_EQUALITY_TOL) {
                ksWork[j] = (ksWork[j] ?? 0) + K_DEGENERATE_EPS * (j + 1);
            }
        }
    }

    /**
     * Calcula os coeficientes Bateman para a espécie de índice `idx`.
     *
     * @param {number} idx - Índice da espécie alvo (0-based)
     * @returns {number[]} Coeficientes A[j]
     */
    function batemanCoeffs(idx: number): number[] {
        // Vetor de coeficientes A[j] para j=0..idx
        const A: number[] = new Array(idx + 1).fill(0);

        // Contribuição da concentração inicial da própria espécie
        A[idx] = (A[idx] ?? 0) + (C0s[idx] ?? 0);

        if (idx === 0) {
            // Primeiro precursor: solução trivial
            return A;
        }

        // Coeficientes de contribuição da fonte primária (C0s[0])
        for (let src = 0; src < idx; src++) {
            // Coeficiente da fonte src para espécie idx
            let coeff = C0s[src] ?? 0;

            // Numerador: produto das taxas k_{src}…k_{idx-1}
            for (let m = src; m < idx; m++) {
                coeff *= ksWork[m] ?? 0;
            }

            // Denominador para cada j: Π_{m=src,m≠j}^{idx}(ksWork[m] - ksWork[j])
            for (let j = src; j <= idx; j++) {
                let denom = 1.0;
                for (let m = src; m <= idx; m++) {
                    if (m !== j) {
                        denom *= (ksWork[m] ?? 0) - (ksWork[j] ?? 0);
                    }
                }
                // Coeficiente parcial para exp(-k_j × t)
                A[j] = (A[j] ?? 0) + coeff / denom;
            }
        }

        return A;
    }

    // Calcular concentrações para cada espécie e tempo
    const speciesArrays: Record<string, number[]> = {};
    for (let i = 0; i < n; i++) {
        const sp = chain[i];
        if (sp) speciesArrays[sp.name] = new Array(tArr.length).fill(0);
    }

    for (let ti = 0; ti < tArr.length; ti++) {
        const tVal = tArr[ti] ?? 0;

        for (let i = 0; i < n; i++) {
            const sp = chain[i];
            if (!sp) continue;
            const A = batemanCoeffs(i);
            let Ci = 0;
            for (let j = 0; j <= i; j++) {
                Ci += (A[j] ?? 0) * safeExp(-(ksWork[j] ?? 0) * tVal);
            }
            // Garantir não-negatividade
            const arr = speciesArrays[sp.name];
            if (arr) arr[ti] = Math.max(0, Ci);
        }
    }

    // Calcular massa total por instante de tempo (soma sobre todas as espécies)
    const totalMass = tArr.map((_, ti) =>
        chain.reduce((sum, sp) => sum + (speciesArrays[sp.name]?.[ti] ?? 0), 0),
    );

    return Object.freeze({
        t: Object.freeze(tArr.slice()) as unknown as number[],
        species: Object.freeze(
            Object.fromEntries(Object.entries(speciesArrays).map(([k, v]) => [k, Object.freeze(v)])),
        ) as unknown as Record<string, number[]>,
        totalMass: Object.freeze(totalMass) as unknown as number[],
        method: 'bateman-analytical',
    });
}

// ----------------------------------------------------------------
// simulateBiochlor1D - Modelo BIOCHLOR 1D simplificado
// ----------------------------------------------------------------

export interface BiochlorParams {
    /** Espécies na cadeia com concentrações na fonte */
    chain: Array<{ name: string; k: number; C0_source: number }>;
    /** Velocidade de poro (m/day) */
    vs: number;
    /** Dispersividade hidráulica (m²/day) */
    D: number;
    /** Distâncias de observação a partir da fonte (m) */
    xObs: number[];
    /** Tempo de simulação (days) */
    tEnd: number;
    /** Número de passos de tempo */
    nSteps?: number;
}

export interface BiochlorResult {
    /** Array de tempos (days) */
    t: number[];
    /** { `x${dist}`: { nome_espécie: number[] } } */
    concentrations: Record<string, Record<string, number[]>>;
    /** Identificador do método */
    method: string;
}

/**
 * Simula o transporte 1D com decaimento sequencial (BIOCHLOR simplificado).
 *
 * @param {BiochlorParams} params
 * @returns {Readonly<BiochlorResult>}
 */
export function simulateBiochlor1D(params: BiochlorParams): Readonly<BiochlorResult> {
    const { chain, vs, D, xObs, tEnd, nSteps = 100 } = params;

    if (!Array.isArray(chain) || chain.length === 0) {
        throw new RangeError('simulateBiochlor1D: chain deve ser array não-vazio');
    }
    if (typeof vs !== 'number' || vs <= 0) {
        throw new RangeError('simulateBiochlor1D: vs deve ser positivo');
    }
    if (typeof D !== 'number' || D <= 0) {
        throw new RangeError('simulateBiochlor1D: D deve ser positivo');
    }
    if (!Array.isArray(xObs) || xObs.length === 0) {
        throw new RangeError('simulateBiochlor1D: xObs deve ser array não-vazio');
    }

    // Construir array de tempos uniformemente espaçados
    const dt = tEnd / nSteps;
    const tArr = Array.from({ length: nSteps + 1 }, (_, i) => i * dt);

    // Para cada espécie, usar concentração na fonte como condição de contorno
    const chainForBateman: ChainSpecies[] = chain.map((sp) => ({
        name: sp.name,
        k: sp.k,
        C0: sp.C0_source,
    }));

    // Pré-calcular as concentrações na fonte ao longo do tempo via Bateman
    const sourceResult = solveBatemanChain(chainForBateman, tArr);

    /**
     * Concentração numa posição x e tempo t via Ogata-Banks com decaimento.
     *
     * @param {number} Csource - Concentração efetiva na fonte no instante t
     * @param {number} k       - Constante de decaimento (1/day)
     * @param {number} x       - Distância da fonte (m)
     * @param {number} tVal    - Tempo (days)
     * @returns {number}
     */
    function ogatabanks(Csource: number, k: number, x: number, tVal: number): number {
        if (tVal <= 0 || x <= 0) return Csource;

        const sqrtDt = Math.sqrt(D * tVal);
        const arg1 = (x - vs * tVal) / (2 * sqrtDt);
        const arg2 = (x + vs * tVal) / (2 * sqrtDt);

        // Fator de decaimento temporal
        const decayFactor = safeExp(-k * tVal);

        // Solução Ogata-Banks (1961)
        const term1 = 0.5 * erfc(arg1);

        // Segundo termo: reflexão
        let term2 = 0;
        const erfcArg2 = erfc(arg2);
        if (erfcArg2 > 0) {
            const exponent = (vs * x) / D;
            if (exponent > 700) {
                const logProd = exponent + Math.log(erfcArg2);
                term2 = logProd < -300 ? 0 : 0.5 * Math.exp(logProd);
            } else {
                term2 = 0.5 * safeExp(exponent) * erfcArg2;
            }
        }

        return Csource * (term1 + term2) * decayFactor;
    }

    // Construir resultado: { xDist: { species: [values...] } }
    const concentrations: Record<string, Record<string, number[]>> = {};

    for (const xVal of xObs) {
        const xKey = `x${xVal}`;
        const bucket: Record<string, number[]> = {};
        concentrations[xKey] = bucket;

        for (const sp of chain) {
            const vals: number[] = new Array(tArr.length);
            for (let ti = 0; ti < tArr.length; ti++) {
                const Cs = sourceResult.species[sp.name]?.[ti] ?? 0;
                vals[ti] = ogatabanks(Cs, sp.k, xVal, tArr[ti] ?? 0);
            }
            bucket[sp.name] = Object.freeze(vals) as unknown as number[];
        }
        concentrations[xKey] = Object.freeze(bucket) as unknown as Record<string, number[]>;
    }

    return Object.freeze({
        t: Object.freeze(tArr) as unknown as number[],
        concentrations: Object.freeze(concentrations) as unknown as Record<string, Record<string, number[]>>,
        method: 'biochlor-1d',
    });
}

// ----------------------------------------------------------------
// computeElectronAcceptorBalance - Balanço de aceptores de elétrons
// ----------------------------------------------------------------

export interface ElectronAcceptorParams {
    /** Concentrações consumidas por espécie (μg/L): { PCE, TCE, DCE, VC } */
    consumed_ug?: Record<string, number>;
}

export interface ElectronAcceptorResult {
    /** Equivalentes de H2 consumidos (mmol/L) */
    H2_consumed_mmol: number;
    /** Cloreto produzido (meq/L) */
    Cl_produced_meq: number;
    /** Equivalentes de redução totais */
    reducingEquivalents: number;
    /** Identificador do método */
    method: string;
}

/**
 * Calcula o balanço de aceptores de elétrons para a desalogenação redutiva
 * de compostos organoclorados (Chapelle et al. 2002).
 *
 * @param {ElectronAcceptorParams} params
 * @returns {Readonly<ElectronAcceptorResult>}
 */
export function computeElectronAcceptorBalance(
    params: ElectronAcceptorParams,
): Readonly<ElectronAcceptorResult> {
    const { consumed_ug = {} } = params;

    // Número de átomos de cloro por molécula (determina estequiometria)
    const clAtoms: Record<string, number> = { PCE: 4, TCE: 3, DCE: 2, VC: 1 };

    let H2_consumed_mmol = 0;
    let Cl_produced_meq = 0;
    let reducingEquivalents = 0;

    for (const [species, clCount] of Object.entries(clAtoms)) {
        const mass_ug = consumed_ug[species] ?? 0;
        if (mass_ug <= 0) continue;

        const mw = MW[species];
        if (!mw) continue;

        // Converter μg/L → mmol/L: (μg/L) / (g/mol × 1000) = mmol/L
        const conc_mmol = mass_ug / (mw * 1000);

        // Cada mol de composto consome clCount mol de H2
        H2_consumed_mmol += conc_mmol * clCount;

        // Cada mol de Cl removido gera 1 meq de Cl⁻ (1e⁻ por Cl)
        Cl_produced_meq += conc_mmol * clCount;

        // Equivalentes de redução: 2 e⁻ por Cl removido (cada H2 doa 2 e⁻)
        reducingEquivalents += conc_mmol * clCount * 2;
    }

    return Object.freeze({
        H2_consumed_mmol,
        Cl_produced_meq,
        reducingEquivalents,
        method: 'electron-balance',
    });
}

// ----------------------------------------------------------------
// fitDecayRatesFromTimeSeries - Ajuste de k por série temporal
// ----------------------------------------------------------------

export interface FitResult {
    /** Taxas ajustadas por espécie: { nome: k } */
    kFitted: Record<string, number>;
    /** RMSE por espécie: { nome: rmse } */
    rmse: Record<string, number | null>;
    /** Identificador do método */
    method: string;
}

/**
 * Ajusta as constantes de decaimento k de cada espécie de uma cadeia
 * minimizando o SSE entre a solução analítica de Bateman e os dados observados.
 *
 * @param {Array<{t: number, [species: string]: number}>} timeSeries - Observações
 * @param {string[]} chainSpec  - Nomes das espécies na ordem da cadeia
 * @param {Object}   [options]
 * @returns {Readonly<FitResult>}
 */
export function fitDecayRatesFromTimeSeries(
    timeSeries: Array<Record<string, number>>,
    chainSpec: string[],
    options: { kMin?: number; kMax?: number; nGrid?: number } = {},
): Readonly<FitResult> {
    if (!Array.isArray(timeSeries) || timeSeries.length === 0) {
        throw new RangeError('fitDecayRatesFromTimeSeries: timeSeries deve ser array não-vazio');
    }
    if (!Array.isArray(chainSpec) || chainSpec.length === 0) {
        throw new RangeError('fitDecayRatesFromTimeSeries: chainSpec deve ser array não-vazio');
    }

    const { kMin = 1e-5, kMax = 1.0, nGrid = 200 } = options;

    // Construir grade logarítmica de k candidatos
    const logKMin = Math.log10(kMin);
    const logKMax = Math.log10(kMax);
    const kGrid = Array.from({ length: nGrid }, (_, i) =>
        Math.pow(10, logKMin + ((logKMax - logKMin) * i) / (nGrid - 1)),
    );

    // Extrair tempos da série temporal
    const tObs = timeSeries.map((row) => row.t ?? 0);

    const kFitted: Record<string, number> = {};
    const rmse: Record<string, number | null> = {};

    // Grid search sequencial: ajustar k de cada espécie com os k anteriores fixos
    for (let idx = 0; idx < chainSpec.length; idx++) {
        const spName = chainSpec[idx];
        if (spName === undefined) continue;

        // Dados observados para esta espécie
        const yObs = timeSeries.map((row) => (typeof row[spName] === 'number' ? row[spName] : NaN));
        const validMask = yObs.map((v) => !isNaN(v));
        const hasData = validMask.some(Boolean);

        if (!hasData) {
            // Sem dados: usar valor padrão de literatura
            kFitted[spName] = 0.001;
            rmse[spName] = null;
            continue;
        }

        let bestK = kGrid[0] ?? 0.001;
        let bestSSE = Infinity;

        for (const kCandidate of kGrid) {
            // Montar cadeia com os k ajustados até agora + candidato atual
            const firstRow = timeSeries[0] ?? {};
            const chain: ChainSpecies[] = chainSpec.map((name, i) => ({
                name,
                k: i < idx ? (kFitted[name] ?? 0.001) : i === idx ? kCandidate : 0.001,
                C0: firstRow[name] ?? 0,
            }));

            let sse = 0;
            try {
                const result = solveBatemanChain(chain, tObs);
                const yPred = result.species[spName] ?? [];
                for (let ti = 0; ti < tObs.length; ti++) {
                    if (!validMask[ti]) continue;
                    const diff = (yObs[ti] ?? 0) - (yPred[ti] ?? 0);
                    sse += diff * diff;
                }
            } catch {
                // Erro numérico: pular este candidato
                continue;
            }

            if (sse < bestSSE) {
                bestSSE = sse;
                bestK = kCandidate;
            }
        }

        kFitted[spName] = bestK;
        rmse[spName] = Math.sqrt(
            bestSSE / Math.max(1, timeSeries.filter((_, ti) => validMask[ti]).length),
        );
    }

    return Object.freeze({
        kFitted: Object.freeze({ ...kFitted }) as unknown as Record<string, number>,
        rmse: Object.freeze({ ...rmse }) as unknown as Record<string, number | null>,
        method: 'sequential-fit',
    });
}
