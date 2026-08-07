// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic extraction from utils/ui/dataEntryMatrix.ts (screen ui/observation-entry).
//
// Strategy: lift the DOM-free value-normalization + observation-history derivation
// out of the stateful module. Pure: zero document/window/_state/manager refs —
// inputs in, plain objects out. The renderers/handlers keep the side effects.

/**
 * Normalized verdict for a single data-entry cell, derived purely from the raw
 * text the user typed. Mirrors the `{ value, error, dirty }` shape the inline
 * `setCellValue` mutates onto a cell.
 *
 * @typedef {{ value: number|null, error: string|null, dirty: boolean }} CellInputResult
 */
export interface CellInputResult {
    readonly value: number | null;
    readonly error: string | null;
    readonly dirty: boolean;
}

/**
 * Parse a raw cell string into the `{ value, error, dirty }` verdict.
 *
 * Byte-identical to the inline branch chain previously in `setCellValue`
 * (dataEntryMatrix.ts):
 *   1. trim the raw string;
 *   2. empty or `'-'` → cleared cell: `value=null`, `error=null`,
 *      `dirty = (trimmed !== '')` (so a literal `'-'` still counts as dirty,
 *      but truly blank input does not);
 *   3. otherwise `parseFloat` after swapping the FIRST comma for a dot (BR
 *      decimal convention — matches `String.prototype.replace(',', '.')`);
 *   4. NaN → `value=null`, `error='NaN'`, `dirty=true`;
 *   5. finite number → `value=numeric`, `error=null`, `dirty=true`.
 *
 * Pure: returns a fresh object; the caller assigns the fields onto the cell.
 *
 * @param {any} rawValue - raw input string (coerced via `String`)
 * @returns {CellInputResult}
 */
export function parseCellInput(rawValue: any): CellInputResult {
    const trimmed = String(rawValue == null ? '' : rawValue).trim();
    if (trimmed === '' || trimmed === '-') {
        return { value: null, error: null, dirty: trimmed !== '' };
    }
    // Aceita vírgula como decimal (convenção BR)
    const numeric = parseFloat(trimmed.replace(',', '.'));
    if (isNaN(numeric)) {
        return { value: null, error: 'NaN', dirty: true };
    }
    return { value: numeric, error: null, dirty: true };
}

/**
 * One prior reading shown for side-by-side comparison in the matrix.
 *
 * @typedef {{ value: any, date: any, campaignName: string }} ObservationHistoryEntry
 */
export interface ObservationHistoryEntry {
    readonly value: any;
    readonly date: any;
    readonly campaignName: string;
}

/**
 * Derive the last-two historical readings for one (parameter × element) pair.
 *
 * Byte-identical to the inner derivation previously in `buildHistoricalCache`
 * (dataEntryMatrix.ts), for a single element's observation list:
 *   1. keep observations matching `paramId`, with `value != null`, whose
 *      `campaignId` differs from `excludeCampaignId` (the campaign being edited);
 *   2. sort descending by `date` using `(b.date||'').localeCompare(a.date||'')`
 *      (most recent first; missing dates sort as `''`);
 *   3. take the first two;
 *   4. map to `{ value, date, campaignName }`, resolving the name via the
 *      injected `getCampaignName(campaignId)` with a `'' ` fallback — matching
 *      the original `campaignNames.get(o.campaignId) || ''`.
 *
 * Pure: no DOM, no element manager, no module state. The caller supplies the
 * observations array (from `element.data.observations`) and the name resolver.
 *
 * @param {any[]} observations - one element's observations (any order)
 * @param {any} paramId - parameter id to filter on
 * @param {any} excludeCampaignId - campaign id to exclude (the one being edited)
 * @param {(campaignId:any)=>(string|null|undefined)} [getCampaignName?] - resolver
 * @returns {ObservationHistoryEntry[]} up to two entries, most-recent first
 */
export function deriveObservationHistory(
    observations: any,
    paramId: any,
    excludeCampaignId: any,
    getCampaignName?: any,
): ObservationHistoryEntry[] {
    const list = Array.isArray(observations) ? observations : [];
    const resolveName = typeof getCampaignName === 'function' ? getCampaignName : () => '';
    return list
        .filter((o: any) => o.parameterId === paramId && o.value != null && o.campaignId !== excludeCampaignId)
        .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 2)
        .map((o: any) => ({
            value: o.value,
            date: o.date,
            campaignName: resolveName(o.campaignId) || '',
        }));
}

/**
 * One matrix cell's normalized state, as held in `_state.cells[param][elem]`.
 */
export interface MatrixCell {
    value: number | null;
    error: string | null;
    dirty: boolean;
}

/** Two-level cell map: `cells[parameterId][elementId] = MatrixCell`. */
export type CellMatrix = Record<string, Record<string, MatrixCell>>;

/** A regulatory threshold row, as returned by `getThresholds(paramId)`. */
export interface ThresholdEntry {
    readonly type: string;
    readonly value: number;
}

/**
 * Aggregate stats over the whole cell matrix, derived purely.
 *
 * @typedef {{ filled:number, errors:number, exceeds:number, hasDirty:boolean }} CellSummary
 */
export interface CellSummary {
    readonly filled: number;
    readonly errors: number;
    readonly exceeds: number;
    readonly hasDirty: boolean;
}

/**
 * Single-pass aggregate of the cell matrix, byte-identical to the union of the
 * inline `countFilled` / `countErrors` / `countExceeds` / `hasDirtyCells`
 * iterations previously in dataEntryMatrix.ts:
 *   - `filled`   = cells whose `value != null` (matches `countFilled`);
 *   - `errors`   = cells whose `error` is truthy (matches `countErrors`);
 *   - `exceeds`  = cells with `value != null` whose value exceeds the row's
 *     `vi`/`cma` threshold (matches `countExceeds`, which resolves thresholds
 *     per parameter and tests `cell.value > vi.value`);
 *   - `hasDirty` = any cell with a truthy `dirty` flag (matches `hasDirtyCells`).
 *
 * The threshold lookup is injected (`getThresholds(paramId) -> ThresholdEntry[]`)
 * so this stays DOM-free and side-effect-free. Iteration order over
 * `Object.keys` mirrors the originals (insertion order), so the counts are
 * identical for any given matrix.
 *
 * @param {CellMatrix|null|undefined} cells - `_state.cells`
 * @param {(paramId:string)=>ThresholdEntry[]} getThresholds - threshold resolver
 * @returns {CellSummary}
 */
export function summarizeCells(
    cells: CellMatrix | null | undefined,
    getThresholds: (paramId: string) => readonly ThresholdEntry[],
): CellSummary {
    let filled = 0;
    let errors = 0;
    let exceeds = 0;
    let hasDirty = false;
    if (!cells) {
        return { filled, errors, exceeds, hasDirty };
    }
    for (const paramId of Object.keys(cells)) {
        const row = cells[paramId];
        if (!row) continue;
        const thresholds = getThresholds(paramId);
        const vi = thresholds.find((tr: ThresholdEntry) => tr.type === 'vi' || tr.type === 'cma');
        for (const elemId of Object.keys(row)) {
            const cell = row[elemId];
            if (!cell) continue;
            if (cell.dirty) hasDirty = true;
            if (cell.error) errors++;
            if (cell.value != null) {
                filled++;
                if (vi && cell.value > vi.value) exceeds++;
            }
        }
    }
    return { filled, errors, exceeds, hasDirty };
}

/** A measurement unit row from `CONFIG.UNITS`. */
export interface UnitDef {
    readonly id: string;
    readonly dimension?: string | null;
    readonly symbol?: string | null;
    readonly name?: string | null;
}

/**
 * Resolve the list of units compatible with a parameter, byte-identical to the
 * inline `getCompatibleUnits` previously in dataEntryMatrix.ts:
 *   1. find the parameter's default unit by id (`defaultUnitId`);
 *   2. if it has no `dimension`, return `[defaultUnit]` when one exists, else
 *      `[]`;
 *   3. otherwise return every unit sharing that `dimension`.
 *
 * Pure: the units catalog and the default-unit id are supplied by the caller
 * (from `CONFIG.UNITS` / `paramDef.defaultUnitId`) — no module state, no DOM.
 *
 * @param {UnitDef[]} units - the full unit catalog (`CONFIG.UNITS`)
 * @param {string|null|undefined} defaultUnitId - parameter's `defaultUnitId`
 * @returns {UnitDef[]} compatible units (possibly empty)
 */
export function compatibleUnitsFor(
    units: readonly UnitDef[],
    defaultUnitId: string | null | undefined,
): UnitDef[] {
    const defaultUnit = units.find((u) => u.id === defaultUnitId);
    if (!defaultUnit?.dimension) return defaultUnit ? [defaultUnit] : [];
    return units.filter((u) => u.dimension === defaultUnit.dimension);
}

/** A parameter definition row from `CONFIG.PARAMETERS`. */
export interface ParamDef {
    readonly id: string;
    readonly name?: string | null;
    readonly names?: Record<string, string> | null;
}

/**
 * Filter a category's parameters by the search box query, byte-identical to the
 * inline predicate previously in `renderParamCheckboxes` (dataEntryMatrix.ts):
 *   - an empty (already-lowercased) `search` keeps every parameter;
 *   - otherwise a parameter matches when the lowercased English display name
 *     (`names.en || name || id`), the lowercased Portuguese name (`names.pt`,
 *     `''` when absent), or the raw `id` contains the query substring.
 *
 * The caller passes the query already lowercased (mirroring the original
 * `(_state.paramSearch || '').toLowerCase()`), so this performs no further
 * normalization beyond what the originals did per-field.
 *
 * @param {ParamDef[]} params - one category's parameter list
 * @param {string} search - already-lowercased query (`''` = match all)
 * @returns {ParamDef[]} parameters matching the query, original order preserved
 */
export function filterParamsBySearch<P extends ParamDef>(params: readonly P[], search: string): P[] {
    return params.filter((p) => {
        if (!search) return true;
        const name = (p.names?.en || p.name || p.id).toLowerCase();
        const namePt = (p.names?.pt || '').toLowerCase();
        return name.includes(search) || namePt.includes(search) || p.id.includes(search);
    });
}

/**
 * Presentation primitives for a single matrix input, derived purely from the
 * cell state and the row's `vi`/`cma` threshold entry.
 *
 * @typedef {{ exceeds:boolean, classSuffix:string, displayValue:(number|string) }} CellView
 */
export interface CellView {
    readonly exceeds: boolean;
    readonly classSuffix: string;
    readonly displayValue: number | string;
}

/**
 * Derive the per-cell input presentation, byte-identical to the inline
 * class/display computation duplicated in `renderMatrixTable` (office mode) and
 * `renderFieldMode` (field mode) of dataEntryMatrix.ts:
 *   - `classSuffix` appends, in order, `' dirty'` when `cell.dirty`, `' error'`
 *     when `cell.error`, and `' exceeds'` when `cell.value != null && viEntry &&
 *     cell.value > viEntry.value` — the same conditions and ordering used to
 *     build `inputClass` from its `'dem-input'` / `'dem-field-input'` base;
 *   - `exceeds` is that same threshold-breach predicate, reused by the caller
 *     for the office-mode limit badge;
 *   - `displayValue` is `cell.value` when non-null, else `''` (matches
 *     `cell.value != null ? cell.value : ''`).
 *
 * Pure: the caller prepends its own CSS base to `classSuffix`; no DOM here.
 *
 * @param {{value:number|null,error:string|null,dirty:boolean}} cell
 * @param {ThresholdEntry|null|undefined} viEntry - the `vi`/`cma` threshold row
 * @returns {CellView}
 */
export function deriveCellView(
    cell: { value: number | null; error: string | null; dirty: boolean },
    viEntry: ThresholdEntry | null | undefined,
): CellView {
    const exceeds = cell.value != null && !!viEntry && cell.value > viEntry.value;
    let classSuffix = '';
    if (cell.dirty) classSuffix += ' dirty';
    if (cell.error) classSuffix += ' error';
    if (exceeds) classSuffix += ' exceeds';
    const displayValue = cell.value != null ? cell.value : '';
    return { exceeds, classSuffix, displayValue };
}

/** Slice a `YYYY-MM-DD` date to its `MM-DD` tail (`''` when falsy). */
function shortDate(date: any): string {
    return date ? date.slice(5) : '';
}

/**
 * Build the office-mode history block HTML, byte-identical to the inline
 * `histHtml` construction in `renderMatrixTable`:
 *   - empty history → `''`;
 *   - otherwise each entry renders as
 *     `<span class="dem-history-value">{value}</span> {MM-DD}`, joined with
 *     `' | '`, wrapped in `<div class="dem-history">…</div>`.
 *
 * Pure string building (no DOM). Values are interpolated raw, exactly as the
 * original did (history comes from trusted stored observations).
 *
 * @param {ObservationHistoryEntry[]} hist
 * @returns {string} HTML (possibly empty)
 */
export function formatHistoryHtml(hist: readonly ObservationHistoryEntry[]): string {
    if (!hist.length) return '';
    const parts = hist.map((h) => `<span class="dem-history-value">${h.value}</span> ${shortDate(h.date)}`);
    return `<div class="dem-history">${parts.join(' | ')}</div>`;
}

/**
 * Build the field-mode history text, byte-identical to the inline `histText`
 * construction in `renderFieldMode`:
 *   - empty history → `''`;
 *   - otherwise each entry renders as `{value} ({MM-DD})`, joined with `', '`.
 *
 * @param {ObservationHistoryEntry[]} hist
 * @returns {string} plain text (possibly empty)
 */
export function formatHistoryText(hist: readonly ObservationHistoryEntry[]): string {
    if (!hist.length) return '';
    return hist.map((h) => `${h.value} (${shortDate(h.date)})`).join(', ');
}

/** A campaign row from `getAllCampaigns()` — only the fields we read. */
export interface CampaignLite {
    readonly id: string;
    readonly name?: string | null;
}

/**
 * Build the `campaignId -> display name` lookup, byte-identical to the inline
 * `new Map(campaigns.map((c) => [c.id, c.name || c.id]))` previously in
 * `buildHistoricalCache` (dataEntryMatrix.ts): the display name is `c.name` when
 * truthy, otherwise the id itself. Insertion order follows the input array, so a
 * later duplicate id overwrites an earlier one exactly as `new Map(entries)` does.
 *
 * Pure: no DOM, no manager call — the campaigns array is supplied by the caller.
 *
 * @param {CampaignLite[]} campaigns
 * @returns {Map<string, string>} id → name (or id when name is falsy)
 */
export function buildCampaignNameMap(campaigns: readonly CampaignLite[]): Map<string, string> {
    return new Map(campaigns.map((c) => [c.id, c.name || c.id]));
}

/**
 * Group parameter definitions by their `category`, byte-identical to the inline
 * `forEach` accumulation duplicated in `renderSetup` and `renderSetupCheckboxes`
 * (dataEntryMatrix.ts): each parameter falls under `p.category || 'other'`,
 * buckets are created lazily, and insertion order within each bucket follows the
 * input order.
 *
 * Pure: returns a fresh record; no module state, no DOM.
 *
 * @param {ParamDef[]} params - `CONFIG.PARAMETERS`
 * @returns {Record<string, ParamDef[]>} category → parameters
 */
export function groupParamsByCategory<P extends { category?: string | null }>(
    params: ReadonlyArray<P>,
): Record<string, P[]> {
    const byCategory: Record<string, P[]> = {};
    params.forEach((p) => {
        const cat = p.category || 'other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p);
    });
    return byCategory;
}

/**
 * Find the regulatory reference (VO) threshold row, byte-identical to the inline
 * `thresholds.find((t) => t.type === 'vi' || t.type === 'cma')` duplicated in
 * `renderMatrixTable` and `renderFieldMode` (dataEntryMatrix.ts): the first row
 * whose `type` is `'vi'` (valor de investigação) or `'cma'`. Returns `undefined`
 * when none matches.
 *
 * Pure: the thresholds come from the caller (`getThresholds(paramId)`); no DOM,
 * no module state.
 *
 * @param thresholds the parameter's threshold rows
 * @returns the `vi`/`cma` entry, or `undefined`
 */
export function findViEntry(thresholds: readonly ThresholdEntry[]): ThresholdEntry | undefined {
    return thresholds.find((tr) => tr.type === 'vi' || tr.type === 'cma');
}

/** A planned reading row from `campaign.plannedReadings`. */
export interface PlannedReadingLike {
    readonly parameterId?: unknown;
    readonly elementId?: unknown;
    readonly [key: string]: unknown;
}

/** Deduped parameter/element selection derived from a campaign plan. */
export interface PlannedSelection {
    readonly parameterIds: string[];
    readonly elementIds: string[];
}

/**
 * Derive the unique parameter and element ids from a campaign's planned
 * readings, byte-identical to the inline duplicated `[...new Set(plannedReadings
 * .map((r) => r.X).filter(Boolean))]` expressions in `openDataEntryMatrix` and
 * `quickFromPlan` (dataEntryMatrix.ts): map each reading to its `parameterId` /
 * `elementId`, drop falsy values, and de-duplicate preserving first-seen order
 * (the `new Set` semantics). Non-array input → empty selection.
 *
 * Pure: no module state, no DOM, no manager — the readings array is supplied by
 * the caller (`campaign.plannedReadings`). The count each call site showed is
 * just `parameterIds.length` / `elementIds.length`.
 *
 * @param plannedReadings the campaign's planned readings (any value)
 * @returns `{ parameterIds, elementIds }`, deduped, first-seen order
 */
export function derivePlannedSelection(plannedReadings: unknown): PlannedSelection {
    const list = Array.isArray(plannedReadings) ? (plannedReadings as PlannedReadingLike[]) : [];
    const parameterIds = [...new Set(list.map((r) => r.parameterId).filter(Boolean))] as string[];
    const elementIds = [...new Set(list.map((r) => r.elementId).filter(Boolean))] as string[];
    return { parameterIds, elementIds };
}

// ----------------------------------------------------------------
// SAVE-PIPELINE PURE LOGIC — lifted from the doSaveAll persistence loop
// (dataEntryMatrix.ts). These derive the date/unit, locate an existing
// observation, and build a fresh observation record from already-resolved
// inputs. Pure: no DOM, no element manager, no module state, no CONFIG access —
// the caller passes element/paramDef/user/cell values in. The original loop kept
// the side effects (push/assign/updateElement); these supply the values it used.
// ----------------------------------------------------------------

/**
 * Resolve the date stamped onto a saved observation, byte-identical to the
 * inline `obsDate` ternary in `doSaveAll`:
 *   - `noCampaignMode` → `elementDate || campaignDate` (per-point date, falling
 *     back to the default);
 *   - otherwise → `campaignDate`.
 *
 * @param noCampaignMode whether the matrix is in per-point (no-campaign) mode
 * @param elementDate the per-element date (`_state.elementDates[elemId]`)
 * @param campaignDate the campaign / default date (`_state.campaignDate`)
 * @returns the date string to persist
 */
export function resolveObservationDate(
    noCampaignMode: boolean,
    elementDate: string | null | undefined,
    campaignDate: string,
): string {
    return noCampaignMode ? elementDate || campaignDate : campaignDate;
}

/**
 * Resolve the unit id for a saved observation, byte-identical to the inline
 * `unitId` chain in `doSaveAll`: `paramUnitId || paramDefaultUnitId || null`.
 *
 * @param paramUnitId the row override (`_state.paramUnits[paramId]`)
 * @param paramDefaultUnitId the parameter default (`paramDef.defaultUnitId`)
 * @returns the unit id, or `null` when neither is set
 */
export function resolveUnitId(
    paramUnitId: string | null | undefined,
    paramDefaultUnitId: string | null | undefined,
): string | null {
    return paramUnitId || paramDefaultUnitId || null;
}

/** A stored observation row — only the fields the lookup predicate reads. */
export interface ObservationLike {
    readonly parameterId?: unknown;
    readonly date?: unknown;
    readonly campaignId?: unknown;
    readonly [key: string]: unknown;
}

/** Inputs that identify which existing observation a save should overwrite. */
export interface ObservationMatchQuery {
    readonly noCampaignMode: boolean;
    readonly paramId: unknown;
    readonly obsDate: unknown;
    readonly campaignId: unknown;
}

/**
 * Find the index of the observation a save should overwrite, byte-identical to
 * the inline `existingIdx` ternary in `doSaveAll`:
 *   - `noCampaignMode` → first obs matching `parameterId` AND `date === obsDate`
 *     AND falsy `campaignId` (an ad-hoc, campaign-less reading on that date);
 *   - otherwise → first obs matching `campaignId` AND `parameterId` (the reading
 *     already recorded for this campaign × parameter).
 * Returns `-1` when none matches (caller then pushes a new record).
 *
 * @param observations the element's observation list (read-only here)
 * @param query the match criteria
 * @returns the matching index, or `-1`
 */
export function findExistingObservationIndex(
    observations: readonly ObservationLike[],
    query: ObservationMatchQuery,
): number {
    const { noCampaignMode, paramId, obsDate, campaignId } = query;
    return noCampaignMode
        ? observations.findIndex((o) => o.parameterId === paramId && o.date === obsDate && !o.campaignId)
        : observations.findIndex((o) => o.campaignId === campaignId && o.parameterId === paramId);
}

/** A 3D position (`element.position`) — all fields optional. */
export interface PositionLike {
    readonly x?: number | null;
    readonly y?: number | null;
    readonly z?: number | null;
}

/** The author/user fields stamped onto a new observation. */
export interface ObservationAuthor {
    readonly credentialLevel?: string | null;
    readonly email?: string | null;
}

/** Inputs needed to build a fresh observation record. */
export interface NewObservationInput {
    readonly position: PositionLike | null | undefined;
    readonly obsDate: string;
    readonly campaignId: string | null;
    readonly parameterId: string;
    readonly cellValue: number;
    readonly unitId: string | null;
    readonly casNumber: string | null | undefined;
    readonly user: ObservationAuthor | null | undefined;
}

/** The full observation record shape produced by {@link buildNewObservationRecord}. */
export interface NewObservationRecord {
    showPlanning: boolean;
    plannedDate: null;
    plannedParameterId: null;
    plannedUnitId: null;
    plannedX: null;
    plannedY: null;
    plannedZ: null;
    expectedValue: null;
    x: number;
    y: number;
    z: number;
    date: string;
    campaignId: string | null;
    parameterId: string;
    value: number;
    unitId: string | null;
    autoConvert: boolean;
    additionalReadings: never[];
    variables: Record<string, never>;
    detect_flag: null;
    qualifier: null;
    detection_limit: null;
    cas_number: string | null;
    lab_name: null;
    sample_code: null;
    analytical_method: null;
    dilution_factor: null;
    sample_matrix: null;
    uncertainty: null;
    uncertaintyType: null;
    coverageFactor: null;
    credentialLevel: string;
    createdBy: string | null;
}

/**
 * Build a fresh observation record, byte-identical to the inline
 * `observations.push({ ... })` object literal in `doSaveAll`:
 *   - position falls back to `0` per axis (`element.position?.x || 0`, etc.);
 *   - `cas_number` from `paramDef?.casNumber || null`;
 *   - `credentialLevel` from `user?.credentialLevel || 'common'`;
 *   - `createdBy` from `user?.email || null`;
 *   - all the planning/QA fields default to the same nulls/empties as before.
 *
 * Pure: returns a fresh object; the caller pushes it onto the observation array
 * and persists via `updateElement` (unchanged side effect).
 *
 * @param input the already-resolved values for the new record
 * @returns the new observation record
 */
export function buildNewObservationRecord(input: NewObservationInput): NewObservationRecord {
    const { position, obsDate, campaignId, parameterId, cellValue, unitId, casNumber, user } = input;
    return {
        showPlanning: false,
        plannedDate: null,
        plannedParameterId: null,
        plannedUnitId: null,
        plannedX: null,
        plannedY: null,
        plannedZ: null,
        expectedValue: null,
        x: position?.x || 0,
        y: position?.y || 0,
        z: position?.z || 0,
        date: obsDate,
        campaignId,
        parameterId,
        value: cellValue,
        unitId,
        autoConvert: false,
        additionalReadings: [],
        variables: {},
        detect_flag: null,
        qualifier: null,
        detection_limit: null,
        cas_number: casNumber || null,
        lab_name: null,
        sample_code: null,
        analytical_method: null,
        dilution_factor: null,
        sample_matrix: null,
        uncertainty: null,
        uncertaintyType: null,
        coverageFactor: null,
        credentialLevel: user?.credentialLevel || 'common',
        createdBy: user?.email || null,
    };
}
