import { db } from '../lib/util.mjs';
import {
  STATUS_INFO,
  STATUS_VALIDOS,
  destinos,
  tg,
  leadTexto,
  botoesLead,
} from '../lib/telegram.mjs';

export const config = { path: '/api/telegram' };

// Só os chat_ids definidos em TELEGRAM_CHAT_ID podem usar o bot. Se a
// variável estiver vazia, libera (útil só no setup); em produção ela tem
// os ids do Jordano e do acompanhamento.
function autorizadoChat(id) {
  const lista = destinos();
  return !lista.length || lista.includes(String(id));
}

// Responde ao /leads: resumo do funil + os 10 leads mais recentes, cada um
// com os botões de classificação.
async function enviaFunil(chatId) {
  const contagem = await db()`SELECT status, count(*)::int AS n FROM leads GROUP BY status`;
  const mapa = Object.fromEntries(contagem.map((r) => [r.status, r.n]));
  const total = contagem.reduce((s, r) => s + r.n, 0);

  if (!total) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Nenhum lead cadastrado ainda. Quando o primeiro chegar pelo site, ele aparece aqui na hora.',
    });
    return;
  }

  let resumo = '📊 <b>Funil de leads</b>\n';
  for (const st of STATUS_VALIDOS) {
    const n = mapa[st] || 0;
    if (n) resumo += `${STATUS_INFO[st].emoji} ${STATUS_INFO[st].rotulo}: <b>${n}</b>\n`;
  }
  resumo += `\nMostrando os ${Math.min(total, 10)} mais recentes 👇`;
  await tg('sendMessage', { chat_id: chatId, text: resumo, parse_mode: 'HTML' });

  const leads = await db()`SELECT * FROM leads ORDER BY criado_em DESC LIMIT 10`;
  for (const lead of leads) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: leadTexto(lead),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: botoesLead(lead),
    });
  }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('ok');

  // Aceita só chamadas do Telegram: ele manda no header o segredo que a
  // gente definiu no setWebhook. Sem bater, ignora (o webhook é público).
  const segredo = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (segredo && req.headers.get('x-telegram-bot-api-secret-token') !== segredo) {
    return new Response('forbidden', { status: 401 });
  }

  let upd = {};
  try {
    upd = await req.json();
  } catch {
    upd = {};
  }

  try {
    // Clique num botão do cartão -> muda o status do lead.
    if (upd.callback_query) {
      const cq = upd.callback_query;
      if (!autorizadoChat(cq.from?.id)) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Sem permissão.' });
        return new Response('ok');
      }
      const m = /^s:(\d+):(\w+)$/.exec(cq.data || '');
      if (m && STATUS_VALIDOS.includes(m[2])) {
        const id = Number(m[1]);
        const status = m[2];
        const [lead] = await db()`UPDATE leads SET status = ${status}, atualizado_em = now()
          WHERE id = ${id} RETURNING *`;
        if (lead) {
          await tg('answerCallbackQuery', {
            callback_query_id: cq.id,
            text: `${STATUS_INFO[status].emoji} ${STATUS_INFO[status].rotulo}`,
          });
          await tg('editMessageText', {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            text: leadTexto(lead),
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: botoesLead(lead),
          });
        } else {
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Lead não encontrado.' });
        }
      } else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
      }
      return new Response('ok');
    }

    // Mensagem de texto -> comandos.
    if (upd.message) {
      const msg = upd.message;
      const chatId = msg.chat?.id;
      if (!autorizadoChat(msg.from?.id)) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Este bot é de uso interno da Construtora Lindóia.',
        });
        return new Response('ok');
      }
      const texto = (msg.text || '').trim();
      if (/^\/leads\b/i.test(texto)) {
        await enviaFunil(chatId);
      } else if (/^\/(start|help|ajuda)\b/i.test(texto)) {
        await tg('sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text:
            '🤖 <b>Bot de leads da Construtora Lindóia</b>\n\n' +
            'Cada novo contato do site cai aqui na hora, já com botões pra você classificar.\n\n' +
            '📞 Atendido  ·  💰 Orçamento  ·  🏆 Fechado  ·  ❌ Descartar  ·  ↩️ Reabrir\n\n' +
            '<b>Comando</b>\n/leads — ver o funil e os últimos contatos',
        });
      }
      return new Response('ok');
    }
  } catch {
    // Nunca estoura pro Telegram: responde 200 pra ele não ficar reenviando.
  }
  return new Response('ok');
};
