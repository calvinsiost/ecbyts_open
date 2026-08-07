// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Parâmetros Físico-Químicos das SQIs — base CETESB V 4.00 (mar/2026).
// Réplica oficial dos valores da aba FisQui das planilhas .xlsm; valores
// originais USEPA Regional Screening Levels (RSL). Manual §5.3.
//
// Subset mínimo: 20 SQIs canônicas do ADR-A5 (gate spreadsheet-parity).
// Faltantes documentados com TODO para futura ratificação contra Anexo D.
//
// IMPORTANTE: Object.freeze (ADR-A2). Acesso somente via getFisQui(cas).
//
// SPEC: CETESB-RISK-001 RF-1.2

/** Parâmetros físico-químicos de uma SQI (Substância Química de Interesse). */
export interface FisQuiEntry {
    /** Nome canônico para UI/relatório. */
    readonly name: string;
    /** Grupo químico (BTEX/Cloroaromático/PAH/Metal/etc.) */
    readonly group: 'BTEX' | 'Cloroaromático' | 'PAH' | 'Metal' | 'Metaloide' | 'Mistura';
    /** PM — Peso Molecular (g/mol) */
    readonly PM: number;
    /** H — Constante de Henry adimensional a 25°C */
    readonly H: number;
    /** Koc — Coeficiente de partição carbono orgânico/água (L/kg) */
    readonly Koc: number | null;
    /** Log Kow — Logaritmo do coef. de partição octanol/água */
    readonly logKow: number | null;
    /** S — Solubilidade em água (mg/L) */
    readonly S: number | null;
    /** Da — Coeficiente de difusão no ar (cm²/s) */
    readonly Da: number;
    /** Dw — Coeficiente de difusão na água (cm²/s) */
    readonly Dw: number;
    /** Classe: orgânico (calcula Kd via Koc) vs inorgânico (Kd fixo) */
    readonly isOrganic: boolean;
    /** Carcinogenicidade USEPA */
    readonly carcinogenic: boolean;
}

/**
 * Base de SQIs canônicas — 20 substâncias do ADR-A5 (gate spreadsheet-parity).
 * Valores extraídos de USEPA RSL (referência primária do Manual §5.3).
 *
 * Fontes:
 * - USEPA Regional Screening Levels (RSL) — May 2024 release
 * - USEPA IRIS (Integrated Risk Information System)
 * - CETESB DD 256/2016 Anexo Único — referência cruzada
 *
 * ATENÇÃO: valores aqui são SNAPSHOT preliminar. Ratificar contra aba FisQui
 * das planilhas .xlsm V 4.00 antes do parity gate ficar ≤1% (ADR-A5).
 */
export const FISQUI: Readonly<Record<string, FisQuiEntry>> = Object.freeze({
    // BTEX --------------------------------------------------------------------
    '71-43-2': Object.freeze({
        name: 'Benzeno',
        group: 'BTEX',
        PM: 78.11,
        H: 0.228,
        Koc: 146.0,
        logKow: 2.13,
        S: 1790.0,
        Da: 0.088,
        Dw: 9.8e-6,
        isOrganic: true,
        carcinogenic: true,
    }),
    '108-88-3': Object.freeze({
        name: 'Tolueno',
        group: 'BTEX',
        PM: 92.14,
        H: 0.272,
        Koc: 234.0,
        logKow: 2.73,
        S: 526.0,
        Da: 0.087,
        Dw: 8.6e-6,
        isOrganic: true,
        carcinogenic: false,
    }),
    '100-41-4': Object.freeze({
        name: 'Etilbenzeno',
        group: 'BTEX',
        PM: 106.17,
        H: 0.323,
        Koc: 446.0,
        logKow: 3.15,
        S: 169.0,
        Da: 0.075,
        Dw: 7.8e-6,
        isOrganic: true,
        carcinogenic: true,
    }),
    '1330-20-7': Object.freeze({
        name: 'Xilenos (totais)',
        group: 'BTEX',
        PM: 106.17,
        H: 0.271,
        Koc: 363.0,
        logKow: 3.15,
        S: 173.0,
        Da: 0.078,
        Dw: 7.8e-6,
        isOrganic: true,
        carcinogenic: false,
    }),
    // Cloroaromáticos ---------------------------------------------------------
    '79-01-6': Object.freeze({
        name: 'Tricloroetileno (TCE)',
        group: 'Cloroaromático',
        PM: 131.39,
        H: 0.403,
        Koc: 60.7,
        logKow: 2.42,
        S: 1100.0,
        Da: 0.079,
        Dw: 9.1e-6,
        isOrganic: true,
        carcinogenic: true,
    }),
    '127-18-4': Object.freeze({
        name: 'Tetracloroetileno (PCE)',
        group: 'Cloroaromático',
        PM: 165.83,
        H: 0.724,
        Koc: 155.0,
        logKow: 3.4,
        S: 200.0,
        Da: 0.072,
        Dw: 8.2e-6,
        isOrganic: true,
        carcinogenic: true,
    }),
    '75-09-2': Object.freeze({
        name: 'Diclorometano',
        group: 'Cloroaromático',
        PM: 84.93,
        H: 0.133,
        Koc: 21.6,
        logKow: 1.25,
        S: 13000.0,
        Da: 0.101,
        Dw: 1.17e-5,
        isOrganic: true,
        carcinogenic: true,
    }),
    '75-01-4': Object.freeze({
        name: 'Cloreto de vinila',
        group: 'Cloroaromático',
        PM: 62.5,
        H: 1.137,
        Koc: 18.6,
        logKow: 1.62,
        S: 8800.0,
        Da: 0.106,
        Dw: 1.23e-5,
        isOrganic: true,
        carcinogenic: true,
    }),
    // PAH ---------------------------------------------------------------------
    '91-20-3': Object.freeze({
        name: 'Naftaleno',
        group: 'PAH',
        PM: 128.17,
        H: 0.0198,
        Koc: 1191.0,
        logKow: 3.3,
        S: 31.0,
        Da: 0.059,
        Dw: 7.5e-6,
        isOrganic: true,
        carcinogenic: true,
    }),
    '50-32-8': Object.freeze({
        name: 'Benzo(a)pireno',
        group: 'PAH',
        PM: 252.31,
        H: 1.87e-5,
        Koc: 968774.0,
        logKow: 6.13,
        S: 0.00162,
        Da: 0.043,
        Dw: 5.7e-6,
        isOrganic: true,
        carcinogenic: true,
    }),
    // Metais ------------------------------------------------------------------
    '7440-43-9': Object.freeze({
        name: 'Cádmio',
        group: 'Metal',
        PM: 112.4,
        H: 0,
        Koc: null,
        logKow: null,
        S: null,
        Da: 0,
        Dw: 0,
        isOrganic: false,
        carcinogenic: true,
    }),
    '7440-50-8': Object.freeze({
        name: 'Cobre',
        group: 'Metal',
        PM: 63.55,
        H: 0,
        Koc: null,
        logKow: null,
        S: null,
        Da: 0,
        Dw: 0,
        isOrganic: false,
        carcinogenic: false,
    }),
    '7439-92-1': Object.freeze({
        name: 'Chumbo',
        group: 'Metal',
        PM: 207.2,
        H: 0,
        Koc: null,
        logKow: null,
        S: null,
        Da: 0,
        Dw: 0,
        isOrganic: false,
        carcinogenic: true,
    }),
    '7439-97-6': Object.freeze({
        name: 'Mercúrio',
        group: 'Metal',
        PM: 200.59,
        H: 0.467,
        Koc: null,
        logKow: null,
        S: null,
        Da: 0.0307,
        Dw: 6.3e-6,
        isOrganic: false,
        carcinogenic: false,
    }),
    '7440-02-0': Object.freeze({
        name: 'Níquel',
        group: 'Metal',
        PM: 58.69,
        H: 0,
        Koc: null,
        logKow: null,
        S: null,
        Da: 0,
        Dw: 0,
        isOrganic: false,
        carcinogenic: true,
    }),
    '7440-66-6': Object.freeze({
        name: 'Zinco',
        group: 'Metal',
        PM: 65.38,
        H: 0,
        Koc: null,
        logKow: null,
        S: null,
        Da: 0,
        Dw: 0,
        isOrganic: false,
        carcinogenic: false,
    }),
    '7440-47-3': Object.freeze({
        name: 'Cromo (total)',
        group: 'Metal',
        PM: 52.0,
        H: 0,
        Koc: null,
        logKow: null,
        S: null,
        Da: 0,
        Dw: 0,
        isOrganic: false,
        carcinogenic: true,
    }),
    // Metalóide ---------------------------------------------------------------
    '7440-38-2': Object.freeze({
        name: 'Arsênio',
        group: 'Metaloide',
        PM: 74.92,
        H: 0,
        Koc: null,
        logKow: null,
        S: null,
        Da: 0,
        Dw: 0,
        isOrganic: false,
        carcinogenic: true,
    }),
    // Misturas ----------------------------------------------------------------
    '8001-58-9': Object.freeze({
        name: 'Creosoto',
        group: 'Mistura',
        PM: 200.0, // valor médio TODO ratificar Anexo D
        H: 1.0e-3,
        Koc: 5000.0,
        logKow: 4.5,
        S: 10.0,
        Da: 0.05,
        Dw: 6.0e-6,
        isOrganic: true,
        carcinogenic: true,
    }),
    '8002-05-9': Object.freeze({
        name: 'Petróleo (TPH)',
        group: 'Mistura',
        PM: 170.0, // valor médio C10-C16 — TODO ratificar Anexo D
        H: 0.05,
        Koc: 1000.0,
        logKow: 3.5,
        S: 5.0,
        Da: 0.07,
        Dw: 7.0e-6,
        isOrganic: true,
        carcinogenic: false,
    }),
});

/** Retorna entry FISQUI por CAS. */
export function getFisQui(cas: string): Readonly<FisQuiEntry> | undefined {
    if (typeof cas !== 'string') return undefined;
    return FISQUI[cas.trim()];
}

/** Lista todos os CAS conhecidos. */
export function listKnownCas(): ReadonlyArray<string> {
    return Object.freeze(Object.keys(FISQUI));
}

/** Source string para auditoria. */
export const FISQUI_SOURCE = 'CETESB DD 103/2007/C/E v4.00 — FisQui (USEPA RSL May 2024)' as const;
