import "server-only";
import type { FirmCtx } from "./auth";
import { clientIp } from "./http";

/** Records an action in the firm's append-only audit trail. Never throws. */
export async function audit(
  ctx: FirmCtx,
  req: Request,
  entity: string,
  entityId: string | null,
  action: string,
  data?: Record<string, unknown>,
) {
  try {
    await ctx.db.from("audit_events").insert({
      firm_id: ctx.firmId,
      actor_id: ctx.user.id,
      entity,
      entity_id: entityId,
      action,
      data: data ?? null,
      ip: clientIp(req),
    });
  } catch (e) {
    console.error("[audit]", e);
  }
}
