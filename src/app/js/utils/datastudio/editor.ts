// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DATA STUDIO EDITOR — CodeMirror 6 SQL editor
   Editor SQL com syntax highlighting e autocomplete

   Carrega CodeMirror 6 via CDN, configura SQLite dialect,
   sincroniza tema dark/light, Ctrl+Enter executa query.
   ================================================================ */
import { importCDN } from '../helpers/cdnLoader.js';
/** @type {any} */
let _view: any = null;
/** @type {any} */
let _EditorView: any = null;
const CM_VERSION = '6.8.0';
// `codemirror` top-level package (basicSetup bundle) must be a real 6.x version.
// 0.20.0 was a pre-alpha "CodeMirror Next" tag that esm.sh no longer serves (404).
// Minimum stable that exports basicSetup is 6.0.0; 6.0.1 has a small bugfix.
// See docs/LESSONS.md entry "cdn-version-drift".
const BASIC_SETUP_VERSION = '6.0.1';
// ----------------------------------------------------------------
// Starter templates - 3 tiers:
//   A) RAW_TEMPLATES  - 1 SELECT * per table (27 tables)
//   B) USAGE_TEMPLATE - real-world analytical query combining joins,
//                       subqueries, aggregations, and JSON extraction
//   C) MULTI_VIEW_TEMPLATE - single run returning multiple result sets
//                            (model overview, elements, observations,
//                            governance, uncertainty, meta sections)
// ----------------------------------------------------------------
const RAW_TABLES = [
    'models',
    'elements',
    'observations',
    'campaigns',
    'edges',
    'scenes',
    'families',
    'contracts',
    'wbs',
    'project_registry',
    'cost_centers',
    'groups',
    'user_constants',
    'user_tools',
    'eco_tools',
    'libraries',
    'networks',
    'interpolation_layers',
    'storyboard_keyframes',
    'labels',
    'taxonomy_bindings',
    'filter_presets',
    'model_links',
    'project_areas',
    'ticker_metrics',
    'model_meta',
    'uncertainty_hub_state',
];
const RAW_TEMPLATES = RAW_TABLES.map((table: any) => ({
    id: `raw-${table}`,
    label: `RAW: ${table}`,
    sql: `-- Raw rows of ${table} (first 50)\nSELECT *\nFROM ${table}\nLIMIT 50;`,
}));
const USAGE_TEMPLATE = {
    id: 'real-world-usage',
    label: 'Real-world: full environmental brief',
    sql: [
        '-- Real-world usage example',
        '-- Combines: elements x observations x campaigns x uncertainty x model_meta',
        '-- Answers: "For each contamination family, what is the current monitoring',
        '-- intensity, the parameter coverage, the campaign window, and the project',
        '-- context coming from model_meta(project)?"',
        '',
        'WITH element_stats AS (',
        '    SELECT e.family,',
        '           COUNT(DISTINCT e.id)                       AS n_elements,',
        '           COUNT(o.rowid)                             AS n_observations,',
        '           COUNT(DISTINCT o.parameter)                AS n_parameters,',
        '           MIN(o.date)                                AS first_obs,',
        '           MAX(o.date)                                AS last_obs,',
        '           AVG(o.reading)                             AS avg_reading',
        '    FROM elements e',
        '    LEFT JOIN observations o ON o.element_id = e.id AND o.model_id = e.model_id',
        '    GROUP BY e.family',
        '),',
        'campaign_span AS (',
        '    SELECT model_id,',
        '           COUNT(*)                                   AS n_campaigns,',
        '           MIN(start_date)                            AS campaign_start,',
        '           MAX(end_date)                              AS campaign_end',
        '    FROM campaigns',
        "    WHERE start_date <> ''",
        '    GROUP BY model_id',
        '),',
        'project_brief AS (',
        '    SELECT model_id,',
        "           json_extract(payload_json, '$.name')       AS project_name,",
        "           json_extract(payload_json, '$.author')     AS project_author",
        '    FROM model_meta',
        "    WHERE section = 'project'",
        '),',
        'uncertainty_summary AS (',
        '    SELECT model_id,',
        '           matrix,',
        '           coverage,',
        '           exceedance_prob,',
        '           decision_action',
        '    FROM uncertainty_hub_state',
        ')',
        'SELECT pb.project_name,',
        '       pb.project_author,',
        '       es.family,',
        '       es.n_elements,',
        '       es.n_observations,',
        '       es.n_parameters,',
        '       ROUND(es.avg_reading, 3)                       AS avg_reading,',
        '       es.first_obs,',
        '       es.last_obs,',
        '       cs.n_campaigns,',
        '       cs.campaign_start,',
        '       cs.campaign_end,',
        '       us.matrix                                      AS unc_matrix,',
        '       us.coverage                                    AS unc_coverage,',
        '       us.exceedance_prob                             AS unc_exceedance,',
        '       us.decision_action                             AS unc_decision',
        'FROM element_stats es',
        "LEFT JOIN project_brief      pb ON pb.model_id = 'current'",
        "LEFT JOIN campaign_span      cs ON cs.model_id = 'current'",
        "LEFT JOIN uncertainty_summary us ON us.model_id = 'current'",
        'ORDER BY es.n_observations DESC;',
    ].join('\n'),
};
const MULTI_VIEW_TEMPLATE = {
    id: 'multi-view-dashboard',
    label: 'Multi-view: 6-panel model dashboard',
    sql: [
        '-- Multi-view dashboard — 6 result sets in one execution',
        '-- DataStudio renders each SELECT as a separate result pane.',
        '',
        '-- [1] Model header',
        'SELECT model_id, name, ecbyts_version, schema_version, timestamp,',
        '       element_count, campaign_count',
        'FROM models;',
        '',
        '-- [2] Top 10 elements by observation count',
        'SELECT e.id, e.name, e.family,',
        '       COUNT(o.rowid) AS obs_count',
        'FROM elements e',
        'LEFT JOIN observations o ON o.element_id = e.id AND o.model_id = e.model_id',
        'GROUP BY e.id, e.name, e.family',
        'ORDER BY obs_count DESC',
        'LIMIT 10;',
        '',
        '-- [3] Parameter distribution (all parameters measured)',
        'SELECT parameter, COUNT(*) AS n_readings,',
        '       ROUND(AVG(reading), 3) AS avg_reading,',
        '       MIN(reading) AS min_reading,',
        '       MAX(reading) AS max_reading',
        'FROM observations',
        "WHERE parameter <> ''",
        'GROUP BY parameter',
        'ORDER BY n_readings DESC;',
        '',
        '-- [4] Governance roll-up (contracts + cost centers + WBS)',
        "SELECT 'contracts' AS area, COUNT(*) AS total, SUM(value) AS total_value FROM contracts",
        'UNION ALL',
        "SELECT 'cost_centers', COUNT(*), NULL FROM cost_centers",
        'UNION ALL',
        "SELECT 'wbs_items', COUNT(*), SUM(cost) FROM wbs",
        'UNION ALL',
        "SELECT 'project_registry', COUNT(*), NULL FROM project_registry;",
        '',
        '-- [5] Uncertainty decision snapshot',
        'SELECT matrix, coverage, k_default, monte_carlo_samples,',
        '       exceedance_prob, policy_source, decision_action,',
        '       optimization_selected_count, executed_at',
        'FROM uncertainty_hub_state;',
        '',
        '-- [6] Model meta sections — payload size inventory',
        'SELECT section, length(payload_json) AS payload_bytes',
        'FROM model_meta',
        'ORDER BY payload_bytes DESC;',
    ].join('\n'),
};
const UNCERTAINTY_HUB_TEMPLATE = {
    id: 'uncertainty-hub-state',
    label: 'Uncertainty Hub: decision snapshot',
    sql: [
        '-- Uncertainty Hub state — latest decision snapshot per matrix',
        'SELECT matrix, coverage, k_default, monte_carlo_samples,',
        '       exceedance_prob, policy_source, decision_action,',
        '       optimization_selected_count, executed_at',
        'FROM uncertainty_hub_state',
        'ORDER BY executed_at DESC;',
    ].join('\n'),
};
const STARTER_TEMPLATES = Object.freeze([
    ...RAW_TEMPLATES,
    USAGE_TEMPLATE,
    MULTI_VIEW_TEMPLATE,
    UNCERTAINTY_HUB_TEMPLATE,
]);
/**
 * Strip SQL line comments (-- ...) and collapse blank lines.
 * Used to produce clean executable SQL from documented templates.
 * @param {string} sql
 * @returns {string}
 */
export function stripSqlComments(sql: any) {
    if (!sql)
        return '';
    return sql
        .split('\n')
        .filter((line: any) => !line.trim().startsWith('--'))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+/, '')
        .trim();
}
/**
 * Default starter SQL injected into the editor on first load.
 * Uses the multi-view dashboard (covers all critical tables) with
 * comments stripped - ready to run on Ctrl+Enter.
 */
export function getDefaultStarterSql() {
    return stripSqlComments(MULTI_VIEW_TEMPLATE.sql);
}
/**
 * Initialize CodeMirror 6 SQL editor in the given container.
 * @param {HTMLElement} container - element to mount editor into
 */
export async function initEditor(container: any) {
    if (!container)
        return;
    try {
        // Load CodeMirror modules via CDN
        // eslint-disable-next-line
        const [cmView, cmState, cmLangSql, cmSetup] = await Promise.all([
            importCDN('https://esm.sh/@codemirror/view@6.35.0', { name: 'CM-view', timeout: 20000 }),
            importCDN('https://esm.sh/@codemirror/state@6.5.0', { name: 'CM-state', timeout: 20000 }),
            importCDN('https://esm.sh/@codemirror/lang-sql@' + CM_VERSION, { name: 'CM-lang-sql', timeout: 20000 }),
            importCDN('https://esm.sh/codemirror@' + BASIC_SETUP_VERSION, { name: 'CM-setup', timeout: 20000 }),
        ]);
        const cmViewModule = (cmView) as any;
        const cmLangSqlModule = (cmLangSql) as any;
        const cmSetupModule = (cmSetup) as any;
        _EditorView = cmViewModule.EditorView;
        const { keymap } = cmViewModule;
        const { sql, SQLite } = cmLangSqlModule;
        const { basicSetup } = cmSetupModule;
        // Build dark theme to match ecbyts
        const darkTheme = _EditorView.theme({
            '&': {
                backgroundColor: 'var(--bg-primary, #0a1929)',
                color: 'var(--text-primary, rgba(255,255,255,.85))',
                height: '100%',
                fontSize: '13px',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            },
            '.cm-content': {
                caretColor: 'var(--accent-color, #5eead4)',
            },
            '.cm-gutters': {
                backgroundColor: 'var(--bg-secondary, #0f2035)',
                color: 'var(--text-secondary, rgba(255,255,255,.4))',
                border: 'none',
            },
            '.cm-activeLine': {
                backgroundColor: 'rgba(94, 234, 212, 0.05)',
            },
            '.cm-activeLineGutter': {
                backgroundColor: 'rgba(94, 234, 212, 0.08)',
            },
            '&.cm-focused .cm-cursor': {
                borderLeftColor: 'var(--accent-color, #5eead4)',
            },
            '&.cm-focused .cm-selectionBackground, ::selection': {
                backgroundColor: 'rgba(94, 234, 212, 0.15)',
            },
        }, { dark: true });
        // Ctrl+Enter keybinding to execute query
        const runKeymap = keymap.of([
            {
                key: 'Ctrl-Enter',
                run: () => {
                    import('./index.js' as string).then(({ executeQuery }) => executeQuery()).catch((e: any) => console.debug('[datastudio:editor:lazy-run:silent-catch]', e?.message || e));
                    return true;
                },
            },
            {
                key: 'Mod-Enter',
                run: () => {
                    import('./index.js' as string).then(({ executeQuery }) => executeQuery()).catch((e: any) => console.debug('[datastudio:editor:lazy-run:silent-catch]', e?.message || e));
                    return true;
                },
            },
        ]);
        _view = new _EditorView({
            doc: getDefaultStarterSql() + '\n',
            extensions: [basicSetup, sql({ dialect: SQLite }), darkTheme, runKeymap, _EditorView.lineWrapping],
            parent: container,
        });
    }
    catch ( /** @type {any} */e) {
        console.debug('[ecbyts:datastudio] CodeMirror init failed:', (e as any)?.message);
        // Fallback: plain textarea
        const textarea = document.createElement('textarea');
        textarea.className = 'ds-editor-fallback';
        textarea.value = getDefaultStarterSql() + '\n';
        textarea.spellcheck = false;
        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                import('./index.js' as string).then(({ executeQuery }) => executeQuery()).catch((e: any) => console.debug('[datastudio:editor:lazy-run:silent-catch]', e?.message || e));
            }
        });
        container.appendChild(textarea);
    }
}
/**
 * Get the current editor content.
 * @returns {string}
 */
export function getEditorContent() {
    if (_view) {
        return _view.state.doc.toString();
    }
    // Fallback textarea
    const textarea = (document.querySelector('.ds-editor-fallback')) as HTMLTextAreaElement | null;
    return textarea ? textarea.value : '';
}
/**
 * Insert text at the current cursor position.
 * @param {string} text
 */
export function insertAtCursor(text: any) {
    if (_view) {
        const cursor = _view.state.selection.main.head;
        _view.dispatch({
            changes: { from: cursor, insert: text },
            selection: { anchor: cursor + text.length },
        });
        _view.focus();
    }
    else {
        const textarea = (document.querySelector('.ds-editor-fallback')) as HTMLTextAreaElement | null;
        if (textarea) {
            const start = textarea.selectionStart;
            const before = textarea.value.substring(0, start);
            const after = textarea.value.substring(textarea.selectionEnd);
            textarea.value = before + text + after;
            textarea.selectionStart = textarea.selectionEnd = start + text.length;
            textarea.focus();
        }
    }
}
/**
 * Set the editor content.
 * @param {string} text
 */
export function setEditorContent(text: any) {
    if (_view) {
        _view.dispatch({
            changes: { from: 0, to: _view.state.doc.length, insert: text },
        });
    }
    else {
        const textarea = (document.querySelector('.ds-editor-fallback')) as HTMLTextAreaElement | null;
        if (textarea)
            textarea.value = text;
    }
}
/**
 * Starter SQL templates used by Data Studio toolbar dropdown.
 * @returns {Array<{id: string, label: string, sql: string}>}
 */
export function getStarterTemplates() {
    return STARTER_TEMPLATES.map((tpl: any) => ({ ...tpl }));
}
