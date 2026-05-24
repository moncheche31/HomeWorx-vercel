"use client";

import { Estimate } from "@/types";
import { TRADE_LABELS } from "./pricing";
import { groupLineItems } from "./grouping";
import { compressPhoto } from "./compress";

export async function generatePdf(estimate: Estimate): Promise<void> {
  // Dynamic import to avoid SSR issues
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const lang = estimate.language;
  const W = 215.9;

  // Colors
  const BLUE  = [30, 64, 175] as [number, number, number];
  const ORANGE = [249, 115, 22] as [number, number, number];
  const GRAY  = [100, 116, 139] as [number, number, number];
  const LIGHT = [241, 245, 249] as [number, number, number];
  const BLACK = [15, 23, 42] as [number, number, number];

  let y = 10;

  // Header bar
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 38, "F");

  // Logo (if any)
  if (estimate.contractor.logoDataUrl) {
    try {
      doc.addImage(estimate.contractor.logoDataUrl, "JPEG", 12, 6, 26, 26);
    } catch {
      // skip bad logo
    }
  }

  // Company name & contact
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(estimate.contractor.company || estimate.contractor.name || "Your Company", estimate.contractor.logoDataUrl ? 44 : 14, 16);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const contactParts = [
    estimate.contractor.phone,
    estimate.contractor.email,
    estimate.contractor.license ? `${lang === "es" ? "Lic." : "Lic."} ${estimate.contractor.license}` : "",
  ].filter(Boolean);
  doc.text(contactParts.join("   |   "), estimate.contractor.logoDataUrl ? 44 : 14, 24);

  const contractorAddr = [
    estimate.contractor.address,
    estimate.contractor.city,
    estimate.contractor.state,
    estimate.contractor.zip,
  ].filter(Boolean).join(", ");
  if (contractorAddr) {
    doc.text(contractorAddr, estimate.contractor.logoDataUrl ? 44 : 14, 30);
  }

  // "ESTIMATE" badge top-right
  doc.setFillColor(...ORANGE);
  doc.roundedRect(W - 58, 6, 46, 26, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "es" ? "COTIZACIÓN" : "ESTIMATE", W - 55, 17, { maxWidth: 40 });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`#${estimate.estimateNumber}`, W - 55, 25);

  y = 46;

  // Estimate meta row
  doc.setFillColor(...LIGHT);
  doc.rect(10, y, W - 20, 20, "F");
  doc.setTextColor(...GRAY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "es" ? "FECHA" : "DATE", 16, y + 7);
  doc.text(lang === "es" ? "VÁLIDO HASTA" : "VALID UNTIL", 65, y + 7);
  doc.text(lang === "es" ? "TIPO DE TRABAJO" : "TRADE", 125, y + 7);

  const createdDate = new Date(estimate.createdAt);
  const validDate = new Date(createdDate);
  validDate.setDate(validDate.getDate() + (estimate.validDays ?? 30));
  const fmtDate = (d: Date) =>
    d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { year: "numeric", month: "short", day: "numeric" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  doc.text(fmtDate(createdDate), 16, y + 15);
  doc.text(fmtDate(validDate), 65, y + 15);
  const tradeLabel = TRADE_LABELS[estimate.trade]?.[lang] ?? estimate.trade;
  doc.text(tradeLabel, 125, y + 15);
  y += 26;

  // FROM / TO
  const col2X = W / 2 + 5;
  doc.setTextColor(...BLUE);
  doc.setFontSize(9);
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
    doc.setTextColor(...BLUE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(lang === "es" ? "DIRECCIÓN DEL TRABAJO:" : "JOB ADDRESS:", 10, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BLACK);
    doc.setFontSize(10);
    doc.text(estimate.jobAddress, 10, y + 5);
    y += 13;
  }

  // Scope of work — always use the professional rewrite, never the raw transcript
  const scopeText = estimate.scopeOfWork || estimate.jobDescription;
  if (scopeText) {
    doc.setTextColor(...BLUE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(lang === "es" ? "ALCANCE DEL TRABAJO:" : "SCOPE OF WORK:", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    const descLines = doc.splitTextToSize(scopeText, W - 20);
    const maxDescLines = Math.min(descLines.length, 6);
    doc.text(descLines.slice(0, maxDescLines), 10, y);
    y += maxDescLines * 5 + 4;
  }

  // Photos — shown after scope of work, before pricing
  if (estimate.photos && estimate.photos.length > 0) {
    const photosToShow = estimate.photos.slice(0, 3);
    const gap = 4;
    const photoW = Math.floor((W - 20 - gap * (photosToShow.length - 1)) / photosToShow.length);
    const photoH = Math.floor(photoW * 0.72);
    const totalRowW = photosToShow.length * photoW + gap * (photosToShow.length - 1);
    const startX = (W - totalRowW) / 2;

    if (y + photoH + 14 > 260) { doc.addPage(); y = 20; }

    doc.setTextColor(...BLUE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(lang === "es" ? "FOTOS DEL TRABAJO:" : "JOB PHOTOS:", 10, y);
    y += 5;

    for (let i = 0; i < photosToShow.length; i++) {
      try {
        const compressed = await compressPhoto(photosToShow[i]);
        const fmt = compressed.startsWith("data:image/png") ? "PNG" : "JPEG";
        doc.addImage(compressed, fmt, startX + i * (photoW + gap), y, photoW, photoH);
      } catch {
        // skip photos that can't be embedded
      }
    }
    y += photoH + 8;
  }

  // Line items table — rendered based on displayMode
  const mode = estimate.displayMode ?? "total-only";

  if (mode === "itemized") {
    const tableHead = [[
      lang === "es" ? "Descripción" : "Description",
      lang === "es" ? "Cant." : "Qty",
      lang === "es" ? "Unidad" : "Unit",
      lang === "es" ? "Precio Unit." : "Unit Price",
      "Total",
    ]];
    const tableBody = estimate.lineItems.map((item) => [
      item.description,
      item.quantity.toString(),
      item.unit,
      `$${item.unitPrice.toFixed(2)}`,
      `$${item.total.toFixed(2)}`,
    ]);
    autoTable(doc, {
      startY: y,
      head: tableHead,
      body: tableBody,
      theme: "striped",
      headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: BLACK },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 18, halign: "center" },
        2: { cellWidth: 22, halign: "center" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 10, right: 10 },
    });
  } else if (mode === "grouped") {
    const { laborTotal, materialsTotal } = groupLineItems(estimate.lineItems);
    const tableHead = [[
      lang === "es" ? "Descripción" : "Description",
      "Total",
    ]];
    const tableBody = [
      [lang === "es" ? "Mano de obra" : "Labor", `$${laborTotal.toFixed(2)}`],
      [lang === "es" ? "Materiales y suministros" : "Materials & Supplies", `$${materialsTotal.toFixed(2)}`],
    ];
    autoTable(doc, {
      startY: y,
      head: tableHead,
      body: tableBody,
      theme: "striped",
      headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
      bodyStyles: { fontSize: 10, textColor: BLACK },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 40, halign: "right" },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 10, right: 10 },
    });
  } else {
    // total-only — no table, just a clean "Services Rendered" line
    autoTable(doc, {
      startY: y,
      head: [[lang === "es" ? "Servicios" : "Services", ""]],
      body: [[
        lang === "es" ? "Servicios de contratista según el alcance del trabajo descrito" : "Contractor services per scope of work described above",
        "",
      ]],
      theme: "striped",
      headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
      bodyStyles: { fontSize: 10, textColor: BLACK },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 10 } },
      margin: { left: 10, right: 10 },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;

  // Totals
  const totalsX = W - 80;
  const totalsLabelX = totalsX;
  const totalsValueX = W - 10;

  doc.setFontSize(9);

  // Subtotal
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(lang === "es" ? "Subtotal:" : "Subtotal:", totalsLabelX, y);
  doc.text(`$${estimate.subtotal.toFixed(2)}`, totalsValueX, y, { align: "right" });
  y += 7;

  // Tax
  const taxPct = (estimate.taxRate * 100).toFixed(1);
  doc.text(`${lang === "es" ? "Impuesto" : "Tax"} (${taxPct}%):`, totalsLabelX, y);
  doc.text(`$${estimate.taxAmount.toFixed(2)}`, totalsValueX, y, { align: "right" });
  y += 5;

  // Divider
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y, W - 10, y);
  y += 5;

  // Total
  doc.setFillColor(...BLUE);
  doc.roundedRect(totalsX - 4, y - 5, W - totalsX + 4, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "es" ? "TOTAL:" : "TOTAL:", totalsLabelX, y + 3);
  doc.text(`$${estimate.total.toFixed(2)}`, totalsValueX, y + 3, { align: "right" });
  y += 18;

  // Notes
  if (estimate.notes) {
    doc.setTextColor(...BLUE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(lang === "es" ? "NOTAS:" : "NOTES:", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BLACK);
    const noteLines = doc.splitTextToSize(estimate.notes, W - 20);
    doc.text(noteLines.slice(0, 6), 10, y);
    y += Math.min(noteLines.length, 6) * 5 + 4;
  }

  // Terms
  const terms = estimate.terms || defaultTerms(lang);
  doc.setTextColor(...BLUE);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "es" ? "TÉRMINOS Y CONDICIONES:" : "TERMS & CONDITIONS:", 10, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  const termLines = doc.splitTextToSize(terms, W - 20);
  doc.text(termLines.slice(0, 6), 10, y);
  y += Math.min(termLines.length, 6) * 4 + 8;

  // Signature area
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.3);
  doc.line(10, y + 15, 95, y + 15);
  doc.line(115, y + 15, 200, y + 15);
  doc.setTextColor(...GRAY);
  doc.setFontSize(8);
  doc.text(lang === "es" ? "Firma del Cliente" : "Customer Signature", 10, y + 20);
  doc.text(lang === "es" ? "Fecha" : "Date", 115, y + 20);

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(
      `${lang === "es" ? "Generado con HomeWorx" : "Generated with HomeWorx"} • ${lang === "es" ? "Página" : "Page"} ${i} ${lang === "es" ? "de" : "of"} ${totalPages}`,
      W / 2,
      205,
      { align: "center" }
    );
  }

  const fileName = `Estimate-${estimate.estimateNumber}-${estimate.customer.name.replace(/\s+/g, "_") || "Customer"}.pdf`;
  doc.save(fileName);
}

function defaultTerms(lang: "en" | "es"): string {
  if (lang === "es") {
    return "El pago es debido dentro de 30 días de la factura. Se aplica un cargo por mora del 1.5% mensual a las facturas vencidas. Este estimado es válido por el número de días indicado. Los precios son estimados basados en las condiciones descritas. Cualquier trabajo adicional requiere una orden de cambio por escrito. El contratista no es responsable de condiciones ocultas descubiertas durante el trabajo.";
  }
  return "Payment is due within 30 days of invoice. A 1.5% monthly late fee applies to overdue invoices. This estimate is valid for the number of days shown above. Prices are estimated based on described conditions. Any additional work requires a written change order. Contractor is not liable for hidden conditions discovered during work.";
}
