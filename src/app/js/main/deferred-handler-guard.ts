// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0-only.

type DeferredInteraction = { event: Event; target: HTMLElement };

export function installMissingHandlerGuard(
    ensureHandlersRegistered: () => Promise<unknown>,
    documentRef: Document = document,
    windowRef: Window = window,
    ElementRef: typeof Element = Element,
): () => void {
    const pending = new Map<string, DeferredInteraction[]>();
    const onClick = (event: Event) => {
        const target = event.target instanceof ElementRef ? event.target.closest<HTMLElement>('[data-handler]') : null;
        const name = target?.dataset.handler;
        if (!target || !name || typeof (windowRef as any)[name] === 'function') return;

        event.preventDefault();
        event.stopImmediatePropagation();
        const queued = pending.get(name);
        if (queued) {
            queued.push({ event, target });
            return;
        }

        pending.set(name, [{ event, target }]);
        void ensureHandlersRegistered()
            .then(() => {
                const handler = (windowRef as any)[name];
                if (typeof handler !== 'function') throw new Error(`handler ${name} was not registered`);
                for (const interaction of pending.get(name) || []) {
                    handler.call(interaction.target, interaction.event);
                }
            })
            .catch((error: any) => console.error('[ecbyts:boot] deferred control handler failed:', error))
            .finally(() => pending.delete(name));
    };

    documentRef.addEventListener('click', onClick, true);
    return () => documentRef.removeEventListener('click', onClick, true);
}
