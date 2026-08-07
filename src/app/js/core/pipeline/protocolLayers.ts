// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_PIPELINE_UNIFIED_PROTOCOL#4 — Separação logicalModel x visualLayout x semanticLayer.
//
// Blind spot coberto: "Desenho bonito confundido com modelo operacional".
// A separação garante que mudança de layout NÃO altera o grafo lógico sem
// operação explícita. Cada camada tem identidade própria (logicalId, layoutId,
// semanticId) e a composição é uma projeção pura — visual nunca retroalimenta
// a estrutura lógica.
//
// Toda a lógica é PURA — zero state, zero DOM, zero I/O, determinística.
// Sem `any`. Sem emoji.

// ============================================================================
// TYPES — LogicalModel (grafo operacional)
// ============================================================================

export type ElementKind = 'activity' | 'decision' | 'data' | 'start' | 'end';

export interface LogicalElement {
    logicalId: string;
    kind: ElementKind;
    label: string;
    phaseRef?: string;
}

export interface LogicalConnector {
    connectorId: string;
    kind: string;
    source: string;
    target: string;
    required: boolean;
    conditionRef?: string;
}

export interface LogicalDecisionGate {
    gateId: string;
    question: string;
    branches: string[];
    fallbackBranch?: string;
}

export interface LogicalModel {
    modelVersion: string;
    phases: string[];
    elements: LogicalElement[];
    connectors: LogicalConnector[];
    decisions: LogicalDecisionGate[];
}

// ============================================================================
// TYPES — VisualLayout (posições e geometria, sem semântica)
// ============================================================================

export interface Point2D {
    x: number;
    y: number;
}

export interface VisualNode {
    layoutId: string;
    logicalId: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
}

export interface VisualEdge {
    layoutId: string;
    connectorId: string;
    points: Point2D[];
}

export interface VisualLayout {
    layoutVersion: string;
    nodes: VisualNode[];
    edges: VisualEdge[];
}

// ============================================================================
// TYPES — SemanticLayer (domínio, rastreabilidade, facetas)
// ============================================================================

export type EditableState = 'locked' | 'editable' | 'derived';

export interface SemanticBinding {
    semanticId: string;
    logicalId: string;
    stakeholderRef?: string;
    dataNatureRef?: string;
    sourceRef?: string;
    editableState?: EditableState;
}

export interface SemanticLayer {
    semanticVersion: string;
    stakeholders: string[];
    dataNatures: string[];
    bindings: SemanticBinding[];
    facets: Record<string, unknown>;
}

// ============================================================================
// TYPES — Documento composto
// ============================================================================

export interface PipelineProtocolDocument {
    protocolVersion: string;
    logical: LogicalModel;
    visual: VisualLayout;
    semantic: SemanticLayer;
}

export interface ProtocolError {
    ok: false;
    code: 'bad_args' | 'integrity_violation';
    message: string;
    violations: string[];
}

export interface ComposeResult {
    ok: true;
    document: PipelineProtocolDocument;
}

export type ComposeOutcome = ComposeResult | ProtocolError;

export interface DecomposeResult {
    logical: LogicalModel;
    visual: VisualLayout;
    semantic: SemanticLayer;
}

// ============================================================================
// INTERNAL — validação de integridade referencial
// ============================================================================

function collectIntegrityViolations(
    logical: LogicalModel,
    visual: VisualLayout,
    semantic: SemanticLayer,
): string[] {
    const violations: string[] = [];
    const elementIds = new Set(logical.elements.map((e) => e.logicalId));
    const connectorIds = new Set(logical.connectors.map((c) => c.connectorId));

    for (const node of visual.nodes) {
        if (!elementIds.has(node.logicalId)) {
            violations.push(
                `visual node "${node.layoutId}" references unknown logicalId "${node.logicalId}"`,
            );
        }
    }

    for (const edge of visual.edges) {
        if (!connectorIds.has(edge.connectorId)) {
            violations.push(
                `visual edge "${edge.layoutId}" references unknown connectorId "${edge.connectorId}"`,
            );
        }
    }

    for (const binding of semantic.bindings) {
        if (!elementIds.has(binding.logicalId)) {
            violations.push(
                `semantic binding "${binding.semanticId}" references unknown logicalId "${binding.logicalId}"`,
            );
        }
    }

    return violations;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function composeProtocol(
    logical: LogicalModel,
    visual: VisualLayout,
    semantic: SemanticLayer,
): ComposeOutcome {
    if (!logical || !visual || !semantic) {
        return {
            ok: false,
            code: 'bad_args',
            message: 'composeProtocol requires logical, visual, and semantic layers',
            violations: [],
        };
    }

    const violations = collectIntegrityViolations(logical, visual, semantic);
    if (violations.length > 0) {
        return {
            ok: false,
            code: 'integrity_violation',
            message: `${violations.length} referential integrity violation(s)`,
            violations,
        };
    }

    return {
        ok: true,
        document: {
            protocolVersion: `${logical.modelVersion}+${visual.layoutVersion}+${semantic.semanticVersion}`,
            logical,
            visual,
            semantic,
        },
    };
}

export function decomposeProtocol(doc: PipelineProtocolDocument): DecomposeResult {
    return {
        logical: doc.logical,
        visual: doc.visual,
        semantic: doc.semantic,
    };
}

export function validateReferentialIntegrity(
    logical: LogicalModel,
    visual: VisualLayout,
    semantic: SemanticLayer,
): { valid: boolean; violations: string[] } {
    const violations = collectIntegrityViolations(logical, visual, semantic);
    return { valid: violations.length === 0, violations };
}
