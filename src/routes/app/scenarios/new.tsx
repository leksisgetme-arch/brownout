import {
	createFileRoute,
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
import { ACTION_TYPES, type ActionType } from "#/engine";
import { errorMessage } from "#/lib/i18n/messages";
import { useI18n } from "#/lib/i18n/use-i18n";
import { requireCommander } from "#/server/auth/guards";
import { createScenarioFn } from "#/server/scenarios/functions";

export const Route = createFileRoute("/app/scenarios/new")({
	beforeLoad: async () => {
		await requireCommander();
	},
	component: NewScenarioPage,
});

function NewScenarioPage() {
	const { t, locale } = useI18n();
	const navigate = useNavigate();
	const router = useRouter();

	const [name, setName] = useState("");
	const [seed, setSeed] = useState("42");
	const [maxTicks, setMaxTicks] = useState("120");
	const [eventsJson, setEventsJson] = useState("[]");
	const [errorRate, setErrorRate] = useState("2");
	const [latencyMs, setLatencyMs] = useState("180");
	const [queueDepth, setQueueDepth] = useState("4");
	const [requiredActions, setRequiredActions] = useState<ActionType[]>([]);
	const [pending, setPending] = useState(false);
	const [errors, setErrors] = useState<
		Array<{ code: string; message: string }>
	>([]);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setErrors([]);
		try {
			const result = await createScenarioFn({
				data: {
					name,
					seed: Number(seed),
					maxTicks: Number(maxTicks),
					eventsJson,
					metrics: {
						errorRate: Number(errorRate) / 100,
						latencyMs: Number(latencyMs),
						queueDepth: Number(queueDepth),
					},
					requiredActions,
				},
			});

			if (!result.ok) {
				const list = (result.errors ?? []).map((error) => ({
					code: error.code,
					message: `${error.field}: ${error.message}`,
				}));
				setErrors(
					list.length > 0
						? list
						: [
								{
									code: result.code,
									message: errorMessage(locale, result.code),
								},
							],
				);
				return;
			}

			await router.invalidate();
			await navigate({
				to: "/app/scenarios/$scenarioId",
				params: { scenarioId: result.data.id },
			});
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="mx-auto max-w-2xl">
			<PageHeader
				title={t("scenario.newTitle")}
				subtitle={t("scenario.newSubtitle")}
			/>

			<Card>
				<form
					onSubmit={onSubmit}
					className="space-y-4"
					data-testid="scenario-form"
					noValidate
				>
					{errors.length > 0 ? (
						<div className="space-y-2" data-testid="scenario-errors">
							{errors.map((error) => (
								<ErrorNotice
									key={`${error.code}-${error.message}`}
									code={error.code}
									message={error.message}
									testId={`scenario-error-${error.code}`}
								/>
							))}
						</div>
					) : null}

					<Field
						label={t("scenario.name")}
						htmlFor="scenario-name"
						hint={t("scenario.nameHint")}
					>
						<input
							id="scenario-name"
							name="name"
							required
							minLength={3}
							maxLength={60}
							value={name}
							onChange={(event) => setName(event.target.value)}
							className={inputClass}
							data-testid="scenario-name"
							aria-describedby="scenario-name-hint"
						/>
					</Field>

					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							label={t("common.seed")}
							htmlFor="scenario-seed"
							hint={t("scenario.seedHint")}
						>
							<input
								id="scenario-seed"
								name="seed"
								type="number"
								min={0}
								max={2147483647}
								required
								value={seed}
								onChange={(event) => setSeed(event.target.value)}
								className={inputClass}
								data-testid="scenario-seed"
								aria-describedby="scenario-seed-hint"
							/>
						</Field>

						<Field
							label={t("scenario.maxTicks")}
							htmlFor="scenario-max-ticks"
							hint={t("scenario.maxTicksHint")}
						>
							<input
								id="scenario-max-ticks"
								name="maxTicks"
								type="number"
								min={10}
								max={600}
								required
								value={maxTicks}
								onChange={(event) => setMaxTicks(event.target.value)}
								className={inputClass}
								data-testid="scenario-max-ticks"
								aria-describedby="scenario-max-ticks-hint"
							/>
						</Field>
					</div>

					<fieldset className="space-y-3">
						<legend className="text-sm font-medium text-ink">
							{t("scenario.metrics")}
						</legend>
						<p className="text-xs text-ink-3">{t("scenario.metricsHint")}</p>
						<div className="grid gap-4 sm:grid-cols-3">
							<Field
								label={t("scenario.errorRate")}
								htmlFor="scenario-error-rate"
							>
								<input
									id="scenario-error-rate"
									name="errorRate"
									type="number"
									min={0}
									max={100}
									step="0.1"
									value={errorRate}
									onChange={(event) => setErrorRate(event.target.value)}
									className={inputClass}
									data-testid="scenario-error-rate"
								/>
							</Field>
							<Field label={t("scenario.latency")} htmlFor="scenario-latency">
								<input
									id="scenario-latency"
									name="latencyMs"
									type="number"
									min={0}
									value={latencyMs}
									onChange={(event) => setLatencyMs(event.target.value)}
									className={inputClass}
									data-testid="scenario-latency"
								/>
							</Field>
							<Field
								label={t("scenario.queueDepth")}
								htmlFor="scenario-queue-depth"
							>
								<input
									id="scenario-queue-depth"
									name="queueDepth"
									type="number"
									min={0}
									value={queueDepth}
									onChange={(event) => setQueueDepth(event.target.value)}
									className={inputClass}
									data-testid="scenario-queue-depth"
								/>
							</Field>
						</div>
					</fieldset>

					<fieldset className="space-y-2">
						<legend className="text-sm font-medium text-ink">
							{t("scenario.requiredActions")}
						</legend>
						<p className="text-xs text-ink-3">
							{t("scenario.requiredActionsHint")}
						</p>
						<div className="grid gap-2 sm:grid-cols-2">
							{ACTION_TYPES.map((action) => (
								<label
									key={action}
									className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm text-ink-2"
								>
									<input
										type="checkbox"
										checked={requiredActions.includes(action)}
										onChange={(event) =>
											setRequiredActions((current) =>
												event.target.checked
													? [...current, action]
													: current.filter((entry) => entry !== action),
											)
										}
										data-testid={`scenario-action-${action}`}
									/>
									{t(`drill.action.${action}`)}
								</label>
							))}
						</div>
						{requiredActions.length === 0 ? (
							<p
								className="text-xs text-amber"
								data-testid="scenario-no-required-actions"
							>
								{t("scenario.noRequiredActions")}
							</p>
						) : null}
					</fieldset>

					<Field label={t("scenario.definition")} htmlFor="scenario-events">
						<textarea
							id="scenario-events"
							name="events"
							rows={8}
							value={eventsJson}
							onChange={(event) => setEventsJson(event.target.value)}
							className={`${inputClass} font-mono text-xs`}
							data-testid="scenario-events"
							spellCheck={false}
						/>
					</Field>

					<div className="flex items-center gap-3">
						<Button
							type="submit"
							disabled={pending}
							data-testid="scenario-submit"
						>
							{pending ? t("common.loading") : t("scenario.create")}
						</Button>
						<span
							className="text-xs text-ink-3"
							data-testid="scenario-draft-hint"
						>
							{t("scenario.created")}
						</span>
					</div>
				</form>
			</Card>
		</div>
	);
}
