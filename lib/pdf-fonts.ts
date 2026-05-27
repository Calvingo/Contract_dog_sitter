import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

let regularBytes: Uint8Array | null = null;
let boldBytes: Uint8Array | null = null;

async function loadFontBytes(filename: string): Promise<Uint8Array> {
  const filePath = path.join(process.cwd(), "assets", "fonts", filename);
  const buffer = await readFile(filePath);
  return new Uint8Array(buffer);
}

export async function embedPdfFonts(
  doc: PDFDocument
): Promise<{ font: PDFFont; bold: PDFFont }> {
  doc.registerFontkit(fontkit);

  if (!regularBytes) {
    regularBytes = await loadFontBytes("NotoSansSC-Regular.otf");
  }
  if (!boldBytes) {
    boldBytes = await loadFontBytes("NotoSansSC-Bold.otf");
  }

  const font = await doc.embedFont(regularBytes);
  const bold = await doc.embedFont(boldBytes);
  return { font, bold };
}
