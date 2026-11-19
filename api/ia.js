// Função na nuvem que o ia.html chama em /api/ia
// Recebe { texto } e devolve { resumo, palavras_chave, nivel }

const URL_IA = 'https://api.cloudflare.com/client/v4/accounts/0a0899cb8b47c623615743035a2f26b9/ai/v1/chat/completions';
const MODELO = '@cf/mistralai/mistral-small-3.1-24b-instruct';

const INSTRUCAO = `Você é um assistente de estudos.
Leia o texto do usuário e responda SOMENTE com um JSON neste formato:
{"resumo": "resumo em até 2 frases",
 "palavras_chave": ["palavra1", "palavra2", "palavra3"],
 "nivel": "básico, intermediário ou avançado"}`;

const ERROS = {
  401: 'Chave inválida ou expirada. Confira o segredo AI_GATEWAY_API_KEY na Vercel.',
  402: 'O limite de gasto da sua chave acabou. Fale com o professor.',
  403: 'A chave não tem permissão para essa conta da Cloudflare. Confira o ID da conta na URL.',
  429: 'Muitos pedidos ou limite do dia atingido. Espere um pouco e tente de novo.',
};

function erro(mensagem, status) {
  return Response.json({ erro: mensagem }, { status });
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return erro('Use o botão da página para enviar o texto.', 405);
    }

    let texto;
    try {
      texto = String((await request.json()).texto || '').trim().slice(0, 2000);
    } catch {
      return erro('Pedido inválido.', 400);
    }
    if (!texto) {
      return erro('Digite ou cole um texto primeiro.', 400);
    }

    // a chave fica guardada na Vercel (Settings > Environment Variables)
    const chave = process.env.AI_GATEWAY_API_KEY;
    if (!chave) {
      return erro('A variável AI_GATEWAY_API_KEY não está configurada na Vercel.', 500);
    }

    let resposta;
    try {
      resposta = await fetch(URL_IA, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chave}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELO,
          messages: [
            { role: 'system', content: INSTRUCAO },
            { role: 'user', content: texto },
          ],
          temperature: 0.2,
        }),
      });
    } catch (e) {
      console.log('Falha de rede ao chamar a IA:', e);
      return erro('Não consegui falar com a IA. Tente de novo.', 502);
    }

    if (!resposta.ok) {
      // aparece nos logs da Vercel, ajuda a descobrir o problema
      console.log('Erro da IA', resposta.status, (await resposta.text()).slice(0, 300));
      return erro(ERROS[resposta.status] || `Erro ${resposta.status} ao falar com a IA.`, 502);
    }

    const dados = await resposta.json();
    const conteudo = dados.choices[0].message.content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    try {
      return Response.json(JSON.parse(conteudo));
    } catch {
      console.log('A IA não respondeu em JSON:', conteudo);
      return erro('A IA não respondeu em JSON. Tente de novo.', 502);
    }
  },
};
