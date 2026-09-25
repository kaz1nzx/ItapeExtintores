# Validação da entrega

Verificado em 22/09/2026, com Node.js 24.21.0 e Next.js 16.3.6.

## Resultado

- Build de produção concluído, incluindo verificação TypeScript.
- 12 testes automatizados de estoque, custo histórico, custo médio, impostos, períodos, despesas, valores inválidos e prejuízo: aprovados.
- Testes reais no Supabase com conta sintética dentro de transação revertida: cadastro, compra, venda, custo médio, valores históricos, rollback, estoque insuficiente, versão desatualizada, repetição idempotente, bloqueio de escrita direta, isolamento por proprietário e negação de acesso anônimo: aprovados.
- Supabase Security Advisors após os ajustes: nenhuma ocorrência retornada.
- Verificações HTTP: API sem login retorna 401; gravação de outra origem retorna 403; login com formato inválido retorna 400; área privada redireciona para login; cabeçalhos de proteção e ausência de cache compartilhado verificados.
- Navegador Edge: painel renderizado sem erros JavaScript reportados, cadastro de produto, busca por SKU, compra de dez unidades, venda de duas unidades e atualização de estoque/indicadores verificados com dados fictícios.
- Relatório semanal e mensal, conteúdo CSV e geração de PDF por impressão verificados.
- Interface inspecionada em 1440 px e 390 px. Nenhum transbordamento horizontal da página na largura móvel; as tabelas mantêm sua própria rolagem horizontal.

## Limites da verificação

- Não foi realizado login com uma conta real do proprietário. A leitura das contas existentes foi bloqueada pela revisão automática por privacidade; a integração foi concluída sem essa leitura. O acesso final requer uma conta de e-mail/senha cadastrada em Supabase Auth.
- Os testes de banco foram revertidos; nenhum produto, venda, despesa ou conta de teste permaneceu gravado.
- A ferramenta de download do Edge cancelou uma tentativa automatizada de salvar CSV. O nome, o tipo e o conteúdo gerados pela ação da interface foram verificados diretamente no navegador. O PDF de impressão foi gerado com sucesso.
- Não houve teste de carga de grande volume ou medição de latência de escrita com a conta real. As ações locais usam estado em memória; a confirmação dos dados reais depende da rede e do Supabase.
- A ausência de avisos automáticos não equivale a uma auditoria de segurança independente.

## Correção adicional no projeto Supabase

A função preexistente `public.rls_auto_enable()`, usada como event trigger para habilitar RLS, tinha execução concedida a papéis da API. Foi revogada somente a execução direta para `PUBLIC`, `anon` e `authenticated`, preservando sua execução automática por evento. A função interna de lançamentos da aplicação está em esquema privado e valida o proprietário.

## Painel de administração (24/09/2026)

- `npm test` (51 testes, 6 novos para cobrança, resumo das contas, próximo vencimento e validação dos comandos), `npm run check` e `npm run build`: aprovados.
- SQL executado de verdade em PGlite 0.5.8 (PostgreSQL 18), com uma simulação mínima do esquema `auth` e dos papéis `anon`/`authenticated` do Supabase: `schema.sql`, o `upgrade.sql` anterior, o novo `upgrade.sql` aplicado duas vezes seguidas, `verify.sql` e `tests/company-isolation.sql`. Todos aprovados. Como controle, o novo `verify.sql` falha no banco sem a atualização.
- `verify.sql` passou a cobrir: conta suspensa sem leitura (`itape_state` e tabelas) nem gravação; conta comum sem acesso ao painel e aos comandos de administrador; tabelas de assinatura fechadas à leitura direta; administrador não pode ser suspenso; pagamento avança um mês com corte de fim de mês (31/01 → 28/02); pagamento repetido recusado; dados de volta após a reativação.
- Navegador Edge, com dados fictícios em uma rota temporária já removida: visão geral, dica do gráfico, contas, filtros, janelas de suspensão, pagamento e assinatura, tela de acesso suspenso e link **Administração** no menu. Inspecionado em 1440, 1280 e 390 px, sem transbordamento horizontal da página; a coluna de ações da tabela fica sempre visível.
- Sem login, `/admin` redireciona para `/login`, e a gravação pelo painel retorna 401 com a mensagem exibida na janela.

### Limites

- O `upgrade.sql` não foi executado no projeto Supabase real, e o painel não foi aberto com uma conta administradora real. Falta aplicar a atualização e cadastrar o administrador (README, seção Administração).
- PGlite não é o Supabase: o esquema `auth` foi simulado. Leitura de `auth.users` e das colunas `last_sign_in_at`/`is_anonymous` depende do projeto real.

## Meta, comparação, previsão, primeiros passos e aviso da mensalidade (24/09/2026)

- `npm test` (59 testes, 8 novos: período anterior com virada de mês e fevereiro, variação, meta vigente por mês, progresso e ritmo, previsão de recargas, comandos de preferências, aviso da mensalidade e número de WhatsApp), `npm run check` e `npm run build`: aprovados.
- SQL em PGlite, nos três caminhos: banco novo; banco com a versão anterior ao painel de administração; e banco já com o painel (commit "Painel Adm") recebendo esta atualização. `verify.sql` aprovado em todos. Ele passou a cobrir metas por mês, valor da recarga, mês e valor inválidos recusados e o vencimento da própria assinatura em `itape_access`.
- Navegador Edge em 1440 e 390 px: demonstração (primeiros passos, setas de variação, meta abaixo do ritmo e meta batida, janela da meta, previsão com troca de mês) e uma rota temporária já removida (conta nova, aviso a vencer, aviso vencido, tela suspensa com WhatsApp). Sem erros na página e sem transbordamento horizontal.

### Limites

- Não executado no projeto Supabase real: falta aplicar o `upgrade.sql` atualizado.
- O potencial da previsão usa um valor médio único por recarga, não o preço de cada tipo de extintor.

## Segurança (24/09/2026)

- Revisão: sem `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `new Function` no código; `npm audit` sem vulnerabilidades (produção e desenvolvimento); só o `.env.example` no histórico do git.
- `npm test` (66 testes, 7 novos: limite de tentativas, limite de memória do limitador, leitura de corpo com limite, IP do visitante, política CSP, conta aguardando ativação e frases do registro de ações), `npm run check` e `npm run build`: aprovados.
- SQL em PGlite: banco novo; banco anterior ao painel; e banco com o painel commitado, com contas criadas antes da atualização. Resultado: a conta existente ficou ativa, a suspensa continuou suspensa, uma conta criada depois ficou aguardando, e rodar o `upgrade.sql` de novo não a ativou. `verify.sql` cobre também: conta sem ativação não lê nem grava; editar a assinatura não ativa a conta; ativação e edição registradas com o administrador; registro fechado à leitura direta. Controle: o novo `verify.sql` falha no banco sem a atualização.
- Build de produção (`next start`) com um Supabase Auth falso local, para não gastar tentativas no projeto real: 24 verificações aprovadas. Entre elas: todos os scripts com o nonce, nonce diferente a cada requisição, cabeçalhos de proteção, 8 senhas erradas aceitas e a 9ª barrada sem chegar ao Auth, `Retry-After`, e-mail em maiúsculas contado junto, corpo de 100 KB sem tamanho declarado recusado (413), outra origem recusada (403) e `/admin` sem login redirecionado.
- Edge em produção: login, demonstração, janelas, validades e geração do PDF de orçamento funcionando, sem nenhuma violação de CSP. O zod roda sem `eval` (`jitless`), para não disparar o alerta.

### Limites

- Não executado no Supabase real: falta aplicar o `upgrade.sql`.
- O limite de tentativas vale por processo do servidor. Em hospedagem com várias instâncias, cada uma conta as suas.
- As configurações do painel do Supabase (cadastros, senhas, limites, backups) não foram vistas nem alteradas.

## Janela de dados (25/09/2026)

- Problema: cada carregamento e cada registro salvo devolviam o histórico inteiro da loja. Com 15 vendas por dia, a resposta passaria do limite de 4,5 MB da Vercel em cerca de 7 meses.
- Medição em PGlite, com uma loja de 15 vendas por dia durante um ano, gravada pelas funções do sistema: antes 7,89 MB por resposta, e crescendo; agora 1,79 MB (janela), 0,42 MB (dois meses antigos), 0,01 MB (página de orçamentos) e 0,67 MB (um mês da exportação).
- `npm test` (70 testes, 4 novos: período necessário por visão, junção sem repetição, meses da exportação e totais da conta), `npm run check` e `npm run build`: aprovados.
- SQL em PGlite: banco novo, banco com a versão publicada ("Versão Final") e banco anterior ao painel. `verify.sql` cobre a janela (nada anterior ao início, validades pendentes enxutas, totais da conta), o orçamento devolvido pela gravação, repetição sem duplicar, períodos antigos, exportação completa, busca de orçamentos por cliente e número, paginação, limites de período e busca, e bloqueio para conta sem acesso e anônima. Controle: o novo `verify.sql` falha no banco publicado.
- Build de produção no Edge, com as chamadas à API respondidas pelas funções novas em PGlite (loja com 14 meses de histórico): 14 verificações aprovadas. Receita do mês e relatório de dezembro/2025 iguais aos do histórico completo; mês antigo buscado só quando escolhido; orçamentos com o total da conta, 10 por página e busca em todos os períodos; nova venda salva, orçamento no topo e PDF baixado; exportação com todos os registros, em 14 pedidos mensais; maior resposta 0,78 MB, contra 3,71 MB do histórico completo; nenhum erro na página.

### Limites

- Não executado no Supabase real. Sem o `upgrade.sql`, o site usa as funções anteriores e continua funcionando como antes, com o histórico inteiro.
- Uma loja com 30 vendas por dia chega a cerca de 3,6 MB por resposta, por causa de um ano de validades pendentes: abaixo do limite, mas sem muita folga.
