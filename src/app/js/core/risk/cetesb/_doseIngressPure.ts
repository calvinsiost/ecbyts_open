// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Cálculo de Dose / Ingresso por Via × Receptor — Manual CETESB §6.2.
// Pure-logic, sem THREE/DOM/IDB.
//
// Equações canônicas USEPA RAGS Part A (1989) + Manual Anexo C V 4.00.
// Resultado em mg/kg-dia (Lifetime Average Daily Dose — LADD).
//
// ATc (tempo médio para efeitos carcinogênicos) → dose carcinogênica.
// ATn (tempo médio para efeitos não-carcinogênicos) → dose não-carcinogênica.
//
// SPEC: CETESB-RISK-001 RF-1.3 (_doseIngressPure)

import type { ExpParams, AgeGroup } from './expDefaults.js';
import type { FatToxEntry } from './fatTox.js';

/** Parâmetros adicionais por via (defaults USEPA RAGS, override via opts). */
export interface DoseInputs {
    /** IR_solo — Taxa de ingestão de solo (mg/dia). Default: criança 200, adulto 100. */
    IR_solo?: number;
    /** IR_ar — Taxa de inalação (m³/h). Default: adulto 0.83, criança 0.5 (USEPA EFH 2011). */
    IR_ar_hourly?: number;
    /** AF — Fator de aderência do solo na pele (mg/cm²·evento). Default: residencial 0.2, trab 0.07. */
    AF?: number;
    /** SA — Área de pele exposta (cm²). Default: adulto residencial 5700, criança 2800, trab 3300. */
    SA?: number;
    /** IR_agua — Taxa de ingestão de água (L/dia). Default: adulto 2.0, criança 1.0 (USEPA RAGS). */
    IR_agua?: number;
}

export interface DoseResult {
    /** Dose carcinogênica (mg/kg-dia) — usa ATc; null se não-carc. */
    readonly LADDc: number | null;
    /** Dose não-carcinogênica (mg/kg-dia) — usa ATn. */
    readonly LADDn: number;
    /** Detalhes do cálculo para auditoria. */
    readonly detail: Readonly<{
        pathway: Pathway;
        concentration: number;
        units: string;
    }>;
}

export type Pathway =
    | 'ingestion_soil'
    | 'dermal_soil'
    | 'inhalation_particulate_soil'
    | 'inhalation_vapor_soil'
    | 'ingestion_groundwater'
    | 'dermal_groundwater'
    | 'inhalation_vapor_groundwater'
    | 'inhalation_ambient_air';

// Defaults USEPA RAGS / EFH 2011 — usados quando DoseInputs não fornecer.
const DEFAULTS_BY_AGE: Readonly<Record<AgeGroup, Required<DoseInputs>>> = Object.freeze({
    child: Object.freeze({
        IR_solo: 200, // mg/dia (criança)
        IR_ar_hourly: 0.5, // m³/h
        AF: 0.2, // mg/cm²·evento
        SA: 2800, // cm²
        IR_agua: 1.0, // L/dia
    }),
    adult: Object.freeze({
        IR_solo: 100, // mg/dia (adulto)
        IR_ar_hourly: 0.83, // m³/h
        AF: 0.07, // mg/cm²·evento (default trabalhador; ajustar via DoseInputs em residencial)
        SA: 5700, // cm²
        IR_agua: 2.0, // L/dia
    }),
});

/** Conversão para usar em ingestão de solo: kg/mg. */
const CF_SOIL = 1e-6;

function _mergeInputs(age: AgeGroup, inputs: DoseInputs = {}): Required<DoseInputs> {
    const base = DEFAULTS_BY_AGE[age];
    return {
        IR_solo: Number.isFinite(inputs.IR_solo) ? (inputs.IR_solo as number) : base.IR_solo,
        IR_ar_hourly: Number.isFinite(inputs.IR_ar_hourly) ? (inputs.IR_ar_hourly as number) : base.IR_ar_hourly,
        AF: Number.isFinite(inputs.AF) ? (inputs.AF as number) : base.AF,
        SA: Number.isFinite(inputs.SA) ? (inputs.SA as number) : base.SA,
        IR_agua: Number.isFinite(inputs.IR_agua) ? (inputs.IR_agua as number) : base.IR_agua,
    };
}

function _isCarcinogenic(tox: Readonly<FatToxEntry> | undefined): boolean {
    if (!tox) return false;
    return tox.SFo != null || tox.SFi != null;
}

/** Dose por ingestão de solo (RAGS eq 6-1). */
export function doseIngestionSoil(
    concentration: number, // mg/kg solo
    exp: Readonly<ExpParams>,
    tox: Readonly<FatToxEntry>,
    age: AgeGroup,
    inputs: DoseInputs = {},
): DoseResult {
    const cfg = _mergeInputs(age, inputs);
    const EF = exp.EF_contatoDermalSolo;
    const ED = exp.ED;
    const BW = exp.BW;
    const ABSGI = tox.ABSGI;
    const Biodisp = tox.Biodisp;

    const constant = (concentration * cfg.IR_solo * EF * ED * CF_SOIL * ABSGI * Biodisp) / BW;

    const LADDn = exp.ATn > 0 ? constant / exp.ATn : 0;
    const LADDc = _isCarcinogenic(tox) && exp.ATc > 0 ? constant / exp.ATc : null;

    return Object.freeze({
        LADDc,
        LADDn,
        detail: Object.freeze({ pathway: 'ingestion_soil' as Pathway, concentration, units: 'mg/kg' }),
    });
}

/** Dose por contato dérmico com solo (RAGS eq 6-2). */
export function doseDermalSoil(
    concentration: number, // mg/kg solo
    exp: Readonly<ExpParams>,
    tox: Readonly<FatToxEntry>,
    age: AgeGroup,
    inputs: DoseInputs = {},
): DoseResult {
    const cfg = _mergeInputs(age, inputs);
    const EF = exp.EF_contatoDermalSolo;
    const ED = exp.ED;
    const BW = exp.BW;
    const ABSd = tox.ABSd;
    const Biodisp = tox.Biodisp;

    const constant = (concentration * cfg.AF * cfg.SA * ABSd * EF * ED * CF_SOIL * Biodisp) / BW;

    const LADDn = exp.ATn > 0 ? constant / exp.ATn : 0;
    const LADDc = _isCarcinogenic(tox) && exp.ATc > 0 ? constant / exp.ATc : null;

    return Object.freeze({
        LADDc,
        LADDn,
        detail: Object.freeze({ pathway: 'dermal_soil' as Pathway, concentration, units: 'mg/kg' }),
    });
}

/** Dose por inalação de partículas/vapores do solo superficial. */
export function doseInhalationParticulate(
    concentrationAir: number, // mg/m³ ar
    exp: Readonly<ExpParams>,
    tox: Readonly<FatToxEntry>,
    age: AgeGroup,
    inputs: DoseInputs = {},
): DoseResult {
    const cfg = _mergeInputs(age, inputs);
    const ET = exp.ET_inalParticSoloSup; // h/dia
    const EF = exp.EF_contatoDermalSolo; // dias/ano (proxy — Manual usa EF inalação igual)
    const ED = exp.ED;
    const BW = exp.BW;
    const Biodisp = tox.Biodisp;

    // dose = (C * IR * ET * EF * ED) / (BW * AT_h), com IR em m³/h
    const constant = (concentrationAir * cfg.IR_ar_hourly * ET * EF * ED * Biodisp) / BW;

    // AT em horas: ATc/ATn em dias * 24
    const LADDn = exp.ATn > 0 ? constant / (exp.ATn * 24) : 0;
    const LADDc = _isCarcinogenic(tox) && exp.ATc > 0 ? constant / (exp.ATc * 24) : null;

    return Object.freeze({
        LADDc,
        LADDn,
        detail: Object.freeze({
            pathway: 'inhalation_particulate_soil' as Pathway,
            concentration: concentrationAir,
            units: 'mg/m³',
        }),
    });
}

/** Dose por ingestão de água subterrânea. */
export function doseIngestionGroundwater(
    concentration: number, // mg/L
    exp: Readonly<ExpParams>,
    tox: Readonly<FatToxEntry>,
    age: AgeGroup,
    inputs: DoseInputs = {},
): DoseResult {
    const cfg = _mergeInputs(age, inputs);
    const EF = exp.EF_contatoDermalSolo;
    const ED = exp.ED;
    const BW = exp.BW;
    const ABSGI = tox.ABSGI;
    const Biodisp = tox.Biodisp;

    const constant = (concentration * cfg.IR_agua * EF * ED * ABSGI * Biodisp) / BW;

    const LADDn = exp.ATn > 0 ? constant / exp.ATn : 0;
    const LADDc = _isCarcinogenic(tox) && exp.ATc > 0 ? constant / exp.ATc : null;

    return Object.freeze({
        LADDc,
        LADDn,
        detail: Object.freeze({
            pathway: 'ingestion_groundwater' as Pathway,
            concentration,
            units: 'mg/L',
        }),
    });
}

/** Dose por inalação de vapor (ambiente fechado, vapor intrusion). */
export function doseInhalationVapor(
    concentrationAir: number, // mg/m³ ar interno
    exp: Readonly<ExpParams>,
    tox: Readonly<FatToxEntry>,
    age: AgeGroup,
    inputs: DoseInputs = {},
): DoseResult {
    const cfg = _mergeInputs(age, inputs);
    const ET = exp.ET_inalVaporFechado; // h/dia ambiente fechado
    const EF = exp.EF_contatoDermalSolo;
    const ED = exp.ED;
    const BW = exp.BW;
    const Biodisp = tox.Biodisp;

    const constant = (concentrationAir * cfg.IR_ar_hourly * ET * EF * ED * Biodisp) / BW;
    const LADDn = exp.ATn > 0 ? constant / (exp.ATn * 24) : 0;
    const LADDc = _isCarcinogenic(tox) && exp.ATc > 0 ? constant / (exp.ATc * 24) : null;

    return Object.freeze({
        LADDc,
        LADDn,
        detail: Object.freeze({
            pathway: 'inhalation_vapor_soil' as Pathway,
            concentration: concentrationAir,
            units: 'mg/m³',
        }),
    });
}

/** Source string. */
export const DOSE_SOURCE = 'USEPA RAGS Part A 1989 + Manual CETESB §6.2 (V 4.00)' as const;
