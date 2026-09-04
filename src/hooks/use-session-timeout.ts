import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_MINUTES = 60;

/**
 * Encerra a sessão do usuário após um período de inatividade.
 * O tempo é definido globalmente no painel administrativo
 * (app_settings.session_timeout_minutes) e vale 60 minutos por padrão.
 */
export function useSessionTimeout(onExpire: () => void) {
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    // "Manter conectado" na tela de login desativa o encerramento por inatividade.
    try {
      if (window.localStorage.getItem("cssm:remember") === "1") return;
    } catch {
      /* ignore */
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let minutes = DEFAULT_MINUTES;

    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        async () => {
          await supabase.auth.signOut();
          if (!cancelled) expireRef.current();
        },
        Math.max(1, minutes) * 60 * 1000,
      );
    };

    const activity = () => arm();
    const events = ["mousedown", "keydown", "touchstart", "visibilitychange"];
    events.forEach((e) => document.addEventListener(e, activity, { passive: true }));

    void supabase
      .from("app_settings")
      .select("value")
      .eq("key", "session_timeout_minutes")
      .maybeSingle()
      .then(({ data }) => {
        const parsed = Number(data?.value);
        if (Number.isFinite(parsed) && parsed > 0) minutes = parsed;
        if (!cancelled) arm();
      });

    arm();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, activity));
    };
  }, []);
}
