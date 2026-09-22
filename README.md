# Itapê Extintores

Sistema de estoque e financeiro construído em Next.js App Router, React, TypeScript e Supabase. O ZIP original serviu de referência funcional; a estrutura Vite foi substituída por Next.js e a interface foi redesenhada.

## Abrir o projeto

Requisito: Node.js 24 ou superior. Na pasta do projeto:

```sh
npm ci
npm run dev
```

Abra **http://127.0.0.1:3000/demo** para experimentar com dados fictícios ou **http://127.0.0.1:3000/login** para acessar a conta real. As alterações da demonstração existem apenas durante a visita e desaparecem ao recarregar.

Para usar a versão otimizada:

```sh
npm run build
npm start
```

Em uso local, `localhost`, `127.0.0.1` e `[::1]` são aceitos como origens equivalentes, desde que o protocolo e a porta sejam os mesmos de `APP_ORIGIN`. A aplicação inicia restrita ao computador local. Para publicar depois, configure `APP_ORIGIN` com a origem HTTPS exata do site e o servidor de hospedagem. Domínios externos não recebem essa equivalência.

## Supabase já integrado

- Projeto: `itapextintores`, referência `ezddplxugvhqwaeyupmf`.
- As tabelas, funções, índices e políticas de acesso já foram criados nesse projeto.
- `.env.local` contém a URL e a chave **publishable**, sem chave secreta ou `service_role`. A chave publishable é um identificador de projeto; o acesso depende da sessão e das regras no banco.
- Esse arquivo está ignorado pelo Git. Em outra instalação, copie `.env.example` para `.env.local` e preencha a URL e a chave publishable do painel Supabase.
- Crie ou use sua própria conta de e-mail/senha em **Authentication → Users** no Supabase e entre com ela na tela de login. Nenhuma senha padrão foi criada. Não foi necessário consultar as contas existentes.
- Cada conta vê somente seus próprios produtos e registros. Para a operação de uma pessoa, use sempre a mesma conta. Não há compartilhamento entre contas nesta versão.
- Não há cadastro público pela interface. Se não precisar de novos usuários, desative novos cadastros nas configurações de Auth do projeto.

## Como começar

1. Entre na conta real.
2. Em **Estoque → Novo produto**, informe código, tipo, capacidade, custo, preço de venda, estoque mínimo e alíquota.
3. Em **Entrada de estoque**, registre as quantidades, o custo de compra e o fornecedor. O cadastro começa com estoque zero.
4. Use **Nova venda** para registrar cliente, quantidade, preço e data. A baixa de estoque acontece na mesma transação da venda.
5. Lance aluguel, transporte e outros gastos em **Financeiro → Nova despesa**. Não lance a compra de extintores novamente como despesa.
6. Em **Relatórios**, selecione semana ou mês; baixe CSV ou use **Imprimir / PDF**. Para gerar PDF, escolha “Salvar como PDF” na janela de impressão.
7. Em **Configurações**, exporte uma cópia JSON dos registros quando necessário.

## O que foi implementado

- Painel com receita, custos/despesas, resultado e estoque atual; gráfico diário.
- Cadastro e edição de produtos, busca, filtros e paginação.
- Alertas por estoque mínimo e arquivamento de produtos sem saldo.
- Compras com custo médio ponderado, vendas com baixa de estoque e histórico de movimentações.
- Valores de custo, preço e alíquota preservados em cada venda.
- Despesas operacionais, composição do resultado e saldo operacional estimado.
- Relatórios semanais (sete dias terminando na data escolhida) e mensais (mês calendário, até hoje no mês atual).
- CSV com resumo, vendas, compras e despesas; impressão/PDF e exportação JSON.
- Layout responsivo, navegação sem recarga, feedback imediato, animações discretas e respeito à preferência de movimento reduzido.
- Formulários com validação, foco contido em diálogo nativo, suporte a Escape e mensagens de erro.

## Regras dos valores financeiros

Os valores monetários são armazenados em centavos inteiros. O custo médio de estoque é arredondado ao centavo a cada compra, e os impostos são arredondados por venda.

**Resultado estimado = receita de vendas − custo dos itens vendidos − impostos informados − despesas operacionais.**

**Saldo operacional estimado = receita de vendas − compras de estoque − impostos informados − despesas operacionais.**

Uma compra aumenta o estoque e aparece como saída operacional; seu custo entra no resultado à medida que os produtos são vendidos. Assim, o mesmo gasto não é descontado duas vezes do resultado.

O saldo operacional assume pagamentos à vista: não representa saldo bancário, contas a pagar/receber ou conciliação. Os impostos dependem das alíquotas inseridas pelo usuário. O estoque mostrado é o saldo atual, mesmo quando o relatório financeiro exibe um período antigo.

## Segurança e consistência

- Supabase Auth, sessão em cookies HttpOnly/SameSite e verificação de usuário nas rotas protegidas.
- Validação da origem nas requisições de escrita; respostas autenticadas sem cache compartilhado.
- RLS com propriedade por usuário em todas as tabelas de negócio.
- Clientes só têm leitura direta; alterações passam por funções transacionais controladas.
- A função privilegiada fica em esquema privado, exige identidade válida e restringe todos os objetos ao proprietário. O adaptador público usa `SECURITY INVOKER`.
- Bloqueio transacional e versão do conjunto de dados impedem sobrescritas concorrentes.
- Identificadores de operação tornam a repetição após perda de resposta idempotente.
- Estoque negativo e edição manual do custo com saldo existente são bloqueados.
- Data de movimentação não pode anteceder a última movimentação daquele produto.
- Histórico não tem edição ou exclusão pela interface. Estornos/devoluções ainda não fazem parte desta versão.
- Cabeçalhos de proteção, ausência de HTML não escapado e tratamento de conteúdo potencialmente executável no CSV.
- Dependências fixadas com arquivo de lock. Nenhuma chave administrativa é usada no app.

O salvamento depende da conexão com o Supabase. A interface responde imediatamente e confirma somente após o retorno do banco. Se houver falha, mantém os campos e permite repetir a mesma solicitação sem duplicar o lançamento. Não há modo offline com sincronização posterior.

## Banco e testes

`database/schema.sql` documenta a instalação em um banco novo. **Não execute novamente no projeto já configurado**: os objetos já existem. `database/hardening-existing-trigger.sql` registra a restrição aplicada à função preexistente de RLS automático.

```sh
npm test
npm run check
npm run build
```

`database/verify.sql` verifica as funções reais em uma transação com conta fictícia temporária e encerra com ROLLBACK. Não consulta nem modifica contas existentes. Execute somente com uma conexão administrativa de teste e preserve o ROLLBACK.

As verificações executadas estão em `VALIDACAO.md`.

## Estrutura

```text
src/app/                 Rotas Next.js, login e API
src/components/          Interface, formulários e gráfico
src/lib/domain.ts        Regras compartilhadas e dados de demonstração
src/lib/supabase.ts      Cliente Supabase no servidor
src/proxy.ts             Renovação da sessão
database/                Estrutura SQL e verificação transacional
tests/                   Testes das regras de estoque/financeiro
```

Para uma loja pequena, os registros da conta são carregados de uma só vez, permitindo filtros e navegação imediatos. Com um histórico muito grande, o próximo passo é paginação e agregação dos relatórios no banco. A cópia JSON é exportação de dados, não restauração automática; backups do Supabase dependem da configuração/plano do projeto.

## Referências técnicas

- [Autenticação SSR no Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Funções transacionais no banco](https://supabase.com/docs/guides/database/functions)
- [Segurança de dados no Next.js](https://nextjs.org/docs/app/guides/data-security)
