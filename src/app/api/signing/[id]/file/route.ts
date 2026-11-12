import { route, json, badRequest } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { requireRequest } from "@/lib/signflow";
import { signedUrl } from "@/lib/storage";

/** Short-lived download link for the original or the signed document. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const r = await requireRequest(ctx.db, ctx.firmId, id);
  const version = new URL(req.url).searchParams.get("version") === "signed" ? "signed" : "original";
  const path = version === "signed" ? r.signed_path : r.original_path;
  if (!path) throw badRequest(version === "signed" ? "The signed document is not ready yet" : "No document uploaded");
  const base = r.title.replace(/[^\w\- ]+/g, "").trim() || "document";
  const url = await signedUrl(path, 120, version === "signed" ? `${base} (signed).pdf` : `${base}.pdf`);
  return json({ url });
});
