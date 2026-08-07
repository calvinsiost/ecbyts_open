// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Generated from src/app/js/main/random-postboot.ts by TS-MIGRATION-001. Do not edit manually.
import { applyInterpolationPhase } from '../core/random/phase-interpolation.js';
function _getSceneOwner() {
    if (typeof window === 'undefined') return null;
    return window.__sceneOwner || null;
}
let _terrainRetryScheduled = false;
// Farol de terreno (geoStatusBeacon.ts) escuta estes eventos.
function _emitTerrainStatus(state: string, reason?: string) {
    try {
        window.dispatchEvent(new CustomEvent('ecbyts:terrain-status', { detail: { state, reason: reason || null } }));
    } catch (e: any) {
        console.debug('[ecbyts:init] terrain-status emit:', e?.message || e);
    }
}
async function _runAutoTerrain({ loadedFromURL, initConfig, initCallId, updateLoading, translate }: any) {
    if (loadedFromURL || initConfig.mode !== 'random' || !initConfig.autoTerrain) return;
    updateLoading(translate('loadingTerrain') || 'Loading terrain...', 94);
    console.debug('[ecbyts:init] random:auto-terrain:start', { callId: initCallId });
    _emitTerrainStatus('loading');
    try {
        const phaseResult = await applyInterpolationPhase({
            autoTerrain: true,
            // true desde 2026-06-11 (background pós-overlay): a cena 3D é
            // lazy — em background o terreno pode chegar antes dela; defer
            // espera o evento sceneReady (cap 10s) em vez de skipar.
            deferIfSceneNotReady: true,
        });
        if (phaseResult.skipped) {
            console.info('[ecbyts:init] random:auto-terrain:skipped', {
                callId: initCallId,
                reason: phaseResult.reason,
                durationMs: phaseResult.phaseDurationMs,
            });
            // Retry one-shot (fix 2026-06-11b): se o skip foi "cena não
            // pronta", o cap de 10s do defer descartava o terreno em
            // SILÊNCIO quando o boot termina fora da vista 3D (home/
            // launchpad — a cena lazy só inicializa quando o usuário entra
            // na 3D). Reagenda no evento sceneReady, uma única vez.
            if (!_terrainRetryScheduled && /scene (still )?not ready/i.test(String(phaseResult.reason || ''))) {
                _terrainRetryScheduled = true;
                _emitTerrainStatus('waiting-scene', phaseResult.reason);
                window.addEventListener(
                    'ecbyts:sceneReady',
                    () => {
                        // setTimeout: markSceneReady() dispara este evento ANTES
                        // de setInterpolationGroup no mesmo callback síncrono
                        // (scene-bootstrap.ts L16-18) — sem o defer, o retry
                        // falhava com "Interpolation group not available".
                        setTimeout(() => {
                            console.debug('[ecbyts:init] random:auto-terrain:retry (sceneReady)', { callId: initCallId });
                            void _runAutoTerrain({ loadedFromURL, initConfig, initCallId, updateLoading: () => {}, translate })
                                .catch((e: any) => console.debug('[ecbyts:init] auto-terrain retry:', e?.message || e));
                        }, 100);
                    },
                    { once: true },
                );
            } else {
                _emitTerrainStatus('skipped', phaseResult.reason);
            }
            return;
        }
        if (phaseResult.error) {
            console.warn('[ecbyts:init] random:auto-terrain:failed', {
                callId: initCallId,
                error: phaseResult.error.message,
                durationMs: phaseResult.phaseDurationMs,
            });
            _emitTerrainStatus('error', phaseResult.error.message);
            return;
        }
        console.debug('[ecbyts:init] random:auto-terrain:finish', {
            callId: initCallId,
            createdLayers: phaseResult.createdLayers,
            terrainOriginDelta: phaseResult.terrainOriginDelta,
            durationMs: phaseResult.phaseDurationMs,
        });
        _emitTerrainStatus('ok');
    } catch (err: any) {
        console.error('[ecbyts:init] random:auto-terrain:unexpected', {
            callId: initCallId,
            error: err?.message || String(err),
        });
        _emitTerrainStatus('error', err?.message || String(err));
    }
}
// BOOT-ENTRY-UX-001 / RF-E3: teto duro do gatilho do fade. waitForStableFrames
// já é o melhor sinal disponível de "primeiro paint real" (só conta frames
// depois que _lastRenderAt existe, i.e. pelo menos 1 renderer.render() real
// aconteceu, + N frames com scene.children.length estável — ver
// lifecycleOwner.ts:600-658). Mas seu timeoutMs interno (5000ms) é generoso
// demais para o boot geral: o app não deve ficar preso atrás do splash por
// 5s se o 3D estiver lento — dados pesados (terreno, etc.) já rodam em
// background DEPOIS do overlay sumir (ver _runAutoTerrain). Este cap
// (~1.8s) é o mecanismo de segurança do RF-E3: Promise.race entre o sinal
// real (stability) e um fallback — o que resolver primeiro dispara o fade.
const SCENE_STABILITY_HARD_CAP_MS = 1800;
async function _waitForSceneStability({ updateLoading, translate }: any) {
    const sceneOwner = _getSceneOwner();
    if (!sceneOwner) return;
    updateLoading(translate('stabilizingScene') || 'Stabilizing scene...', 97);
    try {
        const stability = await Promise.race([
            sceneOwner.waitForStableFrames({
                stableFrames: 3,
                timeoutMs: 5000,
                minElapsedMs: 300,
            }),
            new Promise((resolve) => {
                setTimeout(
                    () => resolve({ ok: false, reason: 'hard-cap', framesObserved: -1, childCount: -1 }),
                    SCENE_STABILITY_HARD_CAP_MS,
                );
            }),
        ]);
        console.debug('[ecbyts:init] scene-stability', stability);
    } catch (err: any) {
        console.debug('[ecbyts:init] waitForStableFrames error:', err?.message || err);
    }
}
/**
 * Aguarda 1 requestAnimationFrame após o sinal de estabilidade resolver.
 * Motivo: waitForStableFrames() resolve dentro do PRÓPRIO callback de rAF
 * (lifecycleOwner.ts:619) — o frame já foi commitado, mas encadear mais um
 * rAF garante que rodamos DEPOIS do paint do browser para esse frame (não
 * no meio dele), então o fade começa só quando o app já está
 * genuinamente na tela. Sem rAF disponível (ambiente sem DOM/testes), no-op.
 */
function _nextPaintTick(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'undefined') {
            resolve();
            return;
        }
        requestAnimationFrame(() => resolve());
    });
}
function _finishLoadingOverlay({ updateLoading, translate, stopLoadingTips }: any) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (!loadingOverlay) return;
    // BOOT-ENTRY-UX-001 RF-A1 (cline-glm 2026-07-08): sinaliza que o boot
    // concluiu. loading-gate.js (app/js/boot/) checa esta flag para decidir
    // se mostra o overlay — se o boot foi rápido (<250ms), o overlay nunca
    // aparece (Nielsen: <500ms não mostrar indicador).
    (window as any).__ecbytsBootDone = true;
    // BOOT-ENTRY-UX-001 RF-A3 (cline-glm 2026-07-10): cancela o gate temporal
    // da barra de progresso. Se o boot foi rápido (<600ms), a barra nunca
    // apareceu e o cancelamento garante que não apareça após o fade-out começar.
    // Import dinâmico para evitar circularidade no ciclo de boot.
    import('./startup-feedback.js')
        .then(({ cancelBootBarGate }) => cancelBootBarGate())
        .catch((e: any) => console.debug('[boot:rf-a3] cancelBootBarGate skipped:', e?.message || e));
    updateLoading(translate('ready') || 'Ready', 100);
    // BOOT-ENTRY-UX-001 / RF-E1 (CF-5): saída SEMPRE por fade suave, nunca
    // corte. Antes: opacity inline + setTimeout(remove, 400) fixo. Agora: a
    // mecânica do fade vive no CSS (.fade-out = opacity 0 em 280ms com easing
    // de saída acelerado cubic-bezier(0.4,0,1,1)) e a remoção é disparada por
    // `transitionend` — não por timer cosmético. Fallback setTimeout(350ms)
    // garante que o overlay não vaze caso o transitionend não dispare (ex.:
    // elemento sem transição efetiva, aba em background, reduce-motion ~1ms).
    // NOTA (RF-E3, outro agente): este handler cuida do COMO o fade acontece;
    // QUANDO ele é chamado (amarrar ao paint real) é escopo do RF-E3.
    let removed = false;
    const removeOverlay = () => {
        if (removed) return;
        removed = true;
        loadingOverlay.remove();
        stopLoadingTips();
    };
    loadingOverlay.addEventListener('transitionend', removeOverlay, { once: true });
    // BOOT-ENTRY-UX-001 RF-E5 (kimi-omni): colar os filhos ao fade do pai para
    // saírem como superfície única (sem micro-flash). A dica rotativa
    // (#loading-subtitle-tip) tem transition:opacity própria e injeta opacity=0
    // a cada 2,6s via startLoadingTips; se continuar rodando durante o fade, ela
    // some no seu próprio tempo (220ms) e descola do overlay (280ms). Paramos a
    // rotação ANTES do fade e deixamos a dica visível/sem transição própria —
    // ela passa a herdar o fade do container (reforçado pelo CSS
    // `#loading-overlay.fade-out > * { transition:none }`).
    stopLoadingTips();
    const loadingTip = document.getElementById('loading-subtitle-tip');
    if (loadingTip) {
        loadingTip.style.transition = 'none';
        loadingTip.style.opacity = '1';
    }
    loadingOverlay.classList.add('fade-out');
    // Fallback: se o transitionend não disparar, remove por segurança.
    setTimeout(removeOverlay, 350);
}
export async function runRandomPostbootSequence({
    loadedFromURL, initConfig, initCallId, updateLoading, translate, restoreInitForm, stopLoadingTips, setSaveStatus, showToast,
}: any) {
    restoreInitForm();
    // BOOT-ENTRY-UX-001 / RF-E3: gatilho do fade amarrado ao primeiro paint
    // real (waitForStableFrames, com teto duro de ~1.8s embutido acima) +
    // 1 requestAnimationFrame extra — não a um setTimeout fixo de dismiss.
    await _waitForSceneStability({ updateLoading, translate });
    await _nextPaintTick();
    _finishLoadingOverlay({ updateLoading, translate, stopLoadingTips });
    showToast(translate('modelReady'), 'success');
    setSaveStatus('idle', 'Pronto');
    // PERF boot-loading (claude - adm 2026-06-11, console real Calvin): o
    // auto-terrain custava 5,7s BLOQUEANDO o overlay (fetch de elevação remoto)
    // — era ~27% dos 21s de boot logado medidos. O terreno é camada progressiva
    // sobre um modelo já utilizável (terrainOriginDelta=0 no caso comum), então
    // roda em background DEPOIS de liberar a tela. updateLoading vira no-op
    // (overlay já removido); logs [ecbyts:init] random:auto-terrain:* mantidos.
    void _runAutoTerrain({
        loadedFromURL,
        initConfig,
        initCallId,
        updateLoading: () => {},
        translate,
    }).catch((e: any) => console.debug('[ecbyts:init] auto-terrain background:', e?.message || e));
}
