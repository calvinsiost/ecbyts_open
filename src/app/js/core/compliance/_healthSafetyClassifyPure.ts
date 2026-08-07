// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   HEALTH & SAFETY CLASSIFY — lógica pura de classificação H&S de preset.

   Extraída do wire complianceUiBootstrap.ts (COMPLIANCE-PRESET-001) sem
   mudança de comportamento. Decide se um preset é de Saúde & Segurança
   ocupacional (ACGIH/NIOSH/OSHA/MTE/SEPRT ou TLV/BEI/PEL/NR-7/15/9 etc.)
   e, quando é, classifica cada norma de legalBasis e cada reportTemplate
   em sub-kinds (exposure-limit / health-protocol / legal / report-template).

   Pure: sem DOM, sem rede, sem estado. Regex e string-ops apenas. Os
   literais de retorno são subconjuntos do PresetComponentKind do wire.
   ================================================================ */

/** Forma estrutural mínima de preset que a classificação H&S consome. */
export interface HSClassifiablePreset {
    readonly publishedBy?: { readonly authority?: string } | null;
    readonly legalBasis?: ReadonlyArray<string>;
}

/** Sub-kind de uma norma de legalBasis dentro de um preset H&S. */
export type HSLegalBasisKind = 'exposure-limit' | 'health-protocol' | 'legal';

/** Sub-kind de um reportTemplate dentro de um preset H&S. */
export type HSReportTemplateKind = 'health-protocol' | 'report-template';

export function _isHealthAndSafetyPreset(p: HSClassifiablePreset): boolean {
    const auth = (p.publishedBy?.authority || '').toUpperCase();
    if (auth.includes('ACGIH') || auth.includes('NIOSH') || auth.includes('OSHA') || auth.includes('MTE') || auth.includes('SEPRT'))
        return true;
    const basis = (p.legalBasis || []).join(' ').toUpperCase();
    if (/\b(TLV|BEI|PEL|REL|PCMSO|NR-?7|NR-?15|NR-?9|PPP|ASO|LTCAT|INSS)\b/.test(basis)) return true;
    return false;
}

export function _classifyLegalBasisAsHS(basis: string): HSLegalBasisKind {
    const u = basis.toUpperCase();
    if (/\b(TLV|BEI|PEL|REL|NR-?15|LIMITE DE TOLER|LIMITE DE EXPOSI|EXPOSURE LIMIT)\b/.test(u))
        return 'exposure-limit';
    if (/\b(PCMSO|ASO|PPP|VIGIL|HEALTH PROTOCOL|MEDICAL SURVEIL|NR-?7|NR-?9|LTCAT|INSS)\b/.test(u))
        return 'health-protocol';
    return 'legal';
}

export function _classifyReportTemplateAsHS(tplId: string): HSReportTemplateKind {
    const u = tplId.toUpperCase();
    if (/\b(ASO|PPP|PCMSO|LTCAT|HEALTH|EXPOSURE)\b/.test(u)) return 'health-protocol';
    return 'report-template';
}

// Public aliases without underscore prefix (ecbyts-local/no-underscore-prefixed-imports)
export {
    _isHealthAndSafetyPreset as isHealthAndSafetyPreset,
    _classifyLegalBasisAsHS as classifyLegalBasisAsHS,
    _classifyReportTemplateAsHS as classifyReportTemplateAsHS,
};
