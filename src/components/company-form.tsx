"use client";
import { useRef, useState, type FormEvent } from "react";
import { companySchema, QUOTATION_COMPANY, type Company, type Command } from "@/lib/domain";

export default function CompanyForm({ company, saving, onSave }: {
  company: Company | null;
  saving: boolean;
  onSave: (command: Command, requestId: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const pending = useRef<{ payload: string; id: string } | null>(null);
  const fields = company ?? QUOTATION_COMPANY;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    const data = new FormData(event.currentTarget);
    const parsed = companySchema.safeParse(Object.fromEntries(data));
    if (!parsed.success) {
      setError("Confira o nome da empresa, o e-mail e os demais campos.");
      return;
    }
    const command = { kind: "company" as const, company: parsed.data };
    const payload = JSON.stringify(command);
    if (pending.current?.payload !== payload) pending.current = { payload, id: crypto.randomUUID() };
    try {
      await onSave(command, pending.current.id);
      pending.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a empresa.");
    }
  }
  return (
    <form className="company-form settings-body" onSubmit={submit}>
      <p>Esses dados identificam sua empresa no painel e nos novos orçamentos. Documentos já emitidos mantêm as informações da emissão.</p>
      <fieldset disabled={saving}>
        <div className="form-grid">
          <label>Nome da empresa<input name="name" defaultValue={fields.name} required maxLength={120} autoComplete="organization" /></label>
          <label>Complemento da razão social<input name="suffix" defaultValue={fields.suffix} maxLength={40} placeholder="Ex.: Ltda" /></label>
          <label>CNPJ<input name="cnpj" defaultValue={fields.cnpj} maxLength={30} /></label>
          <label>Responsável / contato<input name="contact" defaultValue={fields.contact} maxLength={120} autoComplete="name" /></label>
          <label>Endereço<input name="address" defaultValue={fields.address} maxLength={240} autoComplete="street-address" /></label>
          <label>Cidade / UF / CEP<input name="city" defaultValue={fields.city} maxLength={120} /></label>
          <label>E-mail da empresa<input name="email" type="email" defaultValue={fields.email} maxLength={254} autoComplete="email" /></label>
          <label>Telefone<input name="phone" type="tel" defaultValue={fields.phone} maxLength={30} autoComplete="tel" /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary" type="submit">{saving ? "Salvando…" : "Salvar dados da empresa"}</button>
      </fieldset>
    </form>
  );
}
