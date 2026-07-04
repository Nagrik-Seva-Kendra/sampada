import { useMutation, useQuery } from "@tanstack/react-query";
import type { ContactInput, ContactMessage } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Public: submit a contact enquiry. */
export function useContact() {
  return useMutation<ContactMessage, Error, ContactInput>({
    mutationFn: (input) => api.post("contact", { json: input }).json<ContactMessage>(),
  });
}

/** Admin: read submitted messages (requires a valid token). */
export function useContactMessages() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["contact", "messages"],
    enabled: !!token,
    queryFn: () =>
      api.get("contact", { headers: authHeaders(token) }).json<ContactMessage[]>(),
  });
}
