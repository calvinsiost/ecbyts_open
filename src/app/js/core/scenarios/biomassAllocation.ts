// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   BIOMASS ALLOCATION — pure-logic (ECBYTS-ENERGY-SCENARIOS-001#24).

   Alocacao otima de residuo de biomassa lignocelulosica entre rotas
   (energia, biochar, quimica fina) com preco-sombra por rota.

   O problema e um LP de maximizacao de receita com restricoes de
   capacidade por rota e restricao de massa total:

     max  Sum (pricePerTon_i * conversionYield_i * x_i)
     s.a. Sum x_i <= totalBiomass
          0 <= x_i <= maxFraction_i * totalBiomass   para toda rota i

   A solucao otima e gulosa (sort por densidade de valor decrescente,
   preencher ate capacidade) — exata para LP com apenas limites
   superiores e uma restricao de soma.

   Preco-sombra (shadow price) de cada rota:
   - Rota binding (no limite): quanto a receita total aumentaria se a
     capacidade daquela rota crescesse 1 t — equivale a densidade de
     valor da rota menos o custo de oportunidade da massa deslocada
     (a densidade da melhor rota que ficou de fora).
   - Rota nao-binding: 0 (folga > 0, relaxar nao muda o otimo).

   Rigor N3: entradas invalidas (totalBiomass <= 0, rotas vazias,
   fracoes que somam < 1 com massa sobrante) produzem resultado
   explicito com unallocated > 0 — nunca 0 forjado.

   ZERO DOM, ZERO IO, deterministico. Retornos congelados.
   ================================================================ */

export interface BiomassRoute {
    readonly id: string;
    readonly name: string;
    readonly maxFraction: number;
    readonly conversionYield: number;
}

export interface RoutePrice {
    readonly routeId: string;
    readonly pricePerTon: number;
}

export interface AllocationEntry {
    readonly routeId: string;
    readonly allocatedTons: number;
    readonly fraction: number;
    readonly revenue: number;
}

export interface ShadowPriceEntry {
    readonly routeId: string;
    readonly shadowPrice: number;
    readonly binding: boolean;
}

export interface AllocationResult {
    readonly allocation: readonly AllocationEntry[];
    readonly shadowPrices: readonly ShadowPriceEntry[];
    readonly optimalMix: Readonly<Record<string, number>>;
    readonly totalRevenue: number;
    readonly totalAllocated: number;
    readonly unallocated: number;
}

interface RouteValue {
    readonly route: BiomassRoute;
    readonly price: RoutePrice;
    readonly valueDensity: number;
    readonly capacityTons: number;
}

function buildRouteValues(
    routes: readonly BiomassRoute[],
    prices: readonly RoutePrice[],
    totalBiomass: number,
): RouteValue[] {
    const priceMap = new Map(prices.map((p) => [p.routeId, p]));
    const out: RouteValue[] = [];
    for (const route of routes) {
        const price = priceMap.get(route.id);
        if (!price) continue;
        out.push({
            route,
            price,
            valueDensity: price.pricePerTon * route.conversionYield,
            capacityTons: route.maxFraction * totalBiomass,
        });
    }
    out.sort((a, b) => b.valueDensity - a.valueDensity);
    return out;
}

export function allocateBiomass(
    totalBiomass: number,
    routes: readonly BiomassRoute[],
    prices: readonly RoutePrice[],
): AllocationResult {
    if (totalBiomass <= 0 || routes.length === 0) {
        return Object.freeze({
            allocation: Object.freeze([]),
            shadowPrices: Object.freeze([]),
            optimalMix: Object.freeze({}),
            totalRevenue: 0,
            totalAllocated: 0,
            unallocated: Math.max(0, totalBiomass),
        });
    }

    const ranked = buildRouteValues(routes, prices, totalBiomass);

    if (ranked.length === 0) {
        return Object.freeze({
            allocation: Object.freeze([]),
            shadowPrices: Object.freeze([]),
            optimalMix: Object.freeze({}),
            totalRevenue: 0,
            totalAllocated: 0,
            unallocated: totalBiomass,
        });
    }

    const allocMap = new Map<string, number>();
    let remaining = totalBiomass;

    for (const rv of ranked) {
        const take = Math.min(rv.capacityTons, remaining);
        if (take > 0) {
            allocMap.set(rv.route.id, take);
            remaining -= take;
        }
        if (remaining <= 1e-12) break;
    }

    let nextBestDensity = 0;
    for (const rv of ranked) {
        const alloc = allocMap.get(rv.route.id) ?? 0;
        if (alloc < rv.capacityTons - 1e-12) {
            nextBestDensity = rv.valueDensity;
            break;
        }
    }

    const allocation: AllocationEntry[] = [];
    const shadowPrices: ShadowPriceEntry[] = [];
    const optimalMix: Record<string, number> = {};
    let totalRevenue = 0;
    let totalAllocated = 0;

    for (const rv of ranked) {
        const tons = allocMap.get(rv.route.id) ?? 0;
        const frac = totalBiomass > 0 ? tons / totalBiomass : 0;
        const rev = tons * rv.price.pricePerTon * rv.route.conversionYield;

        allocation.push(
            Object.freeze({
                routeId: rv.route.id,
                allocatedTons: tons,
                fraction: frac,
                revenue: rev,
            }),
        );

        const binding = tons >= rv.capacityTons - 1e-12 && rv.capacityTons > 0;
        const sp = binding ? Math.max(0, rv.valueDensity - nextBestDensity) : 0;

        shadowPrices.push(
            Object.freeze({
                routeId: rv.route.id,
                shadowPrice: sp,
                binding,
            }),
        );

        optimalMix[rv.route.id] = frac;
        totalRevenue += rev;
        totalAllocated += tons;
    }

    for (const route of routes) {
        if (!allocMap.has(route.id) && !(route.id in optimalMix)) {
            allocation.push(
                Object.freeze({
                    routeId: route.id,
                    allocatedTons: 0,
                    fraction: 0,
                    revenue: 0,
                }),
            );
            shadowPrices.push(
                Object.freeze({
                    routeId: route.id,
                    shadowPrice: 0,
                    binding: false,
                }),
            );
            optimalMix[route.id] = 0;
        }
    }

    return Object.freeze({
        allocation: Object.freeze(allocation),
        shadowPrices: Object.freeze(shadowPrices),
        optimalMix: Object.freeze(optimalMix),
        totalRevenue,
        totalAllocated,
        unallocated: Math.max(0, totalBiomass - totalAllocated),
    });
}
