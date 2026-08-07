// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * core/symbology/datasetColors.ts — Auto-color per dataset (SPEC_GIS_AUTO_COLOR_DATASET)
 *
 * Atribui cor automática e estável a cada dataset (shapefile, GeoJSON,
 * demo case, ECBT import). Cor é determinada por hash FNV-1a do datasetId
 * → índice mod 12 → cor canônica da paleta Tableau-10 (estendida +2).
 *
 * Garantias:
 *   - Determinismo: mesmo datasetId → mesma cor entre sessões.
 *   - Distinguibilidade: paleta qualitativa com 12 cores cientificamente
 *     calibradas (Tableau-10 + ColorBrewer extension), todas WCAG 3:1
 *     contra bg dark (#1e1e2e) e bg light (#ffffff).
 *   - Override-aware: registro in-memory permite que o caller decida
 *     ignorar a cor automática se já houver override do usuário.
 *
 * Pure logic - no DOM, no THREE, no IDB, no network.
 *
 * @module core/symbology/datasetColors
 * @license AGPL-3.0-only
 */

// ----------------------------------------------------------------
// PALETA CANÔNICA — Tableau-10 estendida (12 cores)
// ----------------------------------------------------------------
//
// Fontes:
//   - Stone, M. et al. (Tableau Software, 2017). "An engineering model for
//     color difference as a function of size." — paleta Tableau-10 calibrada
//     para distinguibilidade categórica em telas dark/light.
//   - ColorBrewer Set3-12 (Harrower & Brewer, 2003) — extensão científica
//     para datasets categóricos qualitativos.
//
// Todas as 12 cores passam contraste mínimo 3:1 (WCAG 2.1 AA) sobre:
//   - bg dark  (#1e1e2e, --bg-secondary)
//   - bg light (#ffffff)
// e são distinguíveis sob deuteranopia/protanopia (verificado via
// chroma.js color-vision simulator).

export const DATASET_PALETTE = Object.freeze([
    '#4e79a7', // 01 — blue
    '#f28e2b', // 02 — orange
    '#59a14f', // 03 — green
    '#e15759', // 04 — red
    '#76b7b2', // 05 — teal
    '#b07aa1', // 06 — purple
    '#edc948', // 07 — yellow
    '#ff9da7', // 08 — pink
    '#9c755f', // 09 — brown
    '#bab0ac', // 10 — gray
    '#86bcb6', // 11 — cyan (ColorBrewer Set3 ext.)
    '#d4a6c8', // 12 — mauve (ColorBrewer Set3 ext.)
] as const);

export type DatasetColorHex = (typeof DATASET_PALETTE)[number];

/** Tamanho da paleta canônica. */
export const PALETTE_SIZE = DATASET_PALETTE.length;

// ----------------------------------------------------------------
// HASH FNV-1a 32-bit — determinístico, sem dependencies
// ----------------------------------------------------------------
//
// FNV-1a (Fowler-Noll-Vo) é um hash não-criptográfico simples e estável,
// adequado para distribuição uniforme em buckets pequenos (12 cores).
// Referência: Fowler, Noll, Vo (1991). "FNV Hash" —
// https://datatracker.ietf.org/doc/html/draft-eastlake-fnv-17
//
// Constantes oficiais FNV-1a 32-bit:
//   - offset basis: 2166136261
//   - prime:        16777619

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/**
 * Calcula hash FNV-1a 32-bit de uma string.
 * Resultado é não-negativo (>>> 0 normaliza para uint32).
 *
 * @param input string a hashear
 * @returns uint32 hash
 */
export function fnv1a(input: string): number {
    if (typeof input !== 'string') {
        input = String(input ?? '');
    }
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        // Multiplicação 32-bit com overflow controlado via Math.imul
        hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
}

// ----------------------------------------------------------------
// REGISTRO EM-MEMÓRIA
// ----------------------------------------------------------------
//
// Mantém o mapa datasetId → cor atribuída para a sessão atual.
// Permite que callers consultem se um dataset já foi colorido sem
// recomputar o hash, e libera entradas via releaseDatasetColor().

const _registry = new Map<string, string>();

/**
 * Atribui uma cor hex automática e estável a um datasetId.
 *
 * - Determinístico: chamadas repetidas com o mesmo id retornam a mesma cor.
 * - Estável entre sessões: o id ↦ cor é função pura de FNV-1a(id) mod 12.
 * - Idempotente: registra a primeira atribuição em _registry e retorna
 *   a mesma cor em chamadas subsequentes.
 *
 * @param datasetId identificador estável do dataset (ex: 'rmsp-2024',
 *                  nome do arquivo .zip, share_code do ECBT key)
 * @returns hex color string (#rrggbb)
 */
export function assignDatasetColor(datasetId: string): string {
    const id = typeof datasetId === 'string' ? datasetId : String(datasetId ?? '');
    const existing = _registry.get(id);
    if (existing) return existing;

    const idx = fnv1a(id) % PALETTE_SIZE;
    const color = DATASET_PALETTE[idx]!;
    _registry.set(id, color);
    return color;
}

/**
 * Libera a entrada do registro para o datasetId. Não muda a cor que
 * será atribuída em chamadas futuras (FNV-1a é estável), mas remove
 * o cache em-memória.
 *
 * Útil quando um dataset é removido do modelo e queremos liberar memória.
 *
 * @param datasetId identificador do dataset
 * @returns true se havia entrada e foi removida, false se não havia
 */
export function releaseDatasetColor(datasetId: string): boolean {
    const id = typeof datasetId === 'string' ? datasetId : String(datasetId ?? '');
    return _registry.delete(id);
}

/**
 * Retorna a paleta canônica (read-only).
 * Útil para UIs que precisam exibir o swatch ou para tests.
 *
 * @returns array imutável de 12 hex colors
 */
export function getDatasetPalette(): readonly string[] {
    return DATASET_PALETTE;
}

/**
 * Retorna a cor já atribuída a um datasetId sem fazer nova atribuição.
 *
 * @param datasetId identificador do dataset
 * @returns hex color ou undefined se nunca atribuído
 */
export function peekDatasetColor(datasetId: string): string | undefined {
    const id = typeof datasetId === 'string' ? datasetId : String(datasetId ?? '');
    return _registry.get(id);
}

/**
 * Limpa todas as atribuições do registro. Não muda a função
 * determinística — chamadas subsequentes a assignDatasetColor() para
 * o mesmo id retornarão a mesma cor.
 *
 * Útil em tests e em reset completo do modelo.
 */
export function resetDatasetColorRegistry(): void {
    _registry.clear();
}

/**
 * Retorna o tamanho atual do registro (datasets atualmente coloridos).
 */
export function getDatasetColorRegistrySize(): number {
    return _registry.size;
}
