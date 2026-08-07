export function idbSet(key: string, value: unknown): Promise<boolean>;
export function idbGet(key: string): Promise<unknown | null>;
export function idbDelete(key: string): Promise<boolean>;
