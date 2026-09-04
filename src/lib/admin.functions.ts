import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual, randomBytes } from "node:crypto";

type AdminSession = { adminId?: string; username?: string; role?: "primary" | "secondary" };

function sessionConfig() {
  return {
    password: process.env["ADMIN_SESSION_SECRET"]!,
    name: "painel-adm",
    maxAge: 60 * 60 * 8,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

function hash(salt: string, password: string) {
  return createHash("sha256").update(salt + password, "utf8").digest("hex");
}

function safeEqual(a: string, b: string) {
  const x = createHash("sha256").update(a, "utf8").digest();
  const y = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(x, y);
}

async function requireAdmin() {
  const session = await useSession<AdminSession>(sessionConfig());
  if (!session.data.adminId) throw new Error("Não autorizado");
  return session;
}

async function requirePrimaryAdmin() {
  const session = await requireAdmin();
  if (session.data.role !== "primary") throw new Error("Ação exclusiva do administrador principal");
  return session;
}

async function verifyPrimaryPassword(password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("admin_credentials")
    .select("id, password_salt, password_hash")
    .eq("role", "primary")
    .limit(1);
  const row = rows?.[0];
  if (!row) return false;
  return safeEqual(hash(row.password_salt, password), row.password_hash);
}

export const adminMe = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  return session.data.adminId
    ? {
        authenticated: true as const,
        username: session.data.username ?? "",
        role: session.data.role ?? "secondary",
      }
    : { authenticated: false as const, username: "", role: "secondary" as const };
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("admin_credentials")
      .select("id, username, password_salt, password_hash, role, is_active")
      .eq("username", data.username)
      .maybeSingle();

    if (!row || !row.is_active || !safeEqual(hash(row.password_salt, data.password), row.password_hash)) {
      return { ok: false as const, username: "", role: "secondary" as const };
    }

    const role = (row.role === "primary" ? "primary" : "secondary") as "primary" | "secondary";
    const session = await useSession<AdminSession>(sessionConfig());
    await session.update({ adminId: row.id, username: row.username, role });
    return { ok: true as const, username: row.username, role };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const adminUpdateCredentials = createServerFn({ method: "POST" })
  .inputValidator((data: { currentPassword: string; username: string; newPassword?: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("admin_credentials")
      .select("id, password_salt, password_hash")
      .eq("id", session.data.adminId!)
      .maybeSingle();

    if (!row || !safeEqual(hash(row.password_salt, data.currentPassword), row.password_hash)) {
      return { ok: false as const, message: "Senha atual incorreta." };
    }

    const username = data.username.trim();
    if (username.length < 3) return { ok: false as const, message: "Usuário muito curto." };
    if (data.newPassword && data.newPassword.length < 4) {
      return { ok: false as const, message: "Nova senha muito curta." };
    }

    const patch: { username: string; password_hash?: string } = { username };
    if (data.newPassword) patch.password_hash = hash(row.password_salt, data.newPassword);

    const { error } = await supabaseAdmin
      .from("admin_credentials")
      .update(patch)
      .eq("id", row.id);
    if (error) return { ok: false as const, message: error.message };

    await session.update({ adminId: row.id, username, role: session.data.role ?? "secondary" });
    return { ok: true as const, message: "Credenciais atualizadas." };
  });

/* ---------------------------- Usuários do chat ---------------------------- */

export const USER_CATEGORIES = ["comum", "gestao", "diretoria", "administrador"] as const;
function normalizeCategory(value?: string) {
  return (USER_CATEGORIES as readonly string[]).includes(value ?? "") ? value! : "comum";
}

export const adminListUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, username, full_name, description, sector, is_active, created_at, must_change_password, category, cpf, birth_date")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      username: string;
      password: string;
      fullName: string;
      description?: string;
      sector?: string;
      mustChangePassword?: boolean;
      category?: string;
      cpf?: string;
      birthDate?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const username = data.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return {
        ok: false as const,
        message: "Usuário inválido: use 3 a 32 caracteres (letras, números, . _ -).",
      };
    }
    if (!data.password) {
      return { ok: false as const, message: "Informe uma senha." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) return { ok: false as const, message: "Este nome de usuário já existe." };

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: `${username}@cssm.local`,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        username,
        full_name: data.fullName.trim() || username,
        description: data.description?.trim() ?? "",
        sector: data.sector?.trim() ?? "",
      },
    });
    if (error) return { ok: false as const, message: error.message };

    if (created?.user?.id) {
      await supabaseAdmin
        .from("profiles")
        .update({
          description: data.description?.trim() || null,
          sector: data.sector?.trim() || null,
          must_change_password: data.mustChangePassword ?? false,
          category: normalizeCategory(data.category),
          cpf: data.cpf?.trim() || null,
          birth_date: data.birthDate || null,
        })
        .eq("id", created.user.id);
    }
    return { ok: true as const, message: "Usuário criado." };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      userId: string;
      username: string;
      fullName: string;
      password?: string;
      description?: string;
      sector?: string;
      isActive?: boolean;
      mustChangePassword?: boolean;
      category?: string;
      cpf?: string;
      birthDate?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const username = data.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return { ok: false as const, message: "Usuário inválido: use 3 a 32 caracteres." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing && existing.id !== data.userId) {
      return { ok: false as const, message: "Este nome de usuário já existe." };
    }

    const fullName = data.fullName.trim() || username;
    const payload: Record<string, unknown> = {
      email: `${username}@cssm.local`,
      user_metadata: { username, full_name: fullName },
    };
    if (data.password) payload["password"] = data.password;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, payload);
    if (error) return { ok: false as const, message: error.message };

    const profilePatch: {
      username: string;
      full_name: string;
      email: string;
      description: string | null;
      sector: string | null;
      is_active?: boolean;
      must_change_password?: boolean;
      category?: string;
      cpf: string | null;
      birth_date: string | null;
    } = {
      username,
      full_name: fullName,
      email: `${username}@cssm.local`,
      description: data.description?.trim() || null,
      sector: data.sector?.trim() || null,
      cpf: data.cpf?.trim() || null,
      birth_date: data.birthDate || null,
    };
    if (data.category) profilePatch.category = normalizeCategory(data.category);
    if (typeof data.isActive === "boolean") profilePatch.is_active = data.isActive;
    if (typeof data.mustChangePassword === "boolean") {
      profilePatch.must_change_password = data.mustChangePassword;
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(profilePatch)
      .eq("id", data.userId);
    if (profileError) return { ok: false as const, message: profileError.message };

    return { ok: true as const, message: "Usuário atualizado." };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error && !/not found/i.test(error.message)) {
      return { ok: false as const, message: error.message };
    }

    // O perfil não é removido em cascata: apaga explicitamente e, se não for
    // possível, desativa para que o usuário deixe de aparecer no sistema.
    const { error: delError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", data.userId);

    if (delError) {
      const { error: deactivateError } = await supabaseAdmin
        .from("profiles")
        .update({ is_active: false })
        .eq("id", data.userId);
      if (deactivateError) return { ok: false as const, message: deactivateError.message };
    }

    return { ok: true as const, message: "Usuário removido." };
  });

/* --------------------------- Administradores ----------------------------- */

export const adminListAdmins = createServerFn({ method: "GET" }).handler(async () => {
  await requirePrimaryAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("admin_credentials")
    .select("id, username, role, is_active, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const adminCreateAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    await requirePrimaryAdmin();
    const username = data.username.trim();
    if (username.length < 3) return { ok: false as const, message: "Usuário muito curto." };
    if (data.password.length < 6) {
      return { ok: false as const, message: "Senha deve ter ao menos 6 caracteres." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("admin_credentials")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) return { ok: false as const, message: "Já existe um administrador com esse login." };

    const salt = randomBytes(16).toString("hex");
    // Administradores criados aqui são sempre secundários.
    const { error } = await supabaseAdmin.from("admin_credentials").insert({
      username,
      password_salt: salt,
      password_hash: hash(salt, data.password),
      role: "secondary",
      is_active: true,
    });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Administrador secundário criado." };
  });

export const adminUpdateAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { adminId: string; password?: string; isActive?: boolean }) => data)
  .handler(async ({ data }) => {
    const session = await requirePrimaryAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("admin_credentials")
      .select("id, role, password_salt")
      .eq("id", data.adminId)
      .maybeSingle();
    if (!row) return { ok: false as const, message: "Administrador não encontrado." };
    if (row.role === "primary") {
      return { ok: false as const, message: "Use a aba Credenciais para o administrador principal." };
    }

    const patch: { is_active?: boolean; password_hash?: string } = {};
    if (typeof data.isActive === "boolean") patch.is_active = data.isActive;
    if (data.password) {
      if (data.password.length < 6) {
        return { ok: false as const, message: "Senha deve ter ao menos 6 caracteres." };
      }
      patch.password_hash = hash(row.password_salt, data.password);
    }
    if (Object.keys(patch).length === 0) {
      return { ok: false as const, message: "Nada para alterar." };
    }

    const { error } = await supabaseAdmin
      .from("admin_credentials")
      .update(patch)
      .eq("id", row.id)
      .neq("id", session.data.adminId!);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Administrador atualizado." };
  });

export const adminDeleteAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { adminId: string }) => data)
  .handler(async ({ data }) => {
    const session = await requirePrimaryAdmin();
    if (data.adminId === session.data.adminId) {
      return { ok: false as const, message: "Não é possível remover a própria conta." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("admin_credentials")
      .delete()
      .eq("id", data.adminId)
      .eq("role", "secondary");
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Administrador removido." };
  });

/* ------------------------- Download de conversas -------------------------- */

export const adminListConversations = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: convs }, { data: members }, { data: profiles }] = await Promise.all([
    supabaseAdmin
      .from("conversations")
      .select("id, title, is_group, updated_at")
      .order("updated_at", { ascending: false }),
    supabaseAdmin.from("conversation_members").select("conversation_id, user_id"),
    supabaseAdmin.from("profiles").select("id, full_name, username"),
  ]);

  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));
  return (convs ?? []).map((c) => {
    const people = (members ?? [])
      .filter((m) => m.conversation_id === c.id)
      .map((m) => nameOf.get(m.user_id) ?? "Usuário");
    return {
      id: c.id,
      title: c.title,
      is_group: c.is_group,
      updated_at: c.updated_at,
      participants: people,
    };
  });
});

export const adminExportConversation = createServerFn({ method: "POST" })
  .inputValidator((data: { conversationId: string; primaryPassword: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!(await verifyPrimaryPassword(data.primaryPassword))) {
      return { ok: false as const, message: "Senha do administrador principal incorreta." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("id, title, is_group, created_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) return { ok: false as const, message: "Conversa não encontrada." };

    const [{ data: msgs }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select("sender_id, content, created_at, deleted_at, edited_at")
        .eq("conversation_id", data.conversationId)
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("profiles").select("id, full_name, username"),
    ]);

    const nameOf = new Map(
      (profiles ?? []).map((p) => [p.id, `${p.full_name || p.username} (@${p.username})`]),
    );

    const lines = [
      `Conversa: ${conv.title ?? (conv.is_group ? "Grupo" : "Conversa direta")}`,
      `ID: ${conv.id}`,
      `Exportado em: ${new Date().toISOString()}`,
      `Total de mensagens: ${(msgs ?? []).length}`,
      "".padEnd(60, "-"),
      ...(msgs ?? []).map((m) => {
        const when = new Date(m.created_at).toLocaleString("pt-BR");
        const who = nameOf.get(m.sender_id) ?? "Usuário";
        const body = m.deleted_at ? "[mensagem apagada]" : m.content;
        return `[${when}] ${who}: ${body}${m.edited_at ? " (editada)" : ""}`;
      }),
    ];

    return {
      ok: true as const,
      message: "Histórico gerado.",
      filename: `conversa-${conv.id}.txt`,
      content: lines.join("\n"),
    };
  });

/* -------------------------------- Setores -------------------------------- */

export const adminListSectors = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: sectors, error }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("sectors").select("id, name, description, created_at").order("name"),
    supabaseAdmin.from("profiles").select("sector").eq("is_active", true),
  ]);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const p of profiles ?? []) {
    const key = (p.sector ?? "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (sectors ?? []).map((s) => ({ ...s, users: counts.get(s.name) ?? 0 }));
});

export const adminSaveSector = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string; name: string; description?: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const name = data.name.trim();
    if (name.length < 2 || name.length > 80) {
      return { ok: false as const, message: "Nome do setor deve ter entre 2 e 80 caracteres." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dup } = await supabaseAdmin.from("sectors").select("id").ilike("name", name).maybeSingle();
    if (dup && dup.id !== data.id) return { ok: false as const, message: "Já existe um setor com esse nome." };

    const payload = { name, description: data.description?.trim() || null };
    if (data.id) {
      const { data: old } = await supabaseAdmin.from("sectors").select("name").eq("id", data.id).maybeSingle();
      const { error } = await supabaseAdmin.from("sectors").update(payload).eq("id", data.id);
      if (error) return { ok: false as const, message: error.message };
      if (old && old.name !== name) {
        await supabaseAdmin.from("profiles").update({ sector: name }).eq("sector", old.name);
      }
      return { ok: true as const, message: "Setor atualizado." };
    }
    const { error } = await supabaseAdmin.from("sectors").insert(payload);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Setor criado." };
  });

export const adminDeleteSector = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("sectors").select("name").eq("id", data.id).maybeSingle();
    if (!row) return { ok: false as const, message: "Setor não encontrado." };
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("sector", row.name);
    if ((count ?? 0) > 0) {
      return { ok: false as const, message: `Há ${count} usuário(s) neste setor. Mova-os antes de excluir.` };
    }
    const { error } = await supabaseAdmin.from("sectors").delete().eq("id", data.id);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Setor excluído." };
  });

/* --------------------------- Configurações globais ------------------------ */

export type GlobalSettings = {
  session_timeout_minutes: number;
  max_attachment_mb: number;
  allow_user_groups: boolean;
  system_name: string;
};

const DEFAULT_SETTINGS: GlobalSettings = {
  session_timeout_minutes: 60,
  max_attachment_mb: 20,
  allow_user_groups: true,
  system_name: "CSSM",
};

export const adminGetSettings = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("key, value");
  const out: GlobalSettings = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) {
    if (row.key in out) (out as Record<string, unknown>)[row.key] = row.value;
  }
  return out;
});

export const adminSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((data: Partial<GlobalSettings>) => data)
  .handler(async ({ data }) => {
    await requirePrimaryAdmin();
    const patch: Partial<GlobalSettings> = {};
    if (data.session_timeout_minutes !== undefined) {
      const n = Math.round(Number(data.session_timeout_minutes));
      if (!Number.isFinite(n) || n < 1 || n > 1440) {
        return { ok: false as const, message: "Tempo de sessão deve ficar entre 1 e 1440 minutos." };
      }
      patch.session_timeout_minutes = n;
    }
    if (data.max_attachment_mb !== undefined) {
      const n = Math.round(Number(data.max_attachment_mb));
      if (!Number.isFinite(n) || n < 1 || n > 200) {
        return { ok: false as const, message: "Limite de anexo deve ficar entre 1 e 200 MB." };
      }
      patch.max_attachment_mb = n;
    }
    if (data.allow_user_groups !== undefined) patch.allow_user_groups = !!data.allow_user_groups;
    if (data.system_name !== undefined) {
      const name = String(data.system_name).trim().slice(0, 60);
      if (!name) return { ok: false as const, message: "Informe o nome do sistema." };
      patch.system_name = name;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = Object.entries(patch).map(([key, value]) => ({ key, value }));
    if (rows.length === 0) return { ok: true as const, message: "Nada para salvar." };
    const { error } = await supabaseAdmin.from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Configurações salvas." };
  });

/* ------------------------ Permissões por categoria ------------------------ */

export const adminGetPermissions = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { normalizePermissions } = await import("@/lib/permissions");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "category_permissions")
    .maybeSingle();
  return normalizePermissions(data?.value);
});

export const adminSavePermissions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }) => {
    await requirePrimaryAdmin();
    const { normalizePermissions } = await import("@/lib/permissions");
    const value = normalizePermissions(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "category_permissions", value }, { onConflict: "key" });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Permissões salvas." };
  });
