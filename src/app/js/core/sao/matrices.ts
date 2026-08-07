// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   SAO MATRICES — Environmental Monitoring Compartments
   Matrizes SAO — Compartimentos de Monitoramento Ambiental

   Define as 9 matrizes ambientais do protocolo SAO.
   Cada matriz agrupa parametros por compartimento ambiental
   (ar, agua, solo, biota, etc.) com subcategorias internas.
   ================================================================ */

/**
 * SAO Matrix subcategory shape.
 */
export interface SaoMatrixSubcategory {
    readonly id: string;
    readonly nameKey: string;
}

/**
 * SAO Matrix shape — local interface to keep this file a self-contained leaf
 * (TS-MIGRATION-001: no cross-leaf re-exports).
 */
export interface SaoMatrix {
    readonly id: string;
    readonly nameKey: string;
    readonly icon: string;
    readonly color: string;
    readonly subcategories: readonly SaoMatrixSubcategory[];
}

/**
 * SAO Matrix definitions.
 * Each matrix represents an environmental compartment with subcategories.
 */
export const SAO_MATRICES: Readonly<Record<string, SaoMatrix>> = {
    ar: {
        id: 'ar',
        nameKey: 'matrixAir',
        icon: 'wind',
        color: '#64B5F6',
        subcategories: [
            { id: 'particulate', nameKey: 'subcatParticulate' },
            { id: 'criteria_gases', nameKey: 'subcatCriteriaGases' },
            { id: 'meteorology', nameKey: 'subcatMeteorology' },
            { id: 'vocs_air', nameKey: 'subcatVOCsAir' },
            { id: 'deposition', nameKey: 'subcatDeposition' },
            { id: 'indices_air', nameKey: 'subcatIndicesAir' },
            { id: 'dispersion', nameKey: 'subcatDispersion' },
        ],
    },

    agua: {
        id: 'agua',
        nameKey: 'matrixWater',
        icon: 'droplet',
        color: '#42A5F5',
        subcategories: [
            { id: 'hydrology', nameKey: 'subcatHydrology' },
            { id: 'physicochemical', nameKey: 'subcatPhysicochem' },
            { id: 'metals_water', nameKey: 'subcatMetalsWater' },
            { id: 'organics_water', nameKey: 'subcatOrganicsWater' },
            { id: 'microbiology', nameKey: 'subcatMicrobiology' },
            { id: 'ecotox_water', nameKey: 'subcatEcotoxWater' },
            { id: 'limnology', nameKey: 'subcatLimnology' },
            { id: 'emerging', nameKey: 'subcatEmerging' },
            { id: 'isotopes', nameKey: 'subcatIsotopes' },
        ],
    },

    solo: {
        id: 'solo',
        nameKey: 'matrixSoil',
        icon: 'layers',
        color: '#8D6E63',
        subcategories: [
            { id: 'physical_soil', nameKey: 'subcatPhysicalSoil' },
            { id: 'chemical_soil', nameKey: 'subcatChemicalSoil' },
            { id: 'contamination_soil', nameKey: 'subcatContaminationSoil' },
            { id: 'biology_soil', nameKey: 'subcatBiologySoil' },
            { id: 'erosion', nameKey: 'subcatErosion' },
            { id: 'mineralogy', nameKey: 'subcatMineralogy' },
        ],
    },

    biota: {
        id: 'biota',
        nameKey: 'matrixBiota',
        icon: 'leaf',
        color: '#66BB6A',
        subcategories: [
            { id: 'vegetation_structure', nameKey: 'subcatVegetationStructure' },
            { id: 'phytosociology', nameKey: 'subcatPhytosociology' },
            { id: 'fauna_survey', nameKey: 'subcatFaunaSurvey' },
            { id: 'dendrometry', nameKey: 'subcatDendrometry' },
            { id: 'fauna_methods', nameKey: 'subcatFaunaMethods' },
            { id: 'plant_physiology', nameKey: 'subcatPlantPhysiology' },
            { id: 'remote_sensing_bio', nameKey: 'subcatRemoteSensingBio' },
            { id: 'ecosystem_services', nameKey: 'subcatEcosystemServices' },
            { id: 'molecular_bio', nameKey: 'subcatMolecularBio' },
        ],
    },

    humana: {
        id: 'humana',
        nameKey: 'matrixHuman',
        icon: 'user',
        color: '#EF5350',
        subcategories: [
            { id: 'chemical_exposure', nameKey: 'subcatChemicalExposure' },
            { id: 'noise_vibration', nameKey: 'subcatNoiseVibration' },
            { id: 'heat_radiation', nameKey: 'subcatHeatRadiation' },
            { id: 'biomonitoring', nameKey: 'subcatBiomonitoring' },
            { id: 'medical_surveillance', nameKey: 'subcatMedicalSurveillance' },
            { id: 'ergonomics', nameKey: 'subcatErgonomics' },
            { id: 'epidemiology', nameKey: 'subcatEpidemiology' },
            { id: 'genotoxicity', nameKey: 'subcatGenotoxicity' },
            { id: 'endocrine', nameKey: 'subcatEndocrine' },
            { id: 'omics', nameKey: 'subcatOmics' },
        ],
    },

    geotecnico: {
        id: 'geotecnico',
        nameKey: 'matrixGeotechnical',
        icon: 'mountain',
        color: '#78909C',
        subcategories: [
            { id: 'piezometry', nameKey: 'subcatPiezometry' },
            { id: 'resistance', nameKey: 'subcatResistance' },
            { id: 'inclinometry', nameKey: 'subcatInclinometry' },
            { id: 'tailings', nameKey: 'subcatTailings' },
            { id: 'topography', nameKey: 'subcatTopography' },
            { id: 'seismicity', nameKey: 'subcatSeismicity' },
        ],
    },

    sr: {
        id: 'sr',
        nameKey: 'matrixRemoteSensing',
        icon: 'satellite',
        color: '#AB47BC',
        subcategories: [
            { id: 'optical', nameKey: 'subcatOptical' },
            { id: 'radar', nameKey: 'subcatRadar' },
            { id: 'lidar', nameKey: 'subcatLiDAR' },
            { id: 'drones', nameKey: 'subcatDrones' },
            { id: 'spectral_indices', nameKey: 'subcatSpectralIndices' },
            { id: 'change_detection', nameKey: 'subcatChangeDetection' },
        ],
    },

    climatologia: {
        id: 'climatologia',
        nameKey: 'matrixClimatology',
        icon: 'cloud',
        color: '#29B6F6',
        subcategories: [
            { id: 'basic_climate', nameKey: 'subcatBasicClimate' },
            { id: 'extremes', nameKey: 'subcatExtremes' },
            { id: 'water_balance', nameKey: 'subcatWaterBalance' },
            { id: 'climate_change', nameKey: 'subcatClimateChange' },
        ],
    },

    resiliencia: {
        id: 'resiliencia',
        nameKey: 'matrixResilience',
        icon: 'shield',
        color: '#FFA726',
        subcategories: [
            { id: 'compliance', nameKey: 'subcatCompliance' },
            { id: 'gri_standards', nameKey: 'subcatGRIStandards' },
            { id: 'ghg', nameKey: 'subcatGHG' },
            { id: 'waste_gov', nameKey: 'subcatWasteGov' },
            { id: 'lca', nameKey: 'subcatLCA' },
            { id: 'ecological_resilience', nameKey: 'subcatEcologicalResilience' },
        ],
    },
};

/**
 * Get matrix definition by ID.
 */
export function getMatrix(matrixId: string): SaoMatrix | undefined {
    return SAO_MATRICES[matrixId];
}

/**
 * Get all matrix IDs.
 */
export function getAllMatrixIds(): string[] {
    return Object.keys(SAO_MATRICES);
}

/**
 * Map SAO matrix to legacy category for backward compatibility.
 */
export function matrixToCategory(matrixId: string): string {
    const mapping: Readonly<Record<string, string>> = {
        ar: 'air_quality',
        agua: 'chemical',
        solo: 'contaminant',
        biota: 'biodiversity',
        humana: 'safety',
        geotecnico: 'hydrogeology',
        sr: 'physical',
        climatologia: 'physical',
        resiliencia: 'emission',
    };
    return mapping[matrixId] || 'custom';
}
