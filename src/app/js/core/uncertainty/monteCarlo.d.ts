// @ts-check
export function quantile(...args: unknown[]): number;
export function lhsMatrix(...args: unknown[]): number[][];
export function meanSd(...args: unknown[]): { mean: number; sd: number };
export function histogram(...args: unknown[]): Array<Record<string, unknown>>;
export function runMonteCarlo(...args: unknown[]): Promise<Record<string, unknown>> | Record<string, unknown>;
export function runMonteCarloFromQ2Q(...args: unknown[]): Promise<Record<string, unknown>> | Record<string, unknown>;
export function buildMonteCarloEvidence(...args: unknown[]): Record<string, unknown>;
