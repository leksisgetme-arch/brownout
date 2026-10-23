import type { QueryClient } from "@tanstack/react-query";

/** Shared router context. Kept in its own module to avoid a type-only import cycle. */
export interface RouterContext {
	queryClient: QueryClient;
}
