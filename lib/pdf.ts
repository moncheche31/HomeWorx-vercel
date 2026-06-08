"use client";

import { Estimate } from "@/types";
import { TRADE_LABELS } from "./pricing";
import { groupLineItems } from "./grouping";

export async function generatePdf(estimate: Estimate): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const lang = estimate.language;
  const W = 215.9;

  // HomeWorx 360 Brand Colors
  const NAVY   = [11, 60, 93]    as [number, number, number]; // #0B3C5D Corporate Navy
  const GREEN  = [65, 173, 73]   as [number, number, number]; // #41AD49 Accent Green
  const GRAY   = [100, 116, 139] as [number, number, number]; // Slate-500
  const LIGHT  = [248, 250, 252] as [number, number, number]; // Slate-50
  const BLACK  = [15, 23, 42]    as [number, number, number]; // Slate-950
  const WHITE  = [255, 255, 255] as [number, number, number];

  let y = 10;

  // ── Header bar (navy gradient simulation with solid fill) ──────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 40, "F");

  // Accent green stripe at bottom of header
  doc.setFillColor(...GREEN);
  doc.rect(0, 38, W, 2, "F");

  // Logo (if contractor uploaded one)
  if (estimate.contractor.logoDataUrl) {
    try {
      doc.addImage(estimate.contractor.logoDataUrl, "JPEG", 12, 7, 24, 24);
    } catch {
      // skip bad logo
    }
  }

  const logoOffset = estimate.contractor.logoDataUrl ? 42 : 14;

  // Company name
  doc.setTextColor(...WHITE);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const companyName = estimate.contractor.company || estimate.contractor.name || "Your Company";
  doc.text(companyName, logoOffset, 16);

  // Contact line
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(196, 224, 234); // light brand blue
  const contactParts = [
    estimate.contractor.phone,
    estimate.contractor.email,
    estimate.contractor.license ? `Lic. ${estimate.contractor.license}` : "",
  ].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join("   |   "), logoOffset, 24);
  }

  const contractorAddr = [
    estimate.contractor.address,
    estimate.contractor.city,
    estimate.contractor.state,
    estimate.contractor.zip,
  ].filter(Boolean).join(", ");
  if (contractorAddr) {
    doc.text(contractorAddr, logoOffset, 31);
  }

  // "ESTIMATE" / "COTIZACIÓN" badge — accent green
  doc.setFillColor(...GREEN);
  doc.roundedRect(W - 58, 7, 46, 26, 3, 3, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "es" ? "COTIZACIÓN" : "ESTIMATE", W - 35, 18, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`#${estimate.estimateNumber}`, W - 35, 26, { align: "center" });

  y = 48;

  // ── Meta row ──────────────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT);
  doc.rect(10, y, W - 20, 20, "F");
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.2);
  doc.rect(10, y, W - 20, 20, "S");

  doc.setTextColor(...GRAY);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "es" ? "FECHA" : "DATE", 16, y + 7);
  doc.text(lang === "es" ? "VÁLIDO HASTA" : "VALID UNTIL", 65, y + 7);
  doc.text(lang === "es" ? "TIPO DE TRABAJO" : "TRADE", 130, y + 7);

  const createdDate = new Date(estimate.createdAt);
  const validDate = new Date(createdDate);
  validDate.setDate(validDate.getDate() + (estimate.validDays ?? 30));
  const fmtDate = (d: Date) =>
    d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
      year: "numeric", month: "short", day: "numeric",
    });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  doc.text(fmtDate(createdDate), 16, y + 15);
  doc.text(fmtDate(validDate), 65, y + 15);
  const tradeLabel = TRADE_LABELS[estimate.trade]?.[lang] ?? estimate.trade;
  doc.text(tradeLabel, 130, y + 15);
  y += 26;

  // ── FROM / TO ──────────────────────────────────────────────────────────────
  const col2X = W / 2 + 5;
  doc.setTextColor(...NAVY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "es" ? "PREPARADO POR:" : "PREPARED BY:", 10, y);
  doc.text(lang === "es" ? "ESTIMACIÓN PARA:" : "ESTIMATE FOR:", col2X, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BLACK);
  doc.setFontSize(10);

  const leftLines = [
    estimate.contractor.name,
    estimate.contractor.company,
  ].filter(Boolean);
  const rightLines = [
    estimate.customer.name,
    estimate.customer.phone,
    estimate.customer.address,
    [estimate.customer.city, estimate.customer.state, estimate.customer.zip].filter(Boolean).join(", "),
  ].filter(Boolean);

  const maxLines = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (leftLines[i])  doc.text(leftLines[i], 10, y + i * 6);
    if (rightLines[i]) doc.text(rightLines[i], col2X, y + i * 6);
  }
  y += maxLines * 6 + 6;

  // Job address
  if (estimate.jobAddress) {
    doc.setTextColor(...NAVY);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(lang === "es" ? "DIRECCIÓN DEL TRABAJO:" : "JOB ADDRESS:", 10, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BLACK);
    doc.setFontSize(10);
    doc.text(estimate.jobAddress, 10, y + 5);
    y += 14;
  }

  // ── Scope of Work ──────────────────────────────────────────────────────────
  const scopeText = estimate.scopeOfWork || estimate.jobDescription;
  if (scopeText) {
    doc.setFillColor(...LIGHT);
    const scopeLines = doc.splitTextToSize(scopeText, W - 24);
    const maxScopeLines = Math.min(scopeLines.length, 7);
    const scopeBlockH = maxScopeLines * 5 + 10;
    doc.roundedRect(10, y - 2, W - 20, scopeBlockH, 2, 2, "F");

    doc.setTextColor(...NAVY);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(lang === "es" ? "ALCANCE DEL TRABAJO:" : "SCOPE OF WORK:", 14, y + 4);
    y += 9;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(scopeLines.slice(0, maxScopeLines), 14, y);
    y += maxScopeLines * 5 + 4;
  }

  y += 2;

  // ── Line items table ───────────────────────────────────────────────────────
  const mode = estimate.displayMode ?? "total-only";

  const headStyles = {
    fillColor: NAVY,
    textColor: WHITE,
    fontStyle: "bold" as const,
    fontSize: 9,
  };
  const altRowStyles = { fillColor: LIGHT };
  const tableMargin = { left: 10, right: 10 };

  if (mode === "itemized") {
    autoTable(doc, {
      startY: y,
      head: [[
        lang === "es" ? "Descripción" : "Description",
        lang === "es" ? "Cant." : "Qty",
        lang === "es" ? "Unidad" : "Unit",
        lang === "es" ? "Precio Unit." : "Unit Price",
        "Total",
      ]],
      body: estimate.lineItems.map((item) => [
        item.description,
        item.quantity.toString(),
        item.unit,
        `$${item.unitPrice.toFixed(2)}`,
        `$${item.total.toFixed(2)}`,
      ]),
      theme: "striped",
      headStyles,
      bodyStyles: { fontSize: 9, textColor: BLACK },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 18, halign: "center" },
        2: { cellWidth: 22, halign: "center" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
      },
      alternateRowStyles: altRowStyles,
      margin: tableMargin,
    });
  } else if (mode === "grouped") {
    const { laborTotal, materialsTotal } = groupLineItems(estimate.lineItems);
    autoTable(doc, {
      startY: y,
      head: [[lang === "es" ? "Categoría" : "Category", "Total"]],
      body: [
        [lang === "es" ? "Mano de obra" : "Labor", `$${laborTotal.toFixed(2)}`],
        [lang === "es" ? "Materiales y suministros" : "Materials & Supplies", `$${materialsTotal.toFixed(2)}`],
      ],
      theme: "striped",
      headStyles,
      bodyStyles: { fontSize: 10, textColor: BLACK },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 40, halign: "right" },
      },
      alternateRowStyles: altRowStyles,
      margin: tableMargin,
    });
  } else {
    // total-only
    autoTable(doc, {
      startY: y,
      head: [[lang === "es" ? "Servicios" : "Services", ""]],
      body: [[
        lang === "es"
          ? "Servicios de contratista según el alcance del trabajo descrito anteriormente"
          : "Contractor services per scope of work described above",
        "",
      ]],
      theme: "striped",
      headStyles,
      bodyStyles: { fontSize: 10, textColor: BLACK },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 10 } },
      margin: tableMargin,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalsX = W - 82;
  const valX = W - 10;

  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(lang === "es" ? "Subtotal:" : "Subtotal:", totalsX, y);
  doc.text(`$${estimate.subtotal.toFixed(2)}`, valX, y, { align: "right" });
  y += 7;

  const taxPct = (estimate.taxRate * 100).toFixed(1);
  doc.text(`${lang === "es" ? "Impuesto" : "Tax"} (${taxPct}%):`, totalsX, y);
  doc.text(`$${estimate.taxAmount.toFixed(2)}`, valX, y, { align: "right" });
  y += 5;

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(totalsX, y, W - 10, y);
  y += 5;

  // TOTAL badge
  doc.setFillColor(...NAVY);
  doc.roundedRect(totalsX - 4, y - 5, W - totalsX + 4, 12, 2, 2, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "es" ? "TOTAL:" : "TOTAL:", totalsX, y + 3);
  doc.text(`$${estimate.total.toFixed(2)}`, valX, y + 3, { align: "right" });
  y += 18;

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (estimate.notes) {
    doc.setTextColor(...NAVY);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text(lang === "es" ? "NOTAS:" : "NOTES:", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BLACK);
    const noteLines = doc.splitTextToSize(estimate.notes, W - 20);
    doc.text(noteLines.slice(0, 6), 10, y);
    y += Math.min(noteLines.length, 6) * 5 + 4;
  }

  // ── Terms ──────────────────────────────────────────────────────────────────
  const terms = estimate.terms || defaultTerms(lang);
  doc.setTextColor(...NAVY);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "es" ? "TÉRMINOS Y CONDICIONES:" : "TERMS & CONDITIONS:", 10, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  const termLines = doc.splitTextToSize(terms, W - 20);
  doc.text(termLines.slice(0, 6), 10, y);
  y += Math.min(termLines.length, 6) * 4 + 8;

  // ── Signature lines ─────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.3);
  doc.line(10, y + 15, 95, y + 15);
  doc.line(115, y + 15, 200, y + 15);
  doc.setTextColor(...GRAY);
  doc.setFontSize(8);
  doc.text(lang === "es" ? "Firma del Cliente" : "Customer Signature", 10, y + 20);
  doc.text(lang === "es" ? "Fecha" : "Date", 115, y + 20);

  // ── Footer ─────────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(
      `HomeWorx 360 Estimator  •  ${lang === "es" ? "Página" : "Page"} ${i} ${lang === "es" ? "de" : "of"} ${totalPages}`,
      W / 2,
      205,
      { align: "center" },
    );
    // Bottom accent line
    doc.setFillColor(...GREEN);
    doc.rect(0, 208, W, 1.5, "F");
  }

  const safeCustomer = estimate.customer.name.replace(/\s+/g, "_") || "Customer";
  doc.save(`Estimate-${estimate.estimateNumber}-${safeCustomer}.pdf`);
}

function defaultTerms(lang: "en" | "es"): string {
  if (lang === "es") {
    return "El pago es debido dentro de 30 días de la factura. Se aplica un cargo por mora del 1.5% mensual a las facturas vencidas. Este estimado es válido por el número de días indicado. Los precios son estimados basados en las condiciones descritas. Cualquier trabajo adicional requiere una orden de cambio por escrito. El contratista no es responsable de condiciones ocultas descubiertas durante el trabajo.";
  }
  return "Payment is due within 30 days of invoice. A 1.5% monthly late fee applies to overdue invoices. This estimate is valid for the number of days shown above. Prices are estimated based on described conditions. Any additional work requires a written change order. Contractor is not liable for hidden conditions discovered during work.";
}
