// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Drone Logistics KPIs — puro (sem DOM/Three), testado em node:test.
// ECBYTS-ENERGY-SCENARIOS-001#5 — caso biomassa: pontos esparsos de várzea →
// cooperativa (payload 20–50 kg). KPIs: viagens/dia p/ X kg, custo por kg,
// tempo de ciclo, comparação com rota terrestre entre os mesmos pontos.

export interface DroneKpiInputs {
    /** Distância da rota de voo, um sentido, em METROS. */
    routeLengthM: number;
    /** Demanda diária a transportar (kg). */
    demandKgPerDay: number;
    payloadKg: number;
    speedKmh: number;
    /** Tempo de solo por ciclo (pouso+carga+descarga), min. Default 6. */
    turnaroundMin?: number;
    /** Autonomia por bateria (km ida+volta). Opcional — gera flag de viabilidade. */
    autonomyKm?: number | null;
    /** Custo horário de operação (moeda/h). */
    costPerHour?: number | null;
    /** Custo por km voado (moeda/km) — se presente, somado ao horário. */
    costPerKm?: number | null;
    /** Janela operacional diária (h). Default 8. */
    operatingHoursPerDay?: number;
}

export interface DroneKpis {
    routeLengthKm: number;
    cycleTimeMin: number;
    tripsNeededPerDay: number;
    tripsPossiblePerDay: number;
    demandFeasible: boolean;
    withinAutonomy: boolean | null;
    kgPerTrip: number;
    kgPerDayCapacity: number;
    costPerTrip: number | null;
    costPerKg: number | null;
    totalDailyCost: number | null;
    flightTimeMinPerTrip: number;
}

function num(v: any): number | null {
    return Number.isFinite(v) ? Number(v) : null;
}

/**
 * KPIs logísticos de um drone servindo uma rota de voo.
 * Ciclo = ida + volta na rota + turnaround. Conservador: assume volta vazia.
 */
export function computeDroneLogisticsKpis(inputs: DroneKpiInputs): DroneKpis | null {
    const routeLengthM = num(inputs?.routeLengthM);
    const payloadKg = num(inputs?.payloadKg);
    const speedKmh = num(inputs?.speedKmh);
    if (!routeLengthM || routeLengthM <= 0 || !payloadKg || payloadKg <= 0 || !speedKmh || speedKmh <= 0) {
        return null;
    }
    const demandKgPerDay = Math.max(0, num(inputs.demandKgPerDay) ?? 0);
    const turnaroundMin = Math.max(0, num(inputs.turnaroundMin) ?? 6);
    const operatingHoursPerDay = Math.max(0.1, num(inputs.operatingHoursPerDay) ?? 8);

    const routeLengthKm = routeLengthM / 1000;
    const roundTripKm = routeLengthKm * 2;
    const flightTimeMinPerTrip = (roundTripKm / speedKmh) * 60;
    const cycleTimeMin = flightTimeMinPerTrip + turnaroundMin;

    const tripsNeededPerDay = demandKgPerDay > 0 ? Math.ceil(demandKgPerDay / payloadKg) : 0;
    const tripsPossiblePerDay = Math.floor((operatingHoursPerDay * 60) / cycleTimeMin);
    const kgPerDayCapacity = tripsPossiblePerDay * payloadKg;

    const autonomyKm = num(inputs.autonomyKm);
    const withinAutonomy = autonomyKm != null ? roundTripKm <= autonomyKm : null;

    const costPerHour = num(inputs.costPerHour);
    const costPerKm = num(inputs.costPerKm);
    let costPerTrip: number | null = null;
    if (costPerHour != null || costPerKm != null) {
        costPerTrip = (costPerHour ?? 0) * (cycleTimeMin / 60) + (costPerKm ?? 0) * roundTripKm;
    }
    const costPerKg = costPerTrip != null ? costPerTrip / payloadKg : null;
    const totalDailyCost = costPerTrip != null && tripsNeededPerDay > 0 ? costPerTrip * tripsNeededPerDay : null;

    return {
        routeLengthKm,
        cycleTimeMin,
        tripsNeededPerDay,
        tripsPossiblePerDay,
        demandFeasible: demandKgPerDay === 0 ? true : tripsNeededPerDay <= tripsPossiblePerDay,
        withinAutonomy,
        kgPerTrip: payloadKg,
        kgPerDayCapacity,
        costPerTrip,
        costPerKg,
        totalDailyCost,
        flightTimeMinPerTrip,
    };
}

export interface GroundRouteInputs {
    /** Distância da rota terrestre, um sentido, METROS. */
    routeLengthM: number;
    /** Capacidade de carga do veículo (kg). */
    payloadKg: number;
    speedKmh: number;
    turnaroundMin?: number;
    costPerHour?: number | null;
    costPerKm?: number | null;
    operatingHoursPerDay?: number;
}

export interface DroneVsGroundComparison {
    drone: DroneKpis;
    ground: DroneKpis;
    /** > 0 → drone mais caro por kg; < 0 → drone mais barato. Nulo sem custos. */
    costPerKgDeltaPct: number | null;
    /** > 0 → ciclo do drone mais lento; < 0 → mais rápido. */
    cycleTimeDeltaPct: number;
    cheaperMode: 'drone' | 'ground' | 'tie' | null;
    fasterMode: 'drone' | 'ground' | 'tie';
}

/**
 * Compara drone (rota de voo) vs veículo terrestre (rota terrestre) entre os
 * mesmos pontos, mesma demanda diária. A matemática de ciclo/custo é idêntica
 * (computeDroneLogisticsKpis é agnóstica ao modal) — mudam distância,
 * velocidade, payload e custos.
 */
export function compareDroneVsGround(
    droneInputs: DroneKpiInputs,
    groundInputs: GroundRouteInputs,
    demandKgPerDay: number,
): DroneVsGroundComparison | null {
    const drone = computeDroneLogisticsKpis({ ...droneInputs, demandKgPerDay });
    const ground = computeDroneLogisticsKpis({ ...groundInputs, demandKgPerDay });
    if (!drone || !ground) return null;

    let costPerKgDeltaPct: number | null = null;
    let cheaperMode: 'drone' | 'ground' | 'tie' | null = null;
    if (drone.costPerKg != null && ground.costPerKg != null && ground.costPerKg > 0) {
        costPerKgDeltaPct = ((drone.costPerKg - ground.costPerKg) / ground.costPerKg) * 100;
        cheaperMode = drone.costPerKg < ground.costPerKg ? 'drone' : drone.costPerKg > ground.costPerKg ? 'ground' : 'tie';
    }
    const cycleTimeDeltaPct = ((drone.cycleTimeMin - ground.cycleTimeMin) / ground.cycleTimeMin) * 100;
    const fasterMode = drone.cycleTimeMin < ground.cycleTimeMin ? 'drone' : drone.cycleTimeMin > ground.cycleTimeMin ? 'ground' : 'tie';

    return { drone, ground, costPerKgDeltaPct, cycleTimeDeltaPct, cheaperMode, fasterMode };
}
