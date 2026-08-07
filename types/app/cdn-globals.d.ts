// Stubs PERMISSIVOS para libs CDN carregadas via loadScriptCDN/importCDN como window globals.
// Audit W68 risky-import 2026-05-14. Tipos `any` deliberados — objetivo é desbloquear
// checked-JS, não enforçar contracts (libs externas mudam de signature entre versões CDN).

declare global {
    interface Window {
        maplibregl?: any;
        turf?: any;
        docx?: any;
        jspdf?: any;
        L?: any;
        mammoth?: any;
    }
}

export {};
