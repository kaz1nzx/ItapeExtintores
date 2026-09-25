
<<<<<<< HEAD
ExtinPro é um sistema de estoque e financeiro construído em Next.js App Router, React, TypeScript e Supabase. O ZIP original serviu de referência funcional; a estrutura Vite foi substituída por Next.js e a interface foi redesenhada.

Orçamentos fica no fim do menu principal, após Relatórios. Cada conta possui uma empresa, cadastrada em **Configurações → Sua empresa**, com nome, complemento da razão social, CNPJ, endereço, cidade/UF/CEP, e-mail, responsável e telefone. O painel identifica a empresa conectada, e os novos orçamentos preservam uma cópia do cadastro na emissão. Editar o cadastro não modifica documentos antigos. Contas novas começam sem empresa predefinida.

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
- Para uma nova empresa, crie uma conta de e-mail/senha em **Authentication → Users** no Supabase, entre com ela no site e preencha **Configurações → Sua empresa**. Nenhuma senha padrão foi criada. A mensalidade e o acesso de cada conta ficam em **Administração** (veja abaixo).
- Cada conta vê somente sua própria empresa, produtos e registros. Não há compartilhamento entre logins nem várias empresas no mesmo login nesta versão. A conta `teste@gmail.com` foi vinculada à ItapeExtintores, com os dados disponíveis em seus orçamentos anteriores.
- Não há cadastro público pela interface. Se não precisar de novos usuários, desative novos cadastros nas configurações de Auth do projeto.

## Como começar

1. Entre na conta real.
2. Em **Estoque → Novo produto**, informe código, tipo, capacidade, custo, preço de venda, estoque mínimo e alíquota.
3. Em **Entrada de estoque**, registre as quantidades, o custo de compra e o fornecedor. O cadastro começa com estoque zero.
4. Use **Nova venda** para registrar cliente, quantidade, preço e data. A baixa de estoque acontece na mesma transação da venda. Informe o WhatsApp do cliente e mantenha **Agendar lembrete de validade** marcado: os extintores vendidos entram no calendário com vencimento em 12 meses.
   Preencha também as condições de pagamento e, se necessário, as observações. Ao clicar em **Salvar venda e gerar PDF**, o sistema baixa um orçamento numerado com os dados da empresa, cliente, data, todos os produtos, quantidades, valores unitários, subtotais e total e abre a aba **Orçamentos** no menu esquerdo. Nela ficam reunidos os orçamentos de todos os períodos, com busca por cliente ou número e botão **Baixar PDF**. O orçamento preserva os dados da venda mesmo que o cadastro do produto seja alterado depois. Se o download falhar, tente novamente pela aba Orçamentos, sem registrar outra venda.
5. Em **Validades**, acompanhe quem precisa de contato: o cliente aparece 30 dias antes do vencimento, com **Avisar** (abre o WhatsApp com a mensagem pronta), **Renovar** (registra a recarga e abre o próximo ciclo de 12 meses) e dispensa. Recargas feitas fora do sistema entram por **Registrar validade**.
6. Lance aluguel, transporte e outros gastos em **Financeiro → Nova despesa**. Não lance a compra de extintores novamente como despesa.
7. Em **Relatórios**, selecione semana ou mês; baixe CSV ou use **Imprimir / PDF**. Para gerar PDF, escolha “Salvar como PDF” na janela de impressão.
8. Em **Configurações**, exporte uma cópia JSON dos registros quando necessário.

Em **Validades**, clique em qualquer dia do calendário para salvar um lembrete, como “Orçamento para cliente X”, com observações opcionais. O calendário funciona mesmo sem validades cadastradas. Quando faltarem **menos de 30 dias**, aparecem uma notificação no site, um contador ao lado de Validades e um alerta junto do lembrete. Lembretes atrasados continuam avisando até clicar em **Concluir**. Na conta real, os lembretes ficam salvos no Supabase; na demonstração, são descartados ao recarregar.

## Acompanhamento do negócio

- **Primeiros passos:** uma conta nova vê na Visão geral cinco passos (empresa, primeiro produto, entrada de estoque, primeira venda e meta do mês), cada um com o botão que leva à tela certa. O quadro some quando tudo estiver feito; **Ocultar** vale só para aquele navegador.
- **Comparação com o período anterior:** os indicadores mostram a variação com seta e sinal. O mês em andamento é comparado com os mesmos dias do mês anterior (1 a 24/09 contra 1 a 24/08); um mês fechado, com o mês anterior inteiro; a semana, com os 7 dias anteriores. Verde é mudança boa (receita subindo, custo caindo) e vermelho, ruim.
- **Meta de vendas:** defina em **Visão geral → Definir meta**. A barra mostra quanto já entrou, a marca vermelha indica onde as vendas deveriam estar hoje, e o painel calcula quanto falta por dia e onde o mês fecha no ritmo atual. A meta vale do mês escolhido em diante; trocar a meta não altera os meses anteriores.
- **Previsão de recargas:** em **Validades**, os extintores com validade pendente aparecem por mês de vencimento nos próximos 6 meses, com os já vencidos e não renovados em separado. Informe o **valor médio da recarga** para ver o potencial em reais, e clique em um mês para ver extintores, clientes e potencial.

## Administração das contas (assinaturas)

A página **/admin** é o painel do dono do sistema. Ela lista todas as contas cadastradas em Authentication, com mensalidade, vencimento, situação e uso, e permite suspender ou reativar o acesso de cada uma.

**Configurar uma vez:**

1. Execute `database/upgrade.sql` no SQL Editor do Supabase. Pode repetir. Na primeira vez, as contas que já existem ficam ativas; as criadas depois aguardam a sua ativação.
2. No mesmo SQL Editor, torne a sua conta administradora, trocando pelo seu e-mail:

   ```sql
   insert into itape_private.admins(user_id)
   select id from auth.users where email = 'seu-email@exemplo.com'
   on conflict do nothing;
   ```

3. Entre no site com essa conta. O menu lateral passa a mostrar **Administração**.

**No dia a dia:**

- **Novo cliente:** crie o usuário (e-mail e senha) em Authentication → Users. Ele aparece em **Administração → Contas** como **Aguardando ativação** e só entra no sistema depois que você clicar em **Ativar** (ou marcar "Ativar o acesso agora" ao registrar o primeiro pagamento). Em **Editar assinatura**, informe a mensalidade e o vencimento. Assim, mesmo que alguém consiga criar um usuário no Supabase, ele não usa o sistema sem a sua liberação.
- **Registro de ações:** a Visão geral da administração lista as últimas ativações, suspensões, edições de assinatura e pagamentos, com quem fez e quando.
- **Pagamento recebido:** use **Registrar pagamento**. O vencimento avança um mês a partir do vencimento atual. Se a conta estiver suspensa, a mesma janela reativa o acesso.
- **Aviso ao cliente:** 7 dias antes do vencimento, e enquanto estiver vencida, a conta vê no topo do sistema um aviso com a data e o valor. Com `SUPPORT_WHATSAPP` no `.env.local` (seu número com DDD, por exemplo `11987654321`), o aviso e a tela de acesso suspenso ganham um botão que abre uma conversa com você.
- **Cliente parou de pagar:** clique em **Suspender**. O bloqueio é imediato: ao abrir o sistema, o cliente vê a tela "Acesso suspenso", e o banco recusa leitura e gravação dessa conta, mesmo fora do site. Os dados ficam guardados, e **Reativar** devolve tudo como estava.
- A suspensão é sempre manual. Contas em atraso aparecem em destaque (visão geral, contador no menu e filtro **Em atraso**), mas nenhuma é bloqueada sozinha.
- A **Visão geral** mostra a receita mensal das contas ativas, as contas ativas, em atraso e suspensas, as operações por dia nos últimos 30 dias e as contas mais ativas. O painel mostra contagens de uso de cada cliente, nunca os valores financeiros das empresas.
- Só quem está em `itape_private.admins` abre o painel; para as demais contas, a página volta ao sistema. Contas de administrador não podem ser suspensas.

## O que foi implementado

- Painel com receita, custos/despesas, resultado e estoque atual; gráfico diário.
- Cadastro e edição de produtos, busca, filtros e paginação.
- Alertas por estoque mínimo e arquivamento de produtos sem saldo.
- Compras com custo médio ponderado, vendas com baixa de estoque e histórico de movimentações.
- Compras e vendas com vários produtos na mesma remessa, registradas em uma única transação.
- Aba Orçamentos com os PDFs das vendas, busca por cliente ou número, numeração por ano, condições de pagamento e observações. Fontes Noto Sans incorporadas preservam acentos e símbolos; licença em `public/fonts/OFL.txt`.
- Calendário de validades: cada venda agenda o vencimento de 12 meses para o cliente; aviso 30 dias antes na Visão geral, no menu e na barra superior; mensagem pronta no WhatsApp; renovação que reinicia o ciclo.
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
- Suspensão de conta aplicada no banco: `itape_state`, `apply_command` e as políticas de leitura recusam a conta suspensa. Assinaturas e administradores ficam em esquema privado, alterados só por funções que conferem o administrador.
- Conta nova sem acesso até o administrador ativar; toda ação do administrador fica registrada em `itape_private.admin_events`.
- Limite de tentativas de login: 8 senhas erradas por e-mail e 40 por IP a cada 15 minutos, barradas antes de chegar ao Supabase. O limite por IP usa o `X-Forwarded-For` da hospedagem; sem proxy na frente, vale só o limite por e-mail. Os contadores ficam na memória do servidor (um processo).
- Corpo das requisições lido com limite de tamanho, mesmo sem `Content-Length`.
- Content-Security-Policy com nonce por requisição: só roda script com o nonce da página, sem `unsafe-inline` nem `eval` em produção. Por isso todas as páginas são geradas por requisição. Estilos inline seguem permitidos.
- `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` e, com `APP_ORIGIN` em HTTPS, `Strict-Transport-Security`.

### O que só pode ser feito no painel do Supabase

- **Cadastros:** nas configurações de Authentication, desative novos cadastros (sign-ups).
- **Senhas:** também em Authentication, exija senha mínima de 10 caracteres e ligue a proteção contra senhas vazadas, se o seu plano oferecer.
- **Limites de acesso (rate limits) do Auth:** o login passa pelo servidor do site, então o Supabase vê todos os visitantes com o mesmo IP. Confira se o limite de entradas comporta o seu número de clientes.
- **Backups:** confirme os backups do seu plano; dados de clientes pagantes pedem backup diário.
- **Security Advisor:** rode depois de cada `upgrade.sql`.
- Ative verificação em duas etapas na sua conta do Supabase, do GitHub e do e-mail de administrador: são as chaves de tudo.
- Dependências fixadas com arquivo de lock. Nenhuma chave administrativa é usada no app.

O salvamento depende da conexão com o Supabase. A interface responde imediatamente e confirma somente após o retorno do banco. Se houver falha, mantém os campos e permite repetir a mesma solicitação sem duplicar o lançamento. Não há modo offline com sincronização posterior.

## Banco e testes

`database/schema.sql` documenta a instalação em um banco novo. **Não execute novamente no projeto já configurado**: os objetos já existem. `database/hardening-existing-trigger.sql` registra a restrição aplicada à função preexistente de RLS automático.

`database/upgrade.sql` é a atualização cumulativa do banco: remessas com vários produtos, o calendário de validades, o controle de assinaturas com o painel do administrador, a meta de vendas e o valor médio da recarga. **Execute no SQL Editor** do projeto já configurado (em um banco novo, depois do `schema.sql`). Pode ser executado mais de uma vez: cria só o que falta (a tabela `itape_validities`, com RLS de leitura pelo dono) e substitui `itape_state` e `itape_private.apply_command` pela versão atual, sem remover tabelas, políticas ou dados. Enquanto não for aplicado, o sistema segue funcionando como antes: a página **Validades** mostra o aviso de atualização, a venda não oferece o lembrete e remessas com vários produtos são recusadas com uma mensagem que indica este arquivo. `database/multi-item-batch.sql` foi incorporado a ele e hoje não faz nada.

`database/verify.sql` roda os testes de integração com uma conta sintética e desfaz tudo ao final; depois do `upgrade.sql`, deve responder com `PASS`.

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
src/app/admin/           Painel do administrador (contas e assinaturas)
src/components/          Interface, formulários e gráfico
src/lib/domain.ts        Regras compartilhadas e dados de demonstração
src/lib/insights.ts      Comparação de períodos, meta e previsão de recargas
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
=======
>>>>>>> 52a08585c2fbebd82300a71efc4a08f83c945f3e
