const DAY = 86400;

async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${ip}|${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function format(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

async function serveList(request, env, ctx) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip && request.method === "GET") {
    ctx.waitUntil(
      hashIp(ip, env.SALT).then((h) =>
        env.DB.prepare(
          "INSERT INTO visitors (h, ts) VALUES (?, ?) ON CONFLICT(h) DO UPDATE SET ts = excluded.ts",
        )
          .bind(h, Math.floor(Date.now() / 1000))
          .run(),
      ),
    );
  }

  const upstream = await fetch(env.LIST_URL, {
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!upstream.ok) return new Response("upstream error", { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

async function serveBadge(env, ctx) {
  const window = Number(env.WINDOW_DAYS) * DAY;
  const since = Math.floor(Date.now() / 1000) - window;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM visitors WHERE ts > ?")
    .bind(since)
    .first();
  ctx.waitUntil(env.DB.prepare("DELETE FROM visitors WHERE ts <= ?").bind(since).run());
  return Response.json(
    {
      schemaVersion: 1,
      label: "usuários (est.)",
      message: format(row.n),
      color: "blue",
      cacheSeconds: 900,
    },
    { headers: { "Cache-Control": "public, max-age=900" } },
  );
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/badge.json") return serveBadge(env, ctx);
    if (pathname === "/anticlutter.txt") return serveList(request, env, ctx);
    return new Response("not found", { status: 404 });
  },
};
