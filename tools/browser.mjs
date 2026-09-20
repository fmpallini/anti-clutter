// Navegador das auditorias, o mais próximo possível de um usuário real.
// Objetivo: ver o que o usuário vê (avisos, paywalls, pedidos de push), sem que o site trate o teste como bot.
// Usamos um navegador de verdade (Edge/Chrome instalado); não há técnica de burlar captcha nem WAF.
//
// Medido neste projeto (gamersclub.com.br, atrás de Cloudflare):
//   Chromium/Edge lançado pelo Playwright, headless ou headed .... trava no desafio ("Um momento…")
//   Edge real headless (--headless=new) via CDP ................... trava no desafio
//   Edge real HEADED via CDP, contexto padrão ..................... passa em ~3 s
// Por isso o modo padrão é "attach": abrimos o Edge/Chrome instalado como processo normal (janela fora da tela,
// perfil temporário) e nos conectamos por CDP, usando o contexto padrão do navegador.
//
// Variáveis de ambiente:
//   LAUNCH=playwright   lança pelo Playwright em vez de anexar (headless; endurecido, mas barrado por Cloudflare)
//   BROWSER=msedge|chrome|chromium   navegador (padrão: chrome se instalado, senão msedge, senão chromium)
//   CHROME_PATH=<exe>   executável específico (implica LAUNCH=playwright)
//   HEADED=1            no modo LAUNCH=playwright, abre janela visível
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const find = list => list.find(p => fs.existsSync(p));

function pickExecutable() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, kind: 'custom' };
  const want = process.env.BROWSER;
  if (want === 'chromium') return { kind: 'chromium' };
  if (want === 'chrome' || (!want && find(CHROME))) { const p = find(CHROME); if (p) return { executablePath: p, kind: 'chrome' }; }
  if (want === 'msedge' || !want) { const p = find(EDGE); if (p) return { executablePath: p, kind: 'msedge' }; }
  return { kind: 'chromium' };
}

const freePort = () => new Promise(res => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });

async function attach({ executablePath, kind }) {
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anticlutter-profile-'));
  const proc = spawn(executablePath, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--window-position=-2400,0', '--window-size=1366,768', '--lang=pt-BR', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { // espera o endpoint CDP subir
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  browser.kind = kind + ' (attach)';
  browser.attached = true;
  const realClose = browser.close.bind(browser);
  browser.close = async () => {
    await realClose().catch(() => {});
    proc.kill();
    await new Promise(r => setTimeout(r, 1000));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };
  return browser;
}

export async function launchBrowser() {
  const exe = pickExecutable();
  if (process.env.LAUNCH !== 'playwright' && exe.executablePath && exe.kind !== 'custom') return attach(exe);
  const headed = process.env.HEADED === '1';
  const browser = await chromium.launch({
    ...(exe.executablePath ? { executablePath: exe.executablePath } : {}),
    // 'chromium' sem executablePath usaria o headless-shell (antigo, facilmente detectável); força o headless novo.
    ...(exe.kind === 'chromium' && !headed ? { channel: 'chromium' } : {}),
    headless: !headed,
    ignoreDefaultArgs: ['--enable-automation'], // remove a barra "controlado por software de teste"
    args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check', '--lang=pt-BR'],
  });
  browser.kind = exe.kind;
  return browser;
}

// Contexto para uma auditoria. Em attach usa o contexto padrão do navegador (o único que passa em Cloudflare),
// então NÃO registre init scripts nele (valeriam para todos): use page.addInitScript.
export async function newContext(browser, extra = {}) {
  if (browser.attached) {
    const ctx = browser.contexts()[0];
    ctx.close = async () => { for (const p of ctx.pages()) await p.close().catch(() => {}); }; // só fecha as abas
    return ctx;
  }
  let userAgent;
  const probe = await browser.newContext();
  const ua = await (await probe.newPage()).evaluate(() => navigator.userAgent);
  await probe.close();
  if (/Headless/i.test(ua)) userAgent = ua.replace(/HeadlessChrome/i, 'Chrome');
  const ctx = await browser.newContext({
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true, ...(userAgent ? { userAgent } : {}), ...extra,
  });
  await ctx.addInitScript(() => {
    if (!window.chrome) window.chrome = { runtime: {}, app: {} };
    // Headless vem com notificações 'denied'; um usuário real ainda não decidiu ('default' / 'prompt').
    // Além de ser sinal de automação, 'denied' faz sites nem exibirem o pedido de push que queremos testar.
    if (Notification.permission === 'denied') Object.defineProperty(Notification, 'permission', { get: () => 'default' });
    const q = navigator.permissions && navigator.permissions.query.bind(navigator.permissions);
    if (q) navigator.permissions.query = p => (p && p.name === 'notifications' ? Promise.resolve({ state: 'prompt', onchange: null }) : q(p));
  });
  return ctx;
}

// Cloudflare e similares mostram uma página intermediária ("Um momento…") antes do site real.
// Espera o título mudar (até `secs`); devolve true se a página real chegou.
export async function waitForChallenge(page, secs = 20) {
  const isChallenge = t => !t || /um momento|just a moment|attention required|verificando/i.test(t);
  for (let i = 0; i < secs; i++) {
    if (!isChallenge(await page.title().catch(() => ''))) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}
