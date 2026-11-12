import { z } from "zod";

const opt = (max = 300) => z.string().trim().max(max).nullable().optional().transform((v) => (v === "" ? null : v));

export const clientSchema = z.object({
  type: z.enum(["individual", "company", "trust", "other"]).default("individual"),
  name: z.string().trim().min(1, "Name is required").max(200),
  id_or_reg_number: opt(40),
  vat_number: opt(30),
  email: z.string().trim().toLowerCase().email().nullable().optional().or(z.literal("").transform(() => null)),
  phone: opt(40),
  address: opt(500),
  notes: opt(2000),
});

export const clientPatch = clientSchema.partial().extend({ archived: z.boolean().optional() });
