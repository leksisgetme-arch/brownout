import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Card, ErrorNotice } from "#/components/ui";
import { gradeFor } from "#/engine";
import { errorMessage } from "#/lib/i18n/messages";
import { useI18n } from "#/lib/i18n/use-i18n";
import {
	type RunSummary,
	readinessSummary,
	recommendNext,
	type ScenarioRef,
} from "#/lib/readiness";
import { startDrillFn } from "#/server/drills/functions";

interface ActiveDrill {
	id: string;
	scenarioName: string;
	state: string;
	tick: number;
}

/**
 * The dashboard's spine: one readiness number, its trend, and the single next
 * action. Everything here is derived from the same drill list the page already
 * loaded, so there is no extra request and no second source of truth.
 */
export function TodayPanel({
	runs,
	scenarios,
	activeDrill,
	isCommander,
}: {
	runs: readonly RunSummary[];
	scenarios: readonly ScenarioRef[];
	activeDrill: ActiveDrill | null;
	isCommander: boolean;
}) {
	const { t, locale } = useI18n();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const readiness = readinessSummary(runs);
	const choice = recommendNext(scenarios, runs);
	const grade = readiness.average === null ? null : gradeFor(readiness.average);

	async function start() {
		if (!choice || pending) return;
		setPending(true);
		setError(null);
		try {
			const result = await startDrillFn({
				data: { scenarioId: choice.scenarioId },
			});
			if (!result.ok) {
				setError(result.code);
				return;
			}
			await router.navigate({
				to: "/app/drills/$drillId",
				params: { drillId: result.data.drillId },
				search: { motion: undefined },
			});
			// The dashboard's loader already refetched; this keeps a cached list
			// from showing the drill as still open if the user comes back.
			void queryClient.invalidateQueries({ queryKey: ["drills"] });
		} finally {
			setPending(false);
		}
	}

	const deltaTone =
		readiness.delta === null || readiness.delta === 0
			? "text-ink-3"
			: readiness.delta > 0
				? "text-teal"
				: "text-amber";

	return (
		<section
			className="grid gap-4 lg:grid-cols-[1.15fr_1fr]"
			data-testid="today-panel"
		>
			<Card className="flex flex-col justify-between">
				<div>
					<p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
						{t("today.eyebrow")}
					</p>
					<div className="mt-1 flex flex-wrap items-baseline gap-3">
						<p
							className="font-mono text-5xl font-semibold text-ink"
							data-testid="readiness-score"
						>
							{readiness.average ?? "—"}
						</p>
						{grade ? (
							<Badge
								tone={
									grade === "A" || grade === "B"
										? "green"
										: grade === "C"
											? "amber"
											: "red"
								}
								testId="readiness-grade"
							>
								{grade}
							</Badge>
						) : null}
						{readiness.delta !== null ? (
							<span
								className={`font-mono text-xs ${deltaTone}`}
								data-testid="readiness-delta"
							>
								{readiness.delta > 0
									? t("today.deltaUp", { delta: readiness.delta })
									: readiness.delta < 0
										? t("today.deltaDown", { delta: readiness.delta })
										: t("today.deltaFlat")}
							</span>
						) : null}
					</div>
					<p className="mt-1 text-xs text-ink-3">
						{readiness.gradedCount === 0
							? t("today.noScoreHint")
							: t("today.subtitle")}
					</p>

					{readiness.trend.length > 0 ? (
						<div className="mt-5">
							<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
								{t("today.trend")}
							</p>
							<div
								className="mt-2 flex h-16 items-end gap-1.5"
								data-testid="readiness-trend"
							>
								{readiness.trend.map((run, index) => (
									<div
										key={run.id}
										data-testid={`trend-bar-${index}`}
										title={t("today.bar", {
											index: index + 1,
											score: run.score,
										})}
										aria-label={t("today.bar", {
											index: index + 1,
											score: run.score,
										})}
										role="img"
										className={`w-full rounded-sm ${
											index === readiness.trend.length - 1
												? run.score >= 75
													? "bg-teal"
													: "bg-amber"
												: "bg-graphite-700"
										}`}
										style={{ height: `${Math.max(6, run.score)}%` }}
									/>
								))}
							</div>
						</div>
					) : null}
				</div>

				<p className="mt-4 border-t border-line pt-3 font-mono text-[11px] text-ink-3">
					{t("today.graded", { count: readiness.gradedCount })}
				</p>
			</Card>

			<Card className="flex flex-col">
				<p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
					{t("today.next")}
				</p>

				{activeDrill ? (
					<div data-testid="next-active">
						<h2 className="mt-1 text-lg font-medium text-ink">
							{activeDrill.scenarioName}
						</h2>
						<p className="mt-1 font-mono text-xs text-ink-3">
							{activeDrill.state} · tick {activeDrill.tick}
						</p>
						<Link
							to="/app/drills/$drillId"
							params={{ drillId: activeDrill.id }}
							search={{ motion: undefined }}
							className="press mt-4 inline-flex w-full items-center justify-center rounded border border-amber/60 bg-amber/10 px-3 py-2 text-sm text-amber hover:bg-amber/15"
							data-testid="today-open-drill"
						>
							{t("dash.openDrill")}
						</Link>
					</div>
				) : choice ? (
					<div data-testid="next-scenario">
						<h2 className="mt-1 text-lg font-medium text-ink">{choice.name}</h2>
						<p className="mt-1 text-xs text-ink-3">
							{choice.reason === "new"
								? t("today.reasonNew")
								: t("today.reasonWeakest", {
										score: choice.lastScore ?? "—",
									})}
						</p>

						{isCommander ? (
							<Button
								onClick={() => void start()}
								disabled={pending}
								className="mt-4 w-full"
								data-testid="today-start"
							>
								{pending ? t("today.starting") : t("today.start")}
							</Button>
						) : (
							<>
								<Link
									to="/app/scenarios/$scenarioId"
									params={{ scenarioId: choice.scenarioId }}
									className="press mt-4 inline-flex w-full items-center justify-center rounded border border-line-strong px-3 py-2 text-sm text-ink hover:bg-graphite-800"
								>
									{t("common.open")}
								</Link>
								<p className="mt-2 text-[11px] text-ink-3">
									{t("today.observer")}
								</p>
							</>
						)}
					</div>
				) : (
					<div data-testid="next-none">
						<h2 className="mt-1 text-lg font-medium text-ink">
							{t("today.none")}
						</h2>
						<p className="mt-1 text-xs text-ink-3">{t("today.noneHint")}</p>
					</div>
				)}

				{error ? (
					<div className="mt-3">
						<ErrorNotice
							code={error}
							message={errorMessage(locale, error)}
							testId="today-error"
						/>
					</div>
				) : null}
			</Card>
		</section>
	);
}
