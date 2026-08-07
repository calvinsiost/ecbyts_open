/**
 * ecbyts - Global Regulatory Thresholds Database
 * 11 jurisdictions x 10 CAS substances (groundwater matrix)
 *
 * Sources: EPA 40 CFR 141, EU DWD 2020/2184, WHO GDWQ 4th ed.,
 * CCME 2021, ANZECC/NHMRC 2022, Japan MOE 2021, China GB/T 14848-2017,
 * India BIS 10500:2012, UK SI 2018/614, CONAMA 420/2009,
 * CETESB DD 256/2016 (Sao Paulo state — Valores Orientadores)
 *
 * All values in ug/L (micrograms per liter) for groundwater.
 * Unit conversion handled by caller via core/units/converter.js.
 *
 * @license AGPL-3.0-only
 */

interface ThresholdEntry {
    type: string;
    value: number;
    matrix: string;
    unit: string;
    severity: string;
    source: string;
    jurisdiction: string;
    meta: Record<string, unknown>;
}

// ── Jurisdiction Registry ─────────────────────────────────────────────────────

export const JURISDICTIONS = Object.freeze({
    BR_CONAMA: {
        id: 'BR_CONAMA',
        name: 'Brazil — CONAMA 420/2009',
        region: 'South America',
        flag: 'BR',
        matrixLabel: 'Valor de Intervencao (VI)',
        citation: 'Resolucao CONAMA n. 420, 28 dez. 2009. DOU.',
        effectiveDate: '2009-12-30',
    },
    BR_CETESB: {
        id: 'BR_CETESB',
        name: 'Brazil/SP — CETESB DD 256/2016',
        region: 'South America',
        flag: 'BR',
        matrixLabel: 'Valor de Intervencao (VI)',
        citation: 'CETESB. Decisao de Diretoria n. 256/2016/E, 22 nov. 2016. Valores Orientadores para Solos e Aguas Subterraneas no Estado de Sao Paulo.',
        effectiveDate: '2016-11-24',
    },
    US_EPA: {
        id: 'US_EPA',
        name: 'USA — EPA MCLs (40 CFR 141)',
        region: 'North America',
        flag: 'US',
        matrixLabel: 'Maximum Contaminant Level (MCL)',
        citation: 'National Primary Drinking Water Regulations, 40 CFR 141.62',
        effectiveDate: '2024-04-26',
    },
    EU_DWD: {
        id: 'EU_DWD',
        name: 'EU — Drinking Water Directive 2020/2184',
        region: 'Europe',
        flag: 'EU',
        matrixLabel: 'Parametric Value',
        citation: 'Directive (EU) 2020/2184, Annex I Part B',
        effectiveDate: '2023-01-12',
    },
    WHO: {
        id: 'WHO',
        name: 'WHO — GDWQ 4th ed.',
        region: 'International',
        flag: 'WHO',
        matrixLabel: 'Guideline Value',
        citation: 'Guidelines for Drinking-water Quality, 4th ed. + 1st addendum, 2017',
        effectiveDate: '2017-01-01',
    },
    CA_CCME: {
        id: 'CA_CCME',
        name: 'Canada — CCME Guidelines',
        region: 'North America',
        flag: 'CA',
        matrixLabel: 'Canadian Drinking Water Quality Guideline (MAC)',
        citation: 'Guidelines for Canadian Drinking Water Quality, 2020 update',
        effectiveDate: '2020-01-01',
    },
    AU_ADWG: {
        id: 'AU_ADWG',
        name: 'Australia — ADWG (NHMRC)',
        region: 'Oceania',
        flag: 'AU',
        matrixLabel: 'Health Guideline Value',
        citation: 'Australian Drinking Water Guidelines, NHMRC/NRMMC 2011, updated 2022',
        effectiveDate: '2022-01-01',
    },
    JP_EQS: {
        id: 'JP_EQS',
        name: 'Japan — Environmental Quality Standards',
        region: 'Asia',
        flag: 'JP',
        matrixLabel: 'Environmental Quality Standard',
        citation: 'Environmental Quality Standards for Groundwater, MOE, 2021',
        effectiveDate: '2021-04-01',
    },
    CN_GB: {
        id: 'CN_GB',
        name: 'China — GB/T 14848-2017',
        region: 'Asia',
        flag: 'CN',
        matrixLabel: 'Class III Standard',
        citation: 'GB/T 14848-2017 Standard for Groundwater Quality',
        effectiveDate: '2018-05-01',
    },
    IN_BIS: {
        id: 'IN_BIS',
        name: 'India — BIS 10500:2012',
        region: 'Asia',
        flag: 'IN',
        matrixLabel: 'Acceptable Limit',
        citation: 'IS 10500:2012 Indian Standard Drinking Water Specification',
        effectiveDate: '2012-06-01',
    },
    UK_EQS: {
        id: 'UK_EQS',
        name: 'UK — Water Quality Regulations 2018',
        region: 'Europe',
        flag: 'UK',
        matrixLabel: 'Prescribed Concentration or Value (PCV)',
        citation: 'Water Supply (Water Quality) Regulations 2018, SI 2018/614, Schedule 1',
        effectiveDate: '2018-07-01',
    },
});

/** Ordered list of jurisdiction IDs for consistent display */
export const JURISDICTION_ORDER = Object.freeze([
    'BR_CONAMA',
    'BR_CETESB',
    'US_EPA',
    'EU_DWD',
    'WHO',
    'CA_CCME',
    'AU_ADWG',
    'JP_EQS',
    'CN_GB',
    'IN_BIS',
    'UK_EQS',
]);

// ── Global Thresholds Database ────────────────────────────────────────────────
// All values: groundwater, µg/L
// null = jurisdiction does not regulate this substance

/**
 * Factory for a ThresholdEntry on the groundwater matrix.
 */
const _t = (jurisdiction: string, value: number, source: string, type = 'standard'): ThresholdEntry => ({
    type,
    value,
    matrix: 'groundwater',
    unit: 'ug_L',
    severity: 'intervention',
    source,
    jurisdiction,
    meta: {},
});

export const GLOBAL_THRESHOLDS = Object.freeze({
    // ── Benzene (CAS 71-43-2) - BTEX ──────────────────────────────────────
    '71-43-2': [
        _t('BR_CONAMA', 5, 'CONAMA 420/2009 Anexo II', 'vi'),
        _t('BR_CETESB', 5, 'CETESB DD 256/2016 Anexo Unico', 'vi'),
        _t('US_EPA', 5, 'EPA 40 CFR 141.62', 'mcl'),
        _t('EU_DWD', 1, 'EU 2020/2184 Annex I Part B', 'parametric_value'),
        _t('WHO', 10, 'WHO GDWQ 4th ed. p.342', 'guideline'),
        _t('CA_CCME', 5, 'GCDWQ — Benzene, 2009', 'mac'),
        _t('AU_ADWG', 1, 'ADWG 2022, Table 10.5', 'guideline'),
        _t('JP_EQS', 10, 'MOE EQS Groundwater, 2021', 'eqs'),
        _t('CN_GB', 10, 'GB/T 14848-2017 Class III', 'standard'),
        _t('IN_BIS', 10, 'BIS 10500:2012 Table 2 (relaxed)', 'standard'),
        _t('UK_EQS', 1, 'SI 2018/614 Schedule 1', 'pcv'),
    ],

    // ── Toluene (CAS 108-88-3) - BTEX ─────────────────────────────────────
    '108-88-3': [
        _t('BR_CONAMA', 700, 'CONAMA 420/2009 Anexo II', 'vi'),
        _t('BR_CETESB', 700, 'CETESB DD 256/2016 Anexo Unico', 'vi'),
        _t('US_EPA', 1000, 'EPA 40 CFR 141.62', 'mcl'),
        // EU: no specific parametric value for toluene in DWD 2020/2184
        _t('WHO', 700, 'WHO GDWQ 4th ed. p.437', 'guideline'),
        _t('CA_CCME', 60, 'GCDWQ — Toluene, 2014 (AO)', 'mac'),
        _t('AU_ADWG', 800, 'ADWG 2022, Table 10.5', 'guideline'),
        // JP: no specific EQS for toluene
        _t('CN_GB', 700, 'GB/T 14848-2017 Class III', 'standard'),
        // IN: no specific standard for toluene
        // UK: no specific PCV for toluene
    ],

    // ── Ethylbenzene (CAS 100-41-4) - BTEX ────────────────────────────────
    '100-41-4': [
        _t('BR_CONAMA', 300, 'CONAMA 420/2009 Anexo II', 'vi'),
        _t('BR_CETESB', 300, 'CETESB DD 256/2016 Anexo Unico', 'vi'),
        _t('US_EPA', 700, 'EPA 40 CFR 141.62', 'mcl'),
        // EU: no specific parametric value
        _t('WHO', 300, 'WHO GDWQ 4th ed. p.370', 'guideline'),
        // CA: aesthetic objective only
        _t('AU_ADWG', 300, 'ADWG 2022, Table 10.5', 'guideline'),
        // JP: no specific EQS
        _t('CN_GB', 300, 'GB/T 14848-2017 Class III', 'standard'),
        // IN, UK: no specific standard
    ],

    // ── Xylenes (CAS 1330-20-7) - BTEX ───────────────────────────────────
    '1330-20-7': [
        _t('BR_CONAMA', 500, 'CONAMA 420/2009 Anexo II', 'vi'),
        _t('BR_CETESB', 500, 'CETESB DD 256/2016 Anexo Unico', 'vi'),
        _t('US_EPA', 10000, 'EPA 40 CFR 141.62', 'mcl'),
        // EU: no specific parametric value
        _t('WHO', 500, 'WHO GDWQ 4th ed. p.449', 'guideline'),
        // CA: aesthetic objective only
        _t('AU_ADWG', 600, 'ADWG 2022, Table 10.5', 'guideline'),
        // JP: no specific EQS
        _t('CN_GB', 500, 'GB/T 14848-2017 Class III', 'standard'),
        // IN, UK: no specific standard
    ],

    // ── Arsenic (CAS 7440-38-2) - Metal ──────────────────────────────────
    '7440-38-2': [
        _t('BR_CONAMA', 10, 'CONAMA 396/2008', 'vi'),
        _t('BR_CETESB', 10, 'CETESB DD 256/2016 Anexo Unico', 'vi'),
        _t('US_EPA', 10, 'EPA 40 CFR 141.62', 'mcl'),
        _t('EU_DWD', 10, 'EU 2020/2184 Annex I Part B', 'parametric_value'),
        _t('WHO', 10, 'WHO GDWQ 4th ed. p.315', 'guideline'),
        _t('CA_CCME', 10, 'GCDWQ — Arsenic, 2006', 'mac'),
        _t('AU_ADWG', 10, 'ADWG 2022, Table 10.2', 'guideline'),
        _t('JP_EQS', 10, 'MOE EQS Groundwater, 2021', 'eqs'),
        _t('CN_GB', 10, 'GB/T 14848-2017 Class III', 'standard'),
        _t('IN_BIS', 50, 'BIS 10500:2012 Table 2 (relaxed)', 'standard'),
        _t('UK_EQS', 10, 'SI 2018/614 Schedule 1', 'pcv'),
    ],

    // ── Lead (CAS 7439-92-1) - Metal ─────────────────────────────────────
    '7439-92-1': [
        _t('BR_CONAMA', 10, 'CONAMA 396/2008', 'vi'),
        _t('BR_CETESB', 10, 'CETESB DD 256/2016 Anexo Unico', 'vi'),
        _t('US_EPA', 15, 'EPA Lead and Copper Rule (action level)', 'mcl'),
        _t('EU_DWD', 10, 'EU 2020/2184 Annex I Part B (from 2036: 5)', 'parametric_value'),
        _t('WHO', 10, 'WHO GDWQ 4th ed. p.384', 'guideline'),
        _t('CA_CCME', 10, 'GCDWQ — Lead, 2019', 'mac'),
        _t('AU_ADWG', 10, 'ADWG 2022, Table 10.2', 'guideline'),
        _t('JP_EQS', 10, 'MOE EQS Groundwater, 2021', 'eqs'),
        _t('CN_GB', 10, 'GB/T 14848-2017 Class III', 'standard'),
        _t('IN_BIS', 10, 'BIS 10500:2012 Table 1', 'standard'),
        _t('UK_EQS', 10, 'SI 2018/614 Schedule 1', 'pcv'),
    ],

    // ── Cadmium (CAS 7440-43-9) - Metal ──────────────────────────────────
    '7440-43-9': [
        _t('BR_CONAMA', 5, 'CONAMA 396/2008', 'vi'),
        _t('BR_CETESB', 5, 'CETESB DD 256/2016 Anexo Unico', 'vi'),
        _t('US_EPA', 5, 'EPA 40 CFR 141.62', 'mcl'),
        _t('EU_DWD', 5, 'EU 2020/2184 Annex I Part B', 'parametric_value'),
        _t('WHO', 3, 'WHO GDWQ 4th ed. p.327', 'guideline'),
        _t('CA_CCME', 5, 'GCDWQ — Cadmium, 2020', 'mac'),
        _t('AU_ADWG', 2, 'ADWG 2022, Table 10.2', 'guideline'),
        _t('JP_EQS', 10, 'MOE EQS Groundwater, 2021', 'eqs'),
        _t('CN_GB', 5, 'GB/T 14848-2017 Class III', 'standard'),
        _t('IN_BIS', 3, 'BIS 10500:2012 Table 1', 'standard'),
        _t('UK_EQS', 5, 'SI 2018/614 Schedule 1', 'pcv'),
    ],

    // ── Chromium VI (CAS 18540-29-9) - Metal ─────────────────────────────
    '18540-29-9': [
        _t('BR_CONAMA', 50, 'CONAMA 396/2008', 'vi'),
        _t('US_EPA', 100, 'EPA 40 CFR 141.62 (total Cr)', 'mcl'),
        _t('EU_DWD', 25, 'EU 2020/2184 Annex I Part B (Cr VI specific, from 2036)', 'parametric_value'),
        _t('WHO', 50, 'WHO GDWQ 4th ed. p.340 (total Cr)', 'guideline'),
        _t('CA_CCME', 50, 'GCDWQ — Chromium, 2018 (total Cr)', 'mac'),
        _t('AU_ADWG', 50, 'ADWG 2022, Table 10.2 (total Cr)', 'guideline'),
        _t('JP_EQS', 50, 'MOE EQS Groundwater, 2021 (total Cr)', 'eqs'),
        _t('CN_GB', 50, 'GB/T 14848-2017 Class III (Cr VI)', 'standard'),
        _t('IN_BIS', 50, 'BIS 10500:2012 Table 1 (Cr total)', 'standard'),
        _t('UK_EQS', 50, 'SI 2018/614 Schedule 1 (total Cr)', 'pcv'),
    ],

    // ── Mercury (CAS 7439-97-6) - Metal ──────────────────────────────────
    '7439-97-6': [
        _t('BR_CONAMA', 1, 'CONAMA 396/2008', 'vi'),
        _t('BR_CETESB', 1, 'CETESB DD 256/2016 Anexo Unico', 'vi'),
        _t('US_EPA', 2, 'EPA 40 CFR 141.62', 'mcl'),
        _t('EU_DWD', 1, 'EU 2020/2184 Annex I Part B', 'parametric_value'),
        _t('WHO', 6, 'WHO GDWQ 4th ed. p.390', 'guideline'),
        _t('CA_CCME', 1, 'GCDWQ — Mercury, 2014', 'mac'),
        _t('AU_ADWG', 1, 'ADWG 2022, Table 10.2', 'guideline'),
        _t('JP_EQS', 0.5, 'MOE EQS Groundwater, 2021', 'eqs'),
        _t('CN_GB', 1, 'GB/T 14848-2017 Class III', 'standard'),
        _t('IN_BIS', 1, 'BIS 10500:2012 Table 1', 'standard'),
        _t('UK_EQS', 1, 'SI 2018/614 Schedule 1', 'pcv'),
    ],

    // ── Naphthalene (CAS 91-20-3) - PAH ──────────────────────────────────
    '91-20-3': [
        _t('BR_CONAMA', 60, 'CONAMA 420/2009 Anexo II', 'vi'),
        _t('BR_CETESB', 60, 'CETESB DD 256/2016 Anexo Unico', 'vi'),
        // US EPA: no specific MCL for naphthalene (non-enforceable HA only)
        // EU: regulated under total PAHs, not individually
        // WHO: no specific guideline
        // CA: no specific MAC
        _t('AU_ADWG', 16, 'ADWG 2022 — derived from health guideline', 'guideline'),
        // JP, CN, IN, UK: no individual naphthalene standard
    ],
});

// ── Lookup Functions ──────────────────────────────────────────────────────────

/**
 * Internal accessor that returns the entries for a CAS as a typed array,
 * or an empty array if the key is not present.
 */
function _entriesFor(cas: string): ReadonlyArray<ThresholdEntry> {
    const all = GLOBAL_THRESHOLDS as Record<string, ReadonlyArray<ThresholdEntry>>;
    return all[cas] || [];
}

/**
 * Get all jurisdiction IDs that have a threshold for a CAS + matrix.
 */
export function getJurisdictionsForCAS(cas: string, matrix = 'groundwater'): string[] {
    const entries = _entriesFor(cas);
    if (entries.length === 0) return [];
    return entries.filter((e) => e.matrix === matrix).map((e) => e.jurisdiction);
}

/**
 * Get the most stringent (lowest) threshold worldwide for a CAS + matrix.
 */
export function getMostStringentThreshold(
    cas: string,
    matrix = 'groundwater',
): { jurisdiction: string; value: number; unit: string; source: string } | null {
    const entries = _entriesFor(cas);
    if (entries.length === 0) return null;

    const filtered = entries.filter((e) => e.matrix === matrix);
    if (filtered.length === 0) return null;

    let min: ThresholdEntry = filtered[0] as ThresholdEntry;
    for (let i = 1; i < filtered.length; i++) {
        const candidate = filtered[i] as ThresholdEntry;
        if (candidate.value < min.value) min = candidate;
    }

    return {
        jurisdiction: min.jurisdiction,
        value: min.value,
        unit: min.unit,
        source: min.source,
    };
}
