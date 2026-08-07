// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Coordenadas UTM SIRGAS 2000 no centro da área (CETESB DD 038/2017, Avaliação
// Preliminar item a: "coordenadas geográficas UTM (SIRGAS 2000) obtidas no centro da
// área"). Pure-logic: o offset relativo→UTM recebe o origin injetado (sem importar
// coordinates.js, que tem estado/browser deps); o glue runtime obtém o origin.
//
// Nota: as coordenadas do app são WGS84/SIRGAS-2000-alinhadas (diferença sub-métrica);
// o rótulo "UTM SIRGAS 2000" atende a exigência da CETESB.
import type { RelPoint } from './radiusBuffer.js';

export type UtmCoord = { easting: number; northing: number; zone?: number | string; hemisphere?: string };

/**
 * Converte um centroide relativo (metros) para UTM, dado o origin UTM da área.
 * Mesma matemática de coordinates.relativeToUTM (easting+x, northing-z). Pure.
 */
export function relativeCentroidToUtm(centroid: RelPoint | null, origin: UtmCoord | null): UtmCoord | null {
    if (!centroid || !origin || typeof origin.easting !== 'number' || typeof origin.northing !== 'number') return null;
    const out: UtmCoord = {
        easting: origin.easting + (centroid.x || 0),
        northing: origin.northing - (centroid.z || 0),
    };
    if (origin.zone !== undefined) out.zone = origin.zone;
    if (origin.hemisphere !== undefined) out.hemisphere = origin.hemisphere;
    return out;
}

/** Formata metros com separador de milhar pt-BR (determinístico, sem toLocaleString). */
function _fmtMeters(n: number): string {
    return Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formata uma coordenada UTM como string SIRGAS 2000 legível. Se inválida/ausente,
 * devolve um marcador "[A PREENCHER]" (o app pode não ter origin geo definido).
 */
export function formatUtmSirgas(utm: UtmCoord | null): string {
    if (!utm || typeof utm.easting !== 'number' || typeof utm.northing !== 'number') {
        return '[A PREENCHER: coordenadas UTM SIRGAS 2000 do centro da área]';
    }
    const zone = utm.zone != null && utm.zone !== '' ? `Zona ${utm.zone}${utm.hemisphere === 'S' ? ' (Sul)' : ''}` : 'Zona N/D';
    return `${zone} · E ${_fmtMeters(utm.easting)} m · N ${_fmtMeters(utm.northing)} m (UTM SIRGAS 2000)`;
}
