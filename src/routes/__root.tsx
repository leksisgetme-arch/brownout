import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useRouteContext,
	useRouterState,
	useSearch,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MotionProvider } from "#/components/landing/motion-preference";
import { GlobalError, NotFoundPage } from "#/components/RouteFallbacks";
import { SiteFooter } from "#/components/SiteFooter";
import { SiteHeader } from "#/components/SiteHeader";
import type { Locale } from "#/lib/i18n/locale";
import type { RouterContext } from "#/router-context";
import { getCurrentUserFn, getLocaleFn } from "#/server/auth/functions";
import type { SessionUser } from "#/server/auth/types";
import appCss from "../styles.css?url";

export interface RootContext extends RouterContext {
	locale: Locale;
	user: SessionUser | null;
	sessionExpired: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async () => {
		const [locale, session] = await Promise.all([
			getLocaleFn(),
			getCurrentUserFn(),
		]);
		return {
			locale,
			user: session.user,
			sessionExpired: session.expired,
		} satisfies Omit<RootContext, keyof RouterContext>;
	},
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Brownout — Incident drill simulator" },
			{
				name: "description",
				content:
					"Deterministic incident drills with a virtual clock, a sandbox webhook receiver, and an explainable score.",
			},
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	shellComponent: RootShell,
	component: RootLayout,
	errorComponent: GlobalError,
	notFoundComponent: NotFoundPage,
});

function RootShell({ children }: { children: ReactNode }) {
	// Cast lives in one place: file-route context typing is empty in this router version.
	const { locale } = useRouteContext({ from: "__root__" }) as unknown as {
		locale: Locale;
	};
	return (
		<html lang={locale}>
			<head>
				<HeadContent />
			</head>
			<body>
				<a
					href="#main"
					className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-amber focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-graphite-950"
				>
					Skip to content
				</a>
				<div id="app" className="flex min-h-screen flex-col">
					{children}
				</div>
				<Scripts />
			</body>
		</html>
	);
}

function RootLayout() {
	// `?motion=off` is global: the header toggle and the landing scene must agree.
	const search = useSearch({ strict: false }) as { motion?: "off" };
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const fullBleed = pathname === "/" || pathname === "/demo";

	return (
		<MotionProvider urlDisabled={search.motion === "off"}>
			<SiteHeader />
			<main
				id="main"
				className={
					fullBleed ? "flex-1" : "mx-auto w-full max-w-5xl flex-1 px-6 py-10"
				}
			>
				<Outlet />
			</main>
			<SiteFooter />
		</MotionProvider>
	);
}
