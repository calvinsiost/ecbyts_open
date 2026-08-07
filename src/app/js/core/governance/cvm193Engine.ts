// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

import { generateId } from '../../utils/helpers/id.js';

/* ================================================================
   CVM 193/2023 ESG DISCLOSURE ENGINE
   Brazilian Mandatory ESG Reporting (effective 2026)
   Reference: CVM Resolution 193/2023 — IFRS S1 + S2 adaptation
   ================================================================ */

/**
 * ESG Pillars defined by CVM 193/2023.
 * Mapeia os tres pilares ESG obrigatorios para relatorio CVM.
 */
export const CVM193_PILLARS = Object.freeze({
    E: 'environmental',
    S: 'social',
    G: 'governance',
});

/**
 * ESG Dimensions across E/S/G pillars per CVM 193/2023 taxonomy.
 * Dimensoes de divulgacao por pilar, baseadas em IFRS S1/S2 e CVM 193.
 */
export const CVM193_DIMENSIONS = Object.freeze({
    E: Object.freeze({
        CLIMATE: 'climate',
        WATER: 'water',
        BIODIVERSITY: 'biodiversity',
        WASTE: 'waste',
    }),
    S: Object.freeze({
        LABOR: 'labor',
        HEALTH_SAFETY: 'health_safety',
        COMMUNITY: 'community',
    }),
    G: Object.freeze({
        ETHICS: 'ethics',
        BOARD: 'board',
        TRANSPARENCY: 'transparency',
        RISK: 'risk',
        COMPLIANCE: 'compliance',
    }),
});

/**
 * Materiality levels for ESG disclosure items.
 * Niveis de materialidade para avaliacao de relevancia de divulgacao.
 */
export const MATERIALITY_LEVELS = Object.freeze({
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
    NOT_MATERIAL: 0,
});

/** Set of all valid pillar values for fast lookup */
const VALID_PILLARS = new Set(Object.values(CVM193_PILLARS));

/** Set of all valid dimension values for fast lookup */
const VALID_DIMENSIONS = new Set(Object.values(CVM193_DIMENSIONS).flatMap((d) => Object.values(d)));

/** Set of all valid materiality level values for fast lookup */
const VALID_MATERIALITY = new Set(Object.values(MATERIALITY_LEVELS));

/**
 * Creates a CVM 193/2023 disclosure item (frozen).
 * Cria um item de divulgacao ESG imutavel conforme taxonomia CVM 193/2023.
 *
 * @param dimension - Dimension key (value from CVM193_DIMENSIONS)
 * @param pillar - Pillar key (value from CVM193_PILLARS)
 * @param opts - Item options
 * @returns Frozen disclosure item
 */
export function createDisclosureItem(
    dimension: string,
    pillar: string,
    opts: {
        description?: string;
        materialityLevel?: number;
        dataAvailable?: boolean;
        qualitative?: string | null;
        quantitative?: object | null;
    } = {},
): Readonly<object> {
    if (!VALID_PILLARS.has(pillar as any)) {
        throw new Error(`[CVM193] Invalid pillar: "${pillar}". Use CVM193_PILLARS values.`);
    }
    if (!VALID_DIMENSIONS.has(dimension as any)) {
        throw new Error(`[CVM193] Invalid dimension: "${dimension}". Use CVM193_DIMENSIONS values.`);
    }
    const {
        description = '',
        materialityLevel = MATERIALITY_LEVELS.NOT_MATERIAL,
        dataAvailable = false,
        qualitative = null,
        quantitative = null,
    } = opts;

    if (!VALID_MATERIALITY.has(materialityLevel as any)) {
        throw new Error(`[CVM193] Invalid materialityLevel: ${materialityLevel}. Use MATERIALITY_LEVELS values.`);
    }

    // UUID-like ID via canonical helper (generateId — runtime-injetável)
    const id = generateId('cvm193', 7);

    return Object.freeze({
        id,
        dimension,
        pillar,
        description,
        materialityLevel,
        dataAvailable: Boolean(dataAvailable),
        qualitative,
        quantitative,
        createdAt: new Date().toISOString(),
    });
}

/**
 * Assesses overall materiality across a set of disclosure items.
 * Avalia a materialidade agregada de um conjunto de itens de divulgacao.
 *
 * @param items - Array of disclosure items
 */
export function assessMateriality(items: Array<any>): {
    highCount: number;
    mediumCount: number;
    lowCount: number;
    notMaterialCount: number;
    materialityScore: number;
} {
    if (!Array.isArray(items) || items.length === 0) {
        return { highCount: 0, mediumCount: 0, lowCount: 0, notMaterialCount: 0, materialityScore: 0 };
    }

    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let notMaterialCount = 0;

    for (const item of items) {
        switch (item.materialityLevel) {
            case MATERIALITY_LEVELS.HIGH:
                highCount++;
                break;
            case MATERIALITY_LEVELS.MEDIUM:
                mediumCount++;
                break;
            case MATERIALITY_LEVELS.LOW:
                lowCount++;
                break;
            case MATERIALITY_LEVELS.NOT_MATERIAL:
                notMaterialCount++;
                break;
            default:
                notMaterialCount++;
                break;
        }
    }

    // Weighted average normalized to [0,1]: score = sum(level_i) / (3 * n)
    const totalWeight = items.reduce((sum, item) => sum + (item.materialityLevel ?? 0), 0);
    const materialityScore = totalWeight / (3 * items.length);

    return {
        highCount,
        mediumCount,
        lowCount,
        notMaterialCount,
        materialityScore,
    };
}

/**
 * Computes pillar-level and overall ESG scores from disclosure items.
 * Items without dataAvailable=true are excluded from pillar computation.
 * Overall uses non-compensatory geometric mean (floor 0.001 to avoid log(0)).
 * Calcula scores ESG por pilar e overall via media geometrica nao-compensatoria.
 *
 * @param items - Array of disclosure items
 */
export function computeEsgScore(items: Array<any>): { E: number; S: number; G: number; overall: number } {
    const zero = { E: 0, S: 0, G: 0, overall: 0 };
    if (!Array.isArray(items) || items.length === 0) return zero;

    // Group items with data available by pillar
    const byPillar: Record<string, number[]> = { environmental: [], social: [], governance: [] };
    for (const item of items) {
        if (item.dataAvailable && byPillar[item.pillar] !== undefined) {
            byPillar[item.pillar]!.push(item.materialityLevel);
        }
    }

    /**
     * Calcula score normalizado [0,1] para um array de materiality levels.
     *
     * @param items
     */
    const pillarScore = (levels: number[]): number => {
        if (levels.length === 0) return 0;
        const mean = levels.reduce((s, v) => s + v, 0) / levels.length;
        return mean / 3;
    };

    const E = pillarScore(byPillar.environmental!);
    const S = pillarScore(byPillar.social!);
    const G = pillarScore(byPillar.governance!);

    // Non-compensatory geometric mean: (E * S * G)^(1/3)
    // Floor at 0.001 to avoid log(0) when pillar has no data
    const eFloor = Math.max(E, 0.001);
    const sFloor = Math.max(S, 0.001);
    const gFloor = Math.max(G, 0.001);
    const overall = Math.pow(eFloor * sFloor * gFloor, 1 / 3);

    return { E, S, G, overall };
}

/**
 * Identifies disclosure gaps: material items without available data.
 * Identifica lacunas de divulgacao - itens materiais sem dados disponiveis.
 *
 * @param items - Array of disclosure items
 * @returns Items where dataAvailable=false and materialityLevel >= MEDIUM
 */
export function identifyGaps(items: Array<any>): Array<any> {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => !item.dataAvailable && item.materialityLevel >= MATERIALITY_LEVELS.MEDIUM);
}

/**
 * Builds a structured CVM 193/2023 disclosure report.
 * Gera relatorio estruturado de divulgacao ESG conforme CVM 193/2023.
 *
 * @param items - Array of disclosure items
 * @param companyName - Legal name of the reporting entity
 * @returns Structured disclosure report
 */
export function buildDisclosureReport(items: Array<any>, companyName: string = ''): object {
    const safeItems = Array.isArray(items) ? items : [];

    // Group by pillar
    const byPillar: Record<string, any[]> = {
        [CVM193_PILLARS.E]: [],
        [CVM193_PILLARS.S]: [],
        [CVM193_PILLARS.G]: [],
    };
    for (const item of safeItems) {
        if (byPillar[item.pillar] !== undefined) {
            byPillar[item.pillar]!.push(item);
        }
    }

    const esgScore = computeEsgScore(safeItems);
    const gaps = identifyGaps(safeItems);

    return {
        companyName,
        generatedAt: new Date().toISOString(),
        pillars: {
            E: byPillar[CVM193_PILLARS.E],
            S: byPillar[CVM193_PILLARS.S],
            G: byPillar[CVM193_PILLARS.G],
        },
        esgScore,
        gaps,
        totalItems: safeItems.length,
    };
}
