// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Force Simulation - Phase 1.18 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S18
 *
 * Phase 1.18 (2026-05-01) - pure-logic Verlet integrator para
 * simulação física de nodes em constelação. Suporta forces:
 * gravity (centro), repulsion (Coulomb), spring (Hooke), damping.
 *
 * Estratégia:
 *   - Particles: {id, x, y, vx, vy, fx, fy, mass, fixed}
 *   - Forces: array de funções(particles, dt) → mutates fx/fy
 *   - Integrator: semi-implicit Euler (v += a*dt; x += v*dt)
 *   - Damping: v *= (1 - damping*dt) por tick
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface Particle {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    fx: number;
    fy: number;
    mass: number;
    fixed: boolean;
}

/** Default constants (frozen). */
export const DEFAULTS = Object.freeze({
    damping: 0.5,
    gravity: 0.1,
    repulsionK: 50,
    springK: 0.05,
    springLength: 100,
    minDistance: 1,
    dt: 0.1,
});

/** Identidade do módulo. */
export const FORCE_SIMULATION_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.18',
    deliveredAt: '2026-05-01',
    defaults: DEFAULTS,
});

/**
 * Cria particle frozen-shape (mas mutáveis pelos integrators internos).
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createParticle(spec: Record<string, any>): Particle {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createParticle: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createParticle: id required');
    }
    return {
        id: spec.id,
        x: Number.isFinite(spec.x) ? spec.x : 0,
        y: Number.isFinite(spec.y) ? spec.y : 0,
        vx: Number.isFinite(spec.vx) ? spec.vx : 0,
        vy: Number.isFinite(spec.vy) ? spec.vy : 0,
        fx: 0,
        fy: 0,
        mass: Number.isFinite(spec.mass) && spec.mass > 0 ? spec.mass : 1,
        fixed: spec.fixed === true,
    };
}

/**
 * Reseta forças (fx, fy) em todos os particles.
 *
 * @param {Array<any>} particles
 */
export function resetForces(particles: Array<any>): void {
    if (!Array.isArray(particles)) return;
    for (const p of particles) {
        if (!p) continue;
        p.fx = 0;
        p.fy = 0;
    }
}

/**
 * Force: gravidade radial em direção ao centro.
 *
 * @param {{x: number, y: number}} [center]
 * @param {number} [strength]
 * @returns {Function}
 */
export function gravityForce(center: { x: number; y: number } = { x: 0, y: 0 }, strength = DEFAULTS.gravity): Function {
    return (particles: any) => {
        if (!Array.isArray(particles)) return;
        const cx = center.x || 0;
        const cy = center.y || 0;
        for (const p of particles) {
            if (!p || p.fixed) continue;
            p.fx += (cx - p.x) * strength;
            p.fy += (cy - p.y) * strength;
        }
    };
}

/**
 * Force: repulsão Coulomb (inverso do quadrado).
 *
 * @param {number} [k]
 * @param {number} [minDist]
 * @returns {Function}
 */
export function repulsionForce(k = DEFAULTS.repulsionK, minDist = DEFAULTS.minDistance): Function {
    return (particles: any) => {
        if (!Array.isArray(particles)) return;
        for (let i = 0; i < particles.length; i++) {
            const a = particles[i];
            if (!a) continue;
            for (let j = i + 1; j < particles.length; j++) {
                const b = particles[j];
                if (!b) continue;
                if (a.fixed && b.fixed) continue;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const distSq = Math.max(minDist * minDist, dx * dx + dy * dy);
                const dist = Math.sqrt(distSq);
                const force = k / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                if (!a.fixed) {
                    a.fx += fx;
                    a.fy += fy;
                }
                if (!b.fixed) {
                    b.fx -= fx;
                    b.fy -= fy;
                }
            }
        }
    };
}

/**
 * Force: spring entre particles conectados por edges.
 *
 * @param {Array<{source: any, target: any}>} edges
 * @param {number} [k]
 * @param {number} [restLength]
 * @returns {Function}
 */
export function springForce(
    edges: Array<{ source: any; target: any }> = [],
    k = DEFAULTS.springK,
    restLength = DEFAULTS.springLength,
): Function {
    return (particles: any) => {
        if (!Array.isArray(particles) || !Array.isArray(edges)) return;
        const byId = new Map();
        for (const p of particles) {
            if (p && p.id) byId.set(p.id, p);
        }
        for (const edge of edges) {
            if (!edge) continue;
            const a = byId.get(edge.source);
            const b = byId.get(edge.target);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
            const displacement = dist - restLength;
            const force = displacement * k;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (!a.fixed) {
                a.fx += fx;
                a.fy += fy;
            }
            if (!b.fixed) {
                b.fx -= fx;
                b.fy -= fy;
            }
        }
    };
}

/**
 * Integrator semi-implicit Euler com damping.
 *
 * @param {Array<any>} particles
 * @param {number} dt
 * @param {number} damping
 */
export function integrate(particles: Array<any>, dt = DEFAULTS.dt, damping = DEFAULTS.damping): void {
    if (!Array.isArray(particles)) return;
    const _dt = Number.isFinite(dt) && dt > 0 ? dt : DEFAULTS.dt;
    const _damp = Number.isFinite(damping) ? damping : DEFAULTS.damping;
    const dampFactor = Math.max(0, Math.min(1, 1 - _damp * _dt));

    for (const p of particles) {
        if (!p) continue;
        if (p.fixed) {
            p.vx = 0;
            p.vy = 0;
            continue;
        }
        const ax = p.fx / (p.mass || 1);
        const ay = p.fy / (p.mass || 1);
        p.vx = (p.vx + ax * _dt) * dampFactor;
        p.vy = (p.vy + ay * _dt) * dampFactor;
        p.x += p.vx * _dt;
        p.y += p.vy * _dt;
    }
}

/**
 * Computa kinetic energy total (proxy para convergência).
 *
 * @param {Array<any>} particles
 * @returns {number}
 */
export function kineticEnergy(particles: Array<any>): number {
    if (!Array.isArray(particles)) return 0;
    let total = 0;
    for (const p of particles) {
        if (!p) continue;
        const v2 = (p.vx || 0) ** 2 + (p.vy || 0) ** 2;
        total += 0.5 * (p.mass || 1) * v2;
    }
    return total;
}

/**
 * Cria simulação com tick().
 *
 * @param {object} options
 * @param {Array<any>} options.particles
 * @param {Array<Function>} [options.forces]
 * @param {number} [options.dt]
 * @param {number} [options.damping]
 * @param {number} [options.convergenceThreshold]
 * @returns {{tick: Function, particles: Function, energy: Function, isConverged: Function, reset: Function}}
 */
export function createSimulation(options: any = {} as any) {
    if (!options || typeof options !== 'object') {
        throw new TypeError('createSimulation: options required');
    }
    if (!Array.isArray(options.particles)) {
        throw new TypeError('createSimulation: particles array required');
    }
    const initialState = options.particles.map((p: any) => ({ ...p }));
    const particles = options.particles.map((p: any) => ({ ...p }));
    const forces = Array.isArray(options.forces) ? options.forces : [];
    const dt = Number.isFinite(options.dt) ? options.dt : DEFAULTS.dt;
    const damping = Number.isFinite(options.damping) ? options.damping : DEFAULTS.damping;
    const convergenceThreshold: number = Number.isFinite(options.convergenceThreshold)
        ? options.convergenceThreshold
        : 0.01;

    let tickCount = 0;

    return Object.freeze({
        tick() {
            resetForces(particles);
            for (const f of forces) {
                if (typeof f === 'function') {
                    try {
                        f(particles, dt);
                    } catch (e) {
                        console.debug('[forceSimulation:tick]', (e as any)?.message || e);
                    }
                }
            }
            integrate(particles, dt, damping);
            tickCount++;
            return tickCount;
        },
        particles() {
            return particles.map((p: any) => ({ ...p }));
        },
        energy() {
            return kineticEnergy(particles);
        },
        isConverged() {
            return kineticEnergy(particles) < convergenceThreshold;
        },
        reset() {
            for (let i = 0; i < initialState.length; i++) {
                Object.assign(particles[i], initialState[i]);
            }
            tickCount = 0;
        },
        tickCount() {
            return tickCount;
        },
    });
}

/**
 * Module identity export.
 */
export const forceSimulationMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.18',
    deliveredAt: '2026-05-01',
    defaults: DEFAULTS,
    exports: [
        'DEFAULTS',
        'FORCE_SIMULATION_META',
        'createParticle',
        'resetForces',
        'gravityForce',
        'repulsionForce',
        'springForce',
        'integrate',
        'kineticEnergy',
        'createSimulation',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
