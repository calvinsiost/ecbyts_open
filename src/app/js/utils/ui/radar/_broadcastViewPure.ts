// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   BROADCAST VIEW — lógica pura de apresentação do Radar.

   Extraído inline de utils/ui/radarModal.ts (o pior code-score da
   camada de telas) para ser importável em Node cheap tests sem DOM,
   fetch ou Supabase. Cada função reproduz BYTE-A-BYTE a expressão
   que vivia embutida no template HTML / handler.

   Funções:
   - buildBroadcastUrl(origin, shareCode)  → link público do broadcast
       (estava duplicado inline em 2 lugares: card e _radarCopyBroadcastLink)
   - formatDiscoveryDistance(distanceKm)   → texto do "chip" de distância
       (estava embutido no template de _renderDiscoveryResults)
   - resolveSlotCounterVM(active, limit)   → { pct, countLabel } do contador
       de slots (estava inline em _renderSlotCounter; o rótulo i18n
       t('radarSlots') continua no modal)
   - buildCtaPanelHtml({...})              → HTML do painel CTA lazy
       (estava embutido no template de _renderCtaPanel; os rótulos i18n
       já resolvidos via t() são injetados)
   - buildDiscoveryFilterBarHtml({...})    → HTML da barra de filtros da aba
       Descoberta (estava inline em _startDiscovery; só rótulos i18n entram)
   - buildEditorFormHtml({...})            → HTML do form do editor de perfil
       (estava inline em _renderEditor; rótulos i18n, valor escapado e
       fragmentos pré-montados — familyHTML/sectionHTML/emailChipsHTML — são
       injetados, pois o escaping via DOM continua no modal)
   ================================================================ */

/**
 * Monta a URL pública de um broadcast a partir de uma origem e um
 * share-code. Pura: a origem é injetada (no modal vem de
 * `window.location.origin`).
 *
 * Reproduz byte-a-byte `${origin}/broadcast?id=${shareCode}`.
 *
 * @param origin     origem (ex.: "https://ecbyts.com")
 * @param shareCode  código público do broadcast
 */
export function buildBroadcastUrl(origin: unknown, shareCode: unknown): string {
    return `${origin}/broadcast?id=${shareCode}`;
}

/**
 * Formata o rótulo de distância do card de descoberta.
 *
 * Reproduz byte-a-byte a expressão inline:
 *   distanceKm < 1
 *     ? (distanceKm * 1000).toFixed(0) + ' m'
 *     : distanceKm.toFixed(1) + ' km'
 *
 * O modal só renderiza o chip quando `Number.isFinite(distanceKm)`;
 * esta função assume um número finito (mesma pré-condição do inline).
 *
 * @param distanceKm  distância em km (finita)
 */
export function formatDiscoveryDistance(distanceKm: number): string {
    return distanceKm < 1
        ? (distanceKm * 1000).toFixed(0) + ' m'
        : distanceKm.toFixed(1) + ' km';
}

/** View-model puro do contador de slots de broadcast. */
export interface SlotCounterVM {
    /** Percentual de preenchimento da barra (0..100; 0 quando limit === Infinity). */
    readonly pct: number;
    /** Prefixo do rótulo SEM a palavra i18n ("3" ou "3/5"); o modal anexa t('radarSlots'). */
    readonly countLabel: string;
}

/**
 * Resolve o view-model do contador de slots a partir de
 * (ativos, limite). Pura: o rótulo i18n (`t('radarSlots')`) e a
 * obtenção de `active`/`limit` (via `_getRadarSlotCount`) continuam
 * no modal.
 *
 * Reproduz byte-a-byte:
 *   pct        = limit === Infinity ? 0 : Math.min(100, (active / limit) * 100)
 *   countLabel = limit === Infinity ? `${active}` : `${active}/${limit}`
 *
 * @param active  slots em uso
 * @param limit   limite de slots (Infinity = ilimitado)
 */
export function resolveSlotCounterVM(active: number, limit: number): SlotCounterVM {
    const pct = limit === Infinity ? 0 : Math.min(100, (active / limit) * 100);
    const countLabel = limit === Infinity ? `${active}` : `${active}/${limit}`;
    return Object.freeze({ pct, countLabel });
}

/**
 * Monta o HTML completo do contador de slots de broadcast.
 *
 * Pura: a palavra i18n (`t('radarSlots')`) e a obtenção de
 * `active`/`limit` (via `_getRadarSlotCount`) continuam no modal e são
 * injetadas aqui. Reproduz byte-a-byte o template-string inline que
 * vivia em `_renderSlotCounter` (mesma indentação/quebras).
 *
 * @param active      slots em uso
 * @param limit       limite de slots (Infinity = ilimitado)
 * @param slotsLabel  rótulo i18n da unidade (ex.: t('radarSlots'))
 */
export function buildSlotCounterHtml(
    active: number,
    limit: number,
    slotsLabel: string,
): string {
    const { pct, countLabel } = resolveSlotCounterVM(active, limit);
    const label = `${countLabel} ${slotsLabel}`;
    return `
        <div class="radar-slot-counter">
            ${label}
            <div class="radar-slot-bar">
                <div class="radar-slot-fill" style="width:${pct}%"></div>
            </div>
        </div>
    `;
}

/** Entrada do painel CTA lazy do radar (rótulos já resolvidos via i18n). */
export interface CtaPanelInput {
    /** Chave do ícone (data-icon). */
    readonly iconKey: string;
    /** Título já traduzido (t(titleKey)). */
    readonly title: string;
    /** Corpo já traduzido (t(bodyKey)). */
    readonly body: string;
    /** Rótulo do botão já traduzido (t(ctaKey)). */
    readonly ctaLabel: string;
    /** Nome do handler (entra cru no data-cc-call-click; o modal já valida). */
    readonly handlerName: string;
}

/**
 * Monta o HTML do painel CTA lazy do radar (abas profiles/slices/wallet/
 * audit). Pura: os rótulos i18n já vêm resolvidos (t()) e a parte DOM
 * (lookup do painel, dataset.rendered, innerHTML) continua no modal.
 *
 * Reproduz byte-a-byte o template-string que vivia em `_renderCtaPanel`
 * (mesma indentação/quebras), incluindo o `encodeURIComponent` aplicado
 * ao nome do handler no atributo data-cc-call-click.
 */
export function buildCtaPanelHtml(input: CtaPanelInput): string {
    const { iconKey, title, body, ctaLabel, handlerName } = input;
    return `
        <div class="radar-cta-panel" style="text-align:center;padding:32px 24px;">
            <div class="radar-cta-icon" style="font-size:48px;margin-bottom:12px;opacity:.6;"><span class="icon" data-icon="${iconKey}" data-icon-size="48px"></span></div>
            <h3 style="margin:0 0 8px;font-size:18px;">${title}</h3>
            <p style="color:var(--ecbt-text-muted,#999);max-width:480px;margin:0 auto 20px;">${body}</p>
            <button type="button" class="btn btn-primary radar-cta-btn" data-cc-call-click="_radarCtaOpen|s:${encodeURIComponent(handlerName)}">${ctaLabel}</button>
        </div>
    `;
}

/** Rótulos i18n já resolvidos da barra de filtros da Descoberta. */
export interface DiscoveryFilterBarLabels {
    readonly searchPlaceholder: string;
    readonly applyLabel: string;
    readonly clearLabel: string;
}

/**
 * Monta o HTML da barra de filtros da aba Descoberta (busca textual +
 * lat/lon/raio + geoloc). Pura: os rótulos i18n já vêm resolvidos (no
 * modal vinham de `t(...) || fallback`) e o DOM (lookup do painel,
 * innerHTML, wiring dos listeners) continua em `_startDiscovery`.
 *
 * Reproduz byte-a-byte o template-string inline (mesma indentação/quebras).
 */
export function buildDiscoveryFilterBarHtml(labels: DiscoveryFilterBarLabels): string {
    const { searchPlaceholder, applyLabel, clearLabel } = labels;
    return `
        <div class="radar-discovery-filters" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;padding:8px;background:var(--bg-secondary,#1f2937);border-radius:6px;">
            <input type="text" class="radar-search" id="radar-discovery-search" placeholder="${searchPlaceholder}" style="flex:1;min-width:180px;">
            <input type="number" id="radar-discovery-lat" placeholder="Lat" step="0.0001" min="-90" max="90" style="width:90px;" title="Latitude do centro">
            <input type="number" id="radar-discovery-lon" placeholder="Lon" step="0.0001" min="-180" max="180" style="width:90px;" title="Longitude do centro">
            <input type="number" id="radar-discovery-radius" placeholder="km" min="1" max="20000" value="50" style="width:70px;" title="Raio em km">
            <button type="button" id="radar-discovery-geoloc" class="btn-sm" title="Usar minha localização">&#x2316;</button>
            <button type="button" id="radar-discovery-apply" class="btn-sm btn-primary">${applyLabel}</button>
            <button type="button" id="radar-discovery-clear" class="btn-sm">${clearLabel}</button>
        </div>
        <div id="radar-discovery-results"></div>
    `;
}

/**
 * Entrada do form do editor de perfil de broadcast. Todos os valores já
 * vêm resolvidos/escapados pelo modal (i18n via t(); escaping via DOM no
 * `_esc`; fragmentos pré-montados): este builder é pura concatenação.
 */
export interface EditorFormInput {
    /** t('radarProfileName'). */
    readonly nameLabel: string;
    /** _esc(profile.name). */
    readonly escName: string;
    /** t('radar.namePlaceholder'). */
    readonly namePlaceholder: string;
    /** t('radarVisPublic').replace('Publico', 'Visibilidade'). */
    readonly visLabel: string;
    /** t('radarVisPublic'). */
    readonly visPublicLabel: string;
    /** t('radarVisPrivate'). */
    readonly visPrivateLabel: string;
    /** profile.visibility. */
    readonly visibility: string;
    /** t('radarEmailPlaceholder'). */
    readonly emailPlaceholder: string;
    /** HTML pré-montado dos chips de e-mail. */
    readonly emailChipsHtml: string;
    /** t('radarPresetCompliance'). */
    readonly presetComplianceLabel: string;
    /** t('radarPresetExecutive'). */
    readonly presetExecutiveLabel: string;
    /** t('radarPresetComplete'). */
    readonly presetCompleteLabel: string;
    /** t('radarFamilies'). */
    readonly familiesLabel: string;
    /** HTML pré-montado dos checkboxes de família. */
    readonly familyHtml: string;
    /** t('radarSelectAll'). */
    readonly selectAllLabel: string;
    /** t('radarDeselectAll'). */
    readonly deselectAllLabel: string;
    /** t('radarSections'). */
    readonly sectionsLabel: string;
    /** HTML pré-montado dos checkboxes de seção. */
    readonly sectionHtml: string;
    /** truthy quando é edição (mostra o botão Excluir). */
    readonly isEdit: boolean;
    /** t('radarSaveAndBroadcast'). */
    readonly saveLabel: string;
}

/**
 * Monta o HTML completo do form do editor de perfil de broadcast.
 *
 * Pura: NÃO faz i18n nem escaping nem DOM — recebe tudo pronto e
 * concatena. O escaping (`_esc`) e os rótulos (`t()`) continuam no
 * modal, assim como o wiring de eventos após `innerHTML`. Reproduz
 * byte-a-byte o template-string que vivia em `_renderEditor`.
 */
export function buildEditorFormHtml(input: EditorFormInput): string {
    return `
        <div class="radar-editor-row">
            <label>${input.nameLabel}</label>
            <input data-field-meta="true" data-field-meta-key="auto:radar-ed-name" type="text" id="radar-ed-name" value="${input.escName}" placeholder="${input.namePlaceholder}">
        </div>
        <div class="radar-editor-row">
            <label>${input.visLabel}</label>
            <select data-field-meta="true" data-field-meta-key="auto:radar-ed-vis" id="radar-ed-vis">
                <option value="public" ${input.visibility === 'public' ? 'selected' : ''}>${input.visPublicLabel}</option>
                <option value="private" ${input.visibility === 'private' ? 'selected' : ''}>${input.visPrivateLabel}</option>
            </select>
        </div>
        <div class="radar-editor-row" id="radar-ed-emails-row" style="display:${input.visibility === 'private' ? 'flex' : 'none'}">
            <label>Emails</label>
            <div style="flex:1">
                <div class="radar-email-chips" id="radar-ed-chips">${input.emailChipsHtml}</div>
                <input type="email" class="radar-email-input" id="radar-ed-email-input" placeholder="${input.emailPlaceholder}">
            </div>
        </div>

        <div class="radar-presets">
            <button class="radar-preset-btn" data-preset="compliance">${input.presetComplianceLabel}</button>
            <button class="radar-preset-btn" data-preset="executive">${input.presetExecutiveLabel}</button>
            <button class="radar-preset-btn" data-preset="complete">${input.presetCompleteLabel}</button>
        </div>

        <div class="radar-matrix-section">
            <div class="radar-matrix-title">${input.familiesLabel}</div>
            <div class="radar-matrix-grid" id="radar-ed-families">${input.familyHtml}</div>
            <div class="radar-matrix-actions">
                <button id="radar-ed-all">${input.selectAllLabel}</button>
                <button id="radar-ed-none">${input.deselectAllLabel}</button>
            </div>
        </div>

        <div class="radar-matrix-section">
            <div class="radar-matrix-title">${input.sectionsLabel}</div>
            <div class="radar-sections-grid" id="radar-ed-sections">${input.sectionHtml}</div>
        </div>

        <div class="radar-editor-actions">
            ${input.isEdit ? `<button class="radar-btn-danger" id="radar-ed-delete">Excluir</button>` : ''}
            <button class="radar-btn-secondary" id="radar-ed-cancel">Cancelar</button>
            <button class="radar-btn-primary" id="radar-ed-save">${input.saveLabel}</button>
        </div>
    `;
}
