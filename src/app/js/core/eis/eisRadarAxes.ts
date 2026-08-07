// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Data Governance
// Authorship: Calvin Stefan Iost

/* ================================================================
   EIS Radar Axes — Pure-Logic Extension
   ================================================================

   Transforma os scores brutos dos 6 eixos TCCCA+T em um dataset
   normalizado de 11 sub-eixos para visualização em gráfico radar.

   11 sub-eixos mapeados a partir dos 6 eixos principais:
     T  (3) → T1: Temporalidade, T2: Duração, T3: Reversibilidade
     A  (3) → A1: Área Afetada, A2: Dens. Populacional, A3: Sens. Ecossistema
     Cp (2) → Cp1: Conformidade Prev., Cp2: Conformidade Mon.
     Ty (1) → Ty: Tipo de Impacto
     Cs (1) → Cs: Efic. de Controle
     Cm (1) → Cm: Maturidade Gestão

   Normalização: cada sub-eixo é normalizado para [0, 1] para exibição.

   ================================================================ */

// ================================================================
// CONSTANTES
// ================================================================

/**
 * Rótulos dos 10 sub-eixos do radar EIS.
 */
export const RADAR_AXIS_LABELS: Record<string, string> = {
    T1: 'Temporalidade',
    T2: 'Duração',
    T3: 'Reversibilidade',
    A1: 'Área Afetada',
    A2: 'Dens. Populacional',
    A3: 'Sens. Ecossistema',
    Cp1: 'Conformidade Prev.',
    Cp2: 'Conformidade Mon.',
    Ty: 'Tipo de Impacto',
    Cs: 'Efic. de Controle',
    Cm: 'Maturidade Gestão',
};

/**
 * Mapeamento de sub-eixo para grupo (eixo principal).
 */
const AXIS_GROUP: Record<string, string> = {
    T1: 'T',
    T2: 'T',
    T3: 'T',
    A1: 'A',
    A2: 'A',
    A3: 'A',
    Cp1: 'Cp',
    Cp2: 'Cp',
    Ty: 'misc',
    Cs: 'misc',
    Cm: 'misc',
};

/** Valor máximo de um sub-eixo bruto (escala EIS 0–5). */
const RAW_MAX = 5;

/** Valor mínimo de um sub-eixo bruto. */
const RAW_MIN = 0;

/** Limiar de veto para eixos T e A (qualquer sub-eixo abaixo → score=0). */
const VETO_THRESHOLD = 2;

// ================================================================
// FUNÇÕES EXPORTADAS
// ================================================================

/**
 * Normaliza um valor bruto de sub-eixo para o intervalo [0, 1].
 */
export function normalizeRadarAxis(rawValue: number, min = RAW_MIN, max = RAW_MAX): number {
    if (typeof rawValue !== 'number' || !isFinite(rawValue)) {
        throw new RangeError(`normalizeRadarAxis: rawValue deve ser número finito, recebeu ${rawValue}`);
    }
    if (typeof min !== 'number' || typeof max !== 'number') {
        throw new RangeError('normalizeRadarAxis: min e max devem ser números');
    }
    if (min >= max) {
        throw new RangeError(`normalizeRadarAxis: min (${min}) deve ser menor que max (${max})`);
    }
    // Clamp antes de normalizar para garantir saída em [0, 1]
    const clamped = Math.max(min, Math.min(max, rawValue));
    return (clamped - min) / (max - min);
}

interface AxisScores {
    T?: [number, number, number];
    A?: [number, number, number];
    Cp?: [number, number];
    Ty?: number;
    Cs?: number;
    Cm?: number;
}

interface RadarAxis {
    id: string;
    label: string;
    value: number;
    rawValue: number;
    group: string;
}

interface RadarData {
    axes: RadarAxis[];
    overallScore: number;
    vetoed: boolean;
}

/**
 * Constrói o dataset de radar EIS a partir dos scores de sub-eixos.
 */
export function buildEISRadarData(axisScores: AxisScores, opts: { veto?: boolean } = {}): RadarData {
    if (axisScores === null || axisScores === undefined || typeof axisScores !== 'object') {
        throw new TypeError('buildEISRadarData: axisScores deve ser um objeto não-nulo');
    }

    const veto = opts.veto !== false; // default true

    // Extrair sub-eixos com defaults 0
    const T = axisScores.T ?? [0, 0, 0];
    const A = axisScores.A ?? [0, 0, 0];
    const Cp = axisScores.Cp ?? [0, 0];
    const Ty = axisScores.Ty ?? 0;
    const Cs = axisScores.Cs ?? 0;
    const Cm = axisScores.Cm ?? 0;

    // Validar arrays
    if (!Array.isArray(T) || T.length < 3) {
        throw new RangeError('buildEISRadarData: T deve ser array [t1, t2, t3]');
    }
    if (!Array.isArray(A) || A.length < 3) {
        throw new RangeError('buildEISRadarData: A deve ser array [a1, a2, a3]');
    }
    if (!Array.isArray(Cp) || Cp.length < 2) {
        throw new RangeError('buildEISRadarData: Cp deve ser array [cp1, cp2]');
    }

    // Mapa plano de id → rawValue
    const rawMap: Record<string, number> = {
        T1: T[0]!,
        T2: T[1]!,
        T3: T[2]!,
        A1: A[0]!,
        A2: A[1]!,
        A3: A[2]!,
        Cp1: Cp[0]!,
        Cp2: Cp[1]!,
        Ty,
        Cs,
        Cm,
    };

    // Validar range de cada sub-eixo
    for (const [id, raw] of Object.entries(rawMap)) {
        if (typeof raw !== 'number' || !isFinite(raw)) {
            throw new RangeError(`buildEISRadarData: sub-eixo ${id} deve ser número finito, recebeu ${raw}`);
        }
        if (raw < RAW_MIN || raw > RAW_MAX) {
            throw new RangeError(`buildEISRadarData: sub-eixo ${id}=${raw} fora do intervalo [${RAW_MIN}, ${RAW_MAX}]`);
        }
    }

    // Verificar veto: qualquer T ou A sub-eixo ≤ threshold
    let vetoed = false;
    if (veto) {
        const tAxes = [rawMap.T1!, rawMap.T2!, rawMap.T3!];
        const aAxes = [rawMap.A1!, rawMap.A2!, rawMap.A3!];
        if (tAxes.some((v) => v <= VETO_THRESHOLD) || aAxes.some((v) => v <= VETO_THRESHOLD)) {
            vetoed = true;
        }
    }

    // Construir array de eixos normalizado
    const axes = Object.entries(rawMap).map(([id, rawValue]) => ({
        id,
        label: RADAR_AXIS_LABELS[id]!,
        value: normalizeRadarAxis(rawValue),
        rawValue,
        group: AXIS_GROUP[id]!,
    }));

    // Calcular overallScore (média aritmética dos valores normalizados × 5)
    let overallScore: number;
    if (vetoed) {
        overallScore = 0;
    } else {
        const mean = axes.reduce((sum, ax) => sum + ax.value, 0) / axes.length;
        overallScore = parseFloat((mean * RAW_MAX).toFixed(4));
    }

    return { axes, overallScore, vetoed };
}

interface CategoryGroups {
    T: RadarAxis[];
    A: RadarAxis[];
    Cp: RadarAxis[];
    misc: RadarAxis[];
}

/**
 * Agrupa os eixos do radar por categoria (T, A, Cp, misc).
 */
export function groupRadarAxesByCategory(radarData: { axes?: RadarAxis[] }): CategoryGroups {
    if (!radarData || !Array.isArray(radarData.axes)) {
        throw new TypeError('groupRadarAxesByCategory: radarData.axes deve ser um array');
    }
    const groups: CategoryGroups = { T: [], A: [], Cp: [], misc: [] };
    for (const axis of radarData.axes) {
        const g = axis.group as keyof CategoryGroups;
        if (groups[g]) {
            groups[g].push(axis);
        } else {
            groups.misc.push(axis);
        }
    }
    return groups;
}
