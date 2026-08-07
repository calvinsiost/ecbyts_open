// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   BINDING RESOLVER — Motor de resolucao de bindings
   Navega dot-paths, resolve referencias entre entidades do modelo,
   aplica transforms, detecta ciclos.

   Resolucao LAZY: ocorre no momento da leitura (UI render, export,
   analytics), nao na escrita. Isso elimina a necessidade de
   interceptar toda mutacao no modelo.
   ================================================================ */

/** Maximum binding chain depth to prevent infinite loops */
const MAX_DEPTH = 10;

type AnyRecord = Record<string, any>;

type PathSegment =
    | { type: 'property'; key: string }
    | { type: 'index'; index: number }
    | { type: 'selector'; key: string; value: string };

interface BindingRef {
    targetType?: string;
    targetId?: string;
    targetPath?: string;
    transform?: string;
    transformArgs?: AnyRecord;
    resolvedValue?: any;
    resolvedAt?: string | null;
    status?: string;
    writeToTarget?: boolean;
}

interface ResolutionContext {
    getElementById?: (id: string) => any;
    getCampaignById?: (id: string) => any;
    getCalculatorMetric?: (id: string) => any;
    getObservationById?: (id: string) => any;
    getConstantById?: (id: string) => any;
    getCoordinateById?: (id: string) => any;
}

const TRANSFORMS: Record<string, (value: any, args: any, context: any) => any> = {
    identity: (value: any) => value,
    negate: (value: any) => (typeof value === 'number' ? -value : value),
    midpoint: (value: any, args: AnyRecord, context: AnyRecord) => {
        if (typeof value !== 'number') return value;
        const secondPath = args?.secondPath;
        const targetObj = context?.targetObj;
        const pathResolver = context?.resolvePath;
        if (!secondPath || targetObj == null || typeof pathResolver !== 'function') return value;
        const second = pathResolver(targetObj, secondPath);
        return typeof second === 'number' ? (value + second) / 2 : value;
    },
    offset: (value: any, args: AnyRecord) => {
        if (typeof value !== 'number') return value;
        const off = args?.offset;
        return value + (typeof off === 'number' ? off : 0);
    },
};

function applyTransform(
    transformId: string | undefined | null,
    value: any,
    args: AnyRecord | undefined,
    context: AnyRecord | undefined,
): any {
    const fn = TRANSFORMS[transformId || 'identity'] || TRANSFORMS.identity;
    return fn ? fn(value, args || {}, context || {}) : value;
}

// ----------------------------------------------------------------
// PATH PARSING & NAVIGATION
// ----------------------------------------------------------------

/**
 * Parse a dot-path string into an array of typed segments.
 * Converte "data.profile.constructive.elements[type=screen].topDepth"
 * em segmentos tipados para navegacao segura.
 *
 * Segment types:
 * - { type: 'property', key: 'data' }
 * - { type: 'index', index: 4 }
 * - { type: 'selector', key: 'type', value: 'screen' }
 *
 * @param path - Dot-path with optional bracket notation
 * @returns Parsed segments
 */
export function parsePath(path: string): PathSegment[] {
    if (!path || typeof path !== 'string') return [];

    const segments: PathSegment[] = [];
    // Regex captura: propriedade simples, [indice], [chave=valor]
    const regex = /([^.[\]]+)|\[(\d+)\]|\[(\w+)=([^\]]+)\]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(path)) !== null) {
        if (match[1] !== undefined) {
            // Propriedade simples: "data", "position", "topDepth"
            segments.push({ type: 'property', key: match[1] });
        } else if (match[2] !== undefined) {
            // Indice numerico: [4], [0]
            segments.push({ type: 'index', index: parseInt(match[2], 10) });
        } else if (match[3] !== undefined && match[4] !== undefined) {
            // Seletor: [type=screen], [elementId=well-3]
            segments.push({ type: 'selector', key: match[3], value: match[4] });
        }
    }

    return segments;
}

/**
 * Navigate a dot-path on an object, returning the value at that path.
 * Navega um objeto seguindo o caminho especificado.
 *
 * Supports:
 * - Simple property: "data.position.z"
 * - Numeric index: "elements[4]"
 * - Selector: "elements[type=screen]" (finds first match in array)
 *
 * @param obj - Root object to navigate
 * @param path - Dot-path string
 * @returns Value at path, or undefined if path is invalid
 */
export function resolvePath(obj: AnyRecord | null | undefined, path: string): any {
    if (obj == null || !path) return undefined;

    const segments = parsePath(path);
    let current: any = obj;

    for (const seg of segments) {
        if (current == null) return undefined;

        if (seg.type === 'property') {
            current = current[seg.key];
        } else if (seg.type === 'index') {
            current = Array.isArray(current) ? current[seg.index] : undefined;
        } else if (seg.type === 'selector') {
            current = Array.isArray(current)
                ? current.find((item) => item != null && String(item[seg.key]) === String(seg.value))
                : undefined;
        }
    }

    return current;
}

/**
 * Set a value at a dot-path on an object.
 * Atribui um valor no caminho especificado (para writeback do resolved value).
 * Cria objetos intermediarios se necessario, mas NAO cria arrays.
 *
 * @param obj - Root object
 * @param path - Dot-path (only simple properties supported for set)
 * @param value - Value to set
 * @returns true if set succeeded
 */
export function setPath(obj: AnyRecord | null | undefined, path: string, value: any): boolean {
    if (obj == null || !path) return false;

    const parts = path.split('.');
    let current: AnyRecord = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i] || '';
        if (current[part] == null) {
            current[part] = {};
        }
        current = current[part];
        if (typeof current !== 'object') return false;
    }

    current[parts[parts.length - 1] || ''] = value;
    return true;
}

// ----------------------------------------------------------------
// TARGET RESOLUTION
// ----------------------------------------------------------------

/**
 * Resolve the target object for a binding.
 * Encontra a entidade-alvo (elemento, campanha, calculator, observacao, coordinate).
 *
 * @param binding - BindingRef with targetType and targetId
 * @param context - Entity lookup context
 * @returns Target object or null if not found
 */
function resolveTarget(binding: BindingRef, context: ResolutionContext): any {
    if (!binding?.targetType || !binding?.targetId) return null;

    switch (binding.targetType) {
        case 'element':
            return context.getElementById?.(binding.targetId) || null;
        case 'campaign':
            return context.getCampaignById?.(binding.targetId) || null;
        case 'calculator':
            return context.getCalculatorMetric?.(binding.targetId) || null;
        case 'observation':
            return context.getObservationById?.(binding.targetId) || null;
        case 'constant':
            return context.getConstantById?.(binding.targetId) || null;
        case 'coordinate':
            return context.getCoordinateById?.(binding.targetId) || null;
        default:
            console.warn(`[Bindings] Unknown targetType: "${binding.targetType}"`);
            return null;
    }
}

function _isFieldTypeCompatible(field: string, value: any): boolean {
    const numericFields = new Set(['x', 'y', 'z', 'value', 'limit', 'expectedValue', 'uncertainty', 'coverageFactor']);
    const numericCoordinateFields = new Set([
        'x',
        'y',
        'z',
        'easting',
        'northing',
        'elevation',
        'lat',
        'lng',
        'lon',
        'latitude',
        'longitude',
    ]);
    const leafField =
        String(field || '')
            .split('.')
            .pop() || '';
    if (numericFields.has(field) || numericCoordinateFields.has(leafField)) {
        if (value === null || value === '' || value === undefined) return false;
        return Number.isFinite(Number(value));
    }
    if (field === 'date') return typeof value === 'string' && value.length > 0;
    return true;
}

// ----------------------------------------------------------------
// SINGLE BINDING RESOLUTION
// ----------------------------------------------------------------

/**
 * Resolve a single binding, returning the resolved value and status.
 * Resolve um binding individual: encontra o alvo, navega o path,
 * aplica o transform.
 *
 * @param binding - BindingRef object
 * @param context - Resolution context with entity lookups
 * @param visited? - Visited set for cycle detection
 * @param depth - Current chain depth
 */
export function resolveBinding(
    binding: BindingRef | null | undefined,
    context: ResolutionContext,
    visited?: Set<string>,
    depth = 0,
): { value: any; status: string; error?: string } {
    if (!binding || !binding.targetId || !binding.targetPath) {
        return { value: binding?.resolvedValue, status: 'broken', error: 'Missing targetId or targetPath' };
    }

    // Deteccao de ciclo: chave unica por binding target+path
    const bindingKey = `${binding.targetType}:${binding.targetId}:${binding.targetPath}`;
    if (visited?.has(bindingKey)) {
        return { value: binding.resolvedValue, status: 'circular', error: 'Circular binding detected' };
    }
    if (depth >= MAX_DEPTH) {
        return { value: binding.resolvedValue, status: 'circular', error: `Max depth (${MAX_DEPTH}) exceeded` };
    }

    // Adiciona ao visited set
    visited?.add(bindingKey);

    // Encontra entidade-alvo
    const target = resolveTarget(binding, context);
    if (target == null) {
        return {
            value: binding.resolvedValue,
            status: 'broken',
            error: `Target not found: ${binding.targetType}/${binding.targetId}`,
        };
    }

    // Navega o path no alvo
    const rawValue = resolvePath(target, binding.targetPath);
    if (rawValue === undefined) {
        return { value: binding.resolvedValue, status: 'broken', error: `Path not found: ${binding.targetPath}` };
    }

    // Aplica transform
    const transformContext = {
        targetObj: target,
        resolvePath,
    };
    const transformed = applyTransform(binding.transform, rawValue, binding.transformArgs, transformContext);

    return { value: transformed, status: 'ok' };
}

// ----------------------------------------------------------------
// OBSERVATION-LEVEL RESOLUTION
// ----------------------------------------------------------------

/**
 * Resolve all bindings on a single observation.
 * Resolve todos os bindings de uma observacao, atualizando os campos
 * reais (obs.z, obs.date, etc.) e o cache (resolvedValue, status).
 *
 * Mutates the observation in place for performance.
 *
 * @param obs - Observation object with optional bindings
 * @param context - Resolution context
 */
export function resolveObservation(
    obs: AnyRecord,
    context: ResolutionContext,
): { resolved: number; broken: number; circular: number } {
    const stats = { resolved: 0, broken: 0, circular: 0 };
    if (!obs?.bindings || typeof obs.bindings !== 'object') return stats;

    const visited = new Set<string>();

    for (const [field, binding] of Object.entries(obs.bindings) as Array<[string, BindingRef]>) {
        const result = resolveBinding(binding as BindingRef, context, visited, 0);

        // Atualiza cache do binding
        binding.status = result.status;
        if (result.status === 'ok') {
            binding.resolvedValue = result.value;
            binding.resolvedAt = new Date().toISOString();
            // Writeback: atualiza campo real da observacao
            setPath(obs, field, result.value);
            stats.resolved++;
        } else if (result.status === 'circular') {
            stats.circular++;
        } else {
            stats.broken++;
        }
    }

    return stats;
}

// ----------------------------------------------------------------
// MODEL-WIDE RESOLUTION SWEEP
// ----------------------------------------------------------------

/**
 * Resolve all bindings across all elements in the model.
 * Sweep completo: chamado apos import ou export para garantir
 * que todos os valores vinculados estao atualizados.
 *
 * @param elements - All model elements
 * @param campaigns - All campaigns
 * @param options - { getCalculatorMetric, getCoordinateById, coordinates }
 */
export function resolveAllBindings(
    elements: AnyRecord[],
    campaigns: AnyRecord[],
    options: AnyRecord = {},
): { resolved: number; broken: number; circular: number; errors: string[] } {
    const totals: { resolved: number; broken: number; circular: number; errors: string[] } = {
        resolved: 0,
        broken: 0,
        circular: 0,
        errors: [],
    };

    if (!Array.isArray(elements)) return totals;

    // Constroi lookups para resolucao eficiente
    const elementMap = new Map<string, AnyRecord>();
    const observationMap = new Map<string, AnyRecord>();

    for (const el of elements) {
        if (el?.id) elementMap.set(el.id, el);
        // Indexa observacoes por ID (se tiverem id)
        if (Array.isArray(el?.data?.observations)) {
            for (const obs of el.data.observations) {
                if (obs?.id) observationMap.set(obs.id, obs);
            }
        }
    }

    const campaignMap = new Map<string, AnyRecord>();
    if (Array.isArray(campaigns)) {
        for (const c of campaigns) {
            if (c?.id) campaignMap.set(c.id, c);
        }
    }

    const constantMap = new Map<string, AnyRecord>();
    if (Array.isArray(options.constants)) {
        for (const c of options.constants) {
            if (c?.id) constantMap.set(c.id, c);
        }
    }

    const coordinateMap = new Map<string, AnyRecord>();
    if (Array.isArray(options.coordinates)) {
        for (const c of options.coordinates) {
            if (c?.id) coordinateMap.set(c.id, c);
        }
    }

    const context: ResolutionContext = {
        getElementById: (id: string) => elementMap.get(id),
        getCampaignById: (id: string) => campaignMap.get(id),
        getObservationById: (id: string) => observationMap.get(id),
        getCalculatorMetric: options.getCalculatorMetric || (() => null),
        getConstantById: options.getConstantById || ((id: string) => constantMap.get(id) || null),
        getCoordinateById: options.getCoordinateById || ((id: string) => coordinateMap.get(id) || null),
    };

    // Resolve bindings em todas as observacoes
    for (const el of elements) {
        if (!Array.isArray(el?.data?.observations)) continue;

        for (const obs of el.data.observations) {
            const stats = resolveObservation(obs, context);
            totals.resolved += stats.resolved;
            totals.broken += stats.broken;
            totals.circular += stats.circular;
        }

        // Resolve bindings em element.data.bindings (se existirem)
        if (el.data?.bindings && typeof el.data.bindings === 'object') {
            const visited = new Set<string>();
            for (const [field, binding] of Object.entries(el.data.bindings) as Array<[string, BindingRef]>) {
                const result = resolveBinding(binding as BindingRef, context, visited, 0);
                binding.status = result.status;
                if (result.status === 'ok') {
                    binding.resolvedValue = result.value;
                    binding.resolvedAt = new Date().toISOString();
                    setPath(el.data, field, result.value);
                    totals.resolved++;
                } else if (result.status === 'circular') {
                    totals.circular++;
                } else {
                    totals.broken++;
                }
            }
        }
    }

    // Resolve bindings em campanhas (se existirem)
    if (Array.isArray(campaigns)) {
        for (const campaign of campaigns) {
            if (!campaign?.bindings || typeof campaign.bindings !== 'object') continue;
            const visited = new Set<string>();
            for (const [field, binding] of Object.entries(campaign.bindings) as Array<[string, BindingRef]>) {
                const result = resolveBinding(binding as BindingRef, context, visited, 0);
                binding.status = result.status;
                if (result.status === 'ok') {
                    binding.resolvedValue = result.value;
                    binding.resolvedAt = new Date().toISOString();
                    setPath(campaign, field, result.value);
                    totals.resolved++;
                } else {
                    totals.broken++;
                }
            }
        }
    }

    if (totals.broken > 0 || totals.circular > 0) {
        console.warn(
            `[Bindings] Sweep: ${totals.resolved} resolved, ${totals.broken} broken, ${totals.circular} circular`,
        );
    }

    return totals;
}

// ----------------------------------------------------------------
// BINDING CRUD HELPERS
// ----------------------------------------------------------------

/**
 * Create a new binding on an object's field.
 * Cria um binding novo: valida, detecta ciclos preventivamente, atribui.
 *
 * @param obj - Object that will own the binding (observation, element.data, etc.)
 * @param field - Field name to bind (e.g., 'z', 'date', 'value')
 * @param config - { targetType, targetId, targetPath, transform?, transformArgs? }
 * @param context - Resolution context for immediate resolution
 */
export function createBinding(
    obj: AnyRecord,
    field: string,
    config: BindingRef,
    context: ResolutionContext,
): { success: boolean; error?: string } {
    if (!obj || !field || !config?.targetType || !config?.targetId || !config?.targetPath) {
        return { success: false, error: 'Missing required binding config' };
    }

    if (config.targetType === 'constant') {
        const allowedConstantPaths = new Set([
            'value',
            'unitId',
            'name',
            'symbol',
            'uncertainty',
            'uncertaintyType',
            'coverageFactor',
        ]);
        if (!allowedConstantPaths.has(config.targetPath)) {
            return { success: false, error: `Invalid constant targetPath: ${config.targetPath}` };
        }

        const targetConstant = context?.getConstantById?.(config.targetId);
        if (targetConstant?.mutable === false && config.writeToTarget === true) {
            return { success: false, error: 'Target constant is immutable' };
        }
    }

    // Inicializa bindings se nao existe
    if (!obj.bindings) obj.bindings = {};

    const binding: BindingRef = {
        targetType: config.targetType,
        targetId: config.targetId,
        targetPath: config.targetPath,
        transform: config.transform || 'identity',
        transformArgs: config.transformArgs || {},
        resolvedValue: null,
        resolvedAt: null,
        status: 'stale',
    };

    // Resolve imediatamente para validar e popular cache
    const visited = new Set<string>();
    const result = resolveBinding(binding, context, visited, 0);

    if (result.status === 'circular') {
        return { success: false, error: 'Binding would create a circular reference' };
    }

    if (result.status === 'ok' && !_isFieldTypeCompatible(field, result.value)) {
        return {
            success: false,
            error: `Type mismatch: field "${field}" is incompatible with binding value`,
        };
    }

    binding.status = result.status;
    if (result.status === 'ok') {
        binding.resolvedValue = result.value;
        binding.resolvedAt = new Date().toISOString();
        // Writeback imediato
        setPath(obj, field, result.value);
    }

    obj.bindings[field] = binding;
    return { success: true };
}

/**
 * Remove a binding from an object's field.
 * Remove o binding, preservando o ultimo valor resolvido no campo.
 *
 * @param obj - Object that owns the binding
 * @param field - Field name to unbind
 * @returns true if a binding was removed
 */
export function removeBinding(obj: AnyRecord, field: string): boolean {
    if (!obj?.bindings?.[field]) return false;

    delete obj.bindings[field];

    // Limpa bindings vazio
    if (Object.keys(obj.bindings).length === 0) {
        delete obj.bindings;
    }

    return true;
}

/**
 * Check if a field on an object has an active binding.
 * Verifica se o campo esta vinculado (para UI e protecao de mutacao).
 *
 * @param obj - Object to check
 * @param field - Field name
 * @returns true if field is bound with status 'ok'
 */
export function isBound(obj: AnyRecord, field: string): boolean {
    return obj?.bindings?.[field]?.status === 'ok';
}

/**
 * Get binding info for a field (for UI display).
 * Retorna informacoes do binding para exibir na UI.
 *
 * @param obj - Object to check
 * @param field - Field name
 * @returns Binding info or null
 */
export function getBindingInfo(obj: AnyRecord, field: string): any {
    return obj?.bindings?.[field] || null;
}

/**
 * Mark all bindings targeting a specific entity as broken.
 * Chamado quando um elemento/campanha e deletado.
 *
 * @param elements - All model elements
 * @param targetType - Type of deleted entity
 * @param targetId - ID of deleted entity
 * @returns Number of bindings marked as broken
 */
export function markBindingsBroken(elements: AnyRecord[], targetType: string, targetId: string): number {
    let count = 0;

    for (const el of elements) {
        // Check observation bindings
        if (Array.isArray(el?.data?.observations)) {
            for (const obs of el.data.observations) {
                if (!obs?.bindings) continue;
                for (const binding of Object.values(obs.bindings)) {
                    const bindingRef = binding as BindingRef;
                    if (bindingRef.targetType === targetType && bindingRef.targetId === targetId) {
                        bindingRef.status = 'broken';
                        count++;
                    }
                }
            }
        }
        // Check element-level bindings
        if (el?.data?.bindings) {
            for (const binding of Object.values(el.data.bindings)) {
                const bindingRef = binding as BindingRef;
                if (bindingRef.targetType === targetType && bindingRef.targetId === targetId) {
                    bindingRef.status = 'broken';
                    count++;
                }
            }
        }
    }

    return count;
}
