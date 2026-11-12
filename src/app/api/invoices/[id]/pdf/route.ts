import { route } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { invoicePdf } from "@/lib/invoices";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const { pdf, invoice } = await invoicePdf(ctx.db, ctx.firmId, id);
  const name = `${invoice.number ?? "draft-invoice"}.pdf`;
  const inline = new URL(req.url).searchParams.get("download") !== "1";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
});
