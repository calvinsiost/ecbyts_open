// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LLM SNIPPETS CATALOG — SPEC_LLM_SNIPPETS_CATALOG §7

   Registry of reusable LLM prompts/snippets for the report editor
   and other UI surfaces. Follows ACTION_REGISTRY pattern.
   ================================================================ */

export interface SnippetEntry {
    id: string;
    name: string;
    category: string;
    prompt: string;
    description?: string;
    tags?: string[];
}

export const SNIPPETS_CATALOG: SnippetEntry[] = [
    {
        id: 'report-introduction',
        name: 'Report Introduction',
        category: 'report',
        prompt: 'Write a technical introduction for an environmental monitoring report. Context: {elementCount} elements, {campaignCount} campaigns. Tone: {tone}.',
        description: 'Standard introduction paragraph for environmental reports',
        tags: ['report', 'introduction', 'technical'],
    },
    {
        id: 'report-risk-analysis',
        name: 'Risk Analysis',
        category: 'report',
        prompt: 'Generate a risk analysis section considering {contaminatedCount} contaminated elements with exceedances of {parameters} above {standards}.',
        description: 'Risk analysis for contaminated sites',
        tags: ['report', 'risk', 'analysis'],
    },
    {
        id: 'report-conclusion',
        name: 'Report Conclusion',
        category: 'report',
        prompt: 'Write a conclusion with recommendations based on EIS score {eisScore}. Include concrete next steps ordered by priority.',
        description: 'Conclusion with next steps',
        tags: ['report', 'conclusion'],
    },
    {
        id: 'report-executive-summary',
        name: 'Executive Summary',
        category: 'report',
        prompt: 'Create a concise executive summary (max 3 paragraphs) highlighting the main points: {highlightPoints}. Include key quantitative data.',
        description: 'Executive summary for stakeholders',
        tags: ['report', 'executive', 'summary'],
    },
    {
        id: 'report-methodology',
        name: 'Methodology',
        category: 'report',
        prompt: 'Describe the methodology used for {activityType}, including technical standards {standards}, equipment {equipment} and QA/QC procedures.',
        description: 'Materials and methods section',
        tags: ['report', 'methodology'],
    },
    {
        id: 'abnt-check',
        name: 'ABNT Compliance Check',
        category: 'compliance',
        prompt: 'Review the following text for ABNT NBR and CONAMA reference formatting. List any incorrect or outdated references with suggestions: {text}',
        description: 'Check normative references for ABNT compliance',
        tags: ['compliance', 'abnt', 'review'],
    },
    {
        id: 'translate-technical',
        name: 'Translate Technical',
        category: 'translation',
        prompt: 'Translate the following technical text from {fromLang} to {toLang}. Preserve technical terms, numbers, and formatting. Output only the translation, no explanations.\n\n{text}',
        description: 'Technical translation preserving formatting',
        tags: ['translation', 'technical'],
    },
    {
        id: 'data-quality-check',
        name: 'Data Quality Check',
        category: 'data',
        prompt: 'Analyze the following dataset for anomalies, outliers, and missing values. Suggest QC flags and corrective actions: {data}',
        description: 'Quality control analysis for environmental data',
        tags: ['data', 'quality', 'qc'],
    },
    {
        id: 'sensor-alert-summary',
        name: 'Sensor Alert Summary',
        category: 'sensor',
        prompt: 'Summarize the following IoT sensor alerts. Group by severity and suggest priority actions: {alerts}',
        description: 'Summarize sensor monitoring alerts',
        tags: ['sensor', 'alerts', 'iot'],
    },
    {
        id: 'sao-scenario-analysis',
        name: 'SAO Scenario Analysis',
        category: 'sao',
        prompt: 'Analyze the SAO scenario {scenarioId} with tier {tier} and matrix {matrixId}. Provide compliance recommendations.',
        description: 'SAO protocol scenario analysis',
        tags: ['sao', 'scenario', 'compliance'],
    },
];

const _byId = new Map<string, SnippetEntry>(SNIPPETS_CATALOG.map((s) => [s.id, s]));

export function getSnippetById(id: string): SnippetEntry | null {
    return _byId.get(id) || null;
}

export function listSnippets(filters: { category?: string; tag?: string; query?: string } = {}): SnippetEntry[] {
    let results = SNIPPETS_CATALOG.slice();
    if (filters.category) {
        results = results.filter((s) => s.category === filters.category);
    }
    if (filters.tag) {
        const tagFilter = filters.tag;
        results = results.filter((s) => !!(s.tags && s.tags.includes(tagFilter)));
    }
    if (filters.query) {
        const q = filters.query.toLowerCase();
        results = results.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                (s.description && s.description.toLowerCase().includes(q)) ||
                (s.tags && s.tags.some((t) => t.toLowerCase().includes(q))),
        );
    }
    return results;
}

export function getSnippetCategories(): string[] {
    return [...new Set(SNIPPETS_CATALOG.map((s) => s.category))];
}

export function renderSnippet(id: string, variables: Record<string, string | number> = {}): string | null {
    const snippet = getSnippetById(id);
    if (!snippet) return null;
    let prompt = snippet.prompt;
    for (const [key, value] of Object.entries(variables)) {
        prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
    return prompt;
}