// AUTO-GENERATED GUEST-MODE STUB — ECBYTS-OPEN-LOCAL-001 §2.4. DO NOT EDIT.
// O módulo original 'src/app/js/core/billing/balanceLedger.ts' NÃO é publicado (fora da allowlist).
// Mesma superfície de exports; comportamento: feature desligada no Modo Convidado.
const __stubModule = 'src/app/js/core/billing/balanceLedger.ts';
let __warned = false;
function __warnOnce() {
    if (__warned) return;
    __warned = true;
    try { console.warn('[guest-stub] ' + __stubModule + ': feature desligada no Modo Convidado'); } catch { /* noop */ }
}
function __makeStub(name: string): any {
    const fn = function () { __warnOnce(); return undefined; };
    const stub = new Proxy(fn, {
        get(target, prop) {
            // Thenable-safe SEM deadlock (achado da F5): stub.then(cb) chama
            // cb(undefined) e `await stub` resolve undefined. Sem isto, o
            // `undefined.then()` no topo de main.ts derruba o boot ANTES do banner.
            if (prop === 'then') return function (onF: any) {
                try { if (typeof onF === 'function') onF(undefined); } catch { /* noop */ }
                return stub;
            };
            if (prop === 'catch' || prop === 'finally') return function () { return stub; };
            // for..of / spread não quebram: iterador vazio.
            if (prop === Symbol.iterator) return function () { return { next: function () { return { value: undefined, done: true }; } }; };
            if (prop === Symbol.toPrimitive) return function () { return undefined; };
            // evita recursão infinita em JSON.stringify(stub).
            if (prop === 'toJSON') return function () { return undefined; };
            if (prop in target) return Reflect.get(target, prop);
            return __makeStub(name + '.' + String(prop));
        },
        construct() { __warnOnce(); return {}; },
        // apply devolve o PRÓPRIO stub (não undefined) p/ encadear x().y() e x().then().
        apply() { __warnOnce(); return stub; },
    });
    return stub;
}
export const splitFiscalBreakdown: any = __makeStub('splitFiscalBreakdown');
export const computeNetBalance: any = __makeStub('computeNetBalance');
export const classifyAlertTier: any = __makeStub('classifyAlertTier');
export const projectMonthEndBalance: any = __makeStub('projectMonthEndBalance');
export const shouldRecommendTopup: any = __makeStub('shouldRecommendTopup');
export const formatBalance: any = __makeStub('formatBalance');
export const summarizeTransactionLine: any = __makeStub('summarizeTransactionLine');
export const DEFAULT_ALERT_THRESHOLDS: any = __makeStub('DEFAULT_ALERT_THRESHOLDS');
export const DEFAULT_TAX_RATES_2026: any = __makeStub('DEFAULT_TAX_RATES_2026');
export type AlertTier = any;
export type SupportedLocale = any;
export type BalanceUnit = any;
export type FiscalBreakdown = any;
export type BalanceSnapshot = any;
export type AlertVerdict = any;
export type TransactionLine = any;
export type TransactionDisplay = any;
