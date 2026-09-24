import { jsPDF } from "jspdf";
import { money, type Quotation } from "./domain";

type Fonts = { regular: string; bold: string };
let fontsPromise: Promise<Fonts> | undefined;
async function loadFonts(): Promise<Fonts> {
  async function load(name: string) {
    const response = await fetch(`/fonts/NotoSans-${name}.ttf`);
    if (!response.ok) throw new Error("Não foi possível carregar a fonte do PDF.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  fontsPromise ??= Promise.all([load("Regular"), load("Bold")])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((error) => { fontsPromise = undefined; throw error; });
  return fontsPromise;
}

export const quotationNumber = (q: Quotation) => `${String(q.number).padStart(4, "0")}/${q.date.slice(0, 4)}`;
export const quotationTotal = (q: Quotation) => q.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
export const quotationFilename = (q: Quotation) => `orcamento-${q.date.slice(0, 4)}-${String(q.number).padStart(4, "0")}.pdf`;
const display = (date: string) => date.split("-").reverse().join("/");
const clean = (text: string) => text.normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

export async function createQuotationPdf(q: Quotation, fonts?: Fonts, demo = false) {
  const embedded = fonts ?? await loadFonts();
  const doc = new jsPDF({ format: "a4", unit: "mm", putOnlyUsedFonts: true, compress: true });
  doc.addFileToVFS("NotoSans-Regular.ttf", embedded.regular);
  doc.addFileToVFS("NotoSans-Bold.ttf", embedded.bold);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
  doc.setProperties({ title: `Orçamento ${quotationNumber(q)}`, subject: `Venda para ${q.client}`, author: q.company.name });
  const left = 16, right = 194, bottom = 271;
  let y = 20;
  const font = (size: number, bold = false) => {
    doc.setFont("NotoSans", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(30, 34, 38);
  };
  const newPage = () => {
    doc.addPage();
    y = 20;
    font(10, true);
    doc.text(`ITAPÊ EXTINTORES · Orçamento ${quotationNumber(q)}`, left, y);
    y += 12;
  };
  const ensure = (height: number) => { if (y + height > bottom) newPage(); };
  function paragraph(text: string, size = 10, bold = false) {
    font(size, bold);
    const lines: string[] = doc.splitTextToSize(clean(text), right - left);
    for (const line of lines) {
      ensure(6);
      font(size, bold);
      doc.text(line, left, y);
      y += 5.5;
    }
  }
  doc.setFillColor(221, 53, 25);
  doc.rect(left, y - 6, 3, 16, "F");
  font(20, true);
  doc.text("ITAPÊ EXTINTORES", left + 8, y + 2);
  font(9);
  doc.text("ORÇAMENTO / VENDA", right, y, { align: "right" });
  doc.text(quotationNumber(q), right, y + 6, { align: "right" });
  y += 20;
  paragraph(`${q.company.name} ${q.company.suffix}`, 10, true);
  paragraph(`CNPJ: ${q.company.cnpj}`, 9);
  paragraph(`${q.company.address} · ${q.company.city}`, 9);
  paragraph(`${q.company.email} · Contato: ${q.company.contact}`, 9);
  y += 6;
  paragraph(`Data da venda: ${display(q.date)}`, 10, true);
  paragraph(`Cliente: ${q.client}`);
  if (q.phone) paragraph(`Telefone: ${q.phone}`);
  if (demo) paragraph("DEMONSTRAÇÃO · DADOS FICTÍCIOS", 9, true);
  y += 8;

  function tableHeading() {
    ensure(14);
    doc.setFillColor(30, 34, 38);
    doc.rect(left, y - 5, right - left, 10, "F");
    font(9, true);
    doc.setTextColor(255, 255, 255);
    doc.text("Produto", left + 3, y + 1);
    doc.text("Qtd.", 116, y + 1, { align: "right" });
    doc.text("Valor unitário", 153, y + 1, { align: "right" });
    doc.text("Subtotal", right - 3, y + 1, { align: "right" });
    y += 12;
  }
  tableHeading();
  for (const [index, item] of q.items.entries()) {
    font(9);
    const lines: string[] = doc.splitTextToSize(clean(`${index + 1}. ${item.name}`), 82);
    const height = Math.max(12, lines.length * 5 + 6);
    if (y + height > bottom) { newPage(); tableHeading(); }
    font(9);
    doc.text(lines, left + 3, y, { lineHeightFactor: 1.55 });
    doc.text(String(item.quantity), 116, y, { align: "right" });
    doc.text(money(item.unitPrice), 153, y, { align: "right" });
    doc.text(money(item.quantity * item.unitPrice), right - 3, y, { align: "right" });
    y += height;
    doc.setDrawColor(222, 222, 222);
    doc.line(left, y - 5, right, y - 5);
  }
  ensure(25);
  y += 4;
  font(13, true);
  doc.text("TOTAL DA VENDA", left, y);
  doc.text(money(quotationTotal(q)), right - 3, y, { align: "right" });
  y += 15;
  ensure(18);
  paragraph("Condições de pagamento", 10, true);
  paragraph(q.paymentTerms);
  if (q.notes) {
    y += 7;
    ensure(18);
    paragraph("Observações", 10, true);
    paragraph(q.notes);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(222, 222, 222);
    doc.line(left, 280, right, 280);
    font(8);
    doc.text(`Orçamento ${quotationNumber(q)} · Venda registrada em ${display(q.date)}`, left, 286);
    doc.text(`${page} / ${pages}`, right, 286, { align: "right" });
  }
  return doc;
}

export async function downloadQuotationPdf(q: Quotation, demo = false) {
  const doc = await createQuotationPdf(q, undefined, demo);
  await doc.save(quotationFilename(q), { returnPromise: true });
}
