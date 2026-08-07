// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: FamilyModule Base Class
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   FAMILY MODULE — Classe base para modulos plugaveis de familia.

   Define contrato de ciclo de vida que todo modulo de familia
   deve seguir. Garante limpeza de DOM e listeners no unmount().

   CONTRATO:
   - mount(container, element, options)  → renderiza UI no DOM
   - update(element)                     → atualiza com novos dados
   - unmount()                           → destroi tudo, limpa memoria

   REGRAS:
   - Toda criacao de DOM deve usar this._container
   - Todo addEventListener deve usar this._listen() (AbortController)
   - unmount() e chamado automaticamente pelo registry
   - CSS isolado via prefixo .ecbt-fm-{familyId}

   HOOKS OPCIONAIS:
   - getSchema()        → JSON Schema dos dados do profile
   - validate(data)     → validacao de regras de negocio
   - getDefaultData()   → dados padrao para elemento novo
   - exportSVG()        → exporta conteudo como SVG string
   - migrateData(old)   → migra dados legados para formato profile
   ================================================================ */

/**
 * Classe base abstrata para modulos de familia de elementos.
 * Subclasses devem sobrescrever mount(), update(), unmount(),
 * _getFamilyId() e getStyles().
 */
export class FamilyModule {
    /** Container DOM fornecido pelo mount() */
    _container: HTMLElement | null;

    /** Controller para cleanup de listeners */
    _abortController: AbortController | null;

    /** Dados do elemento atual */
    _element: object | null;

    /** Se o modulo esta montado */
    _mounted: boolean;

    constructor() {
        this._container = null;

        this._abortController = null;

        this._element = null;

        this._mounted = false;
    }

    // ----------------------------------------------------------------
    // LIFECYCLE - Overridden by subclasses
    // ----------------------------------------------------------------

    /**
     * Monta o modulo no container DOM.
     * Subclasses DEVEM chamar super.mount() primeiro.
     *
     * @param container - Container DOM para renderizar
     * @param element - Dados do elemento
     * @param _options - Opcoes (editable, language, etc.)
     */
    async mount(container: HTMLElement, element: object, _options: object = {}): Promise<void> {
        if (this._mounted) {
            this.unmount();
        }

        this._container = container;
        this._element = element;
        this._abortController = new AbortController();
        this._mounted = true;

        // Injeta CSS do modulo (idempotente - nao duplica)
        this._injectStyles();
    }

    /**
     * Atualiza o modulo com novos dados do elemento.
     * Chamado quando element.data muda (ex: edicao no inspector).
     *
     * @param element - Elemento com dados atualizados
     */
    update(element: object): void {
        this._element = element;
    }

    /**
     * Desmonta o modulo: limpa DOM, listeners, referencias.
     * Subclasses DEVEM chamar super.unmount() no final do seu unmount().
     */
    unmount(): void {
        // Aborta todos os listeners registrados via signal
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }

        // Limpa container DOM
        if (this._container) {
            this._container.innerHTML = '';
            this._container = null;
        }

        this._element = null;
        this._mounted = false;
    }

    // ----------------------------------------------------------------
    // OPTIONAL HOOKS - Override as needed
    // ----------------------------------------------------------------

    /**
     * Retorna schema JSON do profile data desta familia.
     * Usado pelo inspector para renderizar campos tipados.
     *
     * @returns JSON Schema ou null
     */
    getSchema(): object | null {
        return null;
    }

    /**
     * Valida dados do profile.
     *
     * @param _profileData - Dados do profile a validar
     */
    validate(_profileData: any): { valid: boolean; errors: string[] } {
        return { valid: true, errors: [] };
    }

    /**
     * Retorna dados padrao do profile para um novo elemento.
     *
     * @returns Profile data default
     */
    getDefaultData(): object {
        return {};
    }

    /**
     * Exporta conteudo do modulo como SVG string.
     * Usado para PDF export e clipboard.
     *
     * @returns SVG markup ou null
     */
    exportSVG(): string | null {
        return null;
    }

    /**
     * Migra dados legados para o formato profile atual.
     * Chamado na primeira vez que um elemento antigo e aberto.
     *
     * @param _oldData - element.data completo (formato antigo)
     * @returns Profile data migrado, ou null se nada a migrar
     */
    migrateData(_oldData: any): object | null {
        return null;
    }

    // ----------------------------------------------------------------
    // PROTECTED HELPERS - For subclass use
    // ----------------------------------------------------------------

    /**
     * Registra event listener com cleanup automatico via AbortController.
     * Subclasses DEVEM usar este metodo em vez de addEventListener direto.
     *
     * @param target - Alvo do evento (DOM element, window, etc.)
     * @param event - Nome do evento ('click', 'input', etc.)
     * @param handler - Callback
     * @param options - Opcoes extras do addEventListener
     */
    _listen(
        target: EventTarget,
        event: string,
        handler: EventListenerOrEventListenerObject,
        options: AddEventListenerOptions = {},
    ): void {
        if (!this._abortController) {
            console.warn('[FamilyModule] Cannot add listener: module not mounted');
            return;
        }
        target.addEventListener(event, handler, {
            ...options,
            signal: this._abortController.signal,
        });
    }

    /**
     * Cria elemento DOM com namespace opcional (para SVG).
     *
     * @param tag - Tag name ('div', 'svg', 'rect', etc.)
     * @param attrs - Atributos a definir
     * @param ns - Namespace URI (null para HTML, SVG_NS para SVG)
     */
    _createElement(tag: string, attrs: Record<string, string> = {}, ns: string | undefined = undefined): Element {
        const el = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
        for (const [key, val] of Object.entries(attrs)) {
            el.setAttribute(key, val);
        }
        return el;
    }

    /**
     * Injeta <style> no <head> para CSS do modulo.
     * Idempotente: verifica se ja existe pelo ID antes de criar.
     * Subclasses definem getStyles() para retornar CSS string.
     */
    _injectStyles(): void {
        const css = this.getStyles();
        if (!css) return;

        const id = `ecbt-fm-${this._getFamilyId()}-styles`;
        if (document.getElementById(id)) return;

        const style = document.createElement('style');
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * Retorna CSS string do modulo.
     * Subclasses devem sobrescrever para retornar CSS com prefixo
     * .ecbt-fm-{familyId}.
     */
    getStyles(): string | null {
        return null;
    }

    /**
     * Retorna o familyId deste modulo.
     * DEVE ser sobrescrito por subclasses.
     */
    _getFamilyId(): string {
        return 'base';
    }
}

/** SVG namespace URI — util para subclasses que renderizam SVG */
export const SVG_NS = 'http://www.w3.org/2000/svg';
