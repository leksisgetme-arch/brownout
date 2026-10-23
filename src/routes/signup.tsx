import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import {
	Button,
	Card,
	ErrorNotice,
	Field,
	inputClass,
	PageHeader,
} from "#/components/ui";
import { errorMessage } from "#/lib/i18n/messages";
import { useI18n } from "#/lib/i18n/use-i18n";
import { signupFn } from "#/server/auth/functions";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
	const { t, locale } = useI18n();
	const router = useRouter();
	const navigate = useNavigate();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<{ code: string; message: string } | null>(
		null,
	);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		try {
			const result = await signupFn({ data: { email, password } });
			if (!result.ok) {
				setError({
					code: result.code,
					message: errorMessage(locale, result.code),
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
				title={t("auth.signupTitle")}
				subtitle={t("auth.signupSubtitle")}
			/>
			<Card>
				<form
					method="post"
					action="/signup"
					onSubmit={onSubmit}
					className="space-y-4"
					data-testid="signup-form"
					noValidate
				>
					{error ? (
						<ErrorNotice code={error.code} message={error.message} />
					) : null}

					<Field label={t("common.email")} htmlFor="signup-email">
						<input
							id="signup-email"
							name="email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							className={inputClass}
							data-testid="signup-email"
						/>
					</Field>

					<Field
						label={t("common.password")}
						htmlFor="signup-password"
						hint={t("error.E-AUTH-003")}
					>
						<input
							id="signup-password"
							name="password"
							type="password"
							autoComplete="new-password"
							required
							minLength={8}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							className={inputClass}
							data-testid="signup-password"
							aria-describedby="signup-password-hint"
						/>
					</Field>

					<Button
						type="submit"
						disabled={pending}
						data-testid="signup-submit"
						className="w-full"
					>
						{pending ? t("common.loading") : t("auth.submitSignup")}
					</Button>
				</form>

				<p className="mt-4 text-sm text-ink-3">
					{t("auth.haveAccount")}{" "}
					<Link
						to="/login"
						className="text-amber underline-offset-4 hover:underline"
					>
						{t("nav.signIn")}
					</Link>
				</p>
			</Card>
		</div>
	);
}
