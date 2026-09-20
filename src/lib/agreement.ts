import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "node:crypto";

export interface AgreementSigner {
  name: string;
  role: "Student" | "Supervisor" | "Coordinator";
  signedAt?: string;
}

export interface AgreementData {
  topicTitle: string;
  supervisorName: string;
  students: string[];
  programme?: string | undefined;
  courseCode?: string | undefined;
  cycleLabel?: string | undefined;
  signers: AgreementSigner[];
}

/** Content hash used as the agreement's verification fingerprint. */
export function agreementHash(data: AgreementData): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 40);
}

export async function buildAgreementPdf(data: AgreementData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([595, 842]); // A4 portrait
  const margin = 56;
  let y = 842 - margin;

  page.drawText("Research Topic and Supervision Agreement", { x: margin, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.16) });
  y -= 22;
  page.drawText("Department of Computer Science — University of Eswatini", { x: margin, y, size: 9, font, color: rgb(0.42, 0.45, 0.55) });
  y -= 30;

  const field = (label: string, value: string) => {
    page.drawText(label, { x: margin, y, size: 8.5, font: bold, color: rgb(0.35, 0.37, 0.45) });
    page.drawText(value || "—", { x: margin, y: y - 15, size: 10, font, color: rgb(0.12, 0.13, 0.2) });
    y -= 38;
  };

  field("Proposed research topic", data.topicTitle);
  field("Allocated supervisor", data.supervisorName);
  field("Student(s)", data.students.join(", "));
  field("Programme / Course", [data.programme, data.courseCode].filter(Boolean).join(" — ") || "—");
  field("Academic cycle", data.cycleLabel || "—");

  y -= 6;
  page.drawText("Signature blocks", { x: margin, y, size: 11, font: bold, color: rgb(0.1, 0.1, 0.16) });
  y -= 24;

  for (const signer of data.signers) {
    page.drawLine({
      start: { x: margin, y: y - 14 },
      end: { x: 595 - margin, y: y - 14 },
      thickness: 1,
      color: rgb(0.82, 0.83, 0.87),
    });
    page.drawText(`${signer.name} — ${signer.role}`, { x: margin, y: y - 24, size: 9, font, color: rgb(0.15, 0.16, 0.22) });
    if (signer.signedAt) {
      page.drawText(`Signed ${signer.signedAt}`, { x: margin, y: y - 38, size: 8, font, color: rgb(0.45, 0.47, 0.55) });
    }
    y -= signer.signedAt ? 54 : 42;
  }

  y -= 12;
  page.drawText(`Verification hash: ${agreementHash(data)}`, { x: margin, y, size: 7, font, color: rgb(0.55, 0.56, 0.62) });

  return Buffer.from(await pdf.save());
}
