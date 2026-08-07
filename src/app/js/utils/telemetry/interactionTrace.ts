// AUTO-GENERATED GUEST-MODE STUB — ECBYTS-OPEN-LOCAL-001 §2.4. DO NOT EDIT.
// O módulo original 'src/app/js/utils/telemetry/interactionTrace.ts' NÃO é publicado (fora da allowlist).
// Mesma superfície de exports; comportamento: feature desligada no Modo Convidado.
const __stubModule = 'src/app/js/utils/telemetry/interactionTrace.ts';
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
export const sanitizeLabel: any = __makeStub('sanitizeLabel');
export const buildTraceEvent: any = __makeStub('buildTraceEvent');
export const createInteractionTracer: any = __makeStub('createInteractionTracer');
export const createLiveConsentGate: any = __makeStub('createLiveConsentGate');
export const createFirstValueTracker: any = __makeStub('createFirstValueTracker');
export const bindFirstValueSignals: any = __makeStub('bindFirstValueSignals');
export const buildFirstValueCohortPanel: any = __makeStub('buildFirstValueCohortPanel');
export const buildHumanJourneyOutcomeRow: any = __makeStub('buildHumanJourneyOutcomeRow');
export const describeTarget: any = __makeStub('describeTarget');
export const bindInteractionCapture: any = __makeStub('bindInteractionCapture');
export const INTERACTION_TRACE_EVENT_TYPE: any = __makeStub('INTERACTION_TRACE_EVENT_TYPE');
export const FIRST_VALUE_EVENT_TYPE: any = __makeStub('FIRST_VALUE_EVENT_TYPE');
export const FIRST_VALUE_TARGETS: any = __makeStub('FIRST_VALUE_TARGETS');
export const FIRST_VALUE_SIGNAL_EVENTS: any = __makeStub('FIRST_VALUE_SIGNAL_EVENTS');
export const TRACE_KINDS: any = __makeStub('TRACE_KINDS');
export const MAX_LABEL_LEN: any = __makeStub('MAX_LABEL_LEN');
export const MAX_EVENTS_PER_SESSION: any = __makeStub('MAX_EVENTS_PER_SESSION');
export type TraceEvent = any;
export type TracerOptions = any;
export type InteractionTracer = any;
export type FirstValueTrackerOptions = any;
export type FirstValueTracker = any;
export type LiveConsentGate = any;
export type FirstValueCohortRow = any;
