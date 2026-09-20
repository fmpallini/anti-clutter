## Anti-Clutter BR

Lista de filtros contra anti-adblock, paywall, pop-ups e anúncios em **sites brasileiros**, pensada para complementar listas internacionais (EasyList, uBlock filters etc.) sem conflitar com elas. Sites estrangeiros ficam a cargo dessas listas.

> **Fork.** Este projeto é um fork de [ialexsilva/anti-clutter](https://github.com/ialexsilva/anti-clutter), de Alex Silva, mantido agora com foco exclusivo em sites brasileiros. As regras de sites internacionais foram removidas e as demais são revisadas periodicamente contra os sites reais.

### Instalação
[Inscreva-se](https://subscribe.adblockplus.org/?location=https://raw.githubusercontent.com/fmpallini/anti-clutter/master/filter/anticlutter.txt&title=Anti-Clutter%20BR)

Link direto: https://raw.githubusercontent.com/fmpallini/anti-clutter/master/filter/anticlutter.txt

### Compatibilidade
- Regras de rede e cosméticas funcionam em qualquer bloqueador compatível com a sintaxe do Adblock Plus.
- As regras `##+js(...)` (scriptlets) só funcionam no **uBlock Origin** e no **AdGuard**. Nos demais são ignoradas.

### Regras
Sintaxe: https://adblockplus.org/filter-cheatsheet

O arquivo está dividido em seções: Anti-Paywall, Anti-Adblock, Aborrecimentos (notificações push, pop-ups indesejados, sites de apostas), Pop-ups e Stylesheet (banners específicos por site).

### Licença
[GPLv3](LICENSE).

### Contribuindo
Ative o hook versionado do repositório. Ele atualiza `Version` e `Last modified` do filtro a cada commit que o altere:

```
git config core.hooksPath .githooks
```
