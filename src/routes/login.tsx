import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	Button,
	Card,
	ErrorNotice,
	Field,
	inputClass,
	PageHeader,
} from "#/components/ui";
import { DEMO_PASSWORD } from "#/lib/demo";
import { errorMessage } from "#/lib/i18n/messages";
import { useI18n } from "#/lib/i18n/use-i18n";
import { loginFn } from "#/server/auth/functions";

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>): { error?: string } => ({
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: LoginPage,
});

function LoginPage() {
	const { t, locale } = useI18n();
	const search = Route.useSearch();
	const router = useRouter();
	const navigate = useNavigate();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);
	// The form is server rendered, so its submit handler only exists after
	// hydration. Until then the browser would POST the form to /login natively
	// and silently reload this page, so keep the button disabled.
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	const [error, setError] = useState<{ code: string; message: string } | null>(
		search.error
			? { code: search.error, message: errorMessage(locale, search.error) }
			: null,
	);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		try {
			const result = await loginFn({ data: { email, password } });
			if (!result.ok) {
				setError({
					code: result.code,
					message: result.retryAfterSeconds
						? `${errorMessage(locale, result.code)} (${result.retryAfterSeconds}s)`
						: errorMessage(locale, result.code),
				});
				return;
			}
			await router.invalidate();
			await navigate({ to: "/app" });
		} catch (cause) {
			setError({
				code: "E-AUTH-001",
				message: errorMessage(locale, "E-AUTH-001"),
			});
			console.error(cause);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="mx-auto max-w-md">
			<PageHeader
				title={t("auth.loginTitle")}
				subtitle={t("auth.loginSubtitle")}
			/>
			<Card>
				<form
					method="post"
					action="/login"
					onSubmit={onSubmit}
					className="space-y-4"
					data-testid="login-form"
					noValidate
				>
					{error ? (
						<ErrorNotice code={error.code} message={error.message} />
					) : null}

					<Field label={t("common.email")} htmlFor="email">
						<input
							id="email"
							name="email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							className={inputClass}
							data-testid="login-email"
							aria-describedby="email-hint"
						/>
					</Field>

					<Field
						label={t("common.password")}
						htmlFor="password"
						hint={`${t("auth.demoHint")} ${DEMO_PASSWORD}`}
					>
						<input
							id="password"
							name="password"
							type="password"
							autoComplete="current-password"
							required
							minLength={8}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							className={inputClass}
							data-testid="login-password"
							aria-describedby="password-hint"
						/>
					</Field>

					<Button
						type="submit"
						disabled={pending || !hydrated}
						data-testid="login-submit"
						className="w-full"
					>
						{pending ? t("common.loading") : t("auth.submitLogin")}
					</Button>
				</form>

				<p className="mt-4 text-sm text-ink-3">
					{t("auth.noAccount")}{" "}
					<Link
						to="/signup"
						className="text-amber underline-offset-4 hover:underline"
					>
						{t("nav.signUp")}
					</Link>
				</p>
			</Card>
		</div>
	);
}
