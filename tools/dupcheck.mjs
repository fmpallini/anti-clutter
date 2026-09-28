// Compara filter/anticlutter.txt com as listas internacionais que o usuário provavelmente já usa.
// Uso: node tools/dupcheck.mjs [--refresh] [--only "<trecho da regra>"]
//
// Para cada regra nossa monta uma requisição (ou página, no caso de regras cosméticas) que ela deveria afetar,
// confere que a nossa lista de fato a afeta e depois pergunta a cada lista externa o que ela faz com a mesma coisa.
// Vereditos:
//   DUPLICADA     outra lista já bloqueia/esconde o mesmo alvo.
//   ANULADA       outra lista tem exceção (@@) para o alvo; sem $important a nossa regra perde (no uBO/AdGuard).
//   NECESSÁRIA    exceção nossa que desfaz um bloqueio (de outra lista ou da nossa).
//   SEM ALVO      exceção nossa que nenhuma lista bloqueia: não faz nada para quem usa essas listas.
//   ÚNICA         só a nossa lista cobre.
//   NÃO TESTÁVEL  $popup, $document, $generichide ou padrão que não dá para converter em exemplo.
// É uma heurística: o exemplo é uma URL/página, não tudo o que a regra cobre. Confira antes de remover.
// As listas baixadas ficam em tools/.cache (use --refresh para baixar de novo).
import { FiltersEngine, Request } from '@ghostery/adblocker';
import { registrableDomain } from './lib.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : '';

// Primeiro as listas que todas as extensões ligam (EasyList, EasyPrivacy) e as regionais pt que uBO, AdGuard e ABP
// ligam para pt-BR; depois as de fábrica de um bloqueador só; entre [colchetes] as opcionais de incômodos.
// Critério sugerido: remover a regra duplicada no primeiro grupo; nos demais a duplicação é só informativa.
const LISTS = {
  'EasyList': 'https://easylist.to/easylist/easylist.txt',
  'EasyPrivacy': 'https://easylist.to/easylist/easyprivacy.txt',
  'AdGuard Spanish/Portuguese': 'https://filters.adtidy.org/extension/ublock/filters/9.txt',
  'EasyList Portuguese': 'https://easylist-downloads.adblockplus.org/easylistportuguese.txt',
  'uBO filters': 'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  'uBO privacy': 'https://ublockorigin.github.io/uAssets/filters/privacy.txt',
  'uBO unbreak': 'https://ublockorigin.github.io/uAssets/filters/unbreak.txt',
  'uBO quick-fixes': 'https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt',
  'AdGuard Base': 'https://filters.adtidy.org/extension/ublock/filters/2.txt',
  '[uBO annoyances]': 'https://ublockorigin.github.io/uAssets/filters/annoyances.txt',
  '[Fanboy Annoyance]': 'https://secure.fanboy.co.nz/fanboy-annoyance.txt',
  '[AdGuard Annoyances]': 'https://filters.adtidy.org/extension/ublock/filters/14.txt',
};

const cacheDir = path.join(dir, '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
async function load(name, url) {
  const f = path.join(cacheDir, name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '.txt');
  if (!refresh && fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const t = await r.text();
  fs.writeFileSync(f, t);
  return t;
}

const others = [];
for (const [name, url] of Object.entries(LISTS)) {
  try {
    const text = await load(name, url);
    others.push({ name, text, engine: FiltersEngine.parse(text, { debug: true }) });
  } catch (e) { console.error('falhou ao carregar', name, '-', e.message); }
}

const ourText = fs.readFileSync(path.join(dir, '..', 'filter', 'anticlutter.txt'), 'utf8');
const ourLines = ourText.split(/\r?\n/);
const ours = FiltersEngine.parse(ourText, { debug: true });
const withoutLine = line => FiltersEngine.parse(ourLines.filter(l => l !== line).join('\n'), { debug: true });
const rules = ourLines.filter(l => l && !l.startsWith('!') && !l.startsWith('[') && (!only || l.includes(only)));

const verdicts = [];
const report = (line, verdict, detail = '') => verdicts.push({ line, verdict, detail });
const rawOf = f => f?.rawLine ?? String(f);

const TYPES = { script: 'script', xhr: 'xhr', xmlhttprequest: 'xhr', stylesheet: 'stylesheet', image: 'image', document: 'main_frame', subdocument: 'sub_frame' };
const THIRD = 'https://www.exemplo.com.br/';

// Converte uma regra de rede num exemplo {exception, url, sourceUrl, type}, ou null se não der.
function synth(line) {
  const exception = line.startsWith('@@');
  let body = exception ? line.slice(2) : line;
  let opts = [];
  const d = body.lastIndexOf('$');
  if (d > 0 && !body.slice(d).includes('/')) { opts = body.slice(d + 1).split(','); body = body.slice(0, d); }
  if (opts.some(o => ['popup', 'document', 'generichide', 'elemhide'].includes(o))) return null;
  const domOpt = opts.find(o => o.startsWith('domain='));
  const domains = domOpt ? domOpt.slice(7).split('|').filter(x => !x.startsWith('~')) : [];
  const firstParty = opts.some(o => ['1p', 'first-party', '~third-party'].includes(o));
  const type = opts.map(o => TYPES[o]).find(Boolean) || 'script';

  let url;
  if (body.startsWith('||')) url = 'https://' + body.slice(2).replace(/^\*\./, 'www.');
  else if (body.startsWith('|')) url = body.slice(1);
  else {
    const host = domains[0] ? 'www.' + domains[0].replace(/^www\./, '') : 'cdn.exemplo.com.br';
    url = `https://${host}/${body.replace(/^\*+/, '').replace(/^\//, '')}`;
  }
  url = url.replace(/\|$/, '').replace(/\*+$/, '').replace(/\*/g, 'x').replace(/\^$/, '/').replace(/\^/g, '/');
  if (!/^https?:\/\/[^/]+\//.test(url)) url = url.replace(/^(https?:\/\/[^/?]+)/, '$1/');
  const host = new URL(url).hostname;
  const sourceUrl = domains[0] ? `https://www.${domains[0].replace(/^www\./, '')}/` : firstParty ? `https://${host}/` : THIRD;
  return { exception, url, sourceUrl, type };
}

function network(line) {
  const s = synth(line);
  if (!s) { report(line, 'NÃO TESTÁVEL', 'popup/document/generichide'); return; }
  const req = Request.fromRawDetails({ url: s.url, sourceUrl: s.sourceUrl, type: s.type });
  // Ghostery só informa a exceção quando algum bloqueio casou; por isso a exceção é testada junto de um bloqueio amplo.
  const probe = s.exception ? FiltersEngine.parse(`${line}\n||${new URL(s.url).hostname}^`, { debug: true }) : ours;
  const mine = probe.match(req);
  if (s.exception ? !mine.exception : !mine.match) {
    report(line, 'NÃO TESTÁVEL', `exemplo não casou com a própria regra: ${s.type} ${s.url}`); return;
  }

  const blockers = [], excepters = [];
  for (const o of others) {
    const r = o.engine.match(req);
    if (r.match) blockers.push(`${o.name}: ${rawOf(r.filter)}`);
    if (r.exception) excepters.push(`${o.name}: ${rawOf(r.exception)}`);
  }
  const ex = `${s.type} ${s.url} (de ${new URL(s.sourceUrl).hostname})`;
  const detail = xs => [ex, ...xs].join('\n    ');
  if (s.exception) {
    const self = withoutLine(line).match(req).match;
    if (self || blockers.length) report(line, 'NECESSÁRIA', detail([...(self ? ['a própria lista bloqueia'] : []), ...blockers]));
    else if (excepters.length) report(line, 'DUPLICADA', detail(excepters));
    else report(line, 'SEM ALVO', ex);
  } else if (excepters.length && !line.includes('important')) report(line, 'ANULADA', detail([...excepters, ...blockers]));
  else if (blockers.length) report(line, 'DUPLICADA', detail([...blockers, ...excepters]));
  else report(line, 'ÚNICA', detail(excepters));
}

// Listas que escondem `sel` nos hosts dados; null se nem a nossa lista esconde (exemplo mal montado).
function cosmeticCoverage(hosts, sel) {
  const covered = new Set();
  const norm = x => x.replace(/\s+/g, ' ');
  const needle = norm(JSON.stringify(sel).slice(1, -1));
  for (const h of hosts) {
    const q = {
      url: `https://${h}/`, hostname: h, domain: registrableDomain(h),
      classes: [...sel.matchAll(/\.([\w-]+)/g)].map(x => x[1]), ids: [...sel.matchAll(/#([\w-]+)/g)].map(x => x[1]), hrefs: [],
      getBaseRules: true, getInjectionRules: false, getExtendedRules: true, getRulesFromDOM: true, getRulesFromHostname: true,
    };
    const has = e => norm(JSON.stringify(e.getCosmeticsFilters(q))).includes(needle);
    if (!has(ours)) return null;
    for (const o of others) if (has(o.engine)) covered.add(o.name);
  }
  return covered;
}

// Scriptlet: busca textual por domínio + nome/argumentos (aceita os apelidos do uBO).
function scriptlet(line, hosts, sel) {
  const m = sel.match(/^\+js\(([^,)]+)(.*)\)$/);
  const name = m[1].trim().replace(/\.js$/, '');
  const aliases = { 'addEventListener-defuser': ['addEventListener-defuser', 'aeld'] }[name] || [name];
  const argsTxt = m[2].replace(/\s/g, '');
  const hits = others.filter(o => o.text.split('\n').some(l => {
    const x = l.match(/^([^#]*)##\+js\(([^,)]+)(.*)\)/);
    return x && hosts.some(h => x[1].split(',').some(d => d === h || h.endsWith('.' + d)))
      && aliases.includes(x[2].trim().replace(/\.js$/, '')) && x[3].replace(/\s/g, '') === argsTxt;
  }));
  report(line, hits.length ? 'DUPLICADA' : 'ÚNICA', hits.map(h => h.name).join(', '));
}

for (const line of rules) {
  const cos = line.match(/^([^|@\/*$]*?)#@?#(.+)$/);
  if (!cos) { network(line); continue; }
  const [, domPart, sel] = cos;
  const hosts = domPart.split(',').filter(h => h && !h.startsWith('~'));
  if (!hosts.length) { report(line, 'NÃO TESTÁVEL', 'cosmética genérica'); continue; }
  if (sel.startsWith('+js(')) { scriptlet(line, hosts, sel); continue; }
  // "a, b" é conferida seletor a seletor; a regra só é duplicada se todos forem.
  const parts = !sel.includes('(') && sel.includes(',') ? sel.split(',').map(x => x.trim()) : [sel];
  const res = parts.map(p => cosmeticCoverage(hosts, p));
  if (res.includes(null)) { report(line, 'NÃO TESTÁVEL', 'a própria lista não aplicou o seletor'); continue; }
  const detail = parts.length > 1 ? parts.map((p, i) => `${p}: ${[...res[i]].join(', ') || '-'}`).join('\n    ') : [...res[0]].join(', ');
  report(line, res.every(r => r.size) ? 'DUPLICADA' : 'ÚNICA', detail);
}

for (const v of ['DUPLICADA', 'ANULADA', 'SEM ALVO', 'NECESSÁRIA', 'NÃO TESTÁVEL', 'ÚNICA']) {
  const group = verdicts.filter(x => x.verdict === v);
  if (!group.length) continue;
  console.log(`\n== ${v} (${group.length})`);
  for (const g of group) console.log(`  ${g.line}${g.detail ? '\n    ' + g.detail : ''}`);
}
console.log(`\nListas comparadas: ${others.map(o => o.name).join(', ')}`);
