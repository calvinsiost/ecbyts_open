// @ts-check
export interface PresentationState {
    id: string;
    title?: string;
    description?: string;
    updatedAt?: string;
    steps: unknown[];
    exampleReadiness?: unknown;
    [key: string]: any;
}
export type PresentationListener = (evt: { type: string; payload: any; state: string; activeId: string | null }) => void;
export function getMachineState(...args: unknown[]): unknown;
export function setMachineState(...args: unknown[]): unknown;
export function createPresentation(...args: unknown[]): PresentationState;
export function listPresentations(...args: unknown[]): PresentationState[];
export function getPresentation(id: string): PresentationState | null;
export function updatePresentation(...args: unknown[]): PresentationState | null;
export function deletePresentation(...args: unknown[]): boolean;
export function _mutateActive(callback: (presentation: PresentationState) => void): unknown;
export function getActivePresentation(...args: unknown[]): PresentationState | null;
export function setActivePresentation(...args: unknown[]): unknown;
export function subscribe(callback: PresentationListener): () => void;
