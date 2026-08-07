// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Optimization - Web Worker
// ADR: ADR-023

/* ================================================================
   OPTIMIZATION WORKER — Executa GA em thread separada.

   Protocolo:
   - Input:  { id, action: 'run', config: {...} }
   - Output: { id, type: 'progress', gen, bestFitness, avgFitness }
   - Output: { id, type: 'result', best, stats }
   - Output: { id, type: 'error', message }
   - Input:  { id, action: 'cancel' }
   ================================================================ */

// Worker context - importa modulos
let cancelled = false;

self.onmessage = async function (e) {
    const { id, action, config } = e.data;

    if (action === 'cancel') {
        cancelled = true;
        return;
    }

    if (action === 'run') {
        cancelled = false;
        try {
            const result = await runOptimizationInWorker(id, config);
            self.postMessage({ id, type: 'result', ...result });
        } catch (err) {
            self.postMessage({ id, type: 'error', message: (err as any).message });
        }
    }
};

/**
 * Executa otimizacao dentro do worker.
 * Reimplementa GA inline para evitar problemas de import em workers.
 */
async function runOptimizationInWorker(id: any, config: any) {
    const {
        existingPoints,
        bounds,
        numCandidates,
        maxBudget,
        costDefaults,
        avgAnalyticalCost = 200,
        numReadingsPerYear = 4,
        horizonYears = 5,
        escalationRate = 0.05,
        appZones = [],
        weights = { uncertainty: 0.7, cost: 0.3 },
        populationSize = 100,
        generations = 500,
        tournamentSize = 3,
        mutationSigma = 5,
        elitismPercent = 5,
        stagnationLimit = 50,
        seed = 42,
        depthRange = [15, 80],
    } = config;

    // PRNG
    let prngState = seed;
    function rand() {
        let t = (prngState += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Uncertainty helpers
    const maxDist = Math.sqrt(Math.pow(bounds.maxX - bounds.minX, 2) + Math.pow(bounds.maxZ - bounds.minZ, 2));

    function uncertaintyAt(x: any, z: any, points: any) {
        if (points.length === 0) return 1;
        const distances = points.map((p: any) => Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2));
        distances.sort((a: any, b: any) => a - b);
        const k = Math.min(5, distances.length);
        let sum = 0;
        for (let i = 0; i < k; i++) sum += distances[i];
        return Math.min(sum / k / maxDist, 1);
    }

    // Fitness function
    function evaluate(genes: any) {
        let totalCost = 0;
        for (const g of genes) {
            const capex = costDefaults.drilling * g.depth + costDefaults.installation;
            let opex = 0;
            for (let y = 1; y <= horizonYears; y++) {
                opex += numReadingsPerYear * avgAnalyticalCost * Math.pow(1 + escalationRate, y - 1);
            }
            totalCost += capex + opex;
        }
        if (totalCost > maxBudget) return -Infinity;

        // APP check (ray casting)
        for (const g of genes) {
            for (const zone of appZones) {
                if (pointInPoly(g.x, g.z, zone.polygon || [])) return -Infinity;
            }
        }

        const all = [...existingPoints];
        let uncSum = 0;
        for (const g of genes) {
            uncSum += uncertaintyAt(g.x, g.z, all);
            all.push({ x: g.x, z: g.z });
        }
        const avgUnc = uncSum / genes.length;
        const costEff = 1 - totalCost / maxBudget;

        return weights.uncertainty * avgUnc + weights.cost * costEff;
    }

    function pointInPoly(x: any, y: any, poly: any) {
        if (poly.length < 3) return false;
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0],
                yi = poly[i][1];
            const xj = poly[j][0],
                yj = poly[j][1];
            if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    // GA operators
    function createRandom() {
        const genes = [];
        for (let i = 0; i < numCandidates; i++) {
            genes.push({
                x: bounds.minX + rand() * (bounds.maxX - bounds.minX),
                z: bounds.minZ + rand() * (bounds.maxZ - bounds.minZ),
                familyId: 'well',
                depth: Math.round(depthRange[0] + rand() * (depthRange[1] - depthRange[0])),
            });
        }
        return { genes, fitness: -Infinity };
    }

    function tournament(pop: any) {
        let best = null;
        for (let i = 0; i < tournamentSize; i++) {
            const idx = Math.floor(rand() * pop.length);
            if (best === null || pop[idx].fitness > best.fitness) best = pop[idx];
        }
        return best;
    }

    function crossover(p1: any, p2: any) {
        return {
            genes: p1.genes.map((g: any, i: any) =>
                rand() < 0.5 ? { ...g } : { ...p2.genes[i] },
            ),
            fitness: -Infinity,
        };
    }

    function mutate(ind: any, sigma: any) {
        return {
            genes: ind.genes.map((g: any) => {
                const u1 = rand(),
                    u2 = rand();
                const z0 = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
                const z1 = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.sin(2 * Math.PI * u2);
                return {
                    x: Math.max(bounds.minX, Math.min(bounds.maxX, g.x + z0 * sigma)),
                    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, g.z + z1 * sigma)),
                    familyId: g.familyId,
                    depth: Math.round(
                        Math.max(depthRange[0], Math.min(depthRange[1], g.depth + (rand() - 0.5) * sigma)),
                    ),
                };
            }),
            fitness: -Infinity,
        };
    }

    // Initialize population
    let pop = [];
    for (let i = 0; i < populationSize; i++) pop.push(createRandom());
    for (const ind of pop) ind.fitness = evaluate(ind.genes);

    let bestEver = { genes: pop[0]!.genes.map((g: any) => ({ ...g })), fitness: pop[0]!.fitness };
    for (const ind of pop) {
        if (ind.fitness > bestEver.fitness) {
            bestEver = { genes: ind.genes.map((g) => ({ ...g })), fitness: ind.fitness };
        }
    }

    let stagnation = 0;
    const eliteCount = Math.max(1, Math.floor((populationSize * elitismPercent) / 100));
    const startTime = Date.now();

    // Evolution loop
    for (let gen = 0; gen < generations; gen++) {
        if (cancelled) break;

        const sigma = mutationSigma * (1 - (gen / generations) * 0.8);
        pop.sort((a: any, b: any) => b.fitness - a.fitness);

                const newPop: any[]= pop.slice(0, eliteCount).map((ind: any) => ({
            genes: ind.genes.map((g: any) => ({ ...g })),
            fitness: ind.fitness,
        }));

        while (newPop.length < populationSize) {
            const p1 = tournament(pop);
            const p2 = tournament(pop);
            let child = crossover(p1, p2);
            child = mutate(child, sigma);
            child.fitness = evaluate(child.genes);
            newPop.push(child);
        }

        pop = newPop;

        const currentBest = pop.reduce(
            (b: any, ind: any) => ((ind as any).fitness > b.fitness ? ind : b),
            pop[0],
        );
        const validPop = pop.filter((ind: any) => isFinite((ind as any).fitness));
        const avgFitness =
            validPop.length > 0
                ? validPop.reduce((s: any, ind: any) => s + ind.fitness, 0) /
                  validPop.length
                : 0;

        if (currentBest.fitness > bestEver.fitness) {
            bestEver = {
                genes: currentBest.genes.map((g: any) => ({ ...g })),
                fitness: currentBest.fitness,
            };
            stagnation = 0;
        } else {
            stagnation++;
        }

        // Report progress every 10 generations
        if (gen % 10 === 0) {
            self.postMessage({
                id,
                type: 'progress',
                gen,
                bestFitness: bestEver.fitness,
                avgFitness,
            });
        }

        if (stagnation >= stagnationLimit) break;
    }

    return {
        best: bestEver,
        stats: {
            convergenceMs: Date.now() - startTime,
            stagnatedAt: stagnation >= stagnationLimit ? stagnation : null,
        },
    };
}
