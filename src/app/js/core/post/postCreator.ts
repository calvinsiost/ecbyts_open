

interface PostPosition {
    x: number;
    y: number;
    z: number;
}

interface PostElementSpec {
    family: 'post';
    id: string;
    name: string;
    data: {
        calculatorFnId: string | null;
        inputs: Record<string, any>;
        result: number | null;
        formattedResult: string;
        linkedTo: string | null;
        position: PostPosition | null;
        severity: string | null;
        error: string | null;
        createdAt: string;
    };
    label: string;
}

interface BuildPostArgs {
    calculatorFnId?: string | null;
    inputs?: Record<string, any>;
    linkedElementId?: string | null;
    position?: PostPosition | null;
    label?: string; // override label; default derived
    id?: string; // override id; default generated
    computeFn?: (item: any) => any; // injected calculator engine (for tests)
    calculatorItem?: { id?: string; label?: string; calculation?: string; severity?: string };
}

interface HealthAlertItemLike {
    severity: string;
    kind: string;
    label: string;
    elementId?: string;
    workerPseudonym?: string;
    id?: string;
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function _isObject(v: unknown): v is Record<string, any> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function _isFinitePosition(v: unknown): boolean {
    if (!_isObject(v)) return false;
    const p = v as any;
    return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

let _counter = 0;
/**
 * Sequential id helper (collision-free within process). Tests reset.
 */
function _nextId(): string {
    _counter += 1;
    return `post-${Date.now().toString(36)}-${_counter}`;
}

/**
 * Reset internal counter — exported for deterministic tests.
 */
export function __resetPostIdCounter(): void {
    _counter = 0;
}

/**
 * Format a calculator result into a one-line label suitable for placa text.
 * Defensive: handles null, NaN, very long strings.
 */
export function formatPostText(
    value: number | null | undefined,
    label?: string,
    suffix?: string,
    precision?: number,
): string {
    const lbl = typeof label === 'string' && label.length > 0 ? label : '';
    if (value == null || (typeof value === 'number' && !Number.isFinite(value))) {
        return lbl ? `${lbl}: —` : '—';
    }
    const p = Number.isFinite(precision) ? Math.max(0, Math.min(8, precision as number)) : 2;
    const sfx = typeof suffix === 'string' ? suffix : '';
    const v = (value as number).toFixed(p);
    return lbl ? `${lbl}: ${v}${sfx}` : `${v}${sfx}`;
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Build a `post` element spec from a calculator function reference.
 *
 * If `args.calculatorItem` is provided, runs it through `computeFn`
 * (defaults to identity → null). Tests inject a fake `computeFn`.
 * Returns a deterministic spec compatible with addElement().
 */
export function buildPostFromCalculator(args: BuildPostArgs): PostElementSpec {
    const safe = _isObject(args) ? args : {};
    const calculatorFnId =
        typeof safe.calculatorFnId === 'string' && safe.calculatorFnId.length > 0 ? safe.calculatorFnId : null;
    const inputs = _isObject(safe.inputs) ? { ...(safe.inputs as any) } : {};
    const linkedTo =
        typeof safe.linkedElementId === 'string' && safe.linkedElementId.length > 0 ? safe.linkedElementId : null;
    const position = _isFinitePosition(safe.position) ? (safe.position as PostPosition) : null;

    let result: number | null = null;
    let error: string | null = null;
    let severity: string | null = null;
    let computedLabel = '';
    let suffix = '';
    let precision = 2;

    const item = _isObject(safe.calculatorItem) ? (safe.calculatorItem as any) : null;
    if (item) {
        computedLabel = typeof item.label === 'string' ? item.label : '';
        suffix = typeof item.suffix === 'string' ? item.suffix : '';
        precision = Number.isFinite(item.precision) ? item.precision : 2;

        if (typeof safe.computeFn === 'function') {
            try {
                const out = safe.computeFn(item);
                if (_isObject(out)) {
                    const v = (out as any).value;
                    if (typeof v === 'number' && Number.isFinite(v)) result = v;
                    const sev = (out as any).severity;
                    if (typeof sev === 'string') severity = sev;
                    const errStr = (out as any).error;
                    if (typeof errStr === 'string' && errStr.length > 0) error = errStr;
                }
            } catch (e) {
                error = e instanceof Error ? e.message : String(e);
            }
        } else if (!calculatorFnId) {
            error = 'unknown-calculator';
        }
    } else if (calculatorFnId) {
        // calculatorFnId given but no item snapshot/computeFn → cannot evaluate now
        error = 'unknown-calculator';
    }

    const formattedResult = formatPostText(result, computedLabel, suffix, precision);
    const id = typeof safe.id === 'string' && safe.id.length > 0 ? safe.id : _nextId();
    const label = typeof safe.label === 'string' && safe.label.length > 0 ? safe.label : formattedResult;
    const name = label || id;

    return {
        family: 'post',
        id,
        name,
        label,
        data: {
            calculatorFnId,
            inputs,
            result,
            formattedResult,
            linkedTo,
            position,
            severity,
            error,
            createdAt: new Date().toISOString(),
        },
    };
}

/**
 * Build a `post` element spec from a Health Alert item. Maps severity →
 * post-it color metadata (rendering layer reads `data.severity`).
 */
export function buildPostFromHealthAlertItem(
    alertItem: HealthAlertItemLike,
    opts?: { linkedElementId?: string | null; position?: PostPosition | null; id?: string },
): PostElementSpec {
    const safe = _isObject(alertItem) ? alertItem : ({} as any);
    const o = _isObject(opts) ? opts : {};
    const severity = typeof safe.severity === 'string' ? safe.severity : 'ok';
    const rawLabel = typeof safe.label === 'string' && safe.label.length > 0 ? safe.label : 'Health Alert';
    const linkedTo =
        typeof o.linkedElementId === 'string' && o.linkedElementId.length > 0
            ? o.linkedElementId
            : typeof safe.elementId === 'string'
              ? safe.elementId
              : null;
    const position = _isFinitePosition(o.position) ? (o.position as PostPosition) : null;
    const id = typeof o.id === 'string' && o.id.length > 0 ? o.id : _nextId();

    // Compose a human label: "[severity] kind: label"
    const sev = severity.toUpperCase();
    const kind = typeof safe.kind === 'string' ? safe.kind : '';
    const composed = kind ? `[${sev}] ${kind}: ${rawLabel}` : `[${sev}] ${rawLabel}`;

    return {
        family: 'post',
        id,
        name: composed,
        label: composed,
        data: {
            calculatorFnId: 'health-alert',
            inputs: {
                kind,
                workerPseudonym: typeof safe.workerPseudonym === 'string' ? safe.workerPseudonym : null,
                sourceId: typeof safe.id === 'string' ? safe.id : null,
            },
            result: null,
            formattedResult: composed,
            linkedTo,
            position,
            severity,
            error: null,
            createdAt: new Date().toISOString(),
        },
    };
}

/**
 * Map a post-it severity → background color hex (post-it palette).
 * Used by renderer; exported for testability.
 */
export function postBackgroundForSeverity(severity: string | null | undefined): string {
    switch (severity) {
        case 'emergency':
            return '#fecaca'; // red-200
        case 'critical':
            return '#fed7aa'; // orange-200
        case 'warning':
            return '#fde68a'; // amber-200
        case 'expired':
            return '#e5e7eb'; // gray-200
        case 'ok':
            return '#bbf7d0'; // green-200
        default:
            return '#fef3c7'; // amber-50 (default sticky note)
    }
}

/**
 * Validate that a value is a well-formed PostElementSpec produced by
 * one of the builders here. Returns true|false (no throw) for guards.
 */
export function isValidPostSpec(spec: unknown): boolean {
    if (!_isObject(spec)) return false;
    const s = spec as any;
    if (s.family !== 'post') return false;
    if (typeof s.id !== 'string' || s.id.length === 0) return false;
    if (typeof s.name !== 'string') return false;
    if (typeof s.label !== 'string') return false;
    if (!_isObject(s.data)) return false;
    const d = s.data;
    if (typeof d.formattedResult !== 'string') return false;
    if (d.result !== null && typeof d.result !== 'number') return false;
    if (d.linkedTo !== null && typeof d.linkedTo !== 'string') return false;
    if (d.position !== null && !_isFinitePosition(d.position)) return false;
    return true;
}
