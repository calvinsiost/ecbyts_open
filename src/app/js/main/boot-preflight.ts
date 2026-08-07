// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { markBootPhase } from './boot-phase.js';

function logSilentCatch(error: any) {
    console.debug('[main:silent-catch]', error?.message || error);
}
export async function runBootPreflightSequence({ startLoadingTips, bindSaveStatusRetry, features, documentRef, windowRef, localStorageRef, sessionStorageRef, historyRef, locationRef, appVersion, clearModelData, safeSetItem, initTheme, updateLoading, withInitTimeout, initI18n, updateLanguageSelector, translate, initCookieConsent, initLifecycleMetrics, initVercelAnalytics, applyChartDefaults, initFieldManager, initLibraries, initTaxonomies, exposeLazyWindowModules, getAllElements, loadContracts, loadWbs, loadProjects, loadCostCenters, initAuth, hydrateDevLocalLlmConfig, initCreditsBadge, registerEarlyWindowBridges, authHandlers, handleOpenCreditsPanel, hydrateRegulatoryCalendar, hydrateDecisionLog, hydrateStakeholderShares, hydrateRetentionPolicies, hydrateProvenanceGraphPreview, checkLibraryCheckoutReturn }: any) {
    // NOTE: initSAO/initNN deliberadamente NÃO são mais consumidos aqui (lazy via
    // ensureSAO/ensureNN + warm-up pós-shell). main.ts ainda pode passá-los no bag
    // (props extras ignoradas) sem efeito.
    // T10.1 (SPEC_TRAINING_LMS_OPEN_POINTS): markPhase extraído para helper
    // compartilhado (./boot-phase.js) — main.ts e startup-gates.ts agora também
    // marcam fases pós-preflight no MESMO window.__ecbytsBootPhase(Log) que o
    // watchdog consome, então o STUCK AT deixa de travar sempre em
    // 'preflight:done'. Contrato de escrita inalterado (mesmo shape).
    const markPhase = (phase: any) => markBootPhase(windowRef, phase);
    markPhase('preflight:start');
    startLoadingTips();
    if (features.FIRST_JOURNEY_SAVE_STATUS) {
        bindSaveStatusRetry();
    }
    else {
        const saveChip = documentRef.getElementById('status-save-state');
        if (saveChip)
            saveChip.style.display = 'none';
    }
    try {
        markPhase('preflight:version-gate');
        const { checkAndApplyVersionGate } = await import('../utils/startup/versionGate.js' as string);
        const gateResult = await checkAndApplyVersionGate();
        if (gateResult.ran) {
            console.warn('[ecbyts] Version gate triggered reload, aborting init');
            return { aborted: true };
        }
    }
    catch (err: any) {
        console.debug('[ecbyts] Version gate failed, falling back to legacy gate:', err);
        const storedVersion = localStorageRef.getItem('ecbyts-version');
        if (storedVersion !== appVersion) {
            console.warn(`[ecbyts] Legacy version gate: ${storedVersion || 'N/A'} → ${appVersion}`);
            await clearModelData();
            safeSetItem('ecbyts-version', appVersion);
        }
    }
    const versionEl = documentRef.getElementById('app-version');
    if (versionEl)
        versionEl.textContent = `v${appVersion}`;
    // HOME-V2-VERSION-BADGE: #app-version fica escondido dentro do #titlebar
    // legado (display:none) quando HOME_REDESIGN_V2 está ligado — homeHeader.ts
    // usa um id distinto (#app-version-v2) pra evitar colisão de getElementById,
    // então o texto precisa ser escrito nos dois elementos.
    const versionElV2 = documentRef.getElementById('app-version-v2');
    if (versionElV2)
        versionElV2.textContent = `v${appVersion}`;
    try {
        const { initEnvironmentBadge } = await import('../utils/ui/environmentBadge.js' as string);
        initEnvironmentBadge();
    }
    catch (err: any) {
        console.warn('[ecbyts] environment badge init failed:', /** @type {any} */ (err)?.message);
    }
    try {
        const { initHudVisibilityBridge } = await import('../utils/scene/hudVisibility.js' as string);
        initHudVisibilityBridge();
    }
    catch (err: any) {
        console.warn('[ecbyts] hud visibility bridge init failed:', /** @type {any} */ (err)?.message);
    }
    initTheme();
    updateLoading('Loading translations...', 5);
    markPhase('preflight:i18n');
    await initI18n();
    updateLanguageSelector();
    updateLoading(translate('loadingModules') || 'Loading modules...', 15);
    initCookieConsent();
    initLifecycleMetrics();
    initVercelAnalytics();
    if (windowRef.Chart) {
        applyChartDefaults(windowRef.Chart);
    }
    initFieldManager();
    // LOADING-PERF GAP-2 (claude - adm 2026-06-25): SAO e NN saíram do caminho
    // crítico. Antes eram dois `await withInitTimeout(... , 30000)` em série — até
    // 60s de orçamento serial bloqueando o TTI, mesmo no caso comum em que ambos
    // terminam em poucos ms. Nenhum consumidor de SAO/NN roda até a 1ª tela; todos
    // disparam por ação do usuário (abrir painel SAO/IA, calcular, importar). Agora
    // a inicialização é LAZY (ensureSAO()/ensureNN() no 1º uso, idempotente +
    // dedupe de concorrência) MAIS um warm-up em background pós-shell
    // (warmupSaoNnLazy em postboot-lifecycle), de modo que normalmente já está
    // pronto antes do 1º clique, sem custar boot. markPhase mantido p/ diagnóstico.
    markPhase('preflight:sao-lazy');
    updateLoading(translate('loadingLibraries') || 'Loading libraries...', 25);
    initLibraries();
    initTaxonomies();
    exposeLazyWindowModules({ getAllElements });
    markPhase('preflight:governance-persistence');
    await withInitTimeout(() => Promise.all([loadContracts(), loadWbs(), loadProjects(), loadCostCenters()]), 'Governance persistence', 5000);
    updateLoading(translate('loadingNeuralNetworks') || 'Loading neural networks...', 35);
    markPhase('preflight:nn-lazy');
    updateLoading(translate('authenticating') || 'Authenticating...', 45);
    markPhase('preflight:auth');
    await withInitTimeout(() => initAuth(), 'Authentication');
    // TOOLING-PERF/boot-diag (claude - adm 2026-06-11): único await do caminho
    // crítico SEM timeout — Supabase lento aqui travava o boot inteiro até o
    // watchdog de 45s. Agora 3s e segue (check é non-critical por natureza;
    // só decide se mostra toast de pagamento confirmado).
    markPhase('preflight:payment-return');
    await withInitTimeout(async () => {
        // CR-053: registra o listener de 'libraryPurchased' ANTES de
        // checkPaymentReturn() disparar o evento (subscription.ts) — sem isso o
        // evento é código morto e a biblioteca comprada nunca é auto-instalada.
        const { setupLibraryPurchasedListener } = await import('../utils/cloud/_libraryAutoInstall.js' as string);
        setupLibraryPurchasedListener();
        const { checkPaymentReturn } = await import('../utils/cloud/subscription.js' as string);
        const paymentResult = await checkPaymentReturn();
        if (paymentResult === true || paymentResult?.confirmed) {
            import('../utils/ui/toast.js' as string).then(({ showToast }) => showToast('Pagamento confirmado! Assinatura ativa.', 'success')).catch((e: any) => console.debug('[boot-preflight:payment-toast:silent-catch]', e?.message || e));
        }
        else if (paymentResult?.reason === 'processing_pending') {
            import('../utils/ui/toast.js' as string).then(({ showToast }) => showToast('Pagamento em processamento. Pode levar alguns minutos.', 'info')).catch((e: any) => console.debug('[boot-preflight:payment-toast:silent-catch]', e?.message || e));
        }
        else {
            // T6.7 — sem retorno de gateway mas com checkout pendente em
            // sessionStorage (aba voltou do gateway sem concluir): oferecer
            // retomada via modal (resumePending finalmente tem consumidor).
            void import('../utils/ui/pendingPaymentResumeModal.js' as string)
                .then((m) => m.maybeOfferPendingPaymentResume())
                .catch((e: any) => console.debug('[boot-preflight:pending-resume:silent-catch]', e?.message || e));
        }
    }, 'Payment return check', 3000);
    const orgInviteToken = new URLSearchParams(locationRef.search).get('org_invite');
    if (orgInviteToken) {
        sessionStorageRef.setItem('ecbyts-pending-org-invite', orgInviteToken);
        const url = new URL(locationRef);
        url.searchParams.delete('org_invite');
        historyRef.replaceState({}, '', url);
    }
    markPhase('preflight:dev-llm-config');
    await hydrateDevLocalLlmConfig().catch(() => false);
    initCreditsBadge();
    // CBMD-001 F3 (claude - ui 2026-06-11): balance badge statusbar — lazy,
    // no-op enquanto CONFIG.FEATURES.BALANCE_BADGE=false (D1 Calvin pendente).
    void import('../utils/ui/balanceBadge.js')
        .then((m) => m.initBalanceBadge())
        .catch((e: any) => console.debug('[boot:balanceBadge]', e?.message || e));
    registerEarlyWindowBridges({
        authHandlers,
        handleOpenCreditsPanel,
        hydrateRegulatoryCalendar,
        hydrateDecisionLog,
        hydrateStakeholderShares,
        hydrateRetentionPolicies,
        hydrateProvenanceGraphPreview,
    });
    import('../utils/handlers/photolog.js' as string)
        .then(({ photologHandlers: ph }) => Object.assign(windowRef, ph))
        .catch(logSilentCatch);
    import('../utils/handlers/eis.js' as string)
        .then(({ eisHandlers: eh }) => Object.assign(windowRef, eh))
        .catch(logSilentCatch);
    checkLibraryCheckoutReturn();
    import('../utils/telemetry/tracker.js' as string)
        .then(({ initTelemetry }) => {
        initTelemetry();
    })
        .catch((e) => console.warn('[ecbyts] Telemetry init skipped:', e?.message));
    // T5.4: funil first-party (visit/signup/payment) — LGPD-safe, sem tool externa
    import('../utils/telemetry/funnel.js' as string)
        .then(({ initFunnelTelemetry }) => initFunnelTelemetry())
        .catch((e) => console.debug('[ecbyts] Funnel telemetry skipped:', e?.message));
    // HUMAN-USAGE F7: instrumentador de trajetória por opt-in improve_product.
    // O gate REAL é o consent, checado a CADA captura dentro do módulo
    // (interactionTrace); aqui só ligamos o binder no DOM. getImproveProductOptIn
    // é async → cache sync fail-closed (começa false) + refresh a cada checagem,
    // então revogar o opt-in interrompe a captura no ciclo seguinte.
    void Promise.all([
        import('../utils/telemetry/interactionTrace.js' as string),
        import('../utils/ui/privacyNotice.js' as string),
        import('../utils/telemetry/tracker.js' as string),
    ])
        .then(([{ createInteractionTracer, bindInteractionCapture, createFirstValueTracker, bindFirstValueSignals, createLiveConsentGate }, { getImproveProductOptIn, subscribeImproveProductOptIn }, { initTelemetry, trackEvent, setTelemetryScopeEnabled }]) => {
            initTelemetry(); // idempotente; evita perder o marco inicial por corrida no boot
            let consentGate: { hasConsent: () => boolean };
            const firstValueTracker = createFirstValueTracker({
                hasConsent: () => consentGate?.hasConsent() === true,
                emit: (eventType: string, target: string, metadata: Record<string, unknown>) =>
                    trackEvent(eventType, target, { ...metadata, consent_scope: 'improve_product' }),
            });
            consentGate = createLiveConsentGate({
                readConsent: getImproveProductOptIn,
                subscribe: subscribeImproveProductOptIn,
                onGranted: () => {
                    setTelemetryScopeEnabled('improve_product', true);
                    firstValueTracker.start();
                },
                onRevoked: () => {
                    firstValueTracker.reset();
                    setTelemetryScopeEnabled('improve_product', false);
                },
            });
            const tracer = createInteractionTracer({
                hasConsent: consentGate.hasConsent,
                emit: (eventType: string, ev: any) =>
                    trackEvent(eventType, `${ev.role || 'el'}:${ev.label || ev.kind}`, {
                        ...ev,
                        consent_scope: 'improve_product',
                    }),
            });
            windowRef.__ecbytsInteractionTracer = tracer;
            windowRef.__ecbytsFirstValueTracker = firstValueTracker;
            bindInteractionCapture(documentRef, tracer, {
                win: windowRef,
                view: () => String(locationRef.hash || locationRef.pathname || ''),
            });
            bindFirstValueSignals(windowRef, firstValueTracker);
        })
        .catch((e: any) => console.debug('[ecbyts] Interaction trace skipped:', e?.message || e));
    if (features.PERF_FIELD_WEB_VITALS) {
        // LOADING-PERF-001 RF-7: coleta de Web Vitals de campo (LCP/INP/CLS) só
        // roda com consentimento LGPD opt-in EXPLÍCITO. Lemos o registro legal
        // existente (getLegalConsent) e só ligamos o monitor se o usuário aceitou
        // os cookies/telemetria opcionais (scope cookies_preferences === true).
        // Sem consentimento: no-op total (startWebVitalsFieldMonitoring vira no-op).
        Promise.all([
            import('../utils/telemetry/webVitalsField.js' as string),
            import('../utils/ui/privacyNotice.js' as string),
        ])
            .then(async ([{ startWebVitalsFieldMonitoring }, { getLegalConsent }]) => {
                const consent = await getLegalConsent().catch(() => null);
                windowRef.__ecbytsWebVitalsFieldMonitor = startWebVitalsFieldMonitoring({
                    enabled: true,
                    consented: consent,
                });
            })
            .catch((e) => console.debug('[ecbyts] Web Vitals field monitor skipped:', e?.message));
    }
    import('../utils/errorReporting/reporter.js' as string)
        .then((mod) => {
        /** @type {any} */ (mod).initErrorReporting?.();
    })
        .catch((e) => console.warn('[ecbyts] Error reporting init skipped:', /** @type {any} */ (e)?.message));
    // Sprint 1-3 (2026-05-02): bug-report telemetry buffers - graceful degradation
    // if any module is missing (worktree merge order). Each module is idempotent
    // and self-protects against double-init.
    import('../utils/errorReporting/networkBuffer.js' as string)
        .then(({ initNetworkBuffer }) => initNetworkBuffer())
        .catch((e) => console.debug('[ecbyts] networkBuffer skipped:', e?.message));
    import('../utils/errorReporting/consoleBuffer.js' as string)
        .then(({ initConsoleBuffer }) => initConsoleBuffer())
        .catch((e) => console.debug('[ecbyts] consoleBuffer skipped:', e?.message));
    import('../utils/errorReporting/breadcrumbs.js' as string)
        .then(({ initBreadcrumbs }) => initBreadcrumbs())
        .catch((e) => console.debug('[ecbyts] breadcrumbs skipped:', e?.message));
    import('../utils/errorReporting/sessionReplay.js' as string)
        .then(({ autoEnableSessionReplayIfFlagged }) => autoEnableSessionReplayIfFlagged())
        .catch((e) => console.debug('[ecbyts] sessionReplay skipped:', e?.message));
    markPhase('preflight:done');
    return { aborted: false };
}
