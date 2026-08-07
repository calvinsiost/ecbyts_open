// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PACK VALIDATOR - validador explicavel de pipeline packs
   (PIPELINE-UNIFIED-PROTOCOL #13 / RF13).

   Lista pendencias em linguagem clara com micro-acoes:
   vincular evidencia, definir rota, atribuir fase, marcar N/A,
   corrigir conector.

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   ================================================================ */

export interface ValidationIssue {
    readonly id: string;
    readonly severity: 'error' | 'warning' | 'info';
    readonly message: string;
    readonly action: string;
    readonly field?: string;
}

export interface PackValidationResult {
    readonly valid: boolean;
    readonly issues: ReadonlyArray<ValidationIssue>;
    readonly score: number;
}

export interface PackVariant {
    readonly id: string;
    readonly name: string;
    readonly connectorId?: string;
}

export interface PackEvidence {
    readonly id: string;
    readonly label: string;
    readonly linked: boolean;
}

export interface PackConnector {
    readonly id: string;
    readonly route?: string;
    readonly phase?: string;
}

export interface PackInput {
    readonly name: string;
    readonly protocol: string;
    readonly source: string;
    readonly variants: ReadonlyArray<PackVariant>;
    readonly evidence: ReadonlyArray<PackEvidence>;
    readonly connectors: ReadonlyArray<PackConnector>;
}

const SEVERITY_PENALTY: Record<ValidationIssue['severity'], number> = {
    error: 20,
    warning: 10,
    info: 2,
};

export function validatePack(pack: PackInput): PackValidationResult {
    const issues: ValidationIssue[] = [];
    let seq = 0;
    const nextId = () => `pack-issue-${++seq}`;

    if (!pack.name || pack.name.trim() === '') {
        issues.push({
            id: nextId(),
            severity: 'error',
            message: 'Nome do pack não definido.',
            action: 'Preencher nome do pack',
            field: 'name',
        });
    }

    if (!pack.protocol || pack.protocol.trim() === '') {
        issues.push({
            id: nextId(),
            severity: 'error',
            message: 'Protocolo não definido para o pack.',
            action: 'Definir protocolo',
            field: 'protocol',
        });
    }

    if (!pack.source || pack.source.trim() === '') {
        issues.push({
            id: nextId(),
            severity: 'error',
            message: 'Fonte de dados não definida.',
            action: 'Definir fonte de dados',
            field: 'source',
        });
    }

    for (const variant of pack.variants) {
        if (!variant.connectorId) {
            issues.push({
                id: nextId(),
                severity: 'warning',
                message: `Variante "${variant.name}" não possui conector atribuído.`,
                action: 'Corrigir conector',
                field: `variants[${variant.id}].connectorId`,
            });
        }
    }

    const hasLinkedEvidence = pack.evidence.some((e) => e.linked);
    if (pack.evidence.length === 0 || !hasLinkedEvidence) {
        issues.push({
            id: nextId(),
            severity: 'warning',
            message: 'Nenhuma evidência vinculada ao pack.',
            action: 'Vincular evidência',
            field: 'evidence',
        });
    }

    for (const connector of pack.connectors) {
        if (!connector.route) {
            issues.push({
                id: nextId(),
                severity: 'info',
                message: `Conector "${connector.id}" sem rota definida.`,
                action: 'Definir rota',
                field: `connectors[${connector.id}].route`,
            });
        }
        if (!connector.phase) {
            issues.push({
                id: nextId(),
                severity: 'info',
                message: `Conector "${connector.id}" sem fase atribuída.`,
                action: 'Atribuir fase',
                field: `connectors[${connector.id}].phase`,
            });
        }
    }

    const penalty = issues.reduce((sum, i) => sum + SEVERITY_PENALTY[i.severity], 0);
    const score = Math.max(0, 100 - penalty);
    const valid = issues.every((i) => i.severity !== 'error');

    return { valid, issues, score };
}

const SEVERITY_LABEL: Record<ValidationIssue['severity'], string> = {
    error: 'ERRO',
    warning: 'AVISO',
    info: 'INFO',
};

export function formatIssueForUser(issue: ValidationIssue): string {
    return `[${SEVERITY_LABEL[issue.severity]}] ${issue.message} → Ação: ${issue.action}`;
}
