import { db, autorizado, corta, json, notAllowed } from '../lib/util.mjs';

export const config = { path: '/api/pageviews' };

let tabelaPronta = false;
async function garanteTabela() {
  if (tabelaPronta) return;
  await db()`CREATE TABLE IF NOT EXISTS pageviews (
    id BIGSERIAL PRIMARY KEY,
    criado_em TIMESTAMPTZ DEFAULT now(),
    caminho TEXT DEFAULT '',
    origem TEXT DEFAULT 'Direto',
    dispositivo TEXT DEFAULT 'desktop',
    sessao TEXT DEFAULT ''
  )`;
  tabelaPronta = true;
}

export default async (req) => {
  try {
    await garanteTabela();
    const method = req.method;

    if (method === 'POST') {
      let b = {};
      try { b = await req.json(); } catch { b = {}; }
      const caminho = corta(b.caminho || '/', 300);
      if (!caminho.startsWith('/') || caminho.startsWith('/admin')) return new Response(null, { status: 204 });
      const origem = corta(b.origem || 'Direto', 60);
      const dispositivo = b.dispositivo === 'mobile' ? 'mobile' : 'desktop';
      const sessao = corta(b.sessao, 40);
      await db()`INSERT INTO pageviews (caminho, origem, dispositivo, sessao)
        VALUES (${caminho}, ${origem}, ${dispositivo}, ${sessao})`;
      return new Response(null, { status: 204 });
    }

    if (method === 'GET') {
      if (!(await autorizado(req))) return json({ error: 'Não autorizado' }, 401);
      const dias = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get('dias')) || 30));
      const janela = `${dias} days`;
      const [total] = await db()`SELECT count(*)::int AS pageviews, count(distinct sessao)::int AS visitas
        FROM pageviews WHERE criado_em > now() - ${janela}::interval`;
      const porDia = await db()`SELECT to_char(date_trunc('day', criado_em AT TIME ZONE 'America/Cuiaba'), 'YYYY-MM-DD') AS dia,
          count(*)::int AS pageviews, count(distinct sessao)::int AS visitas
        FROM pageviews WHERE criado_em > now() - ${janela}::interval
        GROUP BY 1 ORDER BY 1`;
      const paginas = await db()`SELECT caminho, count(*)::int AS n
        FROM pageviews WHERE criado_em > now() - ${janela}::interval
        GROUP BY 1 ORDER BY n DESC LIMIT 8`;
      const origens = await db()`SELECT origem, count(distinct sessao)::int AS n
        FROM pageviews WHERE criado_em > now() - ${janela}::interval
        GROUP BY 1 ORDER BY n DESC LIMIT 8`;
      const dispositivos = await db()`SELECT dispositivo, count(distinct sessao)::int AS n
        FROM pageviews WHERE criado_em > now() - ${janela}::interval
        GROUP BY 1`;
      return json({ total, porDia, paginas, origens, dispositivos, dias });
    }

    return notAllowed('GET, POST');
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
