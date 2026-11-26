# Radar de Sinais na nuvem (grátis)

Com este servidor os dois robôs rodam 24 horas, mesmo com o app fechado, e param só quando você clica em **Parar**. Você recebe notificações de **sinal**, **gale**, **WIN** e **LOSS** no celular e no computador.

Tudo usa planos gratuitos. Você vai precisar de:

| Serviço | Para quê | Obrigatório? |
|---|---|---|
| GitHub | guardar os arquivos do servidor | sim |
| Render | rodar o servidor (plano Free) | sim |
| cron-job.org | manter o servidor acordado (o Render Free dorme após 15 min sem acesso) | sim |
| Twelve Data | preços ao vivo de forex, cripto e ações | sim, para dados reais |
| IQ Option | velas (inclusive OTC) e payout real da sua conta, via biblioteca iqoptionapi | opcional |
| API2Trade | cotações ao vivo da sua conta MetaTrader 4/5 (€12/mês, sem teste grátis) | opcional |
| Upstash Redis | guardar placar, configurações e notificações quando o Render reinicia | recomendado |

Tempo total: cerca de 20 minutos.

---

## 1. Coloque os arquivos no GitHub

1. Crie uma conta em https://github.com (se ainda não tiver).
2. Clique em **New repository**, dê o nome `radar-de-sinais`, marque **Private** e clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Descompacte o `radar-servidor.zip` e arraste **todo o conteúdo da pasta** (server.js, core.js, package.json, render.yaml, a pasta `public`…) para a página. Clique em **Commit changes**.

## 2. Crie o servidor no Render

1. Crie uma conta em https://render.com entrando com o GitHub.
2. Clique em **New +** → **Blueprint** e escolha o repositório `radar-de-sinais`. O Render lê o arquivo `render.yaml` e já preenche tudo (plano Free, Docker com Node e Python). O primeiro build leva uns 5 minutos.
3. Ele vai pedir os valores das variáveis:
   - **APP_PIN**: invente uma senha numérica (ex.: 4821). O app vai pedir esse PIN. Sem ele, qualquer pessoa com o link poderia parar os robôs.
   - **TWELVE_DATA_KEY**: sua chave gratuita da https://twelvedata.com (painel → API Keys). Pode deixar em branco e colar depois nas Configurações do app.
   - **UPSTASH_REDIS_REST_URL** e **UPSTASH_REDIS_REST_TOKEN**: veja o passo 4 (pode deixar em branco agora e preencher depois em *Environment*).
4. Clique em **Apply**. Em 2 a 4 minutos aparece o endereço, algo como `https://radar-de-sinais-xxxx.onrender.com`.

## 3. Mantenha o servidor acordado

O plano Free do Render desliga o servidor depois de 15 minutos sem visitas. Para os robôs nunca pararem:

1. Crie uma conta em https://cron-job.org.
2. **Create cronjob** → URL: `https://SEU-ENDERECO.onrender.com/api/ping` → execução **a cada 10 minutos** → salvar.

O plano Free do Render inclui 750 horas por mês, suficiente para um servidor ligado o mês inteiro.

## 4. (Recomendado) Guarde os dados no Upstash

Quando o Render reinicia (atualizações, manutenção), ele apaga os arquivos locais. Sem o Upstash, o placar zera e cada aparelho precisa reativar as notificações.

1. Crie uma conta em https://upstash.com → **Create Database** (Redis, plano Free, região mais próxima).
2. Na página do banco, em **REST API**, copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
3. No Render → seu serviço → **Environment**, cole os dois valores e salve. O serviço reinicia sozinho.

## 5. Instale o app e ative as notificações

1. Abra o endereço do Render no celular.
   - **Android (Chrome)**: menu ⋮ → **Instalar app**.
   - **iPhone (Safari, iOS 16.4 ou mais novo)**: Compartilhar → **Adicionar à Tela de Início**. No iPhone, as notificações só funcionam com o app instalado.
   - **Computador (Chrome/Edge)**: ícone de instalar na barra de endereço.
2. Abra o app instalado, digite o **PIN**.
3. Vá em **Informações → Ativar notificações** e permita. Use **Enviar notificação de teste** para conferir.
4. Em **Configurações**, escolha estratégias, pares e payout. Em **Agente**, clique em **Iniciar** nos robôs.

Pronto: pode fechar o app. Os robôs continuam rodando no servidor e você recebe as notificações.

### Janela flutuante

No menu **Agente**, o botão **Janela flutuante** mostra os dois robôs numa janela pequena por cima das outras telas, com a indicação, o tempo e o resultado. Com o app instalado ela abre sozinha quando você clica em **Iniciar** (dá para desligar em Configurações → Geral).

- **Computador (Chrome ou Edge)**: mini janela que fica por cima de tudo, mesmo com o app minimizado.
- **Android (Chrome)**: modo imagem sobre imagem.
- **iPhone e Firefox**: o navegador não oferece esse recurso para apps da web. Use as notificações.

Os navegadores só abrem a janela flutuante a partir de um toque seu; ela não abre sozinha quando o app é minimizado.

---

## Limites do plano gratuito da Twelve Data

8 consultas por minuto e 800 por dia. Cada vela fechada custa 1 consulta por ativo (somando os ativos dos dois robôs, que agora têm listas separadas) e cada operação usa mais 2. Exemplo: 6 pares no M5 ≈ 1.730 consultas em 24 h, acima do limite. Use M15 ou mais, ou menos pares. A tela de Configurações mostra a estimativa.

O forex fecha no fim de semana, ações dos EUA só têm preço durante o pregão, e cripto roda 24 horas. Pares OTC das corretoras são preços próprios delas e não existem em nenhuma API pública; no modo OTC do ZigZag o robô aplica a lógica de lateralização sobre o forex real.

## (Opcional) Ligar à IQ Option

Com isso os robôs analisam as velas da própria IQ Option, inclusive os ativos **OTC** (EURUSD-OTC e outros, que abrem também no fim de semana), e usam o **payout real** de cada ativo.

1. Crie (ou use) uma conta da IQ Option **sem verificação em duas etapas**. O recomendado é uma conta separada, só para isso, porque o login fica guardado no servidor.
2. No Render → seu serviço → **Environment**, crie `IQ_EMAIL` e `IQ_PASSWORD` com o login dessa conta e salve.
3. No app → Configurações → Geral → Fonte de dados: **IQ Option (no servidor)**. Marque **Usar os ativos OTC** se quiser os pares OTC.

Como funciona: o servidor inicia uma pequena ponte em Python (`iq_bridge.py`) com a biblioteca não oficial `iqoptionapi`. Ela entra no modo **PRÁTICA** e só lê velas e payout; não existe nenhuma chamada de compra no código. Ações usam os nomes da IQ (APPLE, AMAZON, GOOGLE, FACEBOOK, TESLA); as que a IQ não tem aparecem como "sem dados".

Atenção:
- A `iqoptionapi` não é da IQ Option e não recebe atualização desde 2022. Se a IQ mudar o sistema, a conexão pode parar de funcionar; nesse caso o app avisa em Informações e os robôs passam para simulação.
- Usar robôs e APIs não oficiais pode ir contra os termos de uso da IQ Option e levar ao bloqueio da conta. Por isso, use uma conta separada.
- Se o servidor já existia com a versão anterior (sem Docker), crie o serviço de novo pelo Blueprint: Render → **New +** → **Blueprint**. Com o Upstash, o placar e as configurações continuam.

## (Opcional) Ligar ao MetaTrader com a API2Trade

Assim os robôs analisam os preços da sua própria corretora, os mesmos do seu MT4/MT5. A API2Trade é paga (plano Single Account, €12 por mês) e não tem teste grátis.

1. Crie a conta em https://app.metatraderapi.dev e conecte sua conta MT4/MT5 **pelo painel deles** (login, senha e servidor da corretora). Prefira uma conta demo ou a **senha de investidor** (só leitura): o Radar só lê cotações e nunca envia ordens.
2. Copie a **API key** (Settings) e o **ID da conta** (o UUID que aparece depois de conectar).
3. No Render → seu serviço → **Environment**, crie `API2TRADE_API_KEY` e `API2TRADE_ACCOUNT_ID` com esses valores. Se você tem plano Pro com endereço próprio, crie também `API2TRADE_BASE_URL`.
4. No app → Configurações → Geral → Fonte de dados: **MetaTrader (API2Trade, no servidor)**. Se na sua corretora o par aparece como `EURUSD.m` ou `EURUSDm`, preencha o sufixo.

Como funciona: o servidor pede a cotação (bid) de cada ativo a cada 2 segundos e monta as velas no relógio, como o gráfico do MT. A API2Trade não entrega o histórico de velas, então os robôs precisam de 240 velas antes da primeira análise (no M5, cerca de 20 horas). Se você também colocar a chave da Twelve Data, o histórico é carregado na hora e as velas novas vêm do MetaTrader.

## Expiração e horário das velas

A expiração de cada operação é sempre o fechamento da vela do tempo gráfico configurado (M1, M5, M15…). As velas abrem e fecham no relógio, como no MetaTrader: no M5, às :00, :05, :10 e assim por diante. Em H4 e D1 o horário de abertura no MetaTrader depende do fuso do servidor da sua corretora e pode diferir da vela usada pelo robô.

## Atualizar o servidor

Envie os arquivos novos para o mesmo repositório no GitHub (Add file → Upload files). O Render publica a nova versão sozinho.

## Rodar no seu computador (opcional)

Com Node.js 18+ instalado: `npm install` e depois `npm start`. Abra http://localhost:3000.

---

Ferramenta educacional. Os sinais não são recomendação de investimento e o robô nunca envia ordens. Opções binárias, forex e gale envolvem alto risco de perda.
