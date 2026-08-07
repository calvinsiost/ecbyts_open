// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Drone / UAV Family - schema, defaults, validators
// ECBYTS-ENERGY-SCENARIOS-001#5 — captura aérea + logística leve (várzea).
// Parecer: docs/reports/ENERGY_SCENARIOS_FAMILY_CENSUS_2026-07-22.md §4.5

export const DRONE_TYPES = ['cargo', 'mapping'] as const;
export type DroneType = (typeof DRONE_TYPES)[number];

/**
 * Presets de referência (ordem de grandeza pública de UAVs classe cargo
 * médio / mapeamento — ajustáveis por elemento; não são specs de fabricante).
 */
export const DRONE_PRESETS: Record<string, any> = {
    cargo_heavy: {
        droneType: 'cargo',
        payloadKg: 40, // classe 20–50 kg (ex.: cesto de várzea)
        autonomyKm: 30,
        autonomyMin: 45,
        speedKmh: 60,
        costPerHour: 350, // BRL/h (operação + depreciação)
        costPerKm: null, // se null, KPIs usam costPerHour
    },
    cargo_light: {
        droneType: 'cargo',
        payloadKg: 20,
        autonomyKm: 20,
        autonomyMin: 35,
        speedKmh: 55,
        costPerHour: 220,
        costPerKm: null,
    },
    mapping: {
        droneType: 'mapping',
        payloadKg: 2,
        autonomyKm: 25,
        autonomyMin: 40,
        speedKmh: 50,
        costPerHour: 180,
        costPerKm: null,
    },
};

/**
 * Cria os defaults de data de um elemento drone.
 */
export function createDroneDefaults(overrides: any = {}): any {
    const preset = DRONE_PRESETS[overrides.preset ?? 'cargo_heavy'] ?? DRONE_PRESETS.cargo_heavy;
    return {
        family: 'drone',
        droneType: preset.droneType,
        payloadKg: preset.payloadKg,
        autonomyKm: preset.autonomyKm,
        autonomyMin: preset.autonomyMin,
        speedKmh: preset.speedKmh,
        costPerHour: preset.costPerHour,
        costPerKm: preset.costPerKm,
        // Tempo de solo por ciclo (pouso + carga/descarga + checagem), min.
        turnaroundMin: 6,
        // Janela operacional diária (h) — voo diurno VLOS típico.
        operatingHoursPerDay: 8,
        ...overrides,
    };
}

/**
 * Valida o data blob de um elemento drone.
 */
export function validateDroneData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!data || typeof data !== 'object') return { valid: false, errors: ['data must be an object'] };
    if (data.droneType != null && !DRONE_TYPES.includes(data.droneType)) {
        errors.push(`droneType must be one of ${DRONE_TYPES.join('|')}, got '${data.droneType}'`);
    }
    const positive: Array<[string, any]> = [
        ['payloadKg', data.payloadKg],
        ['autonomyKm', data.autonomyKm],
        ['autonomyMin', data.autonomyMin],
        ['speedKmh', data.speedKmh],
        ['operatingHoursPerDay', data.operatingHoursPerDay],
    ];
    for (const [name, v] of positive) {
        if (v != null && (!Number.isFinite(v) || v <= 0)) errors.push(`${name} must be a positive number`);
    }
    const nonNegative: Array<[string, any]> = [
        ['costPerHour', data.costPerHour],
        ['costPerKm', data.costPerKm],
        ['turnaroundMin', data.turnaroundMin],
    ];
    for (const [name, v] of nonNegative) {
        if (v != null && (!Number.isFinite(v) || v < 0)) errors.push(`${name} must be a non-negative number`);
    }
    return { valid: errors.length === 0, errors };
}
