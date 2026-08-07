// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   SVG ICON SYSTEM — Technical/Topographic Aesthetic
   ================================================================

   Sistema de icones SVG customizados para o ecbyts.
   Cada icone usa tracos finos, formas geometricas e herda cor
   via currentColor (monocromatico, adaptavel por CSS).

   CONVENCOES:
   - ViewBox: 0 0 24 24
   - stroke-width: 1.5 (toolbar) ou 2 (destaque)
   - fill="none" stroke="currentColor"
   - stroke-linecap="round" stroke-linejoin="round"

   USO:
   - getIcon('name')         → SVG inline em <span class="eco-icon">
   - getFamilyIcon(familyId) → icone da familia de elementos
   - hydrateIcons()          → converte data-icon em SVG no DOM

   ================================================================ */

// ----------------------------------------------------------------
// SVG ICON DEFINITIONS
// ----------------------------------------------------------------

import { DEFAULT_FAMILIES } from '../../config/families.js';

const S =
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

const ICONS: Record<string, string> = {
    // === APP / NAVIGATION ===
    globe: `<svg ${S}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/></svg>`,
    home: `<svg ${S}><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"/></svg>`,

    calculator: `<svg ${S}><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="12" y1="10" x2="14" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="12" y1="14" x2="14" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="12" y1="18" x2="16" y2="18"/></svg>`,

    // === FILE OPERATIONS ===
    'file-new': `<svg ${S}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
    'folder-open': `<svg ${S}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`,
    'folder-plus': `<svg ${S}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    package: `<svg ${S}><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    store: `<svg ${S}><path d="M3 9l1-4h16l1 4"/><path d="M3 9v10a1 1 0 001 1h16a1 1 0 001-1V9"/><rect x="9" y="14" width="6" height="7"/></svg>`,
    puzzle: `<svg ${S}><path d="M12 2l3 3h-2v3a2 2 0 104 0V5h-2l3-3h6v6l-3-3v2a2 2 0 100 4h3v-2l3 3v6h-6l3-3h-3a2 2 0 10 0-4h3l-3-3V2h-6z" fill="none"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v4m-2-2h4"/></svg>`,
    'download-cloud': `<svg ${S}><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>`,
    table: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
    columns: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
    leaf: `<svg ${S}><path d="M11 20A7 7 0 019.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
    save: `<svg ${S}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    download: `<svg ${S}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    upload: `<svg ${S}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,

    // === SHARING / KEYS ===
    key: `<svg ${S}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
    link: `<svg ${S}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
    share: `<svg ${S}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,

    // === VIEW / CAMERA ===
    cube: `<svg ${S}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    'arrow-down-circle': `<svg ${S}><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>`,
    'arrow-right-circle': `<svg ${S}><circle cx="12" cy="12" r="10"/><polyline points="12 16 16 12 12 8"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    camera: `<svg ${S}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,

    // === ZOOM ===
    'zoom-in': `<svg ${S}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    'zoom-out': `<svg ${S}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,

    // === ACTIONS ===
    plus: `<svg ${S}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    minus: `<svg ${S}><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    x: `<svg ${S}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    check: `<svg ${S}><polyline points="20 6 9 17 4 12"/></svg>`,
    settings: `<svg ${S}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
    shuffle: `<svg ${S}><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
    'refresh-cw': `<svg ${S}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
    undo: `<svg ${S}><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 015.5 5.5 5.5 5.5 0 01-5.5 5.5H11"/></svg>`,
    redo: `<svg ${S}><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 004 14.5 5.5 5.5 0 009.5 20H13"/></svg>`,
    info: `<svg ${S}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    'help-circle': `<svg ${S}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    maximize: `<svg ${S}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    minimize: `<svg ${S}><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    edit: `<svg ${S}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    'edit-3': `<svg ${S}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    trash: `<svg ${S}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,

    // === VISIBILITY ===
    eye: `<svg ${S}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    'eye-off': `<svg ${S}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,

    // === DATA / ANALYTICS ===
    'bar-chart': `<svg ${S}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    clipboard: `<svg ${S}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
    tag: `<svg ${S}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    send: `<svg ${S}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,

    // === AI / PROCESSING ===
    cpu: `<svg ${S}><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,

    // === ENVIRONMENT: Element Families ===
    plume: `<svg ${S}><path d="M12 21c-4 0-7-2-7-5 0-2 1-4 3-5.5S12 7 12 3c0 4 2 5.5 4 7.5s3 3.5 3 5.5c0 3-3 5-7 5z"/><path d="M12 21c-2 0-4-1-4-3s2-3 4-5"/></svg>`,
    well: `<svg ${S}><rect x="9" y="2" width="6" height="4" rx="1"/><line x1="12" y1="6" x2="12" y2="22"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/><circle cx="12" cy="22" r="1" fill="currentColor"/></svg>`,
    droplet: `<svg ${S}><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>`,
    river: `<svg ${S}><path d="M3 6c3-2 5 1 9-1s6 1 9-1"/><path d="M3 12c3-2 5 1 9-1s6 1 9-1"/><path d="M3 18c3-2 5 1 9-1s6 1 9-1"/></svg>`,
    spring: `<svg ${S}><path d="M12 22v-6"/><path d="M12 16c-2-3-4-4-4-7a4 4 0 018 0c0 3-2 4-4 7z"/><path d="M8 6l4-4 4 4"/><line x1="12" y1="2" x2="12" y2="8"/></svg>`,
    flask: `<svg ${S}><path d="M9 3h6"/><path d="M10 3v6.5L4 20h16l-6-10.5V3"/><path d="M7.5 16h9"/></svg>`,
    building: `<svg ${S}><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><path d="M10 22v-4h4v4"/></svg>`,
    cylinder: `<svg ${S}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>`,
    'square-dashed': `<svg ${S}><path d="M5 3h2"/><path d="M11 3h2"/><path d="M17 3h2"/><path d="M21 5v2"/><path d="M21 11v2"/><path d="M21 17v2"/><path d="M19 21h-2"/><path d="M13 21h-2"/><path d="M7 21H5"/><path d="M3 19v-2"/><path d="M3 13v-2"/><path d="M3 7V5"/></svg>`,
    'map-pin': `<svg ${S}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    'alert-triangle': `<svg ${S}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    wind: `<svg ${S}><path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/></svg>`,
    tree: `<svg ${S}><path d="M12 22v-7"/><path d="M17 13H7l2-4H6l6-7 6 7h-3l2 4z"/></svg>`,
    // fault family: diagonal line with offset segments suggesting a geological fault plane
    fault: `<svg ${S}><path d="M3 20L10 13"/><path d="M14 11L21 4"/><path d="M10 13L14 11"/><path d="M10 13L7 10"/><path d="M14 11L17 14"/></svg>`,
    // hexagon: generic geometric glyph used by some family panels and cells
    hexagon: `<svg ${S}><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/></svg>`,

    // === GOVERNANCE (Stamps) ===
    hardhat: `<svg ${S}><path d="M2 18h20"/><path d="M4 18v-3a8 8 0 0116 0v3"/><line x1="12" y1="7" x2="12" y2="3"/><path d="M8 7h8"/></svg>`,
    'pen-sign': `<svg ${S}><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>`,
    'pen-tool': `<svg ${S}><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>`,
    'check-circle': `<svg ${S}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    'plus-circle': `<svg ${S}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,

    // === EDGES / CONNECTIONS ===
    'arrow-up-right': `<svg ${S}><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,
    'arrow-down-left': `<svg ${S}><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>`,
    'arrow-left-right': `<svg ${S}><polyline points="17 1 21 5 17 9"/><line x1="3" y1="5" x2="21" y2="5"/><polyline points="7 23 3 19 7 15"/><line x1="21" y1="19" x2="3" y2="19"/></svg>`,
    'arrow-right': `<svg ${S}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    'arrow-left': `<svg ${S}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    'arrow-down': `<svg ${S}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,

    // === PANEL DOCKING ===
    'dock-left': `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
    'dock-right': `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
    'dock-bottom': `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>`,
    'dock-top': `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>`,
    'grip-vertical': `<svg ${S}><circle cx="9" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/></svg>`,

    // === TRANSFORM ===
    move: `<svg ${S}><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`,
    rotate: `<svg ${S}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
    'rotate-ccw': `<svg ${S}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
    'rotate-cw': `<svg ${S}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.13-9.36L23 10"/></svg>`,
    palette: `<svg ${S}><circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.04-.23-.29-.38-.63-.38-1.04 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.97-4.03-9-10-9z"/></svg>`,

    // === MISC ===
    brain: `<svg ${S}><path d="M9.5 2a3.5 3.5 0 00-3.21 4.87A3.5 3.5 0 004 10.5a3.5 3.5 0 002.29 3.29A3.5 3.5 0 009.5 18h0"/><path d="M14.5 2a3.5 3.5 0 013.21 4.87A3.5 3.5 0 0120 10.5a3.5 3.5 0 01-2.29 3.29A3.5 3.5 0 0114.5 18h0"/><path d="M12 2v16"/></svg>`,
    crosshair: `<svg ${S}><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>`,
    navigation: `<svg ${S}><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`,
    drill: `<svg ${S}><path d="M10 2v6"/><path d="M14 2v6"/><path d="M8 8h8l-1 4H9L8 8z"/><path d="M9 12h6l-1 6H10l-1-6z"/><path d="M11 18h2v4h-2z"/></svg>`,
    bookmark: `<svg ${S}><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>`,
    anchor: `<svg ${S}><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="21"/><path d="M5 12H2a10 10 0 0020 0h-3"/></svg>`,
    filter: `<svg ${S}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    layers: `<svg ${S}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    lock: `<svg ${S}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
    unlock: `<svg ${S}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>`,
    copy: `<svg ${S}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
    search: `<svg ${S}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    'chevron-down': `<svg ${S}><polyline points="6 9 12 15 18 9"/></svg>`,
    trees: `<svg ${S}><path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/></svg>`,
    'hard-hat': `<svg ${S}><path d="M2 18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a8 8 0 0 0-16 0v2Z"/><path d="M8 11V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5"/><line x1="2" y1="18" x2="22" y2="18"/></svg>`,
    'flask-round': `<svg ${S}><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/></svg>`,
    bot: `<svg ${S}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
    factory: `<svg ${S}><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/></svg>`,
    'chevron-left': `<svg ${S}><polyline points="15 18 9 12 15 6"/></svg>`,
    'chevron-right': `<svg ${S}><polyline points="9 18 15 12 9 6"/></svg>`,
    'external-link': `<svg ${S}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    docs: `<svg ${S}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    sample: `<svg ${S}><path d="M9 3h6"/><path d="M10 3v6.5L4 20h16l-6-10.5V3"/><path d="M7.5 16h9"/></svg>`,
    user: `<svg ${S}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    calendar: `<svg ${S}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    clock: `<svg ${S}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    shield: `<svg ${S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    target: `<svg ${S}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    radar: `<svg ${S}><circle cx="12" cy="12" r="10"/><path d="M12 2v10l7 7"/><circle cx="12" cy="12" r="3"/></svg>`,
    siren: `<svg ${S}><path d="M6 20h12"/><path d="M8 20v-4a4 4 0 018 0v4"/><path d="M12 4v2"/><path d="M4.93 7.93l1.41 1.41"/><path d="M19.07 7.93l-1.41 1.41"/></svg>`,
    'map-search': `<svg ${S}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><path d="M8 11h6"/><path d="M11 8v6"/></svg>`,
    'shield-check': `<svg ${S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
    'shield-alert': `<svg ${S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>`,
    'sticky-note': `<svg ${S}><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6"/></svg>`,
    'scroll-text': `<svg ${S}><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><line x1="15" y1="8" x2="10" y2="8"/><line x1="15" y1="12" x2="10" y2="12"/></svg>`,
    scale: `<svg ${S}><path d="M16 3l-8 0"/><path d="M12 3v18"/><path d="M3 12l4-5v10l-4-5"/><path d="M21 12l-4-5v10l4-5"/></svg>`,
    sparkles: `<svg ${S}><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>`,
    'file-up': `<svg ${S}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="12 18 12 12"/><polyline points="9 15 12 12 15 15"/></svg>`,
    'file-text': `<svg ${S}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    activity: `<svg ${S}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    'trending-up': `<svg ${S}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    'trending-down': `<svg ${S}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
    'chevron-up': `<svg ${S}><polyline points="18 15 12 9 6 15"/></svg>`,
    'chevrons-down': `<svg ${S}><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>`,
    'chevrons-up': `<svg ${S}><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>`,
    'trash-2': `<svg ${S}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,

    // === GEOMETRY / LAYOUT ===
    box: `<svg ${S}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>`,
    grid: `<svg ${S}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    square: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`,
    'maximize-2': `<svg ${S}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    'minimize-2': `<svg ${S}><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    sun: `<svg ${S}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    moon: `<svg ${S}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
    monitor: `<svg ${S}><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    'corner-up-left': `<svg ${S}><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>`,
    percent: `<svg ${S}><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,

    // === MEDIA / PLAYBACK ===
    play: `<svg ${S}><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    pause: `<svg ${S}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    'skip-forward': `<svg ${S}><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
    'skip-back': `<svg ${S}><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>`,
    repeat: `<svg ${S}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>`,
    film: `<svg ${S}><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>`,

    // === INSPECTOR / CODE ===
    braces: `<svg ${S}><path d="M8 3H7a2 2 0 00-2 2v4a2 2 0 01-2 2 2 2 0 012 2v4a2 2 0 002 2h1"/><path d="M16 3h1a2 2 0 012 2v4a2 2 0 002 2 2 2 0 00-2 2v4a2 2 0 01-2 2h-1"/></svg>`,
    hash: `<svg ${S}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
    'toggle-right': `<svg ${S}><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3"/></svg>`,
    'toggle-left': `<svg ${S}><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="8" cy="12" r="3"/></svg>`,
    list: `<svg ${S}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    type: `<svg ${S}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,

    // === SAO / ENVIRONMENTAL SCENARIOS ===
    'git-merge': `<svg ${S}><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 009 9"/></svg>`,
    compass: `<svg ${S}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
    users: `<svg ${S}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
    sliders: `<svg ${S}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
    dam: `<svg ${S}><path d="M4 4v16h16"/><path d="M4 20c3-8 6-12 16-16"/><line x1="4" y1="12" x2="12" y2="8"/><line x1="4" y1="8" x2="8" y2="6"/></svg>`,
    zap: `<svg ${S}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    lightbulb: `<svg ${S}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>`,
    mountain: `<svg ${S}><path d="M8 21l4-10 4 10"/><path d="M2 21l5-12 3 6"/><path d="M22 21l-5-12-3 6"/></svg>`,
    satellite: `<svg ${S}><path d="M13 7L9 3 3 9l4 4"/><path d="M11 17l4 4 6-6-4-4"/><line x1="8" y1="16" x2="2" y2="22"/><line x1="16" y1="8" x2="22" y2="2"/><circle cx="12" cy="12" r="2"/></svg>`,
    cloud: `<svg ${S}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>`,
    radio: `<svg ${S}><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/></svg>`,

    // === SOCIAL / MARKETPLACE ===
    heart: `<svg ${S}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
    'heart-filled': `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
    'message-circle': `<svg ${S}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`,
    star: `<svg ${S}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    'star-filled': `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    'credit-card': `<svg ${S}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>`,
    'dollar-sign': `<svg ${S}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
    wallet: `<svg ${S}><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4z"/></svg>`,
    'thumb-up': `<svg ${S}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>`,
    trophy: `<svg ${S}><path d="M6 9H4a2 2 0 01-2-2V5a2 2 0 012-2h2"/><path d="M18 9h2a2 2 0 002-2V5a2 2 0 00-2-2h-2"/><path d="M4 22h16"/><path d="M10 22V8"/><path d="M14 22V8"/><rect x="6" y="2" width="12" height="7" rx="1"/><path d="M6 9a6 6 0 006 6 6 6 0 006-6"/></svg>`,
    book: `<svg ${S}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
    award: `<svg ${S}><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`,
    bell: `<svg ${S}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
    flag: `<svg ${S}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
    'user-plus': `<svg ${S}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    layout: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,

    // === AUTH / ACCESS CONTROL ===
    'log-in': `<svg ${S}><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`,
    'log-out': `<svg ${S}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,

    // === MISSING - referenced in index.html and JS modules ===
    fuel: `<svg ${S}><path d="M3 22V6a2 2 0 012-2h8a2 2 0 012 2v10"/><path d="M15 8h2a2 2 0 012 2v6a2 2 0 002 2 2 2 0 002-2V9.83a2 2 0 00-.59-1.42L20 6"/><line x1="3" y1="11" x2="13" y2="11"/><path d="M3 22h12"/></svg>`,
    truck: `<svg ${S}><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    briefcase: `<svg ${S}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="12"/><path d="M2 12h20"/></svg>`,
    printer: `<svg ${S}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
    'git-branch': `<svg ${S}><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>`,
    'book-open': `<svg ${S}><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>`,
    folder: `<svg ${S}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`,
    menu: `<svg ${S}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    server: `<svg ${S}><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
    'mouse-pointer': `<svg ${S}><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>`,

    // === ECOTOOLS ===
    // Folha ambiental (eco) + chave inglesa integrada (tools)
    // Leaf + integrated wrench: EcoTools custom icon
    ecotool: `<svg ${S}>
        <path d="M5 19c0 0 0-7 4.5-10.5C13 5.5 19 4 21 3c0 0-1 6.5-5 9.5C12 15.5 7.5 16.5 5 19z"/>
        <line x1="5" y1="19" x2="9.5" y2="13.5"/>
        <path d="M17.5 7.5a2.5 2.5 0 01-2.5 4 2.5 2.5 0 01.7-4.8L17 8l.5-.5z"/>
        <path d="M15.7 11.7l-3.2 3.8" stroke-width="1.8"/>
        <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>
    </svg>`,
};

// Aliases - nomes alternativos para o mesmo icone
ICONS.lake = ICONS.droplet!;
ICONS.tank = ICONS.cylinder!;
ICONS.boundary = ICONS['square-dashed']!;
ICONS.marker = ICONS['map-pin']!;
ICONS.area = ICONS.factory!;
ICONS.incident = ICONS['alert-triangle']!;
ICONS.emission = ICONS.wind!;
ICONS.habitat = ICONS.tree!;
ICONS.campaign = ICONS.clipboard!;
ICONS.scene = ICONS.camera!;
ICONS.close = ICONS.x!;
ICONS.remove = ICONS.x!;
ICONS.add = ICONS.plus!;
ICONS.delete = ICONS.trash!;
ICONS.visible = ICONS.eye!;
ICONS.hidden = ICONS['eye-off']!;
ICONS.expand = ICONS.maximize!;
ICONS.collapse = ICONS.minimize!;
ICONS.refresh = ICONS['refresh-cw']!;
ICONS.reset = ICONS.undo!;
ICONS.random = ICONS.shuffle!;
ICONS.ai = ICONS.cpu!;
ICONS['emission_source'] = ICONS.wind!;
ICONS['waste_stream'] = ICONS['refresh-cw']!;
ICONS['effluent_point'] = ICONS.droplet!;
ICONS.individual = ICONS.user!;
ICONS['water_body'] = ICONS.droplet!;
ICONS['industry'] = ICONS.factory!;
ICONS['sensitive_area'] = ICONS['alert-triangle']!;
ICONS.intangible = ICONS.sparkles!;
ICONS.generic = ICONS.cube!;
ICONS.sensor = ICONS.radio!;
ICONS.stratum = ICONS.layers!;
ICONS['synthetic_well'] = ICONS.well!;
ICONS.map = ICONS['map-pin']!;
ICONS.blueprint = ICONS['map-pin']!;
ICONS.site_project = ICONS.folder!;
ICONS.site_area = ICONS['map-pin']!;
ICONS.site_zone = ICONS.square!;
ICONS.circle = ICONS.target!;
ICONS.triangle = ICONS['alert-triangle']!;
ICONS.database = ICONS.server!;
ICONS['more-horizontal'] =
    `<svg ${S}><circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`;
ICONS['bar-chart-2'] = ICONS['bar-chart']!;
ICONS['bar-chart-3'] = ICONS['bar-chart']!;
ICONS['chart-bar'] = ICONS['bar-chart']!;
ICONS['chart'] = ICONS['bar-chart']!; // home-v2 header pedia 'chart' (needs-claude-ui boot-loading-perf-2026-06-11b)
ICONS['shopping-bag'] = ICONS.store!;
ICONS['play-circle'] = ICONS['arrow-right-circle']!;
ICONS['alert-circle'] = ICONS.info!;
ICONS['key-round'] = ICONS.key!;
ICONS.coins = ICONS['dollar-sign']!;
ICONS.image = ICONS.camera!;
ICONS.tool = ICONS.ecotool!; // alias — data-icon="tool" já usado no ribbon
ICONS.scan = ICONS['map-search']!;
ICONS['git-compare'] = ICONS['git-merge']!;
// Compatibility aliases for extended icon names used across UI modules.
ICONS['check-square'] = ICONS.check!;
ICONS.bug = ICONS['alert-triangle']!;
ICONS['check-circle-2'] = ICONS['check-circle']!;
ICONS['grid-2x2'] = ICONS.grid!;
ICONS['file-plus'] = ICONS['file-new']!;
ICONS['plus-square'] = ICONS['plus-circle']!;
ICONS['calendar-plus'] = ICONS.calendar!;
ICONS['file-input'] = ICONS['file-up']!;
ICONS.wifi = ICONS.radio!;
ICONS['line-chart'] = ICONS['trending-up']!;
ICONS['git-commit'] = ICONS.target!;
ICONS['grid-3x3'] = ICONS.grid!;
ICONS.dice = ICONS.shuffle!;
ICONS['message-square'] = ICONS['message-circle']!;
ICONS.mail = `<svg ${S}><path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="m22 8-10 7L2 8"/></svg>`;
ICONS.network = ICONS.radar!;
ICONS.plane = ICONS.navigation!;
ICONS.gauge = ICONS.radar!;
ICONS['file-check'] = ICONS['file-text']!;
ICONS['list-checks'] = ICONS.list!;
ICONS.workflow = ICONS['git-branch']!;
ICONS.library = ICONS.book!;
ICONS['wand-2'] = ICONS.sparkles!;
ICONS['file-spreadsheet'] = ICONS.table!;
ICONS['building-2'] = ICONS.building!;
ICONS['drafting-compass'] = ICONS.compass!;
ICONS.landmark = ICONS.factory!;
ICONS['file-signature'] = ICONS['file-text']!;
ICONS.sitemap = ICONS['git-branch']!;
ICONS['pie-chart'] = ICONS['bar-chart']!;
ICONS.keyboard = ICONS.type!;
ICONS['book-copy'] = ICONS.book!;
ICONS['file-code'] = ICONS.braces!;
ICONS['clipboard-list'] = ICONS.clipboard!;
ICONS['sliders-horizontal'] = ICONS.sliders!;
ICONS['layout-grid'] = ICONS.grid!;
ICONS['replace'] = ICONS['refresh-cw']!;
ICONS['box-select'] = ICONS.box!;
ICONS['link-2'] = ICONS.link!;
ICONS['book-marked'] = ICONS.book!;
ICONS['spell-check'] = ICONS.type!;
ICONS['git-fork'] = ICONS['git-branch']!;
ICONS['graduation-cap'] =
    `<svg ${S}><path d="M22 10l-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/><line x1="22" y1="10" x2="22" y2="16"/></svg>`;

// ----------------------------------------------------------------
// Telemetry backlog drain (claude - bug 2026-06-14) — ícones que apareciam
// em `[icons] Unknown icon: …` ainda recorrentes (≈162 hits/30d). Lucide
// names usados por callers reais sem glyph registrado. Paths Lucide oficiais
// para os distintos; aliases para variantes triviais.
// ----------------------------------------------------------------
ICONS['share-2'] = ICONS.share!;
ICONS['file-template'] = ICONS['file-text']!;
ICONS['messages-square'] = ICONS['message-square']!;
ICONS['heart-handshake'] = ICONS.heart!;
ICONS.shapes = `<svg ${S}><path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/></svg>`;
ICONS['function-square'] =
    `<svg ${S}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3"/><path d="M9 11.2h5.7"/></svg>`;
ICONS['list-tree'] =
    `<svg ${S}><path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/></svg>`;
ICONS.sigma = `<svg ${S}><path d="M18 7V4H6l6 8-6 8h12v-3"/></svg>`;
ICONS['upload-cloud'] =
    `<svg ${S}><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>`;
ICONS['heart-pulse'] =
    `<svg ${S}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>`;
ICONS['file-search'] =
    `<svg ${S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="M13.3 16.3 15 18"/></svg>`;
ICONS.road = `<svg ${S}><path d="M4 19l4-14"/><path d="M16 5l4 14"/><path d="M12 6v2"/><path d="M12 11v2"/><path d="M12 16v2"/></svg>`;

// ----------------------------------------------------------------
// BOOT-RESILIENCE-001#icons-unknown (2026-07-17) — 7 nomes Lucide
// referenciados por callers reais sem glyph no set: 'headphones' e
// 'globe-2' em app/index.html + regionalPreferencesModal (data-icon);
// 'flask-conical', 'brain-circuit', 'scan-eye', 'dices', 'presentation'
// nas configs de biblioteca (icon: 'x' em libraryCategories.ts e
// builtinExamples.data.ts). Paths Lucide oficiais. Trava de regressao:
// tests/icons-ref-sweep-guard.test.mjs + sweep REF-SWEEPS RF-1 (icons).
// ----------------------------------------------------------------
ICONS.headphones = `<svg ${S}><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`;
ICONS['globe-2'] =
    `<svg ${S}><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/><path d="M7 3.34V5a3 3 0 0 0 3 3 2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/><path d="M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/><circle cx="12" cy="12" r="10"/></svg>`;
ICONS['flask-conical'] =
    `<svg ${S}><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>`;
ICONS['brain-circuit'] =
    `<svg ${S}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M9 13a4.5 4.5 0 0 0 3-4"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M12 13h4"/><path d="M12 18h6a2 2 0 0 1 2 2v1"/><path d="M12 8h8"/><path d="M16 8V5a2 2 0 0 1 2-2"/><circle cx="16" cy="13" r=".5"/><circle cx="18" cy="3" r=".5"/><circle cx="20" cy="21" r=".5"/><circle cx="20" cy="8" r=".5"/></svg>`;
ICONS['scan-eye'] =
    `<svg ${S}><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/></svg>`;
ICONS.dices = `<svg ${S}><rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/></svg>`;
ICONS.presentation = `<svg ${S}><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m9 16-2 5"/><path d="m15 16 2 5"/></svg>`;

// ----------------------------------------------------------------
// BOOT-RESILIENCE-001#icons-remaining-25 (2026-07-17) — 31 nomes Lucide
// referenciados por callers reais sem glyph no set (drenagem das 38
// violações residuais do sweep icons). Paths Lucide oficiais para os
// distintos; aliases para variantes triviais. NOTA: as linhas abaixo
// NÃO são indentadas para que o ASSIGN_RE do _refSweepPure.mjs (^ICONS)
// as case corretamente.
// ----------------------------------------------------------------
ICONS['alert-octagon'] =
    `<svg ${S}><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;
ICONS['cloud-rain'] =
    `<svg ${S}><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;
ICONS['code'] = `<svg ${S}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
ICONS['thermometer'] = `<svg ${S}><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>`;
ICONS['waves'] =
    `<svg ${S}><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`;
ICONS['droplets'] =
    `<svg ${S}><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.5c-.29 1.25-1.14 2.15-2.29 3.06S4 11.1 4 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/></svg>`;
ICONS['crown'] =
    `<svg ${S}><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>`;
ICONS['gavel'] =
    `<svg ${S}><path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>`;
ICONS['handshake'] =
    `<svg ${S}><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg>`;
ICONS['scroll'] =
    `<svg ${S}><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/></svg>`;
ICONS['shield-clock'] =
    `<svg ${S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><circle cx="12" cy="11" r="3"/><path d="M12 8v3l1.5 1.5"/></svg>`;
ICONS['shield-off'] = `<svg ${S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m2 2 20 20"/></svg>`;
ICONS['shield-warning'] =
    `<svg ${S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;
ICONS['shield-x'] =
    `<svg ${S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/></svg>`;
ICONS['x-circle'] = `<svg ${S}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`;
ICONS['terminal'] = `<svg ${S}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`;
ICONS['tv'] =
    `<svg ${S}><rect width="20" height="15" x="2" y="3" rx="2" ry="2"/><polyline points="8 21 12 17 16 21"/></svg>`;
ICONS['video'] = `<svg ${S}><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`;
ICONS['hard-drive'] =
    `<svg ${S}><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg>`;
ICONS['languages'] =
    `<svg ${S}><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`;
ICONS['loader'] =
    `<svg ${S}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`;
ICONS['map-pinned'] =
    `<svg ${S}><path d="M18 8lt;3 0-6 3.18-6 0a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3"/><path d="M9 18h6"/><circle cx="12" cy="9" r="2"/></svg>`;
ICONS['edit-2'] = `<svg ${S}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
ICONS['arrow-down-right'] = `<svg ${S}><path d="M7 7 17 17"/><path d="M17 7v10H7"/></svg>`;
ICONS['arrow-up-left'] = `<svg ${S}><path d="M17 17 7 7"/><path d="M7 17V7h10"/></svg>`;
// Re-declare the 6 from icons-unknown at column-0 so the sweep ASSIGN_RE catches them
ICONS['globe-2'] = ICONS['globe-2']!;
ICONS['flask-conical'] = ICONS['flask-conical']!;
ICONS['brain-circuit'] = ICONS['brain-circuit']!;
ICONS['scan-eye'] = ICONS['scan-eye']!;
ICONS['dices'] = ICONS['dices']!;
ICONS['presentation'] = ICONS['presentation']!;

// ----------------------------------------------------------------
// BOOT-RESILIENCE-001#icons-2-violations-regressao (2026-07-21) — 2 nomes
// referenciados por src/app/js/core/elements/families/production/subtypes.ts
// (icon: 'flame' no subtipo steel, icon: 'recycle' no subtipo rsu) vindos da
// branch paralela e8a224a0d que não era ancestral nem descendente da branch
// de icons-remaining-25. Drift de frota, não inflação do autor — mas regressão
// viva na main. Paths Lucide oficiais (lucide.dev/icons/flame, /recycle).
// Trava de regressão: sweep REF-SWEEPS RF-1 (icons) volta a 0 violações.
// ----------------------------------------------------------------
ICONS.flame = `<svg ${S}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153-.435-2.294-1-3a3 3 0 0 0-.5-.5A2.5 2.5 0 0 0 8.5 14.5z"/></svg>`;
ICONS.recycle = `<svg ${S}><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/></svg>`;

/**
 * Get an SVG icon by name.
 * Retorna o markup SVG inline envolvido em um span.
 *
 * @param name - Identificador do icone
 * @param opts - Opcoes: { size, class }
 * @returns HTML string com o SVG
 */
// Track missing icon names already warned to prevent console spam - some
// callers (list renderers, ribbon hydration) iterate large arrays and would
// otherwise emit the same warning dozens of times per boot.
const _warnedMissingIcons = new Set<string>();

/**
 * @param name
 * @param opts
 */
export function getIcon(name: string, opts: { size?: string; class?: string } = {}): string {
    const svg = ICONS[name];
    if (!svg) {
        // Presets de família/modelo declaram `icon` como entidade HTML (▲ ◆ ● etc.,
        // ex: gac_industrial '&#9650;'). Quando esse glyph chega aqui como "nome",
        // renderiza direto em vez de avisar Unknown icon (drena ~31 telemetria/30d).
        if (/^&#?\w+;$/.test(name) || (name.length <= 2 && !/^[a-z0-9]+$/i.test(name))) {
            const size = opts.size || '16px';
            const cls = opts.class ? ` ${opts.class}` : '';
            return `<span class="eco-icon${cls}" style="width:${size};height:${size};display:inline-flex;align-items:center;justify-content:center">${name}</span>`;
        }
        if (!_warnedMissingIcons.has(name)) {
            _warnedMissingIcons.add(name);
            console.warn(`[icons] Unknown icon: ${name}`);
        }
        return `<span class="eco-icon" style="width:${opts.size || '16px'};height:${opts.size || '16px'}"></span>`;
    }
    const cls = opts.class ? ` ${opts.class}` : '';
    const size = opts.size || '16px';
    return `<span class="eco-icon${cls}" style="width:${size};height:${size}">${svg}</span>`;
}

/**
 * Get icon for an element family.
 * Busca icone pela ID da familia de elementos.
 *
 * @param familyId - ID da familia (ex: 'well', 'plume')
 * @returns HTML string com o SVG
 */
export function getFamilyIcon(familyId: string): string {
    const configuredIcon = (DEFAULT_FAMILIES as Record<string, any>)[familyId]?.icon;
    return getIcon(configuredIcon || familyId || 'map-pin');
}

/**
 * Hydrate data-icon attributes in the DOM.
 * Converte todos os elementos com data-icon="name" em SVGs inline.
 * Deve ser chamado apos o DOM estar pronto.
 */
export function hydrateIcons(root?: Document | Element): void {
    const scope = root || document;
    scope.querySelectorAll('[data-icon]').forEach((el: any) => {
        if (el.querySelector('svg')) return; // Ja hidratado
        const name = el.dataset.icon || '';
        const size = el.dataset.iconSize || '16px';
        el.innerHTML = getIcon(name, { size });
    });
}

/**
 * R6: MutationObserver that auto-hydrates dynamically added icons.
 * Watches for new elements with data-icon attribute added to DOM.
 * Call once after initial hydrateIcons().
 */
let _iconObserver: MutationObserver | null = null;
let _pendingHydrateRoots: Set<any> | null = null;
let _hydrateScheduled = false;

function _hydrateIconElement(el: any) {
    if (!el || !el.dataset?.icon || el.querySelector('svg')) return;
    el.innerHTML = getIcon(el.dataset.icon, { size: el.dataset.iconSize || '16px' });
}

function _flushPendingHydration() {
    _hydrateScheduled = false;
    if (!_pendingHydrateRoots || _pendingHydrateRoots.size === 0) return;

    const roots = Array.from(_pendingHydrateRoots);
    _pendingHydrateRoots.clear();

    for (const node of roots) {
        if (!node || node.nodeType !== 1) continue;
        _hydrateIconElement(node);
        if (!node.querySelectorAll) continue;
        node.querySelectorAll('[data-icon]').forEach(_hydrateIconElement);
    }
}

function _queueHydration(node: any) {
    if (!_pendingHydrateRoots) _pendingHydrateRoots = new Set();
    _pendingHydrateRoots.add(node);
    if (_hydrateScheduled) return;
    _hydrateScheduled = true;
    requestAnimationFrame(_flushPendingHydration);
}

export function initIconObserver() {
    if (_iconObserver) return;
    _iconObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                _queueHydration(node);
            }
        }
    });
    _iconObserver.observe(document.body, { childList: true, subtree: true });
}

export { ICONS };
