import { useRouteContext } from "@tanstack/react-router";
import type { SessionUser } from "#/server/auth/types";
import type { Locale } from "./i18n/locale";

export interface AppContext {
	locale: Locale;
	user: SessionUser | null;
	sessionExpired: boolean;
}

/**
 * The root route's beforeLoad result.
 *
 * TanStack Router 1.170.45 types file-route context as `{}` (createFileRoute passes
 * AnyContext for TRouterContext), so this is the single place where we assert the
 * runtime shape. Everything downstream stays typed.
 */
export function useAppContext(): AppContext {
	return useRouteContext({ from: "__root__" }) as unknown as AppContext;
}
