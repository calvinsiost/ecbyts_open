// Canonical contract for analytics modules exposed via the Library marketplace.
// Spec: SPEC_TYPESCRIPT_MIGRATION_PROGRAM.md §"Analytics Library Exposure".
// Every file in app/js/core/analytics/*.js MUST export a `<name>Meta` object
// conforming to AnalyticsModuleMeta so the Library system can discover/list/load
// the module without manual manifest registration.

/**
 * JSON Schema (Draft-07 subset) describing input/output payload shape for an
 * analytics module. Populated incrementally per module — empty `properties`
 * + `required: []` is acceptable as initial stub but blocks Library publish.
 */
export interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}

/**
 * Provenance metadata — origin of the implementation, version pin, validation
 * status. Used by the Library marketplace to surface the trust signal in UI.
 */
export interface AnalyticsModuleProvenance {
    /** Which agent/LLM produced the implementation */
    generatedBy: 'claude' | 'codex' | 'kimi' | 'human' | 'gpt' | 'gemini' | 'deepseek' | string;
    /** Semver-like tag (`v0.1`, `v1.0-beta`) */
    version: string;
    /** Whether a human technical consultant has validated the algorithm */
    validatedByHuman: boolean;
    /** Whether the AGPL/AI disclaimer has been acknowledged for this module */
    disclaimerAcknowledged: boolean;
    /** Path to the canonical scientific spec backing this module */
    specRef: string;
    /** Optional academic citation (DOI, ISBN, paper reference) */
    citation?: string;
}

/**
 * Canonical metadata exported by every analytics module. Library marketplace
 * reads these via `import * as M from <path>` and filters by `category` +
 * `familyTags`. The `name` MUST equal the file basename without extension.
 */
export interface AnalyticsModuleMeta {
    /** Unique module identifier — MUST equal file basename (no extension) */
    name: string;
    /** Human-readable description for marketplace listings (i18n key allowed) */
    description: string;
    /** Top-level category — every analytics file uses 'analytics' */
    category: 'analytics';
    /**
     * Family tags for filterable discovery. Examples: 'mining', 'water',
     * 'risk', 'health', 'air', 'soil', 'compliance'. Used by Library Studio
     * to populate the "Explore by domain" navigation.
     */
    familyTags: string[];
    /** Provenance + trust signal */
    provenance: AnalyticsModuleProvenance;
    /** Input payload schema (JSON Schema Draft-07 subset) */
    inputSchema: AnalyticsJsonSchema;
    /** Output payload schema (JSON Schema Draft-07 subset) */
    outputSchema: AnalyticsJsonSchema;
    /**
     * Optional library publication state. When `published: true` the module
     * appears in the public Library marketplace; otherwise it stays private
     * to the host org. Defaults to false (gated by inputSchema/outputSchema
     * being populated + validatedByHuman === true).
     */
    library?: {
        published: boolean;
        priceECBT?: number;
        licenseRef?: string;
    };
}

/**
 * A registry entry pairs the canonical Meta with the live function exports
 * of the module. The Library loader uses this to hydrate runtime invocations
 * without re-importing each file.
 */
export interface AnalyticsModuleEntry {
    meta: AnalyticsModuleMeta;
    /** The full module namespace — `import * as M from <path>` shape */
    module: Record<string, unknown>;
    /** Source path relative to repo root (`app/js/core/analytics/<name>.js`) */
    sourcePath: string;
}

/** Registry shape — keyed by `meta.name`. */
export type AnalyticsModuleRegistry = Map<string, AnalyticsModuleEntry>;
