import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_MINUTES = 60;
const LAST_ACTIVITY_KEY = "cssm:last-activity";

function readLastActivity() {
  try {
    const saved = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : Date.now();
  } catch {
    return Date.now();
  }
}

function saveLastActivity(value: number) {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(value));
  } catch {
    /* ignore */
  }
}

/**
 * Encerra a sessão do usuário após um período de inatividade.
 * O tempo é definido globalmente no painel administrativo
 * (app_settings.session_timeout_minutes) e vale 60 minutos por padrão.
 */
export function useSessionTimeout(onExpire: () => void) {
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let minutes = DEFAULT_MINUTES;
    let lastActivity = readLastActivity();

    const expire = async () => {
      await supabase.auth.signOut();
      if (!cancelled) expireRef.current();
    };

    const arm = () => {
      if (timer) clearTimeout(timer);
      const remaining = Math.max(1, minutes) * 60 * 1000 - (Date.now() - lastActivity);
      if (remaining <= 0) {
        void expire();
        return;
      }
      timer = setTimeout(() => void expire(), remaining);
    };

    const activity = () => {
      if (Date.now() - lastActivity >= Math.max(1, minutes) * 60 * 1000) {
        void expire();
        return;
      }
      lastActivity = Date.now();
      saveLastActivity(lastActivity);
      arm();
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") arm();
    };
    const events = ["mousedown", "keydown", "touchstart"];
    events.forEach((e) => document.addEventListener(e, activity, { passive: true }));
    document.addEventListener("visibilitychange", checkWhenVisible);

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

    saveLastActivity(lastActivity);
    arm();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, activity));
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);
}
