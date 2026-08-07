// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic helper for AI Report Template UI dropdown 3-origins (Fase 1.8 RF-1.8a..e).
// SPEC: docs/specs/features/SPEC_AI_REPORT_TEMPLATE_MARKETPLACE.md §2.2-sexies.
//
// DOM-free, IDB-free, framework-free. Implementa apenas:
//   - enumeração das 3 origens (local | file | library) com estado/badge
//   - validação de shape de chave .ecbt antes de chamar import
//   - preparação de blob de download para export
//   - state machine simples de origem selecionada
//   - wrapper de import com guard (validateTemplateImport)
//
// UI integration scope: Fase 1.8 UI dropdown — wire este helper em
// `src/app/js/utils/ui/aiReportModal.ts` em commit subsequente (claude-executor,
// arquivo codemod-governed conforme R1 routing gate — não pode ser editado por
// claude-adm). Helpers de window.exportReportTemplateEcbt /
// window.importReportTemplateEcbt já disponíveis em
// `utils/handlers/reportTemplatePortable.ts` (commit 5c794e80).

/** ID canônico de origem da seleção de template. */
export type TemplateOriginId = 'local' | 'file' | 'library';

/** Entrada do dropdown de origem. */
export interface TemplateOriginOption {
    id: TemplateOriginId;
    /** i18n key resolvida em runtime pelo consumer (UI) — não traduzir aqui. */
    labelKey: string;
    /** Fallback PT-BR se i18n indisponível. */
    labelFallback: string;
    /** Se false, a opção aparece desabilitada (ex: library "Em breve"). */
    enabled: boolean;
    /** Badge curto opcional (ex: "Em breve", "Beta") — sem markup. */
    badge?: string | undefined;
    /** Texto descritivo curto (consumer renderiza como help text). */
    helpKey: string;
    helpFallback: string;
}

/** Resultado da validação de shape de chave .ecbt. */
export interface EcbtKeyShapeResult {
    ok: boolean;
    /** Lista de motivos por que a chave foi rejeitada (vazia se ok=true). */
    errors: string[];
    /** Tipo detectado da chave (A simple | B blockchain | C compressed) ou null. */
    detectedType: 'A' | 'B' | 'C' | null;
}

/** Resultado da preparação de download. */
export interface DownloadBlobPrep {
    /** Object URL para `<a href=...>` (consumer deve revogar após click). */
    url: string;
    /** Nome do arquivo sanitizado para `<a download=...>`. */
    filename: string;
}

/** Resultado de validateTemplateImport (wrapper guard de fluxo). */
export interface TemplateImportResult {
    ok: boolean;
    templateId?: string | undefined;
    /** Código de erro padronizado para mapeamento i18n no consumer. */
    error?:
        | 'empty_file'
        | 'invalid_shape'
        | 'wrong_kind'
        | 'import_failed'
        | 'duplicate_id'
        | 'unknown'
        | undefined;
    /** Detalhes humanos (debug / log) — não traduzido. */
    errorDetail?: string | undefined;
}

/** Bandeira para library marketplace habilitada (Fase 1.8b futura). */
const LIBRARY_MARKETPLACE_ENABLED = false;

/**
 * Enumera as 3 origens disponíveis no dropdown. Determinístico.
 * - `local`: templates customizados em IDB (DEFAULT).
 * - `file`: importar arquivo `.ecbt` do dispositivo.
 * - `library`: Library marketplace ecbyts (Em breve — Fase 1.8b).
 */
export function enumOrigins(): TemplateOriginOption[] {
    return [
        {
            id: 'local',
            labelKey: 'aiReport.originLocal',
            labelFallback: 'Local (meus templates customizados)',
            enabled: true,
            helpKey: 'aiReport.originLocalHelp',
            helpFallback: 'Templates salvos por você neste dispositivo.',
        },
        {
            id: 'file',
            labelKey: 'aiReport.originFile',
            labelFallback: 'Importar arquivo .ecbt',
            enabled: true,
            helpKey: 'aiReport.originFileHelp',
            helpFallback: 'Selecione um arquivo .ecbt exportado previamente.',
        },
        {
            id: 'library',
            labelKey: 'aiReport.originLibrary',
            labelFallback: 'Library marketplace',
            enabled: LIBRARY_MARKETPLACE_ENABLED,
            badge: LIBRARY_MARKETPLACE_ENABLED ? undefined : 'Em breve',
            helpKey: 'aiReport.originLibraryHelp',
            helpFallback:
                "Templates pagos disponíveis em breve, ex: 'Custom Report DD38 Cetesb' (Calvin, R$ 1000).",
        },
    ];
}

/** Retorna a origem default (sempre `local`). */
export function getDefaultOrigin(): TemplateOriginId {
    return 'local';
}

/**
 * Aplica troca de origem com validação. Se a origem requisitada está desabilitada,
 * mantém a anterior (state machine puramente funcional).
 * @returns origem efetivamente aplicada
 */
export function transitionOrigin(
    current: TemplateOriginId,
    requested: TemplateOriginId,
    options: TemplateOriginOption[] = enumOrigins(),
): TemplateOriginId {
    const opt = options.find((o) => o.id === requested);
    if (!opt) return current;
    if (!opt.enabled) return current;
    return requested;
}

/**
 * Valida shape (não criptografia) da chave .ecbt antes de chamar import.
 * RF-1.8c: arquivo malformado deve produzir erro amigável, não crash.
 *
 * Regras:
 * - texto não pode estar vazio (após trim)
 * - deve começar com `ECBT.`
 * - segundo char após `ECBT.` indica tipo: A | B | C (case-sensitive)
 * - deve terminar com `.TBCE` (bookend canônico — ver docs/spec/ECBT format)
 * - comprimento mínimo razoável (segmentos não-vazios entre prefix e suffix)
 *
 * Não valida CRC32, salt, ou payload binário — isso é responsabilidade do
 * decoder real em core/io/decoder.ts. Este helper é o "fail fast" do UI.
 */
export function validateEcbtKeyShape(text: unknown): EcbtKeyShapeResult {
    const errors: string[] = [];
    if (typeof text !== 'string') {
        return { ok: false, errors: ['not_string'], detectedType: null };
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return { ok: false, errors: ['empty'], detectedType: null };
    }
    if (!trimmed.startsWith('ECBT.')) {
        errors.push('missing_ecbt_prefix');
    }
    if (!trimmed.endsWith('.TBCE')) {
        errors.push('missing_tbce_suffix');
    }
    // Detecta tipo no caractere após "ECBT." (posição 5).
    let detectedType: 'A' | 'B' | 'C' | null = null;
    if (trimmed.length > 5) {
        const ch = trimmed.charAt(5);
        if (ch === 'A' || ch === 'B' || ch === 'C') {
            detectedType = ch;
        } else {
            errors.push('invalid_type_marker');
        }
    } else {
        errors.push('too_short');
    }
    // Sanity: comprimento mínimo (prefix ECBT.X0000001 + suffix .TBCE + ao menos
    // um segmento separado por hífen → ~25 chars). Chave real é centenas+.
    if (trimmed.length < 25) {
        errors.push('too_short');
    }
    return {
        ok: errors.length === 0,
        errors,
        detectedType,
    };
}

/**
 * Sanitiza nome para uso em `<a download=...>` (sem path traversal, sem extensão
 * dupla, sem caracteres de controle). Sempre adiciona `.ecbt` se ausente.
 *
 * Strip da extensão `.ecbt` ANTES de sanitizar (para evitar `foo.ecbt` virar
 * `foo-ecbt.ecbt`), depois re-adiciona ao final. Trata extensão case-insensitive.
 */
export function sanitizeFilename(raw: unknown, fallback = 'report-template'): string {
    const rawStr = String(raw || fallback);
    // Strip extension .ecbt (case-insensitive) antes de sanitizar.
    const noExt = rawStr.replace(/\.ecbt$/i, '');
    const base = noExt
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // remove diacritics
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    const stem = base || fallback;
    return `${stem}.ecbt`;
}

/**
 * Prepara descritor de download para o consumer renderizar `<a>` + click.
 * `urlFactory` é injetado (default `URL.createObjectURL`) para permitir teste
 * em Node sem polyfill DOM.
 *
 * Consumer deve revogar o URL após uso (`URL.revokeObjectURL(url)`).
 */
export function prepareDownloadBlob(
    key: unknown,
    filename: unknown,
    urlFactory?: (blob: unknown) => string,
): DownloadBlobPrep {
    const keyStr = typeof key === 'string' ? key : '';
    if (keyStr.length === 0) {
        throw new Error('prepareDownloadBlob: empty key');
    }
    const safeName = sanitizeFilename(filename);
    // Default: usa Blob+URL.createObjectURL se disponível; fallback data URL puro
    // (cobrindo ambientes Node sem DOM — útil para testes determinísticos).
    let url: string;
    if (typeof urlFactory === 'function') {
        const fakeBlob = { content: keyStr, type: 'text/plain;charset=utf-8' };
        url = urlFactory(fakeBlob);
    } else if (
        typeof Blob !== 'undefined' &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
    ) {
        const blob = new Blob([keyStr], { type: 'text/plain;charset=utf-8' });
        url = URL.createObjectURL(blob);
    } else {
        // Fallback determinístico (testes Node): data URL base64 (sem dep externa).
        const b64 =
            typeof Buffer !== 'undefined'
                ? Buffer.from(keyStr, 'utf-8').toString('base64')
                : btoa(unescape(encodeURIComponent(keyStr)));
        url = `data:text/plain;charset=utf-8;base64,${b64}`;
    }
    return { url, filename: safeName };
}

/**
 * Wrapper de import com guarda completa (RF-1.8c). Recebe injeção de:
 *   - `importer`: função async tipo `window.importReportTemplateEcbt`.
 *   - `lister`: opcional, lista templates customizados existentes (para detectar duplicata).
 *
 * Fluxo:
 *  1. Valida shape via validateEcbtKeyShape.
 *  2. Se shape OK, chama importer.
 *  3. Se duplicata detectada (mesmo id já existe), retorna `duplicate_id` para
 *     que UI peça confirmação (RF-1.8c "sobrescrever?"). Não aborta import — só
 *     sinaliza para consumer decidir.
 */
export async function validateTemplateImport(
    ecbtKey: unknown,
    deps: {
        importer: (key: string) => Promise<{ ok: boolean; templateId?: string }>;
        lister?: () => Promise<Array<{ id: string }>>;
    },
): Promise<TemplateImportResult> {
    if (typeof ecbtKey !== 'string' || ecbtKey.trim().length === 0) {
        return { ok: false, error: 'empty_file' };
    }
    const shape = validateEcbtKeyShape(ecbtKey);
    if (!shape.ok) {
        return {
            ok: false,
            error: 'invalid_shape',
            errorDetail: shape.errors.join(','),
        };
    }
    if (typeof deps?.importer !== 'function') {
        return { ok: false, error: 'unknown', errorDetail: 'importer_not_function' };
    }
    let res: { ok: boolean; templateId?: string };
    try {
        res = await deps.importer(ecbtKey);
    } catch (e: any) {
        return {
            ok: false,
            error: 'import_failed',
            errorDetail: e?.message ? String(e.message) : 'thrown',
        };
    }
    if (!res?.ok) {
        return { ok: false, error: 'import_failed', errorDetail: 'importer_returned_false' };
    }
    // Detecta duplicata informativamente (não aborta — UI decide).
    if (typeof deps.lister === 'function' && res.templateId) {
        try {
            const list = (await deps.lister()) || [];
            const dup = list.filter((t) => t?.id === res.templateId).length;
            if (dup > 1) {
                // > 1 porque o import já adicionou o novo; preexistente conta o atual também.
                return {
                    ok: true,
                    templateId: res.templateId,
                    error: 'duplicate_id',
                    errorDetail: 'preexisting_id_overwritten',
                };
            }
        } catch (e: any) {
            console.debug('[aiReportTemplateOrigins:lister]', e?.message || e);
            // Ignora falha do lister — não bloqueia sucesso do import.
        }
    }
    return { ok: true, templateId: res.templateId };
}
