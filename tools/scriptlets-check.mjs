// Valida cada scriptlet (##+js) de filter/anticlutter.txt contra o site real.
// Uso: node tools/scriptlets-check.mjs [--only "<trecho da regra>"]
//
// Para cada regra listada em tools/scriptlet-checks.json, abre a home e alguns artigos do site duas vezes:
// sem o scriptlet (baseline) e só com aquela regra injetada. Tipos de checagem:
//   expr : `expr` é JS avaliado na página e deve ser TRUE quando o incômodo está ausente.
//          baseline false + com regra true  => EFFECTIVE
//          baseline true                    => DORMANT (o site não faz mais aquilo nessa página)
//          baseline false + com regra false => BROKEN  (a regra não surtiu efeito)
//   trap : abort-on-property-*: o scriptlet faz o site lançar um ReferenceError de nome aleatório
//          quando um script dele toca a propriedade. Erro visto => EFFECTIVE, senão DORMANT.
//          Cada página recebe um controle: o próprio teste lê/escreve `prop` (`access`: read|write) e o erro
//          tem de aparecer; se não aparecer o scriptlet nem foi instalado => BROKEN (e não DORMANT).
// Uma regra é EFFECTIVE se ao menos uma página for EFFECTIVE; caso contrário vale o pior veredito.
// O motor é o da Ghostery (reimplementação dos scriptlets do uBO): confirme regras novas no uBO real.
import { launchBrowser, newContext, waitForChallenge } from './browser.mjs';
import { buildEngine, injectScriptlets, copyProbeInit, isTrapError, articleLinks } from './lib.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : '';
const listLines = new Set(fs.readFileSync(path.join(dir, '..', 'filter', 'anticlutter.txt'), 'utf8').split(/\r?\n/));
const checks = JSON.parse(fs.readFileSync(path.join(dir, 'scriptlet-checks.json'), 'utf8')).filter(c => !only || c.rule.includes(only));

// Avisa sobre regras ##+js da lista sem checagem cadastrada (e o inverso: checagem de regra que saiu da lista).
const jsRules = [...listLines].filter(l => !l.startsWith('!') && l.includes('##+js('));
for (const r of jsRules) if (!checks.some(c => c.rule === r) && !only) console.log('SEM CHECAGEM:', r);
for (const c of checks) if (!listLines.has(c.rule)) console.log('REGRA AUSENTE DA LISTA:', c.rule);

const browser = await launchBrowser();

async function visit(url, engine, expr, control) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  let traps = 0;
  page.on('pageerror', e => { if (isTrapError(e)) traps++; });
  await page.addInitScript(copyProbeInit);
  if (engine) await injectScriptlets(page, engine, [new URL(url).hostname]);
  let value = null, error = null, controlOk = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForChallenge(page);
    await page.waitForTimeout(5000);
    for (let k = 0; k < 5; k++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(300); }
    await page.waitForTimeout(2000);
    if (expr) value = await page.evaluate(expr);
    if (control && engine) {
      const before = traps;
      await page.evaluate(({ prop, access }) => { setTimeout(() => { access === 'write' ? (window[prop] = 1) : void window[prop]; }, 0); }, control);
      await page.waitForTimeout(300);
      controlOk = traps > before; traps = before; // o erro do controle não conta como interceptação do site
    }
  } catch (e) { error = e.message.split('\n')[0]; }
  await ctx.close();
  return { traps, value, error, controlOk };
}

async function pagesFor(c) {
  if (c.urls) return c.urls;
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  let links = [];
  try {
    await page.goto(c.home, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForChallenge(page);
    await page.waitForTimeout(3000);
    links = (await page.evaluate(articleLinks)).slice(0, c.articles ?? 3);
  } catch {}
  await ctx.close();
  return [c.home, ...links];
}

let failed = false;
for (const c of checks) {
  // Motor com SÓ esta regra, para isolar o efeito.
  const engine = await buildEngine(c.rule, { scriptlets: true });
  const rows = [];
  for (const url of await pagesFor(c)) {
    const base = await visit(url, null, c.type === 'expr' ? c.expr : null);
    const withRule = await visit(url, engine, c.type === 'expr' ? c.expr : null, c.type === 'trap' ? { prop: c.prop, access: c.access } : null);
    let verdict;
    if (base.error || withRule.error) verdict = 'ERRO';
    else if (c.type === 'trap') verdict = !withRule.controlOk ? 'BROKEN' : withRule.traps > 0 ? 'EFFECTIVE' : 'DORMANT';
    else verdict = base.value ? 'DORMANT' : withRule.value ? 'EFFECTIVE' : 'BROKEN';
    rows.push({ url, verdict, base, withRule });
  }
  const order = ['EFFECTIVE', 'BROKEN', 'DORMANT', 'ERRO'];
  const overall = order.find(v => rows.some(r => r.verdict === v)) ?? 'ERRO';
  if (overall === 'BROKEN') failed = true;
  console.log(`\n[${overall}] ${c.rule}\n  ${c.desc ?? ''}`);
  for (const r of rows) console.log(`   ${r.verdict.padEnd(9)} ${r.url.slice(0, 90)}  base=${JSON.stringify(r.base.value ?? r.base.error)} regra=${JSON.stringify(r.withRule.value ?? r.withRule.error)} traps=${r.withRule.traps}`);
}
await browser.close();
process.exit(failed ? 1 : 0);
