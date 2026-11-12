import { route, json, must, badRequest } from "@/lib/http";
import { requireFirm, ADMIN_ROLES } from "@/lib/auth";
import { upload, signedUrl } from "@/lib/storage";
import { audit } from "@/lib/audit";

/** Upload the firm logo (PNG or JPEG, max 2 MB). Printed on invoices. */
export const POST = route(async (req) => {
  const ctx = await requireFirm(req, ADMIN_ROLES);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose an image to upload");
  if (!["image/png", "image/jpeg"].includes(file.type)) throw badRequest("The logo must be a PNG or JPEG image");
  if (file.size > 2 * 1024 * 1024) throw badRequest("The logo must be smaller than 2 MB");
  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${ctx.firmId}/branding/logo-${Date.now()}.${ext}`;
  await upload(path, new Uint8Array(await file.arrayBuffer()), file.type);
  must(await ctx.db.from("firms").update({ logo_path: path }).eq("id", ctx.firmId));
  await audit(ctx, req, "firm", ctx.firmId, "logo_updated");
  return json({ logo_path: path, logo_url: await signedUrl(path, 3600) });
});

export const DELETE = route(async (req) => {
  const ctx = await requireFirm(req, ADMIN_ROLES);
  must(await ctx.db.from("firms").update({ logo_path: null }).eq("id", ctx.firmId));
  return json({ ok: true });
});
