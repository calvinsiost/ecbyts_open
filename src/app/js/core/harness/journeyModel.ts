// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/harness/journeyModel.js
// UI Exploration Harness - pure-logic journey model
// Pure data model + graph math for UI journeys. ZERO browser/DOM access.
//
// Um "journey" é uma sequência estruturada de passos (steps) que um agente de
// exploração (ou executor browser-side) pode percorrer. Cada step referencia
// um handler (string, ex. "handleAddElement") e pode declarar dependências
// via `dependsOn` - formando um DAG que é ordenado via Kahn's algorithm.
//
// Consumidor atual: runner.js (este módulo).
// Consumidor futuro (Fase 2, browser): executor que chama window[action].

interface JourneyStep {
    /** Identificador único do step dentro da journey */
    id: string;
    /** Nome do handler (ex. "handleAddElement") */
    action: string;
    /** Parâmetros passados ao handler */
    params?: Record<string, unknown> | Readonly<Record<string, unknown>>;
    /** Descrição textual ou matcher estruturado */
    expectedOutcome?: string | Record<string, unknown> | Readonly<Record<string, unknown>> | null;
    /** IDs de steps que devem rodar antes */
    dependsOn?: string[] | ReadonlyArray<string>;
}

interface NormalizedStep {
    id: string;
    action: string;
    params: Readonly<Record<string, unknown>>;
    expectedOutcome: string | Record<string, unknown> | Readonly<Record<string, unknown>> | null;
    dependsOn: ReadonlyArray<string>;
}

interface Journey {
    id: string;
    name: string;
    steps: ReadonlyArray<Readonly<NormalizedStep>>;
}

/**
 * Cria uma journey imutável (Object.freeze) a partir de um spec.
 * Valida o spec via validateJourney antes de congelar.
 *
 * @param spec
 * @returns
 */
export function createJourney(spec: { id: string; name: string; steps: JourneyStep[] }): Readonly<Journey> {
    if (spec === null || typeof spec !== 'object') {
        throw new TypeError('createJourney: spec must be an object');
    }
    const { id, name, steps } = spec;
    if (typeof id !== 'string' || id.length === 0) {
        throw new TypeError('createJourney: id must be a non-empty string');
    }
    if (typeof name !== 'string' || name.length === 0) {
        throw new TypeError('createJourney: name must be a non-empty string');
    }
    if (!Array.isArray(steps)) {
        throw new TypeError('createJourney: steps must be an array');
    }
    const frozenSteps = steps.map((s) => normalizeStep(s));
    const journey: Journey = {
        id,
        name,
        steps: Object.freeze(frozenSteps),
    };
    validateJourney(journey);
    return Object.freeze(journey);
}

/**
 * Normaliza e congela um step individual. Garante que params, dependsOn
 * e expectedOutcome existam com defaults seguros.
 * @param raw
 * @returns
 */
function normalizeStep(raw: JourneyStep): Readonly<NormalizedStep> {
    if (raw === null || typeof raw !== 'object') {
        throw new TypeError('journeyModel: step must be an object');
    }
    if (typeof raw.id !== 'string' || raw.id.length === 0) {
        throw new TypeError('journeyModel: step.id must be a non-empty string');
    }
    if (typeof raw.action !== 'string' || raw.action.length === 0) {
        throw new TypeError(`journeyModel: step "${raw.id}".action must be a non-empty string`);
    }
    const dependsOn = Array.isArray(raw.dependsOn) ? [...raw.dependsOn] : [];
    const params = raw.params && typeof raw.params === 'object' ? { ...raw.params } : {};
    const normalized: NormalizedStep = {
        id: raw.id,
        action: raw.action,
        params: Object.freeze(params),
        expectedOutcome: raw.expectedOutcome ?? null,
        dependsOn: Object.freeze(dependsOn),
    };
    return Object.freeze(normalized);
}

/**
 * Valida uma journey: não-vazia, IDs únicos, dependências existentes, sem ciclos.
 * Throws em caso de violação.
 *
 * @param journey
 * @returns
 */
export function validateJourney(journey: Journey): true {
    if (!journey || !Array.isArray(journey.steps)) {
        throw new TypeError('validateJourney: journey.steps must be an array');
    }
    if (journey.steps.length === 0) {
        throw new Error('validateJourney: journey has no steps');
    }
    const ids = new Set<string>();
    for (const step of journey.steps) {
        if (ids.has(step.id)) {
            throw new Error(`validateJourney: duplicate step id "${step.id}"`);
        }
        ids.add(step.id);
    }
    for (const step of journey.steps) {
        for (const dep of step.dependsOn || []) {
            if (!ids.has(dep)) {
                throw new Error(`validateJourney: step "${step.id}" dependsOn unknown step "${dep}"`);
            }
            if (dep === step.id) {
                throw new RangeError(`validateJourney: step "${step.id}" dependsOn itself (cycle)`);
            }
        }
    }
    // Cycle detection via topo sort attempt
    topoSortSteps(journey);
    return true;
}

interface TopoGraph {
    byId: ReadonlyMap<string, Readonly<NormalizedStep>>;
    indegree: Map<string, number>;
    adjacency: ReadonlyMap<string, ReadonlyArray<string>>;
}

function buildTopoGraph(journey: Journey): TopoGraph {
    const byId = new Map<string, Readonly<NormalizedStep>>();
    const indegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>(); // dep -> [dependent ids]

    for (const step of journey.steps) {
        byId.set(step.id, step);
        indegree.set(step.id, 0);
        adjacency.set(step.id, []);
    }
    for (const step of journey.steps) {
        for (const dep of step.dependsOn || []) {
            // edge: dep -> step
            const adj = adjacency.get(dep);
            if (adj) adj.push(step.id);
            indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
        }
    }
    return { byId, indegree, adjacency };
}

function seedQueue(journey: Journey, indegree: ReadonlyMap<string, number>): string[] {
    const queue: string[] = [];
    for (const step of journey.steps) {
        if (indegree.get(step.id) === 0) queue.push(step.id);
    }
    return queue;
}

function drainQueue(
    queue: string[],
    graph: TopoGraph,
): Array<Readonly<NormalizedStep>> {
    const { byId, indegree, adjacency } = graph;
    const result: Array<Readonly<NormalizedStep>> = [];
    while (queue.length > 0) {
        const id = queue.shift() as string;
        const node = byId.get(id);
        if (node) result.push(node);
        for (const next of adjacency.get(id) ?? []) {
            indegree.set(next, (indegree.get(next) ?? 0) - 1);
            if (indegree.get(next) === 0) queue.push(next);
        }
    }
    return result;
}

function assertNoCycle(
    result: ReadonlyArray<Readonly<NormalizedStep>>,
    journey: Journey,
): void {
    if (result.length === journey.steps.length) return;
    const seen = new Set(result.map((r) => r.id));
    const remaining = journey.steps.filter((s) => !seen.has(s.id)).map((s) => s.id);
    throw new RangeError(`topoSortSteps: cycle detected among steps: ${remaining.join(', ')}`);
}

/**
 * Kahn's algorithm - retorna steps em ordem de execução topológica.
 * Throws RangeError se houver ciclo.
 *
 * @param journey
 * @returns
 */
export function topoSortSteps(journey: Journey): ReadonlyArray<Readonly<NormalizedStep>> {
    if (!journey || !Array.isArray(journey.steps)) {
        throw new TypeError('topoSortSteps: invalid journey');
    }
    const graph = buildTopoGraph(journey);
    const queue = seedQueue(journey, graph.indegree);
    const result = drainQueue(queue, graph);
    assertNoCycle(result, journey);
    return Object.freeze(result);
}

/**
 * Grafo de adjacência serializável para visualização.
 * Retorna {nodes:[{id,action}], edges:[{from,to}]} - edges representam
 * dependência "from deve rodar antes de to".
 *
 * @param journey
 * @returns
 */
export function stepGraph(
    journey: Journey,
): Readonly<{
    nodes: ReadonlyArray<{ id: string; action: string }>;
    edges: ReadonlyArray<{ from: string; to: string }>;
}> {
    if (!journey || !Array.isArray(journey.steps)) {
        throw new TypeError('stepGraph: invalid journey');
    }
    const nodes = journey.steps.map((s) => Object.freeze({ id: s.id, action: s.action }));
    const edges: Array<Readonly<{ from: string; to: string }>> = [];
    for (const step of journey.steps) {
        for (const dep of step.dependsOn || []) {
            edges.push(Object.freeze({ from: dep, to: step.id }));
        }
    }
    return Object.freeze({
        nodes: Object.freeze(nodes),
        edges: Object.freeze(edges),
    });
}
