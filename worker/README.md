## Proxy da lista + contador de usuários

Cloudflare Worker (plano gratuito) que serve a lista e estima o número de usuários. O GitHub raw não gera logs de acesso, por isso a lista passa por aqui.

- `/anticlutter.txt`: devolve a lista (cache de 5 min) e registra o visitante.
- `/badge.json`: JSON no formato *endpoint* do shields.io com o total estimado.

Privacidade: só é guardado `SHA-256(IP + segredo)` truncado e o horário da última visita. O IP nunca é gravado. Registros mais antigos que `WINDOW_DAYS` (7) são apagados.

A contagem é de IPs distintos na janela. NAT/CGNAT subestima; vários dispositivos, VPN e clientes que buscam com mais frequência que o `! Expires` superestimam. Trate como ordem de grandeza.

### Publicar

```
cd worker
npx wrangler login
npx wrangler d1 create anti-clutter-br      # copie o database_id para wrangler.toml
npx wrangler d1 execute anti-clutter-br --remote --file=schema.sql
npx wrangler secret put SALT                # qualquer texto longo e aleatório
npx wrangler deploy
```

O deploy imprime `https://anti-clutter-br.<sua-conta>.workers.dev`.

### README principal

Depois de publicar, troque o endereço da lista e adicione o selo:

```
https://anti-clutter-br.<sua-conta>.workers.dev/anticlutter.txt
```

```md
![usuários](https://img.shields.io/endpoint?url=https://anti-clutter-br.<sua-conta>.workers.dev/badge.json)
```

Limite gratuito: 100 mil requisições/dia no Worker. Se estourar, os bloqueadores mantêm a última cópia da lista.
