import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type AdminSession = { adminId?: string; username?: string };

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

export const adminMe = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  return session.data.adminId
    ? { authenticated: true as const, username: session.data.username ?? "" }
    : { authenticated: false as const, username: "" };
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("admin_credentials")
      .select("id, username, password_salt, password_hash")
      .eq("username", data.username)
      .maybeSingle();

    if (!row || !safeEqual(hash(row.password_salt, data.password), row.password_hash)) {
      return { ok: false as const };
    }

    const session = await useSession<AdminSession>(sessionConfig());
    await session.update({ adminId: row.id, username: row.username });
    return { ok: true as const, username: row.username };
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

    await session.update({ adminId: row.id, username });
    return { ok: true as const, message: "Credenciais atualizadas." };
  });

export const adminListUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string; fullName: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const email = data.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false as const, message: "E-mail inválido." };
    }
    if (data.password.length < 6) {
      return { ok: false as const, message: "Senha deve ter ao menos 6 caracteres." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName.trim() || email.split("@")[0] },
    });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Usuário criado." };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Usuário removido." };
  });
