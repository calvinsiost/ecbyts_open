// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/harness/keyboardParity.js
// Pure classification helpers for UI Exploration Harness I1.

export const KEYBOARD_ACTIVATION_KEYS = Object.freeze(['Enter', 'Space']);

export function isObservableActivation(record: any): boolean {
    if (!record || record.status !== 'clicked') return false;
    if (record.deadClick === true) return false;
    if (record.deadClick === false) return true;
    if (typeof record.domMutations === 'number' && record.domMutations > 0) return true;
    if (typeof record.domDelta === 'number' && record.domDelta !== 0) return true;
    if (Array.isArray(record.errorsDuringClick) && record.errorsDuringClick.length > 0) return true;
    if (Array.isArray(record.consoleLogsDuringClick) && record.consoleLogsDuringClick.length > 0) return true;
    return false;
}

export function buildKeyboardParityResult({
    target = {} as any,
    clickRecord = null as any,
    keyRecords = {} as any,
}: { target?: any; clickRecord?: any; keyRecords?: any } = {}) {
    const keys: Record<string, any> = {};
    for (const key of KEYBOARD_ACTIVATION_KEYS) {
        const record = keyRecords[key] || null;
        const activated = isObservableActivation(record);
        keys[key] = Object.freeze({
            attempted: Boolean(record && record.status !== 'skipped'),
            status: record?.status || 'skipped',
            activated,
            focusSucceeded: record?.keyboardFocusSucceeded === true,
            focusVisible: record?.keyboardFocusVisible !== false,
        });
    }

    const clickActivated = isObservableActivation(clickRecord);
    const attemptedKeyCount = Object.values(keys).filter((entry) => entry.attempted).length;
    const keyboardActivated = Object.values(keys).some((entry) => entry.activated);
    const pointerOnly = clickActivated && attemptedKeyCount > 0 && !keyboardActivated;
    const stableId = target.stableId || clickRecord?.keyboardParityTargetStableId || clickRecord?.stableId || '';

    return Object.freeze({
        stableId,
        selector: target.selector || clickRecord?.selector || '',
        text: target.text || clickRecord?.text || '',
        dataAction: target.dataAction || clickRecord?.dataAction || null,
        ariaLabel: target.ariaLabel || clickRecord?.ariaLabel || null,
        clickActivated,
        keyboardActivated,
        attemptedKeyCount,
        keys: Object.freeze(keys),
        pointerOnly,
        finding: pointerOnly
            ? Object.freeze({
                  id: 'keyboard-pointer-only',
                  severity: 'error',
                  message: 'Click produced an observable activation but Enter/Space did not.',
                  stableId,
                  selector: target.selector || clickRecord?.selector || '',
              })
            : null,
    });
}

export function decorateKeyboardParityRecord(record: any, parity: any, key: any): any {
    if (!record || !parity) return record;
    record.keyboardParityTargetStableId = parity.stableId;
    record.keyboardParityKey = key;
    record.keyboardParityClickActivated = parity.clickActivated;
    record.keyboardParityKeyActivated =
        key === 'click' ? parity.clickActivated : parity.keys?.[key]?.activated === true;
    record.keyboardParityMatchedClick =
        key === 'click' ? true : parity.clickActivated === (parity.keys?.[key]?.activated === true);
    record.pointerOnly = parity.pointerOnly;

    if (parity.finding && key !== 'click') {
        const issues = Array.isArray(record.uxIssues) ? record.uxIssues.slice() : [];
        issues.push(parity.finding);
        record.uxIssues = issues;
    }
    return record;
}

export function isInvisibleFocusSnapshot(snapshot: any): boolean {
    return Boolean(snapshot && snapshot.focused !== false && snapshot.tag !== 'body' && snapshot.visible === false);
}

export function buildInvisibleFocusIssue(snapshot: any, index = 0) {
    return Object.freeze({
        id: 'keyboard-invisible-focus',
        severity: 'error',
        message: 'Tab cycle moved focus to an invisible element.',
        index,
        stableKey: snapshot?.key || '',
        selector: snapshot?.selector || '',
        tag: snapshot?.tag || '',
        idValue: snapshot?.id || '',
        role: snapshot?.role || null,
    });
}
