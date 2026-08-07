// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VOXEL PROVENANCE — Carimbo de proveniência por célula (RF-1).

   Cada voxel carrega metadados de ESTIMATIVA — origem do valor, método
   e confiança — para que auditor/consultor distinga o que é DADO MEDIDO
   do que é PALPITE interpolado. Padrão da indústria de block models
   (Leapfrog/Vulcan/MiningMath): ausência de dado = célula "sem estimativa",
   nunca zero silencioso.

   Duas camadas complementares:
     1. Canal paralelo `Uint8Array` com a CLASSE de proveniência (enum
        PROVENANCE_CLASS) — alinhado ao grid `idx = iz·(ny·nx) + iy·nx + ix`,
        gerado junto da população do canal escalar. É o coração do RF-1.
     2. Registro por célula `VoxelProvenance` (cellId/source/timestamp/
        method/confidence) para inspeção/tooltip e para a cadeia de auditoria.

   PUREZA: recebe escalares/TypedArrays; sem DOM, Three.js ou I/O.
   Determinístico: mesma entrada → mesma saída (timestamp injetável via
   `opts.now` para testes reprodutíveis).

   PROVENANCE / referência canônica:
     - Classificação measured/indicated/inferred por configuração de amostras
       (JORC adaptado ao ambiental): MEDIDA (contém amostra), INTERP_HIGH
       (n≥N vizinhos no range), INTERP_LOW (1 vizinho / extrapolação), SEM-DADO.
       SciELO SAIMM; MDPI 2022 (IDW-3D com vizinhança 3D).
     - Air blocks removidos por superfície (MiningMath): acima da topografia
       = ABOVE_SURFACE (fora do modelo); abaixo do estrato mais profundo =
       BELOW_MODEL. Nunca "zona EMPTY que participa de contagens".
     - Rebaixa por variância (RF-4 / SPEC_FC05_GEOML_GAUSS_PROCESS): célula
       INTERP_HIGH com variância de kriging acima do corte → INTERP_LOW.
   ================================================================ */

/**
 * Classe de proveniência de uma célula — valores do canal paralelo
 * `Uint8Array` (RF-1). Congelado; os números são o contrato do canal.
 */
export const PROVENANCE_CLASS = Object.freeze({
    MEASURED: 0,
    INTERP_HIGH: 1,
    INTERP_LOW: 2,
    EXTRAPOLATED: 3,
    NO_DATA: 4,
    ABOVE_SURFACE: 5,
    BELOW_MODEL: 6,
} as const);

export type ProvenanceClass = (typeof PROVENANCE_CLASS)[keyof typeof PROVENANCE_CLASS];

/** Métodos de estimativa conhecidos (informativo; `method` é string livre). */
export const PROVENANCE_METHOD = Object.freeze({
    MEASURED: 'measured',
    IDW3D: 'idw3d',
    KRIGING3D: 'kriging3d',
    EXTRUDE2D: 'extrude2d',
    INTERPOLATED: 'interpolated',
    EXTRAPOLATED: 'extrapolated',
    ABOVE_SURFACE: 'above-surface',
    BELOW_MODEL: 'below-model',
    NONE: 'none',
} as const);

/** Nº mínimo de vizinhos dentro do range para classificação INTERP_HIGH. */
export const HIGH_NEIGHBOR_THRESHOLD = 3;

/** Registro de proveniência de uma célula (exposto em getVoxelAt / tooltip). */
export interface VoxelProvenance {
    /** Índice linear do voxel no grid (`iz·(ny·nx) + iy·nx + ix`). */
    readonly cellId: number;
    /** Rótulo da fonte de dados (ex.: 'campanha-2026-Q1', 'PM-01'). */
    readonly source: string;
    /** Epoch (ms) em que o carimbo foi gerado. */
    readonly timestamp: number;
    /** Método de estimativa (ver PROVENANCE_METHOD; string livre). */
    readonly method: string;
    /** Confiança normalizada em [0, 1]. */
    readonly confidence: number;
}

/** Geometria/estado de uma célula para classificação de proveniência. */
export interface VoxelCellInput {
    /** Índice linear do voxel no grid. */
    readonly cellId: number;
    /** Valor escalar da célula (finito = célula populada). */
    readonly value?: number;
    /** True se uma observação cai dentro da tolerância (resolution/2) do centro. */
    readonly hasObservation?: boolean;
    /** Nº de observações dentro do range de busca/variograma. */
    readonly neighborCount?: number;
    /** Distância à observação mais próxima (mesma unidade do range). */
    readonly nearestDistance?: number;
    /** Range de busca/variograma. */
    readonly range?: number;
    /** Método de estimativa usado (ex.: 'idw3d', 'kriging3d'). */
    readonly method?: string;
    /** Variância de kriging/GP (RF-4); acima do corte rebaixa p/ INTERP_LOW. */
    readonly variance?: number;
    /** Override de superfície: 'above' = ABOVE_SURFACE, 'below' = BELOW_MODEL. */
    readonly surface?: 'above' | 'below';
    /** Epoch (ms) do carimbo; default = Date.now(). */
    readonly timestamp?: number;
}

/** Opções de stampProvenance. */
export interface StampOptions {
    /** Corte de variância p/ rebaixar INTERP_HIGH → INTERP_LOW (RF-4). Default 1. */
    readonly varianceCut?: number;
    /** Epoch (ms) injetável p/ testes reprodutíveis. Default = Date.now(). */
    readonly now?: number;
}

const CLASS_CONFIDENCE: Readonly<Record<ProvenanceClass, number>> = Object.freeze({
    [PROVENANCE_CLASS.MEASURED]: 1,
    [PROVENANCE_CLASS.INTERP_HIGH]: 0.8,
    [PROVENANCE_CLASS.INTERP_LOW]: 0.5,
    [PROVENANCE_CLASS.EXTRAPOLATED]: 0.25,
    [PROVENANCE_CLASS.NO_DATA]: 0,
    [PROVENANCE_CLASS.ABOVE_SURFACE]: 0,
    [PROVENANCE_CLASS.BELOW_MODEL]: 0,
});

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function classMethod(cls: ProvenanceClass, requested: string | undefined): string {
    switch (cls) {
        case PROVENANCE_CLASS.MEASURED:
            return PROVENANCE_METHOD.MEASURED;
        case PROVENANCE_CLASS.INTERP_HIGH:
        case PROVENANCE_CLASS.INTERP_LOW:
            return requested && requested.length > 0 ? requested : PROVENANCE_METHOD.INTERPOLATED;
        case PROVENANCE_CLASS.EXTRAPOLATED:
            return requested && requested.length > 0 ? requested : PROVENANCE_METHOD.EXTRAPOLATED;
        case PROVENANCE_CLASS.ABOVE_SURFACE:
            return PROVENANCE_METHOD.ABOVE_SURFACE;
        case PROVENANCE_CLASS.BELOW_MODEL:
            return PROVENANCE_METHOD.BELOW_MODEL;
        case PROVENANCE_CLASS.NO_DATA:
        default:
            return PROVENANCE_METHOD.NONE;
    }
}

/**
 * Classifica a proveniência de uma célula a partir da geometria de amostras.
 *
 * Regras (RF-1): superfície override → ABOVE_SURFACE/BELOW_MODEL; contém
 * observação → MEASURED; n≥HIGH_NEIGHBOR_THRESHOLD vizinhos no range →
 * INTERP_HIGH; 1..N-1 vizinhos → INTERP_LOW; 0 vizinhos mas valor finito →
 * EXTRAPOLATED; senão NO_DATA. Variância acima do corte rebaixa
 * INTERP_HIGH → INTERP_LOW (RF-4).
 */
export function classifyCell(cell: VoxelCellInput, opts: StampOptions = {}): ProvenanceClass {
    if (cell.surface === 'above') return PROVENANCE_CLASS.ABOVE_SURFACE;
    if (cell.surface === 'below') return PROVENANCE_CLASS.BELOW_MODEL;
    if (cell.hasObservation === true) return PROVENANCE_CLASS.MEASURED;

    const neighbors = isFiniteNumber(cell.neighborCount) ? Math.max(0, Math.floor(cell.neighborCount)) : 0;
    if (neighbors >= HIGH_NEIGHBOR_THRESHOLD) {
        const varianceCut = isFiniteNumber(opts.varianceCut) ? opts.varianceCut : 1;
        if (isFiniteNumber(cell.variance) && (cell.variance as number) > varianceCut) {
            return PROVENANCE_CLASS.INTERP_LOW;
        }
        return PROVENANCE_CLASS.INTERP_HIGH;
    }
    if (neighbors >= 1) return PROVENANCE_CLASS.INTERP_LOW;
    if (isFiniteNumber(cell.value)) return PROVENANCE_CLASS.EXTRAPOLATED;
    return PROVENANCE_CLASS.NO_DATA;
}

/**
 * Gera o registro de proveniência de uma célula.
 *
 * @param cell    geometria/estado da célula (ver VoxelCellInput)
 * @param source  rótulo da fonte de dados
 * @param opts    corte de variância (RF-4) e epoch injetável
 * @returns VoxelProvenance congelado { cellId, source, timestamp, method, confidence }
 */
export function stampProvenance(
    cell: VoxelCellInput,
    source: string,
    opts: StampOptions = {},
): VoxelProvenance {
    const cls = classifyCell(cell, opts);
    const timestamp = isFiniteNumber(opts.now)
        ? (opts.now as number)
        : isFiniteNumber(cell.timestamp)
          ? (cell.timestamp as number)
          : Date.now();

    return Object.freeze({
        cellId: isFiniteNumber(cell.cellId) ? Math.max(0, Math.floor(cell.cellId as number)) : 0,
        source: typeof source === 'string' ? source : '',
        timestamp,
        method: classMethod(cls, cell.method),
        confidence: CLASS_CONFIDENCE[cls],
    });
}

/**
 * Constrói o canal paralelo `Uint8Array` de proveniência (RF-1) a partir de
 * uma lista de células, na ordem dos cellId. Cada posição recebe o enum
 * PROVENANCE_CLASS da célula; células ausentes/inválidas → NO_DATA.
 *
 * @param cells  células a classificar (idealmente uma por índice do grid)
 * @param total  tamanho do canal (nº de voxels); default = cells.length
 * @param opts   corte de variância (RF-4)
 */
export function buildProvenanceChannel(
    cells: ReadonlyArray<VoxelCellInput> | null | undefined,
    total?: number,
    opts: StampOptions = {},
): Uint8Array {
    const list = cells ?? [];
    const size = isFiniteNumber(total) ? Math.max(0, Math.floor(total as number)) : list.length;
    const out = new Uint8Array(size);
    out.fill(PROVENANCE_CLASS.NO_DATA);
    for (let i = 0; i < list.length; i++) {
        const cell = list[i];
        if (!cell) continue;
        const idx = isFiniteNumber(cell.cellId) ? Math.floor(cell.cellId as number) : i;
        if (idx < 0 || idx >= size) continue;
        out[idx] = classifyCell(cell, opts);
    }
    return out;
}

function isValidRecord(v: unknown): v is VoxelProvenance {
    if (typeof v !== 'object' || v === null) return false;
    const r = v as Record<string, unknown>;
    if (!isFiniteNumber(r.cellId) || (r.cellId as number) < 0 || !Number.isInteger(r.cellId)) return false;
    if (!isFiniteNumber(r.confidence) || (r.confidence as number) < 0 || (r.confidence as number) > 1) return false;
    if (!isFiniteNumber(r.timestamp) || (r.timestamp as number) < 0) return false;
    if (typeof r.method !== 'string' || r.method.length === 0) return false;
    if (typeof r.source !== 'string' || r.source.length === 0) return false;
    return true;
}

/**
 * Valida uma cadeia de proveniência (registros ordenados por cellId).
 *
 * Uma cadeia é válida quando: todos os registros são bem-formados
 * (cellId inteiro ≥0, confidence em [0,1], timestamp ≥0, method/source
 * não-vazios), os cellId são estritamente crescentes (ordem do grid, sem
 * duplicatas) e os timestamps são não-decrescentes (proveniência não volta
 * no tempo). Cadeia vazia é trivialmente válida; null/undefined é inválida.
 */
export function validateProvenanceChain(voxels: ReadonlyArray<VoxelProvenance> | null | undefined): boolean {
    if (voxels == null) return false;
    if (voxels.length === 0) return true;

    let prevCellId = -1;
    let prevTimestamp = -1;
    for (let i = 0; i < voxels.length; i++) {
        const v = voxels[i];
        if (!isValidRecord(v)) return false;
        if (v.cellId <= prevCellId) return false;
        if (v.timestamp < prevTimestamp) return false;
        prevCellId = v.cellId;
        prevTimestamp = v.timestamp;
    }
    return true;
}
