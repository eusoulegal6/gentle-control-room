import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OnlineUser {
  user_id: string;
  username: string;
  display_name: string | null;
  online_at: string;
}

export function useOnlineDesktopUsers() {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    const channel = supabase.channel("desktop-presence");

    function syncPresence() {
      const state = channel.presenceState<OnlineUser>();
      const users: OnlineUser[] = [];
      const seen = new Set<string>();
      for (const key of Object.keys(state)) {
        for (const presence of state[key]) {
          if (!seen.has(presence.user_id)) {
            seen.add(presence.user_id);
            users.push(presence);
          }
        }
      }
      setOnlineUsers(users);
    }

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return onlineUsers;
}
