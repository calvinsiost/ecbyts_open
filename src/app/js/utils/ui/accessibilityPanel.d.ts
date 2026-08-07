export interface A11yPrefs {
    theme?: string;
    boost?: boolean;
    transparency?: boolean;
    simulation?: string;
    [key: string]: unknown;
}

export function loadA11yPrefs(): A11yPrefs;
export function saveA11yPrefs(prefs: A11yPrefs): void;
export function applyTheme(theme: string): void;
export function applyBoost(enabled: boolean): void;
export function applyReduceTransparency(enabled: boolean): void;
export function simulateColorBlind(type: string): void;
export function getContrastInfo(): Record<string, unknown>;
export function openAccessibilityPanel(): void;
export function closeAccessibilityPanel(): void;
