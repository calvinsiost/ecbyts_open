// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Optimization - Genetic Algorithm Core
// ADR: ADR-023

/* ================================================================
   GENETIC ALGORITHM — Motor de otimizacao prescritiva.

   Operadores:
   - Selecao: torneio (k=3)
   - Crossover: uniforme (p=0.5 por gene)
   - Mutacao: gaussiana com sigma decrescente + repair
   - Elitismo: preserva top 5%

   Cromossomo: array de genes { x, z, familyId, depth }
   Cada gene representa um ponto candidato de monitoramento.

   PRNG: mulberry32 para reproducibilidade deterministica.
   ================================================================ */

// ----------------------------------------------------------------
// PRNG - mulberry32 (deterministic, seedable)
// ----------------------------------------------------------------

/**
 * Mulberry32 PRNG - gera numeros pseudo-aleatorios deterministicos.
 *
 * @param {number} seed
 * @returns {Function} - () => number [0, 1)
 */
function mulberry32(seed: number): Function {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ----------------------------------------------------------------
// GENETIC ALGORITHM
// ----------------------------------------------------------------

/**
 * @typedef {Object} Gene
 * @property {number} x - Coordenada X
 * @property {number} z - Coordenada Z
 * @property {string} familyId - Familia do elemento ('well')
 * @property {number} depth - Profundidade em metros
 */

/**
 * @typedef {Object} Individual
 * @property {Gene[]} genes - Cromossomo (array de candidatos)
 * @property {number} fitness - Valor de fitness (-Infinity se invalido)
 */

/**
 * @typedef {Object} GAConfig
 * @property {number} numCandidates - Pontos por individuo
 * @property {Object} bounds - { minX, maxX, minZ, maxZ }
 * @property {number} populationSize - Tamanho da populacao
 * @property {number} generations - Numero maximo de geracoes
 * @property {number} tournamentSize - Tamanho do torneio
 * @property {number} mutationSigma - Sigma inicial da mutacao gaussiana
 * @property {number} elitismPercent - Percentual de elitismo (0-100)
 * @property {number} stagnationLimit - Geracoes sem melhora para parar
 * @property {number} [seed=42] - Seed do PRNG
 * @property {number[]} [depthRange=[15,80]] - Range de profundidade
 * @property {Function} fitnessFunction - (genes) => number
 * @property {Function} [onProgress] - (gen, bestFitness, avgFitness) => void
 * @property {Function} [isCancelled] - () => boolean
 */

interface Gene {
    x: number;
    z: number;
    familyId: string;
    depth: number;
}

interface Individual {
    genes: Gene[];
    fitness: number;
}

interface GAConfig {
    numCandidates: number;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    populationSize: number;
    generations: number;
    tournamentSize: number;
    mutationSigma: number;
    elitismPercent: number;
    stagnationLimit: number;
    seed?: number;
    depthRange?: number[];
    fitnessFunction: (genes: Gene[]) => number;
    onProgress?: (gen: number, bestFitness: number, avgFitness: number) => void;
    isCancelled?: () => boolean;
}

/**
 * Executa o algoritmo genetico.
 *
 * @param {GAConfig} config
 * @returns {{ best: Individual, stats: Object }}
 */
export function runGA(config: GAConfig): { best: Individual, stats: Object } {
    const {
        numCandidates,
        bounds,
        populationSize = 100,
        generations = 500,
        tournamentSize = 3,
        mutationSigma = 5,
        elitismPercent = 5,
        stagnationLimit = 50,
        seed = 42,
        depthRange = [15, 80],
        fitnessFunction,
        onProgress = () => {},
        isCancelled = () => false,
    } = config;

    const rand = mulberry32(seed);
    const eliteCount = Math.max(1, Math.floor((populationSize * elitismPercent) / 100));

    // Inicializa populacao
    let population = [];
    for (let i = 0; i < populationSize; i++) {
        population.push(createRandomIndividual(numCandidates, bounds, depthRange, rand));
    }

    // Avalia fitness inicial
    evaluatePopulation(population, fitnessFunction);

    let bestEver = getBest(population);
    let stagnation = 0;

    // Loop evolutivo
    for (let gen = 0; gen < generations; gen++) {
        if (isCancelled()) break;

        // Sigma decrescente (cooling schedule)
        const sigma = mutationSigma * (1 - (gen / generations) * 0.8);

        // Ordena por fitness (maior = melhor)
        population.sort((a: any, b: any) => b.fitness - a.fitness);

        // Elitismo: preserva os melhores
                const newPopulation: any[]= population.slice(0, eliteCount).map((ind: any) => ({
            genes: ind.genes.map((g: any) => ({ ...g })),
            fitness: ind.fitness,
        }));

        // Gera resto da populacao via selecao + crossover + mutacao
        while (newPopulation.length < populationSize) {
            const parent1 = tournamentSelect(population, tournamentSize, rand);
            const parent2 = tournamentSelect(population, tournamentSize, rand);
            let child = uniformCrossover(parent1, parent2, rand);
            child = gaussianMutate(child, sigma, bounds, depthRange, rand);
            newPopulation.push(child);
        }

        population = newPopulation;

        // Avalia nova populacao
        evaluatePopulation(population, fitnessFunction);

        const currentBest = getBest(population);
        const avgFitness =
            population.reduce(
                (s: any, ind: any) =>
                    s + (isFinite((ind as any).fitness) ? ind.fitness : 0),
                0,
            ) / population.filter((ind: any) => isFinite((ind as any).fitness)).length;

        // Tracking de melhora
        if (currentBest.fitness > bestEver.fitness) {
            bestEver = {
                genes: currentBest.genes.map((g: any) => ({ ...g })),
                fitness: currentBest.fitness,
            };
            stagnation = 0;
        } else {
            stagnation++;
        }

        onProgress(gen, bestEver.fitness, avgFitness);

        // Early stopping por estagnacao
        if (stagnation >= stagnationLimit) break;
    }

    return {
        best: bestEver,
        stats: {
            generations: Math.min(stagnation >= stagnationLimit ? population.length : generations, generations),
            finalFitness: bestEver.fitness,
            stagnatedAt: stagnation >= stagnationLimit ? stagnation : null,
        },
    };
}

// ----------------------------------------------------------------
// OPERADORES GENETICOS
// ----------------------------------------------------------------

/**
 * Cria individuo aleatorio dentro dos bounds.
 */
function createRandomIndividual(
    numGenes: any,
    bounds: any,
    depthRange: any,
    rand: any,
) {
    const genes = [];
    for (let i = 0; i < numGenes; i++) {
        genes.push({
            x: bounds.minX + rand() * (bounds.maxX - bounds.minX),
            z: bounds.minZ + rand() * (bounds.maxZ - bounds.minZ),
            familyId: 'well',
            depth: depthRange[0] + rand() * (depthRange[1] - depthRange[0]),
        });
    }
    return { genes, fitness: -Infinity };
}

/**
 * Selecao por torneio.
 */
function tournamentSelect(population: any, k: any, rand: any) {
    let best = null;
    for (let i = 0; i < k; i++) {
        const idx = Math.floor(rand() * population.length);
        if (best === null || population[idx].fitness > best.fitness) {
            best = population[idx];
        }
    }
    return best;
}

/**
 * Crossover uniforme: para cada gene, escolhe de parent1 ou parent2 com p=0.5.
 */
function uniformCrossover(parent1: any, parent2: any, rand: any) {
    const genes = parent1.genes.map((g: any, i: any) => {
        if (rand() < 0.5) {
            return { ...g };
        }
        return { ...parent2.genes[i] };
    });
    return { genes, fitness: -Infinity };
}

/**
 * Mutacao gaussiana: adiciona ruido N(0, sigma) a x e z.
 * Repair: clampa nos bounds.
 */
function gaussianMutate(
    individual: any,
    sigma: any,
    bounds: any,
    depthRange: any,
    rand: any,
) {
    const genes = individual.genes.map((g: any) => {
        // Box-Muller transform para normal distribution
        const u1 = rand();
        const u2 = rand();
        const z0 = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
        const z1 = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.sin(2 * Math.PI * u2);

        let newX = g.x + z0 * sigma;
        let newZ = g.z + z1 * sigma;
        let newDepth = g.depth + (rand() - 0.5) * sigma;

        // Repair: clampa nos bounds
        newX = Math.max(bounds.minX, Math.min(bounds.maxX, newX));
        newZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, newZ));
        newDepth = Math.max(depthRange[0], Math.min(depthRange[1], newDepth));

        return { x: newX, z: newZ, familyId: g.familyId, depth: Math.round(newDepth) };
    });

    return { genes, fitness: -Infinity };
}

/**
 * Avalia fitness de toda a populacao.
 */
function evaluatePopulation(population: any, fitnessFunction: any) {
    for (const ind of population) {
        if (ind.fitness === -Infinity) {
            ind.fitness = fitnessFunction(ind.genes);
        }
    }
}

/**
 * Retorna melhor individuo da populacao.
 */
function getBest(population: any) {
    let best = population[0];
    for (let i = 1; i < population.length; i++) {
        if (population[i].fitness > best.fitness) best = population[i];
    }
    return best;
}
