import { db } from '../lib/util.mjs';
import {
  STATUS_INFO,
  STATUS_VALIDOS,
  destinos,
  tg,
  leadTexto,
  botoesLead,
  funilTexto,
  listaBotoes,
} from '../lib/telegram.mjs';

export const config = { path: '/api/telegram' };

// Só os chat_ids definidos em TELEGRAM_CHAT_ID podem usar o bot. Se a
// variável estiver vazia, libera (útil só no setup); em produção ela tem
// os ids do Jordano e do acompanhamento.
function autorizadoChat(id) {
  const lista = destinos();
  return !lista.length || lista.includes(String(id));
}

// Monta a lista enxuta do /leads: resumo do funil + um botão por lead.
async function montaLista() {
  const contagem = await db()`SELECT status, count(*)::int AS n FROM leads GROUP BY status`;
  const mapa = Object.fromEntries(contagem.map((r) => [r.status, r.n]));
  const total = contagem.reduce((s, r) => s + r.n, 0);
  if (!total) {
    return {
      text: 'Nenhum lead cadastrado ainda. Quando o primeiro chegar pelo site, ele aparece aqui na hora.',
    };
  }
  const leads = await db()`SELECT id, nome, telefone, status FROM leads
    ORDER BY criado_em DESC LIMIT 10`;
  return { text: funilTexto(mapa, total), reply_markup: listaBotoes(leads) };
}

// Monta o cartão de um lead (texto + botões de classificação).
async function montaCartao(id) {
  const [lead] = await db()`SELECT * FROM leads WHERE id = ${id}`;
  if (!lead) return null;
  return { text: leadTexto(lead), reply_markup: botoesLead(lead) };
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
    // Clique num botão: abrir lead, voltar pra lista ou mudar o status.
    if (upd.callback_query) {
      const cq = upd.callback_query;
      if (!autorizadoChat(cq.from?.id)) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Sem permissão.' });
        return new Response('ok');
      }
      const data = cq.data || '';
      const alvo = {
        chat_id: cq.message?.chat?.id,
        message_id: cq.message?.message_id,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };

      // Voltar / atualizar a lista.
      if (data === 'ls') {
        const lista = await montaLista();
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        await tg('editMessageText', { ...alvo, text: lista.text, reply_markup: lista.reply_markup });
        return new Response('ok');
      }

      // Abrir o cartão de um lead.
      let m = /^v:(\d+)$/.exec(data);
      if (m) {
        const cartao = await montaCartao(Number(m[1]));
        if (!cartao) {
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Lead não encontrado.' });
          return new Response('ok');
        }
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        await tg('editMessageText', { ...alvo, text: cartao.text, reply_markup: cartao.reply_markup });
        return new Response('ok');
      }

      // Mudar o status de um lead.
      m = /^s:(\d+):(\w+)$/.exec(data);
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
            ...alvo,
            text: leadTexto(lead),
            reply_markup: botoesLead(lead),
          });
        } else {
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Lead não encontrado.' });
        }
        return new Response('ok');
      }

      await tg('answerCallbackQuery', { callback_query_id: cq.id });
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
        const lista = await montaLista();
        await tg('sendMessage', {
          chat_id: chatId,
          text: lista.text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: lista.reply_markup,
        });
      } else if (/^\/(start|help|ajuda)\b/i.test(texto)) {
        await tg('sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text:
            '🤖 <b>Bot de leads da Construtora Lindóia</b>\n\n' +
            'Cada novo contato do site cai aqui na hora, já com botões pra você classificar.\n\n' +
            '📞 Atendido  ·  💰 Orçamento  ·  🏆 Fechado  ·  ❌ Descartar  ·  ↩️ Reabrir\n\n' +
            '<b>Comando</b>\n/leads — ver a lista e abrir cada contato',
        });
      }
      return new Response('ok');
    }
  } catch {
    // Nunca estoura pro Telegram: responde 200 pra ele não ficar reenviando.
  }
  return new Response('ok');
};
