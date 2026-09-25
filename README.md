# Lucas PRO — Planner Pessoal com Voz + Gemini

Planner pessoal mobile-first em preto + verde. As tarefas continuam salvas somente no `localStorage` do navegador. A versão com voz grava a rotina no celular e usa o Gemini no backend para transcrever e organizar as atividades.

## O que já funciona

- criar, editar, concluir e excluir atividades manualmente;
- horário, categoria, prioridade e observação;
- progresso do dia;
- `🎤 Falar minha rotina` no celular;
- gravação com `MediaRecorder` em navegadores compatíveis;
- envio do áudio apenas para `POST /api/organizar-rotina`;
- uma única chamada ao Gemini para transcrever o áudio e organizar as tarefas;
- retorno com título, horário, categoria, prioridade e observação;
- revisão/editoração das sugestões antes de salvar;
- aviso de conflito quando duas sugestões possuem o mesmo horário explícito;
- nenhuma tarefa sugerida é salva antes de tocar em **Adicionar à minha agenda**.

## Segurança

`GEMINI_API_KEY` nunca vai para o HTML ou JavaScript do navegador. Ela é lida somente no servidor por variável de ambiente. O áudio é recebido em memória e o aplicativo não grava o arquivo em disco.

## Rodar no computador

Requer Node.js 20 ou superior.

1. Copie `.env.example` para `.env`.
2. Coloque sua chave do Gemini no arquivo local:

```env
GEMINI_API_KEY=
PORT=3000
```

3. Preencha sua chave depois do sinal `=` e inicie:

```bash
npm start
```

4. Abra `http://localhost:3000`.

O servidor também inicia sem chave para que o planner manual continue acessível; nesse caso, somente o recurso de IA fica indisponível até a chave ser configurada.

## Usar o microfone no celular

Em produção, a permissão de microfone do navegador normalmente exige **HTTPS**. Render fornece HTTPS no endereço público do serviço. O foco inicial é Chrome/Edge atualizados no Android. Caso `MediaRecorder` não esteja disponível, o app mantém o cadastro manual funcionando e informa que a gravação não é suportada.

## Gemini

O servidor usa `gemini-3.5-flash-lite` para receber o áudio diretamente, gerar a transcrição e organizar a rotina em JSON estruturado em uma única chamada.

O Gemini Developer API oferece nível sem custo financeiro para esse modelo dentro das cotas aplicáveis. Limites e disponibilidade podem mudar conforme as regras do Google AI Studio.

## Publicar no Render

O projeto inclui `render.yaml`. No Render:

1. conecte o repositório;
2. crie/aplique o Blueprint ou Web Service;
3. use o Build Command definido no `render.yaml` (não há dependências externas);
4. mantenha `node server.js` como Start Command;
5. configure `GEMINI_API_KEY` como **Secret/Environment Variable** no painel;
6. não coloque o valor da chave no `render.yaml` nem no GitHub.

O serviço escuta `process.env.PORT` em `0.0.0.0`, como exigido para Web Services do Render.

## Testes

```bash
npm test
```

Também há `/health`, que retorna `{ "ok": true }` sem chamar a IA.
