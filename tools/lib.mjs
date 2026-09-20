// Utilidades compartilhadas pelas ferramentas de auditoria.
import { FiltersEngine } from '@ghostery/adblocker';

// A biblioteca de scriptlets do uBlock Origin vem no motor pré-compilado da Ghostery.
// FiltersEngine.parse() não a traz, então copiamos os "resources" de lá.
let resourcesPromise;
export function scriptletResources() {
  return (resourcesPromise ||= FiltersEngine.fromPrebuiltAdsOnly(fetch).then(e => e.resources));
}

export async function buildEngine(listText, { scriptlets = false } = {}) {
  const engine = FiltersEngine.parse(listText, { debug: true });
  if (scriptlets) engine.resources = await scriptletResources();
  return engine;
}

// Domínio registrável simplificado; suficiente para sites .br (com.br, org.br, ...).
export function registrableDomain(host) {
  const p = host.split('.');
  return /\.(com|org|net|gov|edu)\.br$/.test(host) ? p.slice(-3).join('.') : p.slice(-2).join('.');
}

// Código JS dos scriptlets que se aplicam a um hostname (vazio se nenhum).
export function scriptletsFor(engine, hostname) {
  return engine.getCosmeticsFilters({
    url: `https://${hostname}/`, hostname, domain: registrableDomain(hostname),
    getBaseRules: false, getInjectionRules: true, getExtendedRules: false, getRulesFromDOM: false, getRulesFromHostname: true,
  }).scripts;
}

// Registra os scriptlets como init scripts (rodam antes de qualquer script da página, como no uBO).
// Cada um fica atrás de um guard de hostname, então pode-se registrar vários hosts no mesmo contexto.
export async function injectScriptlets(target, engine, hostnames) {
  for (const h of new Set(hostnames))
    for (const code of scriptletsFor(engine, h))
      await target.addInitScript(`(function(){ if (location.hostname !== ${JSON.stringify(h)}) return;\n${code}\n})();`);
}

// Registra quantos listeners "copy" a página consegue registrar (window.__copyReg).
// Deve ser adicionado ANTES dos scriptlets: assim só contam os registros que o defuser deixou passar.
export const copyProbeInit = () => {
  window.__copyReg = [];
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (type === 'copy') window.__copyReg.push(this === document ? 'document' : this === window ? 'window' : String(this.nodeName));
    return orig.call(this, type, ...rest);
  };
};

// Scriptlets "abort-on-property-*" fazem a página lançar ReferenceError com nome aleatório.
// Um erro assim vindo do site prova que o scriptlet interceptou um script dele.
export const isTrapError = e => e.name === 'ReferenceError' && /^[a-z0-9]{5,10}$/i.test(e.message);

// Heurística de link de matéria: mesmo domínio, >=2 segmentos, slug com >=5 palavras.
// Roda no browser (page.evaluate).
export const articleLinks = () => {
  const host = location.hostname.split('.').slice(-3).join('.').replace(/^www\d?\./, ''), seen = new Set(), out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    try {
      const u = new URL(a.href);
      if (!u.hostname.endsWith(host)) continue;
      const seg = u.pathname.split('/').filter(Boolean), last = seg[seg.length - 1] || '';
      if (seg.length >= 2 && last.replace(/\.[a-z]+$/, '').split('-').length >= 5 && !seen.has(u.pathname)) {
        seen.add(u.pathname); out.push(u.href.split('#')[0]);
      }
    } catch {}
  }
  return out;
};
