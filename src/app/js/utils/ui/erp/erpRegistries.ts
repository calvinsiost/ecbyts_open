// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ERP registries editor — DOM renderer (ERP-DRE-001 §5, M8, RF-4).
 *
 * A non-native modal (asyncDialogs convention) to manage the three cadastros a
 * journal entry can reference: Partners (customer/supplier), Products/Services
 * (optional price) and Cost Centers. Add via prompts (asyncPrompt — never the
 * native dialog), remove via confirmation (asyncConfirm). All mutations go
 * through the pure CRUD in `_erpRegistriesPure.ts` and are persisted into the
 * .ecbt key via `setErpRegistries`.
 *
 * This file only touches the DOM; validation/immutability live in the pure
 * module. Text is escaped; i18n best-effort via `window.t`.
 *
 * Reachable ONLY when `CONFIG.FEATURES.ERP_DRE === true` (the trigger is gated).
 */

import { escapeHtmlFull, escapeAttr } from '../../helpers/html.js';
import { generateId } from '../../helpers/id.js';
import { asyncPrompt, asyncConfirm } from '../asyncDialogs.js';
import {
    addPartner,
    addProduct,
    addCostCenter,
    removePartner,
    removeProduct,
    removeCostCenter,
    type ErpRegistries,
    type PartnerKind,
} from '../../../core/erp/_erpRegistriesPure.js';
import { getErpRegistries, setErpRegistries } from '../../../core/erp/erpModelState.js';

const DIALOG_ID = 'erp-registries-overlay';

/** Best-effort i18n: window.t(key) → translated, else fallback. */
function tr(key: string, fallback: string): string {
    const w = window as unknown as { t?: (k: string) => string };
    if (typeof w.t === 'function') {
        try {
            const out = w.t(key);
            if (out && out !== key) return out;
        } catch (e) {
            console.debug('[erp/registries] i18n fallback', (e as Error)?.message || e);
        }
    }
    return fallback;
}

/** Translate a registry error code (ERR_REG_*) to a human message. */
function regErrorMessage(code: string): string {
    if (code.startsWith('ERR_REG_DUP_ID')) return tr('erpDre.registries.errDupId', 'An item with this id already exists.');
    if (code.startsWith('ERR_REG_NAME_REQUIRED')) return tr('erpDre.registries.errName', 'Name is required.');
    if (code.startsWith('ERR_REG_PRICE')) return tr('erpDre.registries.errPrice', 'Price must be a number ≥ 0.');
    if (code.startsWith('ERR_REG_PARTNER_KIND')) return tr('erpDre.registries.errKind', 'Invalid partner kind.');
    return code;
}

function listRowsHtml(
    items: readonly { id: string; name: string; extra?: string }[],
    section: string,
): string {
    if (items.length === 0) {
        return `<li class="erp-reg-empty">${escapeHtmlFull(tr('erpDre.registries.empty', 'No items yet.'))}</li>`;
    }
    return items
        .map(
            (it) =>
                `<li class="erp-reg-item">` +
                `<span class="erp-reg-name">${escapeHtmlFull(it.name)}</span>` +
                (it.extra ? `<span class="erp-reg-extra">${escapeHtmlFull(it.extra)}</span>` : '') +
                `<button type="button" class="erp-reg-del" data-erp-reg-del="${escapeAttr(section)}" data-erp-reg-id="${escapeAttr(it.id)}" aria-label="${escapeAttr(tr('erpDre.registries.remove', 'Remove'))}">×</button>` +
                `</li>`,
        )
        .join('');
}

function sectionHtml(
    titleKey: string,
    titleFallback: string,
    section: string,
    rows: string,
): string {
    return (
        `<section class="erp-reg-section" data-erp-reg-section="${escapeAttr(section)}">` +
        `<header class="erp-reg-section-head"><h4>${escapeHtmlFull(tr(titleKey, titleFallback))}</h4>` +
        `<button type="button" class="erp-reg-add" data-erp-reg-add="${escapeAttr(section)}">+ ${escapeHtmlFull(tr('erpDre.registries.add', 'Add'))}</button></header>` +
        `<ul class="erp-reg-list">${rows}</ul>` +
        `</section>`
    );
}

function bodyHtml(reg: ErpRegistries): string {
    const partnerRows = listRowsHtml(
        reg.partners.map((p) => ({ id: p.id, name: p.name, extra: tr(`erpDre.registries.kind.${p.kind}`, p.kind) })),
        'partner',
    );
    const productRows = listRowsHtml(
        reg.products.map((p) => ({ id: p.id, name: p.name, extra: p.price !== undefined ? String(p.price) : '' })),
        'product',
    );
    const ccRows = listRowsHtml(
        reg.costCenters.map((c) => ({ id: c.id, name: c.name })),
        'costCenter',
    );
    return (
        sectionHtml('erpDre.registries.partners', 'Partners', 'partner', partnerRows) +
        sectionHtml('erpDre.registries.products', 'Products / Services', 'product', productRows) +
        sectionHtml('erpDre.registries.costCenters', 'Cost centers', 'costCenter', ccRows)
    );
}

/** Prompt-driven "add" flow for each section. Returns the new registries or null. */
async function promptAdd(section: string, reg: ErpRegistries): Promise<ErpRegistries | null> {
    if (section === 'partner') {
        const name = await asyncPrompt(tr('erpDre.registries.promptPartnerName', 'Partner name:'));
        if (name === null || name.trim() === '') return null;
        const kindRaw = await asyncPrompt(
            tr('erpDre.registries.promptPartnerKind', 'Kind — type "customer" or "supplier":'),
            'customer',
        );
        if (kindRaw === null) return null;
        const kind: PartnerKind = kindRaw.trim().toLowerCase() === 'supplier' ? 'supplier' : 'customer';
        const res = addPartner(reg.partners, { id: generateId('par', 6), name, kind });
        if (res.error) {
            await asyncConfirm(regErrorMessage(res.error), { confirmLabel: 'OK' });
            return null;
        }
        return { ...reg, partners: res.list };
    }
    if (section === 'product') {
        const name = await asyncPrompt(tr('erpDre.registries.promptProductName', 'Product/service name:'));
        if (name === null || name.trim() === '') return null;
        const priceRaw = await asyncPrompt(tr('erpDre.registries.promptProductPrice', 'Unit price (optional):'), '');
        if (priceRaw === null) return null;
        const price = priceRaw.trim() === '' ? undefined : Number(priceRaw);
        const res = addProduct(reg.products, {
            id: generateId('prd', 6),
            name,
            ...(price !== undefined ? { price } : {}),
        });
        if (res.error) {
            await asyncConfirm(regErrorMessage(res.error), { confirmLabel: 'OK' });
            return null;
        }
        return { ...reg, products: res.list };
    }
    // costCenter
    const name = await asyncPrompt(tr('erpDre.registries.promptCostCenterName', 'Cost center name:'));
    if (name === null || name.trim() === '') return null;
    const res = addCostCenter(reg.costCenters, { id: generateId('cc', 6), name });
    if (res.error) {
        await asyncConfirm(regErrorMessage(res.error), { confirmLabel: 'OK' });
        return null;
    }
    return { ...reg, costCenters: res.list };
}

/** Remove flow for each section. Returns the new registries (after confirm) or null. */
function applyRemove(section: string, id: string, reg: ErpRegistries): ErpRegistries | null {
    if (section === 'partner') {
        const res = removePartner(reg.partners, id);
        return res.error ? null : { ...reg, partners: res.list };
    }
    if (section === 'product') {
        const res = removeProduct(reg.products, id);
        return res.error ? null : { ...reg, products: res.list };
    }
    const res = removeCostCenter(reg.costCenters, id);
    return res.error ? null : { ...reg, costCenters: res.list };
}

/**
 * Open the ERP registries editor (RF-4). Persists every change into the .ecbt
 * store and dispatches `ecbt:erpRegistriesChanged`. Resolves when the dialog is
 * closed.
 *
 * @returns A promise that resolves once the modal is dismissed.
 */
export function openErpRegistries(): Promise<void> {
    return new Promise<void>((resolve) => {
        document.getElementById(DIALOG_ID)?.remove();

        const overlay = document.createElement('div');
        overlay.id = DIALOG_ID;
        overlay.className = 'async-dialog-overlay erp-reg-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const title = escapeHtmlFull(tr('erpDre.registries.title', 'Registries'));
        overlay.innerHTML =
            `<div class="erp-reg-dialog" role="document">` +
            `<header class="erp-reg-header"><h3>${title}</h3>` +
            `<button type="button" class="erp-reg-close" data-erp-reg-close aria-label="Close">×</button></header>` +
            `<div class="erp-reg-body"></div>` +
            `</div>`;
        document.body.appendChild(overlay);

        const bodyHost = overlay.querySelector<HTMLElement>('.erp-reg-body')!;

        const rerender = () => {
            bodyHost.innerHTML = bodyHtml(getErpRegistries());
        };
        rerender();

        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                done();
            }
        };

        const persist = (reg: ErpRegistries) => {
            setErpRegistries(reg);
            window.dispatchEvent(new CustomEvent('ecbt:erpRegistriesChanged'));
            rerender();
        };

        bodyHost.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const addBtn = target.closest<HTMLElement>('[data-erp-reg-add]');
            if (addBtn) {
                const section = addBtn.getAttribute('data-erp-reg-add') ?? '';
                promptAdd(section, getErpRegistries())
                    .then((next) => {
                        if (next) persist(next);
                    })
                    .catch((e) => {
                        console.debug('[erp/registries] add item cancelled', e?.message || e);
                    });
                return;
            }
            const delBtn = target.closest<HTMLElement>('[data-erp-reg-del]');
            if (delBtn) {
                const section = delBtn.getAttribute('data-erp-reg-del') ?? '';
                const id = delBtn.getAttribute('data-erp-reg-id') ?? '';
                asyncConfirm(tr('erpDre.registries.confirmRemove', 'Remove this item?'), {
                    danger: true,
                    confirmLabel: tr('erpDre.registries.remove', 'Remove'),
                })
                    .then((ok) => {
                        if (!ok) return;
                        const next = applyRemove(section, id, getErpRegistries());
                        if (next) persist(next);
                    })
                    .catch((e) => {
                        console.debug('[erp/registries] remove item cancelled', e?.message || e);
                    });
            }
        });

        overlay.querySelector('[data-erp-reg-close]')?.addEventListener('click', () => done());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) done();
        });
        document.addEventListener('keydown', onKey);
    });
}
