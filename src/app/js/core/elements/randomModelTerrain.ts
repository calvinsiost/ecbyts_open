// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Extracted from app/js/core/elements/randomModel.js in ARCH-MONO-001 Phase 9a.
//
// Synthetic terrain + river + water table procedural helpers.
// Zero CDN, pure math, zero module-level state.
// Called from the random-model generation pipeline.

/**
 * Terreno sintetico procedural (3 octaves, 0-20m variacao).
 * Zero CDN - funciona 100% offline.
 *
 * @param {number} value - Coordenada X de cena
 * @param {number} z - Coordenada Z de cena
 * @param {number} halfW - Metade da largura do boundary
 * @param {number} halfL - Metade do comprimento do boundary
 * @returns {number} Elevacao do terreno em metros
 */
import { runtimeRandom } from '../random/runtime.js';

/** @param {number} value */
function clampTerrainElevation(value: number) {
    return Math.max(1, Math.min(29, value));
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} halfW
 * @param {number} halfL
 */
export function syntheticTerrainElevation(x: number, z: number, halfW: number, halfL: number) {
    const safeHalfW = Math.max(Math.abs(halfW), 1);
    const safeHalfL = Math.max(Math.abs(halfL), 1);
    const nx = x / safeHalfW;
    const nz = z / safeHalfL;
    const radial = Math.min(1, Math.sqrt(nx * nx + nz * nz));

    // Mantem a faixa classica (~1-29m), mas com macro-formas mais heroicas:
    // uma dobra diagonal, uma depressao suave e um contraforte lateral.
    const macroFold = 6.8 * Math.sin((nx * 0.85 + nz * 0.22) * Math.PI) * Math.cos((nz * 0.75 - nx * 0.18) * Math.PI);
    const diagonalRidge = 4.5 * Math.sin((nx - nz) * Math.PI * 1.15 + 0.6);
    const basin = -4.2 * Math.exp(-((nx - 0.26) ** 2 * 7.5 + (nz + 0.08) ** 2 * 10.5));
    const knoll = 3.4 * Math.exp(-((nx + 0.42) ** 2 * 12 + (nz - 0.34) ** 2 * 14));
    const microRelief =
        1.9 * Math.sin(nx * 4.6 + 1.1) * Math.cos(nz * 3.8 + 0.7) + 1.2 * Math.sin((nx + nz) * 6.1 - 0.4);
    const edgeFalloff = -2.3 * radial * radial;

    return clampTerrainElevation(14 + macroFold + diagonalRidge + basin + knoll + microRelief + edgeFalloff);
}

/** @param {ArrayLike<number> | null | undefined} grid */
export function computeTerrainGridStats(grid: ArrayLike<number> | null | undefined) {
    if (!grid?.length) {
        return { min: 0, max: 0, mean: 0 };
    }

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = 0; i < grid.length; i++) {
        const value = Number(grid[i]) || 0;
        if (value < min) min = value;
        if (value > max) max = value;
        sum += value;
    }
    return { min, max, mean: sum / grid.length };
}

/**
 * @param {any} bounds
 * @param {any} gridSize
 */
export function buildSyntheticTerrainGrid(bounds: any, gridSize: any) {
    const cols = Math.max(2, Number(gridSize?.cols) || 2);
    const rows = Math.max(2, Number(gridSize?.rows) || 2);
    const minX = Number(bounds?.minX) || 0;
    const maxX = Number(bounds?.maxX) || 0;
    const minZ = Number(bounds?.minZ) || 0;
    const maxZ = Number(bounds?.maxZ) || 0;
    const halfW = Math.max(Math.abs(maxX - minX) / 2, 1);
    const halfL = Math.max(Math.abs(maxZ - minZ) / 2, 1);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const grid = new Float32Array(rows * cols);

    for (let r = 0; r < rows; r++) {
        const z = minZ + (r / Math.max(rows - 1, 1)) * (maxZ - minZ);
        for (let c = 0; c < cols; c++) {
            const x = minX + (c / Math.max(cols - 1, 1)) * (maxX - minX);
            grid[r * cols + c] = syntheticTerrainElevation(x - centerX, z - centerZ, halfW, halfL);
        }
    }

    return grid;
}

/**
 * @param {ArrayLike<number> | null | undefined} baseGrid
 * @param {any} bounds
 * @param {any} gridSize
 * @param {{ baseStats?: { min: number, max: number, mean: number } }} [opts]
 */
export function enhanceTerrainGridRelief(
    baseGrid: ArrayLike<number> | null | undefined,
    bounds: any,
    gridSize: any,
    opts: { baseStats?: { min: number; max: number; mean: number } } = {},
) {
    if (!baseGrid?.length) return null;

    const baseStats = opts.baseStats || computeTerrainGridStats(baseGrid);
    const baseRange = Math.max(0, baseStats.max - baseStats.min);

    let reliefBlend = 0.08;
    if (baseRange < 0.75) reliefBlend = 0.86;
    else if (baseRange < 3) reliefBlend = 0.64;
    else if (baseRange < 6) reliefBlend = 0.42;
    else if (baseRange < 12) reliefBlend = 0.22;

    const heroGrid = buildSyntheticTerrainGrid(bounds, gridSize);
    const heroStats = computeTerrainGridStats(heroGrid);
    const heroMean = heroStats.mean;
    const heroGain = baseRange < 6 ? 0.95 : 0.78;
    const enhanced = new Float32Array(baseGrid.length);

    for (let i = 0; i < baseGrid.length; i++) {
        const baseValue = Number(baseGrid[i]) || 0;
        const heroCentered = ((heroGrid[i] || 0) - heroMean) * heroGain;
        enhanced[i] = baseValue * (1 - reliefBlend) + heroCentered * reliefBlend;
    }

    return {
        grid: enhanced,
        stats: computeTerrainGridStats(enhanced),
        reliefBlend,
    };
}

/**
 * Calcula o gradiente de elevacao em um ponto (derivada parcial).
 * Usado para determinar a direcao de fluxo do rio.
 *
 * @param {number} x - Coordenada X
 * @param {number} z - Coordenada Z
 * @param {number} halfW - Metade da largura do boundary
 * @param {number} halfL - Metade do comprimento do boundary
 * @returns {{dx: number, dz: number}} Componentes do gradiente (dE/dx, dE/dz)
 */
export function terrainGradient(
    x: number,
    z: number,
    halfW: number,
    halfL: number,
): { dx: number; dz: number } {
    const step = 1.0; // passo pequeno para derivada numerica
    const e = syntheticTerrainElevation(x, z, halfW, halfL);
    const ex = syntheticTerrainElevation(x + step, z, halfW, halfL);
    const ez = syntheticTerrainElevation(x, z + step, halfW, halfL);
    return { dx: (ex - e) / step, dz: (ez - e) / step };
}

/**
 * Clamp de coordenadas para manter o rio dentro da area visivel do bloco 3D.
 *
 * @param {number} x - Coordenada X
 * @param {number} z - Coordenada Z
 * @param {number} halfW - Metade da largura do boundary
 * @param {number} halfL - Metade do comprimento do boundary
 * @param {number} visibleRatio - Fracao visivel interna (0-1)
 * @returns {{x: number, z: number}} Coordenadas clampadas
 */
export function clampRiverToVisibleArea(
    x: number,
    z: number,
    halfW: number,
    halfL: number,
    visibleRatio: number = 0.8,
): { x: number; z: number } {
    const ratio = Math.max(0.55, Math.min(0.95, visibleRatio));
    return {
        x: Math.max(-halfW * ratio, Math.min(halfW * ratio, x)),
        z: Math.max(-halfL * ratio, Math.min(halfL * ratio, z)),
    };
}

/**
 * Gera caminho de um rio seguindo a descida natural do terreno.
 * O rio sempre flui de montante (mais alto) para jusante (mais baixo).
 *
 * @param {{x: number, z: number}} start - Ponto de origem {x, z}
 * @param {number} numPoints - Numero de pontos no caminho
 * @param {number} stepSize - Distancia entre pontos
 * @param {number} halfW - Metade da largura do boundary
 * @param {number} halfL - Metade do comprimento do boundary
 * @param {{visibleRatio?: number}} [opts] - Opcoes de visibilidade
 * @returns {Array<{x: number, y: number, z: number}>} Caminho do rio com elevacoes
 */
export function generateRiverPath(
    start: { x: number; z: number },
    numPoints: number,
    stepSize: number,
    halfW: number,
    halfL: number,
    opts: { visibleRatio?: number } = {},
): Array<{ x: number; y: number; z: number }> {
    const visibleRatio = opts.visibleRatio ?? 0.8;
    const startPos = clampRiverToVisibleArea(start.x, start.z, halfW, halfL, visibleRatio);
    const path: Array<{ x: number; y: number; z: number }> = [];
    let x = startPos.x;
    let z = startPos.z;

    for (let i = 0; i < numPoints; i++) {
        const y = syntheticTerrainElevation(x, z, halfW, halfL);
        path.push({ x, y, z });

        // Calcula o gradiente (direcao de maior subida)
        const grad = terrainGradient(x, z, halfW, halfL);
        const gradMag = Math.sqrt(grad.dx * grad.dx + grad.dz * grad.dz);

        if (gradMag < 0.001) {
            // Terreno plano, adiciona pequena perturbacao aleatoria
            x += (runtimeRandom('terrain') - 0.5) * stepSize * 0.5;
            z += (runtimeRandom('terrain') - 0.5) * stepSize * 0.5;
        } else {
            // Move na direcao oposta ao gradiente (descida)
            const nx = -grad.dx / gradMag;
            const nz = -grad.dz / gradMag;

            // Adiciona um pouco de meandros naturais (senoide perpendicular ao fluxo)
            const meander = Math.sin(i * 0.5) * 0.3;
            const mx = -nz * meander; // perpendicular ao gradiente
            const mz = nx * meander;

            x += (nx + mx) * stepSize;
            z += (nz + mz) * stepSize;
        }

        // Garante que o rio permaneça na janela visivel interna do bloco 3D
        const clamped = clampRiverToVisibleArea(x, z, halfW, halfL, visibleRatio);
        x = clamped.x;
        z = clamped.z;
    }

    return path;
}

/**
 * Encontra um ponto de origem adequado para o rio (regiao mais elevada na zona natural).
 *
 * @param {{x: number, z: number}} center - Centro da zona natural {x, z}
 * @param {number} spread - Raio de busca
 * @param {number} halfW - Metade da largura do boundary
 * @param {number} halfL - Metade do comprimento do boundary
 * @param {{visibleRatio?: number}} [opts] - Opcoes de visibilidade
 * @returns {{x: number, z: number, elevation: number}} Ponto de origem mais elevado
 */
export function findRiverSource(
    center: { x: number; z: number },
    spread: number,
    halfW: number,
    halfL: number,
    opts: { visibleRatio?: number } = {},
): { x: number; z: number; elevation: number } {
    const visibleRatio = opts.visibleRatio ?? 0.8;
    const samples = 12;
    const start = clampRiverToVisibleArea(center.x, center.z, halfW, halfL, visibleRatio);
    let best = {
        x: start.x,
        z: start.z,
        elevation: syntheticTerrainElevation(start.x, start.z, halfW, halfL),
    };

    for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const dist = spread * (0.35 + runtimeRandom('terrain') * 0.65);
        const x = center.x + Math.cos(angle) * dist;
        const z = center.z + Math.sin(angle) * dist;

        // Clamp para a area visivel interna do bloco
        const { x: cx, z: cz } = clampRiverToVisibleArea(x, z, halfW, halfL, visibleRatio);

        const elevation = syntheticTerrainElevation(cx, cz, halfW, halfL);
        if (elevation > best.elevation) {
            best = { x: cx, z: cz, elevation };
        }
    }

    return best;
}

/**
 * Nivel d'agua sintetico - raso perto de corpos d'agua, profundo longe.
 *
 * @param {number} terrainY - Elevacao do terreno
 * @param {number} distToWater - Distancia ao corpo d'agua mais proximo (m)
 * @returns {number} Elevacao do nivel d'agua (metros, abaixo do terreno)
 */
export function syntheticWaterTable(terrainY: number, distToWater: number): number {
    const baseDepth = 3 + 9 * Math.min(1, distToWater / 200);
    return terrainY - baseDepth;
}
