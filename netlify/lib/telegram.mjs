// Integração com o Telegram: aviso instantâneo de novo lead + render dos
// cartões de lead com botões pra classificar cada contato direto no chat.
// Usado por functions/leads.mjs (envio do aviso) e functions/telegram.mjs
// (webhook que recebe os comandos e os cliques nos botões).

const SEG_ROTULOS = {
  agroindustria: 'Agroindústria',
  comercial: 'Comercial e Varejo',
  industria: 'Indústria',
  infraestrutura: 'Infraestrutura',
  produtos: 'Produtos pré-moldados',
};

// Funil: ordem + emoji/rótulo de cada status (os mesmos do painel /admin).
const STATUS_INFO = {
  novo: { emoji: '🆕', rotulo: 'Novo' },
  contato: { emoji: '📞', rotulo: 'Em atendimento' },
  orcamento: { emoji: '💰', rotulo: 'Orçamento enviado' },
  fechado: { emoji: '🏆', rotulo: 'Fechado' },
  perdido: { emoji: '❌', rotulo: 'Descartado' },
};
const STATUS_VALIDOS = Object.keys(STATUS_INFO);

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function waNum(tel) {
  const z = String(tel || '').replace(/\D/g, '');
  return z ? (z.startsWith('55') ? z : '55' + z) : '';
}

function quando(ts) {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Cuiaba',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

function token() {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

// Destinos que recebem o aviso e podem usar os comandos (separados por vírgula).
function destinos() {
  return (process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function siteUrl() {
  return (process.env.SITE_URL || 'https://construtoralindoia.com.br')
    .trim()
    .replace(/\/$/, '');
}

// Chamada genérica à Bot API. Devolve a Response (ou null se faltar token).
async function tg(method, body) {
  const t = token();
  if (!t) return null;
  return fetch(`https://api.telegram.org/bot${t}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Texto HTML do cartão de um lead.
function leadTexto(lead) {
  const si = STATUS_INFO[lead.status] || STATUS_INFO.novo;
  const linha = (rotulo, valor) => (valor ? `${rotulo} ${esc(valor)}\n` : '');
  const data = quando(lead.criado_em);
  return (
    `🔔 <b>Lead #${lead.id}</b>  ·  ${si.emoji} <b>${si.rotulo}</b>\n\n` +
    linha('👤 <b>Nome:</b>', lead.nome) +
    linha('📱 <b>WhatsApp:</b>', lead.telefone) +
    linha('✉️ <b>E-mail:</b>', lead.email) +
    linha('📍 <b>Cidade:</b>', lead.cidade) +
    linha('🏗️ <b>Tipo de obra:</b>', SEG_ROTULOS[lead.segmento] || lead.segmento) +
    linha('💬 <b>Mensagem:</b>', lead.mensagem) +
    linha('🌐 <b>Origem:</b>', lead.utm || lead.origem) +
    (data ? `🕒 ${esc(data)}\n` : '')
  );
}

// Teclado de botões do cartão. Os callback_data viram "s:<id>:<status>"
// e são tratados pelo webhook (functions/telegram.mjs).
function botoesLead(lead) {
  const wn = waNum(lead.telefone);
  const rows = [];
  if (wn) rows.push([{ text: '💬 Responder no WhatsApp', url: `https://wa.me/${wn}` }]);
  rows.push([
    { text: '📞 Atendido', callback_data: `s:${lead.id}:contato` },
    { text: '💰 Orçamento', callback_data: `s:${lead.id}:orcamento` },
  ]);
  rows.push([
    { text: '🏆 Fechado', callback_data: `s:${lead.id}:fechado` },
    { text: '❌ Descartar', callback_data: `s:${lead.id}:perdido` },
  ]);
  rows.push([
    { text: '↩️ Reabrir', callback_data: `s:${lead.id}:novo` },
    { text: '📊 Funil', url: `${siteUrl()}/admin` },
  ]);
  return { inline_keyboard: rows };
}

// Aviso instantâneo de novo lead pra todos os destinos. Se o Telegram não
// estiver configurado, apenas não envia; o lead é salvo do mesmo jeito.
async function notificaTelegram(lead) {
  const chats = destinos();
  if (!token() || !chats.length) return;
  const texto = leadTexto(lead);
  const reply_markup = botoesLead(lead);
  await Promise.all(
    chats.map((chat_id) =>
      tg('sendMessage', {
        chat_id,
        text: texto,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup,
      })
    )
  );
}

export {
  SEG_ROTULOS,
  STATUS_INFO,
  STATUS_VALIDOS,
  esc,
  waNum,
  quando,
  tg,
  destinos,
  siteUrl,
  leadTexto,
  botoesLead,
  notificaTelegram,
};
