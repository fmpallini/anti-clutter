// Mostra os sinais de automação que o navegador de teste expõe. Uso: node tools/selftest-browser.mjs
// Compare BROWSER=chromium|msedge|chrome, com e sem HEADED=1.
import { launchBrowser, newContext } from './browser.mjs';

const browser = await launchBrowser();
const ctx = await newContext(browser);
const page = await ctx.newPage();
await page.goto('about:blank');
const s = await page.evaluate(async () => {
  const gl = document.createElement('canvas').getContext('webgl');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const perm = navigator.permissions ? (await navigator.permissions.query({ name: 'notifications' })).state : 'n/a';
  return {
    webdriver: navigator.webdriver,
    userAgent: navigator.userAgent,
    uaBrands: (navigator.userAgentData?.brands || []).map(b => b.brand).join(','),
    plugins: navigator.plugins.length,
    languages: navigator.languages.join(','),
    windowChrome: !!window.chrome,
    outerVsInner: `${outerWidth}x${outerHeight} / ${innerWidth}x${innerHeight}`,
    notificationPermission: `${Notification.permission} vs query=${perm}`,
    webgl: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'sem webgl',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
});
const flags = [];
if (s.webdriver) flags.push('navigator.webdriver=true');
if (/Headless/i.test(s.userAgent + s.uaBrands)) flags.push('"Headless" no UA/brands');
if (!s.plugins) flags.push('navigator.plugins vazio');
if (!s.windowChrome) flags.push('window.chrome ausente');
if (/SwiftShader|llvmpipe/i.test(s.webgl)) flags.push('WebGL por software (SwiftShader)');
console.log(`navegador: ${browser.kind} ${browser.version()} | ${browser.attached ? 'janela real fora da tela' : process.env.HEADED === '1' ? 'headed' : 'headless'}`);
console.log(JSON.stringify(s, null, 2));
console.log(flags.length ? 'SINAIS DE AUTOMAÇÃO: ' + flags.join('; ') : 'nenhum sinal óbvio de automação');
await browser.close();
