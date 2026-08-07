// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CLASS ACTIVITY PURE MODELS

   Small, isolated components for training slides that do not have a direct app
   module yet. The model/factory/render-tree helpers are pure; the DOM helper
   only creates elements when a caller injects a Document.
   ================================================================ */

export const CLASS_ACTIVITY_KINDS = [
    'class-poll',
    'reveal-compare',
    'data-product-recipe',
    'ecosystem-map',
    'course-resource-landing',
    'source-standard-drawer',
    'glossary-popover',
    'demo-agenda',
] as const;

export type ClassActivityKind = (typeof CLASS_ACTIVITY_KINDS)[number];

export interface ClassActivityComponentModel {
    readonly kind: ClassActivityKind;
    readonly label: string;
    readonly recommendedSlideRefs: readonly number[];
    readonly purpose: string;
}

export const CLASS_ACTIVITY_COMPONENT_MODELS: readonly ClassActivityComponentModel[] = Object.freeze([
    Object.freeze({
        kind: 'class-poll',
        label: 'Class Poll',
        recommendedSlideRefs: Object.freeze([25, 28, 29, 30, 31]),
        purpose: 'Manual/local class vote with optional reveal.',
    }),
    Object.freeze({
        kind: 'reveal-compare',
        label: 'Reveal Compare',
        recommendedSlideRefs: Object.freeze([28, 29, 30, 31]),
        purpose: 'A/B comparison that reveals evidence after the class commits to a guess.',
    }),
    Object.freeze({
        kind: 'data-product-recipe',
        label: 'Data Product Recipe',
        recommendedSlideRefs: Object.freeze([3]),
        purpose: 'Raw data to treated data to insight to decision to digital product.',
    }),
    Object.freeze({
        kind: 'ecosystem-map',
        label: 'Ecosystem Map',
        recommendedSlideRefs: Object.freeze([12]),
        purpose: 'Light map of Training connected to the app modules used in class.',
    }),
    Object.freeze({
        kind: 'course-resource-landing',
        label: 'Course Resource Landing',
        recommendedSlideRefs: Object.freeze([1, 6, 33]),
        purpose: 'Simple resource page for deck, files, references, QR, and next steps.',
    }),
    Object.freeze({
        kind: 'source-standard-drawer',
        label: 'Source Standard Drawer',
        recommendedSlideRefs: Object.freeze([1, 2, 3]),
        purpose: 'Compact source-by-standard map for module 1 slides.',
    }),
    Object.freeze({
        kind: 'glossary-popover',
        label: 'Glossary Popover',
        recommendedSlideRefs: Object.freeze([2, 4]),
        purpose: 'Simple glossary list for terms and definitions, with optional "open" behavior.',
    }),
    Object.freeze({
        kind: 'demo-agenda',
        label: 'Demo Agenda',
        recommendedSlideRefs: Object.freeze([1, 2, 5]),
        purpose: 'Session agenda cards with times, duration, and expected outputs.',
    }),
]);

export interface ClassActivityBase {
    readonly id: string;
    readonly kind: ClassActivityKind;
    readonly title: string;
    readonly slideRefs: readonly number[];
    readonly summary?: string;
}

export interface ClassActivityBaseInput {
    readonly id?: string;
    readonly title?: string;
    readonly slideRefs?: readonly number[];
    readonly summary?: string;
}

export interface ClassPollOption {
    readonly id: string;
    readonly label: string;
    readonly votes: number;
    readonly correct?: boolean;
    readonly note?: string;
}

export type ClassPollOptionInput = string | Partial<ClassPollOption>;

export interface ClassPollActivity extends ClassActivityBase {
    readonly kind: 'class-poll';
    readonly question: string;
    readonly options: readonly ClassPollOption[];
    readonly selectedOptionId: string | null;
    readonly revealed: boolean;
}

export interface ClassPollInput extends ClassActivityBaseInput {
    readonly question?: string;
    readonly options?: readonly ClassPollOptionInput[];
    readonly selectedOptionId?: string | null;
    readonly revealed?: boolean;
}

export interface RevealCompareSide {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly detail?: string;
}

export type RevealCompareSideInput = string | Partial<RevealCompareSide>;

export interface RevealCompareActivity extends ClassActivityBase {
    readonly kind: 'reveal-compare';
    readonly prompt: string;
    readonly sides: readonly [RevealCompareSide, RevealCompareSide];
    readonly selectedSideId: string | null;
    readonly correctSideId: string | null;
    readonly evidence: readonly string[];
    readonly explanation?: string;
    readonly revealed: boolean;
}

export interface RevealCompareInput extends ClassActivityBaseInput {
    readonly prompt?: string;
    readonly left?: RevealCompareSideInput;
    readonly right?: RevealCompareSideInput;
    readonly selectedSideId?: string | null;
    readonly correctSideId?: string | null;
    readonly evidence?: readonly string[];
    readonly explanation?: string;
    readonly revealed?: boolean;
}

export const DATA_PRODUCT_RECIPE_STEP_KINDS = [
    'raw-data',
    'treated-data',
    'insight',
    'decision',
    'digital-product',
] as const;

export type DataProductRecipeStepKind = (typeof DATA_PRODUCT_RECIPE_STEP_KINDS)[number];

export interface DataProductRecipeStep {
    readonly id: string;
    readonly kind: DataProductRecipeStepKind;
    readonly label: string;
    readonly description: string;
    readonly output?: string;
}

export interface DataProductRecipeActivity extends ClassActivityBase {
    readonly kind: 'data-product-recipe';
    readonly steps: readonly DataProductRecipeStep[];
    readonly activeStepId: string | null;
}

export interface DataProductRecipeInput extends ClassActivityBaseInput {
    readonly steps?: readonly Partial<DataProductRecipeStep>[];
    readonly activeStepId?: string | null;
}

export interface EcosystemMapNode {
    readonly id: string;
    readonly label: string;
    readonly category: string;
    readonly description?: string;
    readonly href?: string;
}

export interface EcosystemMapLink {
    readonly from: string;
    readonly to: string;
    readonly label?: string;
}

export interface EcosystemMapActivity extends ClassActivityBase {
    readonly kind: 'ecosystem-map';
    readonly center: EcosystemMapNode;
    readonly nodes: readonly EcosystemMapNode[];
    readonly links: readonly EcosystemMapLink[];
}

export interface EcosystemMapInput extends ClassActivityBaseInput {
    readonly center?: Partial<EcosystemMapNode>;
    readonly nodes?: readonly Partial<EcosystemMapNode>[];
    readonly links?: readonly Partial<EcosystemMapLink>[];
}

export type CourseResourceType =
    | 'deck'
    | 'diagram'
    | 'dataset'
    | 'snapshot'
    | 'reference'
    | 'next-class'
    | 'link';

export interface CourseResourceItem {
    readonly id: string;
    readonly title: string;
    readonly type: CourseResourceType;
    readonly description?: string;
    readonly url?: string;
    readonly cta?: string;
}

export interface CourseResourceLandingActivity extends ClassActivityBase {
    readonly kind: 'course-resource-landing';
    readonly intro: string;
    readonly resources: readonly CourseResourceItem[];
    readonly nextSteps: readonly string[];
    readonly qrText?: string;
}

export interface CourseResourceLandingInput extends ClassActivityBaseInput {
    readonly intro?: string;
    readonly resources?: readonly Partial<CourseResourceItem>[];
    readonly nextSteps?: readonly string[];
    readonly qrText?: string;
}

export interface SourceStandardDrawerItem {
    readonly id: string;
    readonly title: string;
    readonly source: string;
    readonly standardCode: string;
    readonly standardText: string;
}

export interface SourceStandardDrawerActivity extends ClassActivityBase {
    readonly kind: 'source-standard-drawer';
    readonly context: string;
    readonly standards: readonly SourceStandardDrawerItem[];
    readonly activeStandardId: string | null;
}

export interface SourceStandardDrawerInput extends ClassActivityBaseInput {
    readonly context?: string;
    readonly activeStandardId?: string | null;
    readonly standards?: readonly Partial<SourceStandardDrawerItem>[];
}

export interface GlossaryEntry {
    readonly id: string;
    readonly term: string;
    readonly definition: string;
    readonly context?: string;
}

export interface GlossaryPopoverActivity extends ClassActivityBase {
    readonly kind: 'glossary-popover';
    readonly title: string;
    readonly entries: readonly GlossaryEntry[];
    readonly open: boolean;
}

export interface GlossaryPopoverInput extends ClassActivityBaseInput {
    readonly title?: string;
    readonly entries?: readonly Partial<GlossaryEntry>[];
    readonly open?: boolean;
}

export interface DemoAgendaItem {
    readonly id: string;
    readonly time: string;
    readonly title: string;
    readonly durationMin: number;
    readonly expectedOutput?: string;
}

export interface DemoAgendaActivity extends ClassActivityBase {
    readonly kind: 'demo-agenda';
    readonly theme: string;
    readonly items: readonly DemoAgendaItem[];
    readonly facilitator: string;
}

export interface DemoAgendaInput extends ClassActivityBaseInput {
    readonly theme?: string;
    readonly facilitator?: string;
    readonly items?: readonly Partial<DemoAgendaItem>[];
}

export type ClassActivity =
    | ClassPollActivity
    | RevealCompareActivity
    | DataProductRecipeActivity
    | EcosystemMapActivity
    | CourseResourceLandingActivity
    | SourceStandardDrawerActivity
    | GlossaryPopoverActivity
    | DemoAgendaActivity;

export interface ActivityRenderNode {
    readonly tag: string;
    readonly attrs: Readonly<Record<string, string>>;
    readonly text: string;
    readonly children: readonly ActivityRenderNode[];
}

const DEFAULT_RECIPE_STEPS: readonly DataProductRecipeStep[] = Object.freeze([
    Object.freeze({
        id: 'raw-data',
        kind: 'raw-data',
        label: 'Raw data',
        description: 'Unfiltered field, lab, document, or monitoring input.',
        output: 'Source record',
    }),
    Object.freeze({
        id: 'treated-data',
        kind: 'treated-data',
        label: 'Treated data',
        description: 'Cleaned, structured, unit-checked, and contextualized data.',
        output: 'Analysis-ready table',
    }),
    Object.freeze({
        id: 'insight',
        kind: 'insight',
        label: 'Insight',
        description: 'Pattern, anomaly, trend, or technical interpretation.',
        output: 'Evidence statement',
    }),
    Object.freeze({
        id: 'decision',
        kind: 'decision',
        label: 'Decision',
        description: 'Action choice, priority, or avoided decision based on uncertainty.',
        output: 'Decision note',
    }),
    Object.freeze({
        id: 'digital-product',
        kind: 'digital-product',
        label: 'Digital product',
        description: 'Reusable report, dashboard, model, workflow, or class artifact.',
        output: 'Reusable asset',
    }),
]);

const DEFAULT_ECOSYSTEM_NODES: readonly EcosystemMapNode[] = Object.freeze([
    Object.freeze({ id: 'files', label: 'Files', category: 'evidence', description: 'Decks, datasets, snapshots, and attachments.' }),
    Object.freeze({ id: 'datastudio', label: 'DataStudio', category: 'analysis', description: 'Tables, joins, filters, and exploratory checks.' }),
    Object.freeze({ id: 'pipelines', label: 'Pipelines', category: 'automation', description: 'Repeatable transformations and workflows.' }),
    Object.freeze({ id: 'reports', label: 'Reports', category: 'communication', description: 'Technical outputs for review and delivery.' }),
    Object.freeze({ id: 'sensors', label: 'Sensors', category: 'monitoring', description: 'Time series and live monitoring context.' }),
    Object.freeze({ id: 'governance', label: 'Governance', category: 'control', description: 'Traceability, approvals, and decision records.' }),
    Object.freeze({ id: 'eis', label: 'EIS', category: 'assessment', description: 'Environmental interpretation and impact narrative.' }),
]);

const DEFAULT_COURSE_RESOURCES: readonly CourseResourceItem[] = Object.freeze([
    Object.freeze({ id: 'deck', title: 'Class deck', type: 'deck', description: 'Slides used during the session.', cta: 'Open deck' }),
    Object.freeze({ id: 'gac-diagram', title: 'GAC diagram', type: 'diagram', description: 'Conceptual flow used in the class exercise.', cta: 'Open diagram' }),
    Object.freeze({ id: 'dataset-pack', title: 'Dataset pack', type: 'dataset', description: 'Local files for practice after class.', cta: 'Open files' }),
    Object.freeze({ id: 'references', title: 'References', type: 'reference', description: 'Standards, sources, and reading material.', cta: 'Open references' }),
]);

const DEFAULT_SOURCE_STANDARD_DRAWER: readonly SourceStandardDrawerItem[] = Object.freeze([
    Object.freeze({
        id: 'cnpq',
        title: 'Qualidade de amostras',
        source: 'ABNT',
        standardCode: 'NBR 10007',
        standardText: 'Rastreabilidade mínima para resultados.',
    }),
    Object.freeze({
        id: 'lsp',
        title: 'Incerteza e decisão',
        source: 'CETESB',
        standardCode: 'DD038',
        standardText: 'Separar premissas de incerteza para decisão.',
    }),
]);

const DEFAULT_GLOSSARY: readonly GlossaryEntry[] = Object.freeze([
    Object.freeze({ id: 'term-h1', term: 'Fonte', definition: 'Referência técnica consultável para validação.' }),
    Object.freeze({ id: 'term-h2', term: 'Fluxo', definition: 'Sequência de ações desde dado bruto até decisão.' }),
]);

const DEFAULT_DEMO_AGENDA: readonly DemoAgendaItem[] = Object.freeze([
    Object.freeze({
        id: 'agenda-1',
        time: '08:00',
        title: 'Abertura e objetivos',
        durationMin: 15,
        expectedOutput: 'Roteiro alinhado',
    }),
    Object.freeze({
        id: 'agenda-2',
        time: '08:15',
        title: 'Diagnóstico com fonte padrão',
        durationMin: 25,
        expectedOutput: 'Checklist de critérios',
    }),
    Object.freeze({
        id: 'agenda-3',
        time: '08:45',
        title: 'Encerramento',
        durationMin: 10,
        expectedOutput: 'Resumo com próximos passos',
    }),
]);

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : fallback;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
}

function optionalText(value: unknown): string | undefined {
    const cleaned = text(value);
    return cleaned ? cleaned : undefined;
}

function safeHref(value: unknown): string {
    const raw = optionalText(value);
    if (!raw) return '';
    return /^(javascript|vbscript|data):/i.test(raw.trim()) ? '' : raw.trim();
}

function idText(value: unknown, fallback: string): string {
    const raw = text(value, fallback).toLowerCase();
    const id = raw.replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
    return id || fallback;
}

function optionalId(value: unknown): string | null {
    const cleaned = optionalText(value);
    return cleaned ? idText(cleaned, cleaned) : null;
}

function slides(value: unknown): readonly number[] {
    const input = Array.isArray(value) ? value : [];
    const out: number[] = [];
    const seen = new Set<number>();
    for (const item of input) {
        const n = Number(item);
        if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
        seen.add(n);
        out.push(n);
    }
    return Object.freeze(out);
}

function lines(value: unknown): readonly string[] {
    const input = Array.isArray(value) ? value : [];
    const out = input.map((item) => text(item)).filter(Boolean);
    return Object.freeze(out);
}

function base(input: ClassActivityBaseInput, kind: ClassActivityKind, titleFallback: string): Omit<ClassActivityBase, 'kind'> {
    const summary = optionalText(input.summary);
    const out: {
        id: string;
        title: string;
        slideRefs: readonly number[];
        summary?: string;
    } = {
        id: idText(input.id, kind),
        title: text(input.title, titleFallback),
        slideRefs: slides(input.slideRefs),
    };
    if (summary) out.summary = summary;
    return out;
}

function pollOption(input: ClassPollOptionInput, index: number): ClassPollOption {
    if (typeof input === 'string') {
        return Object.freeze({ id: `option-${index + 1}`, label: text(input, `Option ${index + 1}`), votes: 0 });
    }
    const record = asRecord(input);
    const note = optionalText(record.note);
    const out: {
        id: string;
        label: string;
        votes: number;
        correct?: boolean;
        note?: string;
    } = {
        id: idText(record.id, `option-${index + 1}`),
        label: text(record.label, `Option ${index + 1}`),
        votes: Math.max(0, Math.round(Number(record.votes) || 0)),
    };
    if (record.correct === true) out.correct = true;
    if (note) out.note = note;
    return Object.freeze(out);
}

function compareSide(input: RevealCompareSideInput | undefined, fallbackId: string, fallbackLabel: string): RevealCompareSide {
    if (typeof input === 'string') {
        return Object.freeze({ id: fallbackId, label: fallbackLabel, value: text(input, fallbackLabel) });
    }
    const record = asRecord(input);
    const detail = optionalText(record.detail);
    const out: {
        id: string;
        label: string;
        value: string;
        detail?: string;
    } = {
        id: idText(record.id, fallbackId),
        label: text(record.label, fallbackLabel),
        value: text(record.value, fallbackLabel),
    };
    if (detail) out.detail = detail;
    return Object.freeze(out);
}

function recipeStep(input: Partial<DataProductRecipeStep>, index: number): DataProductRecipeStep {
    const fallback: DataProductRecipeStep = DEFAULT_RECIPE_STEPS[index] ?? {
        id: 'step',
        kind: 'raw-data',
        label: 'Step',
        description: 'Class activity step.',
    };
    const kind = DATA_PRODUCT_RECIPE_STEP_KINDS.includes(input.kind as DataProductRecipeStepKind)
        ? (input.kind as DataProductRecipeStepKind)
        : fallback.kind;
    const output = optionalText(input.output);
    const out: {
        id: string;
        kind: DataProductRecipeStepKind;
        label: string;
        description: string;
        output?: string;
    } = {
        id: idText(input.id, kind),
        kind,
        label: text(input.label, fallback.label),
        description: text(input.description, fallback.description),
    };
    if (output) out.output = output;
    return Object.freeze(out);
}

function ecosystemNode(input: Partial<EcosystemMapNode>, index: number): EcosystemMapNode {
    const fallback = DEFAULT_ECOSYSTEM_NODES[index];
    const description = optionalText(input.description ?? fallback?.description);
    const href = optionalText(input.href ?? fallback?.href);
    const out: {
        id: string;
        label: string;
        category: string;
        description?: string;
        href?: string;
    } = {
        id: idText(input.id ?? fallback?.id, `node-${index + 1}`),
        label: text(input.label ?? fallback?.label, `Node ${index + 1}`),
        category: text(input.category ?? fallback?.category, 'module'),
    };
    if (description) out.description = description;
    if (href) out.href = href;
    return Object.freeze(out);
}

function ecosystemLink(input: Partial<EcosystemMapLink>, index: number, centerId: string, fallbackTo: string): EcosystemMapLink {
    const label = optionalText(input.label);
    const out: { from: string; to: string; label?: string } = {
        from: idText(input.from, centerId),
        to: idText(input.to, fallbackTo || `node-${index + 1}`),
    };
    if (label) out.label = label;
    return Object.freeze(out);
}

/**
 * Resolve optional text field with fallback chain: input → default → undefined.
 *
 * @param {unknown} inputValue
 * @param {unknown} fallbackValue
 * @returns {string|undefined}
 */
function optionalWithFallback(inputValue: unknown, fallbackValue: unknown): string | undefined {
    return optionalText(inputValue ?? fallbackValue);
}

/**
 * Build a course resource object, attaching only defined optional fields.
 *
 * @param {Partial<CourseResourceItem>} input
 * @param {CourseResourceItem|undefined} fallback
 * @param {number} index
 * @returns {CourseResourceItem}
 */
function buildCourseResource(input: Partial<CourseResourceItem>, fallback: CourseResourceItem | undefined, index: number): CourseResourceItem {
    const type = isResourceType(input.type) ? input.type : fallback?.type ?? 'link';
    const out: {
        id: string;
        title: string;
        type: CourseResourceType;
        description?: string;
        url?: string;
        cta?: string;
    } = {
        id: idText(input.id ?? fallback?.id, `resource-${index + 1}`),
        title: text(input.title ?? fallback?.title, `Resource ${index + 1}`),
        type,
    };
    const description = optionalWithFallback(input.description, fallback?.description);
    const url = optionalWithFallback(input.url, fallback?.url);
    const cta = optionalWithFallback(input.cta, fallback?.cta);
    if (description) out.description = description;
    if (url) out.url = url;
    if (cta) out.cta = cta;
    return Object.freeze(out);
}

function resourceItem(input: Partial<CourseResourceItem>, index: number): CourseResourceItem {
    return buildCourseResource(input, DEFAULT_COURSE_RESOURCES[index], index);
}

function sourceStandardItem(input: Partial<SourceStandardDrawerItem>, index: number): SourceStandardDrawerItem {
    const fallback = DEFAULT_SOURCE_STANDARD_DRAWER[index];
    const out = {
        id: idText(input.id ?? fallback?.id, `standard-${index + 1}`),
        title: text(input.title ?? fallback?.title, `Source Standard ${index + 1}`),
        source: text(input.source ?? fallback?.source, 'Source'),
        standardCode: text(input.standardCode ?? fallback?.standardCode, 'STD-000'),
        standardText: text(input.standardText ?? fallback?.standardText, 'Use available references.'),
    };
    return Object.freeze(out);
}

function glossaryEntry(input: Partial<GlossaryEntry>, index: number): GlossaryEntry {
    const fallback = DEFAULT_GLOSSARY[index];
    const out: { id: string; term: string; definition: string; context?: string } = {
        id: idText(input.id ?? fallback?.id, `term-${index + 1}`),
        term: text(input.term ?? fallback?.term, `Term ${index + 1}`),
        definition: text(input.definition ?? fallback?.definition, 'Ajustar definição.'),
    };
    if (input.context || fallback?.context) {
        const context = optionalText(input.context ?? fallback?.context);
        if (context) out.context = context;
    }
    return Object.freeze(out);
}

function demoAgendaItem(input: Partial<DemoAgendaItem>, index: number): DemoAgendaItem {
    const fallback = DEFAULT_DEMO_AGENDA[index];
    const expectedOutput = optionalText(input.expectedOutput ?? fallback?.expectedOutput);
    const out: { id: string; time: string; title: string; durationMin: number; expectedOutput?: string } = {
        id: idText(input.id ?? fallback?.id, `agenda-${index + 1}`),
        time: text(input.time ?? fallback?.time, `Agen-${index + 1}`),
        title: text(input.title ?? fallback?.title, `Item ${index + 1}`),
        durationMin: Math.max(1, Math.round(Number(input.durationMin ?? fallback?.durationMin ?? 15))),
    };
    if (expectedOutput) out.expectedOutput = expectedOutput;
    return Object.freeze(out);
}

function isResourceType(value: unknown): value is CourseResourceType {
    return (
        value === 'deck' ||
        value === 'diagram' ||
        value === 'dataset' ||
        value === 'snapshot' ||
        value === 'reference' ||
        value === 'next-class' ||
        value === 'link'
    );
}

export function createClassPoll(input: ClassPollInput = {}): ClassPollActivity {
    const rawOptions = input.options && input.options.length > 0 ? input.options : ['A', 'B'];
    const activity: ClassPollActivity = Object.freeze({
        ...base(input, 'class-poll', 'Class Poll'),
        kind: 'class-poll',
        question: text(input.question, 'What should the class choose?'),
        options: Object.freeze(rawOptions.map((item, index) => pollOption(item, index))),
        selectedOptionId: optionalId(input.selectedOptionId),
        revealed: input.revealed === true,
    });
    return activity;
}

export function createRevealCompare(input: RevealCompareInput = {}): RevealCompareActivity {
    const sidesOut = Object.freeze([
        compareSide(input.left, 'a', 'A'),
        compareSide(input.right, 'b', 'B'),
    ]) as readonly [RevealCompareSide, RevealCompareSide];
    const explanation = optionalText(input.explanation);
    const out: {
        id: string;
        kind: 'reveal-compare';
        title: string;
        slideRefs: readonly number[];
        summary?: string;
        prompt: string;
        sides: readonly [RevealCompareSide, RevealCompareSide];
        selectedSideId: string | null;
        correctSideId: string | null;
        evidence: readonly string[];
        explanation?: string;
        revealed: boolean;
    } = {
        ...base(input, 'reveal-compare', 'Reveal Compare'),
        kind: 'reveal-compare',
        prompt: text(input.prompt, 'Which side is better supported by the evidence?'),
        sides: sidesOut,
        selectedSideId: optionalId(input.selectedSideId),
        correctSideId: optionalId(input.correctSideId),
        evidence: lines(input.evidence),
        revealed: input.revealed === true,
    };
    if (explanation) out.explanation = explanation;
    return Object.freeze(out);
}

export function createDataProductRecipe(input: DataProductRecipeInput = {}): DataProductRecipeActivity {
    const rawSteps = input.steps && input.steps.length > 0 ? input.steps : DEFAULT_RECIPE_STEPS;
    return Object.freeze({
        ...base(input, 'data-product-recipe', 'Data Product Recipe'),
        kind: 'data-product-recipe',
        steps: Object.freeze(rawSteps.map((item, index) => recipeStep(item, index))),
        activeStepId: optionalId(input.activeStepId),
    });
}

/**
 * Build the central node input for an ecosystem map.
 *
 * @param {Partial<EcosystemMapNode>|undefined} center
 * @returns {Partial<EcosystemMapNode>}
 */
function ecosystemCenterInput(center: Partial<EcosystemMapNode> | undefined): Partial<EcosystemMapNode> {
    const centerInput: {
        id?: string;
        label?: string;
        category?: string;
        description?: string;
        href?: string;
    } = {
        id: center?.id ?? 'training',
        label: center?.label ?? 'Training',
        category: center?.category ?? 'learning',
        description: center?.description ?? 'Course flow and class activity hub.',
    };
    if (center?.href) centerInput.href = center.href;
    return centerInput;
}

/**
 * Build default links from center to every node when none are provided.
 *
 * @param {EcosystemMapNode} center
 * @param {readonly EcosystemMapNode[]} nodes
 * @returns {readonly Partial<EcosystemMapLink>[]}
 */
function defaultEcosystemLinks(center: EcosystemMapNode, nodes: readonly EcosystemMapNode[]): readonly Partial<EcosystemMapLink>[] {
    return nodes.map((node) => Object.freeze({ from: center.id, to: node.id, label: node.category }));
}

export function createEcosystemMap(input: EcosystemMapInput = {}): EcosystemMapActivity {
    const center = ecosystemNode(ecosystemCenterInput(input.center), 0);
    const rawNodes = input.nodes && input.nodes.length > 0 ? input.nodes : DEFAULT_ECOSYSTEM_NODES;
    const nodesOut = Object.freeze(rawNodes.map((item, index) => ecosystemNode(item, index)));
    const rawLinks = input.links && input.links.length > 0 ? input.links : defaultEcosystemLinks(center, nodesOut);
    return Object.freeze({
        ...base(input, 'ecosystem-map', 'Ecosystem Map'),
        kind: 'ecosystem-map',
        center,
        nodes: nodesOut,
        links: Object.freeze(rawLinks.map((item, index) => ecosystemLink(item, index, center.id, nodesOut[index]?.id ?? 'node'))),
    });
}

export function createCourseResourceLanding(input: CourseResourceLandingInput = {}): CourseResourceLandingActivity {
    const rawResources = input.resources && input.resources.length > 0 ? input.resources : DEFAULT_COURSE_RESOURCES;
    const qrText = optionalText(input.qrText);
    const out: {
        id: string;
        kind: 'course-resource-landing';
        title: string;
        slideRefs: readonly number[];
        summary?: string;
        intro: string;
        resources: readonly CourseResourceItem[];
        nextSteps: readonly string[];
        qrText?: string;
    } = {
        ...base(input, 'course-resource-landing', 'Course Resource Landing'),
        kind: 'course-resource-landing',
        intro: text(input.intro, 'Materials and next steps for this class.'),
        resources: Object.freeze(rawResources.map((item, index) => resourceItem(item, index))),
        nextSteps: lines(input.nextSteps),
    };
    if (qrText) out.qrText = qrText;
    return Object.freeze(out);
}

export function createSourceStandardDrawer(input: SourceStandardDrawerInput = {}): SourceStandardDrawerActivity {
    const raw = input.standards && input.standards.length > 0 ? input.standards : DEFAULT_SOURCE_STANDARD_DRAWER;
    const out = {
        ...base(input, 'source-standard-drawer', 'Source Standard Drawer'),
        kind: 'source-standard-drawer' as const,
        context: text(input.context, 'Módulo 01'),
        standards: Object.freeze(raw.map((item, index) => sourceStandardItem(item, index))),
        activeStandardId: optionalId(input.activeStandardId),
    };
    return Object.freeze(out);
}

export function createGlossaryPopover(input: GlossaryPopoverInput = {}): GlossaryPopoverActivity {
    const raw = input.entries && input.entries.length > 0 ? input.entries : DEFAULT_GLOSSARY;
    const out = {
        ...base(input, 'glossary-popover', 'Glossary Popover'),
        kind: 'glossary-popover' as const,
        title: text(input.title, 'Glossário do módulo'),
        entries: Object.freeze(raw.map((entry, index) => glossaryEntry(entry, index))),
        open: input.open === true,
    };
    return Object.freeze(out);
}

export function createDemoAgenda(input: DemoAgendaInput = {}): DemoAgendaActivity {
    const raw = input.items && input.items.length > 0 ? input.items : DEFAULT_DEMO_AGENDA;
    const out = {
        ...base(input, 'demo-agenda', 'Demo Agenda'),
        kind: 'demo-agenda' as const,
        theme: text(input.theme, 'Módulo 01 - Base de fontes'),
        items: Object.freeze(raw.map((item, index) => demoAgendaItem(item, index))),
        facilitator: text(input.facilitator, 'Professor responsável'),
    };
    return Object.freeze(out);
}

export function totalPollVotes(activity: ClassPollActivity): number {
    return activity.options.reduce((sum, option) => sum + option.votes, 0);
}

export function pollVoteShare(activity: ClassPollActivity, optionId: string): number {
    const total = totalPollVotes(activity);
    if (total <= 0) return 0;
    const option = activity.options.find((item) => item.id === optionId);
    return option ? option.votes / total : 0;
}

export function voteClassPoll(activity: ClassPollActivity, optionId: string, increment = 1): ClassPollActivity {
    const targetId = idText(optionId, optionId);
    const delta = Math.max(0, Math.round(Number(increment) || 0));
    return Object.freeze({
        ...activity,
        options: Object.freeze(
            activity.options.map((option) =>
                option.id === targetId ? Object.freeze({ ...option, votes: option.votes + delta }) : option,
            ),
        ),
        selectedOptionId: targetId,
    });
}

export function revealClassActivity<T extends ClassActivity>(activity: T, revealed = true): T {
    if (activity.kind !== 'class-poll' && activity.kind !== 'reveal-compare') return activity;
    return Object.freeze({ ...activity, revealed }) as unknown as T;
}

function n(
    tag: string,
    attrs: Record<string, string> = {},
    children: readonly ActivityRenderNode[] = Object.freeze([]),
    content = '',
): ActivityRenderNode {
    return Object.freeze({
        tag,
        attrs: Object.freeze({ ...attrs }),
        text: content,
        children: Object.freeze([...children]),
    });
}

function shell(activity: ClassActivity, body: readonly ActivityRenderNode[]): ActivityRenderNode {
    const headerChildren: ActivityRenderNode[] = [
        n('p', { class: 'ecbt-class-activity__kind' }, [], activityLabel(activity.kind)),
        n('h3', { class: 'ecbt-class-activity__title' }, [], activity.title),
    ];
    if (activity.summary) headerChildren.push(n('p', { class: 'ecbt-class-activity__summary' }, [], activity.summary));
    return n(
        'section',
        {
            class: `ecbt-class-activity ecbt-class-activity--${activity.kind}`,
            'data-activity-id': activity.id,
            'data-activity-kind': activity.kind,
            'data-slide-refs': activity.slideRefs.join(','),
        },
        [n('header', { class: 'ecbt-class-activity__header' }, headerChildren), ...body],
    );
}

function activityLabel(kind: ClassActivityKind): string {
    return CLASS_ACTIVITY_COMPONENT_MODELS.find((item) => item.kind === kind)?.label ?? kind;
}

export function renderClassPoll(activity: ClassPollActivity): ActivityRenderNode {
    const total = totalPollVotes(activity);
    return shell(activity, [
        n('p', { class: 'ecbt-class-activity__prompt' }, [], activity.question),
        n(
            'ul',
            { class: 'ecbt-class-poll__options' },
            activity.options.map((option) => {
                const share = total > 0 ? Math.round((option.votes / total) * 100) : 0;
                const children: ActivityRenderNode[] = [
                    n(
                        'button',
                        { type: 'button', class: 'ecbt-class-poll__option-button', 'data-option-id': option.id },
                        [],
                        option.label,
                    ),
                ];
                if (activity.revealed) {
                    children.push(
                        n('span', { class: 'ecbt-class-poll__result', 'data-votes': String(option.votes) }, [], `${share}% (${option.votes})`),
                    );
                }
                if (activity.revealed && option.note) {
                    children.push(n('span', { class: 'ecbt-class-poll__note' }, [], option.note));
                }
                return n(
                    'li',
                    {
                        class: 'ecbt-class-poll__option',
                        'data-option-id': option.id,
                        'data-selected': String(activity.selectedOptionId === option.id),
                        'data-correct': String(option.correct === true),
                    },
                    children,
                );
            }),
        ),
    ]);
}

export function renderRevealCompare(activity: RevealCompareActivity): ActivityRenderNode {
    const sideNodes = activity.sides.map((side) => {
        const children: ActivityRenderNode[] = [
            n('h4', { class: 'ecbt-reveal-compare__side-title' }, [], side.label),
            n('p', { class: 'ecbt-reveal-compare__side-value' }, [], side.value),
        ];
        if (side.detail) children.push(n('p', { class: 'ecbt-reveal-compare__side-detail' }, [], side.detail));
        return n(
            'article',
            {
                class: 'ecbt-reveal-compare__side',
                'data-side-id': side.id,
                'data-selected': String(activity.selectedSideId === side.id),
                'data-correct': String(activity.correctSideId === side.id),
            },
            children,
        );
    });
    const body: ActivityRenderNode[] = [
        n('p', { class: 'ecbt-class-activity__prompt' }, [], activity.prompt),
        n('div', { class: 'ecbt-reveal-compare__sides' }, sideNodes),
    ];
    if (activity.revealed) {
        const evidenceChildren = activity.evidence.map((item) => n('li', { class: 'ecbt-reveal-compare__evidence-item' }, [], item));
        if (activity.explanation) evidenceChildren.push(n('li', { class: 'ecbt-reveal-compare__explanation' }, [], activity.explanation));
        body.push(n('ol', { class: 'ecbt-reveal-compare__evidence' }, evidenceChildren));
    } else {
        body.push(n('button', { type: 'button', class: 'ecbt-reveal-compare__reveal' }, [], 'Reveal evidence'));
    }
    return shell(activity, body);
}

export function renderDataProductRecipe(activity: DataProductRecipeActivity): ActivityRenderNode {
    return shell(activity, [
        n(
            'ol',
            { class: 'ecbt-data-product-recipe__steps' },
            activity.steps.map((step, index) => {
                const children: ActivityRenderNode[] = [
                    n('span', { class: 'ecbt-data-product-recipe__step-index' }, [], String(index + 1)),
                    n('h4', { class: 'ecbt-data-product-recipe__step-title' }, [], step.label),
                    n('p', { class: 'ecbt-data-product-recipe__step-description' }, [], step.description),
                ];
                if (step.output) children.push(n('p', { class: 'ecbt-data-product-recipe__step-output' }, [], step.output));
                return n(
                    'li',
                    {
                        class: 'ecbt-data-product-recipe__step',
                        'data-step-id': step.id,
                        'data-step-kind': step.kind,
                        'data-active': String(activity.activeStepId === step.id),
                    },
                    children,
                );
            }),
        ),
    ]);
}

export function renderEcosystemMap(activity: EcosystemMapActivity): ActivityRenderNode {
    return shell(activity, [
        n('article', { class: 'ecbt-ecosystem-map__center', 'data-node-id': activity.center.id }, [
            n('h4', { class: 'ecbt-ecosystem-map__center-title' }, [], activity.center.label),
            n('p', { class: 'ecbt-ecosystem-map__center-category' }, [], activity.center.category),
        ]),
        n(
            'ul',
            { class: 'ecbt-ecosystem-map__nodes' },
            activity.nodes.map((node) => {
                const children: ActivityRenderNode[] = [
                    n('h4', { class: 'ecbt-ecosystem-map__node-title' }, [], node.label),
                    n('p', { class: 'ecbt-ecosystem-map__node-category' }, [], node.category),
                ];
                if (node.description) children.push(n('p', { class: 'ecbt-ecosystem-map__node-description' }, [], node.description));
                return n('li', { class: 'ecbt-ecosystem-map__node', 'data-node-id': node.id }, children);
            }),
        ),
        n(
            'ul',
            { class: 'ecbt-ecosystem-map__links' },
            activity.links.map((link) =>
                n('li', { class: 'ecbt-ecosystem-map__link', 'data-from': link.from, 'data-to': link.to }, [], link.label ?? `${link.from} to ${link.to}`),
            ),
        ),
    ]);
}

export function renderCourseResourceLanding(activity: CourseResourceLandingActivity): ActivityRenderNode {
    const body: ActivityRenderNode[] = [
        n('p', { class: 'ecbt-course-resource-landing__intro' }, [], activity.intro),
        n(
            'ul',
            { class: 'ecbt-course-resource-landing__resources' },
            activity.resources.map((resource) => {
                const title = resource.url
                    ? n(
                          'a',
                          {
                              class: 'ecbt-course-resource-landing__resource-link',
                              href: safeHref(resource.url),
                              rel: 'noopener',
                          },
                          [],
                          resource.title,
                      )
                    : n('span', { class: 'ecbt-course-resource-landing__resource-title' }, [], resource.title);
                const children: ActivityRenderNode[] = [title, n('span', { class: 'ecbt-course-resource-landing__resource-type' }, [], resource.type)];
                if (resource.description) {
                    children.push(n('p', { class: 'ecbt-course-resource-landing__resource-description' }, [], resource.description));
                }
                if (resource.cta) children.push(n('span', { class: 'ecbt-course-resource-landing__resource-cta' }, [], resource.cta));
                return n('li', { class: 'ecbt-course-resource-landing__resource', 'data-resource-id': resource.id }, children);
            }),
        ),
    ];
    if (activity.nextSteps.length > 0) {
        body.push(
            n(
                'ol',
                { class: 'ecbt-course-resource-landing__next-steps' },
                activity.nextSteps.map((item) => n('li', { class: 'ecbt-course-resource-landing__next-step' }, [], item)),
            ),
        );
    }
    if (activity.qrText) body.push(n('p', { class: 'ecbt-course-resource-landing__qr' }, [], activity.qrText));
    return shell(activity, body);
}

export function renderSourceStandardDrawer(activity: SourceStandardDrawerActivity): ActivityRenderNode {
    return shell(activity, [
        n('p', { class: 'ecbt-source-standard-drawer__context' }, [], activity.context),
        n(
            'ul',
            { class: 'ecbt-source-standard-drawer__list' },
            activity.standards.map((item) =>
                n(
                    'li',
                    {
                        class: 'ecbt-source-standard-drawer__item',
                        'data-standard-id': item.id,
                        'data-active': String(activity.activeStandardId === item.id),
                    },
                    [
                        n('h4', { class: 'ecbt-source-standard-drawer__title' }, [], item.title),
                        n('p', { class: 'ecbt-source-standard-drawer__source' }, [], `${item.source} ${item.standardCode}`),
                        n('p', { class: 'ecbt-source-standard-drawer__text' }, [], item.standardText),
                    ],
                ),
            ),
        ),
    ]);
}

export function renderGlossaryPopover(activity: GlossaryPopoverActivity): ActivityRenderNode {
    return shell(activity, [
        n('h4', { class: 'ecbt-glossary-popover__title' }, [], activity.title),
        n(
            'ul',
            { class: `ecbt-glossary-popover__entries ${activity.open ? 'ecbt-glossary-popover__entries--open' : ''}`.trim() },
            activity.entries.map((entry) =>
                n(
                    'li',
                    {
                        class: 'ecbt-glossary-popover__entry',
                        'data-glossary-id': entry.id,
                        'data-open': String(activity.open),
                    },
                    [
                        n('strong', { class: 'ecbt-glossary-popover__term' }, [], entry.term),
                        n('p', { class: 'ecbt-glossary-popover__definition' }, [], entry.definition),
                        ...(entry.context ? [n('span', { class: 'ecbt-glossary-popover__context' }, [], entry.context)] : []),
                    ],
                ),
            ),
        ),
        n('button', { type: 'button', class: 'ecbt-glossary-popover__toggle' }, [], activity.open ? 'Ocultar termos' : 'Mostrar termos'),
    ]);
}

export function renderDemoAgenda(activity: DemoAgendaActivity): ActivityRenderNode {
    return shell(activity, [
        n('p', { class: 'ecbt-demo-agenda__theme' }, [], activity.theme),
        n('p', { class: 'ecbt-demo-agenda__facilitator' }, [], `Facilitador: ${activity.facilitator}`),
        n(
            'ol',
            { class: 'ecbt-demo-agenda__items' },
            activity.items.map((item) =>
                n(
                    'li',
                    { class: 'ecbt-demo-agenda__item', 'data-agenda-id': item.id },
                    [
                        n('span', { class: 'ecbt-demo-agenda__time' }, [], item.time),
                        n('span', { class: 'ecbt-demo-agenda__title' }, [], item.title),
                        n('span', { class: 'ecbt-demo-agenda__duration' }, [], `${item.durationMin} min`),
                        ...(item.expectedOutput ? [n('p', { class: 'ecbt-demo-agenda__output' }, [], item.expectedOutput)] : []),
                    ],
                ),
            ),
        ),
    ]);
}

export function renderActivityTree(activity: ClassActivity): ActivityRenderNode {
    switch (activity.kind) {
        case 'class-poll':
            return renderClassPoll(activity);
        case 'reveal-compare':
            return renderRevealCompare(activity);
        case 'data-product-recipe':
            return renderDataProductRecipe(activity);
        case 'ecosystem-map':
            return renderEcosystemMap(activity);
        case 'course-resource-landing':
            return renderCourseResourceLanding(activity);
        case 'source-standard-drawer':
            return renderSourceStandardDrawer(activity);
        case 'glossary-popover':
            return renderGlossaryPopover(activity);
        case 'demo-agenda':
            return renderDemoAgenda(activity);
        default: {
            const _exhaustive: never = activity;
            return _exhaustive;
        }
    }
}

export function renderActivityHtml(activity: ClassActivity): string {
    return renderNodeHtml(renderActivityTree(activity));
}

export function renderNodeHtml(node: ActivityRenderNode): string {
    const attrs = Object.entries(node.attrs)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => ` ${escapeHtml(key)}="${escapeHtml(value)}"`)
        .join('');
    const content = `${escapeHtml(node.text)}${node.children.map((child) => renderNodeHtml(child)).join('')}`;
    return `<${node.tag}${attrs}>${content}</${node.tag}>`;
}

export function renderActivityElement(activity: ClassActivity, documentRef: Document): HTMLElement {
    return renderNodeElement(renderActivityTree(activity), documentRef);
}

export function renderNodeElement(node: ActivityRenderNode, documentRef: Document): HTMLElement {
    const element = documentRef.createElement(node.tag);
    for (const [key, value] of Object.entries(node.attrs)) {
        if (value !== '') element.setAttribute(key, value);
    }
    if (node.text) element.appendChild(documentRef.createTextNode(node.text));
    for (const child of node.children) {
        element.appendChild(renderNodeElement(child, documentRef));
    }
    return element;
}

export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
