// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   FUGACITY LEVEL I — Mackay multimedia equilibrium partitioning
   Partição multimídia no equilíbrio (modelo de fugacidade Nível I)

   Implementa o modelo de fugacidade Nível I de Mackay: a distribuição
   de equilíbrio de uma massa fixa de um químico orgânico não-iônico
   entre os compartimentos ambientais (ar, água, solo, sedimento,
   particulado suspenso e biota), num "mundo unitário" fechado, sem
   degradação nem advecção (apenas equilíbrio termodinâmico).

   Conceito central: a FUGACIDADE f (Pa) é o potencial de escape do
   químico, igual em todos os compartimentos no equilíbrio. A
   CAPACIDADE DE FUGACIDADE Z (mol·m^-3·Pa^-1) traduz f em concentração
   molar: C_i = Z_i · f. A massa total conservada fixa f:

       f = M / Σ_i (V_i · Z_i)          [Pa]
       C_i = Z_i · f                     [mol·m^-3]
       m_i = C_i · V_i                   [mol]
       fração_i = (V_i · Z_i) / Σ_j (V_j · Z_j)

   Capacidades de fugacidade (Mackay 2001, Tabela 5.3):
       Z_ar      = 1 / (R·T)
       Z_água    = 1 / H                 (H = const. de Henry, Pa·m^3/mol)
       Z_sólido  = ρ_s · Kd · Z_água / 1000
                   com Kd = foc · Koc    (L/kg → m^3/kg via /1000)
       Koc       = 0.41 · Kow            (Karickhoff 1981)
       Z_biota   = ρ_b · L_b · Kow · Z_água / 1000   (partição lipídica)

   Este módulo é puro: sem DOM, sem IDB, sem Three.js, sem rede.

   Referencias academicas:
   - Mackay, D. (2001). Multimedia Environmental Models: The Fugacity
     Approach, 2nd ed. CRC Press / Lewis Publishers. ISBN 978-1-56670-542-4.
     (Capítulo 5: Level I calculations; Tabelas 5.1-5.3.)
   - Mackay, D. & Paterson, S. (1981). Calculating fugacity.
     Environ. Sci. Technol. 15(9):1006-1014. DOI: 10.1021/es00091a001
   - Mackay, D. & Paterson, S. (1991). Evaluating the multimedia fate of
     organic chemicals: a level III fugacity model.
     Environ. Sci. Technol. 25(3):427-436. DOI: 10.1021/es00015a008
   - Karickhoff, S.W. (1981). Semi-empirical estimation of sorption of
     hydrophobic pollutants on natural sediments and soils.
     Chemosphere 10(8):833-846. DOI: 10.1016/0045-6535(81)90083-7
   ================================================================ */

// Universal gas constant (J·mol^-1·K^-1 = Pa·m^3·mol^-1·K^-1).
const R_GAS = 8.314;

// Standard environmental temperature (K) — 25 °C, Mackay unit-world default.
const T_STANDARD_K = 298.15;

// Karickhoff (1981) regression slope: Koc = KOC_KOW_FACTOR · Kow.
const KOC_KOW_FACTOR = 0.41;

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

/** Canonical compartment identifiers (Mackay Level I unit world). */
export type FugacityCompartment = 'air' | 'water' | 'soil' | 'sediment' | 'suspendedSediment' | 'biota';

/** Physical definition of one environmental compartment. */
export interface CompartmentSpec {
    /** Bulk volume of the compartment (m^3). */
    volume_m3: number;
    /** Bulk density of the solid phase (kg/m^3). Required for sorbing media. */
    density_kg_m3?: number;
    /** Fraction of organic carbon (dimensionless, 0..1). For soil/sediment. */
    foc?: number;
    /** Lipid (fat) fraction (dimensionless, 0..1). For biota lipid partitioning. */
    lipidFraction?: number;
}

/** Per-compartment equilibrium result. */
export interface CompartmentResult {
    /** Fugacity capacity Z (mol·m^-3·Pa^-1). */
    Z: number;
    /** Volume × Z product (mol·Pa^-1) — the partitioning weight. */
    VZ: number;
    /** Equilibrium molar concentration C = Z·f (mol·m^-3). */
    concentration_mol_m3: number;
    /** Equilibrium mass concentration (g·m^-3 = mg·L^-1). */
    concentration_mg_L: number;
    /** Mass of chemical in this compartment (mol). */
    amount_mol: number;
    /** Mass of chemical in this compartment (kg). */
    mass_kg: number;
    /** Fraction of total mass residing here (0..1). */
    fraction: number;
}

export interface FugacityLevelIResult {
    /** Equilibrium fugacity, equal across compartments (Pa). */
    fugacity_Pa: number;
    /** Per-compartment results, keyed by compartment id. */
    compartments: Readonly<Record<string, CompartmentResult>>;
    /** Σ V_i·Z_i (mol·Pa^-1). */
    totalVZ: number;
    /** Total chemical mass in the system (mol). */
    totalAmount_mol: number;
    method: string;
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function _requireFinite(v: unknown, name: string, nonNegative = false): number {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`fugacityLevelI: '${name}' must be a finite number, got ${String(v)}`);
    }
    if (nonNegative && v < 0) {
        throw new RangeError(`fugacityLevelI: '${name}' must be >= 0, got ${v}`);
    }
    return v;
}

function _requirePositive(v: unknown, name: string): number {
    _requireFinite(v, name);
    if ((v as number) <= 0) {
        throw new RangeError(`fugacityLevelI: '${name}' must be > 0, got ${v}`);
    }
    return v as number;
}

// ----------------------------------------------------------------
// 1. computeKoc — Koc from Kow (Karickhoff 1981)
// ----------------------------------------------------------------

/**
 * Organic-carbon partition coefficient Koc (L/kg) from the octanol-water
 * partition coefficient Kow (dimensionless), via Karickhoff (1981):
 *
 *     Koc = 0.41 · Kow
 *
 * @param Kow octanol-water partition coefficient (dimensionless, > 0)
 * @returns Koc in L/kg
 */
export function computeKoc(Kow: number): number {
    _requirePositive(Kow, 'Kow');
    return KOC_KOW_FACTOR * Kow;
}

// ----------------------------------------------------------------
// 2. Fugacity capacities Z (mol·m^-3·Pa^-1)
// ----------------------------------------------------------------

/**
 * Fugacity capacity of air: Z_air = 1/(R·T).
 * @param temperature_K absolute temperature (K, > 0)
 */
export function fugacityCapacityAir(temperature_K: number = T_STANDARD_K): number {
    _requirePositive(temperature_K, 'temperature_K');
    return 1 / (R_GAS * temperature_K);
}

/**
 * Fugacity capacity of water: Z_water = 1/H, where H is the Henry's law
 * constant in Pa·m^3·mol^-1.
 * @param henry_Pa_m3_mol Henry's law constant (Pa·m^3/mol, > 0)
 */
export function fugacityCapacityWater(henry_Pa_m3_mol: number): number {
    _requirePositive(henry_Pa_m3_mol, 'henry_Pa_m3_mol');
    return 1 / henry_Pa_m3_mol;
}

/**
 * Fugacity capacity of a sorbing solid (soil / sediment / suspended solids):
 *
 *     Z_solid = ρ_s · Kd · Z_water / 1000
 *     Kd      = foc · Koc                      [L/kg]
 *
 * The /1000 converts Kd from L/kg to m^3/kg so units resolve to
 * mol·m^-3·Pa^-1 (Mackay 2001, Table 5.3).
 *
 * @param density_kg_m3 solid bulk density (kg/m^3, > 0)
 * @param foc fraction of organic carbon (0..1)
 * @param Koc organic-carbon partition coefficient (L/kg, > 0)
 * @param Zwater fugacity capacity of water (mol·m^-3·Pa^-1, > 0)
 */
export function fugacityCapacitySolid(density_kg_m3: number, foc: number, Koc: number, Zwater: number): number {
    _requirePositive(density_kg_m3, 'density_kg_m3');
    _requireFinite(foc, 'foc', true);
    if (foc > 1) throw new RangeError(`fugacityLevelI: 'foc' must be <= 1, got ${foc}`);
    _requirePositive(Koc, 'Koc');
    _requirePositive(Zwater, 'Zwater');
    const Kd_L_kg = foc * Koc;
    return (density_kg_m3 * (Kd_L_kg / 1000) * Zwater);
}

/**
 * Fugacity capacity of biota via lipid partitioning:
 *
 *     Z_biota = ρ_b · L · Kow · Z_water / 1000
 *
 * where L is the lipid fraction. The bioconcentration partition is
 * approximated by Kow (Mackay 2001, eq. 5.9).
 *
 * @param density_kg_m3 biota density (kg/m^3, > 0)
 * @param lipidFraction lipid fraction (0..1)
 * @param Kow octanol-water partition coefficient (dimensionless, > 0)
 * @param Zwater fugacity capacity of water (mol·m^-3·Pa^-1, > 0)
 */
export function fugacityCapacityBiota(density_kg_m3: number, lipidFraction: number, Kow: number, Zwater: number): number {
    _requirePositive(density_kg_m3, 'density_kg_m3');
    _requireFinite(lipidFraction, 'lipidFraction', true);
    if (lipidFraction > 1) throw new RangeError(`fugacityLevelI: 'lipidFraction' must be <= 1, got ${lipidFraction}`);
    _requirePositive(Kow, 'Kow');
    _requirePositive(Zwater, 'Zwater');
    return density_kg_m3 * (lipidFraction * Kow / 1000) * Zwater;
}

// ----------------------------------------------------------------
// 3. computeLevelIPartitioning — full multimedia equilibrium
// ----------------------------------------------------------------

/**
 * Mackay Level I equilibrium partitioning of a fixed chemical mass across
 * the supplied environmental compartments.
 *
 * The Z value for each compartment is derived from its physical spec:
 * - air: uses 1/(R·T)
 * - water: uses 1/H
 * - soil / sediment / suspendedSediment: sorbing solid, needs
 *   density_kg_m3 and foc
 * - biota: lipid partition, needs density_kg_m3 and lipidFraction
 *
 * At equilibrium all compartments share one fugacity f; concentration,
 * mass and the mass fraction per compartment are returned.
 *
 * @param params.compartments map of compartment id → CompartmentSpec
 * @param params.totalAmount_mol total moles of chemical conserved in the system (> 0)
 * @param params.molarMass_g_mol molar mass (g/mol, > 0) — for mass / mg·L outputs
 * @param params.henry_Pa_m3_mol Henry's law constant (Pa·m^3/mol, > 0)
 * @param params.Kow octanol-water partition coefficient (dimensionless, > 0)
 * @param params.temperature_K absolute temperature (K), default 298.15
 * @param params.Koc optional explicit Koc (L/kg); if omitted derived via Karickhoff
 */
export function computeLevelIPartitioning(params: {
    compartments: Partial<Record<FugacityCompartment, CompartmentSpec>>;
    totalAmount_mol: number;
    molarMass_g_mol: number;
    henry_Pa_m3_mol: number;
    Kow: number;
    temperature_K?: number;
    Koc?: number;
}): Readonly<FugacityLevelIResult> {
    const {
        compartments,
        totalAmount_mol,
        molarMass_g_mol,
        henry_Pa_m3_mol,
        Kow,
        temperature_K = T_STANDARD_K,
        Koc: KocOverride,
    } = params;

    if (!compartments || typeof compartments !== 'object') {
        throw new TypeError('fugacityLevelI: compartments must be an object map');
    }
    _requirePositive(totalAmount_mol, 'totalAmount_mol');
    _requirePositive(molarMass_g_mol, 'molarMass_g_mol');
    _requirePositive(henry_Pa_m3_mol, 'henry_Pa_m3_mol');
    _requirePositive(Kow, 'Kow');
    _requirePositive(temperature_K, 'temperature_K');

    const Zwater = fugacityCapacityWater(henry_Pa_m3_mol);
    const Zair = fugacityCapacityAir(temperature_K);
    const Koc = KocOverride !== undefined ? _requirePositive(KocOverride, 'Koc') : computeKoc(Kow);

    const entries = Object.entries(compartments) as Array<[FugacityCompartment, CompartmentSpec]>;
    if (entries.length === 0) {
        throw new RangeError('fugacityLevelI: at least one compartment is required');
    }

    // First pass: Z and V·Z per compartment.
    const vz: Array<{ id: FugacityCompartment; Z: number; V: number; VZ: number }> = [];
    let totalVZ = 0;

    for (const [id, spec] of entries) {
        if (!spec || typeof spec !== 'object') {
            throw new TypeError(`fugacityLevelI: spec for '${id}' must be an object`);
        }
        const V = _requirePositive(spec.volume_m3, `${id}.volume_m3`);
        let Z: number;
        switch (id) {
            case 'air':
                Z = Zair;
                break;
            case 'water':
                Z = Zwater;
                break;
            case 'soil':
            case 'sediment':
            case 'suspendedSediment': {
                const density = _requirePositive(spec.density_kg_m3, `${id}.density_kg_m3`);
                const foc = _requireFinite(spec.foc ?? NaN, `${id}.foc`, true);
                Z = fugacityCapacitySolid(density, foc, Koc, Zwater);
                break;
            }
            case 'biota': {
                const density = _requirePositive(spec.density_kg_m3, `${id}.density_kg_m3`);
                const lipid = _requireFinite(spec.lipidFraction ?? NaN, `${id}.lipidFraction`, true);
                Z = fugacityCapacityBiota(density, lipid, Kow, Zwater);
                break;
            }
            default:
                throw new RangeError(`fugacityLevelI: unknown compartment '${id}'`);
        }
        const VZ = V * Z;
        totalVZ += VZ;
        vz.push({ id, Z, V, VZ });
    }

    if (!(totalVZ > 0)) {
        throw new RangeError('fugacityLevelI: total V·Z is not positive — check inputs');
    }

    // Equilibrium fugacity (Pa): f = M / Σ V·Z.
    const fugacity_Pa = totalAmount_mol / totalVZ;

    const out: Record<string, CompartmentResult> = {};
    for (const { id, Z, V, VZ } of vz) {
        const concentration_mol_m3 = Z * fugacity_Pa;
        const amount_mol = concentration_mol_m3 * V;
        // g/m^3 == mg/L (1 g/m^3 = 1 mg/L by definition).
        const concentration_mg_L = concentration_mol_m3 * molarMass_g_mol;
        const mass_kg = amount_mol * molarMass_g_mol * 1e-3;
        const fraction = VZ / totalVZ;
        out[id] = Object.freeze({
            Z,
            VZ,
            concentration_mol_m3,
            concentration_mg_L,
            amount_mol,
            mass_kg,
            fraction,
        });
    }

    return Object.freeze({
        fugacity_Pa,
        compartments: Object.freeze(out),
        totalVZ,
        totalAmount_mol,
        method: 'mackay-level-I',
    });
}

export const fugacityLevelIMeta = Object.freeze({
    module: 'fugacityLevelI',
    model: 'Mackay Level I multimedia equilibrium partitioning',
    primaryReference: 'Mackay, D. (2001). Multimedia Environmental Models, 2nd ed. ISBN 978-1-56670-542-4',
    constants: Object.freeze({ R_GAS, T_STANDARD_K, KOC_KOW_FACTOR }),
});
