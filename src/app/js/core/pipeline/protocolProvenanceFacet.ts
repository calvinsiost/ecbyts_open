// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PROTOCOL PROVENANCE FACET - rastreabilidade por item alinhada
   ao W3C PROV (PIPELINE-UNIFIED-PROTOCOL #7).

   "Falta rastreabilidade por item: todo item publicado deve ter
   origem ou justificativa manual."
   (SPEC_PIPELINE_UNIFIED_PROTOCOL.md, blind spot "Falta
   rastreabilidade por item").

   Mapeamento W3C PROV (https://www.w3.org/TR/prov-dm/):
   - entity         -> prov:Entity          (item rastreado)
   - activity       -> prov:Activity        (operacao que gerou o item)
   - agent          -> prov:Agent           (responsavel pela operacao)
   - timestamp      -> prov:generatedAtTime (quando o registro foi criado)
   - wasDerivedFrom -> prov:wasDerivedFrom  (entidades de origem)

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   ================================================================ */

export const PROVENANCE_ENTITY_KINDS = Object.freeze([
    'element',
    'connector',
    'data',
    'decision',
    'pack',
    'custom',
] as const);

export type ProvenanceEntityKind = (typeof PROVENANCE_ENTITY_KINDS)[number];

export const PROVENANCE_AGENT_KINDS = Object.freeze([
    'person',
    'software',
    'organization',
] as const);

export type ProvenanceAgentKind = (typeof PROVENANCE_AGENT_KINDS)[number];

export interface ProvenanceEntity {
    id: string;
    kind: ProvenanceEntityKind;
    label?: string;
}

export interface ProvenanceActivity {
    id: string;
    type: string;
    startedAt?: string;
    endedAt?: string;
}

export interface ProvenanceAgent {
    id: string;
    name: string;
    kind: ProvenanceAgentKind;
}

export interface ProtocolProvenanceFacet {
    entity: ProvenanceEntity;
    activity: ProvenanceActivity;
    agent: ProvenanceAgent;
    timestamp: string;
    wasDerivedFrom: string[];
    createdBy: string;
    updatedBy?: string;
    sourceDocument?: string;
    sourcePage?: number;
    evidenceRefs: string[];
    standardRefs: string[];
    version: number;
    changeReason?: string;
}

export interface ProvenanceIssue {
    code: string;
    message: string;
    path: string;
    severity: 'error';
}

export interface ProvenanceRecordResult {
    ok: boolean;
    record: ProtocolProvenanceFacet | null;
    issues: ProvenanceIssue[];
}

export interface ProvenanceChainResult {
    valid: boolean;
    issues: ProvenanceIssue[];
    entityCount: number;
    rootCount: number;
}

const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function pushIssue(
    issues: ProvenanceIssue[],
    code: string,
    message: string,
    path: string,
): void {
    issues.push({ code, message, path, severity: 'error' });
}

function isEntityKind(value: unknown): value is ProvenanceEntityKind {
    return typeof value === 'string' && (PROVENANCE_ENTITY_KINDS as readonly string[]).includes(value);
}

function isAgentKind(value: unknown): value is ProvenanceAgentKind {
    return typeof value === 'string' && (PROVENANCE_AGENT_KINDS as readonly string[]).includes(value);
}

/**
 * Check whether a value is a valid ISO 8601 timestamp with explicit
 * timezone (e.g. 2026-07-22T12:00:00Z or 2026-07-22T09:00:00-03:00).
 *
 * @param {unknown} value
 * @returns {boolean} true when the value is a parseable ISO 8601 string
 */
export function isValidIsoTimestamp(value: unknown): value is string {
    return (
        typeof value === 'string'
        && ISO_8601_PATTERN.test(value)
        && !Number.isNaN(Date.parse(value))
    );
}

function collectRefs(
    value: unknown,
    path: string,
    code: string,
    label: string,
    issues: ProvenanceIssue[],
    dedupe: boolean,
): string[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
        pushIssue(issues, code, `${label} precisa ser uma lista de textos.`, path);
        return [];
    }
    const out: string[] = [];
    const seen = new Set<string>();
    value.forEach((entry, index) => {
        const text = trimText(entry);
        if (!text) {
            pushIssue(issues, `${code}.entry`, `${label} nao pode ter item vazio.`, `${path}[${index}]`);
            return;
        }
        if (dedupe && seen.has(text)) return;
        seen.add(text);
        out.push(text);
    });
    return out;
}

/**
 * Build a W3C PROV-aligned provenance record from untrusted input.
 * Applies defaults (version=1, kind=custom/person, empty ref lists),
 * validates required fields (entity.id, activity.id/type, agent.id/name,
 * timestamp, createdBy) and enforces the spec rule: every published item
 * must have an origin (wasDerivedFrom or sourceDocument) or a manual
 * justification (changeReason). Returns a frozen record on success.
 *
 * @param {unknown} input - raw candidate record
 * @returns {ProvenanceRecordResult} ok + frozen record, or issues list
 */
export function createProvenanceRecord(input: unknown): ProvenanceRecordResult {
    const issues: ProvenanceIssue[] = [];

    if (!isPlainObject(input)) {
        pushIssue(issues, 'provenance.object.required', 'Registro de proveniencia precisa ser um objeto.', '$');
        return { ok: false, record: null, issues };
    }

    let entity: ProvenanceEntity | null = null;
    if (!isPlainObject(input.entity)) {
        pushIssue(issues, 'provenance.entity.required', 'Registro precisa de entity (prov:Entity).', '$.entity');
    } else {
        const entityId = trimText(input.entity.id);
        if (!entityId) {
            pushIssue(issues, 'provenance.entity.id.required', 'entity.id nao pode ser vazio.', '$.entity.id');
        }
        let kind: ProvenanceEntityKind = 'custom';
        if (input.entity.kind !== undefined && input.entity.kind !== null) {
            if (isEntityKind(input.entity.kind)) {
                kind = input.entity.kind;
            } else {
                pushIssue(
                    issues,
                    'provenance.entity.kind.invalid',
                    `Tipo de entidade invalido: ${trimText(input.entity.kind) || String(input.entity.kind)}.`,
                    '$.entity.kind',
                );
            }
        }
        if (entityId) {
            const label = trimText(input.entity.label);
            entity = label ? { id: entityId, kind, label } : { id: entityId, kind };
        }
    }

    let activity: ProvenanceActivity | null = null;
    if (!isPlainObject(input.activity)) {
        pushIssue(issues, 'provenance.activity.required', 'Registro precisa de activity (prov:Activity).', '$.activity');
    } else {
        const activityId = trimText(input.activity.id);
        const activityType = trimText(input.activity.type);
        if (!activityId) {
            pushIssue(issues, 'provenance.activity.id.required', 'activity.id nao pode ser vazio.', '$.activity.id');
        }
        if (!activityType) {
            pushIssue(issues, 'provenance.activity.type.required', 'activity.type nao pode ser vazio.', '$.activity.type');
        }
        if (activityId && activityType) {
            activity = { id: activityId, type: activityType };
            const startedAt = trimText(input.activity.startedAt);
            const endedAt = trimText(input.activity.endedAt);
            if (startedAt) {
                if (!isValidIsoTimestamp(startedAt)) {
                    pushIssue(issues, 'provenance.activity.startedAt.invalid', 'activity.startedAt precisa ser timestamp ISO 8601.', '$.activity.startedAt');
                } else {
                    activity.startedAt = startedAt;
                }
            }
            if (endedAt) {
                if (!isValidIsoTimestamp(endedAt)) {
                    pushIssue(issues, 'provenance.activity.endedAt.invalid', 'activity.endedAt precisa ser timestamp ISO 8601.', '$.activity.endedAt');
                } else {
                    activity.endedAt = endedAt;
                }
            }
        }
    }

    let agent: ProvenanceAgent | null = null;
    if (!isPlainObject(input.agent)) {
        pushIssue(issues, 'provenance.agent.required', 'Registro precisa de agent (prov:Agent).', '$.agent');
    } else {
        const agentId = trimText(input.agent.id);
        const agentName = trimText(input.agent.name);
        if (!agentId) {
            pushIssue(issues, 'provenance.agent.id.required', 'agent.id nao pode ser vazio.', '$.agent.id');
        }
        if (!agentName) {
            pushIssue(issues, 'provenance.agent.name.required', 'agent.name nao pode ser vazio.', '$.agent.name');
        }
        let agentKind: ProvenanceAgentKind = 'person';
        if (input.agent.kind !== undefined && input.agent.kind !== null) {
            if (isAgentKind(input.agent.kind)) {
                agentKind = input.agent.kind;
            } else {
                pushIssue(
                    issues,
                    'provenance.agent.kind.invalid',
                    `Tipo de agente invalido: ${trimText(input.agent.kind) || String(input.agent.kind)}.`,
                    '$.agent.kind',
                );
            }
        }
        if (agentId && agentName) {
            agent = { id: agentId, name: agentName, kind: agentKind };
        }
    }

    const timestamp = trimText(input.timestamp);
    if (!timestamp) {
        pushIssue(issues, 'provenance.timestamp.required', 'Registro precisa de timestamp (prov:generatedAtTime).', '$.timestamp');
    } else if (!isValidIsoTimestamp(timestamp)) {
        pushIssue(issues, 'provenance.timestamp.invalid', 'timestamp precisa ser ISO 8601 com fuso horario.', '$.timestamp');
    }

    const wasDerivedFrom = collectRefs(input.wasDerivedFrom, '$.wasDerivedFrom', 'provenance.wasDerivedFrom.invalid', 'wasDerivedFrom', issues, true);
    const evidenceRefs = collectRefs(input.evidenceRefs, '$.evidenceRefs', 'provenance.evidenceRefs.invalid', 'evidenceRefs', issues, false);
    const standardRefs = collectRefs(input.standardRefs, '$.standardRefs', 'provenance.standardRefs.invalid', 'standardRefs', issues, false);

    const createdBy = trimText(input.createdBy);
    if (!createdBy) {
        pushIssue(issues, 'provenance.createdBy.required', 'Registro precisa de createdBy.', '$.createdBy');
    }

    const updatedBy = trimText(input.updatedBy);
    const sourceDocument = trimText(input.sourceDocument);
    const changeReason = trimText(input.changeReason);

    let sourcePage: number | undefined;
    if (input.sourcePage !== undefined && input.sourcePage !== null) {
        const rawPage = Number(input.sourcePage);
        if (!Number.isInteger(rawPage) || rawPage < 1) {
            pushIssue(issues, 'provenance.sourcePage.invalid', 'sourcePage precisa ser um inteiro maior ou igual a 1.', '$.sourcePage');
        } else {
            sourcePage = rawPage;
        }
    }

    let version = 1;
    if (input.version !== undefined && input.version !== null) {
        const rawVersion = Number(input.version);
        if (!Number.isInteger(rawVersion) || rawVersion < 1) {
            pushIssue(issues, 'provenance.version.invalid', 'version precisa ser um inteiro maior ou igual a 1.', '$.version');
        } else {
            version = rawVersion;
        }
    }

    if (wasDerivedFrom.length === 0 && !sourceDocument && !changeReason) {
        pushIssue(
            issues,
            'provenance.origin.missing',
            'Item publicado precisa de origem (wasDerivedFrom ou sourceDocument) ou justificativa manual (changeReason).',
            '$',
        );
    }

    if (issues.length > 0 || !entity || !activity || !agent || !timestamp) {
        return { ok: false, record: null, issues };
    }

    const record: ProtocolProvenanceFacet = {
        entity: Object.freeze(entity),
        activity: Object.freeze(activity),
        agent: Object.freeze(agent),
        timestamp,
        wasDerivedFrom: Object.freeze(wasDerivedFrom) as string[],
        createdBy,
        evidenceRefs: Object.freeze(evidenceRefs) as string[],
        standardRefs: Object.freeze(standardRefs) as string[],
        version,
    };
    if (updatedBy) record.updatedBy = updatedBy;
    if (sourceDocument) record.sourceDocument = sourceDocument;
    if (sourcePage !== undefined) record.sourcePage = sourcePage;
    if (changeReason) record.changeReason = changeReason;

    return { ok: true, record: Object.freeze(record), issues };
}

/**
 * Validate a chain of provenance records as a derivation graph. Each
 * record is first validated structurally via createProvenanceRecord
 * (including the origin-or-justification rule); then the graph is
 * checked for duplicate entity ids, self-derivation, references to
 * entities absent from the chain, and derivation cycles.
 *
 * @param {unknown} records - raw list of candidate records
 * @returns {ProvenanceChainResult} valid + issues + entity/root counts
 */
export function validateProvenanceChain(records: unknown): ProvenanceChainResult {
    const issues: ProvenanceIssue[] = [];

    if (!Array.isArray(records)) {
        pushIssue(issues, 'provenance.chain.array.required', 'Cadeia de proveniencia precisa ser uma lista de registros.', '$');
        return { valid: false, issues, entityCount: 0, rootCount: 0 };
    }

    interface ChainNode {
        id: string;
        derivedFrom: string[];
    }

    const nodes: ChainNode[] = [];
    const seenIds = new Set<string>();

    records.forEach((entry, index) => {
        const basePath = `$[${index}]`;
        const result = createProvenanceRecord(entry);
        if (!result.ok || !result.record) {
            for (const issue of result.issues) {
                pushIssue(issues, issue.code, issue.message, `${basePath}${issue.path.slice(1)}`);
            }
            return;
        }
        const id = result.record.entity.id;
        if (seenIds.has(id)) {
            pushIssue(issues, 'provenance.entity.duplicate', `Entidade duplicada na cadeia: ${id}.`, `${basePath}.entity.id`);
            return;
        }
        seenIds.add(id);
        nodes.push({ id, derivedFrom: [...result.record.wasDerivedFrom] });
    });

    let rootCount = 0;
    for (const node of nodes) {
        if (node.derivedFrom.length === 0) {
            rootCount += 1;
            continue;
        }
        for (const ref of node.derivedFrom) {
            if (ref === node.id) {
                pushIssue(issues, 'provenance.derivation.self', `Entidade nao pode derivar de si mesma: ${node.id}.`, '$.wasDerivedFrom');
            } else if (!seenIds.has(ref)) {
                pushIssue(issues, 'provenance.derivation.unknown', `Origem nao existe na cadeia: ${ref}.`, '$.wasDerivedFrom');
            }
        }
    }

    const adjacency = new Map<string, string[]>();
    for (const node of nodes) {
        adjacency.set(node.id, node.derivedFrom.filter((ref) => ref !== node.id && seenIds.has(ref)));
    }

    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const id of seenIds) color.set(id, WHITE);

    let hasCycle = false;
    for (const start of seenIds) {
        if (color.get(start) !== WHITE) continue;
        const stack: Array<{ id: string; cursor: number }> = [{ id: start, cursor: 0 }];
        color.set(start, GRAY);
        while (stack.length > 0) {
            const frame = stack[stack.length - 1];
            if (!frame) break;
            const neighbors = adjacency.get(frame.id) ?? [];
            if (frame.cursor < neighbors.length) {
                const next = neighbors[frame.cursor];
                frame.cursor += 1;
                if (next === undefined) continue;
                const state = color.get(next);
                if (state === GRAY) {
                    hasCycle = true;
                    break;
                }
                if (state === WHITE) {
                    color.set(next, GRAY);
                    stack.push({ id: next, cursor: 0 });
                }
            } else {
                color.set(frame.id, BLACK);
                stack.pop();
            }
        }
        if (hasCycle) break;
    }

    if (hasCycle) {
        pushIssue(issues, 'provenance.derivation.cycle', 'Cadeia de derivacao contem ciclo.', '$.wasDerivedFrom');
    }

    return {
        valid: issues.length === 0,
        issues,
        entityCount: nodes.length,
        rootCount,
    };
}

/**
 * Type guard: true when the input satisfies the full provenance facet
 * contract (structural fields + origin-or-justification rule).
 *
 * @param {unknown} input
 * @returns {boolean} true for a valid ProtocolProvenanceFacet
 */
export function isProtocolProvenanceFacet(input: unknown): input is ProtocolProvenanceFacet {
    return createProvenanceRecord(input).ok;
}
