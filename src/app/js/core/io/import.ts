// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   FUNCOES DE IMPORTACAO
   ================================================================

   Este modulo gerencia a importacao de modelos.

   FONTES DE IMPORTACAO:
   1. Chave ECO (string colada ou carregada)
   2. Arquivo .ecokey ou .json
   3. URL com parametro ?key=

   PROCESSO DE IMPORTACAO:
   1. Detectar formato (chave ou JSON)
   2. Decodificar/parsear
   3. Aplicar dados ao modelo atual
   4. Atualizar interface

   ================================================================ */
import { parseInput, parseInputAsync, decodeKeyV3, detectKeyVersion, extractKeyMetadata } from './decoder.js';
import { extractUnknownSections, countUnknownSections } from './_unknownSectionsPure.js';
import { setOrigin } from './geo/coordinates.js';
import { importFamilies } from '../elements/families.js';
import { importElements } from '../elements/manager.js';
import { importEdges } from '../../utils/edges/manager.js';
import { importCampaigns } from '../campaigns/manager.js';
// importScenes (utils/scenes/manager.js) e setCameraState (utils/scene/controls.js)
// usam import() dinamico no ponto de uso dentro de applyModel() para quebrar os
// ciclos io/import.js -> utils/scenes/manager.js e io/import.js -> utils/scene/controls.js.
import { setModelId, setModelLinks, importCorporateIO } from './modelLink.js';
import { importErpFinancial } from '../erp/erpModelState.js';
import { importActionPlan } from '../actionPlan/actionPlanModelState.js';
import { importContracts } from '../../utils/governance/contractManager.js';
import { importWbs } from '../../utils/governance/wbsManager.js';
import { importProjects } from '../../utils/governance/projectManager.js';
import { importCostCenters } from '../../utils/governance/costCenterManager.js';
import { importMACState } from '../../utils/handlers/macCurve.js';
import { restoreSAOState } from '../sao/index.js';
import { importReport } from '../../utils/report/manager.js';
import { importPresets as importFilterPresets } from '../../utils/report/filterPresets.js';
import { importConstellationLayouts } from '../constellation/persistence.js';
import { importValidationProfiles } from '../validation/profileEngine.js';
import { importDocumentsCompliance } from '../documents/complianceStatusSync.js';
import { importUserTools } from '../llm/chatTools.js';
import { importEcoTools } from '../llm/toolBuilder.js';
import { importTicker } from '../../utils/ticker/manager.js';
import { importCalculator } from '../calculator/manager.js';
import { importConstants, getUserConstants, getUserConstantById } from '../constants/manager.js';
import { importLayers as importInterpolation } from '../interpolation/manager.js';
import { initPermissions } from '../../utils/auth/permissions.js';
import { importGroups } from '../../utils/groups/manager.js';
import { importLibraries } from '../../utils/libraries/manager.js';
import { importProfessionalValidation } from '../../utils/cloud/validation.js';
import { importAllNetworks } from '../nn/manager.js';
import { clearModelData } from '../../utils/storage/storageMonitor.js';
import { importLabels } from '../../utils/labels/manager.js';
import { importTaxonomyBindings } from '../taxonomy/manager.js';
import { validateModel } from './validator.js';
import { runModelMigrations } from './migrationRunner.js';
import { showToast } from '../../utils/ui/toast.js';
import { resolveAllBindings } from '../bindings/resolver.js';
import { rehydrateTier3CoordinateBindings } from '../bindings/tier3CoordinateRuntime.js';
import { getAllElements } from '../elements/manager.js';
import { getAllCampaigns } from '../campaigns/manager.js';
import { rehydrateBoundaryOverlayTextures } from '../elements/boundaryOverlayRuntime.js';
import { lazyImport } from '../../utils/helpers/lazyImport.js';
/** @typedef {Record<string, any>} AnyRecord */
/** @typedef {AnyRecord & {_verification?: VerificationInfo | null}} ImportModel */
/** @typedef {{verifyBlockchain?: boolean, myProfileId?: string, myPrivateKey?: CryptoKey, applyModel?: boolean}} ImportOptions */
/** @typedef {{duplicateStrategy?: 'skip'|'replace'|'merge_observations'}} IncrementalImportOptions */
/** @typedef {{verified?: boolean, status?: string, isValid?: boolean, keyId?: string | null, prevHash?: string | null, [key: string]: any}} VerificationInfo */
// ----------------------------------------------------------------
// ESTADO DE VERIFICACAO BLOCKCHAIN
// ----------------------------------------------------------------
/**
 * Ultimo resultado de verificacao blockchain.
 *
 * @type {VerificationInfo|null}
 */
let lastVerification: any = null;
/**
 * Obtem ultimo resultado de verificacao.
 */
export function getLastVerification() {
    return lastVerification;
}
/**
 * Limpa resultado de verificacao.
 */
export function clearVerification() {
    lastVerification = null;
}
// ----------------------------------------------------------------
// FUNCAO PRINCIPAL DE IMPORTACAO
// ----------------------------------------------------------------
/**
 * Importa modelo a partir de string (chave ou JSON).
 * Detecta automaticamente ECO1 simples, ECO1 blockchain ou JSON.
 *
 * @param {string} input - Chave ECO ou JSON
 * @param {ImportOptions} [options] - Opcoes
 * @returns {Promise<ImportModel>} - Modelo importado
 * @throws {Error} - Se falhar na decodificacao
 *
 * EXEMPLO:
 *   try {
 *     const model = await importFromString('ECO1-PWM-...');
 *     if (model._verification?.verified) {
 *       console.log('Assinatura valida!');
 *     }
 *   } catch (error: any) {
 *     alert('Falha: ' + error.message);
 *   }
 */
export async function importFromString(input: string, options: any = {}) {
    const { verifyBlockchain = true, applyModel: shouldApplyModel = true } = options;
    const trimmed = input.trim();
    // Detecta versao da chave
    const version = detectKeyVersion(trimmed);
    let model;
    if (version === 3 && verifyBlockchain) {
        // ECO1 blockchain: Usa verificacao completa
        model = /** @type {ImportModel} */ await decodeKeyV3(trimmed);
        lastVerification = model._verification || null;
    } else if (version === 4 || version === 'C' || version === 'D') {
        // Formatos async: comprimido (C/ECO4) ou criptografado por recipient (D).
        // Encaminha o objeto opaco sem copiar, serializar ou persistir credenciais.
        model = /** @type {ImportModel} */ await parseInputAsync(
            trimmed,
            options as import('./typeD.js').DecodeTypeDOptions,
        );
        lastVerification = null;
    } else {
        // ECO1/ECO2 simples ou JSON: Usa decodificacao simples (sync)
        model = /** @type {ImportModel} */ parseInput(trimmed);
        lastVerification = null;
    }
    // Aplica modelo (async - aguarda interpolation layer rebuild)
    if (shouldApplyModel) await applyModel(model);
    return model;
}
/**
 * Importa modelo sem verificacao de blockchain.
 * Interpolation layers sao reconstruidas em background (async).
 *
 * @param {string} input - Chave ECO ou JSON
 * @returns {Promise<ImportModel>} - Modelo importado
 */
export async function importFromStringSync(input: string) {
    const model = /** @type {ImportModel} */ parseInput(input.trim());
    lastVerification = model._verification || null;
    await applyModel(model);
    return model;
}
/**
 * Verifica blockchain de uma chave ECO1 blockchain sem importar.
 *
 * @param {string} key - Chave ECO1 blockchain
 * @returns {Promise<VerificationInfo>} - Resultado da verificacao
 */
export async function verifyBlockchain(key: string) {
    const version = detectKeyVersion(key.trim());
    if (version !== 3) {
        return {
            version,
            hasBlockchain: false,
            verified: false,
            status: 'not_blockchain',
        };
    }
    const model = /** @type {ImportModel} */ await decodeKeyV3(key.trim());
    return model._verification || { verified: false, status: 'unknown' };
}
/**
 * Extrai metadados de uma chave sem decodificar.
 *
 * @param {string} key - Chave ECO
 * @returns {VerificationInfo|null} - Metadados ou null
 */
export function getKeyInfo(key: string) {
    return extractKeyMetadata(key);
}
/**
 * Importa modelo a partir de arquivo.
 *
 * @param {File} file - Arquivo selecionado
 * @param {ImportOptions} [options] - Opcoes de importacao
 * @returns {Promise<ImportModel>} - Modelo importado
 *
 * FORMATOS SUPORTADOS:
 * - .ecokey - Chave ECO (v2 ou v3)
 * - .json - JSON direto
 * - .key - Alias para .ecokey
 */
export async function importFromFile(file: File, options: any = {}) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const content = String(event.target?.result ?? '');
                const model = await importFromString(content, options);
                resolve(model);
            } catch (error: any) {
                reject(error);
            }
        };
        reader.onerror = () => {
            reject(new Error('Erro ao ler arquivo'));
        };
        reader.readAsText(file);
    });
}
/**
 * Importa modelo da URL (parametro ?key=).
 * Chamado automaticamente na inicializacao.
 *
 * @param {ImportOptions} [options] - Opcoes de importacao
 * @returns {Promise<ImportModel|null>} - Modelo importado ou null se nao houver
 */
export async function importFromURL(options = {}) {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (!key) {
        return null;
    }
    try {
        return await importFromString(key, options);
    } catch (error: any) {
        console.error('Erro ao carregar da URL:', error);
        throw error;
    }
}
// ----------------------------------------------------------------
// APLICACAO DO MODELO
// ----------------------------------------------------------------
/**
 * Aplica dados do modelo importado ao estado atual.
 *
 * @param {ImportModel} tree - Modelo a aplicar
 *
 * ORDEM DE APLICACAO:
 * 1. Informacoes do projeto (formulario)
 * 2. Sistema de coordenadas
 * 3. Familias de elementos
 * 4. Elementos
 * 5. Estado da visualizacao
 * 6. Campanhas
 * 7. Cenas
 */
/**
 * Restore encrypted registry fields in the areas tree (LGPD).
 * Tenta descriptografar campos pessoais criptografados no export.
 * Se a chave AES nao estiver disponivel (outro dispositivo), mantem mascarado.
 * Opera de forma sincrona com fire-and-forget para descriptografia async.
 *
 * @param {Array<AnyRecord>} tree - Arvore de areas importada
 */
function restoreEncryptedRegistryFields(tree: any) {
    if (!Array.isArray(tree)) return;
    // Coleta nos com campos criptografados
    const encrypted: any[] = [];
    /**
     * @param {AnyRecord} node
     */
    function walk(node: any) {
        if (node.registryNumberEncrypted) encrypted.push(node);
        if (Array.isArray(node.children)) node.children.forEach(walk);
    }
    tree.forEach(walk);
    if (encrypted.length === 0) return;
    // Tenta descriptografar em background (fire-and-forget, atualiza arvore async)
    import('../crypto/aesVault.js')
        .then(async (vault) => {
            if (!vault.isVaultReady()) return;
            let updated = false;
            for (const node of encrypted) {
                try {
                    const plain = await vault.decryptField(node.registryNumberEncrypted, node.registryNumber);
                    if (plain && !plain.startsWith('aes:')) {
                        node.registryNumber = plain;
                        delete node.registryNumberEncrypted;
                        updated = true;
                    }
                } catch (e: any) {
                    console.debug('[import] decrypt-registry:', /** @type {any} */ e?.message || e);
                    /* chave indisponivel — mantem mascarado */
                }
            }
            // Re-renderiza arvore se houve descriptografia
            if (updated && window.setAreasTree) {
                // Atualiza sem resetar o estado de expansao
                const { renderAreasTree } = await import('../../utils/handlers/project.js');
                if (typeof renderAreasTree === 'function') renderAreasTree();
            }
        })
        .catch((_e) => console.debug('[core/io/import:silent-catch]', /** @type {any} */ _e?.message || _e));
}

/**
 * TRUST-007: UUID Supabase do autor extraído da última chave ECBT importada (se presente).
 * `null` quando a chave foi gerada anonimamente (autosave, chave-arquivo legada sem authorId,
 * ou versão < 2026-05-29). UI faz lookup separado p/ exibir nome/email (LGPD: nada de PII
 * embarcada no payload).
 */
let _importedFromAuthorId: string | null = null;
export function getImportedFromAuthorId(): string | null {
    return _importedFromAuthorId;
}

/**
 * B5b (CONSIST-OBS-001): bag de seções de library desconhecidas
 * (`lib:<libId>:<section>`) preservadas do último import — padrão
 * protobuf unknown-fields. buildModel re-emite no export para que um
 * cliente SEM a library não drope dado de terceiro silenciosamente.
 */
let _unknownSectionsBag: Readonly<Record<string, unknown>> = Object.freeze({});
export function getUnknownSections(): Readonly<Record<string, unknown>> {
    return _unknownSectionsBag;
}

/**
 * @param {ImportModel} model - Modelo a aplicar
 * @returns {Promise<void>}
 */
export async function applyModel(model: any) {
    if (!model) {
        throw new Error('Modelo vazio');
    }
    // Migra schema legado para versao atual antes da validacao estrutural.
    const migration = runModelMigrations(model);
    if (migration.migrated) {
        console.info(`[ECO1 Import] Schema migrated: v${migration.fromVersion} -> v${migration.toVersion}`);
    }
    model = migration.model;
    // Valida estrutura e sanitiza HTML antes de aplicar
    const { valid, errors, warnings } = validateModel(model);
    if (!valid) {
        const msg = errors.join('; ');
        console.error('[ECO1 Import] Validation failed:', msg);
        showToast(msg, 'error');
        throw new Error(`Import validation failed: ${msg}`);
    }
    if (warnings.length > 0) {
        console.warn('[ECO1 Import] Warnings:', warnings);
        showToast(`Imported with ${warnings.length} warning(s). Check console.`, 'warning');
    }
    const tier3CoordinateImport = rehydrateTier3CoordinateBindings(model);
    // B5b: captura seções de library desconhecidas ANTES de aplicar o
    // modelo — applyModel só processa seções conhecidas; sem este bag,
    // o próximo export droparia `lib:*` de libraries não instaladas.
    _unknownSectionsBag = extractUnknownSections(model);
    const _unknownCount = countUnknownSections(_unknownSectionsBag);
    if (_unknownCount > 0) {
        console.info(`[ECBT Import] ${_unknownCount} library section(s) preserved for re-export (forward-compat B5b)`);
    }
    // Limpa dados de modelo antigo do localStorage antes de importar o novo
    clearModelData();
    // TRUST-007: registra autor (UUID Supabase) se a chave foi gerada por generateAuthoredKey.
    // Backward compat: chaves antigas sem authorId mantêm `null`. UI lê via
    // `getImportedFromAuthorId()` e faz lookup separado p/ display de nome/email (LGPD).
    _importedFromAuthorId = typeof model.authorId === 'string' && model.authorId.length > 0 ? model.authorId : null;
    // 0. Restaura identidade do modelo
    if (model.modelId) {
        setModelId(model.modelId);
    }
    if (model.modelLinks) {
        setModelLinks(model.modelLinks);
    }
    if (model.corporateIO) {
        importCorporateIO(model.corporateIO);
    }
    // ERP/DRE persistido na chave .ecbt (Calvin 2026-06-21): restaura os
    // lançamentos da DRE no store. Forward-compat: chaves antigas sem
    // `model.financial` deixam o store vazio (importErpFinancial trata undefined).
    importErpFinancial(model.financial);
    // Plano de Ação persistido na chave .ecbt (ACTION-PLAN-001 RF-9): restaura
    // ações + planos no store. Forward-compat: chaves antigas sem
    // `model.actionPlan` deixam o store vazio (importActionPlan trata undefined).
    importActionPlan(model.actionPlan);
    // 1. Aplica informacoes do projeto
    if (model.project) {
        setInputValue('project-name', model.project.name || '');
        setInputValue('project-description', model.project.description || '');
        setInputValue('project-author', model.project.author || '');
        setInputValue('project-responsible-tech', model.project.responsibleTechnical || '');
        setInputValue('project-responsible-legal', model.project.responsibleLegal || '');
        if (Array.isArray(model.project.areas)) {
            window.setProjectAreas?.(model.project.areas);
        }
        if (Array.isArray(model.project.areasTree)) {
            // LGPD: tenta descriptografar campos pessoais criptografados
            restoreEncryptedRegistryFields(model.project.areasTree);
            window.setAreasTree?.(model.project.areasTree);
        }
    }
    // 2. Aplica sistema de coordenadas (inclui origem UTM)
    if (model.coordinate) {
        setInputValue('coord-system', model.coordinate.system || 'UTM');
        setInputValue('utm-zone', model.coordinate.zone || 23);
        setInputValue('utm-hemisphere', model.coordinate.hemisphere || 'S');
        if (model.coordinate.origin) {
            setInputValue('utm-origin-easting', model.coordinate.origin.easting || 0);
            setInputValue('utm-origin-northing', model.coordinate.origin.northing || 0);
            setInputValue('utm-origin-elevation', model.coordinate.origin.elevation || 0);
            // Sincronizar runtime state (utmOrigin) - sem isso, hasOrigin() retorna false
            // e operacoes geo (terreno, export GIS, compass) usam origem errada
            setOrigin({
                easting: model.coordinate.origin.easting || 0,
                northing: model.coordinate.origin.northing || 0,
                zone: model.coordinate.zone || 23,
                hemisphere: model.coordinate.hemisphere || 'S',
            });
        }
    }
    // 3. Aplica familias
    if (model.families) {
        importFamilies(model.families);
    }
    // 4. Aplica elementos
    if (model.elements) {
        importElements(model.elements);
        await rehydrateBoundaryOverlayTextures();
    }
    // 4.1. Aplica relacoes (compativel com modelos antigos sem edges)
    if (Array.isArray(model.edges)) {
        importEdges(model.edges, { replace: true });
    } else {
        importEdges([], { replace: true });
    }
    // 5. Aplica visualizacao
    if (model.view) {
        // REF-SWEEPS RF-2: applyModel e chamado fire-and-forget pela Automation API
        // (bridge.importJSON) — os import() crus aqui viravam 'Uncaught (in promise)'.
        // Cada passo e um RESTORE OPCIONAL: se o chunk cair, pulamos a faceta e o
        // resto do modelo ainda importa (melhor que abortar o import inteiro).
        const _ctrl = await lazyImport('../../utils/scene/controls.js', {
            importer: () => import('../../utils/scene/controls.js'),
        });
        if (_ctrl) _ctrl.setCameraState(model.view);
        else console.debug('[import] view nao restaurada: chunk scene/controls indisponivel');
    }
    // 6. Aplica campanhas
    if (model.campaigns) {
        importCampaigns(model.campaigns);
    }
    // 6.1 Resolve todos os bindings (lazy resolution sweep pos-import)
    /** @param {string} id */
    const resolveConstantById = (id: string) => getUserConstantById(id);
    resolveAllBindings(getAllElements(), getAllCampaigns(), {
        constants: getUserConstants(),
        getConstantById: resolveConstantById,
        coordinates: tier3CoordinateImport.coordinates,
    });
    // 7. Aplica cenas
    if (model.scenes) {
        const _scenes = await lazyImport('../../utils/scenes/manager.js', {
            importer: () => import('../../utils/scenes/manager.js'),
        });
        if (_scenes) _scenes.importScenes(model.scenes);
        else console.debug('[import] cenas nao restauradas: chunk scenes/manager indisponivel');
    }
    // 8. Aplica governanca (compativel com modelos antigos sem contratos/wbs)
    if (Array.isArray(model.contracts)) {
        importContracts(model.contracts);
    }
    if (Array.isArray(model.wbs)) {
        importWbs(model.wbs);
    }
    if (model.projectRegistry) {
        importProjects(model.projectRegistry);
    }
    if (model.macState) {
        importMACState(model.macState);
    }
    if (model.costCenters) {
        importCostCenters(model.costCenters);
    }
    // 9. Restaura estado SAO (compativel com modelos antigos sem sao)
    if (model.sao) {
        restoreSAOState(model.sao);
    }
    // 10. Restaura ferramentas customizadas do usuario
    if (Array.isArray(model.userTools)) {
        importUserTools(model.userTools);
    }
    // Ferramentas criadas por IA
    if (Array.isArray(model.ecoTools)) {
        importEcoTools(model.ecoTools);
    }
    // 11. Restaura ticker bar (barra de metricas configuravel)
    if (model.ticker) {
        importTicker(model.ticker);
    }
    // 12. Restaura controle de acesso (compativel com modelos antigos sem access)
    if (model.access) {
        initPermissions(model.access);
    }
    // 13. Restaura grupos customizaveis de elementos e familias
    if (model.groups) {
        importGroups(model.groups);
    }
    // 14. Restaura relatorio ambiental (compativel com modelos antigos sem report)
    if (model.report) {
        importReport(model.report);
    }
    // 14b. Restaura filter presets de relatorio
    if (model.filterPresets) {
        importFilterPresets(model.filterPresets);
    }
    // 14c. Restaura layouts salvos da constelacao (KEY-FIRST F2: a chave
    // SUBSTITUI o store — key-wins; chaves antigas sem a secao seguem ok)
    if (model.constellation) {
        importConstellationLayouts(model.constellation);
    }
    // 14d. Restaura perfis de validacao customizados (KEY-FIRST F3: idem —
    // a chave substitui IDB+cache; sem a secao, nada e tocado)
    if (model.validationProfiles) {
        await importValidationProfiles(model.validationProfiles);
    }
    // 14e. Restaura status de conformidade por documento (KEY-FIRST F1: idem —
    // key-wins; chaves antigas sem a secao seguem ok)
    if (model.documentsCompliance) {
        importDocumentsCompliance(model.documentsCompliance);
    }
    // 15. Restaura bibliotecas instaladas (manifests + estado ativo)
    if (model.libraries) {
        importLibraries(model.libraries);
    }
    // 16. Restaura redes neurais registradas (formato generico v2.0)
    if (model.nn) {
        importAllNetworks(model.nn);
    }
    // 18. Restaura calculator (metricas compostas, regras, ratios)
    if (model.calculator) {
        importCalculator(model.calculator);
    }
    // 18a. Restaura constantes do usuario (fatores de emissao, incertezas, etc.)
    // Defensivo: campo ausente em modelos antigos sem constantes
    if (model.userConstants) {
        importConstants(model.userConstants);
    }
    // 19. Restaura interpolation layers (terreno, nível d'água, contaminação)
    // importInterpolation é async (fetch terrain tiles, recompute grids).
    // SEMPRE chamado (mesmo sem interpolation no modelo novo): importLayers limpa
    // as superfícies antigas no início. Sem isto, abrir um modelo SEM terreno sobre
    // um COM terreno (ex.: random) deixava a superfície de terreno fantasma na cena
    // (bug antigo reportado por Calvin 2026-06-02).
    await importInterpolation(Array.isArray(model.interpolation) ? model.interpolation : []);
    // 19b. Restaura voxel POR MODELO (importVolumes limpa os antigos no início).
    // Sempre chamado (mesmo sem voxel no modelo novo) → limpa volumes fantasma do
    // modelo anterior. Substitui a persistência global (IDB) que causava fantasma.
    const _voxel = await lazyImport('../voxel/manager.js', { importer: () => import('../voxel/manager.js') });
    if (_voxel) _voxel.importVolumes(Array.isArray(model.voxel) ? model.voxel : []);
    // Sem o chunk NAO conseguimos limpar volumes do modelo anterior — avisamos alto
    // porque a consequencia visivel e "volume fantasma", nao apenas faceta ausente.
    else
        console.warn(
            '[import] voxel nao restaurado: volumes do modelo anterior podem persistir (chunk voxel/manager indisponivel)',
        );
    // 17. Restaura classificador de rede neural do usuario (pesos + strokes - formato legado)
    // Sobrescreve a rede 'aerial-classifier' do passo 16, garantindo compatibilidade
    if (model.classifier) {
        const _clf = await lazyImport('../recognition/userClassifier.js', {
            importer: () => import('../recognition/userClassifier.js' as string),
        });
        if (_clf) _clf.setClassifierStrokes(_clf.importClassifier(model.classifier));
        else console.debug('[import] classificador nao restaurado: chunk userClassifier indisponivel');
    }
    // 20. Restaura validacao profissional (selo de profissional verificado)
    importProfessionalValidation(model.professionalValidation || null);
    // 21. Restaura storyboard / sequencer (keyframes, speed, loop).
    // Se o sequencer ainda nao inicializou no boot, guarda pendente para aplicar depois.
    try {
        const storyboardState = model.storyboard ?? null;
        const seq = window.__ecbyts_sequencer;
        if (seq) {
            seq.restoreFromSerialized(storyboardState);
            try {
                delete window.__ecbyts_pending_storyboard;
            } catch (e: any) {
                console.debug('[import] delete-pending-storyboard:', /** @type {any} */ e?.message || e);
                window.__ecbyts_pending_storyboard = undefined;
            }
        } else {
            window.__ecbyts_pending_storyboard = storyboardState;
        }
    } catch (e: any) {
        console.debug('[import] storyboard-restore:', /** @type {any} */ e?.message || e);
        /* sequencer ainda nao inicializado / window indisponivel */
    }
    // 22. Restaura configuracao de labels 3D (nomes, observacoes, geologia, titulo)
    if (model.labels) {
        importLabels(model.labels);
    }
    // 23. Restaura taxonomy bindings (dicionarios de dados ativados)
    if (model.taxonomyBindings) {
        importTaxonomyBindings(model.taxonomyBindings);
    }
    // 23.5 TRUST-008 — Restaura envelope de incerteza V3 (`meta.uncertainty_metadata`).
    // Producer: ecbtV3Uncertainty.buildUncertaintyEnvelope (export V3 quando flag on).
    // Wire: injeta setFieldMeta da store IDB; observation_uncertainty fica no-op
    // (store dedicado ainda não existe — todos sites carregam o snapshot em memória
    // via field_meta_snapshot quando precisam).
    if (model?.meta?.uncertainty_metadata) {
        try {
            const { applyUncertaintyEnvelope } = await import('../uncertainty/v3.js');
            const { setFieldMeta } = await import('../fieldMeta/store.js');
            const result = await applyUncertaintyEnvelope(model.meta.uncertainty_metadata, {
                setFieldMeta,
            });
            if (result.applied || result.skipped > 0) {
                console.info('[import] V3 uncertainty envelope:', result);
            }
        } catch (e: any) {
            console.debug('[import] uncertainty envelope skipped:', e?.message || e);
        }
    }
    // 24. Restaura Modo Apresentação (PRESENTATION-MODE-001)
    // Backward compat: chaves sem field 'presentation' pulam silente
    if (model.presentation) {
        try {
            const { validatePresentation } = await import('../presentation/persistence.js');
            const { listPresentations } = await import('../presentation/manager.js');
            const validated = validatePresentation(model.presentation) as any;
            if (validated) {
                // Salva na lista do importador (não substitui ativa, deixa Calvin escolher)
                const list = /** @type {Array<AnyRecord>} */ listPresentations();
                const exists = list.find((p) => p.id === validated.id);
                if (!exists) {
                    const stored = list;
                    stored.unshift(validated);
                    localStorage.setItem('ecbyts-presentations', JSON.stringify(stored));
                    console.debug('[import] presentation imported', validated.id, validated.title);
                }
            }
        } catch (e: any) {
            console.warn('[import] presentation skipped:', e?.message);
        }
    }
}
// ----------------------------------------------------------------
// IMPORT INCREMENTAL - Merge sem perder dados existentes (D14)
// ----------------------------------------------------------------
/**
 * Importa modelo incrementalmente - mescla com dados existentes.
 * NAO chama clearModelData(). Elementos/campanhas existentes nao
 * mencionados no import sao preservados.
 *
 * @param {ImportModel} model - modelo decodificado (mesmo formato de buildModel())
 * @param {IncrementalImportOptions} [options]
 * @returns {Promise<{stats: {elementsAdded: number, elementsSkipped: number, campaignsAdded: number, campaignsMerged: number, observationsAdded: number}}>}
 */
export async function importIncremental(model: any, options: any = {}) {
    const { duplicateStrategy = 'skip' } = options;
    const { resolveElementIdentity } = await import('../ingestion/identityResolver.js');
    if (!model) throw new Error('Modelo vazio');
    // Migration + validation (mesmos passos de applyModel)
    const migration = runModelMigrations(model);
    model = migration.model;
    const { valid, errors } = validateModel(model);
    if (!valid) throw new Error(`Validation failed: ${errors.join('; ')}`);
    // CRS check - se modelo importado tem zone diferente, avisar
    const currentZoneInput = /** @type {HTMLInputElement|null} */ document.getElementById('utm-zone');
    const currentZone = parseInt(currentZoneInput?.value || '23') || 23;
    const importZone = model.coordinate?.zone || 23;
    if (importZone !== currentZone) {
        throw new Error(`CRS_MISMATCH:${currentZone}:${importZone}`);
    }
    const existing = getAllElements();
    const existingCampaigns = getAllCampaigns();
    const stats = { elementsAdded: 0, elementsSkipped: 0, campaignsAdded: 0, campaignsMerged: 0, observationsAdded: 0 };
    // --- Merge Elements ---
    if (Array.isArray(model.elements)) {
        for (const importEl of model.elements) {
            const { match } = resolveElementIdentity(importEl, existing);
            if (match) {
                if (duplicateStrategy === 'skip') {
                    // Merge observations from import into existing
                    const importObs = importEl.data?.observations || [];
                    if (importObs.length > 0 && match.data?.observations) {
                        for (const obs of importObs) {
                            // Evitar duplicata exata (mesmo parametro + data + valor)
                            const isDupe = match.data.observations.some(
                                (o: any) =>
                                    o.parameterId === obs.parameterId && o.date === obs.date && o.value === obs.value,
                            );
                            if (!isDupe) {
                                match.data.observations.push(obs);
                                stats.observationsAdded++;
                            }
                        }
                    }
                    stats.elementsSkipped++;
                } else if (duplicateStrategy === 'replace') {
                    try {
                        const { removeElement, addElement } = await import('../elements/manager.js');
                        removeElement(match.id);
                        addElement(importEl.family, importEl.id, importEl.name, importEl.data, {
                            iconClass: importEl.iconClass,
                            color: importEl.color,
                            label: importEl.label,
                            labels: importEl.labels,
                            stamps: importEl.stamps,
                            messages: importEl.messages,
                        });
                        stats.elementsAdded++;
                    } catch (e: any) {
                        console.debug('[import] addElement-skip:', /** @type {any} */ e?.message || e);
                        stats.elementsSkipped++;
                    }
                } else if (duplicateStrategy === 'merge_observations') {
                    const importObs = importEl.data?.observations || [];
                    for (const obs of importObs) {
                        const isDupe = (match.data?.observations || []).some(
                            (o: any) =>
                                o.parameterId === obs.parameterId && o.date === obs.date && o.value === obs.value,
                        );
                        if (!isDupe) {
                            if (!match.data.observations) match.data.observations = [];
                            match.data.observations.push(obs);
                            stats.observationsAdded++;
                        }
                    }
                    stats.elementsSkipped++;
                }
            } else {
                // Novo elemento - adicionar
                try {
                    const { addElement } = await import('../elements/manager.js');
                    addElement(importEl.family, importEl.id, importEl.name, importEl.data, {
                        iconClass: importEl.iconClass,
                        color: importEl.color,
                        label: importEl.label,
                        labels: importEl.labels,
                        stamps: importEl.stamps,
                        messages: importEl.messages,
                    });
                    stats.elementsAdded++;
                } catch (err: any) {
                    console.warn(`[Merge] Failed to add element ${importEl.name}:`, /** @type {any} */ err.message);
                }
            }
        }
    }
    // --- Merge Campaigns ---
    if (Array.isArray(model.campaigns)) {
        const { addCampaign } = await import('../campaigns/manager.js');
        for (const importCamp of model.campaigns) {
            const existingCamp = existingCampaigns.find((c) => c.name === importCamp.name || c.id === importCamp.id);
            if (existingCamp) {
                // Merge: estender datas se necessario
                if (
                    importCamp.startDate &&
                    (!existingCamp.startDate || importCamp.startDate < existingCamp.startDate)
                ) {
                    existingCamp.startDate = importCamp.startDate;
                }
                if (importCamp.endDate && (!existingCamp.endDate || importCamp.endDate > existingCamp.endDate)) {
                    existingCamp.endDate = importCamp.endDate;
                }
                stats.campaignsMerged++;
            } else {
                addCampaign(importCamp);
                stats.campaignsAdded++;
            }
        }
    }
    return { stats };
}
/**
 * Helper para definir valor de input.
 *
 * @param {string} id - ID do elemento
 * @param {string|number} value - Valor a definir
 */
function setInputValue(id: any, value: any) {
    const element = /** @type {HTMLInputElement|null} */ document.getElementById(id);
    if (element) {
        element.value = String(value);
    }
}
// ----------------------------------------------------------------
// VALIDACAO DE ARQUIVO
// ----------------------------------------------------------------
/**
 * Verifica se arquivo tem extensao suportada.
 *
 * @param {File} file - Arquivo a verificar
 * @returns {boolean} - true se suportado
 */
export function isValidFileType(file: File) {
    if (!file || !file.name) {
        return false;
    }
    const validExtensions = ['.ecokey', '.json', '.key', '.csv', '.geojson', '.glb', '.gltf', '.kml', '.shp', '.zip'];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    return validExtensions.includes(extension);
}
/**
 * Valida conteudo antes de importar.
 * Verifica se parece ser chave ou JSON valido.
 *
 * @param {string} content - Conteudo a validar
 * @returns {AnyRecord} - { valid, type, version?, hasBlockchain?, error? }
 */
export function validateContent(content: string) {
    if (!content || typeof content !== 'string') {
        return { valid: false, error: 'Conteudo vazio' };
    }
    const trimmed = content.trim();
    // Verifica se e JSON
    if (trimmed.startsWith('{')) {
        try {
            JSON.parse(trimmed);
            return { valid: true, type: 'json', hasBlockchain: false };
        } catch (e: any) {
            return { valid: false, error: 'JSON invalido: ' + /** @type {any} */ e.message };
        }
    }
    // Verifica se e chave ECBT (novo) ou ECO (legado)
    if (trimmed.startsWith('ECBT') || trimmed.startsWith('ECO')) {
        const version = detectKeyVersion(trimmed);
        const metadata = /** @type {VerificationInfo|null} */ extractKeyMetadata(trimmed);
        if (metadata && metadata.isValid) {
            return {
                valid: true,
                type: 'ecokey',
                version: version,
                hasBlockchain: version === 3,
                keyId: metadata.keyId || null,
                prevHash: metadata.prevHash || null,
            };
        }
        // Validacao basica de formato (fallback)
        const parts = trimmed.split('-');
        if (parts.length >= 5) {
            return { valid: true, type: 'ecokey', version: version || 2, hasBlockchain: false };
        }
        return { valid: false, error: 'Formato de chave ECO invalido' };
    }
    return { valid: false, error: 'Formato nao reconhecido' };
}
//# sourceMappingURL=import.js.map
