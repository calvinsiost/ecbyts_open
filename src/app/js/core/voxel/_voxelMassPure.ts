// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VOXEL MASS PURE — Plume mass-in-place by voxel summation.

   Integração volumétrica de um campo escalar (canal de concentração)
   sobre o grid de voxels para obter MASSA TOTAL em vigor (mass-in-place)
   e VOLUME do plume (bulk volume acima de um limiar). É a forma discreta
   do integral de volume:

       M = ∫∫∫ C(x,y,z) dV  ≈  Σ_i  C_i · V_cell
       V_plume = N_{C ≥ thr} · V_cell

   onde V_cell = resolution³ (voxel cúbico, layout de engine.ts) e o índice
   segue `idx = iz·(ny·nx) + iy·nx + ix`. Complementa countByZone (só conta
   células) e channelStats (média/min/max) — nenhum dos dois integra o campo
   em massa nem mede o volume do plume.

   PUREZA: recebe TypedArrays/escalares; sem DOM, Three.js ou I/O.
   Determinístico: mesma entrada → mesma saída.

   PROVENANCE / referência canônica:
     - Forma fechada validada: campo uniforme C₀ num cubo de volume V →
       M = C₀·V (exato); volume do plume = V quando thr ≤ C₀, 0 quando thr > C₀.
     - U.S. EPA (1989) "A Guide to the Selection of Materials ..." e a
       prática padrão de mass-in-place estimation em águas subterrâneas:
       ITRC (2010) "Use and Measurement of Mass Flux and Mass Discharge",
       cap. 3 — soma de massa por células do modelo conceitual
       M = Σ (C_i · θ · V_i) com θ = porosidade (aqui passada como `porosity`).
     - Mid-point (rectangle/Riemann) rule para o integral de volume:
       Press et al., "Numerical Recipes", 3rd ed., §4.1.
   ================================================================ */

import { resolveThresholdValue } from './_regulatoryThresholdPure.js';

export interface VoxelMassResult {
    /** Massa total integrada na mesma unidade de (concentração × volume × porosidade). */
    readonly mass: number;
    /** Nº de voxels que entraram na soma (após máscara/limiar). */
    readonly countedVoxels: number;
    /** Volume de UM voxel (resolution³). */
    readonly voxelVolume: number;
    /** Volume bulk do plume = countedVoxels · voxelVolume. */
    readonly plumeVolume: number;
    /** RF-6: proveniência do limiar regulatório (ex.: "Arsênio VI=35 mg/kg (CONAMA-420)"). */
    readonly thresholdProvenance?: string;
}

/** Opções da integração. Todas opcionais; defaults = integração simples. */
export interface VoxelMassOptions {
    /**
     * Porosidade efetiva θ (fração 0..1) — para massa dissolvida em meio poroso,
     * a massa por célula é C·θ·V. Default 1 (sem ajuste; ex.: ar livre / lago).
     */
    readonly porosity?: number;
    /**
     * Limiar de concentração: só células com `concentration[idx] >= threshold`
     * contam para massa E volume. Default 0 (todas as células finitas ≥ 0).
     * Use para delimitar o plume por um nível de ação (ex.: VI/CETESB).
     */
    readonly threshold?: number;
    /**
     * RF-6: referência regulatória como alternativa ao threshold numérico.
     * Quando provido, resolve VR/VP/VI do catálogo CONAMA-420/CETESB-DD-256
     * e usa o valor como limiar. `threshold` numérico tem precedência se ambos
     * forem fornecidos.
     */
    readonly thresholdRef?: { readonly parameterId: string; readonly matrix?: string; readonly level?: 'VR' | 'VP' | 'VI' };
    /**
     * Máscara opcional de zona (mesmo layout/tamanho do canal). Quando provida,
     * apenas voxels com `zoneMask[idx] === zoneId` são integrados. Permite
     * "massa só na zona SATURATED", por exemplo.
     */
    readonly zoneMask?: Uint8Array | null;
    /** Zona alvo quando `zoneMask` é provida. Default: ignora máscara. */
    readonly zoneId?: number;
    /**
     * RF-5 (SPEC_VOXEL_PIPELINE) — canal de carimbos de superfície
     * (Uint8Array alinhado ao grid; ver _airBlocksPure.stampAirBlocks).
     * Células carimbadas como fora do modelo são EXCLUÍDAS da massa/volume
     * por default — air blocks nunca entram na soma silenciosamente.
     */
    readonly surfaceStamps?: Uint8Array | null;
    /**
     * RF-5 — true inclui células fora do modelo (transparência explícita
     * do usuário). Default false (exclui ABOVE_SURFACE/BELOW_MODEL).
     */
    readonly includeOutOfModel?: boolean;
    /**
     * Carimbos tratados como fora do modelo quando `surfaceStamps` é
     * provida. Default [1, 2] = ABOVE_SURFACE/BELOW_MODEL (contrato com
     * _airBlocksPure.SURFACE_STAMP).
     */
    readonly excludedStamps?: ArrayLike<number> | null;
}

function resolveVoxelVolume(resolution: number): number {
    const res = Number(resolution);
    return Number.isFinite(res) && res > 0 ? res * res * res : 0;
}

interface VoxelIntegrationParams {
    readonly porosity: number;
    readonly threshold: number;
    readonly thresholdProvenance: string | undefined;
    readonly mask: Uint8Array | null;
    readonly useMask: boolean;
    readonly zoneId: number;
    readonly surfaceStamps: Uint8Array | null;
    readonly excludedStamps: ArrayLike<number> | null;
}

/** Default RF-5: 1 = ABOVE_SURFACE, 2 = BELOW_MODEL (_airBlocksPure.SURFACE_STAMP). */
const DEFAULT_EXCLUDED_STAMPS: ReadonlyArray<number> = Object.freeze([1, 2]);

function resolveVoxelParams(opts: VoxelMassOptions): VoxelIntegrationParams {
    const porosity = isFiniteNumber(opts.porosity) ? opts.porosity : 1;
    let threshold = isFiniteNumber(opts.threshold) ? opts.threshold : 0;
    let thresholdProvenance: string | undefined;
    if (!isFiniteNumber(opts.threshold) && opts.thresholdRef) {
        const resolved = resolveThresholdValue(opts.thresholdRef);
        if (resolved) {
            threshold = resolved.value;
            thresholdProvenance = resolved.provenance;
        }
    }
    const mask = opts.zoneMask ?? null;
    const useMask = mask != null && typeof opts.zoneId === 'number';
    const zoneId = opts.zoneId ?? 0;
    const surfaceStamps = opts.includeOutOfModel === true ? null : (opts.surfaceStamps ?? null);
    const excludedStamps = opts.excludedStamps ?? DEFAULT_EXCLUDED_STAMPS;
    return { porosity, threshold, thresholdProvenance, mask, useMask, zoneId, surfaceStamps, excludedStamps };
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isExcludedStamp(stamps: Uint8Array, excluded: ArrayLike<number> | null, i: number): boolean {
    if (excluded === null) return false;
    const s = stamps[i] ?? 0;
    for (let k = 0; k < excluded.length; k++) {
        if (s === excluded[k]) return true;
    }
    return false;
}

function sumCountableVoxels(
    arr: ArrayLike<number>,
    n: number,
    params: VoxelIntegrationParams,
): { sumC: number; counted: number } {
    const { threshold, mask, useMask, zoneId, surfaceStamps, excludedStamps } = params;
    let sumC = 0;
    let counted = 0;
    for (let i = 0; i < n; i++) {
        if (useMask && mask !== null && mask[i] !== zoneId) continue;
        if (surfaceStamps !== null && isExcludedStamp(surfaceStamps, excludedStamps, i)) continue;
        const c = Number(arr[i]);
        if (!Number.isFinite(c) || c < threshold) continue;
        sumC += c;
        counted++;
    }
    return { sumC, counted };
}

/**
 * Integra um campo escalar de concentração sobre voxels cúbicos para obter
 * massa-in-place total e volume do plume.
 *
 * Forma fechada de validação: para um campo uniforme C₀ em N voxels de aresta
 * `resolution`, mass = C₀ · θ · (N · resolution³) e plumeVolume = N · resolution³.
 *
 * @param concentration  campo escalar alinhado ao grid (Float32Array/number[])
 * @param resolution     aresta do voxel (cúbico); volume = resolution³
 * @param opts           porosidade, limiar, máscara de zona (ver VoxelMassOptions)
 * @returns VoxelMassResult com mass, plumeVolume e contagem
 */
export function integrateVoxelMass(
    concentration: ArrayLike<number> | null | undefined,
    resolution: number,
    opts: VoxelMassOptions = {},
): VoxelMassResult {
    const voxelVolume = resolveVoxelVolume(resolution);

    const arr = concentration;
    const n = arr?.length ?? 0;
    if (!arr || n === 0 || voxelVolume === 0) {
        return Object.freeze({ mass: 0, countedVoxels: 0, voxelVolume, plumeVolume: 0 });
    }

    const params = resolveVoxelParams(opts);
    const { sumC, counted } = sumCountableVoxels(arr, n, params);

    const mass = sumC * params.porosity * voxelVolume;
    const plumeVolume = counted * voxelVolume;
    const result: VoxelMassResult = { mass, countedVoxels: counted, voxelVolume, plumeVolume };
    if (params.thresholdProvenance) {
        return Object.freeze({ ...result, thresholdProvenance: params.thresholdProvenance });
    }
    return Object.freeze(result);
}

/**
 * Volume bulk do plume (sem massa): nº de voxels com concentração ≥ threshold,
 * vezes o volume do voxel. Atalho conveniente sobre integrateVoxelMass.
 *
 * Forma fechada: campo uniforme C₀ → V quando threshold ≤ C₀, senão 0.
 */
export function plumeVolume(
    concentration: ArrayLike<number> | null | undefined,
    resolution: number,
    threshold: number = 0,
): number {
    return integrateVoxelMass(concentration, resolution, { threshold }).plumeVolume;
}
