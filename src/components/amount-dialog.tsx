"use client";
import { useRef, useState, type FormEvent } from "react";
import { Info } from "lucide-react";
import type { Command } from "@/lib/domain";
import { Modal } from "./primitives";

// Janela de um valor em reais só: meta de vendas e valor médio da recarga.
// Repetir o mesmo pedido depois de uma falha reaproveita o identificador, e o
// banco não aplica duas vezes.
export default function AmountDialog({
  title,
  subtitle,
  label,
  hint,
  initial,
  saving,
  command,
  onSave,
  close,
  removeLabel,
}: {
  title: string;
  subtitle: string;
  label: string;
  hint: string;
  initial: number;
  saving: boolean;
  command: (amount: number) => Command;
  onSave: (command: Command, requestId: string) => Promise<void>;
  close: () => void;
  // Quando há valor salvo: grava 0 para encerrar.
  removeLabel?: string;
}) {
  const [error, setError] = useState("");
  const pending = useRef<{ payload: string; id: string } | null>(null);
  async function submit(amount: number) {
    if (saving) return;
    setError("");
    if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
      setError("Informe um valor entre R$ 0,00 e R$ 1.000.000,00.");
      return;
    }
    const next = command(amount);
    const payload = JSON.stringify(next);
    if (pending.current?.payload !== payload)
      pending.current = { payload, id: crypto.randomUUID() };
    try {
      await onSave(next, pending.current.id);
      pending.current = null;
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }
  return (
    <Modal title={title} subtitle={subtitle} close={close} busy={saving}>
      <form
        className="admin-dialog"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("amount");
          submit(Math.round(Number(String(value ?? "")) * 100));
        }}
      >
        <fieldset disabled={saving}>
          <label>
            {label}
            <input
              name="amount"
              type="number"
              defaultValue={initial ? (initial / 100).toFixed(2) : ""}
              min="0"
              max="1000000"
              step="0.01"
              required
              autoFocus
            />
          </label>
          <p className="hint">
            <Info size={16} />
            <span>{hint}</span>
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            {removeLabel && initial > 0 && (
              <button type="button" className="text-button push-left" onClick={() => submit(0)}>
                {removeLabel}
              </button>
            )}
            <button type="button" onClick={close}>
              Cancelar
            </button>
            <button className="primary" type="submit">
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
