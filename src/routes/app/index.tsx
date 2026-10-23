import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AllClearStrip, IncidentConsole } from "#/components/IncidentConsole";
import { TodayPanel } from "#/components/TodayPanel";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	ErrorNotice,
	PageHeader,
} from "#/components/ui";
import { useAppContext } from "#/lib/app-context";
import { formatDateTime } from "#/lib/format";
import { errorMessage } from "#/lib/i18n/messages";
import { useI18n } from "#/lib/i18n/use-i18n";
import {
	getDrillFn,
	getDrillSeriesFn,
	listDrillsFn,
	startDrillFn,
} from "#/server/drills/functions";
import {
	deleteScenarioFn,
	listScenariosFn,
} from "#/server/scenarios/functions";

const scenariosQuery = queryOptions({
	queryKey: ["scenarios"],
	staleTime: 0,
	queryFn: () => listScenariosFn(),
});

const drillsQuery = queryOptions({
	queryKey: ["drills"],
	staleTime: 0,
	queryFn: () => listDrillsFn(),
});

export const Route = createFileRoute("/app/")({
	validateSearch: (search: Record<string, unknown>): { error?: string } => ({
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	loader: async () => {
		const [scenarios, drills] = await Promise.all([
			listScenariosFn(),
			listDrillsFn(),
		]);
		// The console needs the newest open drill's detail and metric history;
		// both come from the same deterministic engine run.
		const active = drills.find((drill) => ACTIVE_STATES.has(drill.state));
		const incident = active
			? await Promise.all([
					getDrillFn({ data: { id: active.id } }),
					getDrillSeriesFn({ data: { id: active.id } }),
				]).then(([detail, series]) =>
					detail.ok && series.ok
						? { detail: detail.data, series: series.data }
						: null,
				)
			: null;
		return { scenarios, drills, incident };
	},
	component: DashboardPage,
});

/** Drill states that still belong to "in progress" on the dashboard. */
const ACTIVE_STATES = new Set(["RUNNING", "PAUSED"]);

function DashboardPage() {
	const { t, locale } = useI18n();
	const { user } = useAppContext();
	const search = Route.useSearch();
	const initial = Route.useLoaderData();
	const { data: scenarios } = useQuery({
		...scenariosQuery,
		initialData: initial.scenarios,
	});
	const { data: drills } = useQuery({
		...drillsQuery,
		initialData: initial.drills,
		// The history and the console switch over as soon as a drill closes.
		refetchInterval: 3000,
	});

	const isCommander = user?.role === "commander";
	const activeDrills = drills.filter((drill) => ACTIVE_STATES.has(drill.state));
	const activeDrill = activeDrills[0] ?? null;
	// listDrills() is newest first, so the first row is the latest drill.
	const latestDrill = drills[0] ?? null;
	const readyScenarios = scenarios.filter(
		(scenario) => scenario.status === "READY",
	);

	const incident = useQuery({
		queryKey: ["incident", activeDrill?.id ?? "none"],
		enabled: Boolean(activeDrill),
		queryFn: async () => {
			if (!activeDrill) return null;
			const [detail, series] = await Promise.all([
				getDrillFn({ data: { id: activeDrill.id } }),
				getDrillSeriesFn({ data: { id: activeDrill.id } }),
			]);
			return detail.ok && series.ok
				? { detail: detail.data, series: series.data }
				: null;
		},
		initialData: initial.incident ?? undefined,
		// One second = one tick, so the console follows the clock as it runs.
		refetchInterval: activeDrill ? 1500 : false,
	});
	const incidentData = incident.data ?? initial.incident;

	return (
		<div className="space-y-8" data-testid="dashboard-page">
			<nav aria-label="Breadcrumb" className="text-sm text-muted">
				<Link
					to="/"
					search={{ motion: undefined }}
					data-testid="back-to-landing"
					className="link-underline hover:text-text"
				>
					<span aria-hidden="true">← </span>
					{t("dash.backToLanding")}
				</Link>
			</nav>

			<PageHeader
				title={t("dash.title")}
				subtitle={t("dash.subtitle")}
				actions={
					isCommander ? (
						<Link
							to="/app/scenarios/new"
							data-testid="new-scenario-link"
							className="press inline-flex items-center gap-2 rounded-lg border border-amber bg-amber px-3.5 py-2 text-sm font-medium text-graphite-950 hover:bg-[#eab35f]"
						>
							{t("dash.newScenario")}
						</Link>
					) : null
				}
			/>

			{search.error ? (
				<ErrorNotice
					code={search.error}
					message={errorMessage(locale, search.error)}
				/>
			) : null}

			{!isCommander ? (
				<div
					data-testid="observer-notice"
					className="rounded-lg border border-teal/40 bg-teal/10 px-4 py-3 text-sm text-teal"
				>
					{t("dash.roleNotice")}
				</div>
			) : null}

			<TodayPanel
				runs={drills}
				scenarios={scenarios}
				activeDrill={activeDrill}
				isCommander={isCommander}
			/>

			{/* Live incident console: newest open drill, or a calm all-clear. */}
			{activeDrill &&
			incidentData &&
			ACTIVE_STATES.has(incidentData.detail.state) ? (
				<IncidentConsole
					drill={incidentData.detail}
					series={incidentData.series}
					email={user?.email ?? null}
					role={user?.role ?? null}
					isLatest={latestDrill?.id === activeDrill.id}
				/>
			) : (
				<AllClearStrip last={latestDrill} />
			)}

			<section aria-labelledby="scenarios-heading">
				<div className="mb-3 flex items-center justify-between">
					<h2 id="scenarios-heading" className="text-lg font-semibold text-ink">
						{t("common.scenarios")}
						<span
							data-testid="scenario-count"
							className="ml-2 font-mono text-sm font-normal text-ink-3"
						>
							{scenarios.length} · {readyScenarios.length}{" "}
							{t("scenario.status.READY")}
						</span>
					</h2>
					{isCommander ? (
						<Link
							to="/app/scenarios/new"
							className="text-xs text-amber underline-offset-4 hover:underline"
							data-testid="scenarios-heading-link"
						>
							{t("dash.newScenario")}
						</Link>
					) : null}
				</div>

				{scenarios.length === 0 ? (
					<EmptyState
						testId="empty-scenarios"
						title={t("dash.emptyScenarios")}
						hint={t("dash.emptyScenariosHint")}
						action={
							isCommander ? (
								<Link
									to="/app/scenarios/new"
									className="rounded-md border border-amber bg-amber px-3.5 py-2 text-sm font-medium text-graphite-950"
								>
									{t("dash.newScenario")}
								</Link>
							) : undefined
						}
					/>
				) : null}

				{scenarios.length > 0 ? (
					<ul className="grid gap-3 sm:grid-cols-2" data-testid="scenario-list">
						{scenarios.map((scenario) => (
							<ScenarioCard
								key={scenario.id}
								scenario={scenario}
								isCommander={isCommander}
								openDrill={
									activeDrills.find(
										(drill) => drill.scenarioId === scenario.id,
									) ?? null
								}
							/>
						))}
					</ul>
				) : null}
			</section>

			<section aria-labelledby="drills-heading">
				<div className="mb-3 flex items-center justify-between">
					<h2 id="drills-heading" className="text-lg font-semibold text-ink">
						{t("common.drills")}
						<span
							data-testid="drill-count"
							className="ml-2 font-mono text-sm font-normal text-ink-3"
						>
							{drills.length} · {activeDrills.length} {t("dash.activeDrills")}
						</span>
					</h2>
				</div>
				{drills.length === 0 ? (
					<EmptyState
						testId="empty-drills"
						title={t("dash.emptyDrills")}
						hint={t("dash.emptyDrillsHint")}
					/>
				) : null}
				{drills.length > 0 ? <DrillBoard drills={drills} /> : null}
			</section>
		</div>
	);
}

type ScenarioSeed = Awaited<ReturnType<typeof listScenariosFn>>[number];
type DrillSeed = Awaited<ReturnType<typeof listDrillsFn>>[number];

function ScenarioCard({
	scenario,
	isCommander,
	openDrill,
}: {
	scenario: ScenarioSeed;
	isCommander: boolean;
	openDrill: DrillSeed | null;
}) {
	const { t, locale } = useI18n();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [deleting, setDeleting] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [starting, setStarting] = useState(false);
	const [cardError, setCardError] = useState<string | null>(null);

	async function onDelete() {
		setDeleting(true);
		setCardError(null);
		try {
			const result = await deleteScenarioFn({
				data: { id: scenario.id },
			});
			if (!result.ok) {
				setCardError(result.code);
				setConfirmDelete(false);
				return;
			}
			setConfirmDelete(false);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["scenarios"] }),
				router.invalidate(),
			]);
		} finally {
			setDeleting(false);
		}
	}

	async function onStart() {
		setStarting(true);
		setCardError(null);
		try {
			const result = await startDrillFn({
				data: { scenarioId: scenario.id },
			});
			if (!result.ok) {
				setCardError(result.code);
				return;
			}
			await router.navigate({
				to: "/app/drills/$drillId",
				params: { drillId: result.data.drillId },
				search: { motion: undefined },
			});
		} finally {
			setStarting(false);
		}
	}

	return (
		<li className="group relative rounded-lg border border-line bg-graphite-900/60 transition-colors hover:border-line-strong hover:bg-graphite-900">
			<Link
				to="/app/scenarios/$scenarioId"
				params={{ scenarioId: scenario.id }}
				data-testid={`scenario-item-${scenario.id}`}
				className="block p-4"
			>
				<div className="flex items-start justify-between gap-3">
					<h3
						className="text-sm font-semibold text-ink"
						data-testid={`scenario-name-${scenario.id}`}
					>
						{scenario.name}
					</h3>
					<Badge
						tone={scenario.status === "READY" ? "green" : "neutral"}
						testId={`scenario-status-${scenario.id}`}
					>
						{t(`scenario.status.${scenario.status}`)}
					</Badge>
				</div>
				<p className="mt-2 text-xs text-ink-3">
					seed {scenario.seed} · {scenario.maxTicks} ticks ·{" "}
					{scenario.eventCount} {t("common.events").toLowerCase()}
				</p>
				<p className="mt-1 text-[11px] text-ink-3">
					{t("scenario.updatedAt")}:{" "}
					{formatDateTime(scenario.updatedAt, locale)}
				</p>
				{scenario.curated ? (
					<span className="mt-3 inline-block">
						<Badge tone="amber">{t("common.curated")}</Badge>
					</span>
				) : null}
			</Link>

			{cardError ? (
				<ErrorNotice
					code={cardError}
					message={errorMessage(locale, cardError)}
					testId={`scenario-error-${scenario.id}-${cardError}`}
				/>
			) : null}

			<div className="mt-2 flex flex-wrap gap-2 border-t border-line px-4 py-3">
				{openDrill ? (
					<Link
						to="/app/drills/$drillId"
						params={{ drillId: openDrill.id }}
						search={{ motion: undefined }}
						data-testid={`scenario-open-${scenario.id}`}
						className="press inline-flex flex-wrap items-center gap-2 rounded-md border border-amber/60 bg-amber/10 px-2.5 py-1 text-xs text-amber hover:bg-amber/15"
					>
						{t("dash.openDrill")}
						<span className="font-mono text-[10px] text-amber/80">
							{openDrill.state} · tick {openDrill.tick}
						</span>
					</Link>
				) : null}
				{scenario.status === "READY" &&
				isCommander &&
				(!openDrill || scenario.testMode) ? (
					<Button
						data-testid={`scenario-start-${scenario.id}`}
						className="px-2.5 py-1 text-xs"
						onClick={() => void onStart()}
						disabled={starting}
					>
						{starting ? t("common.loading") : t("home.ctaPrimary")}
					</Button>
				) : null}
				{scenario.status === "DRAFT" && isCommander && !scenario.curated ? (
					<>
						<Link
							to="/app/scenarios/$scenarioId/edit"
							params={{ scenarioId: scenario.id }}
							data-testid={`scenario-edit-${scenario.id}`}
							className="inline-flex items-center rounded-md border border-line-strong px-2.5 py-1 text-xs text-ink hover:bg-graphite-800"
						>
							{t("common.edit")}
						</Link>
						<Button
							tone="danger"
							data-testid={`scenario-delete-${scenario.id}`}
							className="px-2.5 py-1 text-xs"
							onClick={() => setConfirmDelete(true)}
							disabled={deleting}
						>
							{t("common.delete")}
						</Button>
					</>
				) : null}
				{!isCommander ? (
					<Link
						to="/app/scenarios/$scenarioId"
						params={{ scenarioId: scenario.id }}
						className="ml-auto text-xs text-teal"
					>
						{" "}
						{t("dash.openDrill")}
					</Link>
				) : null}
			</div>

			{confirmDelete ? (
				<div
					className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-graphite-950/90 p-4"
					data-testid={`scenario-confirm-${scenario.id}`}
				>
					<div className="space-y-3 text-center">
						<p className="text-sm text-ink-2">{t("dash.deleteScenario")}</p>
						<div className="flex justify-center gap-2">
							<Button
								tone="danger"
								data-testid={`scenario-confirm-yes-${scenario.id}`}
								className="px-2.5 py-1 text-xs"
								onClick={() => void onDelete()}
								disabled={deleting}
							>
								{t("common.confirm")}
							</Button>
							<Button
								tone="secondary"
								data-testid={`scenario-confirm-no-${scenario.id}`}
								className="px-2.5 py-1 text-xs"
								onClick={() => setConfirmDelete(false)}
								disabled={deleting}
							>
								{t("common.cancel")}
							</Button>
						</div>
					</div>
				</div>
			) : null}
		</li>
	);
}

function DrillBoard({ drills }: { drills: DrillSeed[] }) {
	const { t, locale } = useI18n();
	const [filter, setFilter] = useState<"all" | "active" | "graded">("all");

	const visible = drills.filter((drill) => {
		if (filter === "active") return ACTIVE_STATES.has(drill.state);
		if (filter === "graded") return drill.state === "EVALUATED";
		return true;
	});

	return (
		<Card className="p-0">
			<fieldset
				aria-label={t("dash.filterGroup")}
				className="flex gap-1 border-b border-line p-2"
			>
				{[
					{ key: "all" as const, label: t("dash.filterAll") },
					{ key: "active" as const, label: t("dash.filterActive") },
					{ key: "graded" as const, label: t("dash.filterGraded") },
				].map((entry) => (
					<button
						key={entry.key}
						type="button"
						data-testid={`drill-filter-${entry.key}`}
						aria-pressed={filter === entry.key}
						onClick={() => setFilter(entry.key)}
						className={`press rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${
							filter === entry.key
								? "bg-amber text-graphite-950"
								: "text-ink-3 hover:text-ink"
						}`}
					>
						{entry.label}
					</button>
				))}
			</fieldset>
			{visible.length === 0 ? (
				<EmptyState
					testId={`empty-drills-${filter}`}
					title={t(`dash.filterEmpty.${filter}`)}
					hint={undefined}
				/>
			) : (
				<ul className="divide-y divide-line" data-testid="drill-list">
					{visible.map((drill) => (
						<li key={drill.id}>
							<Link
								to="/app/drills/$drillId"
								params={{ drillId: drill.id }}
								search={{ motion: undefined }}
								data-testid={`drill-item-${drill.id}`}
								className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-graphite-900"
							>
								<span className="min-w-0">
									<span className="block truncate text-sm text-ink">
										{drill.scenarioName}
									</span>
									<span className="mt-0.5 block font-mono text-[11px] text-ink-3">
										{formatDateTime(drill.createdAt, locale)} · tick{" "}
										{drill.tick}/{drill.maxTicks}
									</span>
								</span>
								<span className="flex flex-wrap items-center gap-3">
									<span
										className="font-mono text-[11px] text-ink-3"
										data-testid={`drill-mtta-${drill.id}`}
									>
										MTTA {drill.firstActionTick ?? "—"} · MTTR{" "}
										{drill.mttrTicks ?? "—"}
									</span>
									{drill.score ? (
										<span className="font-mono text-xs text-amber">
											{drill.score.total} · {drill.score.grade}
										</span>
									) : null}
									<Badge
										tone={ACTIVE_STATES.has(drill.state) ? "amber" : "neutral"}
										testId={`drill-state-${drill.id}`}
									>
										{drill.state}
									</Badge>
									<span
										aria-hidden="true"
										className="font-mono text-xs text-ink-3"
									>
										→
									</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}
