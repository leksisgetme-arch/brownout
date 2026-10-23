import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAppContext } from "#/lib/app-context";
import { useI18n } from "#/lib/i18n/use-i18n";
import { logoutFn } from "#/server/auth/functions";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useMotionPreference } from "./landing/motion-preference";

const navLink =
	"link-underline rounded px-1 py-1 text-sm text-ink-2 transition-colors duration-300 hover:text-ink";
const chip =
	"press rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3 hover:border-line-strong hover:text-ink border border-transparent";

export function SiteHeader() {
	const { t } = useI18n();
	const { user } = useAppContext();
	const { motionEnabled, ready, toggle } = useMotionPreference();
	const router = useRouter();
	const navigate = useNavigate();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const [signingOut, setSigningOut] = useState(false);
	const [compact, setCompact] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		let frame = 0;
		const onScroll = () => {
			if (frame) return;
			frame = window.requestAnimationFrame(() => {
				setCompact(window.scrollY > 80);
				frame = 0;
			});
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();
		return () => {
			window.removeEventListener("scroll", onScroll);
			if (frame) window.cancelAnimationFrame(frame);
		};
	}, []);

	// Navigating (including browser back) always dismisses the mobile panel.
	const lastPath = useRef(pathname);
	useEffect(() => {
		if (lastPath.current === pathname) return;
		lastPath.current = pathname;
		setMenuOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (!menuOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenuOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [menuOpen]);

	async function signOut() {
		setSigningOut(true);
		try {
			await logoutFn();
			await router.invalidate();
			await navigate({ to: "/", search: { motion: undefined } });
		} finally {
			setSigningOut(false);
		}
	}

	const motionLabel = motionEnabled
		? t("landing.motion.on")
		: t("landing.motion.off");

	return (
		<header
			data-compact={compact ? "true" : "false"}
			className="sticky top-0 z-40 border-b border-transparent bg-transparent transition-[border-color,background-color,backdrop-filter] duration-500 ease-[var(--ease-calm)] data-[compact=true]:glass data-[compact=true]:border-line"
		>
			{/* Two zones on phones (brand / controls), three from md up. */}
			<div className="mx-auto grid h-12 w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-3 px-6 md:grid-cols-[1fr_auto_1fr]">
				<div>
					<Link
						to="/"
						search={{ motion: undefined }}
						data-testid="brand-link"
						className="flex items-center gap-2 text-[15px] font-medium tracking-tight text-ink"
					>
						<span
							aria-hidden="true"
							className="inline-block h-2 w-2 rounded-[1px] bg-amber"
						/>
						{t("app.name")}
					</Link>
				</div>{" "}
				<nav
					aria-label="Primary"
					className="hidden justify-self-center md:block"
				>
					<ul className="flex items-center gap-5">
						<li>
							<Link to="/demo" data-testid="nav-demo" className={navLink}>
								{t("nav.demo")}
							</Link>
						</li>
						<li>
							<Link
								to="/rulebook"
								data-testid="nav-rulebook"
								className={navLink}
							>
								{t("nav.rulebook")}
							</Link>
						</li>
						{user ? (
							<li>
								<Link to="/app" data-testid="nav-dashboard" className={navLink}>
									{t("nav.dashboard")}
								</Link>
							</li>
						) : null}
					</ul>
				</nav>
				<div className="flex items-center justify-end gap-2">
					<button
						type="button"
						onClick={toggle}
						aria-pressed={ready ? !motionEnabled : false}
						title={t("landing.motion.hint")}
						data-testid="motion-toggle"
						className={`${chip} hidden md:inline-flex`}
					>
						{motionLabel}
					</button>

					<LanguageSwitcher />

					{/* Desktop auth. Phones get the same actions inside the panel. */}
					<div className="hidden items-center gap-2 md:flex">
						{user ? (
							<>
								<span
									data-testid="current-user"
									className="hidden max-w-[10rem] truncate font-mono text-[11px] text-ink-3 lg:inline"
								>
									{user.email}
								</span>
								<button
									type="button"
									data-testid="sign-out"
									onClick={() => void signOut()}
									disabled={signingOut}
									className="press rounded px-1 py-1 text-sm text-ink-2 hover:text-ink disabled:opacity-60"
								>
									{t("nav.signOut")}
								</button>
							</>
						) : (
							<>
								<Link
									to="/login"
									data-testid="nav-login"
									className={`${navLink} whitespace-nowrap`}
								>
									{t("nav.signIn")}
								</Link>
								<Link
									to="/signup"
									data-testid="nav-signup"
									className="press whitespace-nowrap rounded border border-amber bg-amber px-2.5 py-1 text-[13px] font-medium text-graphite-950 hover:bg-[#eab35f]"
								>
									{t("nav.signUp")}
								</Link>
							</>
						)}
					</div>

					<button
						type="button"
						data-testid="mobile-menu-toggle"
						aria-expanded={menuOpen}
						aria-controls="mobile-menu"
						onClick={() => setMenuOpen((open) => !open)}
						className="press rounded border border-line-strong px-2.5 py-1 text-xs text-ink-2 hover:text-ink md:hidden"
					>
						{menuOpen ? t("nav.close") : t("nav.menu")}
					</button>
				</div>
			</div>

			{menuOpen ? (
				<div
					id="mobile-menu"
					data-testid="mobile-menu"
					className="absolute inset-x-0 top-full border-y border-line bg-graphite-950 px-6 py-4 shadow-[0_24px_48px_rgba(0,0,0,0.45)] md:hidden"
				>
					<nav aria-label="Mobile primary">
						<ul className="space-y-1">
							<li>
								<Link
									to="/demo"
									data-testid="menu-demo"
									className="block rounded px-1 py-1.5 text-sm text-ink-2 hover:text-ink"
								>
									{t("nav.demo")}
								</Link>
							</li>
							<li>
								<Link
									to="/rulebook"
									data-testid="menu-rulebook"
									className="block rounded px-1 py-1.5 text-sm text-ink-2 hover:text-ink"
								>
									{t("nav.rulebook")}
								</Link>
							</li>
							{user ? (
								<li>
									<Link
										to="/app"
										data-testid="menu-dashboard"
										className="block rounded px-1 py-1.5 text-sm text-ink-2 hover:text-ink"
									>
										{t("nav.dashboard")}
									</Link>
								</li>
							) : null}
						</ul>
					</nav>

					<div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
						{user ? (
							<>
								<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
									{user.email}
								</span>
								<button
									type="button"
									data-testid="menu-sign-out"
									onClick={() => void signOut()}
									disabled={signingOut}
									className="press rounded border border-line-strong px-3 py-1.5 text-xs text-ink hover:bg-graphite-800 disabled:opacity-60"
								>
									{t("nav.signOut")}
								</button>
							</>
						) : (
							<>
								<Link
									to="/login"
									data-testid="menu-sign-in"
									className="press rounded border border-line-strong px-3 py-1.5 text-xs text-ink hover:bg-graphite-800"
								>
									{t("nav.signIn")}
								</Link>
								<Link
									to="/signup"
									data-testid="menu-sign-up"
									className="press ml-auto rounded border border-amber bg-amber px-3 py-1.5 text-xs font-medium text-graphite-950 hover:bg-[#eab35f]"
								>
									{t("nav.signUp")}
								</Link>
							</>
						)}
					</div>

					<div className="mt-4 border-t border-line pt-4">
						<button
							type="button"
							onClick={toggle}
							aria-pressed={ready ? !motionEnabled : false}
							data-testid="menu-motion-toggle"
							className="press flex w-full items-center justify-between rounded border border-line px-3 py-2 text-xs text-ink-2 hover:text-ink"
						>
							<span>{t("nav.motion")}</span>
							<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
								{motionLabel}
							</span>
						</button>
					</div>
				</div>
			) : null}
		</header>
	);
}
