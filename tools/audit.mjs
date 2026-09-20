// Audita filter/anticlutter.txt contra sites reais com Chromium (Playwright).
// Uso: node tools/audit.mjs --mode plain|adblock|list --articles 12 --out result.json <homeUrl>...
//   plain   : sem bloqueio nenhum (baseline; mostra o que o site faz sozinho)
//   adblock : simula um adblock genérico (aborta domínios de anúncio) para disparar avisos anti-adblock
//   list    : adblock simulado + aplica de fato as regras da lista (prova o efeito das regras)
//   --scriptlets : injeta também os scriptlets (##+js) da lista e conta quantas vezes interceptaram scripts do site
// Chromium: defina CHROME_PATH ou rode `npx playwright-core install chromium`.
import { chromium } from 'playwright-core';
import { Request } from '@ghostery/adblocker';
import { buildEngine, injectScriptlets, isTrapError, articleLinks } from './lib.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args.splice(i, 2)[1]; };
const mode = opt('mode', 'list');
const nArticles = +opt('articles', 12);
const outFile = opt('out', '');
const useScriptlets = args.includes('--scriptlets') && !!args.splice(args.indexOf('--scriptlets'), 1);
const homes = args;
if (!homes.length || !['plain', 'adblock', 'list'].includes(mode)) {
  console.error('uso: node tools/audit.mjs --mode plain|adblock|list [--articles N] [--out f.json] <home>...');
  process.exit(1);
}

const listPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'filter', 'anticlutter.txt');
const listText = fs.readFileSync(listPath, 'utf8');
const engine = await buildEngine(listText, { scriptlets: useScriptlets });
// Regras cosméticas simples (sem scriptlets ##+js), testadas com querySelectorAll.
const cosmetic = listText.split(/\r?\n/)
  .map(l => l.match(/^([^!#@|*\/][^#]*)##([^+].*)$/)).filter(Boolean)
  .map(m => ({ domains: m[1].split(','), sel: m[2], line: m[0] }));

// Domínios que um adblock genérico bloquearia (isca para detectores de adblock).
const AD = /doubleclick|googlesyndication|googletagservices|adservice\.google|adnxs|pagead|amazon-adsystem|taboola|outbrain|criteo|pubmatic|rubiconproject|securepubads/i;
// Requests com cara de paywall/anti-adblock/push; se não casarem com nenhuma regra viram "lacuna".
const SUSPECT = /paywall|piano\.io|tinypass|zephr|pwz|meter|regwall|barreira|fivewall|netdeal|contador|controla-acesso|behaviors|adblock|blocker|fundingchoices|pushnews|pn\.vg|pushalert|webalert|notif/i;
const TYPE = { script: 'script', xhr: 'xhr', fetch: 'xhr', stylesheet: 'stylesheet', image: 'image', font: 'font', media: 'media', other: 'other', document: 'main_frame' };

// Roda no browser: procura camadas grandes com texto de muro e checa bloqueio de scroll.
const wallProbe = () => {
  const vw = innerWidth, vh = innerHeight, walls = [];
  for (const e of document.querySelectorAll('body *')) {
    const s = getComputedStyle(e);
    if (!['fixed', 'sticky', 'absolute'].includes(s.position) || s.display === 'none' || s.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width * r.height < vw * vh * 0.3) continue;
    const t = (e.innerText || '').replace(/\s+/g, ' ');
    if (/assin|bloque|adblock|desativ|para continuar|continue lendo|piano|paywall|tp-modal/i.test(t + ' ' + e.className + ' ' + e.id))
      walls.push(`${e.tagName}#${e.id}.${String(e.className).slice(0, 40)} "${t.slice(0, 50)}"`);
  }
  return {
    walls: walls.slice(0, 3),
    lock: getComputedStyle(document.body).overflow === 'hidden' || getComputedStyle(document.documentElement).overflow === 'hidden',
    text: document.body.innerText.length,
  };
};
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

async function auditSite(home) {
  // Um contexto por site: cookies e localStorage persistem entre artigos, o que exercita o medidor de paywall.
  const ctx = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const traps = {};
  let cur = 0;
  if (useScriptlets) {
    page.on('pageerror', e => { if (isTrapError(e)) traps[cur] = (traps[cur] || 0) + 1; });
    const h = new URL(home).hostname;
    await injectScriptlets(ctx, engine, [h, h.replace(/^www\./, ''), 'www.' + h.replace(/^www\./, '')]);
  }
  const matched = {}, blocked = {}, gaps = {};
  await page.route('**/*', route => {
    const req = route.request(), url = req.url(), t = req.resourceType();
    const type = req.frame() !== page.mainFrame() && t === 'document' ? 'sub_frame' : (TYPE[t] || 'other');
    const m = engine.match(Request.fromRawDetails({ url, sourceUrl: page.url() || home, type }));
    const f = m.filter || m.exception;
    if (f) (matched[(m.exception ? 'EXC ' : '') + f] ||= new Set()).add(cur);
    else if (SUSPECT.test(url) && ['script', 'xhr', 'fetch', 'stylesheet'].includes(t)) {
      const u = new URL(url);
      (gaps[u.host + u.pathname.slice(0, 60)] ||= new Set()).add(cur);
    }
    if (mode !== 'plain' && AD.test(url)) return route.abort();
    if (mode === 'list' && m.match && !m.exception) {
      blocked[m.filter.toString()] = (blocked[m.filter.toString()] || 0) + 1;
      return route.abort();
    }
    route.continue();
  });
  const res = { home, mode, articles: [], error: null };
  try {
    await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const links = (await page.evaluate(articleLinks)).slice(0, nArticles);
    if (useScriptlets) await injectScriptlets(ctx, engine, links.map(l => new URL(l).hostname));
    for (const [i, url] of links.entries()) {
      cur = i + 1;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3500);
        for (let k = 0; k < 7; k++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(350); } // scroll dispara gatilhos tardios
        await page.waitForTimeout(2500);
        const host = new URL(page.url()).hostname, cos = {};
        for (const c of cosmetic) {
          if (c.domains.some(d => host === d || host.endsWith('.' + d)))
            cos[c.line] = await page.evaluate(s => { try { return document.querySelectorAll(s).length; } catch { return -1; } }, c.sel);
        }
        res.articles.push({ i: cur, url, ...(await page.evaluate(wallProbe)), cosmetic: cos, traps: traps[cur] || 0 });
      } catch (e) { res.articles.push({ i: cur, url, error: e.message.split('\n')[0] }); }
    }
  } catch (e) { res.error = e.message.split('\n')[0]; }
  const ser = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].join(',')]));
  Object.assign(res, { matched: ser(matched), blocked, gaps: ser(gaps), traps });
  await ctx.close();
  return res;
}

const results = await Promise.all(homes.map(auditSite));
for (const r of results) {
  const ok = r.articles.filter(a => !a.error);
  console.log(`\n## ${r.home} [${r.mode}] ${r.error ? 'ERRO: ' + r.error : ''}`);
  if (ok.length) {
    console.log(`artigos: ${ok.length}/${r.articles.length} | com muro: ${ok.filter(a => a.walls.length).length} | scroll travado: ${ok.filter(a => a.lock).length} | texto min/max: ${Math.min(...ok.map(a => a.text))}/${Math.max(...ok.map(a => a.text))}`);
    const w = ok.find(a => a.walls.length);
    if (w) console.log('exemplo de muro:', w.walls[0]);
  }
  console.log('regras que casaram (artigos):');
  for (const [k, v] of Object.entries(r.matched)) console.log('  ', k, '@', v);
  if (useScriptlets) console.log('scriptlets: interceptaram scripts do site em', Object.keys(r.traps).length, 'artigo(s)', JSON.stringify(r.traps));
  if (r.mode === 'list') console.log('bloqueadas de fato:', JSON.stringify(r.blocked));
  const cos = {};
  for (const a of ok) for (const [k, n] of Object.entries(a.cosmetic || {})) cos[k] = Math.max(cos[k] ?? 0, n);
  if (Object.keys(cos).length) { console.log('seletores cosméticos (máx. de matches):'); for (const [k, n] of Object.entries(cos)) console.log('  ', n, k); }
  if (Object.keys(r.gaps).length) {
    console.log('LACUNAS (suspeitas sem regra):');
    for (const [k, v] of Object.entries(r.gaps).slice(0, 15)) console.log('  ', k, '@', v.split(',').slice(0, 4).join(','));
  }
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
await browser.close();
