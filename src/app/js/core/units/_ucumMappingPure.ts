// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * UCUM / QUDT mapping — pure logic (CONSIST-OBS-001 B4, doutorado-crítico).
 *
 * Mapeia o catálogo interno (core/units/catalog.ts) para códigos UCUM
 * (Unified Code for Units of Measure, ucum.org) e URIs QUDT
 * (qudt.org/vocab/unit) — requisito FAIR² para dados citáveis em publicação
 * (Nature Scientific Data: unidades machine-readable interoperáveis).
 *
 * HONESTIDADE DO MAPEAMENTO (PN-4): unidades custom/adimensionais do produto
 * (score, per_200k_hh, tep...) NÃO têm UCUM válido — ficam `null` com nota,
 * nunca um código inventado. Annotations UCUM `{...}` são usadas para
 * espécies GHG (t{CO2e}) — válidas pela gramática UCUM §2.1.10.
 *
 * Referências: UCUM v2.1 (Schadow & McDonald), QUDT 2.1, FAIR² data.
 */

export interface UcumEntry {
    /** Código UCUM case-sensitive (null = sem representação UCUM válida). */
    readonly ucum: string | null;
    /** URI QUDT (null = não mapeado; preencher sob demanda de export). */
    readonly qudt: string | null;
    /** Nota de mapeamento (aproximações/limitações declaradas). */
    readonly note?: string;
}

const Q = 'http://qudt.org/vocab/unit/';

/** Mapa unitId interno → UCUM/QUDT. Cobertura auditada por coverageReport. */
export const UCUM_MAP: Readonly<Record<string, UcumEntry>> = Object.freeze({
    // ---- massa
    t: { ucum: 't', qudt: `${Q}TONNE` },
    kg: { ucum: 'kg', qudt: `${Q}KiloGM` },
    g: { ucum: 'g', qudt: `${Q}GM` },
    mg: { ucum: 'mg', qudt: `${Q}MilliGM` },
    // ---- volume
    m3: { ucum: 'm3', qudt: `${Q}M3` },
    L: { ucum: 'L', qudt: `${Q}L` },
    mL: { ucum: 'mL', qudt: `${Q}MilliL` },
    kL: { ucum: 'kL', qudt: `${Q}KiloL` },
    // ---- concentração (água/solo/ar)
    mg_L: { ucum: 'mg/L', qudt: `${Q}MilliGM-PER-L` },
    ug_L: { ucum: 'ug/L', qudt: `${Q}MicroGM-PER-L` },
    g_L: { ucum: 'g/L', qudt: `${Q}GM-PER-L` },
    mg_kg: { ucum: 'mg/kg', qudt: `${Q}MilliGM-PER-KiloGM` },
    mg_m3: { ucum: 'mg/m3', qudt: `${Q}MilliGM-PER-M3` },
    ug_m3: { ucum: 'ug/m3', qudt: `${Q}MicroGM-PER-M3` },
    mg_Nm3: {
        ucum: 'mg/m3', qudt: null,
        note: 'Nm3 (CNTP) não tem código UCUM próprio — mapeado a mg/m3; condições de referência devem ir em metadado',
    },
    ppm: { ucum: '[ppm]', qudt: `${Q}PPM` },
    ppb: { ucum: '[ppb]', qudt: `${Q}PPB` },
    // ---- área
    ha: { ucum: 'har', qudt: `${Q}HA`, note: 'UCUM usa "har" para hectare ("ha" colide com hecto-ano)' },
    m2: { ucum: 'm2', qudt: `${Q}M2` },
    km2: { ucum: 'km2', qudt: `${Q}KiloM2` },
    acre: { ucum: '[acr_us]', qudt: `${Q}AC` },
    sqft: { ucum: '[sft_i]', qudt: `${Q}FT2` },
    sqmi: { ucum: '[smi_us]', qudt: `${Q}MI2` },
    // ---- comprimento
    m: { ucum: 'm', qudt: `${Q}M` },
    km: { ucum: 'km', qudt: `${Q}KiloM` },
    cm: { ucum: 'cm', qudt: `${Q}CentiM` },
    ft: { ucum: '[ft_i]', qudt: `${Q}FT` },
    inch: { ucum: '[in_i]', qudt: `${Q}IN` },
    yard: { ucum: '[yd_i]', qudt: `${Q}YD` },
    mile: { ucum: '[mi_i]', qudt: `${Q}MI` },
    // ---- temperatura
    celsius: { ucum: 'Cel', qudt: `${Q}DEG_C` },
    fahrenheit: { ucum: '[degF]', qudt: `${Q}DEG_F` },
    kelvin: { ucum: 'K', qudt: `${Q}K` },
    // ---- vazão
    m3_h: { ucum: 'm3/h', qudt: `${Q}M3-PER-HR` },
    m3_s: { ucum: 'm3/s', qudt: `${Q}M3-PER-SEC` },
    L_s: { ucum: 'L/s', qudt: `${Q}L-PER-SEC` },
    L_min: { ucum: 'L/min', qudt: `${Q}L-PER-MIN` },
    // ---- elétricas / qualidade de água
    mV: { ucum: 'mV', qudt: `${Q}MilliV` },
    V: { ucum: 'V', qudt: `${Q}V` },
    uS_cm: { ucum: 'uS/cm', qudt: `${Q}MicroS-PER-CentiM` },
    mS_cm: { ucum: 'mS/cm', qudt: `${Q}MilliS-PER-CentiM` },
    pH: { ucum: '[pH]', qudt: `${Q}PH` },
    // ---- acústica (aproximações declaradas)
    dB: { ucum: 'dB', qudt: `${Q}DeciB`, note: 'dB genérico; para SPL usar B[SPL] com referência 20 µPa em metadado' },
    dBA: { ucum: 'dB', qudt: null, note: 'ponderação A não é expressável em UCUM puro — registrar curva A em metadado' },
    // ---- energia
    kWh: { ucum: 'kW.h', qudt: `${Q}KiloW-HR` },
    MWh: { ucum: 'MW.h', qudt: `${Q}MegaW-HR` },
    GJ: { ucum: 'GJ', qudt: `${Q}GigaJ` },
    kWh_unit: { ucum: null, qudt: null, note: 'kWh por unidade produzida — denominador custom do produto' },
    tep: { ucum: null, qudt: `${Q}TOE`, note: 'tonelada equivalente de petróleo — sem código UCUM; QUDT TOE existe' },
    // ---- GHG (annotations UCUM válidas §2.1.10)
    tCO2: { ucum: 't{CO2}', qudt: null, note: 'espécie em annotation — adimensional para a gramática UCUM' },
    tCO2e: { ucum: 't{CO2e}', qudt: null, note: 'espécie em annotation' },
    kgCO2e: { ucum: 'kg{CO2e}', qudt: null, note: 'espécie em annotation' },
    tCO2e_unit: { ucum: null, qudt: null, note: 'tCO2e por unidade produzida — denominador custom' },
    tCO2e_revenue: { ucum: null, qudt: null, note: 'tCO2e por receita — denominador custom' },
    // ---- adimensionais / custom do produto (sem UCUM, declarado)
    percent: { ucum: '%', qudt: `${Q}PERCENT` },
    count: { ucum: '1', qudt: `${Q}NUM`, note: 'contagem adimensional (UCUM unity)' },
    none: { ucum: '1', qudt: null, note: 'adimensional' },
    score: { ucum: null, qudt: null, note: 'escala interna do produto' },
    score_100: { ucum: null, qudt: null, note: 'escala interna 0-100' },
    per_1M_hh: { ucum: null, qudt: null, note: 'por milhão de domicílios — custom' },
    per_200k_hh: { ucum: null, qudt: null, note: 'por 200 mil domicílios — custom' },
    days_per_1M: { ucum: null, qudt: null, note: 'dias por milhão (taxa OSHA-like) — custom' },
    m3_unit: { ucum: null, qudt: null, note: 'm3 por unidade produzida — denominador custom' },
});

/** Código UCUM do unitId interno (null = sem representação FAIR). */
export function toUcum(unitId: string): string | null {
    return UCUM_MAP[unitId]?.ucum ?? null;
}

/** URI QUDT do unitId interno. */
export function toQudt(unitId: string): string | null {
    return UCUM_MAP[unitId]?.qudt ?? null;
}

/** Unidade é citável FAIR (tem UCUM válido)? */
export function isFairCitable(unitId: string): boolean {
    return toUcum(unitId) !== null;
}

/**
 * Auditoria de cobertura do mapeamento contra a lista de ids do catálogo —
 * consumida por cheap test (catálogo cresce → teste aponta o gap).
 */
export function coverageReport(allUnitIds: string[]) {
    const unmappedEntry: string[] = [];
    const noUcum: string[] = [];
    for (const id of allUnitIds || []) {
        const e = UCUM_MAP[id];
        if (!e) unmappedEntry.push(id);
        else if (e.ucum === null) noUcum.push(id);
    }
    const total = (allUnitIds || []).length;
    const citable = total - unmappedEntry.length - noUcum.length;
    return Object.freeze({
        total,
        citable,
        coveragePct: total > 0 ? Math.round((citable / total) * 100) : 0,
        unmappedEntry: Object.freeze([...unmappedEntry].sort()),
        declaredNonCitable: Object.freeze([...noUcum].sort()),
    });
}
