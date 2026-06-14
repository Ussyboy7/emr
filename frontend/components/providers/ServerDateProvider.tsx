"use client";

import { createContext, useContext } from "react";
import { useServerToday } from "@/hooks/use-server-today";
import { peekServerTodayApi } from "@/lib/dates";

const ServerDateContext = createContext<string>(peekServerTodayApi());

/** Provides server calendar today (YYYY-MM-DD) to the whole app. */
export function ServerDateProvider({ children }: { children: React.ReactNode }) {
  const serverToday = useServerToday();
  return (
    <ServerDateContext.Provider value={serverToday}>{children}</ServerDateContext.Provider>
  );
}

/** Server calendar today for report/analytics date ranges. */
export function useServerDateAnchor(): string {
  return useContext(ServerDateContext);
}
