# Lucas PRO — Planner Pessoal com Voz + IA

Planner pessoal mobile-first em preto + verde. As tarefas continuam salvas somente no `localStorage` do navegador. A V2 adiciona gravação de voz e organização da rotina por IA através de um backend Node.js seguro.

## O que já funciona

- criar, editar, concluir e excluir atividades manualmente;
- horário, categoria, prioridade e observação;
- progresso do dia;
- `🎤 Falar minha rotina` no celular;
- gravação com `MediaRecorder` em navegadores compatíveis;
- envio do áudio apenas para `POST /api/organizar-rotina`;
- transcrição pela API da OpenAI;
- organização em tarefas com título, horário, categoria, prioridade e observação;
- revisão/editoração das sugestões antes de salvar;
- aviso de conflito quando duas sugestões possuem o mesmo horário explícito;
- nenhuma tarefa sugerida é salva antes de tocar em **Adicionar à minha agenda**.

## Segurança

`OPENAI_API_KEY` nunca vai para o HTML ou JavaScript do navegador. Ela é lida somente no servidor por variável de ambiente. O áudio é recebido em memória e o aplicativo não grava o arquivo em disco.

## Rodar no computador

Requer Node.js 20 ou superior.

1. Crie um arquivo `.env` local.
2. Adicione `OPENAI_API_KEY` e, opcionalmente, `PORT=3000`.
3. Inicie com `npm start`.
4. Abra `http://localhost:3000`.

O servidor também inicia sem chave para que o planner manual continue acessível; nesse caso, somente o recurso de IA falha até a chave ser configurada.

## Usar o microfone no celular

Em produção, a permissão de microfone do navegador normalmente exige **HTTPS**. Render fornece HTTPS no endereço público do serviço. O foco inicial é Chrome/Edge atualizados no Android. Caso `MediaRecorder` não esteja disponível, o app mantém o cadastro manual funcionando e informa que a gravação não é suportada.

## OpenAI

O servidor usa `gpt-4o-mini-transcribe` para transcrever o áudio e `gpt-5.6-luna` para organizar a rotina em uma saída JSON estruturada.

O uso da API da OpenAI é cobrado separadamente da assinatura do ChatGPT.

## Publicar no Render

O projeto inclui `render.yaml`. Configure `OPENAI_API_KEY` como variável de ambiente secreta no Render e mantenha `node server.js` como comando de inicialização.

O serviço escuta `process.env.PORT` em `0.0.0.0`.

## Testes

```bash
npm test
```

Também há `/health`, que retorna `{ "ok": true }` sem chamar a IA.
