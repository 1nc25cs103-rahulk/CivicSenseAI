import { jsPDF } from 'jspdf';
import type { Complaint, SupportedLanguage } from '../types/index.ts';

export function downloadEscalationPdf(params: {
  complaint: Complaint;
  letterText: string;
  language: SupportedLanguage;
  generationMethod: 'gemini' | 'template';
}): void {
  const { complaint, letterText, language, generationMethod } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const usableWidth = pageWidth - marginX * 2;
  let y = 46;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 74, 'F');

  doc.setTextColor(16, 185, 129);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CIVICSENSE AI  |  FORMAL MUNICIPAL ESCALATION & RTI REPRESENTATION', marginX, 28);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(`Ticket ${complaint.complaint_code}  —  ${complaint.district} District`, marginX, 49);

  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Generated: ${new Date().toLocaleString('en-IN')}  |  Priority: ${complaint.priority_level} (${complaint.priority_score}/100)  |  Source: ${generationMethod === 'gemini' ? 'Gemini 2.5 Flash' : 'Verified Template'}`,
    marginX,
    64
  );

  y = 96;

  // Metadata summary box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, y, usableWidth, 62, 4, 4, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`Issue: ${complaint.title.slice(0, 92)}`, marginX + 12, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Location: ${complaint.location}, ${complaint.locality}, ${complaint.district} (${complaint.latitude.toFixed(4)}, ${complaint.longitude.toFixed(4)})`.slice(0, 108),
    marginX + 12,
    y + 34
  );
  doc.text(
    `Category: ${complaint.category}  |  Status: ${complaint.status}  |  SLA Deadline: ${complaint.sla_deadline.slice(0, 10)}  |  Language: ${language.toUpperCase()}`,
    marginX + 12,
    y + 49
  );

  y += 82;

  // Notice for non-Latin scripts in standard Helvetica PDF fonts
  const hasNonAscii = /[^\x20-\x7E\r\n\t]/.test(letterText);
  if (hasNonAscii) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(marginX, y, usableWidth, 34, 4, 4, 'FD');
    doc.setTextColor(120, 53, 15);
    doc.setFontSize(8.5);
    const noteLines = doc.splitTextToSize(
      'Note: Regional Kannada/Hindi script characters are preserved cleanly in the on-screen editor and Clipboard Copy. This printable summary includes an English reference header below.',
      usableWidth - 20
    );
    doc.text(noteLines, marginX + 10, y + 13);
    y += 46;
  }

  // Body text (ASCII-safe for built-in jsPDF Helvetica, falling back cleanly if Unicode)
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const printableText = hasNonAscii
    ? [
        `Reference Ticket: ${complaint.complaint_code}`,
        `Issue Title: ${complaint.english_title || complaint.title}`,
        `Location: ${complaint.english_location || complaint.location}, ${complaint.locality}, ${complaint.district}`,
        `GPS Coordinates: ${complaint.latitude.toFixed(5)}, ${complaint.longitude.toFixed(5)}`,
        `Submitted On: ${complaint.created_at.slice(0, 10)} | SLA Deadline: ${complaint.sla_deadline.slice(0, 10)}`,
        `Priority: ${complaint.priority_level} (${complaint.priority_score}/100) | Status: ${complaint.status}`,
        '',
        'Formal Representation Summary:',
        'This print-ready document confirms that the above public infrastructure complaint has exceeded its designated Service Level Agreement (SLA) timeline. Under the Karnataka Municipal Corporations Act, Karnataka Sakala Services Act, and Right to Information Act, 2005 (general civic accountability principles), the complainant formally requests immediate engineering inspection, written reasons for delay, and a confirmed restoration schedule.',
        '',
        `Description: ${complaint.english_description || complaint.description}`,
        '',
        'Original regional language text was generated in CivicSense AI and can be copied directly from the Escalation Modal for native-script submission.',
        '',
        'Disclaimer: This automated representation is not legal advice and is distinct from a formal statutory RTI filing.',
      ].join('\n')
    : letterText;

  const paragraphs = printableText.split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      y += 9;
      continue;
    }
    const wrapped = doc.splitTextToSize(para, usableWidth);
    for (const line of wrapped) {
      if (y > pageHeight - 64) {
        doc.addPage();
        y = 50;
      }
      doc.text(line, marginX, y);
      y += 14.5;
    }
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 40, pageWidth - marginX, pageHeight - 40);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'CivicSense AI — Automated Formal Representation (Not Legal Advice)',
      marginX,
      pageHeight - 25
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX - 48, pageHeight - 25);
  }

  doc.save(`CivicSense-Escalation-${complaint.complaint_code}.pdf`);
}
