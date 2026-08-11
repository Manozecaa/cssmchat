import { supabase } from "@/integrations/supabase/client";

export const AVATAR_BUCKET = "avatars";

/** Gera URLs assinadas para os caminhos de avatar guardados em profiles.avatar_url. */
export async function signAvatars(paths: (string | null | undefined)[]) {
  const unique = Array.from(
    new Set(paths.filter((p): p is string => !!p && !p.startsWith("http"))),
  );
  const map: Record<string, string> = {};
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrls(unique, 3600);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}

export function avatarSrc(
  path: string | null | undefined,
  signed: Record<string, string>,
): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return signed[path];
}
