import "server-only";
import { adminDb, BUCKET } from "./supabase";

export async function upload(path: string, data: Uint8Array | Buffer, contentType: string) {
  const { error } = await adminDb().storage.from(BUCKET).upload(path, data, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

export async function download(path: string): Promise<Uint8Array> {
  const { data, error } = await adminDb().storage.from(BUCKET).download(path);
  if (error || !data) throw error || new Error("File not found");
  return new Uint8Array(await data.arrayBuffer());
}

/** Short-lived link to a private file. */
export async function signedUrl(path: string, seconds = 300, downloadName?: string) {
  const { data, error } = await adminDb().storage.from(BUCKET)
    .createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
