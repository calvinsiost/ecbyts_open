// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Academic References:
//   [DARCY]   Darcy, H. (1856). Les Fontaines Publiques de la Ville de Dijon. Paris: Dalmont.
//             Freeze, R.A. & Cherry, J.A. (1979). Groundwater. Prentice-Hall.
//             DOI:10.1017/CBO9781139172165 (review). Darcy's law: Q = K * i * A
//   [ANCOLD]  ANCOLD (2012). Guidelines on Consequence Categories for Dams.
//             Australian National Committee on Large Dams. ISBN:978-0-9807730-4-6
//   [ICOLD]   ICOLD (2011). Tailings Dams - Risk of Dangerous Occurrences.
//             Bulletin 121. International Commission on Large Dams.
//   [SLURRY]  Vick, S.G. (1983). Planning, Design and Analysis of Tailings Dams.
//             Wiley, New York. ISBN:0-471-87848-X
//             Wills, B.A. & Finch, J.A. (2015). Wills' Mineral Processing Technology (8th ed.).
//             Butterworth-Heinemann. DOI:10.1016/C2010-0-65478-2

'use strict';

interface SlurrySolidContentResult {
    solids_pct: number;
    water_pct: number;
    pulp_density_t_m3: number;
}

interface TSFCapacityResult {
    capacity_dry_t: number;
    void_ratio_approx: number;
}

interface SeepageRateResult {
    seepage_m3_s: number;
    seepage_m3_day: number;
    seepage_L_min: number;
    risk_flag: 'acceptable' | 'monitor' | 'critical';
}

interface TSFRiskLevelResult {
    risk: 'low' | 'significant' | 'high' | 'extreme';
    height_m: number;
    volume_Mm3: number;
    downstream_population: number;
    recommended_dam_class: string;
}

/**
 * Valida numero finito com limites opcionais.
 * @param {number} v - Valor
 * @param {string} name - Nome do parametro
 * @param {number} [min?] - Limite inferior (inclusivo)
 * @param {number} [max?] - Limite superior (inclusivo)
 */
function _assertFinite(v: number, name: string, min?: number, max?: number): void {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError(`${name} must be a finite number, got: ${v}`);
    }
    if (min !== undefined && v < min) {
        throw new RangeError(`${name} must be >= ${min}, got: ${v}`);
    }
    if (max !== undefined && v > max) {
        throw new RangeError(`${name} must be <= ${max}, got: ${v}`);
    }
}

// ============================================================
// 1. SLURRY SOLID CONTENT - Vick (1983), Wills & Finch (2015)
// ============================================================

/**
 * Calcula o teor de solidos (% em massa) e a densidade de polpa de rejeitos.
 *
 * Cw = mass_solids / total_mass * 100       (% de solidos em massa)
 * Pulp density (t/m³) calculada assumindo regra de mistura ideal:
 *   1/rho_pulp = Cw/(100*rho_solids) + (100-Cw)/(100*rho_water)
 * Usa rho_solids = 2.7 t/m³ (piritas/silicatos tipicos) e rho_water = 1.0 t/m³.
 *
 * @param {number} mass_solids_t - Massa de solidos secos (toneladas), >= 0
 * @param {number} total_mass_t - Massa total da polpa (solidos + agua), > mass_solids_t >= 0
 * @returns {{ solids_pct: number, water_pct: number, pulp_density_t_m3: number }}
 *   solids_pct: percentual de solidos em massa [0-100]
 *   water_pct: percentual de agua em massa [0-100]
 *   pulp_density_t_m3: densidade da polpa em t/m³
 * @reference Vick 1983; Wills & Finch 2015 DOI:10.1016/C2010-0-65478-2
 */
export function computeSlurrySolidContent(mass_solids_t: number, total_mass_t: number): SlurrySolidContentResult {
    _assertFinite(mass_solids_t, 'mass_solids_t', 0);
    _assertFinite(total_mass_t, 'total_mass_t', 0);

    if (total_mass_t <= 0) {
        throw new RangeError('total_mass_t must be > 0');
    }
    if (mass_solids_t > total_mass_t) {
        throw new RangeError('mass_solids_t must be <= total_mass_t');
    }

    const solids_pct = (mass_solids_t / total_mass_t) * 100;
    const water_pct = 100 - solids_pct;

    // Densidades tipicas: solidos minerais = 2.7 t/m3, agua = 1.0 t/m3
    const RHO_SOLIDS = 2.7; // t/m³
    const RHO_WATER = 1.0; // t/m³
    const Cw = solids_pct / 100;

    // Regra de mistura inversa (volume additivo):
    // 1/rho_pulp = Cw/rho_s + (1-Cw)/rho_w
    const inv_rho = (solids_pct > 0 ? Cw / RHO_SOLIDS : 0) + (100 - solids_pct > 0 ? (1 - Cw) / RHO_WATER : 0);
    const pulp_density_t_m3 = inv_rho > 0 ? 1 / inv_rho : RHO_WATER;

    return Object.freeze({ solids_pct, water_pct, pulp_density_t_m3 });
}

// ============================================================
// 2. TSF CAPACITY - capacidade de armazenamento em t secas
// ============================================================

/**
 * Estima a capacidade de armazenamento de uma Barragem de Rejeitos (TSF)
 * em toneladas de solidos secos a partir do volume projetado, densidade
 * seca do deposito e teor de solidos esperado da polpa.
 *
 * capacity_dry_t = volume_m3 * dry_density_t_m3 * (solids_pct/100)
 *
 * A densidade seca do deposito (dry_density_t_m3) depende do metodo de
 * disposicao: via umida tipicamente 1.2-1.5 t/m³; via seca 1.5-1.8 t/m³.
 *
 * @param {number} volume_m3 - Volume total disponivel na bacia (m³), > 0
 * @param {number} dry_density_t_m3 - Densidade seca do rejeito depositado (t/m³), [0.5, 3.0]
 * @param {number} solids_pct - Teor de solidos da polpa afluente (%), [1, 100]
 * @returns {{ capacity_dry_t: number, void_ratio_approx: number }}
 *   capacity_dry_t: capacidade em toneladas secas
 *   void_ratio_approx: indice de vazios aproximado do deposito (adimensional)
 * @reference Vick 1983 Planning, Design and Analysis of Tailings Dams. Wiley.
 */
export function computeTSFCapacity(volume_m3: number, dry_density_t_m3: number, solids_pct: number): TSFCapacityResult {
    _assertFinite(volume_m3, 'volume_m3', 0);
    _assertFinite(dry_density_t_m3, 'dry_density_t_m3', 0.5, 3.0);
    _assertFinite(solids_pct, 'solids_pct', 1, 100);

    if (volume_m3 <= 0) {
        throw new RangeError('volume_m3 must be > 0');
    }

    const capacity_dry_t = volume_m3 * dry_density_t_m3 * (solids_pct / 100);

    // Indice de vazios aproximado: e = (rho_solids / rho_dry) - 1
    // Usando rho_solids = 2.7 t/m³ como tipico de rejeitos minerais
    const RHO_SOLIDS = 2.7;
    const void_ratio_approx = Math.max(0, RHO_SOLIDS / dry_density_t_m3 - 1);

    return Object.freeze({ capacity_dry_t, void_ratio_approx });
}

// ============================================================
// 3. SEEPAGE RATE - Lei de Darcy para percolacao
// ============================================================

/**
 * Calcula a taxa de percolacao atraves do corpo da barragem usando a Lei de Darcy.
 *
 * Q = K * i * A
 *
 * Onde:
 *   K = condutividade hidraulica (m/s)
 *   i = gradiente hidraulico = delta_h / L (adimensional)
 *   A = area da secao transversal perpendicular ao fluxo (m²)
 *
 * A taxa de percolacao e um parametro critico de seguranca: valores elevados
 * indicam risco de piping (erosao interna) ou ruptura hidraulica.
 *
 * @param {number} hydraulic_conductivity_m_s - Condutividade hidraulica K (m/s), [1e-12, 1e-2]
 * @param {number} gradient - Gradiente hidraulico i = delta_h/L (adimensional), [0, 10]
 * @param {number} area_m2 - Area da secao de fluxo (m²), > 0
 * @returns {{ seepage_m3_s: number, seepage_m3_day: number, seepage_L_min: number, risk_flag: string }}
 *   seepage_m3_s: vazao de percolacao em m³/s
 *   seepage_m3_day: vazao diaria em m³/dia
 *   seepage_L_min: vazao em litros por minuto
 *   risk_flag: 'acceptable'|'monitor'|'critical' baseado em limiares tipicos
 * @reference Darcy 1856; Freeze & Cherry 1979 Groundwater; ICOLD Bulletin 121
 */
export function computeSeepageRate(hydraulic_conductivity_m_s: number, gradient: number, area_m2: number): SeepageRateResult {
    _assertFinite(hydraulic_conductivity_m_s, 'hydraulic_conductivity_m_s', 1e-12, 1e-2);
    _assertFinite(gradient, 'gradient', 0, 10);
    _assertFinite(area_m2, 'area_m2', 0);

    if (area_m2 <= 0) {
        throw new RangeError('area_m2 must be > 0');
    }

    // Lei de Darcy: Q = K * i * A
    const seepage_m3_s = hydraulic_conductivity_m_s * gradient * area_m2;
    const seepage_m3_day = seepage_m3_s * 86400;
    const seepage_L_min = seepage_m3_s * 1000 * 60;

    // Classificacao de risco baseada em limiar pratico de engenharia de barragens
    // (ICOLD Bulletin 121 e pratica regulatoria DNPM/ANM Brasil)
    let risk_flag: 'acceptable' | 'monitor' | 'critical';
    if (seepage_L_min < 1) risk_flag = 'acceptable';
    else if (seepage_L_min < 10) risk_flag = 'monitor';
    else risk_flag = 'critical';

    return Object.freeze({ seepage_m3_s, seepage_m3_day, seepage_L_min, risk_flag });
}

// ============================================================
// 4. TSF RISK LEVEL - ANCOLD 2012 consequence classification
// ============================================================

/**
 * Classifica o nivel de risco de uma Barragem de Rejeitos (TSF) usando
 * a matriz de consequencias ANCOLD 2012, com tres variaveis-chave:
 * altura da barragem, volume armazenado e populacao a jusante.
 *
 * Categorias de risco (ANCOLD 2012):
 *   'low'         - altura < 15m E volume < 0.5 Mm³ E nenhuma populacao a jusante
 *   'significant' - altura < 30m E volume < 5 Mm³ E populacao < 10 pessoas
 *   'high'        - altura < 60m E volume < 50 Mm³ E populacao < 100 pessoas
 *   'extreme'     - qualquer caso acima dos limites anteriores
 *
 * @param {number} height_m - Altura maxima da barragem (m), > 0
 * @param {number} volume_Mm3 - Volume armazenado em milhoes de metros cubicos (Mm³), > 0
 * @param {number} downstream_population - Populacao estimada a jusante na zona de inundacao, >= 0
 * @returns {{ risk: 'low'|'significant'|'high'|'extreme',
 *             height_m: number, volume_Mm3: number, downstream_population: number,
 *             recommended_dam_class: string }}
 *   risk: nivel de risco ANCOLD 2012
 *   recommended_dam_class: classe de projeto recomendada (ICOLD)
 * @reference ANCOLD 2012 Guidelines on Consequence Categories for Dams.
 *            ISBN:978-0-9807730-4-6
 */
export function classifyTSFRiskLevel(height_m: number, volume_Mm3: number, downstream_population: number): TSFRiskLevelResult {
    _assertFinite(height_m, 'height_m', 0);
    _assertFinite(volume_Mm3, 'volume_Mm3', 0);
    _assertFinite(downstream_population, 'downstream_population', 0);

    if (height_m <= 0) throw new RangeError('height_m must be > 0');
    if (volume_Mm3 <= 0) throw new RangeError('volume_Mm3 must be > 0');

    let risk: 'low' | 'significant' | 'high' | 'extreme';
    if (height_m < 15 && volume_Mm3 < 0.5 && downstream_population === 0) {
        risk = 'low';
    } else if (height_m < 30 && volume_Mm3 < 5 && downstream_population < 10) {
        risk = 'significant';
    } else if (height_m < 60 && volume_Mm3 < 50 && downstream_population < 100) {
        risk = 'high';
    } else {
        risk = 'extreme';
    }

    // Classe de projeto ICOLD recomendada por nivel de risco
    const CLASS_MAP: Record<'low' | 'significant' | 'high' | 'extreme', string> = {
        low: 'Class I (low hazard)',
        significant: 'Class II (significant hazard)',
        high: 'Class III (high hazard)',
        extreme: 'Class IV (extreme hazard)',
    };
    const recommended_dam_class = CLASS_MAP[risk];

    return Object.freeze({ risk, height_m, volume_Mm3, downstream_population, recommended_dam_class });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const tailingsStorageFacilityMeta = {
    name: 'tailingsStorageFacility',
    description: 'tailingsStorageFacility',
    category: 'analytics',
    familyTags: ['environmental'],
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
