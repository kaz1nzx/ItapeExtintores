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
