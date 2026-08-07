// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   GWP — Global Warming Potential (GWP-100) tables
   ================================================================
   Tabela de potenciais de aquecimento global (horizonte 100 anos)
   conforme IPCC AR6 (2021), AR5 (2014), AR4 (2007) + AR3/TAR (2001)
   para auditoria histórica.

   GWP-100 factor: quanto CO2-eq corresponde a 1 tonelada do gás
   ao longo de 100 anos. CO2 = 1 (referência).

   ## Versão verbatim (Calvin diretiva 2026-06-03)

   Valores extraídos DIRETAMENTE dos PDFs primários IPCC:
   - AR6: Chapter 7 Suppl. Mat. Table 7.SM.7 (pp. 25-28)
     https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_Chapter_07_Supplementary_Material.pdf
   - AR5: Chapter 8 Appendix 8.A Table 8.A.1
     https://www.ipcc.ch/site/assets/uploads/2018/02/WG1AR5_Chapter08_FINAL.pdf
   - AR4: Chapter 2 Table 2.14 (cross-check via site IPCC arquivado
     https://archive.ipcc.ch/publications_and_data/ar4/wg1/en/ch2s2-10-2.html)
   - AR3 (TAR): WG1 Chapter 6 Table 6.7 (referencial histórico)

   Documentação completa: .runtime/research/ipcc-gwp/VERBATIM_2026-06-03.md
   Script de extração: .runtime/research/ipcc-gwp/parse_ar6_table.py

   ## Standard regulatório

   - Programa Brasileiro GHG Protocol v2026 adota AR6 default
   - ISO 14064-1:2018 recomenda usar o report mais recente
   - CETESB RPE aceita AR5/AR6
   - UNFCCC Decision 18/CMA.1 (2018) usa AR5 GWP-100 para Paris reporting

   ## Mudanças notáveis 2026-06-03 (verbatim PDF vs valores prévios)

   - SF6 AR6: 24300 → **25200** (+3.7%, Table 7.SM.7 verbatim)
   - HFC-152 AR6: 21 → 21.5 (+2.4%, era TODO)
   - HFC-161 AR6: 4 → 4.84 (+21%, era TODO)
   - HFC-245ca AR6: 716 → 787 (+9.9%, era TODO)
   - PFC-5-1-14 AR6: 9180 → 8620 (−6.1%, era TODO)
   - PFC-9-1-18 AR6: 7190 → 7480 (+4%, era TODO)
   - Demais TODOs removidos sem alteração de valor (já estavam corretos).

   @since v0.1.6
   @lastUpdated 2026-06-03 (verbatim audit Calvin)
   ================================================================ */

console.debug('[mod:load]', 'app/js/core/chemistry/gwp.ts');

// ----------------------------------------------------------------
// TYPES — GHG gases recognized by Programa Brasileiro GHG Protocol
// ----------------------------------------------------------------

/**
 * Recognized greenhouse gases (32 species).
 * Matches `docs/templates/domain-gee-ghg-br.json` enum.
 */
export type GhgGas =
    | 'CO2'
    | 'CH4'
    | 'N2O'
    // Hydrofluorocarbons (HFCs)
    | 'HFC-23'
    | 'HFC-32'
    | 'HFC-41'
    | 'HFC-125'
    | 'HFC-134'
    | 'HFC-134a'
    | 'HFC-143'
    | 'HFC-143a'
    | 'HFC-152'
    | 'HFC-152a'
    | 'HFC-161'
    | 'HFC-227ea'
    | 'HFC-236cb'
    | 'HFC-236ea'
    | 'HFC-236fa'
    | 'HFC-245ca'
    | 'HFC-245fa'
    | 'HFC-365mfc'
    | 'HFC-43-10mee'
    // Perfluorocarbons (PFCs) — nomenclatura UNFCCC herdada (formula = ground truth)
    | 'PFC-14' // CF4
    | 'PFC-116' // C2F6
    | 'PFC-218' // C3F8
    | 'PFC-318' // c-C4F8
    | 'PFC-3-1-10' // n-C4F10 (AR6 chama "PFC-31-10")
    | 'PFC-4-1-12' // n-C5F12 (AR6 chama "PFC-61-16")
    | 'PFC-5-1-14' // n-C6F14 (AR6 chama "PFC-51-14")
    | 'PFC-9-1-18' // n-C10F18 (AR6 chama "PFC-91-18")
    // Sulfur hexafluoride and nitrogen trifluoride
    | 'SF6'
    | 'NF3';

/** IPCC Assessment Report version. AR3 (TAR) é referencial histórico. */
export type GwpVersion = 'AR6' | 'AR5' | 'AR4' | 'AR3';

/** Metadata sobre a tabela GWP de cada versão IPCC. */
export interface GwpVersionMeta {
    readonly version: GwpVersion;
    /** Ano da publicação oficial. */
    readonly year: number;
    /** Citação curta (capítulo + tabela). */
    readonly citation: string;
    /** URL canônica do PDF primário. */
    readonly primarySourceUrl: string;
    /** Status regulatório. */
    readonly regulatoryStatus: 'current' | 'previous' | 'historical';
    /** Recomendação UI. */
    readonly recommendedFor: string;
}

export const GWP_VERSION_META: Readonly<Record<GwpVersion, GwpVersionMeta>> = Object.freeze({
    AR6: Object.freeze({
        version: 'AR6' as GwpVersion,
        year: 2021,
        citation: 'IPCC AR6 WG1 Ch.7 Suppl.Mat. Table 7.SM.7 (Forster et al., 2021)',
        primarySourceUrl:
            'https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_Chapter_07_Supplementary_Material.pdf',
        regulatoryStatus: 'current' as const,
        recommendedFor: 'Programa Brasileiro GHG Protocol v2026, ISO 14064-1:2018, novos inventários',
    }),
    AR5: Object.freeze({
        version: 'AR5' as GwpVersion,
        year: 2013,
        citation: 'IPCC AR5 WG1 Ch.8 Appendix 8.A Table 8.A.1 (Myhre et al., 2013)',
        primarySourceUrl: 'https://www.ipcc.ch/site/assets/uploads/2018/02/WG1AR5_Chapter08_FINAL.pdf',
        regulatoryStatus: 'previous' as const,
        recommendedFor: 'UNFCCC Paris Agreement (Decision 18/CMA.1), inventários nacionais NDC',
    }),
    AR4: Object.freeze({
        version: 'AR4' as GwpVersion,
        year: 2007,
        citation: 'IPCC AR4 WG1 Ch.2 Table 2.14 (Forster et al., 2007)',
        primarySourceUrl: 'https://www.ipcc.ch/pdf/assessment-report/ar4/wg1/ar4-wg1-chapter2.pdf',
        regulatoryStatus: 'previous' as const,
        recommendedFor: 'Kyoto Protocol commitment periods, inventários EU ETS pré-2024',
    }),
    AR3: Object.freeze({
        version: 'AR3' as GwpVersion,
        year: 2001,
        citation: 'IPCC TAR WG1 Ch.6 Table 6.7 (Ramaswamy et al., 2001)',
        primarySourceUrl: 'https://archive.ipcc.ch/ipccreports/tar/wg1/pdf/TAR-06.PDF',
        regulatoryStatus: 'historical' as const,
        recommendedFor: 'Auditoria retrospectiva pré-2008 (Kyoto Protocol primeiro período)',
    }),
});

// ----------------------------------------------------------------
// GWP-100 TABLES — IPCC AR6 / AR5 / AR4 / AR3
// Valores VERBATIM dos PDFs primários (ver VERBATIM_2026-06-03.md)
// ----------------------------------------------------------------

/**
 * GWP-100 (CO2-eq factors, 100-year time horizon) per IPCC report.
 *
 * AR6 (2021): valores extraídos de Table 7.SM.7 via pdfplumber + validação
 * manual cell-by-cell contra lifetime + rad. efficiency. SF6 = 25200 (verbatim;
 * substitui 24300 herdado de fonte secundária pré-2026-06-03).
 *
 * AR5 (2013): valores de Table 8.A.1 (Appendix 8.A Ch. 8). Programa Brasileiro
 * GHG Protocol v2026 cita-os como referência. Não-extraídos mecanicamente do PDF
 * (text-layer não-tabular); cross-validados contra US EPA reference table.
 *
 * AR4 (2007): valores de Table 2.14, cross-check contra site IPCC arquivado
 * (https://archive.ipcc.ch/publications_and_data/ar4/wg1/en/ch2s2-10-2.html).
 *
 * AR3/TAR (2001): valores de Table 6.7, referencial histórico para auditoria
 * pré-Kyoto. Vários HFCs/PFCs novos NÃO estavam em AR3 — usar 0 indica ausência
 * de valor IPCC (não confundir com GWP = 0).
 */
export const GWP_TABLE: Readonly<Record<GwpVersion, Readonly<Record<GhgGas, number>>>> = Object.freeze({
    AR6: Object.freeze({
        // Direct GHGs (Table 7.SM.7)
        CO2: 1,
        CH4: 27.9, // fossil-blended; AR6 fossil=29.8, biogenic=27.0 (Table 7.15 chem-adj)
        N2O: 273,
        // HFCs
        'HFC-23': 14600,
        'HFC-32': 771,
        'HFC-41': 135,
        'HFC-125': 3740,
        'HFC-134': 1260,
        'HFC-134a': 1530,
        'HFC-143': 364,
        'HFC-143a': 5810,
        'HFC-152': 21.5,
        'HFC-152a': 164,
        'HFC-161': 4.84,
        'HFC-227ea': 3600,
        'HFC-236cb': 1350,
        'HFC-236ea': 1500,
        'HFC-236fa': 8690,
        'HFC-245ca': 787,
        'HFC-245fa': 962,
        'HFC-365mfc': 914,
        'HFC-43-10mee': 1600,
        // PFCs (formula = ground truth; ver A2 em VERBATIM doc)
        'PFC-14': 7380, // CF4
        'PFC-116': 12400, // C2F6
        'PFC-218': 9290, // C3F8
        'PFC-318': 10200, // c-C4F8
        'PFC-3-1-10': 10000, // n-C4F10
        'PFC-4-1-12': 9220, // n-C5F12
        'PFC-5-1-14': 8620, // n-C6F14
        'PFC-9-1-18': 7480, // n-C10F18
        // High-GWP species
        SF6: 25200, // VERBATIM Table 7.SM.7 (substitui 24300 prévio)
        NF3: 17400,
    }),
    AR5: Object.freeze({
        // Direct GHGs (Table 8.A.1)
        CO2: 1,
        CH4: 28,
        N2O: 265,
        // HFCs — AR5 values
        'HFC-23': 12400,
        'HFC-32': 677,
        'HFC-41': 116,
        'HFC-125': 3170,
        'HFC-134': 1120,
        'HFC-134a': 1300,
        'HFC-143': 328,
        'HFC-143a': 4800,
        'HFC-152': 16,
        'HFC-152a': 138,
        'HFC-161': 4,
        'HFC-227ea': 3350,
        'HFC-236cb': 1210,
        'HFC-236ea': 1330,
        'HFC-236fa': 8060,
        'HFC-245ca': 716,
        'HFC-245fa': 858,
        'HFC-365mfc': 804,
        'HFC-43-10mee': 1650,
        // PFCs
        'PFC-14': 6630, // CF4
        'PFC-116': 11100, // C2F6
        'PFC-218': 8900, // C3F8
        'PFC-318': 9540, // c-C4F8
        'PFC-3-1-10': 9200,
        'PFC-4-1-12': 8550,
        'PFC-5-1-14': 7910,
        'PFC-9-1-18': 7190,
        // High-GWP species
        SF6: 23500,
        NF3: 16100,
    }),
    AR4: Object.freeze({
        // Direct GHGs (Table 2.14)
        CO2: 1,
        CH4: 25,
        N2O: 298,
        // HFCs — AR4 values
        'HFC-23': 14800,
        'HFC-32': 675,
        'HFC-41': 92,
        'HFC-125': 3500,
        'HFC-134': 1100,
        'HFC-134a': 1430,
        'HFC-143': 353,
        'HFC-143a': 4470,
        'HFC-152': 53,
        'HFC-152a': 124,
        'HFC-161': 12,
        'HFC-227ea': 3220,
        'HFC-236cb': 1340,
        'HFC-236ea': 1370,
        'HFC-236fa': 9810,
        'HFC-245ca': 693,
        'HFC-245fa': 1030,
        'HFC-365mfc': 794,
        'HFC-43-10mee': 1640,
        // PFCs
        'PFC-14': 7390, // CF4
        'PFC-116': 12200, // C2F6
        'PFC-218': 8830, // C3F8
        'PFC-318': 10300, // c-C4F8
        'PFC-3-1-10': 8860,
        'PFC-4-1-12': 9160,
        'PFC-5-1-14': 9300,
        'PFC-9-1-18': 7500, // Table 2.14 reporta ">7,500" — usamos lower bound
        // High-GWP species
        SF6: 22800,
        NF3: 17200,
    }),
    AR3: Object.freeze({
        // AR3/TAR Table 6.7 (2001) — referencial histórico.
        // 0 indica AUSÊNCIA do gás na tabela TAR (não confundir com GWP = 0).
        CO2: 1,
        CH4: 23, // TAR Ch.6 §6.12.2
        N2O: 296,
        // HFCs presentes em TAR
        'HFC-23': 12000,
        'HFC-32': 550,
        'HFC-41': 97,
        'HFC-125': 3400,
        'HFC-134': 1100,
        'HFC-134a': 1300,
        'HFC-143': 330,
        'HFC-143a': 4300,
        'HFC-152': 0, // ausente em TAR Ch.6 Table 6.7
        'HFC-152a': 120,
        'HFC-161': 12,
        'HFC-227ea': 3500,
        'HFC-236cb': 1300,
        'HFC-236ea': 1200,
        'HFC-236fa': 9400,
        'HFC-245ca': 640,
        'HFC-245fa': 950, // listado em TAR errata extension
        'HFC-365mfc': 890, // listado em TAR addendum
        'HFC-43-10mee': 1500,
        // PFCs
        'PFC-14': 5700, // CF4
        'PFC-116': 11900, // C2F6
        'PFC-218': 8600, // C3F8
        'PFC-318': 10000, // c-C4F8
        'PFC-3-1-10': 8600,
        'PFC-4-1-12': 8900,
        'PFC-5-1-14': 9000,
        'PFC-9-1-18': 7500,
        // High-GWP species
        SF6: 22200,
        NF3: 10800,
    }),
});

/**
 * Set of all recognized gas identifiers, kept in sync with GWP_TABLE.
 */
const GHG_GAS_SET: ReadonlySet<string> = new Set<string>(Object.keys(GWP_TABLE.AR6));

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Returns the GWP-100 factor for a gas in a given IPCC report version.
 *
 * @param gas - GHG gas identifier
 * @param version - IPCC report version: 'AR6' (default), 'AR5', 'AR4', or 'AR3'
 * @returns GWP-100 factor; returns 1 (CO2 baseline) if gas unknown for safety.
 *          Returns 0 indicates gas NOT present in that AR version (audit signal).
 *
 * @example
 *   getGwp('CH4');           // 27.9 (AR6 default)
 *   getGwp('SF6', 'AR4');    // 22800
 *   getGwp('HFC-152', 'AR3'); // 0 (ausente em TAR Table 6.7)
 */
export function getGwp(gas: GhgGas, version: GwpVersion = 'AR6'): number {
    const table = GWP_TABLE[version];
    if (!table) return 1;
    const factor = table[gas];
    if (typeof factor !== 'number' || !Number.isFinite(factor)) {
        return 1;
    }
    return factor;
}

/**
 * Returns metadata about a given IPCC version (citation, URL, regulatory status).
 *
 * @example
 *   getGwpVersionMeta('AR6').citation
 *   // "IPCC AR6 WG1 Ch.7 Suppl.Mat. Table 7.SM.7 (Forster et al., 2021)"
 */
export function getGwpVersionMeta(version: GwpVersion): GwpVersionMeta {
    return GWP_VERSION_META[version];
}

/** Returns list of all IPCC versions available (UI dropdown). */
export function listGwpVersions(): readonly GwpVersion[] {
    return Object.keys(GWP_VERSION_META) as GwpVersion[];
}

/**
 * Converts a raw emission to CO2-equivalent using GWP-100.
 *
 * @param emission - Raw emission value (e.g. tonnes of the specific gas)
 * @param gas - GHG gas identifier
 * @param version - IPCC GWP-100 version (default 'AR6')
 * @returns CO2-equivalent in the same mass unit as input.
 *
 * @example
 *   toCo2eq(10, 'CH4');         // 279 (10 t CH4 = 279 tCO2-eq AR6)
 *   toCo2eq(0.5, 'SF6', 'AR6'); // 12600 (verbatim Table 7.SM.7)
 */
export function toCo2eq(emission: number, gas: GhgGas, version: GwpVersion = 'AR6'): number {
    if (!Number.isFinite(emission)) {
        return 0;
    }
    return emission * getGwp(gas, version);
}

/**
 * Type guard — validates if string is recognized {@link GhgGas} identifier.
 */
export function isGhgGas(s: unknown): s is GhgGas {
    return typeof s === 'string' && GHG_GAS_SET.has(s);
}

/** Returns list of all recognized gas identifiers. */
export function listGhgGases(): readonly GhgGas[] {
    return Object.keys(GWP_TABLE.AR6) as GhgGas[];
}
