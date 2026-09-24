"use client";
import { useState, useRef, type FormEvent } from "react";
import { Info, ArrowRight, Plus, Trash2 } from "lucide-react";
import {
  ALERT_DAYS,
  VALIDITY_MONTHS,
  DEFAULT_PAYMENT_TERMS,
  addMonths,
  money,
  today,
  type Command,
  type Product,
  type Validity,
} from "@/lib/domain";
import { Modal } from "./primitives";
export type FormMode =
  | "product"
  | "sale"
  | "purchase"
  | "expense"
  | "archive"
  | "validity"
  | "renew"
  | "dismiss";
const titles: Record<FormMode, string> = {
  product: "Cadastrar produto",
  sale: "Registrar venda",
  purchase: "Entrada de estoque",
  expense: "Registrar despesa",
  archive: "Arquivar produto",
  validity: "Registrar validade",
  renew: "Renovar validade",
  dismiss: "Dispensar lembrete",
};
const display = (date: string) => date.split("-").reverse().join("/");
// O campo de data fica vazio por um instante enquanto a pessoa digita.
const dueFrom = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? display(addMonths(date, VALIDITY_MONTHS))
    : "—";
const phoneField = (
  <input
    name="phone"
    type="tel"
    inputMode="tel"
    autoComplete="off"
    placeholder="(11) 99999-9999"
    maxLength={30}
    pattern="[0-9+(). \-]*"
    title="Use números, espaços, parênteses, ponto, + e -"
  />
);
// Uma linha da remessa. O valor unitário fica em reais enquanto está no campo;
// só vira centavos no envio.
type Line = { key: string; productId: string; quantity: number; price: number };
export default function OperationForm({
  mode,
  product,
  validity,
  products,
  save,
  close,
  schedules = true,
}: {
  mode: FormMode;
  product?: Product;
  validity?: Validity;
  products: Product[];
  save: (cmd: Command, requestId: string) => Promise<void>;
  close: () => void;
  // Falso enquanto o banco não tem database/upgrade.sql: a venda não oferece
  // um lembrete que não seria gravado.
  schedules?: boolean;
}) {
  const tracking = mode === "sale" && schedules;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Controlado para mostrar, ao vivo, quando a validade vai vencer.
  const [date, setDate] = useState(today());
  const unitFor = (p?: Product) =>
    (mode === "purchase" ? (p?.cost ?? 0) : (p?.price ?? 0)) / 100;
  const makeLine = (p?: Product): Line => ({
    key: crypto.randomUUID(),
    productId: p?.id ?? "",
    quantity: 1,
    price: unitFor(p),
  });
  const [lines, setLines] = useState<Line[]>(() => [
    makeLine(product ?? products[0]),
  ]);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const lock = useRef(false);

  const patch = (key: string, next: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  const pickProduct = (key: string, productId: string) =>
    patch(key, {
      productId,
      price: unitFor(products.find((p) => p.id === productId)),
    });
  // O produto sugerido é escolhido dentro do atualizador: dois cliques
  // seguidos enxergam as linhas já adicionadas, em vez de repetir o mesmo item.
  const addLine = () =>
    setLines((ls) => {
      if (ls.length >= 20) return ls;
      const used = new Set(ls.map((l) => l.productId));
      const next = products.find((p) => !used.has(p.id)) ?? products[0];
      return next ? [...ls, makeLine(next)] : ls;
    });
  const dropLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  const total = lines.reduce(
    (a, l) => a + Math.round(l.price * 100) * l.quantity,
    0,
  );
  // O mesmo produto pode repetir em duas linhas, então o estoque é conferido
  // pelo total pedido, não linha a linha.
  const requested = new Map<string, number>();
  for (const l of lines)
    requested.set(l.productId, (requested.get(l.productId) ?? 0) + l.quantity);
  const short =
    mode === "sale"
      ? [...requested.entries()]
          .map(([id, q]) => ({ p: products.find((x) => x.id === id), q }))
          .find(({ p, q }) => p && q > p.stock)
      : undefined;
  const estimatedTax = lines.reduce((a, l) => {
    const p = products.find((x) => x.id === l.productId);
    return (
      a + Math.round((Math.round(l.price * 100) * l.quantity * (p?.tax ?? 0)) / 100)
    );
  }, 0);
  const incomplete = lines.some((l) => !l.productId);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const str = (n: string) => String(f.get(n) ?? "").trim();
    const num = (n: string) => Number(str(n));
    const cents = (n: string) => Math.round(num(n) * 100);
    let cmd: Command;
    if (mode === "product")
      cmd = {
        kind: "product",
        ...(product ? { id: product.id } : {}),
        name: str("name"),
        sku: str("sku"),
        type: str("type"),
        capacity: str("capacity"),
        cost: product && product.stock > 0 ? product.cost : cents("cost"),
        price: cents("price"),
        tax: num("tax"),
        minimum: num("minimum"),
      };
    else if (mode === "expense")
      cmd = {
        kind: "expense",
        description: str("description"),
        amount: cents("amount"),
        date: str("date"),
      };
    else if (mode === "archive")
      cmd = { kind: "archive", productId: product!.id };
    else if (mode === "validity")
      cmd = {
        kind: "validity",
        client: str("client"),
        ...(str("phone") ? { phone: str("phone") } : {}),
        item: str("item"),
        quantity: num("quantity"),
        startDate: str("startDate"),
      };
    else if (mode === "renew")
      cmd = {
        kind: "validity_renew",
        validityId: validity!.id,
        date: str("date"),
      };
    else if (mode === "dismiss")
      cmd = { kind: "validity_dismiss", validityId: validity!.id };
    else {
      // Só vendas agendam validade; na compra estes campos nem existem.
      const contact =
        mode === "sale"
          ? {
              ...(str("phone") ? { phone: str("phone") } : {}),
              track: tracking && f.get("track") === "on",
              quotation: { paymentTerms: str("paymentTerms"), notes: str("quotationNotes") },
            }
          : {};
      const items = lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: Math.round(l.price * 100),
      }));
      // Item único continua usando o comando simples, que já existe no banco.
      // O lote só entra quando há mais de um produto na mesma remessa.
      cmd =
        items.length === 1
          ? {
              kind: mode,
              ...items[0],
              date: str("date"),
              party: str("party"),
              ...contact,
            }
          : {
              kind: "batch",
              operation: mode,
              items,
              date: str("date"),
              party: str("party"),
              ...contact,
            };
    }
    const payload = JSON.stringify(cmd);
    if (retry.current?.payload !== payload)
      retry.current = { payload, id: crypto.randomUUID() };
    try {
      await save(cmd, retry.current.id);
      close();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Falha na conexão. Seus campos foram mantidos. Tente novamente.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const operation = mode === "sale" || mode === "purchase";
  return (
    <Modal
      title={product && mode === "product" ? "Editar produto" : titles[mode]}
      subtitle={
        mode === "sale"
          ? "Adicione quantos produtos quiser: a venda e a baixa de estoque são registradas juntas."
          : mode === "purchase"
            ? "Adicione quantos produtos vieram na mesma remessa. Data e fornecedor valem para todos."
            : undefined
      }
      close={close}
      busy={busy}
      wide={operation}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {mode === "product" ? (
            <>
              <label>
                Nome do produto
                <input
                  name="name"
                  defaultValue={product?.name}
                  placeholder="Ex.: Extintor Pó ABC"
                  required
                  maxLength={120}
                  autoFocus
                />
              </label>
              <div className="form-grid">
                <label>
                  Código / SKU
                  <input
                    name="sku"
                    defaultValue={product?.sku}
                    placeholder="EXT-006"
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Capacidade
                  <input
                    name="capacity"
                    defaultValue={product?.capacity}
                    placeholder="4 kg"
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Tipo
                  <select name="type" defaultValue={product?.type ?? "Pó ABC"}>
                    {["Pó ABC", "Pó BC", "CO₂", "Água", "Espuma", "Outro"].map(
                      (t) => (
                        <option key={t}>{t}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Estoque mínimo
                  <input
                    name="minimum"
                    type="number"
                    defaultValue={product?.minimum ?? 5}
                    min="0"
                    max="100000"
                    step="1"
                    required
                  />
                </label>
                <label>
                  Custo unitário (R$)
                  <input
                    name="cost"
                    type="number"
                    defaultValue={(product?.cost ?? 0) / 100}
                    min="0"
                    max="1000000"
                    step="0.01"
                    required
                    readOnly={!!product && product.stock > 0}
                  />
                </label>
                <label>
                  Preço de venda (R$)
                  <input
                    name="price"
                    type="number"
                    defaultValue={(product?.price ?? 0) / 100}
                    min="0"
                    max="1000000"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Imposto sobre venda (%)
                  <input
                    name="tax"
                    type="number"
                    defaultValue={product?.tax ?? 0}
                    min="0"
                    max="100"
                    step="0.01"
                    required
                  />
                </label>
              </div>
              <div className="hint">
                <Info size={16} />
                <span>
                  {product?.stock
                    ? "O custo médio é atualizado automaticamente a cada compra."
                    : "O produto começa sem estoque. Depois, registre uma entrada para adicionar unidades."}{" "}
                  Informe a alíquota aplicável à sua operação.
                </span>
              </div>
            </>
          ) : mode === "archive" ? (
            <p>
              Arquivar{" "}
              <strong>
                {product?.name} · {product?.capacity}
              </strong>
              ? O histórico de vendas será preservado. O produto deixará de
              aparecer no estoque ativo.
            </p>
          ) : mode === "validity" ? (
            <>
              <label>
                Cliente
                <input
                  name="client"
                  required
                  maxLength={120}
                  autoFocus
                  placeholder="Nome do cliente"
                />
              </label>
              <div className="form-grid">
                <label>
                  WhatsApp <span className="optional">(opcional)</span>
                  {phoneField}
                </label>
                <label>
                  Quantidade
                  <input
                    name="quantity"
                    type="number"
                    defaultValue={1}
                    min="1"
                    max="100000"
                    step="1"
                    required
                  />
                </label>
              </div>
              <label>
                Extintor
                <input
                  name="item"
                  list="validity-items"
                  required
                  maxLength={120}
                  placeholder="Ex.: Extintor Pó ABC · 4 kg"
                />
                <datalist id="validity-items">
                  {products.map((p) => (
                    <option key={p.id} value={`${p.name} · ${p.capacity}`} />
                  ))}
                </datalist>
              </label>
              <label>
                Data da venda ou da recarga
                <input
                  name="startDate"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min="2000-01-01"
                  max={today()}
                  required
                />
              </label>
              <div className="form-total">
                <span>Vencimento em {VALIDITY_MONTHS} meses</span>
                <strong>{dueFrom(date)}</strong>
              </div>
              <div className="hint">
                <Info size={16} />
                <span>
                  Para recargas e extintores vendidos fora do sistema. Vendas
                  registradas aqui já agendam a validade sozinhas.
                </span>
              </div>
            </>
          ) : mode === "renew" && validity ? (
            <>
              <p className="lead">
                Recarga dos extintores de <strong>{validity.client}</strong> —{" "}
                {validity.quantity}× {validity.item}. O lembrete atual é
                encerrado e um novo ciclo de {VALIDITY_MONTHS} meses começa na
                data da recarga.
              </p>
              <label>
                Data da recarga
                <input
                  name="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={validity.startDate}
                  max={today()}
                  required
                  autoFocus
                />
              </label>
              <div className="form-total">
                <span>Próximo vencimento</span>
                <strong>{dueFrom(date)}</strong>
              </div>
              <div className="hint">
                <Info size={16} />
                <span>
                  Se também lançar a recarga como venda, desmarque “Agendar
                  lembrete” na venda para o aviso não sair em dobro.
                </span>
              </div>
            </>
          ) : mode === "dismiss" && validity ? (
            <p className="lead">
              Dispensar o lembrete de <strong>{validity.client}</strong> (
              {validity.quantity}× {validity.item}, vencimento{" "}
              {display(validity.dueDate)})? Ele sai do calendário e dos avisos.
              Use quando o cliente não vai renovar com você.
            </p>
          ) : mode === "expense" ? (
            <>
              <label>
                Descrição
                <input
                  name="description"
                  autoFocus
                  required
                  maxLength={120}
                  placeholder="Ex.: Transporte e entregas"
                />
              </label>
              <div className="form-grid">
                <label>
                  Valor (R$)
                  <input
                    type="number"
                    name="amount"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Data
                  <input
                    type="date"
                    name="date"
                    defaultValue={today()}
                    min="2000-01-01"
                    max={today()}
                    required
                  />
                </label>
              </div>
              <div className="hint">
                <Info size={16} />
                Compras de extintores devem ser registradas em Entrada de
                estoque, para evitar despesas duplicadas.
              </div>
            </>
          ) : (
            <>
              <div className="line-table">
                <div className="line-head" aria-hidden="true">
                  <span>Item</span>
                  <span>Produto</span>
                  <span>Qtd.</span>
                  <span>
                    {mode === "sale" ? "Preço un. (R$)" : "Custo un. (R$)"}
                  </span>
                  <span>Subtotal</span>
                  <span />
                </div>
                {lines.map((l, i) => {
                  const lp = products.find((p) => p.id === l.productId);
                  return (
                    <div className="line-row" key={l.key}>
                      <span className="line-index">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <label>
                        <span className="sr-only">Produto do item {i + 1}</span>
                        <select
                          autoFocus={i === 0}
                          value={l.productId}
                          onChange={(e) => pickProduct(l.key, e.target.value)}
                          required
                        >
                          <option value="" disabled>
                            Selecione um produto
                          </option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.capacity} ({p.stock} disponíveis)
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="sr-only">
                          Quantidade do item {i + 1}
                        </span>
                        <input
                          type="number"
                          value={l.quantity}
                          onChange={(e) =>
                            patch(l.key, { quantity: Number(e.target.value) })
                          }
                          min="1"
                          max={mode === "sale" ? (lp?.stock ?? 1) : 100000}
                          step="1"
                          required
                        />
                      </label>
                      <label>
                        <span className="sr-only">
                          Valor unitário do item {i + 1}
                        </span>
                        <input
                          type="number"
                          value={l.price}
                          onChange={(e) =>
                            patch(l.key, { price: Number(e.target.value) })
                          }
                          min="0"
                          max="1000000"
                          step="0.01"
                          required
                        />
                      </label>
                      <span className="line-subtotal">
                        {money(Math.round(l.price * 100) * l.quantity)}
                      </span>
                      <button
                        type="button"
                        className="icon-button line-remove"
                        onClick={() => dropLine(l.key)}
                        disabled={lines.length === 1}
                        aria-label={`Remover item ${i + 1}`}
                        title="Remover item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className="line-add"
                onClick={addLine}
                disabled={lines.length >= 20 || lines.length >= products.length}
              >
                <Plus size={15} />
                Adicionar novo item
              </button>
              <div className={`form-grid ${mode === "sale" ? "three" : ""}`}>
                <label>
                  Data
                  <input
                    name="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min="2000-01-01"
                    max={today()}
                    required
                  />
                </label>
                <label>
                  {mode === "sale" ? "Cliente" : "Fornecedor"}
                  <input
                    name="party"
                    placeholder={
                      mode === "sale" ? "Nome do cliente" : "Nome do fornecedor"
                    }
                    required
                    maxLength={120}
                  />
                </label>
                {mode === "sale" && (
                  <label>
                    WhatsApp <span className="optional">(opcional)</span>
                    {phoneField}
                  </label>
                )}
              </div>
              {mode === "sale" && (
                <>
                  <label>
                    Condições de pagamento
                    <input name="paymentTerms" required maxLength={240} defaultValue={DEFAULT_PAYMENT_TERMS} />
                  </label>
                  <label>
                    Observações do orçamento <span className="optional">(opcional)</span>
                    <textarea name="quotationNotes" rows={2} maxLength={1000} placeholder="Ex.: Prazo de entrega e detalhes combinados com o cliente" />
                  </label>
                  <div className="hint"><Info size={16} /> Ao confirmar a venda, o orçamento será baixado em PDF.</div>
                </>
              )}
              {tracking && (
                <label className="check">
                  <input type="checkbox" name="track" defaultChecked />
                  <span>
                    <strong>Agendar lembrete de validade</strong>
                    Os extintores desta venda vencem em {dueFrom(date)}. O
                    cliente aparece no calendário {ALERT_DAYS} dias antes.
                  </span>
                </label>
              )}
              <div className="form-total">
                <span>
                  Total da {mode === "sale" ? "venda" : "compra"} ·{" "}
                  {lines.reduce((a, l) => a + l.quantity, 0)} un. em{" "}
                  {lines.length} {lines.length === 1 ? "item" : "itens"}
                </span>
                <strong>{money(total)}</strong>
              </div>
              {short?.p && (
                <div className="form-error" role="alert">
                  Estoque insuficiente de {short.p.name}: {short.q} unidades
                  pedidas, {short.p.stock} disponíveis.
                </div>
              )}
              {mode === "sale" && !short && (
                <div className="hint">
                  <Info size={16} />
                  <span>Imposto estimado sobre a venda: {money(estimatedTax)}.</span>
                </div>
              )}
            </>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="form-actions">
            <button type="button" onClick={close}>
              Cancelar
            </button>
            <button
              className="primary"
              type="submit"
              disabled={busy || (operation && (incomplete || !!short))}
            >
              {busy
                ? "Salvando…"
                : mode === "archive"
                  ? "Arquivar produto"
                  : mode === "renew"
                    ? "Registrar renovação"
                    : mode === "dismiss"
                      ? "Dispensar lembrete"
                      : mode === "sale"
                        ? "Salvar venda e gerar PDF"
                        : "Salvar registro"}
              {!busy && <ArrowRight size={16} />}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
