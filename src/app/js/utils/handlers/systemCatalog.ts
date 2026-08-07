// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only
/* ================================================================
   SYSTEM CATALOG handler — lazy-load + open the catalog modal.
   REF-SWEEPS RF-2: usa lazyImport (fail-soft; com server local morto
   degrada com toast unico em vez de `Uncaught (in promise)`).
   ================================================================ */
import { lazyImport } from '../helpers/lazyImport.js';

async function handleOpenSystemCatalog() {
    // Sem onRetry: o retry pos-reconexao so PRE-AQUECE o modulo — abrir o
    // modal sozinho sem clique do usuario seria surpresa de UX.
    const m = await lazyImport('../ui/systemCatalogModal.js', {
        importer: () => import('../ui/systemCatalogModal.js' as string),
    });
    if (m) await m.openSystemCatalogModal();
}
export const systemCatalogHandlers = Object.freeze({
    handleOpenSystemCatalog,
});
