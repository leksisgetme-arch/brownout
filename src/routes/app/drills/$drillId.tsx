import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
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
import { ACTION_TYPES, type ActionType } from "#/engine";
import { useAppContext } from "#/lib/app-context";
import {
	runLogLine,
	type TimelineLine,
	type TimelineTranslator,
} from "#/lib/drill-timeline";
import { formatDateTime } from "#/lib/format";
import { errorMessage } from "#/lib/i18n/messages";
import { useI18n } from "#/lib/i18n/use-i18n";
import {
	advanceTickFn,
	createShareLinkFn,
	type DrillDetail,
	getDrillFn,
	pauseDrillFn,
	performActionFn,
	resetDrillFn,
	resumeDrillFn,
} from "#/server/drills/functions";
import type { ServerResult } from "#/server/results";

export const Route = createFileRoute("/app/drills/$drillId")({
	validateSearch: (search: Record<string, unknown>) => ({
		motion: search.motion === "off" ? ("off" as const) : undefined,
	}),
	loader: async ({ params }) => {
		const result = await getDrillFn({ data: { id: params.drillId } });
		if (!result.ok) throw notFound();
		return result.data;
	},
	component: DrillPage,
});

/**
 * The engine log explains the run (deliveries, retries, actions, state); the
 * persisted events add what only the server knows (pause, resume, reset, the
 * final score). Merge both into one ordered timeline instead of showing bare
 * JSON payloads.
 */
function timelineLines(
	drill: DrillDetail,
	t: TimelineTranslator,
): TimelineLine[] {
	const lines: TimelineLine[] = [];
	for (const entry of drill.log) {
		// Evaluation is reported by the drill.evaluated event below.
		if (entry.kind === "state" && entry.to === "EVALUATED") continue;
		const line = runLogLine(entry, t);
		if (line) lines.push(line);
	}
	for (const event of drill.events) {
		const key = `event-${event.id}`;
		if (event.type === "drill.paused") {
			lines.push({
				key,
				tick: event.tick,
				text: t("drill.timeline.paused"),
				tone: "text-ink-2",
			});
		} else if (event.type === "drill.resumed") {
			lines.push({
				key,
				tick: event.tick,
				text: t("drill.timeline.resumed"),
				tone: "text-ink-2",
			});
		} else if (event.type === "drill.reset") {
			lines.push({
				key,
				tick: event.tick,
				text: t("drill.timeline.reset"),
				tone: "text-ink-2",
			});
		} else if (event.type === "drill.failed") {
			lines.push({
				key,
				tick: event.tick,
				text: t("drill.timeline.failed"),
				tone: "text-amber",
			});
		} else if (event.type === "drill.evaluated") {
			const total = event.payload.total;
			const grade = event.payload.grade;
			lines.push({
				key,
				tick: event.tick,
				text:
					typeof total === "number" && typeof grade === "string"
						? t("drill.timeline.evaluated", { total, grade })
						: t("drill.timeline.evaluatedBare"),
				tone: "text-ink-2",
			});
		}
	}
	return lines.sort((left, right) => left.tick - right.tick);
}

const stateTone = (state: string) => {
	if (state === "RUNNING") return "amber" as const;
	if (state === "RESOLVED" || state === "EVALUATED") return "green" as const;
	if (state === "FAILED") return "red" as const;
	if (state === "PAUSED") return "blue" as const;
	return "neutral" as const;
};

function DrillPage() {
	const { t, locale } = useI18n();
	const initial = Route.useLoaderData();
	const search = Route.useSearch();
	const { user } = useAppContext();
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState<{ code: string; message: string } | null>(
		null,
	);
	const [share, setShare] = useState<{
		token: string;
		expiresAt: string;
	} | null>(null);
	const [feedback, setFeedback] = useState<{
		action: ActionType;
		correct: boolean;
		repeat: boolean;
		done: number;
		total: number;
		resolved: boolean;
	} | null>(null);

	const query = useQuery({
		queryKey: ["drill", initial.id],
		queryFn: () => getDrillFn({ data: { id: initial.id } }),
		initialData: { ok: true as const, data: initial },
		// FR-H1: polling is the stable transport on Vercel serverless. A running
		// drill polls every second, so the virtual clock is visible as it ticks.
		// Test mode parks that clock behind the Advance tick control, so here the
		// fast poll would only add queue pressure while a suite drives many
		// browsers at once; every mutation above still refetches in place.
		refetchInterval: (current) => {
			if (initial.testMode) return 5000;
			const latest = current.state.data;
			return latest?.ok && latest.data.state === "RUNNING" ? 1000 : 2000;
		},
		refetchIntervalInBackground: false,
	});

	const drill = query.data.ok ? query.data.data : initial;
	const timeline = timelineLines(drill, t);
	const isCommander = user?.role === "commander";
	const isRunning = drill.state === "RUNNING";
	const isPaused = drill.state === "PAUSED";
	const canAct = isCommander && isRunning;
	const motionOff = search.motion === "off";

	const shareUrl =
		share && typeof window !== "undefined"
			? `${window.location.origin}/report/${share.token}`
			: null;

	async function run(
		label: string,
		task: () => Promise<ServerResult<unknown>>,
	) {
		if (pending) return;
		setPending(label);
		setError(null);
		try {
			const result = await task();
			if (!result.ok) {
				setError({
					code: result.code,
					message: result.retryAfterSeconds
						? `${errorMessage(locale, result.code)} (Retry-After: ${result.retryAfterSeconds}s)`
						: errorMessage(locale, result.code),
				});
			}
			await query.refetch();
		} finally {
			setPending(null);
		}
	}

	/**
	 * Actions are answered in place: the operator learns whether the mitigation
	 * was required without waiting for the report, but the required action list
	 * is never revealed.
	 */
	async function act(action: ActionType) {
		if (pending || !canAct) return;
		setPending(action);
		setError(null);
		const repeat = drill.performedActions.includes(action);
		const doneBefore = drill.requiredActions.filter((required) =>
			drill.performedActions.includes(required),
		).length;
		try {
			const result = await performActionFn({
				data: { id: drill.id, action, tick: drill.tick },
			});
			if (!result.ok) {
				setError({
					code: result.code,
					message: errorMessage(locale, result.code),
				});
				return;
			}
			setFeedback({
				action,
				correct: result.data.correct,
				repeat,
				done: result.data.requiredActionsSatisfied
					? drill.requiredActions.length
					: doneBefore + (result.data.correct ? 1 : 0),
				total: drill.requiredActions.length,
				resolved: result.data.requiredActionsSatisfied,
			});
			await query.refetch();
		} finally {
			setPending(null);
		}
	}

	async function createShare() {
		setPending("share");
		setError(null);
		try {
			const result = await createShareLinkFn({ data: { drillId: drill.id } });
			if (result.ok) setShare(result.data);
			else
				setError({
					code: result.code,
					message: errorMessage(locale, result.code),
				});
		} finally {
			setPending(null);
		}
	}

	const deliveries = drill.log.filter((entry) => entry.kind === "delivery");

	return (
		<div className="space-y-6" data-testid="drill-detail">
			<nav
				aria-label="Breadcrumb"
				className="mb-1 flex flex-wrap gap-4 text-sm text-ink-2"
			>
				<Link
					to="/app"
					search={true}
					data-testid="back-to-dashboard"
					className="link-underline hover:text-ink"
				>
					<span aria-hidden="true">← </span>
					{t("dash.backToDash")}
				</Link>
				<Link
					to="/app/scenarios/$scenarioId"
					params={{ scenarioId: drill.scenarioId }}
					data-testid="back-to-scenario"
					className="link-underline hover:text-ink"
				>
					<span aria-hidden="true">← </span>
					{t("dash.backToScenario")}
				</Link>
			</nav>

			<PageHeader
				title={drill.scenarioName}
				eyebrow={t("drill.console")}
				subtitle={t("common.tickOf", {
					tick: String(drill.tick),
					total: String(drill.maxTicks),
				})}
				actions={
					<>
						<Badge tone={stateTone(drill.state)} testId="drill-state">
							{drill.state}
						</Badge>
						{drill.curated ? (
							<Badge tone="amber">{t("common.curated")}</Badge>
						) : null}
						<Badge tone={query.isError ? "red" : "green"} testId="drill-live">
							{query.isError ? t("drill.reconnecting") : t("drill.live")}
						</Badge>
						{motionOff ? (
							<Badge tone="neutral" testId="motion-off">
								{t("drill.motionOff")}
							</Badge>
						) : null}
					</>
				}
			/>

			{error ? <ErrorNotice code={error.code} message={error.message} /> : null}

			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<p className="text-xs uppercase tracking-wider text-ink-3">
						{t("drill.tick")}
					</p>
					<p
						className="mt-1 text-3xl font-semibold text-amber"
						data-testid="drill-tick"
					>
						{drill.tick}
					</p>
					<p className="mt-1 text-xs text-ink-3">
						{t("common.tickOf", {
							tick: String(drill.tick),
							total: String(drill.maxTicks),
						})}
					</p>
				</Card>
				<Card>
					<p className="text-xs uppercase tracking-wider text-ink-3">
						{t("common.mtta")}
					</p>
					<p
						className="mt-1 text-3xl font-semibold text-ink"
						data-testid="drill-mtta"
					>
						{drill.firstActionTick ?? "—"}
					</p>
					<p className="mt-1 text-xs text-ink-3">
						{t("drill.wrongActions")}: {drill.wrongActions}
					</p>
				</Card>
				<Card>
					<p className="text-xs uppercase tracking-wider text-ink-3">
						{t("common.score")}
					</p>
					<p
						className="mt-1 text-3xl font-semibold text-ink"
						data-testid="drill-score"
					>
						{drill.score?.total ?? "—"}
					</p>
					<p className="mt-1 text-xs text-ink-3">
						{t("common.grade")}: {drill.score?.grade ?? "—"}
					</p>
				</Card>
			</div>

			<Card>
				<h2 className="text-sm font-semibold text-ink">
					{t("common.metrics")}
				</h2>
				<dl className="mt-2 grid gap-x-8 sm:grid-cols-3">
					<DataRow
						label={t("drill.metric.errorRate")}
						value={
							<span data-testid="metric-error-rate">
								{drill.metrics.errorRate}
							</span>
						}
					/>
					<DataRow
						label={t("drill.metric.latency")}
						value={
							<span data-testid="metric-latency">
								{drill.metrics.latencyMs}
							</span>
						}
					/>
					<DataRow
						label={t("drill.metric.queueDepth")}
						value={
							<span data-testid="metric-queue-depth">
								{drill.metrics.queueDepth}
							</span>
						}
					/>
				</dl>
				{drill.metrics.breached ? (
					<p className="mt-2 text-xs text-amber" data-testid="metric-breach">
						SLA breach window active
					</p>
				) : null}
			</Card>

			<div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
				<Card>
					<h2 className="text-sm font-semibold text-ink">
						{t("drill.controls")}
					</h2>
					<div className="mt-3 flex flex-wrap gap-2">
						<Button
							tone="secondary"
							disabled={!isCommander || !isRunning || pending !== null}
							onClick={() =>
								void run("pause", () =>
									pauseDrillFn({ data: { id: drill.id } }),
								)
							}
							data-testid="pause-drill"
						>
							{t("drill.pause")}
						</Button>
						<Button
							tone="secondary"
							disabled={!isCommander || !isPaused || pending !== null}
							onClick={() =>
								void run("resume", () =>
									resumeDrillFn({ data: { id: drill.id } }),
								)
							}
							data-testid="resume-drill"
						>
							{t("drill.resume")}
						</Button>
						{drill.testMode ? (
							<Button
								tone="secondary"
								disabled={!isCommander || !isRunning || pending !== null}
								onClick={() =>
									void run("advance", () =>
										advanceTickFn({ data: { id: drill.id } }),
									)
								}
								data-testid="advance-tick"
							>
								{t("drill.advance")}
							</Button>
						) : null}
						<Button
							tone="danger"
							disabled={
								!isCommander || (!isRunning && !isPaused) || pending !== null
							}
							onClick={() =>
								void run("reset", () =>
									resetDrillFn({ data: { id: drill.id } }),
								)
							}
							data-testid="reset-drill"
						>
							{t("drill.reset")}
						</Button>
					</div>

					<h3 className="mt-5 text-sm font-semibold text-ink">
						{t("drill.actionsTitle")}
					</h3>
					<p className="mt-1 text-xs text-ink-3">{t("drill.actionsHint")}</p>
					<div className="mt-3 flex flex-wrap gap-2">
						{ACTION_TYPES.map((action: ActionType) => {
							const done = drill.performedActions.includes(action);
							return (
								<Button
									key={action}
									tone={done ? "ghost" : "secondary"}
									disabled={!canAct || pending !== null}
									onClick={() => void act(action)}
									data-testid={`action-${action}`}
								>
									{t(`drill.action.${action}`)}
								</Button>
							);
						})}
					</div>

					{feedback ? (
						<output
							data-testid="action-feedback"
							className={`mt-4 rounded border px-3 py-2 text-xs ${
								feedback.correct
									? "border-teal/45 bg-teal/10 text-teal"
									: "border-amber/45 bg-amber/10 text-amber"
							}`}
						>
							<p className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-70">
								{t("drill.feedbackTitle")}
							</p>
							<p className="mt-1" data-testid="action-feedback-text">
								{feedback.correct
									? t("drill.feedbackCorrect", {
											action: t(`drill.action.${feedback.action}`),
										})
									: feedback.repeat
										? t("drill.feedbackRepeat", {
												action: t(`drill.action.${feedback.action}`),
											})
										: t("drill.feedbackWrong", {
												action: t(`drill.action.${feedback.action}`),
											})}
							</p>
							<p
								className="mt-1 font-mono text-[11px] text-ink-3"
								data-testid="action-feedback-progress"
							>
								{t("drill.feedbackProgress", {
									done: feedback.done,
									total: feedback.total,
								})}
								{feedback.resolved ? ` ${t("drill.feedbackResolved")}` : ""}
							</p>
						</output>
					) : null}

					<dl className="mt-5">
						<DataRow
							label={t("drill.requiredActions")}
							value={
								<span data-testid="required-actions">
									{drill.requiredActions
										.map((action) => t(`drill.action.${action}`))
										.join(", ") || t("common.none")}
								</span>
							}
						/>
						<DataRow
							label={t("drill.startedAt")}
							value={formatDateTime(drill.startedAt, locale)}
						/>
						<DataRow
							label={t("drill.endedAt")}
							value={formatDateTime(drill.endedAt, locale)}
						/>
					</dl>

					{isCommander ? (
						<div className="mt-4 space-y-2">
							<Button
								tone="secondary"
								onClick={() => void createShare()}
								disabled={pending !== null}
								data-testid="share-link-button"
								className="w-full"
							>
								{t("report.sharedLink")}
							</Button>
							{shareUrl ? (
								<p className="break-all rounded border border-line bg-graphite-950 p-2 font-mono text-xs text-amber">
									<a href={shareUrl} data-testid="share-link-value">
										{shareUrl}
									</a>
								</p>
							) : null}
							{share ? (
								<p
									className="text-[11px] text-ink-3"
									data-testid="share-link-expiry"
								>
									{t("report.shareExpiry", {
										date: formatDateTime(share.expiresAt, locale),
									})}
								</p>
							) : null}
							{drill.state === "EVALUATED" && share ? (
								<Link
									to="/report/$token"
									params={{ token: share.token }}
									data-testid="open-report"
									className="inline-block text-xs text-amber underline"
								>
									{t("report.title")}
								</Link>
							) : null}
						</div>
					) : null}
				</Card>

				<Card>
					<h2 className="text-sm font-semibold text-ink">
						{t("drill.logTitle")}
					</h2>
					{deliveries.length === 0 ? (
						<EmptyState testId="empty-deliveries" title={t("drill.logEmpty")} />
					) : (
						<table
							className="mt-3 w-full text-left text-sm"
							data-testid="drill-deliveries"
						>
							<thead>
								<tr className="border-b border-line text-xs uppercase tracking-wider text-ink-3">
									<th scope="col" className="py-2 font-medium">
										tick
									</th>
									<th scope="col" className="py-2 font-medium">
										seq
									</th>
									<th scope="col" className="py-2 font-medium">
										{t("common.status")}
									</th>
								</tr>
							</thead>
							<tbody>
								{deliveries.map((entry) => (
									<tr
										key={`${entry.tick}-${entry.seq}-${entry.attempt}-${entry.status}`}
										className="border-b border-line/70"
									>
										<td className="py-2 font-mono text-xs">{entry.tick}</td>
										<td className="py-2 font-mono text-xs">{entry.seq}</td>
										<td className="py-2 text-xs">
											{entry.status}
											{entry.released.length > 1
												? ` · released ${entry.released.join(",")}`
												: ""}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</Card>
			</div>

			<Card>
				<h2 className="text-sm font-semibold text-ink">
					{t("drill.timeline")}
				</h2>
				{timeline.length === 0 ? (
					<div className="mt-3">
						<EmptyState
							testId="empty-events"
							title={t("drill.emptyEvents")}
							hint={t("drill.emptyEventsHint")}
						/>
					</div>
				) : (
					<ol className="mt-3 space-y-1.5" data-testid="drill-events">
						{timeline.map((line) => (
							<li
								key={line.key}
								className="grid grid-cols-[2.5rem_1fr] gap-3 rounded border border-line bg-graphite-950/60 px-3 py-1.5 text-xs"
							>
								<span className="font-mono text-amber">{line.tick}</span>
								<span className={`font-mono ${line.tone}`}>{line.text}</span>
							</li>
						))}
					</ol>
				)}
			</Card>
		</div>
	);
}
