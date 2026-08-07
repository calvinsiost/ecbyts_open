// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — formatadores PUROS de rótulos/ids do navegador da
 * home (slug de id, data de workspace, rótulo de um resultado de observação).
 * claude (refactor) 2026-06-20.
 *
 * EN: Three pure formatting helpers extracted from homeGrid.ts, with NO DOM, NO
 *     globals and NO module state. Each mirrors its legacy inline counterpart
 *     byte-for-byte:
 *
 *       • toNavigatorIdSegment(value): slugifies any value into a stable id
 *         segment — trim → lowercase → non [a-z0-9_-] runs collapse to '-' →
 *         strip leading/trailing '-' → empty result becomes 'unknown'.
 *         (mirror of `_toNavigatorIdSegment`.)
 *
 *       • formatWorkspaceDate(dateLike): renders a date as a pt-BR short
 *         date+time, returning 'Sem data' for falsy / unparseable inputs. On a
 *         (rare) throw it logs `console.debug` — preserved for behaviour parity —
 *         and also returns 'Sem data'. (mirror of `_formatWorkspaceDate`.)
 *
 *       • formatNavigatorResultLabel(observation, index, formatDate): builds the
 *         label of a single observation result by joining (when present) the
 *         formatted timestamp, then the value+unit OR the qualifier, with ' - ';
 *         falls back to `Resultado ${index + 1}` when nothing usable exists. The
 *         date formatter is injected so this stays pure and reuses
 *         formatWorkspaceDate. (mirror of `_formatNavigatorResultLabel`.)
 *
 * PT (leigo): três funções que só transformam dados em texto, sem mexer na tela:
 *     (1) transforma qualquer id num "slug" estável; (2) formata uma data no
 *     padrão brasileiro (ou "Sem data" se inválida); (3) monta o rótulo de um
 *     resultado de medição (data, valor+unidade ou qualificador). São exatamente
 *     os mesmos cálculos que estavam embutidos no homeGrid — agora isolados,
 *     tipados e testáveis.
 *
 * Pure: entradas → saída determinística (a data depende só do input + locale do
 * runtime, idêntico ao legado). Cheap tests: tests/ui/homeGrid/navigator-labels.test.mjs.
 */

/** Injected date formatter (so result labels reuse formatWorkspaceDate). */
export type DateFormatter = (dateLike: unknown) => string;

/** A configured parameter entry, as held in `CONFIG.PARAMETERS`. */
export interface NavigatorParameterEntry {
    readonly id?: unknown;
    readonly label?: unknown;
    readonly name?: unknown;
    readonly title?: unknown;
    readonly [key: string]: unknown;
}

/** A single observation/result entry, as consumed by the navigator. */
export interface NavigatorObservation {
    readonly date?: unknown;
    readonly timestamp?: unknown;
    readonly created_at?: unknown;
    readonly createdAt?: unknown;
    readonly value?: unknown;
    readonly unitId?: unknown;
    readonly unit?: unknown;
    readonly unit_id?: unknown;
    readonly qualifier?: unknown;
    readonly [key: string]: unknown;
}

/**
 * Normalize any value into a stable, URL/id-safe slug segment.
 * Byte-identical to the legacy inline `_toNavigatorIdSegment`.
 *
 * @param value anything stringifiable
 * @returns the slug, or 'unknown' when the result would be empty
 */
export function toNavigatorIdSegment(value: unknown): string {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || 'unknown';
}

/**
 * Format a date-like value as a pt-BR short date+time string.
 * Byte-identical to the legacy inline `_formatWorkspaceDate` (including the
 * `console.debug` on the catch path and the 'Sem data' fallbacks).
 *
 * @param dateLike a Date, timestamp, or date string
 * @returns the localized string, or 'Sem data' when falsy/invalid
 */
export function formatWorkspaceDate(dateLike: unknown): string {
    if (!dateLike) return 'Sem data';
    try {
        const parsed = new Date(dateLike as string | number | Date);
        if (Number.isNaN(parsed.getTime())) return 'Sem data';
        return parsed.toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
        });
    } catch (e: unknown) {
        console.debug('[homeGrid] formatDate:', (e as { message?: string })?.message || e);
        return 'Sem data';
    }
}

/**
 * Build the display label for a single observation result.
 * Byte-identical to the legacy inline `_formatNavigatorResultLabel` (with the
 * date formatter — formatWorkspaceDate — injected to keep this pure).
 *
 * @param observation the observation entry (timestamp / value / unit / qualifier)
 * @param index       zero-based index, used only for the `Resultado N` fallback
 * @param formatDate  the date formatter to apply to the resolved timestamp
 * @returns the joined label, or `Resultado ${index + 1}` when nothing usable
 */
export function formatNavigatorResultLabel(
    observation: NavigatorObservation | null | undefined,
    index: number,
    formatDate: DateFormatter,
): string {
    const parts: string[] = [];
    const timestamp =
        observation?.date || observation?.timestamp || observation?.created_at || observation?.createdAt || null;
    if (timestamp) {
        parts.push(formatDate(timestamp));
    }
    if (observation?.value != null && observation.value !== '') {
        const unit = observation?.unitId || observation?.unit || observation?.unit_id || '';
        parts.push(`${observation.value}${unit ? ` ${unit}` : ''}`);
    } else if (observation?.qualifier) {
        parts.push(String(observation.qualifier));
    }
    return parts.join(' - ') || `Resultado ${index + 1}`;
}

/**
 * Resolve the display label of a navigator parameter by id, against a list of
 * configured parameter entries. Byte-identical to the legacy inline
 * `_getNavigatorParameterLabel` (with `CONFIG.PARAMETERS` injected as `parameters`
 * to keep this pure): looks up the first entry whose `id` strictly equals
 * `parameterId`, then resolves `label || name || title || parameterId` with a
 * final 'Parametro sem nome' fallback (mirrors the `||` precedence exactly, so a
 * falsy/empty `label` falls through to `name`, etc.).
 *
 * @param parameters  the configured parameter list (e.g. `CONFIG.PARAMETERS`)
 * @param parameterId the id to resolve
 * @returns the best available label, or 'Parametro sem nome' when nothing usable
 */
export function resolveNavigatorParameterLabel(
    parameters: readonly NavigatorParameterEntry[] | null | undefined,
    parameterId: unknown,
): string {
    const list = Array.isArray(parameters) ? parameters : [];
    const parameter = list.find((entry) => entry?.id === parameterId);
    return (
        (parameter?.label as string) ||
        (parameter?.name as string) ||
        (parameter?.title as string) ||
        (parameterId as string) ||
        'Parametro sem nome'
    );
}
