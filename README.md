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
- **Vivaldi**: Configurações > Privacidade e segurança > Bloqueio de rastreadores e anúncios > *Gerenciar fontes* > Fontes de bloqueio de anúncios > *+* > cole o endereço.

### Compatibilidade
- **uBlock Origin** e **AdGuard**: a lista inteira funciona.
- **Adblock Plus**: regras de rede e cosméticas funcionam; as regras `##+js(...)` (scriptlets) são ignoradas. As duas regras com `$important` (que o ABP rejeita) têm uma cópia sem essa opção.
- **Brave** e **Vivaldi** (bloqueadores embutidos): regras de rede funcionam; cosméticas e scriptlets dependem do suporte de cada navegador.
- **Chrome**: o uBlock Origin Lite (a versão que o Chrome ainda aceita) não permite listas personalizadas. Use AdGuard, Adblock Plus ou outro navegador.

A sintaxe é validada com [AGLint](https://github.com/AdguardTeam/AGLint) para uBlock Origin, AdGuard e Adblock Plus a cada commit e no GitHub Actions.

### Regras
Sintaxe: https://adblockplus.org/filter-cheatsheet

O arquivo está dividido em seções: Anti-Paywall (inclui detectores de adblock ligados ao paywall) e Aborrecimentos (notificações push, bloqueio de cópia, banners).

### Licença
[GPLv3](LICENSE).

### Contribuindo
Ative o hook versionado do repositório. Ele atualiza `Version` e `Last modified` do filtro a cada commit que o altere:

```
git config core.hooksPath .githooks
cd tools && npm install   # instala o AGLint usado pelo hook
```

Regras novas não devem repetir o que EasyList, EasyPrivacy e as listas regionais em português já fazem. Confira com `node tools/dupcheck.mjs`.
