export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type UnknownRecord = Record<string, unknown>;

export interface StorageSetResult {
    ok: boolean;
    key?: string;
    error?: string;
}

export interface LegacyHandlerContext {
    event?: Event;
    target?: EventTarget | null;
    model?: unknown;
    state?: UnknownRecord;
}

export type LegacyHandler<TPayload = unknown, TResult = unknown> = (
    payload?: TPayload,
    context?: LegacyHandlerContext,
) => TResult | Promise<TResult>;
