// AUTO-GENERATED GUEST-MODE STUB — ECBYTS-OPEN-LOCAL-001 §2.4. DO NOT EDIT.
// O módulo original 'src/app/js/utils/libraries/supabaseMarketplace.ts' NÃO é publicado (fora da allowlist).
// Mesma superfície de exports; comportamento: feature desligada no Modo Convidado.
const __stubModule = 'src/app/js/utils/libraries/supabaseMarketplace.ts';
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
export const fetchRemoteCatalog: any = __makeStub('fetchRemoteCatalog');
export const fetchLibraryDetail: any = __makeStub('fetchLibraryDetail');
export const downloadLibraryManifest: any = __makeStub('downloadLibraryManifest');
export const toggleLike: any = __makeStub('toggleLike');
export const hasUserLiked: any = __makeStub('hasUserLiked');
export const getUserLikedSet: any = __makeStub('getUserLikedSet');
export const fetchComments: any = __makeStub('fetchComments');
export const postComment: any = __makeStub('postComment');
export const deleteComment: any = __makeStub('deleteComment');
export const toggleFollow: any = __makeStub('toggleFollow');
export const isFollowing: any = __makeStub('isFollowing');
export const getFollowing: any = __makeStub('getFollowing');
export const fetchActivityFeed: any = __makeStub('fetchActivityFeed');
export const getUnreadNotificationCount: any = __makeStub('getUnreadNotificationCount');
export const fetchNotifications: any = __makeStub('fetchNotifications');
export const markNotificationsRead: any = __makeStub('markNotificationsRead');
export const getUserBadges: any = __makeStub('getUserBadges');
export const fetchCommunityImpact: any = __makeStub('fetchCommunityImpact');
export const fetchTopCreators: any = __makeStub('fetchTopCreators');
export const fetchTopLibraries: any = __makeStub('fetchTopLibraries');
export const fetchRecommendations: any = __makeStub('fetchRecommendations');
export const verifyCharityAccount: any = __makeStub('verifyCharityAccount');
export const createLibraryCheckout: any = __makeStub('createLibraryCheckout');
export const checkConnectStatus: any = __makeStub('checkConnectStatus');
export const publishLibrary: any = __makeStub('publishLibrary');
export const unpublishLibrary: any = __makeStub('unpublishLibrary');
export const getMyPublishedLibraries: any = __makeStub('getMyPublishedLibraries');
export const hasUserPurchased: any = __makeStub('hasUserPurchased');
export const verifyPurchases: any = __makeStub('verifyPurchases');
export const fetchCreatorProfile: any = __makeStub('fetchCreatorProfile');
