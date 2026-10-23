import { createFileRoute } from "@tanstack/react-router";
import { Badge, Card, PageHeader } from "#/components/ui";
import {
	BUILTIN_SCENARIOS,
	type DrillAction,
	type RunLogEntry,
	runScenario,
} from "#/engine";
import { REQUIREMENT_COVERAGE } from "#/lib/coverage";
import { ERROR_STATUS, type ErrorCode } from "#/lib/errors";
import { errorMessage, type MessageKey } from "#/lib/i18n/messages";
import { useI18n } from "#/lib/i18n/use-i18n";

export const Route = createFileRoute("/rulebook")({ component: RulebookPage });

const FR_KEYS: MessageKey[] = [
	"rulebook.fr.1",
	"rulebook.fr.2",
	"rulebook.fr.3",
	"rulebook.fr.4",
	"rulebook.fr.5",
	"rulebook.fr.6",
	"rulebook.fr.7",
	"rulebook.fr.8",
];

/**
 * A real run of the curated token scenario, so the walkthrough can never drift
 * from the engine: every number below is produced by runScenario itself.
 */
const WALK_NAME = "Expired deploy token";
const SLOW_ACTIONS: DrillAction[] = [
	{ tick: 30, type: "rotate_token" },
	{ tick: 32, type: "restart_worker" },
];
const FAST_ACTIONS: DrillAction[] = [
	{ tick: 5, type: "rotate_token" },
	{ tick: 6, type: "restart_worker" },
];

function buildWalkthrough() {
	const scenario =
		BUILTIN_SCENARIOS.find((entry) => entry.name === WALK_NAME) ??
		BUILTIN_SCENARIOS[0];
	if (!scenario) throw new Error("E-INPUT-400 No built-in scenarios");
	return {
		scenario,
		slow: runScenario({
			definition: scenario.definition,
			actions: SLOW_ACTIONS,
		}),
		fast: runScenario({
			definition: scenario.definition,
			actions: FAST_ACTIONS,
		}),
	};
}

const WALKTHROUGH = buildWalkthrough();

function logKey(entry: RunLogEntry): string {
	if (entry.kind === "delivery") {
		return `delivery-${entry.tick}-${entry.seq}-${entry.attempt}-${entry.status}`;
	}
	if (entry.kind === "action") return `action-${entry.tick}-${entry.action}`;
	if (entry.kind === "state") return `state-${entry.tick}-${entry.to}`;
	return `metrics-${entry.tick}`;
}

function logLine(
	entry: RunLogEntry,
	t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string | null {
	if (entry.kind === "delivery") {
		return t("rulebook.walk.delivery", {
			seq: entry.seq,
			status: entry.status,
			failure: entry.failure ? ` (${entry.failure})` : "",
		});
	}
	if (entry.kind === "action") {
		return t("rulebook.walk.actionLine", {
			action: entry.action,
			verdict: entry.correct
				? t("rulebook.walk.correct")
				: t("rulebook.walk.incorrect"),
		});
	}
	if (entry.kind === "state") {
		return t("rulebook.walk.stateLine", { from: entry.from, to: entry.to });
	}
	return null;
}

function RulebookPage() {
	const { t, locale } = useI18n();
	const codes = Object.keys(ERROR_STATUS) as ErrorCode[];

	return (
		<div className="space-y-8">
			<PageHeader
				title={t("rulebook.title")}
				subtitle={t("rulebook.subtitle")}
			/>

			<Card>
				<h2 className="text-lg font-semibold text-ink">
					{t("rulebook.functional")}
				</h2>
				<ol className="mt-4 space-y-2" data-testid="rulebook-fr-list">
					{FR_KEYS.map((key, index) => (
						<li key={key} className="flex gap-3 text-sm text-ink-2">
							<span className="font-mono text-xs text-amber">{index + 1}.</span>
							<span>{t(key)}</span>
						</li>
					))}
				</ol>
			</Card>

			<Card>
				<h2 className="text-lg font-semibold text-ink">
					{t("rulebook.states")}
				</h2>
				<p className="mt-2 text-sm text-ink-3">{t("rulebook.statesBody")}</p>
				<div className="mt-4 flex flex-wrap gap-2">
					{[
						"DRAFT",
						"READY",
						"RUNNING",
						"PAUSED",
						"RESOLVED",
						"FAILED",
						"EVALUATED",
					].map((state) => (
						<Badge key={state} tone="blue">
							{state}
						</Badge>
					))}
				</div>
			</Card>

			<Card>
				<h2 className="text-lg font-semibold text-ink">
					{t("rulebook.walkthroughTitle")}
				</h2>
				<p className="mt-2 max-w-3xl text-sm text-ink-3">
					{t("rulebook.walkthroughBody")}
				</p>

				<div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-3">
					<Badge tone="neutral">
						{t("rulebook.walk.scenario")}: {WALKTHROUGH.scenario.name}
					</Badge>
					<Badge tone="neutral">
						seed {WALKTHROUGH.scenario.definition.seed}
					</Badge>
					<Badge tone="neutral">
						{WALKTHROUGH.scenario.definition.maxTicks} ticks
					</Badge>
				</div>

				<div className="mt-5 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
					<div>
						<h3 className="data-label">{t("rulebook.walk.log")}</h3>
						<ol
							className="mt-3 space-y-1.5"
							data-testid="rulebook-walkthrough-log"
						>
							{WALKTHROUGH.slow.log
								.filter(
									(entry) =>
										entry.kind === "state" ||
										entry.kind === "delivery" ||
										entry.kind === "action",
								)
								.map((entry) => {
									const text = logLine(entry, t);
									if (!text) return null;
									const tone =
										entry.kind === "delivery" &&
										(entry.status === "dead_letter" ||
											entry.status === "failed")
											? "text-amber"
											: entry.kind === "action" && entry.correct
												? "text-teal"
												: "text-ink-2";
									return (
										<li
											key={logKey(entry)}
											className="grid grid-cols-[3rem_1fr] gap-3 rounded border border-line/70 bg-graphite-950/50 px-3 py-1.5 text-xs"
										>
											<span className="font-mono text-amber">
												t{entry.tick}
											</span>
											<span className={`font-mono ${tone}`}>{text}</span>
										</li>
									);
								})}
						</ol>
					</div>

					<div className="space-y-4">
						<div>
							<h3 className="data-label">{t("rulebook.walk.scoreTitle")}</h3>
							<dl
								className="mt-3 space-y-1.5 text-sm"
								data-testid="rulebook-walkthrough-score"
							>
								{[
									{
										label: t("rulebook.walk.base"),
										value: WALKTHROUGH.slow.score.base,
									},
									{
										label: t("rulebook.walk.mtta", {
											tick: WALKTHROUGH.slow.score.mttaTicks,
										}),
										value: -WALKTHROUGH.slow.score.mttaPenalty,
									},
									{
										label: t("rulebook.walk.wrong"),
										value: -WALKTHROUGH.slow.score.wrongActionPenalty,
									},
									{
										label: t("rulebook.walk.sla"),
										value: -WALKTHROUGH.slow.score.slaPenalty,
									},
									{
										label: t("rulebook.walk.hints"),
										value: -WALKTHROUGH.slow.score.hintPenalty,
									},
								].map((row) => (
									<div
										key={row.label}
										className="flex items-baseline justify-between gap-4 border-b border-line py-1 last:border-0"
									>
										<dt className="text-ink-3">{row.label}</dt>
										<dd className="font-mono text-ink">
											{row.value > 0 ? `+${row.value}` : row.value}
										</dd>
									</div>
								))}
								<div className="flex items-baseline justify-between gap-4 pt-1">
									<dt className="text-ink">{t("rulebook.walk.total")}</dt>
									<dd
										className="font-mono text-amber"
										data-testid="rulebook-walkthrough-total"
									>
										{WALKTHROUGH.slow.score.total} ({t("rulebook.walk.grade")}{" "}
										{WALKTHROUGH.slow.score.grade})
									</dd>
								</div>
							</dl>
						</div>

						<div className="rounded border border-teal/40 bg-teal/10 px-3 py-2">
							<h3 className="text-xs font-semibold uppercase tracking-wider text-teal">
								{t("rulebook.walk.fastTitle")}
							</h3>
							<p
								className="mt-1 text-sm text-ink-2"
								data-testid="rulebook-walkthrough-fast"
							>
								{t("rulebook.walk.fastBody", {
									total: WALKTHROUGH.fast.score.total,
									grade: WALKTHROUGH.fast.score.grade,
									slowTotal: WALKTHROUGH.slow.score.total,
									slowGrade: WALKTHROUGH.slow.score.grade,
								})}
							</p>
						</div>

						<p className="text-xs text-ink-3">{t("rulebook.walk.note")}</p>
					</div>
				</div>
			</Card>

			<Card>
				<h2 className="text-lg font-semibold text-ink">
					{t("rulebook.coverageTitle")}
				</h2>
				<p className="mt-2 text-sm text-ink-3">{t("rulebook.coverageBody")}</p>
				<div className="mt-4 overflow-x-auto">
					<table
						className="w-full text-left text-sm"
						data-testid="rulebook-coverage-table"
					>
						<thead>
							<tr className="border-b border-line text-xs uppercase tracking-wider text-ink-3">
								<th scope="col" className="py-2 pr-4 font-medium">
									{t("rulebook.requirementId")}
								</th>
								<th scope="col" className="py-2 pr-4 font-medium">
									{t("rulebook.meaning")}
								</th>
								<th scope="col" className="py-2 font-medium">
									{t("rulebook.testFile")}
								</th>
							</tr>
						</thead>
						<tbody>
							{REQUIREMENT_COVERAGE.map((entry) => (
								<tr
									key={entry.id}
									className="border-b border-line/70"
									data-testid={`coverage-${entry.id}`}
								>
									<td className="py-2 pr-4 font-mono text-xs text-amber">
										{entry.id}
									</td>
									<td className="py-2 pr-4 text-ink-2">{entry.summary}</td>
									<td className="py-2 font-mono text-xs text-ink-3">
										{entry.testFile}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Card>

			<Card>
				<h2 className="text-lg font-semibold text-ink">
					{t("rulebook.errors")}
				</h2>
				<div className="mt-4 overflow-x-auto">
					<table
						className="w-full text-left text-sm"
						data-testid="rulebook-error-table"
					>
						<thead>
							<tr className="border-b border-line text-xs uppercase tracking-wider text-ink-3">
								<th scope="col" className="py-2 pr-4 font-medium">
									{t("rulebook.code")}
								</th>
								<th scope="col" className="py-2 pr-4 font-medium">
									{t("rulebook.meaning")}
								</th>
								<th scope="col" className="py-2 font-medium">
									{t("rulebook.http")}
								</th>
							</tr>
						</thead>
						<tbody>
							{codes.map((code) => (
								<tr
									key={code}
									className="border-b border-line/70"
									data-testid={`error-row-${code}`}
								>
									<td className="py-2 pr-4 font-mono text-xs text-amber">
										{code}
									</td>
									<td className="py-2 pr-4 text-ink-2">
										{errorMessage(locale, code)}
									</td>
									<td className="py-2 font-mono text-xs text-ink-3">
										{ERROR_STATUS[code]}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Card>
		</div>
	);
}
