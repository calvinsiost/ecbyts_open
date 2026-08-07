// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Z_INDEX canonical constants — single source of truth para JS inline assignments.
// Espelha tabela canônica em CLAUDE.md §"Panel System & Layout" (z-index map).
//
// USO:
//   import { Z_INDEX } from '../ui/zIndex.js';
//   el.style.zIndex = String(Z_INDEX.ASYNC_DIALOG);
//
// Adicionar valor canônico aqui SOMENTE se for adicionado também ao mapa CLAUDE.md.
// EXCEPTIONS — valores fora do mapa canônico por necessidade técnica.
// Adicionar entrada EXCEPTION_* requer comentário inline explicando WHY.

export const Z_INDEX = Object.freeze({
    // Internal label/overlay stacking (sub-component scope)
    LABEL_LEADER_CANVAS: 1,
    LABEL_DEFAULT: 2,
    OVERLAY_CONSTELLATION: 5,

    // Layout core (CLAUDE.md mapa canônico)
    CONSTELLATION_DOCKED: 15,
    CONSTELLATION_RESIZE_TOP: 20,
    MIN_TABS: 50,

    // Floating elements
    PANEL_FLOATING: 200,
    FLOAT_RESIZE: 210,
    LLM_CHAT: 250,
    PANEL_CONTEXT_MENU: 300,

    // Overlays / modals
    GLOBE_CONTEXT_MENU: 1000,
    MAP_PICKER: 8500,
    ASYNC_DIALOG: 9000,
    EXCEPTION_LMS_LESSON_OVERLAY: 9002, // lição do LMS aberta a partir do training-panel (9001) — precisa ficar
    // ACIMA do próprio painel que a originou (bug real 2026-07-03: clicar "Continuar" dentro do painel
    // criava o overlay em ASYNC_DIALOG=9000, atrás do training-panel=9001, e a lição nunca aparecia).
    TOUR_PORTAL: 9500,
    WELCOME: 9998,
    DISCLAIMER: 9999,
    EXCEPTION_LMS_AUTHORING_MODAL: 9800, // lmsAuthoring visual class overlay between tour and welcome layers

    // EXCEPTIONS (justified off-canonical-map)
    EXCEPTION_AERIAL_ANNOTATION_MENU: 1100, // aerial.js annotation menu — overlays AERIAL_LAYER (1000)
    EXCEPTION_PRESENTATION_STEP_MODAL: 9700, // presentationModal step UI — entre TOUR_PORTAL e WELCOME
    EXCEPTION_TOUR_ELEVATED_TARGET: 10001, // tour highlight elevation — acima DISCLAIMER por design
    EXCEPTION_CANVAS_CONTEXT_MENU: 10050, // canvasContextMenu — acima de elevated tour targets
    EXCEPTION_LLM_CHAT_FAB_MENU: 10100, // llmChat FAB menu — sempre on top (floating action button)
    EXCEPTION_GUEST_MODE_BANNER: 10100, // guestGate badge "Modo Convidado" — topo do tier documentado
    // (== MAX_ZINDEX do gate css-zindex-audit). Precisa ficar acima de welcome (9998), disclaimer (9999)
    // e dos modais de auth, porque explica JUSTAMENTE por que o login está desligado enquanto esses
    // porteiros estão na tela. Empata com o FAB do llmChat sem conflito: canto oposto (bottom-left) e
    // `pointer-events:none` — nunca intercepta clique. Antes era 2147483000 (max-int defensivo, fora
    // do mapa) — rebaixado 2026-08-06 para dentro do mapa canônico.
    EXCEPTION_TERMS_ACCEPTANCE_GATE: 10100, // #terms-acceptance-modal (EARLY-ADOPTER-LAUNCH-READINESS
    // #tos-oauth-consent). Mesmo teto documentado do tier 7. É o PORTEIRO DA SESSÃO: decide se a sessão
    // existe, então tem de ficar acima de welcome (9998), disclaimer (9999) e dos modais de auth — o
    // mesmo argumento do banner de Modo Convidado. Não empata em conflito real: enquanto ele está na
    // tela a sessão não foi liberada, logo nem FAB do llmChat nem badge de convidado estão ativos.

    // D1 sweep 2026-05-29 — sites com literal antes do token canônico
    EXCEPTION_NATIVE_CHART_TOOLTIP: 2, // datastudio/nativeChart tooltip — só acima do canvas próprio
    EXCEPTION_CONSTELLATION_WEBGL_DIV: 10, // constellationWebGL inner div — acima LABEL_DEFAULT (2), abaixo CONSTELLATION_DOCKED (15)
    EXCEPTION_MOBILE_TOOLBAR: 700, // mobileMenu toolbar — entre PANEL_CONTEXT_MENU (300) e MAP_PICKER (8500)
    // EXCEPTION_CMD_PALETTE_FAB removido 2026-06-17 (PALETTE-IN-HUD): FAB ⌘K
    // migrou para o scene HUD (#palette-toggle-btn, herda .scene-hud-btn).
    EXCEPTION_NOTIFICATION_PANEL: 1000, // notificationInbox panel — alinhado a GLOBE_CONTEXT_MENU tier
    EXCEPTION_NOTIFICATION_MENU: 2000, // notificationInbox menu — overlays own panel (1000) sem invadir MAP_PICKER (8500)
});
