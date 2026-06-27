import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "user" | "admin_manager";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: Role[];
  isAdmin: boolean;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  roles: [],
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const { data: roles = [] } = useQuery({
    queryKey: ["my-roles", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId!);
      if (error) return [];
      return (data ?? []).map((r) => r.role as Role);
    },
  });

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        roles,
        isAdmin: roles.includes("admin_manager"),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);