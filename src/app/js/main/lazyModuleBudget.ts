// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Static lazy-boundary contract for boot-critical modules.
 *
 * Mantem a lista de clusters que nao devem entrar no caminho inicial por
 * import estatico. Runtime code stays small; tests consume this contract.
 */

export const LAZY_HEAVY_CLUSTERS = Object.freeze([
    'core/analytics',
    'core/recognition',
    'core/simulation',
    'utils/handlers/ingestion',
    'utils/handlers/libraries',
    'core/analytics/_registryData',
]);

export const BOOT_ENTRYPOINTS = Object.freeze([
    'main.js',
    'main/boot-preflight.js',
    'main/feature-init.js',
    'main/lazy-registry.js',
    'main/post-shell-activation.js',
    'main/post-shell-hydration.js',
    'main/runtime-lifecycle.js',
    'main/ui-shell-init.js',
    'utils/startup/analyticsInit.js',
    'utils/ui/homeGrid.js',
]);

export const ALLOWED_BOOT_STATIC_HEAVY_IMPORTS = Object.freeze([]);

export function normalizeModulePath(modulePath: string) {
    return String(modulePath)
        .replace(/\\/g, '/')
        .replace(/^.*?app\/js\//, '')
        .replace(/^src\/app\/js\//, '')
        .replace(/^\.\//, '');
}

export function resolveStaticSpecifier(fromModulePath: string, specifier: string) {
    if (!specifier.startsWith('.')) {
        return normalizeModulePath(specifier);
    }
    const from = normalizeModulePath(fromModulePath);
    const base = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '.';
    const parts = `${base}/${specifier}`.split('/');
    const resolved: string[] = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') resolved.pop();
        else resolved.push(part);
    }
    return resolved.join('/');
}

export function getHeavyCluster(modulePath: string) {
    const normalized = normalizeModulePath(modulePath).replace(/\.js$/, '');
    return LAZY_HEAVY_CLUSTERS.find((cluster) => normalized === cluster || normalized.startsWith(`${cluster}/`)) ?? null;
}

export function isBootEntrypoint(modulePath: string) {
    const normalized = normalizeModulePath(modulePath);
    return BOOT_ENTRYPOINTS.includes(normalized as never);
}

export function classifyStaticImport(fromModulePath: string, specifier: string) {
    const resolved = resolveStaticSpecifier(fromModulePath, specifier);
    const heavyCluster = getHeavyCluster(resolved);
    const from = normalizeModulePath(fromModulePath);
    const allowed = ALLOWED_BOOT_STATIC_HEAVY_IMPORTS.includes(`${from} -> ${resolved}` as never);
    return Object.freeze({
        allowed,
        bootEntrypoint: isBootEntrypoint(from),
        from,
        heavyCluster,
        resolved,
        specifier,
        violation: Boolean(heavyCluster && isBootEntrypoint(from) && !allowed),
    });
}
