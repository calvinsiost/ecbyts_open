// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// BUTTONS FACTORY — canonical button builders.
// Classes .ecbt-btn[--primary|--secondary|--danger|--ghost|--icon] espelham design-tokens.css.

import { t } from '../i18n/translations.js';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';

export interface ButtonOptions {
    labelKey?: string;
    label?: string;
    ariaLabelKey?: string;
    iconSvg?: string;
    onClick?: (event: MouseEvent) => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    extraClass?: string;
}

/**
 * Cria <button> canônico. labelKey é i18n key; label literal sobrepõe.
 */
export function createButton(variant: ButtonVariant, opts: ButtonOptions = {}): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = opts.type || 'button';
    btn.className = 'ecbt-btn ecbt-btn--' + variant + (opts.extraClass ? ' ' + opts.extraClass : '');
    if (opts.disabled) btn.disabled = true;

    const labelText = opts.label || (opts.labelKey ? (t(opts.labelKey) || opts.labelKey) : '');

    if (variant === 'icon') {
        // Icon-only: SVG content + aria-label obrigatório
        if (opts.iconSvg) btn.innerHTML = opts.iconSvg;
        const aria = opts.ariaLabelKey ? (t(opts.ariaLabelKey) || opts.ariaLabelKey) : labelText;
        if (aria) btn.setAttribute('aria-label', aria);
    } else {
        if (opts.iconSvg) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'ecbt-btn-icon';
            iconSpan.innerHTML = opts.iconSvg;
            btn.appendChild(iconSpan);
        }
        if (labelText) {
            const labelSpan = document.createElement('span');
            labelSpan.className = 'ecbt-btn-label';
            labelSpan.textContent = labelText;
            btn.appendChild(labelSpan);
        }
    }

    if (opts.onClick) btn.addEventListener('click', opts.onClick);
    return btn;
}

export const btnPrimary = (opts: ButtonOptions) => createButton('primary', opts);
export const btnSecondary = (opts: ButtonOptions) => createButton('secondary', opts);
export const btnDanger = (opts: ButtonOptions) => createButton('danger', opts);
export const btnGhost = (opts: ButtonOptions) => createButton('ghost', opts);
export const btnIcon = (opts: ButtonOptions) => createButton('icon', opts);
