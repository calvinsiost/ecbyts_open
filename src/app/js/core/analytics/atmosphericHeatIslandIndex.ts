// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Urban Heat Island (UHI) Index / Índice de Ilha de Calor Urbano
 *
 * Academic references:
 *   Oke, T.R. (1982). The energetic basis of the urban heat island.
 *     Quarterly Journal of the Royal Meteorological Society, 108(455), 1–24.
 *     DOI:10.1002/qj.49710845502
 *   Stewart, I.D. & Oke, T.R. (2012). Local Climate Zones for Urban Ecosystem
 *     Studies: New Tool for Urban Climatologists.
 *     Bulletin of the American Meteorological Society, 93(12), 1879–1900.
 *     DOI:10.1175/BAMS-D-11-00019.1
 *   Oke, T.R. et al. (2017). Urban Climates. Cambridge University Press.
 *     ISBN 978-1-107-42953-6
 *
 * Zero dependências DOM/IDB/Three.js/fetch.
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

// ─── LCZ classification table ─────────────────────────────────────────────────
// Stewart & Oke 2012 - Table 2: LCZ properties summary (SVF range, albedo range)
const LCZ_CLASSES: Record<number, { name: string; svfRange: [number, number]; albedoRange: [number, number] }> = {
    1: { name: 'Compact high-rise', svfRange: [0.02, 0.4], albedoRange: [0.1, 0.2] },
    2: { name: 'Compact mid-rise', svfRange: [0.3, 0.6], albedoRange: [0.1, 0.2] },
    3: { name: 'Compact low-rise', svfRange: [0.2, 0.6], albedoRange: [0.1, 0.2] },
    4: { name: 'Open high-rise', svfRange: [0.5, 0.7], albedoRange: [0.12, 0.25] },
    5: { name: 'Open mid-rise', svfRange: [0.5, 0.8], albedoRange: [0.12, 0.25] },
    6: { name: 'Open low-rise', svfRange: [0.6, 0.9], albedoRange: [0.12, 0.25] },
    7: { name: 'Lightweight low-rise', svfRange: [0.6, 1.0], albedoRange: [0.15, 0.35] },
    8: { name: 'Large low-rise', svfRange: [0.7, 1.0], albedoRange: [0.12, 0.25] },
    9: { name: 'Sparsely built', svfRange: [0.8, 1.0], albedoRange: [0.12, 0.25] },
    10: { name: 'Heavy industry', svfRange: [0.6, 0.9], albedoRange: [0.12, 0.2] },
};

// ─── UHI Intensity ────────────────────────────────────────────────────────────

/**
 * UHI Intensity / Intensidade da ilha de calor urbano.
 *
 * ΔTu-r = T_urban − T_rural  [°C]
 * Valores típicos: 1–3 °C (fraco), 3–5 °C (moderado), >5 °C (severo).
 * Referência: Oke 1982, eq. 1; Oke et al. 2017 cap. 8
 *
 * @param tempUrbanC  - Temperatura urbana (°C)
 * @param tempRuralC  - Temperatura rural de referência (°C)
 * @returns
 * @throws {TypeError}  se valores não forem números finitos
 * @throws {RangeError} se temperaturas estiverem fora de limites físicos razoáveis (-80 a 60 °C)
 */
export function uhiIntensity(
    tempUrbanC: number,
    tempRuralC: number,
): { deltaT: number; category: 'weak' | 'moderate' | 'severe' } {
    for (const [name, val] of [
        ['tempUrbanC', tempUrbanC],
        ['tempRuralC', tempRuralC],
    ] as [string, number][]) {
        if (typeof val !== 'number' || !isFinite(val)) throw new TypeError(`${name} must be a finite number`);
        if (val < -80 || val > 60) throw new RangeError(`${name} must be between -80 and 60 °C`);
    }
    const deltaT = tempUrbanC - tempRuralC;
    let category: 'weak' | 'moderate' | 'severe';
    const absDelta = Math.abs(deltaT);
    if (absDelta < 3) category = 'weak';
    else if (absDelta < 5) category = 'moderate';
    else category = 'severe';
    return { deltaT, category };
}

// ─── Sky View Factor ──────────────────────────────────────────────────────────

/**
 * Sky View Factor (SVF) - hemispherical approximation / Fator de visão do céu.
 *
 * SVF ≈ 1 / (1 + (H/W))  para cânion urbano simétrico (H=altura, W=largura).
 * Simplificação de Oke 1981 para cânions 2D perpendiculares.
 * Referência: Oke, T.R. (1981). Canyon geometry and the nocturnal urban heat
 *   island: comparison of scale model and field observations.
 *   Journal of Climatology, 1(3), 237–254. DOI:10.1002/joc.3370010304
 *
 * @param buildingHeight - Altura média das edificações (m)
 * @param streetWidth    - Largura da rua/cânion (m)
 * @returns
 * @throws {TypeError}  se valores não forem números finitos positivos
 * @throws {RangeError} se buildingHeight <= 0 ou streetWidth <= 0
 */
export function skyViewFactor(buildingHeight: number, streetWidth: number): { svf: number; aspectRatio: number } {
    if (typeof buildingHeight !== 'number' || !isFinite(buildingHeight))
        throw new TypeError('buildingHeight must be a finite number');
    if (typeof streetWidth !== 'number' || !isFinite(streetWidth))
        throw new TypeError('streetWidth must be a finite number');
    if (buildingHeight <= 0) throw new RangeError('buildingHeight must be > 0');
    if (streetWidth <= 0) throw new RangeError('streetWidth must be > 0');

    const aspectRatio = buildingHeight / streetWidth;
    // Aproximação de Oke 1981 para cânion simétrico
    const svf = 1 / (1 + aspectRatio);
    return { svf, aspectRatio };
}

// ─── Surface Albedo Index ─────────────────────────────────────────────────────

/**
 * Weighted surface albedo / Albedo de superfície ponderado.
 *
 * α_surface = Σ(αᵢ × Aᵢ) / Σ(Aᵢ)
 * Onde αᵢ é o albedo de cada cobertura e Aᵢ é a área correspondente.
 * Referência: Stewart & Oke 2012 Supplemental Table S2; Oke et al. 2017 cap. 2
 *
 * @param surfaces - Superfícies com albedo e área
 * @returns
 * @throws {TypeError}  se surfaces não for array ou tiver elementos inválidos
 * @throws {RangeError} se albedo fora de [0, 1] ou área <= 0
 */
export function surfaceAlbedoIndex(
    surfaces: Array<{ albedo: number; areaM2: number }>,
): { weightedAlbedo: number; totalArea: number } {
    if (!Array.isArray(surfaces) || surfaces.length === 0) throw new TypeError('surfaces must be a non-empty array');

    let weightedSum = 0;
    let totalArea = 0;

    for (const s of surfaces) {
        if (typeof s.albedo !== 'number' || !isFinite(s.albedo))
            throw new TypeError('Each surface albedo must be a finite number');
        if (s.albedo < 0 || s.albedo > 1) throw new RangeError('albedo must be in [0, 1]');
        if (typeof s.areaM2 !== 'number' || s.areaM2 <= 0) throw new RangeError('areaM2 must be > 0');
        weightedSum += s.albedo * s.areaM2;
        totalArea += s.areaM2;
    }

    return { weightedAlbedo: weightedSum / totalArea, totalArea };
}

// ─── LCZ Classification ───────────────────────────────────────────────────────

/**
 * Local Climate Zone (LCZ) classification / Classificação de zona climática local.
 *
 * Retorna a classe LCZ (1–10) mais compatível com o SVF e albedo fornecidos.
 * Se nenhuma classe se encaixar, retorna null.
 * Referência: Stewart & Oke 2012 - Table 1 (LCZ urban classes 1–10)
 *
 * @param svf    - Sky View Factor medido [0, 1]
 * @param albedo - Albedo de superfície medido [0, 1]
 * @returns
 * @throws {TypeError}  se svf ou albedo não forem números finitos
 * @throws {RangeError} se svf ou albedo estiverem fora de [0, 1]
 */
function _validateLCZInputs(svf: number, albedo: number): void {
    if (typeof svf !== 'number' || !isFinite(svf)) throw new TypeError('svf must be a finite number');
    if (typeof albedo !== 'number' || !isFinite(albedo)) throw new TypeError('albedo must be a finite number');
    if (svf < 0 || svf > 1) throw new RangeError('svf must be in [0, 1]');
    if (albedo < 0 || albedo > 1) throw new RangeError('albedo must be in [0, 1]');
}

interface _LCZMatch {
    inRange: boolean;
    score: number;
}

function _lczMatchScore(
    svf: number,
    albedo: number,
    props: { svfRange: [number, number]; albedoRange: [number, number] },
): _LCZMatch {
    const svfMid = (props.svfRange[0] + props.svfRange[1]) / 2;
    const albMid = (props.albedoRange[0] + props.albedoRange[1]) / 2;
    const svfInRange = svf >= props.svfRange[0] && svf <= props.svfRange[1];
    const albInRange = albedo >= props.albedoRange[0] && albedo <= props.albedoRange[1];
    const score = Math.sqrt((svf - svfMid) ** 2 + (albedo - albMid) ** 2);
    return { inRange: svfInRange && albInRange, score };
}

export function classifyLCZ(
    svf: number,
    albedo: number,
): { lczClass: number | null; name: string | null; matchScore: number } {
    _validateLCZInputs(svf, albedo);

    let bestClass: number | null = null;
    let bestScore = Infinity;

    for (const [cls, props] of Object.entries(LCZ_CLASSES)) {
        const match = _lczMatchScore(svf, albedo, props);
        if (match.inRange && match.score < bestScore) {
            bestScore = match.score;
            bestClass = parseInt(cls);
        }
    }

    return {
        lczClass: bestClass,
        name: bestClass !== null ? LCZ_CLASSES[bestClass]!.name : null,
        matchScore: bestClass !== null ? bestScore : Infinity,
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const atmosphericHeatIslandIndexMeta: AnalyticsModuleMeta = {
    name: 'atmosphericHeatIslandIndex',
    description: 'atmosphericHeatIslandIndex',
    category: 'analytics',
    familyTags: ['atmosphere'],
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
