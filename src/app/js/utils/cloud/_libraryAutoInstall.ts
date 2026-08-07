// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CR-053: EventListener para 'libraryPurchased' + 'ecbtPurchaseCompleted' +
// auto-install E2E.
// Antes deste módulo, subscription.ts:checkPaymentReturn() disparava o evento
// 'libraryPurchased' (compra via gateway externo/Stripe redirect) mas NENHUM
// listener existia — o evento era código morto. Além disso,
// checkPaymentReturn() limpava os URL params (library_purchase, library)
// ANTES de _checkLibraryCheckoutReturn() lê-los, então o fluxo de auto-install
// via URL também nunca executava.
// checkoutModal.ts:_payWithBalance() (compra via saldo $ECBT, sem redirect)
// dispara 'ecbtPurchaseCompleted' para QUALQUER itemType — também sem
// listener; aqui só reagimos quando itemType === 'library'.
//
// Este módulo registra os listeners ANTES de checkPaymentReturn rodar
// (chamado em boot-preflight.ts), garantindo que o evento de gateway seja
// capturado; o listener de saldo é registrado no mesmo setup (a compra via
// saldo já ocorre com a página aberta, sem precisar de reload de boot).

/**
 * Auto-install a purchased library by DB UUID.
 * Baixa o manifest e instala a biblioteca comprada.
 *
 * @param {string} libraryDbId - UUID da biblioteca na tabela libraries
 * @returns {Promise<{ success: boolean; error?: string; manifestName?: string }>}
 */
export async function autoInstallPurchasedLibrary(
    libraryDbId: string,
): Promise<{ success: boolean; error?: string; manifestName?: string }> {
    if (!libraryDbId) {
        return { success: false, error: 'libraryDbId ausente' };
    }

    // Importes dinâmicos para evitar acoplamento estático circular
    // (subscription → libraries/manager → elements → ...).
    const { hasUserPurchased, downloadLibraryManifest } = await import(
        '../libraries/supabaseMarketplace.js'
    );
    const { installLibrary } = await import('../libraries/manager.js');

    // Verifica se a compra foi confirmada no backend
    const purchased = await hasUserPurchased(libraryDbId);
    if (!purchased) {
        console.warn('[CR-053] Purchase not confirmed for', libraryDbId);
        return { success: false, error: 'Compra não confirmada' };
    }

    // Baixa o manifest e instala
    const dl = await downloadLibraryManifest(libraryDbId);
    if (!dl?.manifest) {
        console.warn('[CR-053] Manifest download failed:', dl?.error);
        return { success: false, error: 'Falha ao baixar manifest' };
    }

    const result = installLibrary(dl.manifest);
    if (!result.success) {
        return { success: false, error: result.error || 'Falha ao instalar' };
    }

    return { success: true, manifestName: dl.manifest.name || dl.manifest.id };
}

/** Aguarda auth estar disponível antes de prosseguir (timeout 30s, não bloqueia indefinidamente). */
async function _waitAuth(): Promise<void> {
    const { getCurrentUser } = await import('../auth/session.js');
    return new Promise<void>((resolve) => {
        if (getCurrentUser()) return resolve();
        const handler = () => {
            if (getCurrentUser()) {
                window.removeEventListener('authChanged', handler);
                resolve();
            }
        };
        window.addEventListener('authChanged', handler);
        setTimeout(() => {
            window.removeEventListener('authChanged', handler);
            resolve();
        }, 30_000);
    });
}

/**
 * T9.2b: tela "e agora?" pós-compra — confirma a compra e dá o próximo passo
 * concreto (abrir a biblioteca / tentar de novo / suporte). Se o modal não
 * carregar por qualquer motivo, degrada para o toast original (CR-053) para
 * o cliente nunca ficar sem feedback.
 */
async function _showPostPurchaseScreen(
    libraryId: string,
    result: { success: boolean; error?: string; manifestName?: string },
): Promise<void> {
    try {
        const { openPostPurchaseModal } = await import('../ui/postPurchaseModal.js' as string);
        openPostPurchaseModal(
            {
                status: result.success ? 'installed' : 'install_failed',
                libraryId,
                libraryName: result.manifestName ?? null,
                errorMessage: result.error ?? null,
            },
            { onRetry: () => _runAutoInstall(libraryId) },
        );
    } catch (err: any) {
        console.debug('[CR-053] post-purchase modal fallback:', err?.message || err);
        if (result.success) {
            window.showToast?.(`Compra concluída! ${result.manifestName} instalada.`, 'success');
        } else {
            window.showToast?.(result.error || 'Erro ao instalar biblioteca.', 'error');
        }
    }
}

/** Executa autoInstallPurchasedLibrary + tela "e agora?" (compartilhado pelos 2 listeners). */
async function _runAutoInstall(libraryId: string): Promise<void> {
    try {
        await _waitAuth();
        const result = await autoInstallPurchasedLibrary(libraryId);
        await _showPostPurchaseScreen(libraryId, result);
    } catch (err: any) {
        console.error('[CR-053] Auto-install error:', err);
        await _showPostPurchaseScreen(libraryId, {
            success: false,
            error: err?.message || 'Erro ao instalar biblioteca comprada.',
        });
    }
}

/**
 * Setup dos listeners de 'libraryPurchased' e 'ecbtPurchaseCompleted'.
 * Registra os listeners que auto-instalam a biblioteca após compra confirmada
 * (gateway externo/redirect OU saldo $ECBT sem redirect).
 *
 * Deve ser chamado ANTES de checkPaymentReturn() no boot para garantir que
 * o listener de gateway esteja ativo quando o evento for disparado.
 *
 * Idempotente: múltiplas chamadas não registram listeners duplicados.
 *
 * @returns {void}
 */
let _listenerInstalled = false;

export function setupLibraryPurchasedListener(): void {
    if (_listenerInstalled) return;
    if (typeof window === 'undefined') return;

    window.addEventListener('libraryPurchased', /** @param {Event} e */ async (e: Event) => {
        const detail = (e as CustomEvent).detail;
        const libraryId = detail?.libraryId;
        if (!libraryId) {
            console.warn('[CR-053] libraryPurchased event sem libraryId');
            return;
        }
        console.debug('[CR-053] libraryPurchased recebido, auto-instalando...', libraryId);
        await _runAutoInstall(libraryId);
    });

    // Compra via saldo $ECBT (checkoutModal.ts:_payWithBalance) — só reage
    // quando itemType === 'library' (o evento dispara para qualquer item pago
    // com saldo: subscription/topup/market_listing também).
    window.addEventListener('ecbtPurchaseCompleted', /** @param {Event} e */ async (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.itemType !== 'library' || !detail?.itemId) return;
        console.debug('[CR-053] ecbtPurchaseCompleted (library) recebido, auto-instalando...', detail.itemId);
        await _runAutoInstall(detail.itemId);
    });

    _listenerInstalled = true;
    console.debug('[CR-053] Listeners libraryPurchased/ecbtPurchaseCompleted registrados');
}