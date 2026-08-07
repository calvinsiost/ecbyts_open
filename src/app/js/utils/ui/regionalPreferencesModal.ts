// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/*
   REGIONAL PREFERENCES MODAL

   Central, low-friction screen for language, region, time zone, date/time,
   number, currency and unit defaults. Browser auto-detection remains the
   default path; manual override is explicit.
*/

import { t, getCurrentLanguage, getAvailableLanguages, LANGUAGE_META, setLanguage } from '../i18n/translations.js';
import {
    CURRENCY_OPTIONS,
    REGION_LOCALE_OPTIONS,
    TIME_ZONE_OPTIONS,
    buildRegionalPreview,
    buildRegionalPreviewForPreferences,
    detectBrowserRegionalSettings,
    loadRegionalPreferences,
    resetRegionalPreferences,
    saveRegionalPreferences,
} from '../i18n/regionalPreferences.js';
import { buildModalShell } from './modals.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';

const ROOT_ID = 'regional-preferences-root';

function tr(key: string, fallback: string): string {
    const value = t(key);
    return value && value !== key ? value : fallback;
}

function option(value: string, label = value, selected = false): string {
    return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function selectValue(id: string): string {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    return el?.value || '';
}

function checkedValue(id: string): boolean {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return !!el?.checked;
}

function renderOptions(values: readonly string[], selected: string): string {
    return values.map((value) => option(value, value, value === selected)).join('');
}

function updatePreview() {
    const preview = document.getElementById('regional-pref-preview');
    if (!preview) return;
    const draft = collectDraft();
    preview.textContent = buildRegionalPreviewForPreferences(draft, new Date());
}

function setManualDisabled(disabled: boolean) {
    document.querySelectorAll('[data-regional-manual]').forEach((el) => {
        (el as HTMLInputElement | HTMLSelectElement).disabled = disabled;
    });
}

function collectDraft() {
    return {
        mode: selectValue('regional-pref-mode') === 'manual' ? 'manual' : 'browser',
        locale: selectValue('regional-pref-locale'),
        timeZone: selectValue('regional-pref-timezone'),
        dateStyle: selectValue('regional-pref-date-style'),
        timeStyle: selectValue('regional-pref-time-style'),
        hourCycle: selectValue('regional-pref-hour-cycle'),
        firstDayOfWeek: selectValue('regional-pref-first-day'),
        measurementSystem: selectValue('regional-pref-units'),
        currency: selectValue('regional-pref-currency'),
        showTimeZoneName: checkedValue('regional-pref-show-tz'),
    };
}

function ensureRoot(): HTMLElement {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        document.body.appendChild(root);
    }
    return root;
}

function buildLanguageOptions(current: string): string {
    return getAvailableLanguages()
        .map((lang) => {
            const meta = (LANGUAGE_META as Record<string, { native?: string }>)[lang];
            const label = meta?.native ? `${meta.native} (${lang})` : lang;
            return option(lang, label, lang === current);
        })
        .join('');
}

function attachHandlers(close: () => void) {
    const mode = document.getElementById('regional-pref-mode') as HTMLSelectElement | null;
    if (mode) {
        mode.addEventListener('change', () => {
            setManualDisabled(mode.value !== 'manual');
            updatePreview();
        });
        setManualDisabled(mode.value !== 'manual');
    }

    document.querySelectorAll('[data-regional-input]').forEach((el) => {
        el.addEventListener('change', updatePreview);
    });

    document.getElementById('regional-pref-use-browser')?.addEventListener('click', () => {
        const detected = detectBrowserRegionalSettings();
        const modeEl = document.getElementById('regional-pref-mode') as HTMLSelectElement | null;
        const localeEl = document.getElementById('regional-pref-locale') as HTMLSelectElement | null;
        const timezoneEl = document.getElementById('regional-pref-timezone') as HTMLSelectElement | null;
        const hourEl = document.getElementById('regional-pref-hour-cycle') as HTMLSelectElement | null;
        const currencyEl = document.getElementById('regional-pref-currency') as HTMLSelectElement | null;
        const unitsEl = document.getElementById('regional-pref-units') as HTMLSelectElement | null;
        const firstDayEl = document.getElementById('regional-pref-first-day') as HTMLSelectElement | null;
        if (modeEl) modeEl.value = 'browser';
        if (localeEl) localeEl.value = detected.locale;
        if (timezoneEl) timezoneEl.value = detected.timeZone;
        if (hourEl) hourEl.value = detected.hourCycle;
        if (currencyEl) currencyEl.value = detected.currency;
        if (unitsEl) unitsEl.value = detected.measurementSystem;
        if (firstDayEl) firstDayEl.value = detected.firstDayOfWeek;
        setManualDisabled(true);
        updatePreview();
    });

    document.getElementById('regional-pref-reset')?.addEventListener('click', () => {
        resetRegionalPreferences();
        close();
        openRegionalPreferencesModal();
    });

    document.getElementById('regional-pref-save')?.addEventListener('click', async () => {
        const lang = selectValue('regional-pref-language');
        if (lang && lang !== getCurrentLanguage()) await setLanguage(lang);
        saveRegionalPreferences(collectDraft());
        showToast(tr('regionalPreferences.saved', 'Preferencias regionais salvas.'), 'success');
        close();
    });
}

export function openRegionalPreferencesModal() {
    const root = ensureRoot();
    root.innerHTML = '';

    const prefs = loadRegionalPreferences();
    const detected = detectBrowserRegionalSettings();
    const currentLanguage = getCurrentLanguage();
    const title = tr('regionalPreferences.title', 'Idioma e regiao');
    const { overlay, body, footer, close } = buildModalShell({
        title,
        width: '720px',
        onClose: closeRegionalPreferencesModal,
    }) as { overlay: HTMLElement; body: HTMLElement; footer: HTMLElement; close: () => void };

    overlay.classList.add('regional-pref-overlay');
    body.classList.add('regional-pref-body');
    body.innerHTML = `
        <div class="regional-pref-banner">
            <span data-icon="globe-2" data-icon-size="18px"></span>
            <div>
                <strong>${escapeHtml(tr('regionalPreferences.browserDetected', 'Detectado pelo navegador'))}</strong>
                <span>${escapeHtml(`${detected.locale} · ${detected.timeZone} · ${detected.hourCycle}`)}</span>
            </div>
        </div>

        <div class="regional-pref-section">
            <div class="regional-pref-section-title">${escapeHtml(tr('regionalPreferences.interface', 'Interface'))}</div>
            <div class="regional-pref-grid">
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.language', 'Idioma da interface'))}</span>
                    <select id="regional-pref-language" data-regional-input>
                        ${buildLanguageOptions(currentLanguage)}
                    </select>
                </label>
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.mode', 'Origem das configuracoes'))}</span>
                    <select id="regional-pref-mode" data-regional-input>
                        ${option('browser', tr('regionalPreferences.browserMode', 'Automatico pelo navegador'), prefs.mode === 'browser')}
                        ${option('manual', tr('regionalPreferences.manualMode', 'Manual'), prefs.mode === 'manual')}
                    </select>
                </label>
            </div>
        </div>

        <div class="regional-pref-section">
            <div class="regional-pref-section-title">${escapeHtml(tr('regionalPreferences.regionDates', 'Regiao, datas e hora'))}</div>
            <div class="regional-pref-grid">
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.locale', 'Regiao para formatacao'))}</span>
                    <select id="regional-pref-locale" data-regional-input data-regional-manual>
                        ${renderOptions([...new Set([prefs.locale, detected.locale, ...REGION_LOCALE_OPTIONS])], prefs.locale)}
                    </select>
                </label>
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.timeZone', 'Fuso horario'))}</span>
                    <select id="regional-pref-timezone" data-regional-input data-regional-manual>
                        ${renderOptions([...new Set([prefs.timeZone, detected.timeZone, ...TIME_ZONE_OPTIONS])], prefs.timeZone)}
                    </select>
                </label>
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.dateStyle', 'Formato de data'))}</span>
                    <select id="regional-pref-date-style" data-regional-input data-regional-manual>
                        ${option('short', '20/06/2026', prefs.dateStyle === 'short')}
                        ${option('medium', '20 de jun. de 2026', prefs.dateStyle === 'medium')}
                        ${option('long', '20 de junho de 2026', prefs.dateStyle === 'long')}
                        ${option('full', 'sabado, 20 de junho de 2026', prefs.dateStyle === 'full')}
                    </select>
                </label>
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.timeStyle', 'Formato de hora'))}</span>
                    <select id="regional-pref-time-style" data-regional-input data-regional-manual>
                        ${option('short', '18:38', prefs.timeStyle === 'short')}
                        ${option('medium', '18:38:21', prefs.timeStyle === 'medium')}
                        ${option('long', '18:38:21 BRT', prefs.timeStyle === 'long')}
                    </select>
                </label>
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.hourCycle', 'Relogio'))}</span>
                    <select id="regional-pref-hour-cycle" data-regional-input data-regional-manual>
                        ${option('auto', tr('regionalPreferences.auto', 'Automatico'), prefs.hourCycle === 'auto')}
                        ${option('h23', '24h', prefs.hourCycle === 'h23')}
                        ${option('h12', '12h AM/PM', prefs.hourCycle === 'h12')}
                    </select>
                </label>
                <label class="regional-pref-check">
                    <input type="checkbox" id="regional-pref-show-tz" data-regional-input data-regional-manual ${prefs.showTimeZoneName ? 'checked' : ''}>
                    <span>${escapeHtml(tr('regionalPreferences.showTimeZone', 'Mostrar fuso quando for util'))}</span>
                </label>
            </div>
        </div>

        <div class="regional-pref-section">
            <div class="regional-pref-section-title">${escapeHtml(tr('regionalPreferences.numbersUnits', 'Numeros, moeda e unidades'))}</div>
            <div class="regional-pref-grid">
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.currency', 'Moeda padrao'))}</span>
                    <select id="regional-pref-currency" data-regional-input data-regional-manual>
                        ${renderOptions([...new Set([prefs.currency, detected.currency, ...CURRENCY_OPTIONS])], prefs.currency)}
                    </select>
                </label>
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.units', 'Unidades'))}</span>
                    <select id="regional-pref-units" data-regional-input data-regional-manual>
                        ${option('auto', tr('regionalPreferences.auto', 'Automatico'), prefs.measurementSystem === 'auto')}
                        ${option('metric', tr('regionalPreferences.metric', 'Metrico'), prefs.measurementSystem === 'metric')}
                        ${option('imperial', tr('regionalPreferences.imperial', 'Imperial'), prefs.measurementSystem === 'imperial')}
                    </select>
                </label>
                <label class="regional-pref-field">
                    <span>${escapeHtml(tr('regionalPreferences.firstDay', 'Inicio da semana'))}</span>
                    <select id="regional-pref-first-day" data-regional-input data-regional-manual>
                        ${option('auto', tr('regionalPreferences.auto', 'Automatico'), prefs.firstDayOfWeek === 'auto')}
                        ${option('monday', tr('regionalPreferences.monday', 'Segunda-feira'), prefs.firstDayOfWeek === 'monday')}
                        ${option('sunday', tr('regionalPreferences.sunday', 'Domingo'), prefs.firstDayOfWeek === 'sunday')}
                    </select>
                </label>
            </div>
        </div>

        <div class="regional-pref-preview">
            <span>${escapeHtml(tr('regionalPreferences.preview', 'Previa'))}</span>
            <strong id="regional-pref-preview">${escapeHtml(buildRegionalPreview(new Date()))}</strong>
        </div>
    `;

    const browserBtn = document.createElement('button');
    browserBtn.type = 'button';
    browserBtn.className = 'btn btn-secondary';
    browserBtn.id = 'regional-pref-use-browser';
    browserBtn.textContent = tr('regionalPreferences.useBrowser', 'Usar navegador');
    footer.appendChild(browserBtn);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-secondary';
    resetBtn.id = 'regional-pref-reset';
    resetBtn.textContent = tr('regionalPreferences.reset', 'Restaurar padrao');
    footer.appendChild(resetBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.id = 'regional-pref-save';
    saveBtn.textContent = t('save') || 'Salvar';
    footer.appendChild(saveBtn);

    root.appendChild(overlay);
    attachHandlers(close);
    if (typeof (window as any).hydrateIcons === 'function') (window as any).hydrateIcons(overlay);
}

export function closeRegionalPreferencesModal() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.innerHTML = '';
}

if (typeof window !== 'undefined') {
    (window as any).openRegionalPreferencesModal = openRegionalPreferencesModal;
    (window as any).closeRegionalPreferencesModal = closeRegionalPreferencesModal;
}
