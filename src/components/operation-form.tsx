"use client";
import { useState, useRef, type FormEvent } from "react";
import { Info, ArrowRight } from "lucide-react";
import { type Command, type Product, money, today } from "@/lib/domain";
import { Modal } from "./primitives";
export type FormMode = "product" | "sale" | "purchase" | "expense" | "archive";
const titles: Record<FormMode, string> = {
  product: "Cadastrar produto",
  sale: "Registrar venda",
  purchase: "Entrada de estoque",
  expense: "Registrar despesa",
  archive: "Arquivar produto",
};
export default function OperationForm({
  mode,
  product,
  products,
  save,
  close,
}: {
  mode: FormMode;
  product?: Product;
  products: Product[];
  save: (cmd: Command, requestId: string) => Promise<void>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(
    product?.id ?? products[0]?.id ?? "",
  );
  const p = products.find((p) => p.id === selected);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(
    (mode === "purchase" ? (p?.cost ?? 0) : (p?.price ?? 0)) / 100,
  );
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const lock = useRef(false);
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
    else
      cmd = {
        kind: mode,
        productId: selected,
        quantity: qty,
        unitPrice: Math.round(price * 100),
        date: str("date"),
        party: str("party"),
      };
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
  return (
    <Modal
      title={product && mode === "product" ? "Editar produto" : titles[mode]}
      subtitle={
        mode === "sale"
          ? "A venda e a baixa de estoque são registradas juntas."
          : mode === "purchase"
            ? "Registre o custo de compra para atualizar o estoque."
            : undefined
      }
      close={close}
      busy={busy}
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
              <label>
                Produto
                <select
                  autoFocus
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    const np = products.find((p) => p.id === e.target.value);
                    setPrice(
                      (mode === "purchase"
                        ? (np?.cost ?? 0)
                        : (np?.price ?? 0)) / 100,
                    );
                  }}
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
              <div className="form-grid">
                <label>
                  Quantidade
                  <input
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                    min="1"
                    max={mode === "sale" ? (p?.stock ?? 0) : 100000}
                    step="1"
                    required
                  />
                </label>
                <label>
                  {mode === "sale"
                    ? "Preço unitário (R$)"
                    : "Custo unitário (R$)"}
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    min="0"
                    max="1000000"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Data
                  <input
                    name="date"
                    type="date"
                    defaultValue={today()}
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
              </div>
              <div className="form-total">
                <span>Total da {mode === "sale" ? "venda" : "compra"}</span>
                <strong>{money(Math.round(price * 100) * qty)}</strong>
              </div>
              {mode === "sale" && p && (
                <div className="hint">
                  <Info size={16} />
                  <span>
                    Após a venda: {Math.max(0, p.stock - qty)} unidades. Imposto
                    estimado:{" "}
                    {money(Math.round((price * 100 * qty * p.tax) / 100))}.
                  </span>
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
              disabled={
                busy || ((mode === "sale" || mode === "purchase") && !p)
              }
            >
              {busy
                ? "Salvando…"
                : mode === "archive"
                  ? "Arquivar produto"
                  : "Salvar registro"}
              {!busy && <ArrowRight size={16} />}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
