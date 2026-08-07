export const CONNECTOR_KINDS = Object.freeze([
    'control-flow',
    'data-association',
    'reference',
    'custom',
] as const);

export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export const CONNECTOR_DIRECTIONS = Object.freeze([
    'forward',
    'backward',
    'bidirectional',
    'undirected',
] as const);

export type ConnectorDirection = (typeof CONNECTOR_DIRECTIONS)[number];

export const CONNECTOR_FAILURE_BEHAVIORS = Object.freeze([
    'block',
    'warn',
    'skip',
    'rework',
    'human-decision',
] as const);

export type ConnectorFailureBehavior = (typeof CONNECTOR_FAILURE_BEHAVIORS)[number];

export interface ConnectorPoint {
    x: number;
    y: number;
}

export interface ProtocolConnector {
    kind: ConnectorKind;
    direction: ConnectorDirection;
    source: string;
    target: string;
    required: boolean;
    conditionRef?: string | null;
    dataRefs: string[];
    evidenceRefs: string[];
    events: string[];
    failureBehavior?: ConnectorFailureBehavior;
    justification?: string | null;
    points?: ConnectorPoint[];
}

export interface ProtocolConnectorIssue {
    code: string;
    message: string;
    path: string;
    severity: 'error';
}

export interface ProtocolConnectorValidationResult {
    valid: boolean;
    errors: ProtocolConnectorIssue[];
}

export interface ProtocolConnectorValidationOptions {
    knownElementIds?: Iterable<string>;
    knownConditionIds?: Iterable<string>;
}

export function isConnectorKind(value: unknown): value is ConnectorKind {
    return typeof value === 'string' && (CONNECTOR_KINDS as readonly string[]).includes(value);
}

export function isConnectorDirection(value: unknown): value is ConnectorDirection {
    return typeof value === 'string' && (CONNECTOR_DIRECTIONS as readonly string[]).includes(value);
}

export function isConnectorFailureBehavior(value: unknown): value is ConnectorFailureBehavior {
    return typeof value === 'string' && (CONNECTOR_FAILURE_BEHAVIORS as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function pushIssue(
    errors: ProtocolConnectorIssue[],
    code: string,
    message: string,
    path: string,
): void {
    errors.push({ code, message, path, severity: 'error' });
}

function collectStringArray(
    value: unknown,
    path: string,
    code: string,
    label: string,
    errors: ProtocolConnectorIssue[],
): string[] {
    if (!Array.isArray(value)) {
        pushIssue(errors, code, `${label} precisa ser uma lista de textos.`, path);
        return [];
    }
    const out: string[] = [];
    value.forEach((entry, index) => {
        const text = trimText(entry);
        if (!text) {
            pushIssue(errors, `${code}.entry`, `${label} nao pode ter item vazio.`, `${path}[${index}]`);
            return;
        }
        out.push(text);
    });
    return out;
}

function collectPoints(
    value: unknown,
    errors: ProtocolConnectorIssue[],
): ConnectorPoint[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        pushIssue(errors, 'connector.points.invalid', 'points precisa ser uma lista de pontos.', '$.points');
        return undefined;
    }
    const out: ConnectorPoint[] = [];
    value.forEach((point, index) => {
        if (
            !isPlainObject(point)
            || typeof point.x !== 'number'
            || !Number.isFinite(point.x)
            || typeof point.y !== 'number'
            || !Number.isFinite(point.y)
        ) {
            pushIssue(errors, 'connector.points.entry', 'Cada ponto precisa de numeros finitos em x e y.', `$.points[${index}]`);
            return;
        }
        out.push({ x: point.x, y: point.y });
    });
    return out;
}

export function validateProtocolConnector(
    input: unknown,
    options: ProtocolConnectorValidationOptions = {},
): ProtocolConnectorValidationResult {
    const errors: ProtocolConnectorIssue[] = [];

    if (!isPlainObject(input)) {
        pushIssue(errors, 'connector.object.required', 'Conector precisa ser um objeto.', '$');
        return { valid: false, errors };
    }

    if (!isConnectorKind(input.kind)) {
        pushIssue(
            errors,
            'connector.kind.invalid',
            `Tipo de conector invalido: ${trimText(input.kind) || String(input.kind)}.`,
            '$.kind',
        );
    }

    if (!isConnectorDirection(input.direction)) {
        pushIssue(
            errors,
            'connector.direction.invalid',
            `Direcao de conector invalida: ${trimText(input.direction) || String(input.direction)}.`,
            '$.direction',
        );
    }

    const source = trimText(input.source);
    if (!source) {
        pushIssue(errors, 'connector.source.required', 'Conector precisa de origem.', '$.source');
    }

    const target = trimText(input.target);
    if (!target) {
        pushIssue(errors, 'connector.target.required', 'Conector precisa de destino.', '$.target');
    }

    if (source && target && source === target) {
        pushIssue(errors, 'connector.self.reference', 'Conector nao pode ligar um elemento a ele mesmo.', '$.target');
    }

    if (typeof input.required !== 'boolean') {
        pushIssue(errors, 'connector.required.invalid', 'Campo required precisa ser verdadeiro ou falso.', '$.required');
    }

    let conditionRef = '';
    if (input.conditionRef !== undefined && input.conditionRef !== null) {
        conditionRef = trimText(input.conditionRef);
        if (!conditionRef) {
            pushIssue(errors, 'connector.conditionRef.empty', 'conditionRef nao pode ser vazio quando informado.', '$.conditionRef');
        }
    }

    const dataRefs = collectStringArray(input.dataRefs, '$.dataRefs', 'connector.dataRefs.invalid', 'dataRefs', errors);
    const evidenceRefs = collectStringArray(input.evidenceRefs, '$.evidenceRefs', 'connector.evidenceRefs.invalid', 'evidenceRefs', errors);
    collectStringArray(input.events, '$.events', 'connector.events.invalid', 'events', errors);

    if (input.failureBehavior !== undefined && !isConnectorFailureBehavior(input.failureBehavior)) {
        pushIssue(
            errors,
            'connector.failureBehavior.invalid',
            `Comportamento de falha invalido: ${trimText(input.failureBehavior) || String(input.failureBehavior)}.`,
            '$.failureBehavior',
        );
    }

    const justification = trimText(input.justification);
    collectPoints(input.points, errors);

    if (
        input.required === true
        && dataRefs.length === 0
        && evidenceRefs.length === 0
        && !conditionRef
        && !justification
    ) {
        pushIssue(
            errors,
            'connector.semantic.required',
            'Conector obrigatorio precisa declarar dado, evidencia, condicao ou justificativa.',
            '$',
        );
    }

    const elementIds = options.knownElementIds ? new Set(options.knownElementIds) : null;
    if (elementIds) {
        if (source && !elementIds.has(source)) {
            pushIssue(errors, 'connector.source.unknown', `Origem nao existe no processo: ${source}.`, '$.source');
        }
        if (target && !elementIds.has(target)) {
            pushIssue(errors, 'connector.target.unknown', `Destino nao existe no processo: ${target}.`, '$.target');
        }
    }

    const conditionIds = options.knownConditionIds ? new Set(options.knownConditionIds) : null;
    if (conditionIds && conditionRef && !conditionIds.has(conditionRef)) {
        pushIssue(errors, 'connector.conditionRef.unknown', `Condicao nao existe no processo: ${conditionRef}.`, '$.conditionRef');
    }

    return { valid: errors.length === 0, errors };
}

export function isProtocolConnector(input: unknown): input is ProtocolConnector {
    return validateProtocolConnector(input).valid;
}
