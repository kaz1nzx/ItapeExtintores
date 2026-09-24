"use client";

import { useRef, useState } from "react";
import { Bell, Check, Plus, TriangleAlert } from "lucide-react";
import { daysBetween, reminderNeedsAttention, type Command, type Reminder } from "@/lib/domain";

const display = (date: string) => date.split("-").reverse().join("/");

export function reminderLabel(date: string, now: string) {
  const days = daysBetween(now, date);
  if (days < 0) return `Atrasado há ${-days} ${days === -1 ? "dia" : "dias"}`;
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return `Em ${days} dias`;
}

export default function RemindersPanel({ reminders, day, now, busy, ready, onSave, onSelect }: {
  reminders: Reminder[];
  day: string | null;
  now: string;
  busy: boolean;
  ready: boolean;
  onSave: (command: Command, requestId: string) => Promise<void>;
  onSelect: (date: string) => void;
}) {
  const [error, setError] = useState("");
  const completionRequests = useRef(new Map<string, string>());
  const pending = reminders.filter((r) => r.status === "pending").sort((a, b) => a.date.localeCompare(b.date));
  const list = pending.filter((r) => !day || r.date === day);
  const alerts = pending.filter((r) => reminderNeedsAttention(r, now));

  async function complete(reminder: Reminder) {
    setError("");
    try {
      const requestId = completionRequests.current.get(reminder.id) ?? crypto.randomUUID();
      completionRequests.current.set(reminder.id, requestId);
      await onSave({ kind: "reminder_complete", reminderId: reminder.id }, requestId);
      completionRequests.current.delete(reminder.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir o lembrete.");
    }
  }

  return (
    <section className="panel reminders-panel" aria-labelledby="reminders-heading">
      <div className="panel-heading">
        <div>
          <h2 id="reminders-heading"><Bell size={18} /> {day ? `Lembretes em ${display(day)}` : "Seus lembretes"}</h2>
          <p>{day ? "Anote o que precisa fazer nesta data." : "Clique em um dia do calendário para adicionar um lembrete."}</p>
        </div>
        {alerts.length > 0 && <span className="count-badge" title="Lembretes que precisam de atenção">{alerts.length}</span>}
      </div>
      {!ready ? (
        <p className="reminder-help">Atualize o banco com database/upgrade.sql para salvar lembretes.</p>
      ) : day ? (
        <ReminderForm key={day} date={day} busy={busy} onSave={onSave} />
      ) : null}
      {error && <p className="reminder-error" role="alert">{error}</p>}
      {list.length ? (
        <ul className="reminder-list">
          {list.map((r) => (
            <li key={r.id}>
              <div className="reminder-detail">
                <strong>{r.title}</strong>
                {r.notes && <p>{r.notes}</p>}
                <button className="text-button" onClick={() => onSelect(r.date)}>{display(r.date)}</button>
                <span className={reminderNeedsAttention(r, now) ? "reminder-alert" : "reminder-date"}>
                  {reminderNeedsAttention(r, now) && <TriangleAlert size={14} />}
                  {reminderLabel(r.date, now)}
                </span>
              </div>
              <button disabled={busy} onClick={() => complete(r)} aria-label={`Concluir lembrete: ${r.title}`}><Check size={15} /> Concluir</button>
            </li>
          ))}
        </ul>
      ) : <p className="reminder-help">{day ? "Nenhum lembrete pendente nesta data." : "Nenhum lembrete pendente."}</p>}
      <p className="reminder-help">O aviso aparece no site quando faltarem menos de 30 dias e permanece até você concluir o lembrete.</p>
    </section>
  );
}

function ReminderForm({ date, busy, onSave }: {
  date: string;
  busy: boolean;
  onSave: (command: Command, requestId: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const locked = useRef(false);
  return (
    <form className="reminder-form" onSubmit={async (event) => {
      event.preventDefault();
      if (locked.current || busy) return;
      if (!title.trim()) { setError("Escreva o lembrete antes de salvar."); return; }
      const command: Command = { kind: "reminder", title: title.trim(), notes: notes.trim(), date };
      const payload = JSON.stringify(command);
      if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
      locked.current = true;
      setSubmitting(true);
      setError("");
      try {
        await onSave(command, request.current.id);
        setTitle("");
        setNotes("");
        request.current = null;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível salvar o lembrete.");
      } finally {
        locked.current = false;
        setSubmitting(false);
      }
    }}>
      <label htmlFor="reminder-title">Lembrete</label>
      <input id="reminder-title" autoFocus required maxLength={120} placeholder="Ex.: Orçamento para cliente X" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy || submitting} />
      <label htmlFor="reminder-notes">Observações (opcional)</label>
      <textarea id="reminder-notes" rows={2} maxLength={1000} placeholder="Detalhes para lembrar depois…" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy || submitting} />
      {error && <p className="reminder-error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy || submitting}><Plus size={16} /> {submitting ? "Salvando…" : "Salvar lembrete"}</button>
    </form>
  );
}
