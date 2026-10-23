import { createFileRoute } from "@tanstack/react-router";
import { Badge, Card, DataRow, EmptyState, PageHeader } from "#/components/ui";
import type { RunLogEntry, ScoreBreakdown } from "#/engine";
import { formatDateTime } from "#/lib/format";
import { useI18n } from "#/lib/i18n/use-i18n";
import { getReportFn } from "#/server/drills/functions";

export const Route = createFileRoute("/report/$token")({
	loader: async ({ params }) => {
		return getReportFn({ data: { token: params.token } });
	},
	component: ReportPage,
});

function ReportPage() {
	const { t, locale } = useI18n();
	const result = Route.useLoaderData();

	if (!result.ok) {
		return (
			<div className="mx-auto max-w-2xl">
				<EmptyState
					testId="report-not-found"
					title={t("report.notFound")}
					hint={t("report.notFoundBody")}
				/>
			</div>
		);
	}

	const drill = result.data;
	const deadLetters = drill.log.filter(
		(entry): entry is Extract<RunLogEntry, { kind: "delivery" }> =>
			entry.kind === "delivery" && entry.status === "dead_letter",
	);
	const breakdown: ScoreBreakdown | null = drill.score?.breakdown ?? null;
	const mttr = drill.mttrTicks;

	const penaltyRows: Array<{ key: string; label: string; value: number }> =
		breakdown
			? [
					{
						key: "mtta",
						label: t("common.mtta"),
						value: breakdown.mttaPenalty,
					},
					{
						key: "wrong",
						label: t("drill.wrongActions"),
						value: breakdown.wrongActionPenalty,
					},
					{
						key: "sla",
						label: "SLA",
						value: breakdown.slaPenalty,
					},
					{
						key: "hint",
						label: "Hints",
						value: breakdown.hintPenalty,
					},
				]
			: [];

	return (
		<div className="space-y-6" data-testid="report-page">
			<PageHeader
				title={t("report.title")}
				subtitle={`${drill.scenarioName} · ${formatDateTime(drill.startedAt, locale)}`}
				eyebrow={t("common.readOnly")}
				actions={
					<Badge tone="blue" testId="report-readonly">
						{t("report.readOnly")}
					</Badge>
				}
			/>

			<div className="grid gap-4 sm:grid-cols-4">
				<Card>
					<p className="text-xs uppercase tracking-wider text-ink-3">
						{t("report.score")}
					</p>
					<p
						className="mt-1 text-3xl font-semibold text-amber"
						data-testid="report-score"
					>
						{drill.score?.total ?? "—"}
					</p>
				</Card>
				<Card>
					<p className="text-xs uppercase tracking-wider text-ink-3">
						{t("report.grade")}
					</p>
					<p
						className="mt-1 text-3xl font-semibold text-ink"
						data-testid="report-grade"
					>
						{drill.score?.grade ?? "—"}
					</p>
				</Card>
				<Card>
					<p className="text-xs uppercase tracking-wider text-ink-3">
						{t("drill.state")}
					</p>
					<p
						className="mt-1 text-lg font-semibold text-ink"
						data-testid="report-state"
					>
						{drill.state}
					</p>
				</Card>
				<Card>
					<p className="text-xs uppercase tracking-wider text-ink-3">
						{t("common.tick")}
					</p>
					<p
						className="mt-1 text-3xl font-semibold text-ink"
						data-testid="report-tick"
					>
						{drill.tick}
					</p>
				</Card>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<h2 className="text-sm font-semibold text-ink">
						{t("report.breakdown")}
					</h2>
					<dl className="mt-2" data-testid="report-breakdown">
						<DataRow
							label="Base"
							value={
								<span data-testid="breakdown-base">
									{breakdown?.base ?? "—"}
								</span>
							}
						/>
						{penaltyRows.map((row) => (
							<DataRow
								key={row.key}
								label={row.label}
								value={
									<span data-testid={`breakdown-${row.key}`}>−{row.value}</span>
								}
							/>
						))}
						<DataRow
							label={t("report.score")}
							value={
								<span data-testid="breakdown-total">
									{breakdown?.total ?? "—"}
								</span>
							}
						/>
					</dl>

					<dl className="mt-4">
						<DataRow
							label={t("report.mtta")}
							value={
								<span data-testid="report-mtta">
									{drill.score?.breakdown?.mttaTicks ?? "—"}
								</span>
							}
						/>
						<DataRow
							label={t("report.mttr")}
							value={<span data-testid="report-mttr">{mttr ?? "—"}</span>}
						/>
					</dl>
				</Card>

				<Card>
					<h2 className="text-sm font-semibold text-ink">
						{t("report.deadLetters")}
					</h2>
					{deadLetters.length === 0 ? (
						<p
							className="mt-2 text-sm text-ink-3"
							data-testid="report-empty-dead-letters"
						>
							{t("report.emptyDeadLetters")}
						</p>
					) : (
						<ul className="mt-2 space-y-1" data-testid="report-dead-letters">
							{deadLetters.map((entry) => (
								<li
									key={`${entry.seq}-${entry.tick}`}
									className="font-mono text-xs text-amber"
								>
									seq {entry.seq} · attempt {entry.attempt} · tick {entry.tick}
								</li>
							))}
						</ul>
					)}

					<h2 className="mt-6 text-sm font-semibold text-ink">
						{t("report.actionsTitle")}
					</h2>
					{drill.actions.length === 0 ? (
						<p
							className="mt-2 text-sm text-ink-3"
							data-testid="report-empty-actions"
						>
							{t("report.noActions")}
						</p>
					) : (
						<ul className="mt-2 space-y-1" data-testid="report-actions">
							{drill.actions.map((action) => (
								<li key={action.id} className="flex items-center gap-3 text-sm">
									<span className="font-mono text-xs text-amber">
										t{action.tick}
									</span>
									<span className="text-ink">
										{t(`drill.action.${action.type}`)}
									</span>
									<Badge tone={action.correct ? "green" : "red"}>
										{action.correct ? t("drill.correct") : t("drill.wrong")}
									</Badge>
								</li>
							))}
						</ul>
					)}
				</Card>
			</div>

			<Card>
				<h2 className="text-sm font-semibold text-ink">
					{t("report.timeline")}
				</h2>
				{drill.log.length === 0 ? (
					<p
						className="mt-2 text-sm text-ink-3"
						data-testid="report-empty-timeline"
					>
						{t("report.emptyTimeline")}
					</p>
				) : (
					<ol className="mt-3 space-y-2" data-testid="report-timeline">
						{drill.log.map((entry) => (
							<li
								key={`${entry.kind}-${entry.tick}-${JSON.stringify(entry)}`}
								className="flex gap-3 text-sm text-ink-2"
							>
								<span className="font-mono text-xs text-amber">
									t{entry.tick}
								</span>
								<span>
									{entry.kind === "state"
										? `${entry.from} → ${entry.to}`
										: entry.kind === "delivery"
											? `delivery seq ${entry.seq} ${entry.status}`
											: entry.kind === "action"
												? `action ${entry.action} ${entry.correct ? "correct" : "wrong"}`
												: `metrics errorRate ${entry.errorRate} latency ${entry.latencyMs}ms queue ${entry.queueDepth}`}
								</span>
							</li>
						))}
					</ol>
				)}
			</Card>
		</div>
	);
}
