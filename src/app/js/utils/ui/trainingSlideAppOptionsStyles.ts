// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export const TRAINING_SLIDE_APP_OPTIONS_STYLE_MARKER = 'data-training-slide-app-options-styles';

export const TRAINING_SLIDE_APP_OPTIONS_STYLE_TEXT = `
.tsao-panel {
    border: 1px solid rgba(15, 23, 42, 0.14);
    border-radius: 8px;
    background: #fff;
    color: #172033;
    padding: 12px;
    display: grid;
    gap: 10px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}
.tsao-header {
    display: grid;
    gap: 3px;
}
.tsao-title {
    font-size: 15px;
    line-height: 1.25;
    font-weight: 700;
    margin: 0;
}
.tsao-subtitle {
    color: #475569;
    font-size: 12px;
    line-height: 1.35;
}
.tsao-guide {
    border: 1px solid rgba(14, 116, 144, 0.24);
    border-radius: 8px;
    background: #ecfeff;
    color: #164e63;
    display: grid;
    gap: 6px;
    margin-top: 4px;
    padding: 8px 10px;
}
.tsao-guide-title {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1;
    text-transform: uppercase;
}
.tsao-guide-list {
    display: grid;
    gap: 4px;
    margin: 0;
    padding-left: 18px;
}
.tsao-guide-list li {
    font-size: 12px;
    line-height: 1.35;
}
.tsao-list {
    display: grid;
    gap: 8px;
}
.tsao-card {
    border: 1px solid rgba(15, 23, 42, 0.16);
    border-radius: 6px;
    background: #ffffff;
    padding: 10px;
    display: grid;
    gap: 8px;
}
.tsao-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
}
.tsao-card-title {
    margin: 0;
    font-size: 14px;
    line-height: 1.25;
}
.tsao-chip {
    flex: 0 0 auto;
    border: 1px solid rgba(20, 83, 45, 0.34);
    border-radius: 999px;
    background: #dcfce7;
    color: #14532d;
    font-size: 11px;
    line-height: 1;
    padding: 4px 7px;
}
.tsao-description,
.tsao-meta,
.tsao-status {
    color: #334155;
    font-size: 12px;
    line-height: 1.4;
}
.tsao-route-map {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
}
.tsao-route-item {
    display: grid;
    gap: 3px;
    min-width: 0;
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-radius: 6px;
    background: #f8fafc;
    padding: 7px 8px;
}
.tsao-route-label {
    color: #1e3a5f;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
}
.tsao-route-value {
    color: #111827;
    font-size: 12px;
    font-weight: 650;
    line-height: 1.3;
    overflow-wrap: anywhere;
}
.tsao-inspector {
    border-top: 1px solid rgba(15, 23, 42, 0.16);
    border-bottom: 1px solid rgba(15, 23, 42, 0.16);
    background: #f8fafc;
    border-radius: 6px;
    display: grid;
    gap: 0;
    padding: 2px 8px;
}
.tsao-inspector-row {
    display: grid;
    grid-template-columns: minmax(104px, 0.34fr) minmax(0, 1fr);
    gap: 8px;
    padding: 6px 0;
}
.tsao-inspector-row + .tsao-inspector-row {
    border-top: 1px solid rgba(15, 23, 42, 0.1);
}
.tsao-inspector-label {
    color: #1e3a5f;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.25;
}
.tsao-inspector-value {
    color: #111827;
    font-size: 12px;
    line-height: 1.35;
    min-width: 0;
    overflow-wrap: anywhere;
}
.tsao-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.tsao-meta span {
    border-radius: 999px;
    background: #e2e8f0;
    color: #1e293b;
    padding: 3px 6px;
}
.tsao-actions,
.tsao-poll-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.tsao-btn {
    border: 1px solid rgba(15, 23, 42, 0.16);
    border-radius: 6px;
    background: #17324d;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    min-height: 34px;
    padding: 7px 10px;
}
.tsao-btn.secondary {
    background: #fff;
    color: #17324d;
}
.tsao-btn[aria-pressed="true"] {
    background: #1f7a4d;
    border-color: #1f7a4d;
    color: #fff;
}
.tsao-status[data-state="ok"] {
    color: #166534;
}
.tsao-status[data-state="idle"] {
    color: #475569;
}
.tsao-status[data-state="fallback"] {
    color: #92400e;
}
.tsao-reveal,
.tsao-snapshot {
    border-left: 3px solid #1f7a4d;
    background: #fff;
    border-radius: 4px;
    padding: 8px;
    color: #1f2937;
    font-size: 12px;
    line-height: 1.45;
}
.tsao-snapshot img {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 6px;
}
.tsao-empty {
    border: 1px dashed rgba(15, 23, 42, 0.2);
    border-radius: 6px;
    padding: 10px;
    color: #5b6472;
    font-size: 12px;
}
@media (max-width: 640px) {
    .tsao-panel {
        border-radius: 0;
    }
    .tsao-card-top,
    .tsao-actions,
    .tsao-poll-choices {
        align-items: stretch;
        flex-direction: column;
    }
    .tsao-inspector-row {
        grid-template-columns: 1fr;
        gap: 2px;
    }
    .tsao-route-map {
        grid-template-columns: 1fr;
    }
    .tsao-btn {
        min-height: 44px;
        width: 100%;
    }
}
`;
