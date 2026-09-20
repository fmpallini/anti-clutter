# Anti-Clutter BR

Filter list (Adblock Plus syntax) that blocks paywalls, anti-adblock walls, push prompts, pop-ups and ads on **Brazilian sites only**. It complements international lists (EasyList, uBlock filters) and must not duplicate them. Foreign-site rules do not belong here.

- The list is `filter/anticlutter.txt`. Docs and user-facing text are in Portuguese.
- This is a fork of `ialexsilva/anti-clutter`; keep the credit in the header and README.
- `.githooks/pre-commit` rewrites `Version` and `Last modified` whenever the filter is committed. Enable it in a fresh clone with `git config core.hooksPath .githooks`. Do not edit those two header lines by hand.
- Scriptlet rules (`##+js(...)`) only work in uBlock Origin and AdGuard, but the tooling below can validate them (see "Scriptlets").

## Evaluating rules against real sites

The goal is to answer two questions with evidence: **does each rule still match something the site really does**, and **does the list actually remove the paywall/wall/popup**. Do not judge from the rule text alone; sites change constantly.

The user runs this locally, so assume a Brazilian IP. Geo-dependent behavior (consent walls, paywall variants) is therefore real.

### Tool

`tools/audit.mjs` drives Chromium through Playwright and evaluates the real `filter/anticlutter.txt` with `@ghostery/adblocker`. It routes every request through the matcher, so results reflect the actual list.

```
cd tools && npm install
# Browser: the installed Edge/Chrome is used (see "Browser"); no Playwright browser download needed
node audit.mjs --mode plain   --articles 12 <home-url>...
node audit.mjs --mode adblock --articles 12 <home-url>...
node audit.mjs --mode list    --articles 12 [--out result.json] <home-url>...
node audit.mjs --mode list --scriptlets <home-url>...   # also inject the list's ##+js scriptlets
node scriptlets-check.mjs [--only "<rule fragment>"]    # validate each scriptlet rule (see below)
```

`browser.mjs` launches the browser, `selftest-browser.mjs` prints the automation signals it exposes, and `lib.mjs` holds shared helpers (engine + scriptlet resources, scriptlet injection, article-link heuristic).

Modes (run them in this order for a site):

| mode | what it does | use it to |
|---|---|---|
| `plain` | no blocking; the matcher only reports which rules *would* match | baseline: see the paywall/wall the site shows by itself and which rules still fire |
| `adblock` | aborts generic ad domains (doubleclick, googlesyndication, adnxs, ...) | trigger anti-adblock walls (a site only shows them when ads fail) |
| `list` | `adblock` plus actually aborts what the list blocks | prove the list removes the wall and restores the article |

For each site it opens the home page, collects up to N article links, and visits them **sequentially in one browser context** so cookies and localStorage persist. That is what exercises metered paywalls, which usually let the first reads through and cut off later ones. Each article is scrolled and left open ~10s because many gates fire on first scroll or late timers.

Reported per site: articles reached, articles with a wall overlay, scroll lock, min/max text length, rules that matched (and on which article numbers), rules that actually blocked (`list` mode), cosmetic selector match counts, and **gaps** (suspicious script/xhr requests that no rule covers).

### Browser

The tools run the installed **Edge (or Chrome) as a normal headed process** on an off-screen window with a throwaway profile, and attach to it over CDP using its default context (`tools/browser.mjs`, "attach" mode). This is deliberate. Measured on `gamersclub.com.br` (Cloudflare):

| setup | result |
|---|---|
| Chromium/Edge launched by Playwright, headless or headed | stuck on the "Um momento..." challenge |
| real Edge `--headless=new` over CDP | stuck |
| real Edge headed over CDP, **new** browser context | stuck |
| real Edge headed over CDP, **default** context | passes in ~3 s |

Consequences to keep in mind:
- Do not register init scripts on the context in attach mode; it is the browser's default context, so they would apply to every page. Use `page.addInitScript` (the tools already do).
- `newContext(browser)` returns that default context, and its `close()` only closes tabs. Cookies of one domain persist across a run (fresh profile per run, so metered-paywall state resets between runs).
- A real window is opened off-screen; it may steal focus briefly on Windows.
- `LAUNCH=playwright` (with `BROWSER`, `CHROME_PATH`, `HEADED=1`) falls back to a Playwright-launched, hardened browser (no `--enable-automation`, no `AutomationControlled`, real version in the UA, notification permission `default` so push prompts appear). It is not accepted by Cloudflare-protected sites but works elsewhere.
- Run `node selftest-browser.mjs` to list the automation signals of the current setup.
- The audits call `waitForChallenge()` after each navigation so an interstitial challenge is not mistaken for the page.

Still blocked with a hard 403 even in the real browser: `superflix.net`, `filmesonlinehd1x.com` (their own access rules, not a challenge). `vizer.tv` and `eneldistribuicaosp.com.br` time out. Treat those as unverifiable, not dead.

### How to read the result

- **Rule matched on articles**: the rule is alive. A rule that never matches on 10+ articles of its site is a removal candidate.
- **Cosmetic selector at 0**: not proof it is dead, since the element may only exist on some page types. Check with a page where it should appear before removing.
- **Wall in `plain`, none in `list`, and text length grows**: the list works. Compare text length: a truncated paywalled article is ~2k characters, the full one is 6k+. Use text length, not just overlay detection; the overlay heuristic is noisy (nav bars containing "assine" are ignored only by the size threshold).
- **Gaps**: a lead, not a rule. Confirm it by adding the candidate rule and re-running `list`; add it only if the wall/text-length outcome changes. Rules that change nothing are noise (for example `piano.io` on Gazeta do Povo was unnecessary once `tinypass.com` was blocked).
- **Site failed to load** (DNS error, 404, redirect to another domain): the rule targeting that host is dead; verify with a plain request before deleting. 403 with a Cloudflare challenge or a timeout is inconclusive, not dead: the test browser is being blocked (see "Browser").

### Investigating a new site

When the tool shows a wall but no rule matches, find the mechanism before writing a rule:

1. Load an article in `plain` mode and dump globals the site exposes (for example the Abril paywall reads `wp_paywall_vars.tipo_paywall`, `fcSettings`).
2. List the third-party and first-party scripts requested; look for plugin paths named `paywall`, `adblock`, `piano`, `zephr`, `fundingchoices`.
3. Fetch the suspicious script with `curl -A "Mozilla/5.0"` and read it. The Abril `custom-fc.js` showed the anti-adblock wall is Google Funding Choices loaded on first scroll.
4. Prefer blocking the **loader script** over hiding the overlay. Blocking the loader prevents the wall, the scroll lock and the metering in one rule.
5. Add the rule, run `--mode list`, and confirm walls go to zero and text length is full across 12+ articles.

### Scriptlets (`##+js(...)`)

`FiltersEngine.parse()` does not ship uBlock Origin's scriptlet library, so `lib.mjs` copies the `resources` from Ghostery's prebuilt engine (needs network on first use). The engine then generates the real scriptlet JS for a hostname, and `injectScriptlets` registers it with `addInitScript` so it runs before any page script, like uBO does.

`tools/scriptlets-check.mjs` reads `tools/scriptlet-checks.json` (one entry per `##+js` rule, keyed by the exact rule line) and, for each page, loads the site **without** the rule and **with only that rule**, then compares:

| check `type` | how it decides | verdicts |
|---|---|---|
| `expr` | JS `expr` must be true when the annoyance is absent (`window.__copyReg` lists `copy` listeners the page managed to register, e.g. `!window.__copyReg.includes('document')`) | `EFFECTIVE` (false before, true after), `DORMANT` (already true before: site no longer does it on that page), `BROKEN` (no change) |
| `trap` | `abort-on-property-read/write` makes any site script touching `prop` throw a random-named `ReferenceError`; seeing one proves the rule intercepted the site | `EFFECTIVE` (site script hit the trap), `DORMANT` (never touched), `BROKEN` (control failed) |

Every `trap` page also runs a control (the test itself reads/writes `prop`); if the control does not throw, the scriptlet was never installed and the verdict is `BROKEN`, not `DORMANT`. The checker also prints `SEM CHECAGEM` for any `##+js` rule in the list with no entry in the JSON, so a new scriptlet cannot land untested.

To add a scriptlet rule: write it in the list, add an entry to `scriptlet-checks.json` (`home` + `articles`, or explicit `urls`, plus `expr` or `prop`/`access`), run the checker, and want `EFFECTIVE` on at least one page. Rules that come out `DORMANT` everywhere are removal candidates, but check pages where the behavior should occur (the annoyance may only run on articles or after interaction).

The engine is Ghostery's reimplementation of the uBO scriptlets, not uBO itself. Treat the result as strong evidence, and confirm a new rule once in real uBlock Origin.

### Known limits

- No login, so post-login behavior is untested.
- Some sites hard-block the test browser (403 without a challenge) or time out; those need a manual check. See "Browser".
- `$document` rules (bet365, 1xbet, livejasmin, mackeeper) and `$popup` rules cannot be tested this way. Popups can only be checked by seeing whether a site still navigates or opens windows, which needs manual verification.
- Exception rules (`@@`) only matter when another list blocks the same request, so they cannot be validated in isolation.
- A metered paywall may need more reads than the article count to trigger; raise `--articles` if no wall appears in `plain` mode.
- Anti-adblock walls from Google Funding Choices never appeared, even in the real headed Edge with ad requests aborted (UOL, Abril, GamersClub). The Abril rules are therefore reasoned from the plugin source, not verified. UOL loads Funding Choices too, but with no visible wall there is nothing to block, so no rule was added. The message may depend on per-publisher settings or user sampling (unconfirmed), so absence here is not proof it never shows.

## Workflow for changes

1. Audit affected sites with the tool (`plain`, then `list`).
2. Edit `filter/anticlutter.txt`; put rules under the right section and site comment, keeping Brazilian sites only.
3. Re-run `--mode list` on the sites you touched and keep the numbers (walls, text length) for the commit message.
4. Commit; the hook bumps the version. Never remove a rule on homepage-only evidence.

Test results are not committed; `tools/*.json` is ignored.
