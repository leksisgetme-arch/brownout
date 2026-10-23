import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import {
	Badge,
	Button,
	Card,
	DataRow,
	EmptyState,
	ErrorNotice,
	PageHeader,
} from "#/components/ui";
import { useAppContext } from "#/lib/app-context";
import { errorMessage } from "#/lib/i18n/messages";
import { useI18n } from "#/lib/i18n/use-i18n";
import { startDrillFn } from "#/server/drills/functions";
import {
	deleteScenarioFn,
	getScenarioFn,
	publishScenarioFn,
	type ScenarioVerification,
	verifyScenarioFn,
} from "#/server/scenarios/functions";

export const Route = createFileRoute("/app/scenarios/$scenarioId")({
	loader: async ({ params }) => {
		const result = await getScenarioFn({ data: { id: params.scenarioId } });
		if (!result.ok) throw notFound();
		return result.data;
	},
	component: ScenarioDetailPage,
});

function ScenarioDetailPage() {
	const { t, locale } = useI18n();
	const scenario = Route.useLoaderData();
	const navigate = useNavigate();
	const router = useRouter();
	const { user } = useAppContext();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<{ code: string; message: string } | null>(
		null,
	);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [verification, setVerification] = useState<ScenarioVerification | null>(
		null,
	);
	const [verifying, setVerifying] = useState(false);
	const [verifyError, setVerifyError] = useState<string | null>(null);

	const isCommander = user?.role === "commander";

	async function startDrill() {
		setPending(true);
		setError(null);
		try {
			const result = await startDrillFn({
				data: { scenarioId: scenario.id },
			});
			if (!result.ok) {
				setError({
					code: result.code,
					message: result.retryAfterSeconds
						? `${errorMessage(locale, result.code)} (Retry-After: ${result.retryAfterSeconds}s)`
						: errorMessage(locale, result.code),
				});
				return;
			}
			await router.invalidate();
			await navigate({
				to: "/app/drills/$drillId",
				params: { drillId: result.data.drillId },
				search: { motion: undefined },
			});
		} finally {
			setPending(false);
		}
	}

	async function verify() {
		setVerifying(true);
		setVerifyError(null);
		try {
			const result = await verifyScenarioFn({ data: { id: scenario.id } });
			if (!result.ok) {
				setVerifyError(result.code);
				return;
			}
			setVerification(result.data);
		} finally {
			setVerifying(false);
		}
	}

	async function publish() {
		setPending(true);
		setError(null);
		try {
			const result = await publishScenarioFn({ data: { id: scenario.id } });
			if (!result.ok) {
				setError({
					code: result.code,
					message:
						result.errors?.[0]?.message ?? errorMessage(locale, result.code),
				});
				return;
			}
			await router.invalidate();
		} finally {
			setPending(false);
		}
	}

	async function removeScenario() {
		setDeleting(true);
		setError(null);
		try {
			const result = await deleteScenarioFn({ data: { id: scenario.id } });
			if (!result.ok) {
				setError({
					code: result.code,
					message: errorMessage(locale, result.code),
				});
				setConfirmDelete(false);
				return;
			}
			await router.invalidate();
			await navigate({ to: "/app" });
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="space-y-6" data-testid="scenario-detail">
			<nav aria-label="Breadcrumb" className="mb-1">
				<Link
					to="/app"
					search={true}
					data-testid="back-to-dashboard"
					className="link-underline text-sm text-ink-2 hover:text-ink"
				>
					<span aria-hidden="true">← </span>
					{t("dash.backToDash")}
				</Link>
			</nav>

			{isCommander &&
			!scenario.definition.curated &&
			scenario.status === "DRAFT" ? (
				<div
					className="flex flex-wrap items-center gap-2"
					data-testid="draft-actions"
				>
					<Link
						to="/app/scenarios/$scenarioId/edit"
						params={{ scenarioId: scenario.id }}
						data-testid="edit-scenario"
						className="press inline-flex items-center gap-2 rounded-md border border-line-strong px-3.5 py-2 text-sm text-text hover:border-line-strong hover:bg-graphite-900"
					>
						{t("dash.editScenario")}
					</Link>
					<button
						type="button"
						data-testid="delete-scenario"
						className="press inline-flex items-center gap-2 rounded-md border border-amber/50 px-3.5 py-2 text-sm text-amber hover:bg-amber/10"
						onClick={() => setConfirmDelete(true)}
						disabled={deleting}
					>
						{t("dash.deleteScenario")}
					</button>
				</div>
			) : null}

			{confirmDelete ? (
				<div
					role="dialog"
					aria-label={t("dash.deleteScenario")}
					data-testid="confirm-delete"
					className="rounded-md border border-amber/45 bg-graphite-950 px-4 py-3"
				>
					<p className="text-sm text-ink-2">{t("dash.deleteConfirm")}</p>
					<div className="mt-3 flex gap-2">
						<button
							type="button"
							data-testid="confirm-delete-yes"
							className="press rounded-md border border-amber bg-amber px-3.5 py-2 text-sm font-medium text-graphite-950 hover:bg-[#eab35f]"
							onClick={() => void removeScenario()}
							disabled={deleting}
						>
							{deleting ? t("common.loading") : t("dash.deleteConfirmYes")}
						</button>
						<button
							type="button"
							data-testid="confirm-delete-no"
							className="press rounded-md border border-line-strong px-3.5 py-2 text-sm text-text hover:bg-graphite-900"
							onClick={() => setConfirmDelete(false)}
							disabled={deleting}
						>
							{t("common.cancel")}
						</button>
					</div>
				</div>
			) : null}
			<PageHeader
				title={scenario.name}
				eyebrow={t("common.scenarios")}
				subtitle={`seed ${scenario.seed} · ${scenario.maxTicks} ticks`}
				actions={
					<>
						<Badge
							tone={scenario.status === "READY" ? "green" : "neutral"}
							testId="scenario-status"
						>
							{t(`scenario.status.${scenario.status}`)}
						</Badge>
						{scenario.definition.curated ? (
							<Badge tone="amber">{t("common.curated")}</Badge>
						) : null}
					</>
				}
			/>

			{error ? <ErrorNotice code={error.code} message={error.message} /> : null}

			<div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
				<Card>
					<dl>
						<DataRow label={t("scenario.owner")} value={scenario.ownerEmail} />
						<DataRow
							label={t("common.seed")}
							value={<code>{scenario.seed}</code>}
						/>
						<DataRow label={t("scenario.maxTicks")} value={scenario.maxTicks} />
						<DataRow
							label={t("scenario.eventsCount")}
							value={scenario.definition.events.length}
						/>
						<DataRow
							label={t("drill.requiredActions")}
							value={
								<span data-testid="scenario-required-count">
									{scenario.definition.requiredActions.length}
								</span>
							}
						/>
					</dl>

					{scenario.status === "READY" && isCommander ? (
						<div className="mt-4">
							{scenario.openDrill ? (
								<Link
									to="/app/drills/$drillId"
									params={{ drillId: scenario.openDrill.id }}
									search={{ motion: undefined }}
									data-testid="scenario-open-drill"
									className="press inline-flex w-full flex-wrap items-center justify-center gap-2 rounded-md border border-amber/60 bg-amber/10 px-3 py-2 text-sm text-amber hover:bg-amber/15"
								>
									{t("dash.openDrill")}
									<span className="font-mono text-[10px] text-amber/80">
										{scenario.openDrill.state} · tick {scenario.openDrill.tick}
									</span>
								</Link>
							) : (
								<Button
									onClick={() => void startDrill()}
									disabled={pending}
									data-testid="start-drill"
									className="w-full"
								>
									{pending ? t("common.loading") : t("home.ctaPrimary")}
								</Button>
							)}
							<p className="mt-2 text-xs text-ink-3">
								{t("common.commander")} · 5/min · E-RATE-429
							</p>
						</div>
					) : null}

					{scenario.status === "DRAFT" && isCommander ? (
						<div className="mt-4">
							<Button
								tone="secondary"
								onClick={() => void publish()}
								disabled={pending}
								data-testid="publish-scenario"
								className="w-full"
							>
								{pending ? t("common.loading") : t("scenario.publish")}
							</Button>
						</div>
					) : null}

					{!isCommander ? (
						<p
							className="mt-4 text-xs text-ink-3"
							data-testid="scenario-read-only"
						>
							{t("scenario.readOnlyNotice")}
						</p>
					) : null}

					<div
						className="mt-4 border-t border-line pt-3"
						data-testid="verify-block"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-ink">
								{t("scenario.verifyTitle")}
							</h2>
							<Button
								tone="secondary"
								className="px-2.5 py-1 text-xs"
								onClick={() => void verify()}
								disabled={verifying}
								data-testid="verify-scenario"
							>
								{verifying ? t("scenario.verifying") : t("scenario.verify")}
							</Button>
						</div>
						<p className="mt-1 text-[11px] text-ink-3">
							{t("scenario.verifyHint")}
						</p>

						{verifyError ? (
							<div className="mt-2">
								<ErrorNotice
									code={verifyError}
									message={errorMessage(locale, verifyError)}
									testId="verify-error"
								/>
							</div>
						) : null}

						{verification ? (
							<div className="mt-3 space-y-2" data-testid="verify-result">
								<Badge
									tone={verification.solvable ? "green" : "red"}
									testId="verify-solvable"
								>
									{verification.solvable
										? t("scenario.verifySolvable")
										: t("scenario.verifyUnsolvable")}
								</Badge>
								<p
									className="font-mono text-xs text-ink-2"
									data-testid="verify-resolve"
								>
									{t("scenario.verifyResolve", {
										tick: verification.resolveTick ?? "—",
										total: verification.maxTicks,
									})}
								</p>
								<p
									className="font-mono text-xs text-ink-2"
									data-testid="verify-par"
								>
									{t("scenario.verifyPar")}:{" "}
									<span className="text-amber">
										{verification.score.total} · {verification.score.grade}
									</span>
								</p>
								<p
									className="font-mono text-[11px] text-ink-3"
									data-testid="verify-side"
								>
									{t("scenario.verifyDeadLetters")}:{" "}
									{verification.deadLetters.length} · {t("scenario.verifySla")}:{" "}
									{verification.slaBreachWindows}
								</p>
							</div>
						) : null}
					</div>
				</Card>

				<Card>
					<h2 className="text-sm font-semibold text-ink">
						{t("drill.timeline")}
					</h2>
					{scenario.definition.events.length === 0 ? (
						<div className="mt-3">
							<EmptyState
								testId="empty-scenario-events"
								title={t("drill.emptyEvents")}
								hint={t("drill.emptyEventsHint")}
							/>
						</div>
					) : (
						<ol className="mt-3 space-y-2" data-testid="scenario-events">
							{scenario.definition.events.map((event) => (
								<li
									key={`${event.tick}-${event.type}`}
									className="flex items-start gap-3 rounded border border-line bg-graphite-950/60 px-3 py-2"
								>
									<span className="mt-0.5 font-mono text-xs text-amber">
										t{event.tick}
									</span>
									<div className="min-w-0">
										<p className="text-sm text-ink">{event.type}</p>
										<p className="mt-0.5 break-all font-mono text-xs text-ink-3">
											{JSON.stringify(event.payload)}
										</p>
										{event.failure ? (
											<Badge tone="red">{event.failure}</Badge>
										) : null}
									</div>
								</li>
							))}
						</ol>
					)}

					<details className="mt-4">
						<summary className="cursor-pointer text-xs text-ink-3">
							{t("scenario.definition")}
						</summary>
						<pre className="mt-2 max-h-72 overflow-auto rounded border border-line bg-graphite-950 p-3 text-xs text-ink-2">
							{JSON.stringify(scenario.definition, null, 2)}
						</pre>
					</details>
				</Card>
			</div>
		</div>
	);
}
