import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Me } from "./api";

export const meKey = ["me"] as const;

/** The signed-in player, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return await api<Me>("GET", "/user/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 30_000,
    // Your state changes when the world ticks (boarding, arriving), so keep checking while signed in.
    refetchInterval: (q) => (q.state.data ? 60_000 : false),
  });
}

export interface SignupInput {
  username: string;
  email: string;
  password: string;
  age: number;
  currentStop: string;
  interests: string[];
  profileMode: "PUBLIC" | "PRIVATE";
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<{ user: Me }>("POST", "/user/login", { user: input }),
    onSuccess: (data) => qc.setQueryData(meKey, data.user),
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignupInput) => api<{ user: Me }>("POST", "/user/signup", { user: input }),
    onSuccess: (data) => qc.setQueryData(meKey, data.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("POST", "/user/logout"),
    onSuccess: () => {
      // Set "me" first so mounted screens switch to signed-out; then drop everything else.
      // (qc.clear() would also drop the "me" query that the Gate is subscribed to.)
      qc.setQueryData(meKey, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== meKey[0] });
    },
  });
}
