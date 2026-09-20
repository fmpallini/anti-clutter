## Anti-Clutter BR

![usuários](https://img.shields.io/endpoint?url=https://anti-clutter-br.anticutterbr.workers.dev/badge.json)

Lista de filtros contra anti-adblock, paywall, pop-ups e anúncios em **sites brasileiros**, pensada para complementar listas internacionais (EasyList, uBlock filters etc.) sem conflitar com elas. Sites estrangeiros ficam a cargo dessas listas.

> **Fork.** Este projeto é um fork de [ialexsilva/anti-clutter](https://github.com/ialexsilva/anti-clutter), de Alex Silva, mantido agora com foco exclusivo em sites brasileiros. As regras de sites internacionais foram removidas e as demais são revisadas periodicamente contra os sites reais.

### Instalação
Endereço da lista (funciona em qualquer bloqueador que aceite listas por URL):

```
https://anti-clutter-br.anticutterbr.workers.dev/anticlutter.txt
```

A lista passa por um proxy que apenas conta visitantes (hash do IP, sem guardar o IP) para estimar o número de usuários; veja [worker/](worker/README.md).

Cole esse endereço no campo de lista personalizada do seu bloqueador:

- **uBlock Origin**: Painel de controle > Listas de filtros > *Importar...* > cole o endereço > *Aplicar mudanças*.
- **AdGuard** (extensão): Configurações > Filtros > Filtros personalizados > *Adicionar filtro personalizado* > cole o endereço.
- **Adblock Plus**: Configurações avançadas > *Adicionar nova lista de filtros* (Filter lists > Add a filter list) > cole o endereço.
- **Brave**: Configurações > Shields > *Content filtering* > *Add custom filter list* > cole o endereço.

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
