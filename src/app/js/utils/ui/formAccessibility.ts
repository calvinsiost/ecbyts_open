// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

// Auto-associate form labels and controls to improve accessibility audits.
// This also watches dynamic UI fragments inserted after the initial boot.

const LABELABLE_SELECTOR =
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]), select, textarea';

let autoIdCounter = 0;
let observer: any = null;
let rafHandle = 0;
const pendingRoots = new Set<any>();

function _collectLabels(root: any): any[] {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return [];
    const labels = root.matches('label') ? [root] : [];
    return labels.concat(Array.from(root.querySelectorAll('label')));
}

function _collectControls(root: any): any[] {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return [];
    const controls = root.matches(LABELABLE_SELECTOR) ? [root] : [];
    return controls.concat(Array.from(root.querySelectorAll(LABELABLE_SELECTOR)));
}

function _ensureControlId(control: any): string {
    if (control.id && control.id.trim()) return control.id;

    autoIdCounter += 1;
    control.id = `ecbyts-field-${autoIdCounter}`;
    return control.id;
}

function _hasAccessibleName(control: any): boolean {
    if (!control) return false;
    if (control.labels && control.labels.length > 0) return true;
    if ((control.getAttribute('aria-label') || '').trim()) return true;
    if ((control.getAttribute('aria-labelledby') || '').trim()) return true;
    return false;
}

function _resolveFallbackName(control: any, label: any): string {
    const labelText = (label?.textContent || '').replace(/\s+/g, ' ').trim();
    if (labelText) return labelText;

    const candidates = [
        control.getAttribute('placeholder'),
        control.getAttribute('title'),
        control.getAttribute('name'),
        control.id,
        control.type,
    ];

    for (const candidate of candidates) {
        const value = (candidate || '').trim();
        if (value) return value;
    }

    return 'Field';
}

function _ensureAccessibleName(control: any, label: any): void {
    if (_hasAccessibleName(control)) return;
    control.setAttribute('aria-label', _resolveFallbackName(control, label));
}

function _findFirstControl(node: any): any {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
    if (node.matches(LABELABLE_SELECTOR)) return node;
    return node.querySelector(LABELABLE_SELECTOR);
}

function _getScopeControls(scope: any, label: any): any[] {
    if (!scope || scope.nodeType !== Node.ELEMENT_NODE) return [];

    return Array.from(scope.querySelectorAll(LABELABLE_SELECTOR)).filter((control: any) => {
        const ownerLabel = control.closest('label');
        return !ownerLabel || ownerLabel === label;
    });
}

function _pickNearestControl(label: any, controls: any): any {
    if (!controls.length) return null;

    const following = controls.find((control: any) =>
        Boolean(label.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    if (following) return following;

    for (let i = controls.length - 1; i >= 0; i -= 1) {
        if (label.compareDocumentPosition(controls[i]) & Node.DOCUMENT_POSITION_PRECEDING) {
            return controls[i];
        }
    }

    return controls[0];
}

function _findCandidateControl(label: any): any {
    let sibling = label.nextElementSibling;
    while (sibling) {
        const match = _findFirstControl(sibling);
        if (match) return match;
        sibling = sibling.nextElementSibling;
    }

    const parent = label.parentElement;
    if (parent) {
        const parentMatch = _pickNearestControl(label, _getScopeControls(parent, label));
        if (parentMatch) return parentMatch;
    }

    const scopedContainer = label.closest(
        '.form-group, .form-row, .field, .row, [role="dialog"], .modal-content, .section-content, .tab-content, form',
    );
    if (scopedContainer && scopedContainer !== parent) {
        const scopedMatch = _pickNearestControl(label, _getScopeControls(scopedContainer, label));
        if (scopedMatch) return scopedMatch;
    }

    return null;
}

function _associateLabel(label: any): void {
    if (!(label instanceof HTMLLabelElement)) return;

    const nestedControl = label.querySelector(LABELABLE_SELECTOR);
    if (nestedControl) {
        const targetId = _ensureControlId(nestedControl);
        if (!label.htmlFor) label.htmlFor = targetId;
        _ensureAccessibleName(nestedControl, label);
        return;
    }

    if (label.htmlFor) {
        const existingTarget = document.getElementById(label.htmlFor);
        if (existingTarget) {
            _ensureAccessibleName(existingTarget, label);
            return;
        }
    }

    const candidate = _findCandidateControl(label);
    if (!candidate) return;

    label.htmlFor = _ensureControlId(candidate);
    _ensureAccessibleName(candidate, label);
}

function _processRoot(root: any): void {
    _collectLabels(root).forEach(_associateLabel);

    _collectControls(root).forEach((control: any) => {
        if (!_hasAccessibleName(control)) {
            _ensureAccessibleName(control, null);
        }
    });
}

function _scheduleRoot(root: any): void {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    pendingRoots.add(root);

    if (rafHandle) return;
    rafHandle = window.requestAnimationFrame(() => {
        rafHandle = 0;
        const roots = Array.from(pendingRoots);
        pendingRoots.clear();
        roots.forEach(_processRoot);
    });
}

export function initFormAccessibility(): void {
    if (observer || !document.body) return;

    _processRoot(document.body);

    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    _scheduleRoot(node);
                }
            });
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
