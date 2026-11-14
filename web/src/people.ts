import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "./api";

export interface PublicUser {
  id: string;
  username: string;
  image: string | null;
  /** Run by the game, not a person: it won't answer messages. */
  bot: boolean;
  interests: { id: string; name: string }[];
  state: string | null;
  currentStop: string | null;
}

export interface Match {
  user: PublicUser;
  score: number;
}

export interface ConversationSummary {
  id: string;
  with: { id: string; username: string; image: string | null }[];
  lastMessage: { from: string; body: string; createdAt: number } | null;
  updatedAt: number;
}

export interface Message {
  id: string;
  from: string;
  content: { title: string | null; body: string };
  createdAt: number;
}

export const peopleKeys = {
  fellow: ["fellow"] as const,
  inbox: ["conversations"] as const,
  thread: (id: string) => ["conversation", id] as const,
};

export function useFellowTravellers() {
  return useQuery({ queryKey: peopleKeys.fellow, queryFn: () => api<Match[]>("GET", "/user/fellow-users"), refetchInterval: 60_000 });
}

export function useInbox() {
  return useQuery({ queryKey: peopleKeys.inbox, queryFn: () => api<ConversationSummary[]>("GET", "/conversation"), refetchInterval: 30_000 });
}

export function useThread(id: string) {
  return useQuery({
    queryKey: peopleKeys.thread(id),
    queryFn: async () => (await api<Message[]>("GET", `/conversation/${id}/messages`)).reverse(),
    refetchInterval: 10_000,
  });
}

/** Open (or reuse) a one-to-one chat and go to it. */
export function useStartChat() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api<{ id: string }>("POST", "/conversation", { conversation: { members: [userId] } }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: peopleKeys.inbox });
      navigate(`/messages/${c.id}`);
    },
  });
}

export function useSend(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api<Message>("POST", `/conversation/${conversationId}/messages`, { message: { body } }),
    onSuccess: (m) => {
      qc.setQueryData<Message[]>(peopleKeys.thread(conversationId), (old) => [...(old ?? []), m]);
      qc.invalidateQueries({ queryKey: peopleKeys.inbox });
    },
  });
}
