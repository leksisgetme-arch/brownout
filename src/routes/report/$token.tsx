import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Card, DataRow, EmptyState, PageHeader } from "#/components/ui";
import type { RunLogEntry, ScoreBreakdown } from "#/engine";
import { useAppContext } from "#/lib/app-context";
import { formatDateTime } from "#/lib/format";
import { useI18n } from "#/lib/i18n/use-i18n";
import { buildFixList, type FixItem } from "#/lib/readiness";
import { getReportFn } from "#/server/drills/functions";

export const Route = createFileRoute("/report/$token")({
	loader: async ({ params }) => {
		return getReportFn({ data: { token: params.token } });
	},
	component: ReportPage,
});

function ReportPage() {
	const { t, locale } = useI18n();
	const { user } = useAppContext();
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
	// The engine floors the total at 0. When the penalties exceed the base, the
	// rows cannot add up to the printed total; say so instead of leaving the
	// reader with arithmetic that looks broken.
	const penaltySum = breakdown
		? breakdown.mttaPenalty +
			breakdown.wrongActionPenalty +
			breakdown.slaPenalty +
			breakdown.hintPenalty
		: 0;
	const totalIsFloored = breakdown
		? breakdown.base - penaltySum < 0 && breakdown.total === 0
		: false;
	const mttr = drill.mttrTicks;
	const isCommander = user?.role === "commander";
	const neverActed = drill.firstActionTick === null;
	const fixes = buildFixList({
		requiredActions: drill.requiredActions,
		performedActions: drill.performedActions,
		wrongActions: drill.wrongActions,
		breakdown,
	});
	const fixText = (fix: FixItem): string => {
		switch (fix.id) {
			case "missed":
				return t("report.fixMissed", {
					action: t(`drill.action.${fix.action}`),
				});
			case "wrong":
				return t("report.fixWrong", { count: fix.count });
			case "mtta":
				return neverActed
					? t("report.fixNoAction")
					: t("report.fixMtta", { ticks: fix.ticks });
			case "sla":
				return t("report.fixSla", { windows: fix.windows });
			default:
				return t("report.fixClean");
		}
	};

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
									<span data-testid={`breakdown-${row.key}`}>
										{row.value === 0 ? "0" : `−${row.value}`}
									</span>
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
					{totalIsFloored ? (
						<p
							className="mt-2 text-xs text-ink-3"
							data-testid="report-score-floor-note"
						>
							{t("report.scoreFloor")}
						</p>
					) : null}

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
					{mttr === null && drill.state === "EVALUATED" ? (
						<p
							className="mt-2 text-xs text-ink-3"
							data-testid="report-mttr-unresolved"
						>
							{t("report.mttrUnresolved")}
						</p>
					) : null}
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

			<div data-testid="report-fix-list">
				<Card>
					<h2 className="text-sm font-semibold text-ink">
						{t("report.fixTitle")}
					</h2>
					<p className="mt-1 text-xs text-ink-3">{t("report.subtitle")}</p>
					{breakdown ? (
						<ul className="mt-3 space-y-2" data-testid="report-fix-items">
							{fixes.map((fix) => (
								<li
									key={fix.id === "missed" ? `missed-${fix.action}` : fix.id}
									data-testid={`report-fix-${fix.id}${
										fix.id === "missed" ? `-${fix.action}` : ""
									}`}
									className="flex gap-2 text-sm text-ink-2"
								>
									<span aria-hidden="true" className="font-mono text-amber">
										→
									</span>
									<span>{fixText(fix)}</span>
								</li>
							))}
						</ul>
					) : (
						<p
							className="mt-3 text-sm text-ink-3"
							data-testid="report-not-scored"
						>
							{t("report.notScored")}
						</p>
					)}

					{isCommander ? (
						<div className="mt-4 border-t border-line pt-3">
							<Link
								to="/app/scenarios/$scenarioId"
								params={{ scenarioId: drill.scenarioId }}
								data-testid="report-rerun"
								className="press inline-flex items-center gap-2 rounded border border-amber bg-amber px-3 py-2 text-sm font-medium text-graphite-950 hover:bg-[#ffc449]"
							>
								{t("report.rerun")}
							</Link>
							<p className="mt-2 text-[11px] text-ink-3">
								{t("report.rerunHint")}
							</p>
						</div>
					) : null}
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
