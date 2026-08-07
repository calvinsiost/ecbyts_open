// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CONTRIBUTION FORM SHELL — LIBRARY_COMMUNITY_ENRICHMENT_9_68

   Shell/placeholder form for submitting library data contributions.
   ================================================================ */

import { t } from '../../i18n/translations.js';

/**
 * Build the ContributionForm DOM element.
 *
 * @param {object} opts
 * @param {Function} [opts.onSubmit] - called with form data object
 * @returns {HTMLElement}
 */
export function ContributionForm(/** @type {any} */ {
    onSubmit
}: any) {
    const form = document.createElement('form');
    form.className = 'library-contribution-form';
    form.noValidate = true;

    /** @param {string} name @param {string} text */
    function labelFor(name: any, text: any) {
        const lbl = document.createElement('label');
        lbl.htmlFor = `lc-${name}`;
        lbl.textContent = text;
        return lbl;
    }

    /** @param {HTMLElement} input @param {string} name @param {string} labelText */
    function wrapField(input: any, name: any, labelText: any) {
        const wrap = document.createElement('div');
        wrap.className = 'library-form-field';
        wrap.appendChild(labelFor(name, labelText));
        wrap.appendChild(input);
        return wrap;
    }

    // Contribution type
    const typeSelect = document.createElement('select');
    typeSelect.id = 'lc-type';
    typeSelect.name = 'contribution_type';
    typeSelect.required = true;
    const typeOpts = [
        { value: '', label: t('libraryCommunity.selectType') || 'Select type…' },
        { value: 'new_record', label: t('libraryCommunity.type.newRecord') },
        { value: 'edit', label: t('libraryCommunity.type.edit') },
        { value: 'delete', label: t('libraryCommunity.type.delete') },
    ];
    for (const opt of typeOpts) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        typeSelect.appendChild(option);
    }
    form.appendChild(wrapField(typeSelect, 'type', t('libraryCommunity.field.type') || 'Change type'));

    // Justification
    const justification = document.createElement('textarea');
    justification.id = 'lc-justification';
    justification.name = 'justification';
    justification.rows = 4;
    justification.required = true;
    justification.placeholder = t('libraryCommunity.placeholder.justification') || 'Explain why this change is needed…';
    form.appendChild(wrapField(justification, 'justification', t('libraryCommunity.field.justification')));

    // Data source
    const dataSource = document.createElement('input');
    dataSource.id = 'lc-data-source';
    dataSource.name = 'data_source';
    dataSource.type = 'text';
    dataSource.placeholder = t('libraryCommunity.placeholder.dataSource') || 'e.g. IBAMA, ANA, field survey';
    form.appendChild(wrapField(dataSource, 'data-source', t('libraryCommunity.field.dataSource')));

    // Source URL
    const sourceUrl = document.createElement('input');
    sourceUrl.id = 'lc-source-url';
    sourceUrl.name = 'source_url';
    sourceUrl.type = 'url';
    sourceUrl.placeholder = 'https://…';
    form.appendChild(wrapField(sourceUrl, 'source-url', t('libraryCommunity.field.sourceUrl')));

    // Source date
    const sourceDate = document.createElement('input');
    sourceDate.id = 'lc-source-date';
    sourceDate.name = 'source_date';
    sourceDate.type = 'date';
    form.appendChild(wrapField(sourceDate, 'source-date', t('libraryCommunity.field.sourceDate')));

    // Spatial accuracy
    const accuracySelect = document.createElement('select');
    accuracySelect.id = 'lc-spatial-accuracy';
    accuracySelect.name = 'spatial_accuracy';
    const accuracyOpts = [
        { value: '', label: t('libraryCommunity.selectAccuracy') || 'Select accuracy…' },
        { value: 'gps', label: t('libraryCommunity.spatialAccuracy.gps') },
        { value: 'satellite_1m', label: t('libraryCommunity.spatialAccuracy.satellite1m') },
        { value: 'satellite_10m', label: t('libraryCommunity.spatialAccuracy.satellite10m') },
        { value: 'other', label: t('libraryCommunity.spatialAccuracy.other') },
    ];
    for (const opt of accuracyOpts) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        accuracySelect.appendChild(option);
    }
    form.appendChild(wrapField(accuracySelect, 'spatial-accuracy', t('libraryCommunity.field.spatialAccuracy')));

    // License checkbox
    const licenseWrap = document.createElement('div');
    licenseWrap.className = 'library-form-field library-form-checkbox';

    const licenseCheck = document.createElement('input');
    licenseCheck.id = 'lc-license';
    licenseCheck.name = 'license_confirmed';
    licenseCheck.type = 'checkbox';

    const licenseLabel = document.createElement('label');
    licenseLabel.htmlFor = 'lc-license';
    licenseLabel.textContent =
        t('libraryCommunity.field.licenseConfirm') || 'I agree to release this contribution under CC-BY-SA 4.0';

    licenseWrap.appendChild(licenseCheck);
    licenseWrap.appendChild(licenseLabel);
    form.appendChild(licenseWrap);

    // Submit
    const submitWrap = document.createElement('div');
    submitWrap.className = 'library-form-actions';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn-primary';
    submitBtn.textContent = t('libraryCommunity.action.submit') || 'Submit for Review';

    submitWrap.appendChild(submitBtn);
    form.appendChild(submitWrap);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = {
            contribution_type: typeSelect.value,
            justification: justification.value.trim(),
            data_source: dataSource.value.trim(),
            source_url: sourceUrl.value.trim(),
            source_date: sourceDate.value || null,
            spatial_accuracy: accuracySelect.value || null,
            license_confirmed: licenseCheck.checked,
        };
        if (!data.contribution_type || !data.justification) {
            console.debug('[contributionForm]', 'Validation failed');
            return;
        }
        if (typeof onSubmit === 'function') {
            onSubmit(data).catch((/** @type {any} */ err: any) => console.debug('[contributionForm:submit]', err?.message || err),
            );
        }
    });

    return form;
}

/**
 * Render the contribution form into a container.
 *
 * @param {HTMLElement} container
 * @param {Function} onSubmit
 */
export function renderContributionForm(container: any, onSubmit: any) {
    if (!container) {
        console.debug('[contributionForm]', 'No container provided');
        return;
    }
    container.innerHTML = '';
    container.appendChild(ContributionForm({ onSubmit }));
}
