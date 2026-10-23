import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui";
import { runLogLine } from "#/lib/drill-timeline";
import { formatDateTime } from "#/lib/format";
import { useI18n } from "#/lib/i18n/use-i18n";
import type {
	DrillDetail,
	DrillListItem,
	DrillSeries,
} from "#/server/drills/functions";

type MetricKey = "errorRate" | "latencyMs" | "queueDepth";

const METRICS: {
	key: MetricKey;
	label:
		| "console.metric.errorRate"
		| "console.metric.latency"
		| "console.metric.queue";
	format: (value: number) => string;
	sla: (series: DrillSeries) => string;
	threshold: (series: DrillSeries) => number;
}[] = [
	{
		key: "errorRate",
		label: "console.metric.errorRate",
		format: (value) => `${(value * 100).toFixed(1)}%`,
		sla: (series) => `${(series.thresholds.errorRate * 100).toFixed(1)}%`,
		threshold: (series) => series.thresholds.errorRate,
	},
	{
		key: "latencyMs",
		label: "console.metric.latency",
		format: (value) => `${Math.round(value)} ms`,
		sla: (series) => `${series.thresholds.latencyMs} ms`,
		threshold: (series) => series.thresholds.latencyMs,
	},
	{
		key: "queueDepth",
		label: "console.metric.queue",
		format: (value) => String(Math.round(value)),
		sla: (series) => String(series.thresholds.queueDepth),
		threshold: (series) => series.thresholds.queueDepth,
	},
];

/**
 * One metric's history, drawn straight from the engine's per-tick samples.
 * The dashed line is the SLA threshold the engine itself scores against, so
 * the chart and the score can never disagree.
 */
function Sparkline({
	values,
	threshold,
	breached,
}: {
	values: number[];
	threshold: number;
	breached: boolean;
}) {
	const max = Math.max(threshold * 1.35, ...values, threshold * 0.2, 1);
	const y = (value: number) => 30 - (Math.min(value, max) / max) * 28;
	const x = (index: number) =>
		values.length <= 1 ? 50 : (index / (values.length - 1)) * 100;
	const line = values
		.map((value, index) => `${x(index)},${y(value)}`)
		.join(" ");
	const thresholdY = y(threshold);
	const stroke = breached ? "var(--color-amber)" : "var(--color-teal)";

	return (
		<svg
			viewBox="0 0 100 32"
			preserveAspectRatio="none"
			className="mt-2 h-9 w-full"
			aria-hidden="true"
			data-testid="sparkline"
		>
			{values.length > 1 ? (
				<polygon
					points={`0,32 ${line} 100,32`}
					fill={stroke}
					opacity="0.1"
					stroke="none"
				/>
			) : null}
			<line
				x1="0"
				x2="100"
				y1={thresholdY}
				y2={thresholdY}
				stroke="rgba(255,255,255,0.22)"
				strokeWidth="1"
				strokeDasharray="2 3"
				vectorEffect="non-scaling-stroke"
			/>
			{values.length > 1 ? (
				<polyline
					points={line}
					fill="none"
					stroke={stroke}
					strokeWidth="1.5"
					vectorEffect="non-scaling-stroke"
				/>
			) : (
				<circle cx="50" cy={y(values[0] ?? 0)} r="1.6" fill={stroke} />
			)}
		</svg>
	);
}

/**
 * One line for the whole incident: the worst metric at each tick, expressed as
 * a multiple of its own SLA limit. 1.0x is the threshold, so the dashed line is
 * the contract. Action markers sit on the tick they were taken, which makes the
 * drop after a mitigation visible.
 */
function PressureChart({
	samples,
	maxTicks,
	thresholds,
	actions,
}: {
	samples: DrillSeries["samples"];
	maxTicks: number;
	thresholds: DrillSeries["thresholds"];
	actions: DrillDetail["actions"];
}) {
	if (samples.length === 0) return null;

	const pressures = samples.map((sample) =>
		Math.max(
			sample.errorRate / thresholds.errorRate,
			sample.latencyMs / thresholds.latencyMs,
			sample.queueDepth / thresholds.queueDepth,
		),
	);
	const max = Math.max(1.6, ...pressures.map((value) => value * 1.1));
	const x = (tick: number) => (tick / Math.max(1, maxTicks)) * 100;
	const y = (value: number) => 34 - (Math.min(value, max) / max) * 30;
	const points = pressures
		.map((value, index) => `${x(samples[index].tick)},${y(value)}`)
		.join(" ");
	const over = pressures.some((value) => value > 1);
	const stroke = over ? "var(--color-amber)" : "var(--color-teal)";

	return (
		<svg
			viewBox="0 0 100 40"
			preserveAspectRatio="none"
			className="mt-2 h-28 w-full"
			aria-hidden="true"
			data-testid="console-pressure"
		>
			<polygon
				points={`0,36 ${points} ${x(samples[samples.length - 1].tick)},36`}
				fill={stroke}
				opacity="0.12"
				stroke="none"
			/>
			<line
				x1="0"
				x2="100"
				y1={y(1)}
				y2={y(1)}
				stroke="rgba(255,255,255,0.24)"
				strokeWidth="1"
				strokeDasharray="3 3"
				vectorEffect="non-scaling-stroke"
			/>
			{actions.map((action) => (
				<line
					key={action.id}
					x1={x(action.tick)}
					x2={x(action.tick)}
					y1="4"
					y2="36"
					stroke={action.correct ? "var(--color-teal)" : "var(--color-amber)"}
					strokeWidth="1"
					opacity="0.5"
					vectorEffect="non-scaling-stroke"
				/>
			))}
			<polyline
				points={points}
				fill="none"
				stroke={stroke}
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

/**
 * The dashboard's incident console: live status of the newest running drill,
 * its current metrics against the engine's own SLA thresholds, and the
 * delivery/action feed. Every number here is derived from the deterministic
 * run, never from real time or a random source.
 */
export function IncidentConsole({
	drill,
	series,
	email,
	role,
	isLatest,
}: {
	drill: DrillDetail;
	series: DrillSeries;
	email: string | null;
	role: string | null;
	isLatest: boolean;
}) {
	const { t, locale } = useI18n();
	const current = series.samples[series.samples.length - 1];
	const required = drill.requiredActions.length;
	const done = drill.performedActions.filter((action) =>
		drill.requiredActions.includes(action),
	).length;
	const progress = Math.min(
		100,
		Math.round((drill.tick / Math.max(1, drill.maxTicks)) * 100),
	);
	const breached = current?.breached ?? false;
	const feed = drill.log
		.filter(
			(entry) =>
				entry.kind === "delivery" ||
				entry.kind === "action" ||
				entry.kind === "state",
		)
		.slice(-7)
		.reverse();

	return (
		<section
			data-testid="incident-console"
			className="overflow-hidden rounded-lg border border-line bg-graphite-900/60"
		>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
				<div className="flex flex-wrap items-center gap-3">
					<span
						aria-hidden="true"
						className={`inline-block h-1.5 w-1.5 rounded-full ${
							breached ? "bg-amber" : "bg-teal"
						}`}
					/>
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
						{t("console.eyebrow")}
					</p>
					<Badge tone={breached ? "amber" : "green"} testId="console-sla">
						{breached ? t("console.slaBreached") : t("console.slaClear")}
					</Badge>
					<Badge tone={drill.state === "PAUSED" ? "blue" : "amber"}>
						{drill.state}
					</Badge>
				</div>
				<p className="font-mono text-xs text-ink-3" data-testid="console-tick">
					{t("common.tickOf", {
						tick: String(drill.tick),
						total: String(drill.maxTicks),
					})}
				</p>
			</div>

			<div className="grid gap-6 px-4 py-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
				<div className="min-w-0">
					<Link
						to="/app/drills/$drillId"
						params={{ drillId: drill.id }}
						search={{ motion: undefined }}
						className="text-lg font-medium tracking-tight text-ink underline-offset-4 hover:underline"
						data-testid="console-scenario"
					>
						{drill.scenarioName}
					</Link>
					<p className="mt-1 font-mono text-[11px] text-ink-3">
						{drill.startedAt
							? `${t("console.started")} ${formatDateTime(drill.startedAt, locale)}`
							: null}
						{drill.startedAt ? " · " : null}
						{t("common.seed")} {drill.seed}
					</p>

					<div
						aria-hidden="true"
						className="mt-3 h-1 w-full overflow-hidden rounded bg-graphite-800"
					>
						<div
							data-testid="console-progress"
							className="h-full bg-amber transition-[width] duration-500"
							style={{ width: `${progress}%` }}
						/>
					</div>

					<dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
						<div>
							<dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
								{t("console.mtta")}
							</dt>
							<dd
								className="mt-0.5 font-mono text-sm text-ink"
								data-testid="console-mtta"
							>
								{drill.firstActionTick === null
									? t("console.mttaNone")
									: `tick ${drill.firstActionTick}`}
							</dd>
						</div>
						<div>
							<dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
								{t("console.actionsDone")}
							</dt>
							<dd
								className="mt-0.5 font-mono text-sm text-ink"
								data-testid="console-actions"
							>
								{done}/{required}
							</dd>
						</div>
						<div>
							<dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
								{t("console.wrongActions")}
							</dt>
							<dd className="mt-0.5 font-mono text-sm text-ink">
								{drill.wrongActions}
							</dd>
						</div>
						<div>
							<dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
								{t("console.breachedTicks")}
							</dt>
							<dd
								className={`mt-0.5 font-mono text-sm ${
									series.breachedTicks > 0 ? "text-amber" : "text-teal"
								}`}
								data-testid="console-breached-ticks"
							>
								{series.breachedTicks}
							</dd>
						</div>
					</dl>

					<div className="mt-4 grid gap-3 sm:grid-cols-3">
						{METRICS.map((metric) => {
							const value = current?.[metric.key] ?? 0;
							const threshold = metric.threshold(series);
							const over = value > threshold;
							return (
								<div
									key={metric.key}
									data-testid={`console-metric-${metric.key}`}
									className="rounded-lg border border-line bg-graphite-950/40 p-3"
								>
									<p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
										{t(metric.label)}
									</p>
									<p
										className={`mt-0.5 font-mono text-xl ${
											over ? "text-amber" : "text-ink"
										}`}
										data-testid={`console-metric-${metric.key}-value`}
									>
										{metric.format(value)}
									</p>
									<Sparkline
										values={series.samples.map((sample) => sample[metric.key])}
										threshold={threshold}
										breached={over}
									/>
									<p className="font-mono text-[10px] text-ink-3">
										{t("console.threshold", { value: metric.sla(series) })}
									</p>
								</div>
							);
						})}
					</div>
				</div>

				<div className="flex min-w-0 flex-col gap-4">
					<div>
						<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
							{t("console.feed")}
						</p>
						{feed.length === 0 ? (
							<p className="mt-2 text-xs text-ink-3">
								{t("console.feedEmpty")}
							</p>
						) : (
							<ol
								className="mt-2 max-h-56 space-y-1 overflow-auto"
								data-testid="console-feed"
							>
								{" "}
								{feed.map((entry) => {
									const line = runLogLine(entry, t);
									if (!line) return null;
									return (
										<li
											key={line.key}
											className="grid grid-cols-[2.5rem_1fr] gap-2 rounded border border-line/60 bg-graphite-950/50 px-2 py-1 text-[11px]"
										>
											<span className="font-mono text-amber">{line.tick}</span>
											<span className={`font-mono ${line.tone}`}>
												{line.text}
											</span>
										</li>
									);
								})}
							</ol>
						)}
					</div>

					<div className="rounded-lg border border-line bg-graphite-950/40 p-3">
						<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
							{t("console.onCall")}
						</p>
						<p
							className="mt-1 truncate text-sm text-ink"
							data-testid="console-on-call"
						>
							{email ?? t("common.none")}
						</p>
						<p className="font-mono text-[11px] text-ink-3">
							{role === "commander"
								? t("common.commander")
								: t("common.observer")}
						</p>
						<Link
							to="/app/drills/$drillId"
							params={{ drillId: drill.id }}
							search={{ motion: undefined }}
							data-testid={isLatest ? "last-drill-link" : "console-open-drill"}
							className="press mt-3 inline-flex w-full items-center justify-center rounded border border-line-strong px-3 py-1.5 text-xs text-ink hover:bg-graphite-800"
						>
							{t("dash.openDrill")}
						</Link>
					</div>
				</div>
			</div>

			<div className="border-t border-line px-4 py-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
						{t("console.pressure")}
					</p>
					<p className="font-mono text-[10px] text-ink-3">
						{t("console.pressureHint")}
					</p>
				</div>
				<PressureChart
					samples={series.samples}
					maxTicks={drill.maxTicks}
					thresholds={series.thresholds}
					actions={drill.actions}
				/>
				<div className="flex justify-between font-mono text-[10px] text-ink-3">
					<span>tick 0</span>
					<span>
						{t("common.tickOf", {
							tick: String(drill.tick),
							total: String(drill.maxTicks),
						})}
					</span>
				</div>
			</div>
		</section>
	);
}

/** Calm state for when nothing is running: still reads like an ops console. */
export function AllClearStrip({ last }: { last: DrillListItem | null }) {
	const { t, locale } = useI18n();

	return (
		<section
			data-testid="incident-console-clear"
			className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-graphite-900/50 px-4 py-4"
		>
			<div className="flex min-w-0 items-center gap-3">
				<span
					aria-hidden="true"
					className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-teal"
				/>
				<div className="min-w-0">
					<p className="text-sm font-medium text-ink">
						{t("console.allClear")}
					</p>
					<p className="mt-0.5 truncate text-xs text-ink-3">
						{last
							? `${last.scenarioName} · ${formatDateTime(last.createdAt, locale)}${
									last.score
										? ` · ${last.score.total} (${last.score.grade})`
										: ""
								}`
							: t("console.allClearHint")}
					</p>
				</div>
			</div>
			{last ? (
				<Link
					to="/app/drills/$drillId"
					params={{ drillId: last.id }}
					search={{ motion: undefined }}
					data-testid="last-drill-link"
					className="press rounded-md border border-line-strong px-2.5 py-1 text-xs text-ink hover:bg-graphite-800"
				>
					{t("console.openLast")}
				</Link>
			) : null}
		</section>
	);
}
