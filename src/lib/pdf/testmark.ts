import { PDFFont, PDFPage, degrees, rgb } from "pdf-lib";
import { IS_TESTING, TEST_LABEL, TEST_NOTE } from "../env";

const ORANGE = rgb(0.996, 0.569, 0.196);
const INK = rgb(0.07, 0.07, 0.07);

/**
 * On a testing system, marks a page with a TESTING badge (top right),
 * a large diagonal watermark and a note along the top edge.
 */
export function markTestPage(page: PDFPage, bold: PDFFont, regular: PDFFont) {
  if (!IS_TESTING) return;
  const { width: W, height: H } = page.getSize();
  // Diagonal watermark
  const size = Math.min(W, H) * 0.16;
  const tw = bold.widthOfTextAtSize(TEST_LABEL, size);
  page.drawText(TEST_LABEL, {
    x: W / 2 - (tw / 2) * Math.SQRT1_2 + (size / 2) * Math.SQRT1_2,
    y: H / 2 - (tw / 2) * Math.SQRT1_2 - (size / 2) * Math.SQRT1_2,
    size, font: bold, color: ORANGE, opacity: 0.13, rotate: degrees(45),
  });
  // Top strip with badge and note
  page.drawRectangle({ x: 0, y: H - 16, width: W, height: 16, color: ORANGE, opacity: 0.95 });
  const label = `${TEST_LABEL}  |  ${TEST_NOTE}`;
  const ls = 7;
  const lw = bold.widthOfTextAtSize(label, ls);
  page.drawText(label, { x: (W - lw) / 2, y: H - 11, size: ls, font: bold, color: INK });
}

/** Text to add to a PDF's metadata on a testing system. */
export const testSubject = () => (IS_TESTING ? ` [${TEST_LABEL}: ${TEST_NOTE}]` : "");
