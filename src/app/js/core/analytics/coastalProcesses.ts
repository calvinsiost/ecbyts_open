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
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Coastal Processes and Shoreline Assessment - Pure-logic scientific module
 *
 * Fornece funções para:
 *   - Recuo costeiro por elevação do nível do mar (Bruun 1962)
 *   - Transporte longitudinal de sedimentos (CERC, USACE SPM 1984)
 *   - Run-up de ondas e setup (Stockdon et al. 2006)
 *   - Prisma de maré e estabilidade de inlet (O'Brien 1969, Jarrett 1976)
 *   - Design de nutrição de praia (Dean 1991)
 *   - Surge de tempestade simplificado (USACE 1962)
 *   - Índice de Vulnerabilidade Costeira (Thieler-Hammar 1999)
 *   - Carbono azul em manguezais (Donato et al. 2011)
 *   - Reflexão de ondas em estruturas costeiras (Van der Meer 1993, EurOtop 2007)
 *   - Balanço sedimentar costeiro (Bowen-Inman 1966, USACE)
 *
 * Referências acadêmicas:
 *   - Bruun, P. (1962). Sea level rise as a cause of shore erosion. J. Waterways Harbors Div., 88(1).
 *   - USACE (1984). Shore Protection Manual. U.S. Army Corps of Engineers, 4th ed.
 *   - Stockdon, H.F. et al. (2006). Empirical parameterization of setup, swash, and runup.
 *     Coastal Engineering, 53(7), 573-588. DOI: 10.1016/j.coastaleng.2005.12.005
 *   - O'Brien, M.P. (1969). Equilibrium flow areas of inlets on sandy coasts. J. Waterways Harbors Div., 95(1).
 *   - Jarrett, J.T. (1976). Tidal prism - inlet area relationships. GITI Report 3, USACE.
 *   - Dean, R.G. (1991). Equilibrium beach profiles: characteristics and applications.
 *     J. Coastal Research, 7(1), 53-84.
 *   - Thieler, E.R. & Hammar-Klose, E.S. (1999). National Assessment of Coastal Vulnerability to
 *     Sea-Level Rise, USGS Open-File Report 99-593.
 *   - Donato, D.C. et al. (2011). Mangroves among the most carbon-rich forests in the tropics.
 *     Nature Geoscience, 4, 293-297. DOI: 10.1038/ngeo1123
 *   - Van der Meer, J.W. (1993). Conceptual design of rubble mound breakwaters. Proc. Short Course
 *     on Design and Reliability of Coastal Structures, Venice.
 *   - EurOtop (2007). Wave Overtopping of Sea Defences and Related Structures.
 *   - Bowen, A.J. & Inman, D.L. (1966). Budget of littoral sands in the vicinity of Point Arguello.
 *     USACE, Coastal Engineering Research Center, TM-19.
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

const g = 9.81; // m/s² — gravitational acceleration

// ─── 1. Bruun Rule Erosion ────────────────────────────────────────────────────

/**
 * Recuo costeiro pela regra de Bruun (1962) em resposta à elevação do nível do mar.
 * R = SLR × L* / (h* + B), onde L* é derivado da profundidade de fechamento e
 * declividade de perfil 1:50.
 *
 * @param {number} seaLevelRise_m - Elevação do nível do mar (m)
 * @param {number} closureDepth_m - Profundidade de fechamento h* (m, positivo)
 * @param {number} beachHeight_m - Altura da berma B acima do NMM (m)
 * @returns {{ retreat_m: number, erosionVolume_m3_per_m: number, sensitivityIndex: number }}
 * @reference Bruun, P. (1962). DOI: não disponível - publicação ASCE original.
 */
export function bruunRuleErosion(
    seaLevelRise_m: number,
    closureDepth_m: number,
    beachHeight_m: number,
): { retreat_m: number; erosionVolume_m3_per_m: number; sensitivityIndex: number } {
    if (seaLevelRise_m < 0) throw new RangeError('seaLevelRise_m must be >= 0');
    if (closureDepth_m <= 0) throw new RangeError('closureDepth_m must be > 0');
    if (beachHeight_m <= 0) throw new RangeError('beachHeight_m must be > 0');

    // L* = comprimento do perfil ativo - declividade 1:50 a partir da berma até h*
    const profileSlope = 1 / 50; // 1:50 slope
    const profileLength_m = (closureDepth_m + beachHeight_m) / profileSlope;

    const retreat_m = (seaLevelRise_m * profileLength_m) / (closureDepth_m + beachHeight_m);
    const erosionVolume_m3_per_m = seaLevelRise_m * profileLength_m;
    // Índice de sensibilidade = recuo por unidade de SLR (m/m)
    const sensitivityIndex = retreat_m / (seaLevelRise_m > 0 ? seaLevelRise_m : 1);

    return {
        retreat_m: Number(retreat_m.toFixed(4)),
        erosionVolume_m3_per_m: Number(erosionVolume_m3_per_m.toFixed(4)),
        sensitivityIndex: Number(sensitivityIndex.toFixed(4)),
    };
}

// ─── 2. CERC Longshore Sediment Transport ─────────────────────────────────────

/**
 * Taxa de transporte longitudinal de sedimentos pela fórmula CERC (USACE SPM 1984).
 * Q = 0.39 × Hb^2.5 × sin(2αb). Transformação para a zona de arrebentação via lei de Snell.
 *
 * @param {number} waveHeight_m - Altura significativa de onda em águas profundas H0 (m)
 * @param {number} wavePeriod_s - Período de pico da onda T (s)
 * @param {number} waveAngle_deg - Ângulo da onda em relação à costa em águas profundas (graus)
 * @returns {{ Q_m3_yr: number, Q_m3_s: number, transportDirection: string, energyFlux_W_m: number }}
 * @reference USACE (1984). Shore Protection Manual, 4th ed., Chapter 4. CERC formula.
 */
export function longshoreSedimentTransport(
    waveHeight_m: number,
    wavePeriod_s: number,
    waveAngle_deg: number,
): { Q_m3_yr: number; Q_m3_s: number; transportDirection: string; energyFlux_W_m: number } {
    if (waveHeight_m <= 0) throw new RangeError('waveHeight_m must be > 0');
    if (wavePeriod_s <= 0) throw new RangeError('wavePeriod_s must be > 0');

    const alpha0_rad = ((waveAngle_deg % 360) * Math.PI) / 180;

    // Comprimento de onda em águas profundas
    const L0 = (g * wavePeriod_s ** 2) / (2 * Math.PI);
    // Celeridade em águas profundas
    const C0 = L0 / wavePeriod_s;

    // Snell's law: sin(αb)/Cb = sin(α0)/C0; aproximação: Cb ≈ (g × db)^0.5 para águas rasas
    // Breaker depth: db = Hb/0.78; Hb ≈ (H0^2 × C0 × cos(α0) / (Cb × cos(αb)))^0.5
    // Simplified refraction: αb usando razão de refração conservativa
    const sinAlpha0 = Math.sin(alpha0_rad);
    // Shoaling coefficient conservativo para estimar αb (Snell sem iteração)
    // Relação linear: sin(αb)/Cb = sin(α0)/C0
    // Usamos declividade tipica 1:100 → db ≈ 1.28 m para H0=1m; Cb ≈ sqrt(g*db)
    // Iteração implícita simplificada: Hb ≈ 0.56 * H0 (coeficiente médio de shoaling)
    const shoalingCoeff = 0.56;
    const Hb = shoalingCoeff * waveHeight_m; // altura de arrebentação aproximada

    const db = Hb / 0.78;
    const Cb = Math.sqrt(g * db);
    const sinAlphaB = Math.min(1, (sinAlpha0 * Cb) / C0);
    const alphaB_rad = Math.asin(sinAlphaB);

    // CERC: Q (m³/s) = 0.39 × Hb^2.5 × sin(2αb)
    const sin2alphaB = Math.sin(2 * alphaB_rad);
    const Q_m3_s = 0.39 * Math.pow(Hb, 2.5) * sin2alphaB;
    const Q_m3_yr = Q_m3_s * 3600 * 24 * 365.25;

    // Fluxo de energia da onda: P = (1/8) × ρ × g × H² × Cg (águas profundas: Cg = C0/2)
    const rho_water = 1025; // kg/m³ (água do mar)
    const Cg0 = C0 / 2;
    const energyFlux_W_m = (1 / 8) * rho_water * g * waveHeight_m ** 2 * Cg0;

    // Direção: positivo = transporte para a direita olhando do mar para a costa
    const transportDirection = Q_m3_s >= 0 ? 'positive' : 'negative';

    return {
        Q_m3_yr: Number(Q_m3_yr.toFixed(2)),
        Q_m3_s: Number(Q_m3_s.toFixed(6)),
        transportDirection,
        energyFlux_W_m: Number(energyFlux_W_m.toFixed(2)),
    };
}

// ─── 3. Wave Run-up (Stockdon 2006) ───────────────────────────────────────────

/**
 * Run-up de ondas e setup (Stockdon et al. 2006).
 * R2% = 1.1 × (η̄ + Sσ/2). Iribarren ξ = tanβ / √(H0/L0).
 * Para dissipativo (ξ < 0.3): fórmula especial.
 *
 * @param {number} waveHeight_m - Altura significativa H0 (m)
 * @param {number} wavePeriod_s - Período de pico T (s)
 * @param {number} beachSlope - Declividade da praia tanβ (adimensional, ex: 0.05)
 * @returns {{ runup_2pct_m: number, setup_m: number, swash_m: number, iribarrenNumber: number }}
 * @reference Stockdon, H.F. et al. (2006). DOI: 10.1016/j.coastaleng.2005.12.005
 */
export function waveRunup(
    waveHeight_m: number,
    wavePeriod_s: number,
    beachSlope: number,
): { runup_2pct_m: number; setup_m: number; swash_m: number; iribarrenNumber: number } {
    if (waveHeight_m <= 0) throw new RangeError('waveHeight_m must be > 0');
    if (wavePeriod_s <= 0) throw new RangeError('wavePeriod_s must be > 0');
    if (beachSlope <= 0 || beachSlope > 1) throw new RangeError('beachSlope must be in (0, 1]');

    const H0 = waveHeight_m;
    const L0 = (g * wavePeriod_s ** 2) / (2 * Math.PI);

    // Número de Iribarren (parâmetro de similaridade de surf)
    const iribarrenNumber = beachSlope / Math.sqrt(H0 / L0);

    let runup_2pct_m, setup_m, swash_m;

    if (iribarrenNumber < 0.3) {
        // Condição dissipativa
        setup_m = 0;
        swash_m = 0.016 * Math.sqrt(H0 * L0);
        runup_2pct_m = 1.1 * swash_m;
    } else {
        // Intermediário / reflectivo - fórmula completa de Stockdon
        setup_m = 0.35 * beachSlope * Math.sqrt(H0 * L0);
        const incidentSwash = 0.75 * beachSlope * Math.sqrt(H0 * L0);
        const infraGravitySwash = 0.06 * Math.sqrt(H0 * L0);
        swash_m = Math.sqrt(incidentSwash ** 2 + infraGravitySwash ** 2);
        runup_2pct_m = 1.1 * (setup_m + swash_m / 2);
    }

    return {
        runup_2pct_m: Number(runup_2pct_m.toFixed(4)),
        setup_m: Number(setup_m.toFixed(4)),
        swash_m: Number(swash_m.toFixed(4)),
        iribarrenNumber: Number(iribarrenNumber.toFixed(4)),
    };
}

// ─── 4. Tidal Prism and Inlet Stability ───────────────────────────────────────

/**
 * Prisma de maré e estabilidade de inlet (O'Brien 1969, Jarrett 1976).
 * P = A × TR. Seção mínima: Ac = C × P^n (Jarrett 1976).
 *
 * @param {number} tidalRange_m - Amplitude de maré TR (m)
 * @param {number} inletArea_m2 - Área da lagoa/estuário A (m²)
 * @returns {{ tidalPrism_m3: number, minimumCrossSection_m2: number, stabilityRatio: number, inletClass: string }}
 * @reference O'Brien, M.P. (1969). ASCE J. Waterways Harbors Div., 95(1), 43-52.
 *            Jarrett, J.T. (1976). GITI Report 3, USACE.
 */
export function tidalPrism(
    tidalRange_m: number,
    inletArea_m2: number,
): { tidalPrism_m3: number; minimumCrossSection_m2: number; stabilityRatio: number; inletClass: string } {
    if (tidalRange_m <= 0) throw new RangeError('tidalRange_m must be > 0');
    if (inletArea_m2 <= 0) throw new RangeError('inletArea_m2 must be > 0');

    const tidalPrism_m3 = inletArea_m2 * tidalRange_m;

    // Coeficientes de Jarrett 1976 - usando coeficientes do Atlântico como referência geral
    const C = 9.99e-5;
    const n = 0.95;
    const minimumCrossSection_m2 = C * Math.pow(tidalPrism_m3, n);

    // Razão de estabilidade = P / Ac (m³/m²) - analogia ao parâmetro P/A de O'Brien
    const stabilityRatio = tidalPrism_m3 / minimumCrossSection_m2;

    // Classificação qualitativa de estabilidade
    let inletClass;
    if (stabilityRatio >= 150) {
        inletClass = 'stable';
    } else if (stabilityRatio >= 50) {
        inletClass = 'marginal';
    } else {
        inletClass = 'unstable';
    }

    return {
        tidalPrism_m3: Number(tidalPrism_m3.toFixed(2)),
        minimumCrossSection_m2: Number(minimumCrossSection_m2.toFixed(4)),
        stabilityRatio: Number(stabilityRatio.toFixed(2)),
        inletClass,
    };
}

// ─── 5. Beach Nourishment Design ──────────────────────────────────────────────

/**
 * Volume de nutrição de praia e overfill ratio (Dean 1991, USACE EM 1110-2-1616).
 * A = 0.067 × D50^0.44 (Dean). R* = (A_native/A_borrow)^3 se A_borrow < A_native, senão 1.0.
 *
 * @param {number} targetWidth_m - Largura alvo da praia (m)
 * @param {number} currentWidth_m - Largura atual da praia (m)
 * @param {number} deanParameter - Parâmetro Omega de Dean (adimensional, 1–6 typical)
 * @param {number} nativeD50_mm - D50 do sedimento nativo (mm)
 * @param {number} borrowD50_mm - D50 do sedimento de empréstimo (mm)
 * @returns {{ overfillRatio: number, volumeRequired_m3_per_m: number, nourishmentWidth_m: number, adjustedD50_mm: number }}
 * @reference Dean, R.G. (1991). J. Coastal Research, 7(1), 53-84.
 *            USACE EM 1110-2-1616 (1996). Shore Protection Manual.
 */
export function beachNourishmentDesign(
    targetWidth_m: number,
    currentWidth_m: number,
    deanParameter: number,
    nativeD50_mm: number,
    borrowD50_mm: number,
): { overfillRatio: number; volumeRequired_m3_per_m: number; nourishmentWidth_m: number; adjustedD50_mm: number } {
    if (targetWidth_m <= 0) throw new RangeError('targetWidth_m must be > 0');
    if (currentWidth_m < 0) throw new RangeError('currentWidth_m must be >= 0');
    if (nativeD50_mm <= 0) throw new RangeError('nativeD50_mm must be > 0');
    if (borrowD50_mm <= 0) throw new RangeError('borrowD50_mm must be > 0');

    // Parâmetro A de Dean: A = 0.067 × D50^0.44 (D50 em mm)
    const A_native = 0.067 * Math.pow(nativeD50_mm, 0.44);
    const A_borrow = 0.067 * Math.pow(borrowD50_mm, 0.44);

    // Overfill ratio R*
    const overfillRatio = A_borrow < A_native ? Math.pow(A_native / A_borrow, 3) : 1.0;

    const widthDeficit_m = Math.max(0, targetWidth_m - currentWidth_m);

    // Volume base por metro linear de praia - perfil parabólico de Dean
    // Volume por metro = widthDeficit × closure_depth / (1 + deanParameter * 0.1)
    // Closure depth estimada: hc ≈ 2.28*Hs - 68.5*(Hs²/g/T²)
    // Simplificado: volume base = déficit de largura × profundidade de fechamento típica
    const closureDepth_approx = deanParameter * 1.5; // aproximação empírica
    const volumeBase_m3_per_m = widthDeficit_m * closureDepth_approx;
    const volumeRequired_m3_per_m = volumeBase_m3_per_m * overfillRatio;

    // Largura real de nutrição considerando overfill
    const nourishmentWidth_m = widthDeficit_m * overfillRatio;

    // D50 ajustado do sedimento colocado (média ponderada)
    const adjustedD50_mm = borrowD50_mm;

    return {
        overfillRatio: Number(overfillRatio.toFixed(4)),
        volumeRequired_m3_per_m: Number(volumeRequired_m3_per_m.toFixed(2)),
        nourishmentWidth_m: Number(nourishmentWidth_m.toFixed(2)),
        adjustedD50_mm: Number(adjustedD50_mm.toFixed(3)),
    };
}

// ─── 6. Storm Surge (simplified) ──────────────────────────────────────────────

/**
 * Estimativa simplificada de surge de tempestade (USACE 1962 nomograph, Knauss 1997).
 * Setup: Δη = 0.0038 × U² × F / (g × d). Hs = 0.0248 × U^(5/3) × F^(1/3).
 *
 * @param {number} windSpeed_ms - Velocidade do vento U (m/s)
 * @param {number} fetch_km - Pista de vento F (km)
 * @param {number} shallowDepth_m - Profundidade média da plataforma (m)
 * @param {number} stormAngle_deg - Ângulo de incidência da tempestade (graus, 0=perpendicular)
 * @returns {{ surgeMeter: number, maxWave_m: number, waveSetup_m: number, totalFloodLevel_m: number }}
 * @reference USACE (1962). Meteorological Characteristics of the Design Storm for Coastal Projects.
 *            Knauss, J.A. (1997). Introduction to Physical Oceanography. Prentice Hall.
 */
export function stormSurgeSimple(
    windSpeed_ms: number,
    fetch_km: number,
    shallowDepth_m: number,
    stormAngle_deg: number,
): { surgeMeter: number; maxWave_m: number; waveSetup_m: number; totalFloodLevel_m: number } {
    if (windSpeed_ms <= 0) throw new RangeError('windSpeed_ms must be > 0');
    if (fetch_km <= 0) throw new RangeError('fetch_km must be > 0');
    if (shallowDepth_m <= 0) throw new RangeError('shallowDepth_m must be > 0');

    const F_m = fetch_km * 1000;
    const cosAngle = Math.cos(((stormAngle_deg || 0) * Math.PI) / 180);

    // Fator de pista efetiva ajustado pelo ângulo
    const F_eff = F_m * Math.max(0, cosAngle);

    // Setup meteorológico (Δη)
    const surgeMeter = F_eff > 0 ? (0.0038 * windSpeed_ms ** 2 * F_eff) / (g * shallowDepth_m) : 0;

    // Altura de onda significativa (fetch-limited, Sistema Sverdrup-Munk-Bretschneider simplificado)
    const maxWave_m = 0.0248 * Math.pow(windSpeed_ms, 5 / 3) * Math.pow(F_m / 1000, 1 / 3);

    // Wave setup: η̄ ≈ 0.19 × (1 - 2.82 × √(H²/gT²)) × H (simplificado)
    const waveSetup_m = 0.19 * maxWave_m * Math.max(0, cosAngle);

    const totalFloodLevel_m = surgeMeter + waveSetup_m;

    return {
        surgeMeter: Number(surgeMeter.toFixed(4)),
        maxWave_m: Number(maxWave_m.toFixed(4)),
        waveSetup_m: Number(waveSetup_m.toFixed(4)),
        totalFloodLevel_m: Number(totalFloodLevel_m.toFixed(4)),
    };
}

// ─── 7. Coastal Vulnerability Index ───────────────────────────────────────────

/**
 * Cálculo do Índice de Vulnerabilidade Costeira (CVI).
 * CVI = √((a×b×c×d×e×f)/6). Cada variável rankeada 1–5.
 *
 * @param {number} geomorphology - Rank geomorfológico (1–5: rocha > planície arenosa)
 * @param {number} coastalSlope - Rank declividade costeira (1=alta, 5=baixa)
 * @param {number} relativeSeaLevel - Rank elevação relativa do NMM (1=baixa, 5=alta)
 * @param {number} shorelineChange - Rank mudança histórica da linha de costa (1=acreção, 5=erosão)
 * @param {number} tidalRange - Rank amplitude de maré (1=macro, 5=micro)
 * @param {number} waveHeight - Rank altura média de onda (1=baixa, 5=alta)
 * @returns {{ cvi: number, riskLevel: string, dominantFactor: string, rankSummary: object }}
 * @reference Thieler, E.R. & Hammar-Klose, E.S. (1999). USGS Open-File Report 99-593.
 */
export function coastalVulnerabilityIndex(
    geomorphology: number,
    coastalSlope: number,
    relativeSeaLevel: number,
    shorelineChange: number,
    tidalRange: number,
    waveHeight: number,
): { cvi: number; riskLevel: string; dominantFactor: string; rankSummary: object } {
    const factors: Record<string, number> = {
        geomorphology,
        coastalSlope,
        relativeSeaLevel,
        shorelineChange,
        tidalRange,
        waveHeight,
    };
    const factorNames = Object.keys(factors);

    for (const [name, val] of Object.entries(factors)) {
        if (!Number.isFinite(val) || val < 1 || val > 5) {
            throw new RangeError(`Factor '${name}' must be between 1 and 5, got ${val}`);
        }
    }

    const product = factorNames.reduce((acc, k) => acc * (factors[k] ?? 1), 1);
    const cvi = Math.sqrt(product / 6);

    // Classificação de risco
    let riskLevel;
    if (cvi < 1.5) riskLevel = 'very_low';
    else if (cvi < 2.7) riskLevel = 'low';
    else if (cvi < 3.2) riskLevel = 'moderate';
    else if (cvi < 4.5) riskLevel = 'high';
    else riskLevel = 'very_high';

    // Fator dominante = maior rank
    const maxVal = Math.max(...factorNames.map((k) => factors[k] ?? 0));
    const dominantFactor = factorNames.find((k) => factors[k] === maxVal) || (factorNames[0] as string);

    const rankSummary = { ...factors, cvi: Number(cvi.toFixed(3)) };

    return {
        cvi: Number(cvi.toFixed(3)),
        riskLevel,
        dominantFactor,
        rankSummary,
    };
}

// ─── 8. Mangrove Blue Carbon ───────────────────────────────────────────────────

/**
 * Sequestro de carbono azul em manguezais (Donato et al. 2011, Murdiyarso 2015,
 * Komiyama et al. 2008).
 *
 * @param {number} area_ha - Área do manguezal (ha)
 * @param {'fringe'|'riverine'|'basin'} forestType - Tipo de floresta de manguezal
 * @param {number} ageYears - Idade da floresta (anos)
 * @returns {{ abovegroundBiomass_t_ha: number, belowgroundBiomass_t_ha: number,
 *             soilCarbon_t_ha: number, totalCarbon_t_ha: number,
 *             annualSequestration_tCO2_ha_yr: number }}
 * @reference Donato, D.C. et al. (2011). DOI: 10.1038/ngeo1123
 *            Murdiyarso, D. et al. (2015). DOI: 10.1038/nclimate2734
 *            Komiyama, A. et al. (2008). DOI: 10.1016/j.aquabot.2007.12.006
 */
export function mangroveBlueCarbon(
    area_ha: number,
    forestType: 'fringe' | 'riverine' | 'basin',
    ageYears: number,
): {
    abovegroundBiomass_t_ha: number;
    belowgroundBiomass_t_ha: number;
    soilCarbon_t_ha: number;
    totalCarbon_t_ha: number;
    annualSequestration_tCO2_ha_yr: number;
} {
    if (area_ha <= 0) throw new RangeError('area_ha must be > 0');
    if (ageYears < 0) throw new RangeError('ageYears must be >= 0');

    const validTypes = ['fringe', 'riverine', 'basin'];
    if (!validTypes.includes(forestType)) {
        throw new TypeError(`forestType must be one of: ${validTypes.join(', ')}`);
    }

    // Biomassa acima do solo - Komiyama et al. 2008 alométrico por tipo
    // Valores médios regionais (Mg C ha⁻¹) por tipo de floresta
    const agbBase: Record<'fringe' | 'riverine' | 'basin', number> = {
        fringe: 100,
        riverine: 140,
        basin: 70,
    }; // t C/ha maduro
    const bgbRatio = 0.49; // razão raiz:parte aérea (Komiyama 2008)

    // Fator de maturidade (logístico: 90% do máximo aos 30 anos)
    const maturityFactor = 1 - Math.exp(-ageYears / 20);

    const abovegroundBiomass_t_ha = agbBase[forestType] * maturityFactor;
    const belowgroundBiomass_t_ha = abovegroundBiomass_t_ha * bgbRatio;

    // Carbono no solo (Mg C ha⁻¹) - Donato et al. 2011
    const soilCarbonBase: Record<'fringe' | 'riverine' | 'basin', number> = {
        fringe: 1023,
        riverine: 698,
        basin: 492,
    };
    const soilCarbon_t_ha = soilCarbonBase[forestType];

    const totalCarbon_t_ha = abovegroundBiomass_t_ha + belowgroundBiomass_t_ha + soilCarbon_t_ha;

    // Sequestro anual (tCO2 ha⁻¹ yr⁻¹) - taxa típica Murdiyarso 2015
    const seqRates: Record<'fringe' | 'riverine' | 'basin', number> = {
        fringe: 8.4,
        riverine: 11.0,
        basin: 5.6,
    }; // tCO2 eq/ha/yr
    const annualSequestration_tCO2_ha_yr = seqRates[forestType] * maturityFactor;

    return {
        abovegroundBiomass_t_ha: Number(abovegroundBiomass_t_ha.toFixed(2)),
        belowgroundBiomass_t_ha: Number(belowgroundBiomass_t_ha.toFixed(2)),
        soilCarbon_t_ha: Number(soilCarbon_t_ha.toFixed(2)),
        totalCarbon_t_ha: Number(totalCarbon_t_ha.toFixed(2)),
        annualSequestration_tCO2_ha_yr: Number(annualSequestration_tCO2_ha_yr.toFixed(3)),
    };
}

// ─── 9. Seawall Reflection and Overtopping ────────────────────────────────────

/**
 * Reflexão de ondas e overtopping em estruturas costeiras (Van der Meer 1993, EurOtop 2007).
 * Kr = 0.071 × ξ^1.48. q = (g×H³)^0.5 × 0.067/tanα × exp(-4.75/ξ × Rc/H).
 *
 * @param {number} incidentWaveHeight_m - Altura significativa incidente Hs (m)
 * @param {number} structureSlope - Declividade da estrutura tanα (ex: 0.5 para 1:2)
 * @param {number} roughnessCoeff - Coeficiente de rugosidade γf (0–1; 1=liso, 0.5=enrocamento)
 * @returns {{ reflectionCoeff: number, overtoppingRate_l_s_m: number,
 *             iribarrenParam: number, waveRunup_m: number }}
 * @reference Van der Meer, J.W. (1993). Proc. Short Course on Design and Reliability.
 *            EurOtop (2007). Wave Overtopping Manual. ISBN: 978-3-8041-5090-6
 */
export function seawallReflection(
    incidentWaveHeight_m: number,
    structureSlope: number,
    roughnessCoeff: number,
): { reflectionCoeff: number; overtoppingRate_l_s_m: number; iribarrenParam: number; waveRunup_m: number } {
    if (incidentWaveHeight_m <= 0) throw new RangeError('incidentWaveHeight_m must be > 0');
    if (structureSlope <= 0 || structureSlope > 10) throw new RangeError('structureSlope must be in (0, 10]');
    if (roughnessCoeff <= 0 || roughnessCoeff > 1) throw new RangeError('roughnessCoeff must be in (0, 1]');

    const H = incidentWaveHeight_m;
    // Período de pico assumido T=10s para estruturas (padrão EurOtop)
    const T = 10;
    const L0 = (g * T ** 2) / (2 * Math.PI);

    // Parâmetro de Iribarren para a estrutura
    const iribarrenParam = structureSlope / Math.sqrt(H / L0);

    // Coeficiente de reflexão (Van der Meer 1993)
    const reflectionCoeff = Math.min(0.95, 0.071 * Math.pow(iribarrenParam, 1.48));

    // Run-up na estrutura (EurOtop 2007): Ru2% = 1.65 × γf × ξ × H para ξ ≤ ξc
    const xiCritical = 1.5 / (roughnessCoeff * 0.4);
    let waveRunup_m;
    if (iribarrenParam <= xiCritical) {
        waveRunup_m = 1.65 * roughnessCoeff * iribarrenParam * H;
    } else {
        waveRunup_m = roughnessCoeff * (4.0 - 1.5 / Math.sqrt(iribarrenParam)) * H;
    }
    waveRunup_m = Math.min(waveRunup_m, 3.0 * H); // limite máximo plausível

    // Overtopping médio (EurOtop): Rc = freeboard, assumido 0 para taxa máxima
    // q/(g×H³)^0.5 = 0.067/tanα × exp(-4.75/(ξ×γf))
    const qDim = Math.sqrt(g * H ** 3);
    const overtoppingNorm = (0.067 / structureSlope) * Math.exp(-4.75 / (iribarrenParam * roughnessCoeff));
    const overtoppingRate_m3_s_m = qDim * overtoppingNorm;
    const overtoppingRate_l_s_m = overtoppingRate_m3_s_m * 1000; // l/s/m

    return {
        reflectionCoeff: Number(reflectionCoeff.toFixed(4)),
        overtoppingRate_l_s_m: Number(overtoppingRate_l_s_m.toFixed(4)),
        iribarrenParam: Number(iribarrenParam.toFixed(4)),
        waveRunup_m: Number(waveRunup_m.toFixed(4)),
    };
}

// ─── 10. Sediment Budget ──────────────────────────────────────────────────────

/**
 * Balanço sedimentar costeiro (Bowen-Inman 1966, USACE).
 * netBudget = totalIn − totalOut. Taxa de erosão = déficit / (largura da zona ativa).
 *
 * @param {Partial<{rivers_m3_yr: number, cliff_m3_yr: number, aeolian_m3_yr: number,
 *          dredging_m3_yr: number, longshore_in_m3_yr: number, nourishment_m3_yr: number}>} inputs
 * @param {Partial<{longshore_out_m3_yr: number, offshore_m3_yr: number,
 *          dredging_m3_yr: number, aeolian_out_m3_yr: number}>} outputs
 * @returns {{ totalIn_m3_yr: number, totalOut_m3_yr: number, netBudget_m3_yr: number,
 *             budgetStatus: string, erosionRate_m_yr: number }}
 * @reference Bowen, A.J. & Inman, D.L. (1966). USACE CERC TM-19.
 *            USACE (1984). Shore Protection Manual, Ch. 4.
 */
export function sedimentBudget(
    inputs: Partial<{
        rivers_m3_yr: number;
        cliff_m3_yr: number;
        aeolian_m3_yr: number;
        dredging_m3_yr: number;
        longshore_in_m3_yr: number;
        nourishment_m3_yr: number;
    }> = {},
    outputs: Partial<{
        longshore_out_m3_yr: number;
        offshore_m3_yr: number;
        dredging_m3_yr: number;
        aeolian_out_m3_yr: number;
    }> = {},
): {
    totalIn_m3_yr: number;
    totalOut_m3_yr: number;
    netBudget_m3_yr: number;
    budgetStatus: string;
    erosionRate_m_yr: number;
} {
    const safeNum = (v: number | undefined) =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;

    const totalIn_m3_yr =
        safeNum(inputs.rivers_m3_yr) +
        safeNum(inputs.cliff_m3_yr) +
        safeNum(inputs.aeolian_m3_yr) +
        safeNum(inputs.dredging_m3_yr) +
        safeNum(inputs.longshore_in_m3_yr) +
        safeNum(inputs.nourishment_m3_yr);

    const totalOut_m3_yr =
        safeNum(outputs.longshore_out_m3_yr) +
        safeNum(outputs.offshore_m3_yr) +
        safeNum(outputs.dredging_m3_yr) +
        safeNum(outputs.aeolian_out_m3_yr);

    const netBudget_m3_yr = totalIn_m3_yr - totalOut_m3_yr;

    // Taxa de erosão: assume zona ativa de 100 m de largura (Bowen-Inman)
    const activeZoneWidth_m = 100;
    const erosionRate_m_yr = netBudget_m3_yr < 0 ? Math.abs(netBudget_m3_yr) / activeZoneWidth_m : 0;

    let budgetStatus;
    if (netBudget_m3_yr > 500) {
        budgetStatus = 'accretion';
    } else if (netBudget_m3_yr >= -500) {
        budgetStatus = 'equilibrium';
    } else if (netBudget_m3_yr >= -5000) {
        budgetStatus = 'erosion';
    } else {
        budgetStatus = 'severe_erosion';
    }

    return {
        totalIn_m3_yr: Number(totalIn_m3_yr.toFixed(2)),
        totalOut_m3_yr: Number(totalOut_m3_yr.toFixed(2)),
        netBudget_m3_yr: Number(netBudget_m3_yr.toFixed(2)),
        budgetStatus,
        erosionRate_m_yr: Number(erosionRate_m_yr.toFixed(4)),
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const coastalProcessesMeta: AnalyticsModuleMeta = {
    name: 'coastalProcesses',
    description: 'coastalProcesses',
    category: 'analytics',
    familyTags: ['coastal'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
