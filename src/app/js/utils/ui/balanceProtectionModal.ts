// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * CBMD-001 F5 (claude-omni, 2026-07-11) — Balance Protection + Estimator DOM wire.
 *
 * Wire DOM real do que `core/billing/balanceProtection.ts` (pure-logic, 19
 * tests) já compõe como view-model: o modal de service-protection (saldo
 * insuficiente, 3 caminhos de top-up) e o modal de usage estimator (custo
 * alto, confirmar antes de gastar).
 *
 * NÃO reimplementa a lógica de decisão — apenas renderiza os models
 * (`buildProtectionModalModel` / `buildEstimatorModalModel`) e liga os
 * caminhos de pagamento ao checkout já existente (`checkoutModal.ts`,
 * item type 'topup').
 *
 * Entry point único: `analyzeAndGate(snapshot, actionLabel, costEcbt, onConfirm)`
 *   - 'allowed'       → executa onConfirm() direto, sem modal (sem fricção)
 *   - 'needsConfirm'  → abre estimator modal; onConfirm() só roda se usuário confirmar
 *   - 'blocked'       → abre protection modal; onConfirm() nunca roda (ação bloqueada)
 *
 * Reusa `attachModalA11y` (focus trap + Escape + return-focus) — mesmo
 * padrão de `paywallModal.ts`/`checkoutModal.ts` (.ecbt-overlay + .ecbt-dialog).
 */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { attachModalA11y } from './modalA11y.js';
import {
    analyzeAction,
    buildProtectionModalModel,
    buildEstimatorModalModel,
    shouldShowProtectionFor,
    type BalanceProtectionConfig,
    type PaymentPath,
} from '../../core/billing/balanceProtection.js';
import type { BalanceSnapshot, SupportedLocale } from '../../core/billing/balanceLedger.js';

// ── State ────────────────────────────────────────────────────────────────

// NOTA: os overlays NÃO ficam cacheados em variável de módulo — cada
// open*/close* resolve via `document.getElementById` (idempotente: cria só
// se ausente). Isso evita referências obsoletas quando o `document` global
// muda entre chamadas (ex.: suíte de testes com mock DOM por teste) e
// continua correto em produção (um único `document` real por sessão).
let _protectionA11yCleanup: (() => void) | null = null;
let _estimatorA11yCleanup: (() => void) | null = null;

function _currentLocale(): SupportedLocale {
    try {
        const w = window as any;
        const l = w?.__ecbtLocale || w?.CONFIG?.locale;
        if (l === 'en-US' || l === 'es-LA' || l === 'pt-BR') return l;
    } catch (err: any) {
        console.debug('[balanceProtectionModal:locale]', err?.message || err);
    }
    return 'pt-BR';
}

// ── Protection modal (saldo insuficiente — verdict='blocked') ──────────────

/**
 * Resolve o overlay de protection sempre via `document.getElementById`
 * (idempotente: cria só se ausente). Deliberadamente NÃO cacheia em
 * variável de módulo — permanece correto se o `document` global mudar
 * entre chamadas (harness de teste com mock DOM por caso) e é igualmente
 * correto em produção (um único `document` real por sessão de página).
 */
function _getOrCreateProtectionOverlay(): HTMLElement {
    const existing = document.getElementById('balance-protection-overlay') as HTMLElement | null;
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.id = 'balance-protection-overlay';
    overlay.className = 'ecbt-overlay';
    overlay.style.cssText = 'display:none;z-index:9200;';
    const modal = document.createElement('div');
    modal.id = 'balance-protection-modal';
    modal.className = 'ecbt-dialog ecbt-dialog--md';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) closeProtectionModal();
    });
    document.body.appendChild(overlay);
    return overlay;
}

function _pathButtonHtml(path: PaymentPath): string {
    const labelText = t(path.labelKey) || path.method;
    const amountHint = path.suggestedAmountBrl
        ? ` — R$ ${path.suggestedAmountBrl}`
        : path.suggestedAmountEcbt
          ? ` — ${path.suggestedAmountEcbt} $ECBT`
          : '';
    return `
        <button type="button"
                class="balance-protection-path-btn"
                data-method="${escapeHtml(path.method)}"
                data-amount-brl="${path.suggestedAmountBrl ?? ''}"
                data-amount-ecbt="${path.suggestedAmountEcbt ?? ''}">
            ${escapeHtml(labelText)}${escapeHtml(amountHint)}
        </button>`;
}

function _renderProtectionModal(
    modal: HTMLElement,
    snapshot: BalanceSnapshot,
    actionLabel: string,
    actionCostEcbt: number,
    onCancel: () => void,
): void {
    const locale = _currentLocale();
    const model = buildProtectionModalModel(snapshot, actionLabel, actionCostEcbt, locale);

    modal.innerHTML = `
        <div class="ecbt-header">
            <h3 class="ecbt-title">${escapeHtml(t(model.titleKey) || 'Saldo insuficiente')}</h3>
            <button class="ecbt-close balance-protection-close" aria-label="Close">&times;</button>
        </div>
        <div class="balance-protection-body" aria-live="${model.ariaLive}">
            <p>${escapeHtml(t(model.bodyKey, model.bodyVars) || `${model.actionLabel} — ${model.costFormatted} / ${model.balanceFormatted}`)}</p>
        </div>
        <div class="balance-protection-paths">
            ${model.paths.map(_pathButtonHtml).join('')}
        </div>
        <div class="balance-protection-footer">
            <button type="button" class="balance-protection-upgrade">${escapeHtml(t(model.upgradeLabelKey) || 'Ver plano ilimitado')}</button>
            <button type="button" class="balance-protection-cancel">${escapeHtml(t(model.cancelLabelKey) || 'Cancelar ação')}</button>
        </div>
    `;

    modal.querySelectorAll('.balance-protection-close, .balance-protection-cancel').forEach((btn) => {
        btn.addEventListener('click', () => {
            closeProtectionModal();
            onCancel();
        });
    });

    modal.querySelector('.balance-protection-upgrade')?.addEventListener('click', async () => {
        closeProtectionModal();
        try {
            const w = window as any;
            if (typeof w.handleOpenCreditsHub === 'function') w.handleOpenCreditsHub({ source: 'balance-protection' });
        } catch (err: any) {
            console.debug('[balanceProtectionModal:upgrade]', err?.message || err);
        }
    });

    modal.querySelectorAll('.balance-protection-path-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const method = (btn as HTMLElement).dataset.method;
            const amountBrl = (btn as HTMLElement).dataset.amountBrl;
            const amountEcbt = (btn as HTMLElement).dataset.amountEcbt;
            closeProtectionModal();
            try {
                if (method === 'eic-redeem') {
                    const w = window as any;
                    if (typeof w.handleRedeemEic === 'function') {
                        await w.handleRedeemEic(Number(amountEcbt) || undefined);
                    }
                    return;
                }
                // mercadopago / stripe → checkout unificado em modo top-up.
                const { openCheckoutModal } = await import('./checkoutModal.js' as string);
                await openCheckoutModal('topup', null, {
                    presetAmount: amountBrl || null,
                    itemSubtitle: method,
                });
            } catch (err: any) {
                console.debug('[balanceProtectionModal:path]', err?.message || err);
            }
        });
    });
}

/**
 * Abre o modal de service-protection (saldo insuficiente). Chamado quando
 * `analyzeAction`/`shouldShowProtectionFor` retornam 'blocked'.
 *
 * @param onCancel callback invocado quando o usuário fecha/cancela sem recarregar.
 */
export function openProtectionModal(
    snapshot: BalanceSnapshot,
    actionLabel: string,
    actionCostEcbt: number,
    onCancel: () => void = () => {},
): void {
    const overlay = _getOrCreateProtectionOverlay();
    overlay.style.display = 'flex';
    const modal = document.getElementById('balance-protection-modal') as HTMLElement | null;
    if (modal) _renderProtectionModal(modal, snapshot, actionLabel, actionCostEcbt, onCancel);
    _protectionA11yCleanup = attachModalA11y(overlay, () => {
        closeProtectionModal();
        onCancel();
    });
}

export function closeProtectionModal(): void {
    const overlay = document.getElementById('balance-protection-overlay') as HTMLElement | null;
    if (overlay) overlay.style.display = 'none';
    if (_protectionA11yCleanup) {
        _protectionA11yCleanup();
        _protectionA11yCleanup = null;
    }
}

// ── Estimator modal (custo alto — verdict='needsConfirm') ──────────────────

/** Mesma racional de `_getOrCreateProtectionOverlay` — sem cache module-scope. */
function _getOrCreateEstimatorOverlay(): HTMLElement {
    const existing = document.getElementById('balance-estimator-overlay') as HTMLElement | null;
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.id = 'balance-estimator-overlay';
    overlay.className = 'ecbt-overlay';
    overlay.style.cssText = 'display:none;z-index:9200;';
    const modal = document.createElement('div');
    modal.id = 'balance-estimator-modal';
    modal.className = 'ecbt-dialog ecbt-dialog--sm';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) closeEstimatorModal();
    });
    document.body.appendChild(overlay);
    return overlay;
}

function _renderEstimatorModal(
    modal: HTMLElement,
    snapshot: BalanceSnapshot,
    actionLabel: string,
    actionCostEcbt: number,
    onConfirm: () => void,
    onCancel: () => void,
): void {
    const locale = _currentLocale();
    const model = buildEstimatorModalModel(snapshot, actionLabel, actionCostEcbt, locale);

    const confirmMsg =
        t('balance.estimator.confirm', {
            cost: model.costFormatted,
            after: model.balanceAfterFormatted,
        }) || `${model.actionLabel}: ${model.costFormatted}. Saldo após: ${model.balanceAfterFormatted}.`;

    modal.innerHTML = `
        <div class="ecbt-header">
            <h3 class="ecbt-title">${escapeHtml(t(model.titleKey) || 'Confirmar custo da ação')}</h3>
            <button class="ecbt-close balance-estimator-close" aria-label="Close">&times;</button>
        </div>
        <div class="balance-estimator-body" aria-live="${model.ariaLive}">
            <p>${escapeHtml(confirmMsg)}</p>
            ${
                model.showBlockedWarning
                    ? `<p class="balance-estimator-warning" data-tier="${escapeHtml(model.alertTierAfter)}">${escapeHtml(
                          t('balance.alert.tier.crit') || 'Cota quase esgotada — top-up urgente',
                      )}</p>`
                    : ''
            }
        </div>
        <div class="balance-estimator-footer">
            <button type="button" class="balance-estimator-cancel">${escapeHtml(t(model.cancelLabelKey) || 'Cancelar')}</button>
            <button type="button" class="balance-estimator-confirm">${escapeHtml(t(model.confirmLabelKey) || 'Confirmar e continuar')}</button>
        </div>
    `;

    modal.querySelectorAll('.balance-estimator-close, .balance-estimator-cancel').forEach((btn) => {
        btn.addEventListener('click', () => {
            closeEstimatorModal();
            onCancel();
        });
    });
    modal.querySelector('.balance-estimator-confirm')?.addEventListener('click', () => {
        closeEstimatorModal();
        onConfirm();
    });
}

/**
 * Abre o estimator modal (custo ≥ threshold OU tier warn/crit). Chamado
 * quando `analyzeAction`/`shouldShowProtectionFor` retornam 'needsConfirm'.
 */
export function openEstimatorModal(
    snapshot: BalanceSnapshot,
    actionLabel: string,
    actionCostEcbt: number,
    onConfirm: () => void,
    onCancel: () => void = () => {},
): void {
    const overlay = _getOrCreateEstimatorOverlay();
    overlay.style.display = 'flex';
    const modal = document.getElementById('balance-estimator-modal') as HTMLElement | null;
    if (modal) _renderEstimatorModal(modal, snapshot, actionLabel, actionCostEcbt, onConfirm, onCancel);
    _estimatorA11yCleanup = attachModalA11y(overlay, () => {
        closeEstimatorModal();
        onCancel();
    });
}

export function closeEstimatorModal(): void {
    const overlay = document.getElementById('balance-estimator-overlay') as HTMLElement | null;
    if (overlay) overlay.style.display = 'none';
    if (_estimatorA11yCleanup) {
        _estimatorA11yCleanup();
        _estimatorA11yCleanup = null;
    }
}

// ── F5.3/F5.4 Gateway central — call site canônico para caller code ────────

/**
 * Gateway central: caller (quickActions, handleGenerateRandomModel, etc.)
 * chama `analyzeAndGate` ANTES de executar uma ação com custo em $ECBT.
 *
 *   - 'allowed'      → onConfirm() roda imediatamente, sem modal.
 *   - 'needsConfirm' → abre estimator modal; onConfirm() só roda se o
 *                       usuário confirmar explicitamente.
 *   - 'blocked'      → abre protection modal (3 caminhos de top-up);
 *                       onConfirm() NUNCA roda automaticamente.
 *
 * Retorna a decisão (`HookDecision`) para o caller poder logar/telemetria
 * se necessário — a orquestração de UI já foi feita internamente.
 */
export function analyzeAndGate(
    snapshot: BalanceSnapshot,
    actionLabel: string,
    actionCostEcbt: number,
    onConfirm: () => void,
    onCancel: () => void = () => {},
    config: Partial<BalanceProtectionConfig> = {},
): ReturnType<typeof shouldShowProtectionFor> {
    const decision = shouldShowProtectionFor(snapshot, actionCostEcbt, config);
    if (decision === 'execute') {
        onConfirm();
        return decision;
    }
    if (decision === 'showEstimator') {
        openEstimatorModal(snapshot, actionLabel, actionCostEcbt, onConfirm, onCancel);
        return decision;
    }
    // 'showProtection'
    openProtectionModal(snapshot, actionLabel, actionCostEcbt, onCancel);
    return decision;
}

/** Exposto para telemetria/debug — não usado pelo wire em si. */
export { analyzeAction };
