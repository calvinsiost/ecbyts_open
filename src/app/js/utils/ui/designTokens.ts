// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Design Tokens - Inspired by React example UI/UX
// Based on: Life-Transition Engine v3.1 design system

/* ================================================================
   DESIGN TOKENS
   Sistema de cores, tipografia e espaçamento inspirado no exemplo React
   Mantém compatibilidade com CSS variables existentes do projeto
   ================================================================ */

/**
 * Design Tokens - Cores (dark theme primário)
 * Extraídas do exemplo React com nomenclatura consistente
 */
export const COLORS = {
    // Backgrounds
    bg: '#060a12', // Fundo principal
    s1: '#0d1117', // Surface 1 (cards, modals)
    s2: '#161b22', // Surface 2 (hover states)
    bd: '#1e293b', // Border padrão
    bdA: '#334155', // Border alternativa (mais clara)

    // Text
    tx: '#e2e8f0', // Texto primário
    txM: '#94a3b8', // Texto secundário/muted
    txD: '#475569', // Texto terciário/disabled
    txX: '#334155', // Texto muito discreto

    // Cores semânticas (categorias)
    cy: '#22d3ee', // Ciano (Hidráulica, Info)
    gn: '#34d399', // Verde (Ambiental, Success)
    am: '#f59e0b', // Âmbar (Econômico, Warning)
    pu: '#a78bfa', // Púrpura (Remediação, Purple)
    pk: '#f472b6', // Rosa (Saúde, Pink)
    rd: '#ef4444', // Vermelho (Contaminante, Danger)
    or: '#f97316', // Laranja (Orange)
    li: '#84cc16', // Lima (Lime)
    fu: '#e879f9', // Fuchsia

    // Cores específicas para grupos de parâmetros
    contaminante: '#ef4444', // Vermelho
    hidraulica: '#22d3ee', // Ciano
    ambiental: '#34d399', // Verde
    remediacao: '#a78bfa', // Púrpura
    economico: '#f59e0b', // Âmbar
    geral: '#64748b', // Cinza

    // Status/Score colors
    scoreHigh: '#34d399', // Score >= 70 (favorável)
    scoreMedium: '#f59e0b', // Score 45-69 (atenção)
    scoreLow: '#ef4444', // Score < 45 (risco)
};

/**
 * Tipografia
 * Font stack inspirada no exemplo com fallbacks
 */
export const TYPOGRAPHY = {
    fontFamily: "'SF Mono', 'Fira Code', 'ui-monospace', 'Menlo', 'Monaco', 'Cascadia Code', monospace",
    fontFamilySans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",

    // Tamanhos (px para canvas/consistência)
    sizeXs: '7px',
    sizeSm: '8px',
    sizeMd: '9px',
    sizeLg: '10px',
    sizeXl: '11px',
    size2xl: '12px',
    size3xl: '13px',
    size4xl: '14px',
    size5xl: '18px',
    size6xl: '22px',
    size7xl: '36px',
    size8xl: '40px',

    // Pesos
    weightNormal: '400',
    weightMedium: '500',
    weightSemibold: '600',
    weightBold: '700',
    weightExtrabold: '800',
};

/**
 * Espaçamento (spacing scale)
 * Base 4px com múltiplos comuns
 */
export const SPACING = {
    px: '1px',
    0: '0',
    0.5: '2px',
    1: '4px',
    1.5: '6px',
    2: '8px',
    2.5: '10px',
    3: '12px',
    3.5: '14px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '28px',
    8: '32px',
    9: '36px',
    10: '40px',
    11: '44px',
    12: '48px',
    14: '56px',
    16: '64px',
    20: '80px',
    24: '96px',
    28: '112px',
    32: '128px',
};

/**
 * Border radius scale
 */
export const BORDER_RADIUS = {
    none: '0',
    sm: '2px',
    md: '4px',
    lg: '6px',
    xl: '8px',
    '2xl': '10px',
    '3xl': '12px',
    full: '9999px',
};

/**
 * Shadows (baseadas no exemplo)
 */
export const SHADOWS = {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
};

/**
 * Utilitários para gerar cores com opacidade
 * @param {string} color - Cor base (ex: '#22d3ee')
 * @param {number} opacity - Opacidade 0-1 (ex: 0.1 para 10%)
 * @returns {string} Cor com opacidade em hex (ex: '#22d3ee1a')
 */
export function withOpacity(color: string, opacity: number): string {
    // Converte opacidade para hex (0-255)
    const alpha = Math.round(opacity * 255);
    const hexAlpha = alpha.toString(16).padStart(2, '0');

    // Remove # se existir e adiciona alpha
    const cleanColor = color.startsWith('#') ? color.slice(1) : color;

    // Se já tem 8 caracteres (inclui alpha), substitui
    if (cleanColor.length === 8) {
        return `#${cleanColor.slice(0, 6)}${hexAlpha}`;
    }

    // Se tem 6 caracteres (RGB), adiciona alpha
    if (cleanColor.length === 6) {
        return `#${cleanColor}${hexAlpha}`;
    }

    // Fallback
    return color;
}

/**
 * Gera gradiente linear baseado em score
 * @param {number} score - Score 0-100
 * @returns {string} CSS gradient
 */
export function getScoreGradient(score: number): string {
    if (score >= 70) {
        return `linear-gradient(135deg, ${withOpacity(COLORS.scoreHigh, 0.08)}, ${COLORS.s1})`;
    } else if (score >= 45) {
        return `linear-gradient(135deg, ${withOpacity(COLORS.scoreMedium, 0.08)}, ${COLORS.s1})`;
    } else {
        return `linear-gradient(135deg, ${withOpacity(COLORS.scoreLow, 0.08)}, ${COLORS.s1})`;
    }
}

/**
 * Retorna cor baseada no score
 * @param {number} score - Score 0-100
 * @returns {string} Cor hexadecimal
 */
export function getScoreColor(score: number): string {
    if (score >= 70) return COLORS.scoreHigh;
    if (score >= 45) return COLORS.scoreMedium;
    return COLORS.scoreLow;
}

/**
 * Retorna label baseado no score
 * @param {number} score - Score 0-100
 * @returns {string} Label descritivo
 */
export function getScoreLabel(score: number): string {
    if (score >= 70) return 'Cenário favorável';
    if (score >= 45) return 'Atenção necessária';
    return 'Risco elevado';
}

/**
 * Retorna cor para grupo de parâmetros
 * @param {string} group - Grupo (contaminante, hidraulica, etc.)
 * @returns {string} Cor hexadecimal
 */
export function getGroupColor(group: any): string {
    return (COLORS as Record<string, any>)[group] || COLORS.geral;
}

/**
 * Utilitário para gerar CSS inline a partir de tokens
 * @param {Object} styles - Objeto com estilos
 * @returns {string} String CSS inline
 */
export function css(styles: object): string {
    return Object.entries(styles)
        .map(([key, value]) => {
            // Converte camelCase para kebab-case
            const cssKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
            return `${cssKey}:${value}`;
        })
        .join(';');
}

// Exportação padrão com todos os tokens
export default {
    COLORS,
    TYPOGRAPHY,
    SPACING,
    BORDER_RADIUS,
    SHADOWS,
    withOpacity,
    getScoreGradient,
    getScoreColor,
    getScoreLabel,
    getGroupColor,
    css,
};
