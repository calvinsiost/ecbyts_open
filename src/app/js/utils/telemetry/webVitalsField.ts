// AUTO-GENERATED GUEST-MODE STUB — ECBYTS-OPEN-LOCAL-001 §2.4. DO NOT EDIT.
// O módulo original 'src/app/js/utils/telemetry/webVitalsField.ts' NÃO é publicado (fora da allowlist).
// Mesma superfície de exports; comportamento: feature desligada no Modo Convidado.
const __stubModule = 'src/app/js/utils/telemetry/webVitalsField.ts';
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
export const createFieldVitalsSnapshot: any = __makeStub('createFieldVitalsSnapshot');
export const resolvePerformanceRoute: any = __makeStub('resolvePerformanceRoute');
export const updateRouteVital: any = __makeStub('updateRouteVital');
export const addLoafReading: any = __makeStub('addLoafReading');
export const summarizeFieldVitals: any = __makeStub('summarizeFieldVitals');
export const startWebVitalsFieldMonitoring: any = __makeStub('startWebVitalsFieldMonitoring');
export const WEB_VITALS_FIELD_STORAGE_KEY: any = __makeStub('WEB_VITALS_FIELD_STORAGE_KEY');
export const WEB_VITALS_FIELD_MAX_LOAF: any = __makeStub('WEB_VITALS_FIELD_MAX_LOAF');
export type LoafReading = any;
export type RouteVitals = any;
export type FieldVitalsSnapshot = any;
export type FieldVitalsMonitor = any;
