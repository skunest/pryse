import { PDFFont, rgb, RGB } from "pdf-lib";

/**
 * The standard PDF fonts only cover WinAnsi characters. Replace common
 * typographic characters and drop anything else so drawing never throws.
 */
export function safe(input: unknown): string {
  return String(input ?? "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/\t/g, "  ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, "");
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= width) { line = test; continue; }
      if (line) out.push(line);
      // Break very long words
      let word = w;
      while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
        let i = word.length;
        while (i > 1 && font.widthOfTextAtSize(word.slice(0, i), size) > width) i--;
        out.push(word.slice(0, i));
        word = word.slice(i);
      }
      line = word;
    }
    if (line) out.push(line);
  }
  return out;
}

export function hex(color: string | null | undefined, fallback = "#111111"): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((color || fallback).trim()) || /^#?([0-9a-f]{6})$/i.exec(fallback)!;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export const GREY = rgb(0.42, 0.42, 0.42);
export const LIGHT = rgb(0.6, 0.6, 0.6);
export const LINE = rgb(0.88, 0.88, 0.88);
export const BG = rgb(0.965, 0.965, 0.965);
export const INK = rgb(0.13, 0.13, 0.13);

/** mm to PDF points */
export const mm = (v: number) => (v * 72) / 25.4;
