// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// TRUST-009 G1 — datum shift WGS84 ↔ SIRGAS 2000 (Brasil) sub-métrico.
//
// PROBLEMA: `areaCentroidUtm.ts:13-14` afirma "as coordenadas do app são
// WGS84/SIRGAS-2000-alinhadas (diferença sub-métrica); o rótulo 'UTM SIRGAS
// 2000' atende a exigência da CETESB". Sem gate empírico, essa afirmação
// é especulação.
//
// FUNDAMENTO TÉCNICO (IBGE 2025, Resolução PR-22/2005):
// - SIRGAS 2000 (Sistema de Referência Geocêntrico para as Américas) é
//   alinhado ao ITRF2000 época 2000.4.
// - WGS84 (G2139 atual, anterior G1762/G1150) também é alinhado ao ITRF,
//   com discrepância <1cm em qualquer época para o BR.
// - A diferença entre WGS84 e SIRGAS 2000 no Brasil é da ordem de
//   décimos de metro (típico ~0.5m), bem dentro da precisão CETESB
//   DD-038/2017 que opera com tolerância de poucos metros.
//
// REFERÊNCIA:
// - IBGE — Resolução do Presidente Nº 22, de 21/07/2005 (adoção SIRGAS 2000)
// - IBGE — Resolução do Presidente Nº 01/2015 (transição GPSWGS84→SIRGAS2000)
// - NIMA TR8350.2 Department of Defense World Geodetic System 1984
//
// ABORDAGEM PRAGMÁTICA:
// Helper documenta o delta esperado e fornece API para audit. NÃO implementa
// Helmert 7-param real (exige constants ITRF + época que mudam por ano).
// Para precisão centimétrica ou publicação científica, usuário deve usar
// proj4js (W9 pendente decisão Calvin).

export interface DatumShiftEstimate {
    readonly fromDatum: string;
    readonly toDatum: string;
    readonly maxDeltaHorizontalM: number;
    readonly maxDeltaVerticalM: number;
    readonly applicableRegion: string;
    readonly reference: string;
    readonly precisionDisclaimer: string;
}

/**
 * Tolerância máxima documentada entre WGS84 e SIRGAS 2000 no Brasil.
 * Conservador para fins de design (real medido ~0.5m horizontal IBGE).
 */
export const WGS84_SIRGAS_MAX_DELTA_M = 1.0;

/**
 * Retorna estimativa do delta entre dois datums comuns para audit/disclaimer.
 *
 * @param fromDatum identificador (ex: 'WGS84', 'SIRGAS2000', 'NAD27')
 * @param toDatum identificador
 * @returns estimativa ou null se par não-suportado
 */
export function estimateDatumShift(fromDatum: string, toDatum: string): DatumShiftEstimate | null {
    const from = (fromDatum || '').toUpperCase().replace(/[\s_-]/g, '');
    const to = (toDatum || '').toUpperCase().replace(/[\s_-]/g, '');

    // WGS84 ↔ SIRGAS 2000 (foco TRUST-009 G1)
    if (
        (from === 'WGS84' && to === 'SIRGAS2000') ||
        (from === 'SIRGAS2000' && to === 'WGS84')
    ) {
        return {
            fromDatum: from === 'WGS84' ? 'WGS84' : 'SIRGAS 2000',
            toDatum: to === 'WGS84' ? 'WGS84' : 'SIRGAS 2000',
            maxDeltaHorizontalM: WGS84_SIRGAS_MAX_DELTA_M,
            maxDeltaVerticalM: 0.5,
            applicableRegion: 'Brasil (todo território nacional)',
            reference: 'IBGE Res PR-22/2005 + ITRF2000 época 2000.4',
            precisionDisclaimer:
                'Sub-métrico aceitável para CETESB DD-038/2017. Para precisão centimétrica ' +
                '(publicação científica, LiDAR), use Helmert 7-param real via proj4js (W9 pendente).',
        };
    }

    // WGS84 ↔ NAD27 (referência: GAP W9 documentado, valores ordem 200m)
    if ((from === 'WGS84' && to === 'NAD27') || (from === 'NAD27' && to === 'WGS84')) {
        return {
            fromDatum: from === 'WGS84' ? 'WGS84' : 'NAD27',
            toDatum: to === 'WGS84' ? 'WGS84' : 'NAD27',
            maxDeltaHorizontalM: 200,
            maxDeltaVerticalM: 50,
            applicableRegion: 'América do Norte (USA continental + Canadá sul)',
            reference: 'NIMA TR8350.2 Appendix B; USGS Bulletin 1532',
            precisionDisclaimer:
                'Diferença SIGNIFICATIVA. NÃO use identity shift — exige proj4js Helmert 7-param ' +
                '(W9 pendente decisão Calvin).',
        };
    }

    // WGS84 ↔ Tokyo Datum (Japão pre-2002)
    if (
        (from === 'WGS84' && (to === 'TOKYODATUM' || to === 'TOKYO')) ||
        ((from === 'TOKYODATUM' || from === 'TOKYO') && to === 'WGS84')
    ) {
        return {
            fromDatum: from === 'WGS84' ? 'WGS84' : 'Tokyo Datum',
            toDatum: to === 'WGS84' ? 'WGS84' : 'Tokyo Datum',
            maxDeltaHorizontalM: 500,
            maxDeltaVerticalM: 100,
            applicableRegion: 'Japão (datums legados pré-JGD2000/2011)',
            reference: 'NIMA TR8350.2 Appendix B',
            precisionDisclaimer:
                'Diferença MUITO SIGNIFICATIVA (~500m horizontal). NÃO use identity shift — ' +
                'exige proj4js (W9 pendente decisão Calvin).',
        };
    }

    return null;
}

/**
 * Valida se assume-WGS84 é aceitável para um dataset declarado em outro datum.
 * Retorna `{ acceptable, deltaM, warning? }`.
 *
 * @param sourceDatum datum do dataset (ex: 'SIRGAS2000', 'NAD27', 'TokyoDatum')
 * @param toleranceM tolerância aceitável do caller em metros (default 1m)
 */
export function isWgs84AssumptionAcceptable(
    sourceDatum: string,
    toleranceM: number = WGS84_SIRGAS_MAX_DELTA_M,
): { acceptable: boolean; deltaM: number; warning?: string } {
    const est = estimateDatumShift(sourceDatum, 'WGS84');
    if (!est) {
        return {
            acceptable: false,
            deltaM: NaN,
            warning: `Datum '${sourceDatum}' não suportado pelo estimador — assume default não-aceitável.`,
        };
    }
    const delta = est.maxDeltaHorizontalM;
    if (delta <= toleranceM) {
        return { acceptable: true, deltaM: delta };
    }
    return {
        acceptable: false,
        deltaM: delta,
        warning:
            `Assumir WGS84 para dados em ${sourceDatum} introduz erro até ${delta}m ` +
            `(tolerância caller: ${toleranceM}m). ${est.precisionDisclaimer}`,
    };
}
