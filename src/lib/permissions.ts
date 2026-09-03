/**
 * Permissões por categoria de usuário (comum, gestão, diretoria, administrador).
 * Armazenadas em app_settings (key = "category_permissions") e editáveis no Painel ADM.
 * Módulo seguro para o navegador (sem segredos).
 */

export const CATEGORIES = ["comum", "gestao", "diretoria", "administrador"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  comum: "Comum",
  gestao: "Gestão",
  diretoria: "Diretoria",
  administrador: "Administrador",
};

export const PERMISSION_KEYS = [
  "create_groups",
  "auto_pin_groups",
  "create_events",
  "send_attachments",
  "mention_all",
  "change_status",
  "change_avatar",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, { label: string; hint: string }> = {
  create_groups: { label: "Criar grupos", hint: "Pode criar conversas em grupo." },
  auto_pin_groups: {
    label: "Grupos fixados automaticamente",
    hint: "Grupos criados já nascem fixados no topo da lista de todos os membros.",
  },
  create_events: { label: "Criar eventos/reuniões", hint: "Pode agendar eventos dentro das conversas." },
  send_attachments: { label: "Enviar anexos", hint: "Pode anexar documentos e imagens nas mensagens." },
  mention_all: { label: "Mencionar @todos", hint: "Pode notificar todos os membros de um grupo com @todos." },
  change_status: { label: "Alterar status", hint: "Pode alterar o próprio status (ativo, ocupado…)." },
  change_avatar: { label: "Alterar foto de perfil", hint: "Pode trocar a própria foto de perfil." },
};

export type CategoryPermissions = Record<Category, Record<PermissionKey, boolean>>;

const all = (v: boolean): Record<PermissionKey, boolean> =>
  Object.fromEntries(PERMISSION_KEYS.map((k) => [k, v])) as Record<PermissionKey, boolean>;

export const DEFAULT_PERMISSIONS: CategoryPermissions = {
  comum: { ...all(true), create_groups: true, auto_pin_groups: false, mention_all: false },
  gestao: all(true),
  diretoria: all(true),
  administrador: all(true),
};

/** Normaliza um valor vindo do banco (jsonb) para o formato completo. */
export function normalizePermissions(raw: unknown): CategoryPermissions {
  const out: CategoryPermissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const cat of CATEGORIES) {
    const row = obj[cat];
    if (!row || typeof row !== "object") continue;
    for (const key of PERMISSION_KEYS) {
      const v = (row as Record<string, unknown>)[key];
      if (typeof v === "boolean") out[cat][key] = v;
    }
  }
  // Administradores sempre têm todas as permissões.
  out.administrador = all(true);
  return out;
}

export function can(
  perms: CategoryPermissions,
  category: string | null | undefined,
  key: PermissionKey,
): boolean {
  const cat = (CATEGORIES as readonly string[]).includes(category ?? "") ? (category as Category) : "comum";
  if (cat === "administrador") return true;
  return perms[cat]?.[key] ?? DEFAULT_PERMISSIONS[cat][key];
}
