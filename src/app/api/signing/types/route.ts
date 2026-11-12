import { json } from "@/lib/http";
import { DOCUMENT_TYPES } from "@/lib/signing";

/** Document types, with the ones ECTA excludes marked as not allowed. */
export async function GET() {
  return json({ types: DOCUMENT_TYPES });
}
