// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: UI Components - Componentes reutilizáveis inspirados no exemplo React
// Dependências: designTokens.js, escapeHtml

import { escapeHtml } from '../helpers/html.js';
import {
    COLORS,
    TYPOGRAPHY,
    SPACING,
    BORDER_RADIUS,
    SHADOWS,
    withOpacity,
    getScoreColor,
    css as _generateCss,
} from './designTokens.js';

/* ================================================================
   COMPONENTES BASE
   Componentes reutilizáveis inspirados no exemplo React
   ================================================================ */

/**
 * Componente Card - Container para conteúdo agrupado
 * @param {{children: any, color?: string, withBorder?: boolean, withShadow?: boolean, className?: string, style?: string}} props
 */
export function Card({
    children,
    color = COLORS.bd,
    withBorder = true,
    withShadow = false,
    className = '',
    style = ''
}: any) {
    const borderStyle = withBorder ? `border:1px solid ${color};` : '';
    const shadowStyle = withShadow ? `box-shadow:${SHADOWS.md};` : '';

    return `
        <div class="${className}" style="
            background: ${COLORS.s1};
            ${borderStyle}
            ${shadowStyle}
            border-radius: ${BORDER_RADIUS.xl};
            padding: ${SPACING[4]};
            font-family: ${TYPOGRAPHY.fontFamily};
            ${style}
        ">
            ${children}
        </div>
    `;
}

/**
 * Componente Pill - Badge para status/tags
 * @param {{text: any, level?: string, onClick?: string}} props
 */
export function Pill({
    text,
    level = 'medio',
    onClick = ''
}: any) {
    const colors: Record<string, {color: string, bg: string}> = {
        alto: { color: COLORS.gn, bg: withOpacity(COLORS.gn, 0.2) },
        medio: { color: COLORS.am, bg: withOpacity(COLORS.am, 0.2) },
        baixo: { color: COLORS.txD, bg: withOpacity(COLORS.txD, 0.1) },
        risco: { color: COLORS.rd, bg: withOpacity(COLORS.rd, 0.2) },
    };

    const levelColors: any = colors[level] || colors.medio;

    return `
        <span class="pill" ${onClick ? `data-cc-call-click="${onClick}"` : ''} style="
            display: inline-block;
            padding: 2px ${SPACING['2']};
            border-radius: ${BORDER_RADIUS.md};
            font-size: ${TYPOGRAPHY.sizeMd};
            font-weight: ${TYPOGRAPHY.weightSemibold};
            background: ${levelColors.bg};
            color: ${levelColors.color};
            text-transform: uppercase;
            letter-spacing: 0.04em;
            cursor: ${onClick ? 'pointer' : 'default'};
            font-family: ${TYPOGRAPHY.fontFamily};
        ">
            ${escapeHtml(text)}
        </span>
    `;
}

/**
 * Componente Toggle - Botão on/off estilo interruptor
 * @param {{label: any, checked: any, onChange: any, color?: string, disabled?: boolean}} props
 */
export function Toggle({
    label,
    checked,
    onChange,
    color = COLORS.cy,
    disabled = false
}: any) {
    const id = `toggle-${Math.random().toString(36).substr(2, 9)}`;

    return `
        <label for="${id}" style="
            display: flex;
            align-items: center;
            gap: ${SPACING['2']};
            cursor: pointer;
            font-family: ${TYPOGRAPHY.fontFamily};
            font-size: ${TYPOGRAPHY.sizeMd};
            color: ${COLORS.tx};
            cursor: ${disabled ? 'not-allowed' : 'pointer'};
            opacity: ${disabled ? '0.6' : '1'};
            user-select: none;
        ">
            <input data-field-meta="true" data-field-meta-key="auto-tpl:components:input:L110" 
                type="checkbox" 
                id="${id}" 
                ${checked ? 'checked' : ''}
                ${disabled ? 'disabled' : ''}
                data-cc-call-change="${onChange || ''}"
                style="
                    position: absolute;
                    opacity: 0;
                    width: 0;
                    height: 0;
                "
            />
            <div style="
                position: relative;
                width: 36px;
                height: 20px;
                background: ${checked ? withOpacity(color, 0.3) : withOpacity(COLORS.bd, 0.3)};
                border-radius: 12px;
                transition: all 0.3s ease;
                margin-right: ${SPACING['2']};
                ${disabled ? 'opacity: 0.5;' : ''}
            ">
                <span style="
                    position: absolute;
                    top: 2px;
                    left: ${checked ? '18px' : '2px'};
                    width: 16px;
                    height: 16px;
                    background: ${checked ? color : COLORS.txM};
                    border-radius: 50%;
                    transition: all 0.3s ease;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                "></span>
            </div>
            <span>${escapeHtml(label)}</span>
        </label>
    `;
}

/**
 * Componente Slider - Controle deslizante
 * @param {{label: any, value: any, min: any, max: any, step?: number, onChange: any, unit?: string, help?: string}} props
 */
export function Slider({
    label,
    value,
    min,
    max,
    step = 1,
    onChange,
    unit = '',
    help = ''
}: any) {
    const id = `slider-${Math.random().toString(36).substr(2, 9)}`;
    // CC-S1 B3: track fill via builtin whitelisted (era código inline)
    const sliderInputAttr = `__ccSliderTrack|t|j:${min}|j:${max}`;
    const displayValue =
        unit === 'percent'
            ? `${value}%`
            : unit === 'currency'
              ? `R$ ${value.toLocaleString()}`
              : unit === 'months'
                ? `${value} meses`
                : value;

    return `
        <div style="margin-bottom: ${SPACING['3']};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: ${SPACING['1']};">
                <label for="${id}" style="font-size: ${TYPOGRAPHY.sizeMd}; color: ${COLORS.txM};">
                    ${escapeHtml(label)}
                </label>
                <span style="font-size: ${TYPOGRAPHY.sizeMd}; color: ${COLORS.cy}; font-weight: bold; font-family: ${TYPOGRAPHY.fontFamily};">
                    ${displayValue}
                </span>
            </div>
            
            <input data-field-meta="true" data-field-meta-key="auto-tpl:components:input:L175" type="range" 
                   id="${id}"
                   value="${value}"
                   min="${min}" 
                   max="${max}" 
                   step="${step}"
                   data-cc-call-input="${onChange}"
                   data-cc-call-change="${onChange}"
                   style="
                       width: 100%;
                       height: 3px;
                       background: ${COLORS.bd};
                       border-radius: ${BORDER_RADIUS.sm};
                       outline: none;
                       appearance: none;
                   "
                   style::-webkit-slider-thumb {
                       width: 16px;
                       height: 16px;
                       border-radius: 50%;
                       background: ${COLORS.cy};
                       cursor: pointer;
                       appearance: none;
                   }
            "
            data-cc-call-input="${sliderInputAttr}"
            style="
                background: linear-gradient(to right, ${COLORS.cy} 0%, ${COLORS.cy} var(--value, 0%), ${COLORS.bd} var(--value, 0%) 100%);
            "
            value="${value}">
            
            ${
                help
                    ? `
                <div style="
                    font-size: ${TYPOGRAPHY.sizeXs};
                    color: ${COLORS.txM};
                    margin-top: 2px;
                    font-style: italic;
                ">
                    ${escapeHtml(help)}
                </div>
            `
                    : ''
            }
    `;
}

/**
 * Componente Section - Título de seção
 * @param {{label: any, color?: string, mt?: number}} props
 */
export function Section({
    label,
    color = COLORS.cy,
    mt = 4
}: any) {
    return `
        <div style="
            font-size: ${TYPOGRAPHY.sizeMd};
            color: ${color};
            margin-top: ${(SPACING as Record<string|number, string>)[mt]}px;
            margin-bottom: ${SPACING[2]};
            text-transform: uppercase;
            font-weight: ${TYPOGRAPHY.weightSemibold};
            letter-spacing: 0.05em;
        ">
            ${escapeHtml(label)}
        </div>
    `;
}

/**
 * Componente KPI Chip - Indicador de métrica
 * @param {{value: any, label: any, color?: string, unit?: string}} props
 */
export function KpiChip({
    value,
    label,
    color = COLORS.tx,
    unit = ''
}: any) {
    return `
        <div style="flex: 1; text-align: center; background: ${withOpacity(COLORS.bg, 0.6)}; border-radius: ${BORDER_RADIUS.lg}; padding: ${SPACING['2']} 0;">
            <div style="font-size: ${TYPOGRAPHY.size2xl}; font-weight: ${TYPOGRAPHY.weightBold}; color: ${color};">
                ${value}${unit}
            </div>
            <div style="
                font-size: ${TYPOGRAPHY.sizeXs};
                color: ${COLORS.txD};
                text-transform: uppercase;
                margin-top: 2px;
            ">
                ${escapeHtml(label)}
            </div>
        </div>
    `;
}

/**
 * Componente HeroCard - Card principal com score inspirado no exemplo React
 * @param {{score: any, title?: string, kpis?: Array<any>, _metrics?: Array<any>, _bgColor?: string}} props
 */
export function HeroCard({
    score,
    title = 'Situação Atual',
    kpis = [],
    _metrics = [],
    _bgColor = withOpacity(getScoreColor(score), 0.08)
}: any) {
    const scoreColor = getScoreColor(score);
    const scoreLabel = score >= 70 ? 'Favorável' : score >= 45 ? 'Atenção' : 'Risco Alto';

    return `
        <div style="
            background: linear-gradient(135deg, ${withOpacity(scoreColor, 0.08)}, ${COLORS.s1});
            border: 1px solid ${withOpacity(scoreColor, 0.3)};
            border-radius: ${BORDER_RADIUS['3xl']};
            padding: ${SPACING['5']} ${SPACING['4']};
            position: relative;
            overflow: hidden;
            margin-bottom: ${SPACING['4']};
        ">
            <!-- Círculo decorativo -->
            <div style="
                position: absolute;
                top: -20px;
                right: -20px;
                width: 100px;
                height: 100px;
                border-radius: 50%;
                background: ${withOpacity(scoreColor, 0.08)};
            "></div>
            
            <!-- Score e título -->
            <div style="display: flex; align-items: center; gap: ${SPACING['4']}; margin-bottom: ${SPACING['3']};">
                <!-- Score grande -->
                <div style="text-align: center; min-width: 64px;">
                    <div style="
                        font-size: ${TYPOGRAPHY.size7xl};
                        font-weight: ${TYPOGRAPHY.weightExtrabold};
                        color: ${scoreColor};
                        line-height: 1;
                    ">
                        ${score}
                    </div>
                    <div style="
                        font-size: ${TYPOGRAPHY.sizeSm};
                        color: ${COLORS.txD};
                        text-transform: uppercase;
                        margin-top: ${SPACING['0.5']};
                    ">
                        de 100
                    </div>
                </div>
                
                <!-- Título e label -->
                <div style="flex: 1;">
                    <div style="
                        font-size: ${TYPOGRAPHY.size3xl};
                        font-weight: ${TYPOGRAPHY.weightBold};
                        color: ${scoreColor};
                        margin-bottom: ${SPACING['1']};
                    ">
                        ${scoreLabel}
                    </div>
                    <div style="
                        font-size: ${TYPOGRAPHY.sizeMd};
                        color: ${COLORS.txM};
                        line-height: 1.4;
                    ">
                        ${escapeHtml(title)}
                    </div>
                </div>
            </div>
            
            <!-- KPIs rápidos -->
            ${
                kpis.length > 0
                    ? `
                <div style="display: flex; gap: 20px; margin-top: ${SPACING['4']};">
                    ${kpis.map((kpi: any) => KpiChip(kpi)).join('')}
                </div>
            `
                    : ''
            }
            
            <!-- Barra de progresso do score -->
            <div style="margin-top: ${SPACING['3']};">
                ${ProgressBar({ value: score, color: scoreColor, height: 6 })}
            </div>
        </div>
    `;
}

/**
 * Componente ProgressBar
 * @param {{value: any, color?: string, height?: number, withLabel?: boolean}} props
 */
export function ProgressBar({
    value,
    color = COLORS.cy,
    height = 5,
    withLabel = true
}: any) {
    const clampedValue = Math.max(0, Math.min(100, value));

    return `
        <div style="margin-bottom: 2px;">
            <div style="
                height: ${height}px;
                background: ${COLORS.s2};
                border-radius: ${BORDER_RADIUS.lg};
                overflow: hidden;
                position: relative;
            ">
                <div style="
                    width: ${clampedValue}%;
                    height: 100%;
                    background: ${color};
                    border-radius: ${BORDER_RADIUS.lg};
                    transition: width 0.3s ease;
                "></div>
            </div>
            ${
                withLabel
                    ? `
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                    <span style="font-size: 12px; color: ${COLORS.txM}">
                        ${value}%
                    </span>
                </div>
            `
                    : ''
            }
        </div>
    `;
}

/**
 * Componente Tabs - Sistema de abas navegáveis
 */
/**
 * CC-S1 B3 (CCC-001 Fase 11) — CONTRATO: `onTabChange` é o NOME de uma função
 * global (resolvida de window, SEM prefixo `window.`), invocada via dispatch
 * whitelisted data-cc-call com o event como arg. NÃO passar código JS.
 */
export function Tabs(/** @type {any} */ {
    tabs,
    activeTab,
    onTabChange
}: any) {
    return `
        <div style="
            display: flex;
            gap: 0;
            margin-bottom: ${SPACING['4']};
            border-radius: ${BORDER_RADIUS.xl};
            overflow: hidden;
            border: 1px solid ${COLORS.bd};
        ">
            ${tabs
                .map((tab: any) => {
                    const isActive = tab.id === activeTab;
                    return `
                    <button
                        data-cc-call-click="${onTabChange}|e"
                        data-tab="${tab.id}"
                        style="
                            flex: 1;
                            padding: ${SPACING['2']} ${SPACING['3']};
                            background: ${isActive ? COLORS.s2 : COLORS.bg};
                            border: none;
                            border-right: 1px solid ${COLORS.bd};
                            font-size: ${TYPOGRAPHY.sizeSm};
                            color: ${isActive ? COLORS.cy : COLORS.txD};
                            cursor: pointer;
                            font-family: ${TYPOGRAPHY.fontFamily};
                            font-weight: ${isActive ? TYPOGRAPHY.weightBold : TYPOGRAPHY.weightNormal};
                            outline: none;
                        "
                        ${tab.ariaLabel ? `aria-label="${tab.ariaLabel}"` : ''}
                        ${tab.disabled ? 'disabled' : ''}
                    >
                        ${escapeHtml(tab.label)}
                    </button>
                `;
                })
                .join('')}
        </div>
    `;
}

/**
 * Componente Dot - Ponto colorido para legendas
 * @param {{color: any, size?: number}} props
 */
export function Dot({
    color,
    size = 8
}: any) {
    return `
        <span style="
            display: inline-block;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: ${color};
            flex-shrink: 0;
        "></span>
    `;
}

/**
 * Componente Badge - Ícone de contador
 * @param {{count: any, color?: string, size?: number}} props
 */
export function Badge({
    count,
    color = COLORS.cy,
    size = 6
}: any) {
    if (!count) return '';

    return `
        <span style="
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: ${size * 2}px;
            height: ${size * 2}px;
            border-radius: 50%;
            background: ${color};
            color: white;
            font-size: ${size - 2}px;
            font-weight: bold;
            padding: 2px 4px;
        ">
            ${count > 9 ? '9+' : count}
        </span>
    `;
}

// Exporta todos os componentes
export default {
    Card,
    Pill,
    Toggle,
    Slider,
    Section,
    KpiChip,
    HeroCard,
    ProgressBar,
    Tabs,
    Dot,
    Badge,
};
