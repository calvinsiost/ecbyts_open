export const PARAMETER_RANGES: Record<string, { min: number; max: number; unitId?: string }>;
export const FAMILY_PARAMETERS: Record<string, readonly string[] | string[]>;
export const FAMILY_VARIABLES: Record<string, readonly string[] | string[]>;
export const RANDOM_MODEL_DEFAULTS: Record<string, unknown>;
export function buildRandomEisGovernancePack(opts?: { campaigns?: any[]; areas?: any[] }): any;
export function buildRandomUncertaintyPack(): any;
export function generateRandomModel(includeFamilies?: any, options?: any): Promise<any>;
export function createDefaultElements(): Promise<any>;
