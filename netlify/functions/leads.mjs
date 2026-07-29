import { db, autorizado, corta, json, notAllowed } from '../lib/util.mjs';

export const config = { path: '/api/leads' };

const STATUS_VALIDOS = ['novo', 'contato', 'orcamento', 'fechado', 'perdido'];

const SEG_ROTULOS = {
  agroindustria: 'Agroindústria',
  comercial: 'Comercial e Varejo',
  industria: 'Indústria',
  infraestrutura: 'Infraestrutura',
  produtos: 'Produtos pré-moldados',
};

let tabelaPronta = false;
async function garanteTabela() {
  if (tabelaPronta) return;
  await db()`CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    criado_em TIMESTAMPTZ DEFAULT now(),
    atualizado_em TIMESTAMPTZ DEFAULT now(),
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL,
    email TEXT DEFAULT '',
    cidade TEXT DEFAULT '',
    segmento TEXT DEFAULT '',
    mensagem TEXT DEFAULT '',
    origem TEXT DEFAULT 'site',
    utm TEXT DEFAULT '',
    status TEXT DEFAULT 'novo',
    notas TEXT DEFAULT ''
  )`;
  tabelaPronta = true;
}

/* Aviso por e-mail quando entra lead. Se o Resend não estiver
   configurado, apenas não envia; o lead é salvo do mesmo jeito. */
async function notificaLead(lead) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const para = (process.env.LEAD_NOTIFY_TO || '').trim();
  if (!key || !para) return;
  const siteUrl = (process.env.SITE_URL || 'https://construtoralindoia.com.br').trim().replace(/\/$/, '');
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linha = (rotulo, valor) =>
    valor
      ? `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;font-size:12px;text-transform:uppercase;white-space:nowrap">${rotulo}</td><td style="padding:6px 0;font-size:14px;color:#111">${esc(valor)}</td></tr>`
      : '';
  const zap = String(lead.telefone || '').replace(/\D/g, '');
  const waLink = zap ? `https://wa.me/${zap.startsWith('55') ? zap : '55' + zap}` : null;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: (process.env.LEAD_NOTIFY_FROM || 'Painel Lindóia <onboarding@resend.dev>').trim(),
      to: [para],
      subject: `Novo lead no site: ${lead.nome}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px">
        <h2 style="color:#373737;margin-bottom:4px">Novo lead no funil</h2>
        <p style="color:#6b7280;margin-top:0;font-size:13px">Chegou agora pelo ${lead.origem === 'site' ? 'formulário do site' : 'cadastro manual'}.</p>
        <table style="border-collapse:collapse">
          ${linha('Nome', lead.nome)}
          ${linha('WhatsApp', lead.telefone)}
          ${linha('E-mail', lead.email)}
          ${linha('Cidade', lead.cidade)}
          ${linha('Tipo de obra', SEG_ROTULOS[lead.segmento] || lead.segmento)}
          ${linha('Mensagem', lead.mensagem)}
          ${linha('Origem/UTM', lead.utm)}
        </table>
        <p style="margin-top:20px">
          ${waLink ? `<a href="${waLink}" style="background:#16a34a;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:bold;margin-right:8px">Responder no WhatsApp</a>` : ''}
          <a href="${siteUrl}/admin" style="background:#db4d4b;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:bold">Abrir o funil</a>
        </p>
      </div>`,
    }),
  });
}

export default async (req) => {
  try {
    await garanteTabela();
    const method = req.method;

    if (method === 'POST') {
      let b = {};
      try { b = await req.json(); } catch { b = {}; }
      if (corta(b.site, 10)) return json({ ok: true }); // honeypot: finge sucesso
      const nome = corta(b.nome, 120);
      const telefone = corta(b.telefone, 40);
      if (nome.length < 2 || telefone.length < 8) {
        return json({ error: 'Preencha nome e WhatsApp.' }, 400);
      }
      const [lead] = await db()`INSERT INTO leads (nome, telefone, email, cidade, segmento, mensagem, origem, utm)
        VALUES (${nome}, ${telefone}, ${corta(b.email, 120)}, ${corta(b.cidade, 80)},
                ${corta(b.segmento, 40)}, ${corta(b.mensagem, 2000)},
                ${corta(b.origem, 40) || 'site'}, ${corta(b.utm, 500)})
        RETURNING *`;
      try {
        await notificaLead(lead);
      } catch {} // e-mail nunca derruba o cadastro do lead
      return json({ ok: true, id: lead.id }, 201);
    }

    if (method === 'GET') {
      if (!(await autorizado(req))) return json({ error: 'Não autorizado' }, 401);
      const leads = await db()`SELECT * FROM leads ORDER BY criado_em DESC LIMIT 500`;
      return json({ leads });
    }

    if (method === 'PATCH') {
      if (!(await autorizado(req))) return json({ error: 'Não autorizado' }, 401);
      let b = {};
      try { b = await req.json(); } catch { b = {}; }
      const id = Number(b.id);
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const status = STATUS_VALIDOS.includes(b.status) ? b.status : null;
      const notas = typeof b.notas === 'string' ? corta(b.notas, 4000) : null;
      const [lead] = await db()`UPDATE leads SET
          status = COALESCE(${status}, status),
          notas = COALESCE(${notas}, notas),
          atualizado_em = now()
        WHERE id = ${id} RETURNING *`;
      if (!lead) return json({ error: 'Lead não encontrado' }, 404);
      return json({ lead });
    }

    if (method === 'DELETE') {
      if (!(await autorizado(req))) return json({ error: 'Não autorizado' }, 401);
      const id = Number(new URL(req.url).searchParams.get('id'));
      if (!id) return json({ error: 'id obrigatório' }, 400);
      await db()`DELETE FROM leads WHERE id = ${id}`;
      return json({ ok: true });
    }

    return notAllowed('GET, POST, PATCH, DELETE');
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
