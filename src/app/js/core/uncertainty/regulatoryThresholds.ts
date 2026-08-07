// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   UNC-STRUCTURAL-001 gap #2 — Regulatory thresholds seed

   Subset of CONAMA 420/2009 (solo + água subterrânea) and CETESB
   DD-256/2016 (solo) reference values. Used by criticality_ratio()
   when the user has no explicit threshold in their workspace policy.

   Values are in mg/kg for soil and μg/L for groundwater (units
   declared per entry). Subset includes the most common contaminants
   in environmental investigation; Phase 4 expands to full 116 params.

   Schema:
     THRESHOLDS[parameter_id] = {
         label: string,
         unit: string,
         matrices: { soil?: {VR, VP, VI}, groundwater?: {VI} }
         source: 'CONAMA-420' | 'CETESB-DD-256'
     }

   VR = Valor de Referência (background)
   VP = Valor de Prevenção (monitoring required)
   VI = Valor de Intervenção (remediation required)
   ================================================================ */

type MatrixThreshold = { VR?: number; VP?: number; VI?: number; unit: string };
interface RegulatoryEntry {
    label: string;
    aliases: ReadonlyArray<string>;
    matrices: Record<string, MatrixThreshold>;
    source: string;
}

/**
 * Subset of most-common contaminants.
 * Source: CONAMA Resolution 420/2009 + CETESB DD-256/2016.
 * Unit convention: soil in mg/kg, groundwater in μg/L.
 */
export const REGULATORY_THRESHOLDS: Readonly<Record<string, RegulatoryEntry>> = Object.freeze({
    // ── METAIS - CONAMA 420 Anexo II ──
    arsenic: {
        label: 'Arsênio',
        aliases: ['As', 'arsenico', 'arsenio'],
        matrices: {
            soil: { VR: 3.5, VP: 15, VI: 35, unit: 'mg/kg' },
            groundwater: { VI: 10, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    cadmium: {
        label: 'Cádmio',
        aliases: ['Cd', 'cadmio'],
        matrices: {
            soil: { VR: 0.5, VP: 1.3, VI: 3, unit: 'mg/kg' },
            groundwater: { VI: 5, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    lead: {
        label: 'Chumbo',
        aliases: ['Pb', 'chumbo'],
        matrices: {
            soil: { VR: 17, VP: 72, VI: 180, unit: 'mg/kg' },
            groundwater: { VI: 10, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    copper: {
        label: 'Cobre',
        aliases: ['Cu', 'cobre'],
        matrices: {
            soil: { VR: 35, VP: 60, VI: 400, unit: 'mg/kg' },
            groundwater: { VI: 2000, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    chromium_total: {
        label: 'Cromo total',
        aliases: ['Cr', 'cromo', 'chromium'],
        matrices: {
            soil: { VR: 40, VP: 75, VI: 400, unit: 'mg/kg' },
            groundwater: { VI: 50, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    mercury: {
        label: 'Mercúrio',
        aliases: ['Hg', 'mercurio'],
        matrices: {
            soil: { VR: 0.05, VP: 0.5, VI: 12, unit: 'mg/kg' },
            groundwater: { VI: 1, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    nickel: {
        label: 'Níquel',
        aliases: ['Ni', 'niquel'],
        matrices: {
            soil: { VR: 13, VP: 30, VI: 130, unit: 'mg/kg' },
            groundwater: { VI: 20, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    zinc: {
        label: 'Zinco',
        aliases: ['Zn', 'zinco'],
        matrices: {
            soil: { VR: 60, VP: 300, VI: 2000, unit: 'mg/kg' },
            groundwater: { VI: 1050, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },

    // ── BTEX - CONAMA 420 Anexo II (aromáticos voláteis) ──
    benzene: {
        label: 'Benzeno',
        aliases: ['benzeno', 'C6H6'],
        matrices: {
            soil: { VP: 0.03, VI: 1.5, unit: 'mg/kg' },
            groundwater: { VI: 5, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    toluene: {
        label: 'Tolueno',
        aliases: ['tolueno'],
        matrices: {
            soil: { VP: 0.14, VI: 30, unit: 'mg/kg' },
            groundwater: { VI: 170, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    ethylbenzene: {
        label: 'Etilbenzeno',
        aliases: ['etilbenzeno'],
        matrices: {
            soil: { VP: 6.2, VI: 40, unit: 'mg/kg' },
            groundwater: { VI: 200, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
    xylenes: {
        label: 'Xilenos (total)',
        aliases: ['xileno', 'xilenos', 'xylene'],
        matrices: {
            soil: { VP: 0.13, VI: 25, unit: 'mg/kg' },
            groundwater: { VI: 300, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },

    // ── HIDROCARBONETOS - CETESB DD-256 ──
    tph: {
        label: 'TPH (hidrocarbonetos totais de petróleo)',
        aliases: ['TPH', 'htp', 'hidrocarbonetos'],
        matrices: {
            soil: { VI: 1000, unit: 'mg/kg' },
            groundwater: { VI: 1000, unit: 'μg/L' },
        },
        source: 'CETESB-DD-256',
    },

    // ── PAHs - CONAMA 420 subset ──
    benzo_a_pyrene: {
        label: 'Benzo(a)pireno',
        aliases: ['benzoapireno', 'bap'],
        matrices: {
            soil: { VP: 0.052, VI: 1.5, unit: 'mg/kg' },
            groundwater: { VI: 0.7, unit: 'μg/L' },
        },
        source: 'CONAMA-420',
    },
});

/**
 * Resolve regulatory thresholds for a parameter + matrix.
 * Accepts parameter_id (e.g. 'arsenic'), alias ('As'), or display label.
 * Case-insensitive.
 *
 * @param parameterQuery
 * @param matrix - 'soil' | 'groundwater' | 'surface_water' | 'air'
 */
export function resolveThreshold(
    parameterQuery: string,
    matrix: string = 'soil',
): (MatrixThreshold & { source: string; label: string }) | null {
    if (!parameterQuery || typeof parameterQuery !== 'string') return null;
    const q = parameterQuery.toLowerCase().trim();
    for (const [id, entry] of Object.entries(REGULATORY_THRESHOLDS)) {
        if (id === q) {
            return entry.matrices?.[matrix]
                ? { ...entry.matrices[matrix], source: entry.source, label: entry.label }
                : null;
        }
        if (entry.label.toLowerCase() === q) {
            return entry.matrices?.[matrix]
                ? { ...entry.matrices[matrix], source: entry.source, label: entry.label }
                : null;
        }
        if (Array.isArray(entry.aliases)) {
            for (const alias of entry.aliases) {
                if (alias.toLowerCase() === q) {
                    return entry.matrices?.[matrix]
                        ? { ...entry.matrices[matrix], source: entry.source, label: entry.label }
                        : null;
                }
            }
        }
    }
    return null;
}

/**
 * List all parameters with at least one matrix defined.
 */
export function listRegulatedParameters() {
    return Object.entries(REGULATORY_THRESHOLDS).map(([id, entry]) => ({
        id,
        label: entry.label,
        aliases: entry.aliases,
        matrices: Object.keys(entry.matrices),
        source: entry.source,
    }));
}

/**
 * Pick the most-restrictive threshold for decision-making.
 * VI (intervention) takes precedence over VP (prevention) over VR (reference).
 */
export function strictestThreshold(
    entry: { VR?: number; VP?: number; VI?: number } | null | undefined,
): number | null {
    if (!entry) return null;
    return entry.VI ?? entry.VP ?? entry.VR ?? null;
}
