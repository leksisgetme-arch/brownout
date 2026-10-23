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
						<span className="text-xs text-ink-3">{t("scenario.created")}</span>
					</div>
				</form>
			</Card>
		</div>
	);
}
