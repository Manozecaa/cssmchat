import { supabase } from "@/integrations/supabase/client";

export const CHAT_BUCKET = "chat-files";

export const MAX_FILE_MB = 20;

/** Gera URLs assinadas para anexos de mensagens. */
export async function signAttachments(paths: (string | null | undefined)[]) {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
  const map: Record<string, string> = {};
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from(CHAT_BUCKET).createSignedUrls(unique, 3600);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}

export function isImage(type: string | null | undefined) {
  return !!type && type.startsWith("image/");
}

export function formatSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(-80);
}
