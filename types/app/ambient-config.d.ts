// Ambient module declarations for not-yet-migrated JS modules that TS sources
// need to import. Narrow types — only the slice each consumer reads.

declare module '*/config.js' {
    type LevelName = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';
    // W36 Strategy Pivot: CONFIG access is pervasive across the codebase.
    // Using `any` (not unknown) drains TS18046 globally at trivial type cost.
    // Specific known fields stay narrow for IDE hints.
    export const CONFIG: {
        LOG_LEVEL?: LevelName;
        LOG_LEVELS?: Record<string, LevelName>;
        DEBUG_MODULE_LOAD?: boolean;
        FEATURES?: Record<string, any>;
        UNITS?: any[];
        PARAMETERS?: any[];
        [key: string]: any;
    };
}

declare module '*/errorReporting/reporter.js' {
    export function captureError(
        severity: string,
        message: string,
        options?: { metadata?: Record<string, unknown> },
    ): void;
}

declare module '*/uncertainty/index.js' {
    export function createUValue(value: unknown, u: unknown, opts?: unknown): { value: number; u: number | null; k: number; type: 'absolute' | 'relative' };
    export function propagate(kind: string, list: unknown[], weights: number[]): { u: number; [key: string]: unknown };
    export function aggregateQuality(list: unknown[], eis: number, u: number): { detectRate?: number; [key: string]: unknown };
    export function classifyBadge(metrics: unknown): 'green' | 'yellow' | 'red' | 'grey';
    export function chooseNDMethod(opts: { matrix?: string | undefined; detectRate?: number | undefined; preferredMethod?: string | undefined }): unknown;
}

declare module '*/validation/globalCompliance.js' {
    export function computeGlobalCompliance(observations: unknown[], matrix: string): { score: number; [key: string]: unknown } | null;
}

declare module '*/schema.js' {
    export const SAMPLE_MATRIX: Readonly<Record<string, string>>;
    export const HEALTH_STATUS: Readonly<{
        green: 'green';
        yellow: 'yellow';
        red: 'red';
        critical: 'critical';
        unknown: 'unknown';
        [key: string]: string;
    }>;
    export const REFERENCE_STANDARD: Readonly<Record<string, string>>;
    export const HEALTH_EVENTS: Readonly<{
        THRESHOLD_BREACHED: string;
        [key: string]: string;
    }>;
    export function createWorker(input: Record<string, unknown>): Record<string, unknown>;
    export function createReading(input: Record<string, unknown>): Record<string, unknown>;
    export function createThresholdRule(input: Record<string, unknown>): Record<string, unknown>;
    export function isValidWorker(w: unknown): boolean;
    export function isValidReading(r: unknown): boolean;
    export function isValidThresholdRule(rule: unknown): boolean;
}
