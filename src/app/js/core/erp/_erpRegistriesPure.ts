// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ERP registries (cadastros) — pure logic (ERP-DRE-001 §4.1, M8, RF-4).
 *
 * Minimal master-data entities a journal entry can reference (RF-4):
 *   - {@link Partner}    — customer/supplier (parceiro)
 *   - {@link Product}    — product/service with an optional unit price
 *   - {@link CostCenter} — cost center (centro de custo) to separate the
 *                          environmental vs. operational fronts
 *
 * The CRUD here is PURE and IMMUTABLE: every mutating function returns a *new*
 * frozen array — it never edits the input in place. Validation rejects empty
 * names, duplicate ids, negative prices, etc. with explicit error codes so the
 * UI (`utils/ui/erp/erpRegistries.ts`) can surface i18n messages.
 *
 * These registries travel inside the .ecbt key via `core/erp/erpModelState.ts`
 * (Calvin 2026-06-21: "guardar na chave .ecbt sempre"). Pure — no DOM, no I/O.
 */

/** What kind of business relationship a partner represents. */
export type PartnerKind = 'customer' | 'supplier';

/** A customer or supplier referenced by journal entries (RF-4). */
export interface Partner {
    readonly id: string;
    readonly name: string;
    readonly kind: PartnerKind;
}

/** A product or service, with an optional unit price (RF-4). */
export interface Product {
    readonly id: string;
    readonly name: string;
    /** Optional unit price (≥ 0). Omitted when unknown. */
    readonly price?: number;
}

/** A cost center to split environmental vs. operational fronts (RF-4). */
export interface CostCenter {
    readonly id: string;
    readonly name: string;
}

/** The three registries that travel inside `model.financial` of the .ecbt key. */
export interface ErpRegistries {
    readonly partners: readonly Partner[];
    readonly products: readonly Product[];
    readonly costCenters: readonly CostCenter[];
}

/** Result of a CRUD attempt: the (possibly unchanged) list + any error code. */
export interface RegistryResult<T> {
    /** The resulting frozen list (unchanged when `error` is set). */
    readonly list: readonly T[];
    /** Error code (e.g. `ERR_REG_DUP_ID`) or null on success. */
    readonly error: string | null;
}

const PARTNER_KINDS: ReadonlySet<PartnerKind> = new Set<PartnerKind>(['customer', 'supplier']);

function nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function findIndexById<T extends { id: string }>(list: readonly T[], id: string): number {
    return list.findIndex((item) => item.id === id);
}

/**
 * Build an empty, frozen set of registries (the .ecbt default before any
 * cadastro exists).
 *
 * @returns A frozen {@link ErpRegistries} with three empty arrays.
 */
export function emptyRegistries(): ErpRegistries {
    return Object.freeze({
        partners: Object.freeze([]),
        products: Object.freeze([]),
        costCenters: Object.freeze([]),
    });
}

// ---------------------------------------------------------------------------
// Partner CRUD
// ---------------------------------------------------------------------------

/**
 * Validate + build a frozen {@link Partner} from a draft.
 *
 * @param draft - Partner fields; `id`, `name` and a valid `kind` are required.
 * @returns A frozen partner.
 * @throws {TypeError} if `id`/`name` is missing or `kind` is invalid.
 */
export function createPartner(draft: { id: string; name: string; kind: PartnerKind }): Partner {
    if (!nonEmptyString(draft?.id)) throw new TypeError('ERR_REG_ID_REQUIRED: partner id required');
    if (!nonEmptyString(draft?.name)) throw new TypeError('ERR_REG_NAME_REQUIRED: partner name required');
    if (!PARTNER_KINDS.has(draft.kind)) {
        throw new TypeError(`ERR_REG_PARTNER_KIND: invalid partner kind "${draft.kind}"`);
    }
    return Object.freeze({ id: draft.id, name: draft.name.trim(), kind: draft.kind });
}

/**
 * Add a partner to a list (immutable). Rejects duplicate ids / invalid drafts.
 *
 * @param list - The current partners.
 * @param draft - The partner to add.
 * @returns A {@link RegistryResult}: the new list, or the original + an error.
 */
export function addPartner(
    list: readonly Partner[],
    draft: { id: string; name: string; kind: PartnerKind },
): RegistryResult<Partner> {
    let partner: Partner;
    try {
        partner = createPartner(draft);
    } catch (e) {
        return Object.freeze({ list: Object.freeze([...list]), error: (e as Error).message });
    }
    if (findIndexById(list, partner.id) !== -1) {
        return Object.freeze({ list: Object.freeze([...list]), error: `ERR_REG_DUP_ID: "${partner.id}"` });
    }
    return Object.freeze({ list: Object.freeze([...list, partner]), error: null });
}

/**
 * Update an existing partner by id (immutable). Rejects unknown id / invalid patch.
 *
 * @param list - The current partners.
 * @param id - The partner id to update.
 * @param patch - Partial fields to change (`name`/`kind`).
 * @returns A {@link RegistryResult}.
 */
export function updatePartner(
    list: readonly Partner[],
    id: string,
    patch: { name?: string; kind?: PartnerKind },
): RegistryResult<Partner> {
    const idx = findIndexById(list, id);
    if (idx === -1) return Object.freeze({ list: Object.freeze([...list]), error: `ERR_REG_NOT_FOUND: "${id}"` });
    const current = list[idx] as Partner;
    let updated: Partner;
    try {
        updated = createPartner({
            id,
            name: patch.name ?? current.name,
            kind: patch.kind ?? current.kind,
        });
    } catch (e) {
        return Object.freeze({ list: Object.freeze([...list]), error: (e as Error).message });
    }
    const next = [...list];
    next[idx] = updated;
    return Object.freeze({ list: Object.freeze(next), error: null });
}

/**
 * Remove a partner by id (immutable). Rejects unknown id.
 *
 * @param list - The current partners.
 * @param id - The partner id to remove.
 * @returns A {@link RegistryResult}.
 */
export function removePartner(list: readonly Partner[], id: string): RegistryResult<Partner> {
    const idx = findIndexById(list, id);
    if (idx === -1) return Object.freeze({ list: Object.freeze([...list]), error: `ERR_REG_NOT_FOUND: "${id}"` });
    return Object.freeze({ list: Object.freeze(list.filter((p) => p.id !== id)), error: null });
}

// ---------------------------------------------------------------------------
// Product CRUD
// ---------------------------------------------------------------------------

/**
 * Validate + build a frozen {@link Product} from a draft.
 *
 * @param draft - Product fields; `id` and `name` required, `price` optional (≥0).
 * @returns A frozen product.
 * @throws {TypeError} if `id`/`name` missing.
 * @throws {RangeError} if `price` is negative or non-finite.
 */
export function createProduct(draft: { id: string; name: string; price?: number }): Product {
    if (!nonEmptyString(draft?.id)) throw new TypeError('ERR_REG_ID_REQUIRED: product id required');
    if (!nonEmptyString(draft?.name)) throw new TypeError('ERR_REG_NAME_REQUIRED: product name required');
    if (draft.price !== undefined) {
        if (typeof draft.price !== 'number' || !Number.isFinite(draft.price) || draft.price < 0) {
            throw new RangeError(`ERR_REG_PRICE: invalid price "${draft.price}"`);
        }
    }
    return Object.freeze({
        id: draft.id,
        name: draft.name.trim(),
        ...(draft.price !== undefined ? { price: draft.price } : {}),
    });
}

/**
 * Add a product to a list (immutable). Rejects duplicate ids / invalid drafts.
 *
 * @param list - The current products.
 * @param draft - The product to add.
 * @returns A {@link RegistryResult}.
 */
export function addProduct(
    list: readonly Product[],
    draft: { id: string; name: string; price?: number },
): RegistryResult<Product> {
    let product: Product;
    try {
        product = createProduct(draft);
    } catch (e) {
        return Object.freeze({ list: Object.freeze([...list]), error: (e as Error).message });
    }
    if (findIndexById(list, product.id) !== -1) {
        return Object.freeze({ list: Object.freeze([...list]), error: `ERR_REG_DUP_ID: "${product.id}"` });
    }
    return Object.freeze({ list: Object.freeze([...list, product]), error: null });
}

/**
 * Update an existing product by id (immutable). Rejects unknown id / invalid patch.
 *
 * @param list - The current products.
 * @param id - The product id to update.
 * @param patch - Partial fields (`name`/`price`). Pass `price: undefined` keeps it.
 * @returns A {@link RegistryResult}.
 */
export function updateProduct(
    list: readonly Product[],
    id: string,
    patch: { name?: string; price?: number },
): RegistryResult<Product> {
    const idx = findIndexById(list, id);
    if (idx === -1) return Object.freeze({ list: Object.freeze([...list]), error: `ERR_REG_NOT_FOUND: "${id}"` });
    const current = list[idx] as Product;
    const nextPrice = patch.price !== undefined ? patch.price : current.price;
    let updated: Product;
    try {
        updated = createProduct({
            id,
            name: patch.name ?? current.name,
            ...(nextPrice !== undefined ? { price: nextPrice } : {}),
        });
    } catch (e) {
        return Object.freeze({ list: Object.freeze([...list]), error: (e as Error).message });
    }
    const next = [...list];
    next[idx] = updated;
    return Object.freeze({ list: Object.freeze(next), error: null });
}

/**
 * Remove a product by id (immutable). Rejects unknown id.
 *
 * @param list - The current products.
 * @param id - The product id to remove.
 * @returns A {@link RegistryResult}.
 */
export function removeProduct(list: readonly Product[], id: string): RegistryResult<Product> {
    const idx = findIndexById(list, id);
    if (idx === -1) return Object.freeze({ list: Object.freeze([...list]), error: `ERR_REG_NOT_FOUND: "${id}"` });
    return Object.freeze({ list: Object.freeze(list.filter((p) => p.id !== id)), error: null });
}

// ---------------------------------------------------------------------------
// CostCenter CRUD
// ---------------------------------------------------------------------------

/**
 * Validate + build a frozen {@link CostCenter} from a draft.
 *
 * @param draft - Cost-center fields; `id` and `name` required.
 * @returns A frozen cost center.
 * @throws {TypeError} if `id`/`name` missing.
 */
export function createCostCenter(draft: { id: string; name: string }): CostCenter {
    if (!nonEmptyString(draft?.id)) throw new TypeError('ERR_REG_ID_REQUIRED: cost center id required');
    if (!nonEmptyString(draft?.name)) throw new TypeError('ERR_REG_NAME_REQUIRED: cost center name required');
    return Object.freeze({ id: draft.id, name: draft.name.trim() });
}

/**
 * Add a cost center to a list (immutable). Rejects duplicate ids / invalid drafts.
 *
 * @param list - The current cost centers.
 * @param draft - The cost center to add.
 * @returns A {@link RegistryResult}.
 */
export function addCostCenter(
    list: readonly CostCenter[],
    draft: { id: string; name: string },
): RegistryResult<CostCenter> {
    let cc: CostCenter;
    try {
        cc = createCostCenter(draft);
    } catch (e) {
        return Object.freeze({ list: Object.freeze([...list]), error: (e as Error).message });
    }
    if (findIndexById(list, cc.id) !== -1) {
        return Object.freeze({ list: Object.freeze([...list]), error: `ERR_REG_DUP_ID: "${cc.id}"` });
    }
    return Object.freeze({ list: Object.freeze([...list, cc]), error: null });
}

/**
 * Update an existing cost center by id (immutable). Rejects unknown id / invalid patch.
 *
 * @param list - The current cost centers.
 * @param id - The cost-center id to update.
 * @param patch - Partial fields (`name`).
 * @returns A {@link RegistryResult}.
 */
export function updateCostCenter(
    list: readonly CostCenter[],
    id: string,
    patch: { name?: string },
): RegistryResult<CostCenter> {
    const idx = findIndexById(list, id);
    if (idx === -1) return Object.freeze({ list: Object.freeze([...list]), error: `ERR_REG_NOT_FOUND: "${id}"` });
    const current = list[idx] as CostCenter;
    let updated: CostCenter;
    try {
        updated = createCostCenter({ id, name: patch.name ?? current.name });
    } catch (e) {
        return Object.freeze({ list: Object.freeze([...list]), error: (e as Error).message });
    }
    const next = [...list];
    next[idx] = updated;
    return Object.freeze({ list: Object.freeze(next), error: null });
}

/**
 * Remove a cost center by id (immutable). Rejects unknown id.
 *
 * @param list - The current cost centers.
 * @param id - The cost-center id to remove.
 * @returns A {@link RegistryResult}.
 */
export function removeCostCenter(list: readonly CostCenter[], id: string): RegistryResult<CostCenter> {
    const idx = findIndexById(list, id);
    if (idx === -1) return Object.freeze({ list: Object.freeze([...list]), error: `ERR_REG_NOT_FOUND: "${id}"` });
    return Object.freeze({ list: Object.freeze(list.filter((c) => c.id !== id)), error: null });
}

// ---------------------------------------------------------------------------
// Whole-registries (de)serialization helpers — forward-compatible.
// ---------------------------------------------------------------------------

/**
 * Coerce an arbitrary payload (e.g. from a loaded .ecbt key) into a frozen,
 * validated {@link ErpRegistries}. Malformed/missing rows are dropped silently
 * (forward-compat: an old key without registries simply yields empty lists).
 *
 * @param raw - Untrusted payload (possibly `undefined`, partial, or malformed).
 * @returns A frozen {@link ErpRegistries} containing only valid rows.
 */
export function sanitizeRegistries(raw: unknown): ErpRegistries {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as {
        partners?: unknown;
        products?: unknown;
        costCenters?: unknown;
    };
    const partners: Partner[] = [];
    for (const p of Array.isArray(obj.partners) ? obj.partners : []) {
        try {
            const next = addPartner(partners, p as { id: string; name: string; kind: PartnerKind });
            if (!next.error) partners.length = 0, partners.push(...(next.list as Partner[]));
        } catch (e) {
            console.debug('[erp/registriesPure] malformed partner skipped', (e as Error)?.message || e);
        }
    }
    const products: Product[] = [];
    for (const p of Array.isArray(obj.products) ? obj.products : []) {
        const next = addProduct(products, p as { id: string; name: string; price?: number });
        if (!next.error) products.length = 0, products.push(...(next.list as Product[]));
    }
    const costCenters: CostCenter[] = [];
    for (const c of Array.isArray(obj.costCenters) ? obj.costCenters : []) {
        const next = addCostCenter(costCenters, c as { id: string; name: string });
        if (!next.error) costCenters.length = 0, costCenters.push(...(next.list as CostCenter[]));
    }
    return Object.freeze({
        partners: Object.freeze(partners),
        products: Object.freeze(products),
        costCenters: Object.freeze(costCenters),
    });
}
