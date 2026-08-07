// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Parâmetros Toxicológicos das SQIs — base CETESB V 4.00 (mar/2026).
// Réplica oficial da aba FatTox das planilhas .xlsm; valores originais
// USEPA IRIS (Integrated Risk Information System). Manual §5.4.
//
// Subset mínimo: 20 SQIs canônicas do ADR-A5.
// Faltantes documentados com TODO para ratificação contra Anexo D.
//
// IMPORTANTE: Object.freeze (ADR-A2). Acesso via getFatTox(cas).
//
// SPEC: CETESB-RISK-001 RF-1.2

/** Parâmetros toxicológicos de uma SQI. */
export interface FatToxEntry {
    /** SFo — Slope factor oral, carcinogênico ((mg/kg-dia)⁻¹) — null se não-carc */
    readonly SFo: number | null;
    /** SFi — Slope factor inalação, carcinogênico ((mg/kg-dia)⁻¹) — null se não-carc */
    readonly SFi: number | null;
    /** RfDo — Reference Dose oral, não-carcinogênico (mg/kg-dia) — null se sem RfD */
    readonly RfDo: number | null;
    /** RfDi — Reference Dose inalação, não-carcinogênico (mg/kg-dia) — null se sem RfDi */
    readonly RfDi: number | null;
    /** ABSd — Fração contaminante absorvida pela pele (0-1) */
    readonly ABSd: number;
    /** ABSGI — Fração absorvida pelo trato gastrointestinal (0-1) */
    readonly ABSGI: number;
    /** Biodisp — Fator de biodisponibilidade relativa (0-1) */
    readonly Biodisp: number;
    /** Mutagenicidade USEPA (impacta cálculo de risco em residencial) */
    readonly mutagenic: boolean;
    /** Fonte do dado de referência (IRIS, PPRTV, NCEA, etc.) */
    readonly source: string;
}

/**
 * Base toxicológica de SQIs canônicas — 20 substâncias do ADR-A5.
 * Valores extraídos USEPA IRIS + RSL Composite + tabelas CETESB derivadas.
 *
 * Convenções:
 * - SFo/SFi = null → substância não-carcinogênica (HQ apenas)
 * - RfDo/RfDi = null → sem RfD na base USEPA → calcula apenas SF
 * - ABSGI default 1.0 (absorção total) para metais voláteis e orgânicos
 * - Biodisp default 1.0 (Manual §5.4 — usar 1.0 a menos que estudo específico)
 *
 * ATENÇÃO: valores SNAPSHOT. Ratificar contra aba FatTox .xlsm + USEPA RSL
 * antes do parity gate (ADR-A5).
 */
export const FAT_TOX: Readonly<Record<string, FatToxEntry>> = Object.freeze({
    // BTEX --------------------------------------------------------------------
    '71-43-2': Object.freeze({
        // Benzeno
        SFo: 5.5e-2,
        SFi: 2.73e-2,
        RfDo: 4.0e-3,
        RfDi: 8.57e-3,
        ABSd: 0.1,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '108-88-3': Object.freeze({
        // Tolueno (não-carc)
        SFo: null,
        SFi: null,
        RfDo: 8.0e-2,
        RfDi: 1.43e0,
        ABSd: 0.1,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '100-41-4': Object.freeze({
        // Etilbenzeno
        SFo: 1.1e-2,
        SFi: 2.5e-3,
        RfDo: 1.0e-1,
        RfDi: 2.86e-1,
        ABSd: 0.1,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '1330-20-7': Object.freeze({
        // Xilenos (não-carc)
        SFo: null,
        SFi: null,
        RfDo: 2.0e-1,
        RfDi: 2.86e-2,
        ABSd: 0.1,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    // Cloroaromáticos ---------------------------------------------------------
    '79-01-6': Object.freeze({
        // TCE
        SFo: 4.6e-2,
        SFi: 4.1e-2,
        RfDo: 5.0e-4,
        RfDi: 5.71e-4,
        ABSd: 0.1,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '127-18-4': Object.freeze({
        // PCE
        SFo: 2.1e-3,
        SFi: 2.6e-3,
        RfDo: 6.0e-3,
        RfDi: 1.14e-2,
        ABSd: 0.1,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '75-09-2': Object.freeze({
        // Diclorometano
        SFo: 2.0e-3,
        SFi: 1.0e-3,
        RfDo: 6.0e-3,
        RfDi: 1.71e-1,
        ABSd: 0.1,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '75-01-4': Object.freeze({
        // Cloreto de vinila — mutagênico (ajuste residencial)
        SFo: 7.2e-1,
        SFi: 1.54e-2,
        RfDo: 3.0e-3,
        RfDi: 2.86e-2,
        ABSd: 0.1,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: true,
        source: 'IRIS',
    }),
    // PAH ---------------------------------------------------------------------
    '91-20-3': Object.freeze({
        // Naftaleno
        SFo: null, // sem SFo IRIS — apenas SFi
        SFi: 3.4e-2,
        RfDo: 2.0e-2,
        RfDi: 8.57e-4,
        ABSd: 0.13,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '50-32-8': Object.freeze({
        // Benzo(a)pireno — mutagênico (ajuste residencial)
        SFo: 1.0e0,
        SFi: 6.0e-1,
        RfDo: 3.0e-4,
        RfDi: 8.57e-6,
        ABSd: 0.13,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: true,
        source: 'IRIS',
    }),
    // Metais ------------------------------------------------------------------
    '7440-43-9': Object.freeze({
        // Cádmio
        SFo: null,
        SFi: 6.3e0,
        RfDo: 1.0e-3,
        RfDi: 2.86e-5,
        ABSd: 0.001,
        ABSGI: 0.025,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '7440-50-8': Object.freeze({
        // Cobre (não-carc)
        SFo: null,
        SFi: null,
        RfDo: 4.0e-2,
        RfDi: null,
        ABSd: 0.001,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'HEAST',
    }),
    '7439-92-1': Object.freeze({
        // Chumbo — abordagem IEUBK/USEPA Adult Lead Model (sem SFo direto)
        SFo: 8.5e-3,
        SFi: null,
        RfDo: 3.5e-3,
        RfDi: null,
        ABSd: 0.001,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'CalEPA/USEPA AALM',
    }),
    '7439-97-6': Object.freeze({
        // Mercúrio (forma elementar)
        SFo: null,
        SFi: null,
        RfDo: 3.0e-4,
        RfDi: 8.57e-5,
        ABSd: 0.001,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '7440-02-0': Object.freeze({
        // Níquel (refinaria — IARC 1)
        SFo: null,
        SFi: 0.84,
        RfDo: 2.0e-2,
        RfDi: 2.6e-5,
        ABSd: 0.001,
        ABSGI: 0.04,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '7440-66-6': Object.freeze({
        // Zinco (não-carc)
        SFo: null,
        SFi: null,
        RfDo: 3.0e-1,
        RfDi: null,
        ABSd: 0.001,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    '7440-47-3': Object.freeze({
        // Cromo VI (escolhido como pior caso quando spec não específica forma)
        SFo: 5.0e-1,
        SFi: 4.2e1,
        RfDo: 3.0e-3,
        RfDi: 2.86e-5,
        ABSd: 0.001,
        ABSGI: 0.025,
        Biodisp: 1.0,
        mutagenic: true,
        source: 'IRIS',
    }),
    // Metaloide ---------------------------------------------------------------
    '7440-38-2': Object.freeze({
        // Arsênio inorgânico
        SFo: 1.5e0,
        SFi: 1.51e1,
        RfDo: 3.0e-4,
        RfDi: 4.29e-6,
        ABSd: 0.03,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'IRIS',
    }),
    // Misturas ----------------------------------------------------------------
    '8001-58-9': Object.freeze({
        // Creosoto (tratado como mistura PAH-equivalente)
        SFo: 7.3e-3,
        SFi: 6.0e-3,
        RfDo: null,
        RfDi: null,
        ABSd: 0.13,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'RSL/CalEPA',
    }),
    '8002-05-9': Object.freeze({
        // Petróleo TPH (frações alifáticas C10-C16 — proxy não-carc)
        SFo: null,
        SFi: null,
        RfDo: 1.0e-1,
        RfDi: 2.86e-1,
        ABSd: 0.1,
        ABSGI: 1.0,
        Biodisp: 1.0,
        mutagenic: false,
        source: 'TPHCWG',
    }),
});

/** Retorna entry FAT_TOX por CAS. */
export function getFatTox(cas: string): Readonly<FatToxEntry> | undefined {
    if (typeof cas !== 'string') return undefined;
    return FAT_TOX[cas.trim()];
}

/** Source string para auditoria. */
export const FATTOX_SOURCE = 'CETESB DD 103/2007/C/E v4.00 — FatTox (USEPA IRIS)' as const;
