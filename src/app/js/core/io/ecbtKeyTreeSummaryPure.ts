// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   ECBT KEY TREE SUMMARY (pure)

   Builds the "O que voce encontrara nessa chave" tree from a decoded key.
   This module is intentionally pure: no DOM, no storage, no network, no
   mutation of the decoded artifact.
   ================================================================ */

export type EcbtKeyTreeSeverity = 'info' | 'warning' | 'blocked';
export type EcbtKeyTreeStatus = 'ready' | 'attention' | 'blocked' | 'unknown';

export interface EcbtKeyTreeWarning {
    readonly code: string;
    readonly severity: EcbtKeyTreeSeverity;
    readonly message: string;
    readonly path?: string;
    readonly refId?: string;
}

export interface EcbtKeyGoAction {
    readonly label: string;
    readonly type: 'handler' | 'tab' | 'none';
    readonly handler?: string;
    readonly args?: readonly unknown[];
    readonly tabId?: string;
    readonly fallbackTabId?: string;
    readonly fallbackMessage?: string;
}

export interface EcbtKeySemanticMapItem {
    readonly id: string;
    readonly from: string;
    readonly meaning: string;
    readonly to: string;
    readonly reason?: string;
    readonly status?: EcbtKeyTreeStatus;
    readonly action?: EcbtKeyGoAction;
}

export interface EcbtKeyTreeNode {
    readonly id: string;
    readonly title: string;
    readonly type: string;
    readonly count?: number;
    readonly status?: EcbtKeyTreeStatus;
    readonly meta?: Readonly<Record<string, string | number | boolean | null>>;
    readonly action?: EcbtKeyGoAction;
    readonly children?: readonly EcbtKeyTreeNode[];
}

export interface EcbtKeyTreeCounts {
    readonly lessons: number;
    readonly slides: number;
    readonly assets: number;
    readonly liveModules: number;
    readonly files: number;
    readonly warnings: number;
    readonly elements: number;
    readonly campaigns: number;
    readonly scenes: number;
    readonly libraries: number;
}

export interface EcbtKeyTreeSummary {
    readonly schema: 'ecbt-key-tree-summary@1';
    readonly id: string;
    readonly title: string;
    readonly type: string;
    readonly keyFormat?: string;
    readonly schemaVersion?: number;
    readonly counts: EcbtKeyTreeCounts;
    readonly semanticMap?: readonly EcbtKeySemanticMapItem[];
    readonly root: EcbtKeyTreeNode;
    readonly warnings: readonly EcbtKeyTreeWarning[];
}

export interface EcbtKeyTreeSummaryOptions {
    readonly sourceName?: string;
    readonly keyFormat?: string;
}

interface PortableWrapperLike {
    readonly _kind?: unknown;
    readonly schemaVersion?: unknown;
    readonly artifact?: unknown;
}

interface TrainingFileLike {
    readonly id?: unknown;
    readonly fileId?: unknown;
    readonly filename?: unknown;
    readonly name?: unknown;
    readonly label?: unknown;
    readonly role?: unknown;
    readonly type?: unknown;
    readonly mimeType?: unknown;
    readonly extension?: unknown;
    readonly storagePath?: unknown;
    readonly path?: unknown;
    readonly url?: unknown;
    readonly bucket?: unknown;
}

interface FileRef {
    readonly id: string;
    readonly title: string;
    readonly role: string;
    readonly type: string;
    readonly path: string;
    readonly source: 'assetFiles' | 'markdown' | 'filesSync' | 'unknown';
}

const EMPTY_COUNTS: EcbtKeyTreeCounts = Object.freeze({
    lessons: 0,
    slides: 0,
    assets: 0,
    liveModules: 0,
    files: 0,
    warnings: 0,
    elements: 0,
    campaigns: 0,
    scenes: 0,
    libraries: 0,
});

function text(value: unknown, fallback = ''): string {
    const out = typeof value === 'string' ? value.trim() : '';
    return out || fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function asArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stableId(value: unknown, fallback: string): string {
    const raw = text(value, fallback)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return raw || fallback;
}

function getPath(obj: any, path: readonly string[]): unknown {
    let cur = obj;
    for (const part of path) {
        if (!cur || typeof cur !== 'object') return undefined;
        cur = cur[part];
    }
    return cur;
}

function countRecords(value: unknown): number {
    if (Array.isArray(value)) return value.length;
    if (isObject(value)) return Object.keys(value).length;
    return 0;
}

function child(
    id: string,
    title: string,
    type: string,
    options: Partial<Omit<EcbtKeyTreeNode, 'id' | 'title' | 'type'>> = {},
): EcbtKeyTreeNode {
    return Object.freeze({
        id,
        title,
        type,
        ...(typeof options.count === 'number' ? { count: options.count } : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.meta ? { meta: Object.freeze({ ...options.meta }) } : {}),
        ...(options.action ? { action: Object.freeze({ ...options.action }) } : {}),
        ...(options.children ? { children: Object.freeze([...options.children]) } : {}),
    });
}

function handlerAction(
    label: string,
    handler: string,
    args: readonly unknown[] = [],
    fallbackMessage = '',
    fallbackTabId = '',
): EcbtKeyGoAction {
    return Object.freeze({
        label,
        type: 'handler',
        handler,
        ...(args.length ? { args: Object.freeze([...args]) } : {}),
        ...(fallbackTabId ? { fallbackTabId } : {}),
        ...(fallbackMessage ? { fallbackMessage } : {}),
    });
}

function tabAction(label: string, tabId: string, fallbackMessage = ''): EcbtKeyGoAction {
    return Object.freeze({
        label,
        type: 'tab',
        tabId,
        ...(fallbackMessage ? { fallbackMessage } : {}),
    });
}

function semanticItem(
    id: string,
    from: string,
    meaning: string,
    to: string,
    action: EcbtKeyGoAction | undefined,
    reason: string,
    status: EcbtKeyTreeStatus = 'ready',
): EcbtKeySemanticMapItem {
    return Object.freeze({
        id,
        from,
        meaning,
        to,
        reason,
        status,
        ...(action ? { action } : {}),
    });
}

function emptySummary(title: string, type = 'unknown', options: EcbtKeyTreeSummaryOptions = {}): EcbtKeyTreeSummary {
    const warnings: EcbtKeyTreeWarning[] = [
        {
            code: 'ecbt.key.empty_or_unknown',
            severity: 'warning',
            message: 'Nao foi possivel identificar uma estrutura clara dentro desta chave.',
        },
    ];
    const counts = { ...EMPTY_COUNTS, warnings: warnings.length };
    const root = child('root', title, type, {
        status: 'unknown',
        children: [
            child('warnings', 'Avisos', 'folder', {
                count: warnings.length,
                status: 'attention',
                children: warnings.map((w) => child(w.code, w.message, 'warning', { status: 'attention' })),
            }),
        ],
    });
    return Object.freeze({
        schema: 'ecbt-key-tree-summary@1',
        id: stableId(`${type}-${title}`, 'ecbt-key'),
        title,
        type,
        ...(options.keyFormat ? { keyFormat: options.keyFormat } : {}),
        counts: Object.freeze(counts),
        root,
        warnings: Object.freeze(warnings),
    });
}

function detectPortableWrapper(decoded: unknown): { kind: string; schemaVersion?: number; artifact: unknown } | null {
    if (!isObject(decoded)) return null;
    const wrapper = decoded as PortableWrapperLike;
    const kind = text(wrapper._kind);
    if (!kind || !('artifact' in wrapper)) return null;
    const schemaVersion = numberOrUndefined(wrapper.schemaVersion);
    return {
        kind,
        ...(typeof schemaVersion === 'number' ? { schemaVersion } : {}),
        artifact: wrapper.artifact,
    };
}

function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
    if (depth > 6 || value == null) return out;
    if (typeof value === 'string') {
        out.push(value);
        return out;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectStrings(item, out, depth + 1);
        return out;
    }
    if (isObject(value)) {
        for (const item of Object.values(value)) collectStrings(item, out, depth + 1);
    }
    return out;
}

function uniqueFileRefs(refs: readonly FileRef[]): FileRef[] {
    const seen = new Set<string>();
    const out: FileRef[] = [];
    for (const ref of refs) {
        const key = `${ref.source}:${ref.role}:${ref.path || ref.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(ref);
    }
    return out;
}

function inferFileType(value: TrainingFileLike): string {
    const role = text(value.role).toLowerCase();
    const explicit = text(value.type).toLowerCase();
    const mime = text(value.mimeType).toLowerCase();
    const ext = text(value.extension).toLowerCase();
    const pathValue = `${text(value.filename)} ${text(value.name)} ${text(value.path)} ${text(value.storagePath)} ${text(value.url)}`.toLowerCase();
    if (explicit) return explicit;
    if (role.includes('video') || mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\b|$)/.test(pathValue)) return 'video';
    if (role.includes('image') || mime.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)(\b|$)/.test(pathValue)) return 'image';
    if (mime.includes('pdf') || /\.pdf(\b|$)/.test(pathValue)) return 'document';
    if (ext) return ext.replace(/^\./, '');
    return 'file';
}

function fileTitle(value: TrainingFileLike, index: number): string {
    return text(value.label)
        || text(value.filename)
        || text(value.name)
        || text(value.fileId)
        || text(value.id)
        || `Arquivo ${index + 1}`;
}

function collectTrainingAssetFiles(course: any): FileRef[] {
    const refs: FileRef[] = [];
    const assetFiles = getPath(course, ['assetFiles', 'files']);
    asArray(assetFiles).forEach((file: TrainingFileLike, index) => {
        const title = fileTitle(file, index);
        const path = text(file.storagePath) || text(file.path) || text(file.url) || text(file.fileId) || text(file.id);
        refs.push({
            id: stableId(text(file.id) || text(file.fileId) || title, `asset-${index + 1}`),
            title,
            role: text(file.role, 'arquivo'),
            type: inferFileType(file),
            path,
            source: 'assetFiles',
        });
    });

    const filesSync = getPath(course, ['filesSync', 'files']);
    asArray(filesSync).forEach((file: TrainingFileLike, index) => {
        const title = fileTitle(file, index);
        refs.push({
            id: stableId(text(file.id) || text(file.fileId) || title, `files-sync-${index + 1}`),
            title,
            role: text(file.role, 'arquivo'),
            type: inferFileType(file),
            path: text(file.storagePath) || text(file.path) || text(file.url) || text(file.fileId) || text(file.id),
            source: 'filesSync',
        });
    });

    return uniqueFileRefs(refs);
}

export function extractTrainingMarkdownFileRefs(lessons: unknown): readonly FileRef[] {
    const refs: FileRef[] = [];
    const pattern = /(?:files:\/\/|supabase:\/\/|https?:\/\/[^\s)"']+storage\/v1\/object[^\s)"']*|(?:^|[\s("'])files\/[^\s)"']+)/gi;
    asArray(lessons).forEach((lesson: any, lessonIndex) => {
        const strings = collectStrings(lesson);
        let refIndex = 0;
        for (const value of strings) {
            for (const match of value.matchAll(pattern)) {
                const raw = String(match[0] || '').trim().replace(/^[("']+/, '');
                if (!raw) continue;
                const lower = raw.toLowerCase();
                const type = /\.(mp4|webm|mov|m4v)(\b|$)/.test(lower)
                    ? 'video'
                    : /\.(png|jpg|jpeg|gif|webp|svg)(\b|$)/.test(lower)
                      ? 'image'
                      : 'file';
                refs.push({
                    id: stableId(`${lessonIndex + 1}-${refIndex + 1}-${raw}`, `markdown-ref-${lessonIndex + 1}-${refIndex + 1}`),
                    title: raw.split('/').pop() || raw,
                    role: 'referencia_em_texto',
                    type,
                    path: raw,
                    source: 'markdown',
                });
                refIndex += 1;
            }
        }
    });
    return Object.freeze(uniqueFileRefs(refs));
}

function buildTrainingWarnings(course: any, lessons: readonly any[], files: readonly FileRef[]): EcbtKeyTreeWarning[] {
    const warnings: EcbtKeyTreeWarning[] = [];
    const title = text(course.title).toLowerCase();
    const status = text(course.status, 'draft');
    const assetStatus = text(getPath(course, ['assetFiles', 'status']));
    const failures = asArray(getPath(course, ['assetFiles', 'failures']));
    const sourcePptxStatus = text(getPath(course, ['sourcePptx', 'status']));
    const teachingModel = course.teachingModel || course.teaching_model || course.teachingPlan;

    if (status === 'draft') {
        warnings.push({
            code: 'training.key.status_draft',
            severity: 'info',
            message: 'O curso esta como rascunho; antes da aula, revise e publique quando estiver pronto.',
        });
    }
    if ((title.includes('intro') || title.includes('modulo 01') || title.includes('módulo 01')) && lessons.length !== 33) {
        warnings.push({
            code: 'training.key.expected_33_mismatch',
            severity: 'warning',
            message: `Este modulo parece ser o Modulo 01 introdutorio, mas contem ${lessons.length} licoes em vez de 33.`,
        });
    }
    if (sourcePptxStatus === 'not_uploaded_by_request') {
        warnings.push({
            code: 'training.key.pptx_not_uploaded',
            severity: 'info',
            message: 'O PPTX original nao foi incluido por decisao operacional; a chave referencia imagens e videos enviados ao Files.',
        });
    }
    if (assetStatus && assetStatus !== 'uploaded') {
        warnings.push({
            code: 'training.key.asset_files_not_uploaded',
            severity: 'warning',
            message: 'Nem todos os arquivos de apoio aparecem como enviados ao Files/Supabase.',
        });
    }
    if (failures.length > 0) {
        warnings.push({
            code: 'training.key.asset_file_failures',
            severity: 'blocked',
            message: `${failures.length} arquivo(s) de apoio falharam no preparo da chave.`,
        });
    }
    if (!teachingModel) {
        warnings.push({
            code: 'training.key.missing_teaching_model',
            severity: 'warning',
            message: 'Nao encontrei um modelo geral de aula dentro da chave; os slides podem abrir sem amarracao pedagogica.',
        });
    }
    const videoMarkdownRefs = files.filter((ref) => ref.source === 'markdown' && ref.type === 'video');
    if (videoMarkdownRefs.length > 0) {
        warnings.push({
            code: 'training.key.video_refs_in_markdown',
            severity: 'info',
            message: `${videoMarkdownRefs.length} video(s) aparecem como referencia em texto; confirme se o player interno esta vinculado.`,
        });
    }
    return warnings;
}

function groupFilesByRole(files: readonly FileRef[]): readonly EcbtKeyTreeNode[] {
    const groups = new Map<string, FileRef[]>();
    for (const file of files) {
        const key = file.role || file.type || 'arquivo';
        const current = groups.get(key) || [];
        current.push(file);
        groups.set(key, current);
    }
    return Object.freeze(
        Array.from(groups.entries()).map(([role, items]) =>
            child(`files-${stableId(role, 'role')}`, labelForRole(role), 'folder', {
                count: items.length,
                status: 'ready',
                children: items.slice(0, 80).map((file) =>
                    child(file.id, file.title, 'file', {
                        status: 'ready',
                        meta: {
                            role: file.role,
                            type: file.type,
                            source: file.source,
                            path: file.path || null,
                        },
                    }),
                ).concat(
                    items.length > 80
                        ? [child(`files-${stableId(role, 'role')}-more`, `E mais ${items.length - 80} arquivo(s)`, 'count')]
                        : [],
                ),
            }),
        ),
    );
}

function labelForRole(role: string): string {
    const r = role.toLowerCase();
    if (r === 'slide_image') return 'Imagens dos slides';
    if (r === 'ppt_media_image') return 'Imagens internas do PPT';
    if (r === 'video') return 'Videos';
    if (r === 'referencia_em_texto') return 'Referencias encontradas nos textos';
    return role.replace(/_/g, ' ') || 'Arquivos';
}

function collectLiveModules(course: any): EcbtKeyTreeNode[] {
    const nodes: EcbtKeyTreeNode[] = [];
    const teachingModel = course.teachingModel || course.teaching_model || course.teachingPlan;
    if (teachingModel) {
        const modelKey = text(teachingModel.key) || text(teachingModel.id) || text(teachingModel.modelKey) || 'modelo_de_aula';
        nodes.push(
            child('live-teaching-model', 'Modelo geral da aula', 'live-module', {
                status: 'ready',
                meta: {
                    ref: modelKey,
                    title: text(teachingModel.title) || text(teachingModel.name) || null,
                },
            }),
        );
    }

    const strings = collectStrings(course);
    const moduleRefs = new Set<string>();
    for (const value of strings) {
        const matches = value.match(
            /\b(?:gac|pipeline|pipelines|mann[-\s]?kendall|datastudio|data\s*studio|analytics|dom|modelo\s*3d|cronograma|gantt|agil|agile|governance|governanca|storyboard|grafico|chart|training|files|buckets)\b/gi,
        );
        if (!matches) continue;
        for (const match of matches) moduleRefs.add(match.toLowerCase().replace(/\s+/g, '-'));
    }
    for (const ref of Array.from(moduleRefs).sort()) {
        nodes.push(
            child(`live-${stableId(ref, 'module')}`, labelForLiveModule(ref), 'live-module', {
                status: 'ready',
                meta: { ref },
            }),
        );
    }
    return nodes;
}

function labelForLiveModule(ref: string): string {
    const map: Record<string, string> = {
        gac: 'GAC / fluxos e pipelines',
        pipeline: 'Pipelines',
        'mann-kendall': 'Mann-Kendall',
        datastudio: 'DataStudio',
        'data-studio': 'DataStudio',
        analytics: 'Analytics',
        dom: 'Elementos do DOM / tela ao vivo',
        'modelo-3d': 'Modelo 3D',
        cronograma: 'Cronograma de projeto',
        gantt: 'Gantt de governanca',
        agil: 'Metodologia agil',
        agile: 'Metodologia agil',
        governance: 'Governanca',
        governanca: 'Governanca',
        storyboard: 'Storyboard da aula',
        grafico: 'Graficos',
        chart: 'Graficos',
        training: 'Training',
        files: 'Files',
        buckets: 'Buckets Supabase',
    };
    return map[ref] || ref;
}

function moduleRefSet(liveModules: readonly EcbtKeyTreeNode[]): Set<string> {
    const out = new Set<string>();
    for (const node of liveModules) {
        const ref = text(node.meta?.ref);
        if (ref) out.add(ref.toLowerCase());
        out.add(node.title.toLowerCase());
    }
    return out;
}

function hasSemanticSignal(corpus: string, refs: ReadonlySet<string>, pattern: RegExp): boolean {
    if (pattern.test(corpus)) return true;
    for (const ref of refs) {
        pattern.lastIndex = 0;
        if (pattern.test(ref)) return true;
    }
    return false;
}

function buildTrainingSemanticMap(
    course: any,
    lessons: readonly any[],
    files: readonly FileRef[],
    liveModules: readonly EcbtKeyTreeNode[],
    warnings: readonly EcbtKeyTreeWarning[],
): readonly EcbtKeySemanticMapItem[] {
    const corpus = collectStrings(course).join(' ').toLowerCase();
    const refs = moduleRefSet(liveModules);
    const out: EcbtKeySemanticMapItem[] = [];
    const isIntroModule01 = /intro|modulo\s*01|m[oó]dulo\s*01|dados\s+ambientais/.test(corpus);
    const hasGac = hasSemanticSignal(corpus, refs, /\b(gac|dd\s*0?38|dd38|pipeline|pipelines)\b/g);
    const hasDataStudio = hasSemanticSignal(corpus, refs, /\b(datastudio|data\s*studio|analytics|mann[-\s]?kendall|gr[aá]fico|chart|temporal)\b/g);
    const hasGantt = hasSemanticSignal(corpus, refs, /\b(gantt|cronograma|agil|[aá]gil|agile|governance|projeto)\b/g);
    const hasDom = hasSemanticSignal(corpus, refs, /\b(dom|modelo\s*3d|canvas|tela\s+ao\s+vivo|elementos?)\b/g);
    const hasStoryboardGovernance = hasSemanticSignal(
        corpus,
        refs,
        /\b(storyboard|roteiro\s+visual|narrativa|governance|governanca|decisao|decisoes|auditoria)\b/g,
    );
    const hasTeachingModel = Boolean(course.teachingModel || course.teaching_model || course.teachingPlan);
    const courseId = text(course.id) || text(course.training_id) || text(course.title) || 'training-course';

    out.push(
        semanticItem(
            'sem-course-training',
            'Roteiro da aula',
            'Roteiro da aula, com a ordem que o professor pretende apresentar.',
            'Training / painel PPT',
            handlerAction(
                'Abrir PPT',
                'handleOpenTraining',
                [Object.freeze({ activeTab: 'myCourses', skipResume: true })],
                'Nao encontrei o modulo Training; use o sumario da chave como roteiro.',
            ),
            `${lessons.length} licao(oes) estruturam a apresentacao interna.`,
        ),
    );

    if (lessons.length > 0) {
        out.push(
            semanticItem(
                'sem-slide-sequence',
                'Slides da aula',
                'Cada licao corresponde a um slide ou momento de aula.',
                'Sequencia do painel PPT',
                handlerAction(
                    'Abrir PPT',
                    'handleOpenTraining',
                    [Object.freeze({ activeTab: 'myCourses', skipResume: true })],
                    'Abra o Training e use a faixa de slides do curso.',
                ),
                `Foram encontrados ${lessons.length} slides/etapas para navegar.`,
            ),
        );
    }

    if (files.length > 0) {
        out.push(
            semanticItem(
                'sem-files-bucket',
                'Arquivos de apoio',
                'Imagens, videos e midias que sustentam os slides sem carregar o PPTX bruto.',
                'Files / bucket pessoal Supabase',
                handlerAction(
                    'Abrir Files da aula',
                    'handleOpenFiles',
                    [
                        Object.freeze({
                            training: true,
                            label: 'Files da aula',
                            hint: `${files.length} arquivo(s) da chave ECBT desta aula.`,
                            filter: Object.freeze({
                                courseId,
                                purpose: 'class-assets',
                                source: 'import',
                                scopeType: 'workspace',
                                tag: 'training',
                            }),
                            previewFiles: Object.freeze(
                                files.slice(0, 120).map((file) =>
                                    Object.freeze({
                                        id: file.id,
                                        filename: file.title,
                                        role: file.role,
                                        type: file.type,
                                        source: file.source,
                                        path: file.path,
                                    }),
                                ),
                            ),
                        }),
                    ],
                    'Nao encontrei o modulo Files; confira os caminhos listados na pasta Arquivos e midias.',
                    'files',
                ),
                `${files.length} arquivo(s) ou midia(s) foram vinculados ao curso.`,
            ),
        );
    }

    if (hasTeachingModel) {
        out.push(
            semanticItem(
                'sem-teaching-model',
                'Modelo didatico da aula',
                'Chave de modelo geral que impede a aula de abrir como treinamento aleatorio.',
                'Modelo ECBT da aula',
                handlerAction(
                    'Abrir modelo da aula',
                    'handleOpenTraining',
                    [Object.freeze({ activeTab: 'myCourses', skipResume: true })],
                    'Modelo didatico encontrado, mas sem atalho especifico para abrir o editor.',
                ),
                'O modelo didatico comunica a intencao da aula, nao apenas os arquivos.',
            ),
        );
    }

    if (hasGac) {
        out.push(
            semanticItem(
                'sem-gac-pipeline',
                'referencias GAC / pipeline',
                'Fluxo de Gerenciamento de Areas Contaminadas que deve abrir em Pipelines.',
                'Pipelines / fluxo GAC',
                handlerAction(
                    'Abrir fluxo GAC',
                    'handleOpenPipelineManager',
                    isIntroModule01 ? ['m01.gac.flow.dd38'] : [],
                    'Nao encontrei o fluxo GAC especifico; abri a lista de Pipelines quando possivel.',
                    'automation',
                ),
                isIntroModule01
                    ? 'Modulo 01 usa o alvo estavel m01.gac.flow.dd38.'
                    : 'A chave cita GAC/pipeline, mas nao informou preset especifico.',
            ),
        );
    }

    if (hasDataStudio) {
        out.push(
            semanticItem(
                'sem-datastudio-analytics',
                'referencias DataStudio / Mann-Kendall / graficos',
                'Demonstracoes vivas de dados, tendencias, QA/QC e visualizacoes.',
                'DataStudio / Analytics',
                handlerAction(
                    'Abrir DataStudio',
                    'handleOpenDataStudio',
                    ['analytics'],
                    'Nao encontrei DataStudio; use o snapshot ou o slide como fallback.',
                ),
                'A chave cita analises que nao devem ficar presas em texto estatico.',
            ),
        );
    }

    if (hasGantt) {
        out.push(
            semanticItem(
                'sem-gantt-governance',
                'cronograma / metodologia agil',
                'Plano de execucao da aula ou do projeto apresentado como linha do tempo.',
                'Governanca / cronograma',
                handlerAction(
                    'Abrir Gantt da aula',
                    'handleOpenProjectGantt',
                    ['template:intro-module01-aula'],
                    'Cronograma especifico ainda nao esta disponivel; abrindo Governanca quando possivel.',
                    'governance',
                ),
                'O cronograma precisa ser um destino vivo, nao apenas uma imagem no slide.',
                'attention',
            ),
        );
    }

    if (hasStoryboardGovernance) {
        out.push(
            semanticItem(
                'sem-storyboard-governance',
                'storyboard / governance',
                'Roteiro de apresentacao, decisoes e checkpoints de governanca da aula.',
                'Storyboard / Governanca',
                handlerAction(
                    'Abrir Governanca',
                    'handleOpenGovernancePanel',
                    [],
                    'Governanca indisponivel; use o storyboard da chave como trilha de apresentacao.',
                    'governance',
                ),
                'A chave aponta para uma camada narrativa/de decisao que precisa ser aberta como painel vivo.',
                'attention',
            ),
        );
    }

    if (hasDom) {
        out.push(
            semanticItem(
                'sem-dom-model',
                'DOM / elementos / modelo 3D',
                'Parte da aula em que o professor aponta para objetos reais da tela do app.',
                'Modelo e painel do projeto',
                tabAction('Abrir modelo', 'project', 'Nao encontrei a aba Projeto; mantenha o canvas do modelo visivel.'),
                'A chave indica que alguns slides devem funcionar como ponte para a tela viva do app.',
            ),
        );
    }

    if (warnings.length > 0) {
        out.push(
            semanticItem(
                'sem-readiness',
                'Pendencias da chave',
                'Itens que o professor precisa revisar antes de compartilhar ou dar aula.',
                'Checklist de preparo',
                handlerAction(
                    'Revisar pendencias',
                    'handleOpenTraining',
                    [Object.freeze({ activeTab: 'myCourses', skipResume: true })],
                    'Use a pasta Avisos deste sumario para revisar pendencias.',
                ),
                `${warnings.length} aviso(s) ajudam o receptor a entender riscos da chave.`,
                warnings.some((w) => w.severity === 'blocked') ? 'blocked' : 'attention',
            ),
        );
    }

    return Object.freeze(out);
}

function semanticMapNodes(items: readonly EcbtKeySemanticMapItem[]): readonly EcbtKeyTreeNode[] {
    return Object.freeze(
        items.map((item) =>
            child(item.id, `${item.from} -> ${item.to}`, 'semantic-map', {
                status: item.status || 'ready',
                meta: {
                    significado: item.meaning,
                    destino: item.to,
                    motivo: item.reason || null,
                },
                ...(item.action ? { action: item.action } : {}),
            }),
        ),
    );
}

function summarizeTrainingCourse(course: any, schemaVersion: number | undefined, options: EcbtKeyTreeSummaryOptions): EcbtKeyTreeSummary {
    const lessons = asArray(course.lessons);
    const assetFileRefs = collectTrainingAssetFiles(course);
    const markdownRefs = extractTrainingMarkdownFileRefs(lessons);
    const files = uniqueFileRefs([...assetFileRefs, ...markdownRefs]);
    const liveModules = collectLiveModules(course);
    const warnings = buildTrainingWarnings(course, lessons, files);
    const semanticMap = buildTrainingSemanticMap(course, lessons, files, liveModules, warnings);
    const title = text(course.title, options.sourceName || 'Curso de treinamento');
    const status = warnings.some((w) => w.severity === 'blocked')
        ? 'blocked'
        : warnings.some((w) => w.severity === 'warning')
          ? 'attention'
          : 'ready';
    const counts: EcbtKeyTreeCounts = Object.freeze({
        ...EMPTY_COUNTS,
        lessons: lessons.length,
        slides: lessons.length,
        assets: files.length,
        files: files.length,
        liveModules: liveModules.length,
        warnings: warnings.length,
    });
    const lessonsNode = child('lessons', 'Slides e licoes', 'folder', {
        count: lessons.length,
        status: lessons.length > 0 ? 'ready' : 'attention',
        children: lessons.slice(0, 80).map((lesson: any, index) =>
            child(stableId(text(lesson.id), `lesson-${index + 1}`), `${index + 1}. ${text(lesson.title, text(lesson.id, 'Licao sem titulo'))}`, 'lesson', {
                status: 'ready',
                meta: {
                    type: text(lesson.type, 'desconhecido'),
                    id: text(lesson.id) || null,
                },
            }),
        ).concat(
            lessons.length > 80
                ? [child('lessons-more', `E mais ${lessons.length - 80} licao(oes)`, 'count')]
                : [],
        ),
    });

    const rootChildren = [
        child('semantic-map', 'De-para semantico e click-go', 'folder', {
            count: semanticMap.length,
            status: semanticMap.some((item) => item.status === 'blocked')
                ? 'blocked'
                : semanticMap.some((item) => item.status === 'attention')
                  ? 'attention'
                  : 'ready',
            children: semanticMapNodes(semanticMap),
        }),
        child('overview', 'Resumo', 'folder', {
            status,
            children: [
                child('overview-status', `Status: ${text(course.status, 'draft')}`, 'count'),
                child('overview-language', `Idioma: ${text(course.language, 'pt-BR')}`, 'count'),
                child('overview-category', `Categoria: ${text(course.category, 'geral')}`, 'count'),
                child('overview-difficulty', `Dificuldade: ${text(course.difficulty, 'beginner')}`, 'count'),
                child('overview-version', `Versao: ${Number(course.version) || 1}`, 'count'),
            ],
        }),
        child('counts', 'Contagens principais', 'folder', {
            status,
            children: [
                child('count-lessons', `${counts.lessons} licao(oes)`, 'count'),
                child('count-slides', `${counts.slides} slide(s) inferido(s)`, 'count'),
                child('count-files', `${counts.files} arquivo(s) e midia`, 'count'),
                child('count-live-modules', `${counts.liveModules} modulo(s) vivo(s) citado(s)`, 'count'),
            ],
        }),
        lessonsNode,
        child('files', 'Arquivos e midias', 'folder', {
            count: files.length,
            status: files.length > 0 ? 'ready' : 'attention',
            children: groupFilesByRole(files),
        }),
        child('live-modules', 'Modulos vivos e amarracoes', 'folder', {
            count: liveModules.length,
            status: liveModules.length > 0 ? 'ready' : 'attention',
            children: liveModules,
        }),
        child('warnings', 'Avisos', 'folder', {
            count: warnings.length,
            status: warnings.some((w) => w.severity === 'blocked') ? 'blocked' : warnings.length ? 'attention' : 'ready',
            children: warnings.length
                ? warnings.map((w) => child(w.code, w.message, 'warning', { status: w.severity === 'blocked' ? 'blocked' : 'attention' }))
                : [child('warnings-none', 'Nenhum aviso critico encontrado.', 'count', { status: 'ready' })],
        }),
    ];

    const root = child('root', title, 'training_course', {
        status,
        count: rootChildren.length,
        children: rootChildren,
    });
    return Object.freeze({
        schema: 'ecbt-key-tree-summary@1',
        id: stableId(`training_course-${text(course.id) || title}`, 'training-course'),
        title,
        type: 'training_course',
        ...(options.keyFormat ? { keyFormat: options.keyFormat } : {}),
        ...(typeof schemaVersion === 'number' ? { schemaVersion } : {}),
        counts,
        semanticMap,
        root,
        warnings: Object.freeze(warnings),
    });
}

function summarizePortable(kind: string, artifact: unknown, schemaVersion: number | undefined, options: EcbtKeyTreeSummaryOptions): EcbtKeyTreeSummary {
    if (kind === 'training_course') {
        return summarizeTrainingCourse(artifact, schemaVersion, options);
    }
    const obj = isObject(artifact) ? artifact : {};
    const keys = Object.keys(obj);
    const title = text((obj as any).title) || text((obj as any).name) || options.sourceName || `Artefato ${kind}`;
    const warnings: EcbtKeyTreeWarning[] = [
        {
            code: 'ecbt.key.generic_portable_summary',
            severity: 'info',
            message: `Resumo generico para artefato portatil do tipo ${kind}.`,
        },
    ];
    const counts = Object.freeze({
        ...EMPTY_COUNTS,
        warnings: warnings.length,
        files: countRecords((obj as any).files || (obj as any).assetFiles),
    });
    const root = child('root', title, kind, {
        status: 'unknown',
        children: [
            child('overview', 'Resumo', 'folder', {
                children: [
                    child('overview-kind', `Tipo: ${kind}`, 'count'),
                    child('overview-version', `Schema: ${schemaVersion || 1}`, 'count'),
                ],
            }),
            child('structure', 'Estrutura interna', 'folder', {
                count: keys.length,
                children: keys.slice(0, 60).map((key) =>
                    child(`key-${stableId(key, 'field')}`, key, 'field', {
                        meta: { valueType: Array.isArray((obj as any)[key]) ? 'lista' : typeof (obj as any)[key] },
                    }),
                ),
            }),
            child('warnings', 'Avisos', 'folder', {
                count: warnings.length,
                children: warnings.map((w) => child(w.code, w.message, 'warning', { status: 'attention' })),
            }),
        ],
    });
    return Object.freeze({
        schema: 'ecbt-key-tree-summary@1',
        id: stableId(`${kind}-${title}`, 'portable-artifact'),
        title,
        type: kind,
        ...(options.keyFormat ? { keyFormat: options.keyFormat } : {}),
        ...(typeof schemaVersion === 'number' ? { schemaVersion } : {}),
        counts,
        root,
        warnings: Object.freeze(warnings),
    });
}

function summarizeModel(model: any, options: EcbtKeyTreeSummaryOptions): EcbtKeyTreeSummary {
    const project = isObject(model.project) ? model.project : {};
    const title = text((project as any).name) || text(model.name) || text(model.title) || options.sourceName || 'Modelo ECBT';
    const families = countRecords(model.families);
    const elements = countRecords(model.elements);
    const campaigns = countRecords(model.campaigns);
    const scenes = countRecords(model.scenes);
    const libraries = countRecords(model.libraries);
    const warnings: EcbtKeyTreeWarning[] = [];
    if (elements === 0 && campaigns === 0 && families === 0) {
        warnings.push({
            code: 'ecbt.key.model_without_main_records',
            severity: 'warning',
            message: 'A chave parece ser um modelo, mas nao encontrei elementos, campanhas ou familias principais.',
        });
    }
    const counts = Object.freeze({
        ...EMPTY_COUNTS,
        elements,
        campaigns,
        scenes,
        libraries,
        warnings: warnings.length,
    });
    const root = child('root', title, 'model', {
        status: warnings.length ? 'attention' : 'ready',
        children: [
            child('overview', 'Resumo do modelo', 'folder', {
                children: [
                    child('project-name', `Projeto: ${title}`, 'count'),
                    child('project-id', `ID: ${text(model.modelId) || text((project as any).id) || 'sem id'}`, 'count'),
                ],
            }),
            child('model-folders', 'Pastas do modelo', 'folder', {
                children: [
                    child('families', `Familias: ${families}`, 'folder', { count: families }),
                    child('elements', `Elementos: ${elements}`, 'folder', { count: elements }),
                    child('campaigns', `Campanhas: ${campaigns}`, 'folder', { count: campaigns }),
                    child('scenes', `Cenas: ${scenes}`, 'folder', { count: scenes }),
                    child('libraries', `Bibliotecas: ${libraries}`, 'folder', { count: libraries }),
                ],
            }),
            child('warnings', 'Avisos', 'folder', {
                count: warnings.length,
                children: warnings.length
                    ? warnings.map((w) => child(w.code, w.message, 'warning', { status: 'attention' }))
                    : [child('warnings-none', 'Nenhum aviso critico encontrado.', 'count', { status: 'ready' })],
            }),
        ],
    });
    return Object.freeze({
        schema: 'ecbt-key-tree-summary@1',
        id: stableId(`model-${title}`, 'model'),
        title,
        type: 'model',
        ...(options.keyFormat ? { keyFormat: options.keyFormat } : {}),
        counts,
        root,
        warnings: Object.freeze(warnings),
    });
}

export function buildEcbtKeyTreeSummary(decoded: unknown, options: EcbtKeyTreeSummaryOptions = {}): EcbtKeyTreeSummary {
    if (!decoded) {
        return emptySummary(options.sourceName || 'Chave ECBT', 'unknown', options);
    }
    const wrapper = detectPortableWrapper(decoded);
    if (wrapper) {
        return summarizePortable(wrapper.kind, wrapper.artifact, wrapper.schemaVersion, options);
    }
    if (isObject(decoded) && 'kind' in decoded && 'obj' in decoded && text((decoded as any).kind)) {
        return summarizePortable(text((decoded as any).kind), (decoded as any).obj, undefined, options);
    }
    if (isObject(decoded) && Array.isArray((decoded as any).lessons) && text((decoded as any).title)) {
        return summarizeTrainingCourse(decoded, undefined, options);
    }
    if (isObject(decoded)) {
        return summarizeModel(decoded, options);
    }
    return emptySummary(options.sourceName || 'Chave ECBT', 'unknown', options);
}
