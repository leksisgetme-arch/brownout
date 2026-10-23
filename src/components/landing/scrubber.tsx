import { useEffect } from "react";
import { useI18n } from "#/lib/i18n/use-i18n";
import { clamp01 } from "./stage/math";
import { sceneTargets } from "./stage/state";
import { type DrillPreview, PREVIEW_SCENARIO } from "./use-drill-preview";

const statusTone = (status: string) => {
	if (status === "delivered" || status === "duplicate") return "text-teal";
	if (status === "failed" || status === "dead_letter") return "text-amber";
	if (status === "held") return "text-muted";
	return "text-muted";
};

/**
 * Section 05. The glass panel holds the real engine's scrubber; the same
 * tick also mirrors into the persistent stage so the 3D field and the
 * numbers agree (amber node share tracks the engine error rate).
 */
export function TickScrubberSection({ preview }: { preview: DrillPreview }) {
	const { t } = useI18n();
	const { tick, setTick, maxTicks, state, metrics, deliveries, deadLetters } =
		preview;

	useEffect(() => {
		// Mirror into the stage: a deterministic fringe of amber nodes.
		sceneTargets.amberFraction =
			state === "EVALUATED" ? 0 : clamp01(metrics.errorRate * 2.4);
	}, [state, metrics.errorRate]);

	return (
		<section
			data-section-index={5}
			data-testid="section-05"
			className="section-block site-max"
			style={{ "--wash": "74 140 255" } as React.CSSProperties}
		>
			<span
				aria-hidden="true"
				className="wash"
				style={{ "--wash-x": "58%", "--wash-y": "22%" } as React.CSSProperties}
			/>
			<div className="grid gap-10 lg:grid-cols-12">
				<div className="lg:col-span-5">
					<p className="eyebrow-amber reveal-fade">
						{t("landing.scrubber.eyebrow")}
					</p>
					<h2 className="display mt-4 text-[clamp(2.6rem,4.6vw,4.2rem)] text-text">
						{t("landing.scrubber.title")}
					</h2>
					<p className="reveal-fade mt-6 max-w-[46ch] text-base leading-relaxed text-muted">
						{t("landing.scrubber.body")}
					</p>
					<p className="reveal-fade mt-8 font-mono text-xs text-muted">
						{t("landing.scrubber.scenario")}: {PREVIEW_SCENARIO}
					</p>
				</div>

				<div className="glass card lg:col-span-7 lg:col-start-6 overflow-hidden">
					<div className="border-b border-line px-6 py-4">
						<input
							id="scrubber-slider"
							type="range"
							min={0}
							max={maxTicks}
							step={1}
							value={tick}
							onChange={(event) => setTick(Number(event.target.value))}
							data-testid="scrubber-slider"
							aria-valuetext={`tick ${tick} of ${maxTicks}, ${state}`}
							aria-label={t("landing.scrubber.label")}
							className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-graphite-700 accent-[var(--color-amber)]"
						/>
						<div className="flex items-baseline justify-between gap-4">
							<label htmlFor="scrubber-slider" className="data-label">
								{t("landing.scrubber.label")}
							</label>
							<span className="font-mono text-sm text-muted tnum">
								{t("common.tickOf", {
									tick: String(tick),
									total: String(maxTicks),
								})}
							</span>
						</div>
					</div>

					<div className="grid gap-x-8 gap-y-6 px-6 py-6 sm:grid-cols-2">
						<div>
							<p className="data-label">{t("landing.scrubber.state")}</p>
							<p
								className={`mt-2 font-mono text-2xl tnum ${
									state === "EVALUATED" ? "text-teal" : "text-amber"
								}`}
								data-testid="scrubber-state"
							>
								{state}
							</p>
						</div>
						<div>
							<p className="data-label">{t("drill.metric.errorRate")}</p>
							<p
								className="mt-2 font-mono text-2xl text-text tnum"
								data-testid="scrubber-metric-error-rate"
							>
								{metrics.errorRate}
							</p>
						</div>
						<div>
							<p className="data-label">{t("drill.metric.latency")}</p>
							<p className="mt-2 font-mono text-2xl text-text tnum">
								{metrics.latencyMs}
							</p>
						</div>
						<div>
							<p className="data-label">{t("drill.metric.queueDepth")}</p>
							<p className="mt-2 font-mono text-2xl text-text tnum">
								{metrics.queueDepth}
							</p>
						</div>
					</div>

					<div className="border-t border-line px-6 py-5">
						<div className="flex items-baseline justify-between">
							<h3 className="data-label">{t("landing.scrubber.deliveries")}</h3>
							<span className="font-mono text-xs text-muted tnum">
								{deliveries.length}
							</span>
						</div>

						{deliveries.length === 0 ? (
							<p className="mt-3 text-sm text-muted">
								{t("landing.scrubber.empty")}
							</p>
						) : (
							<ul
								className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1"
								data-testid="scrubber-deliveries"
							>
								{deliveries.map((entry) => (
									<li
										key={`${entry.tick}-${entry.seq}-${entry.attempt}-${entry.status}`}
										className="flex items-center gap-3 border-b border-line/60 py-1.5 font-mono text-xs"
									>
										<span className="w-10 shrink-0 text-muted tnum">
											t{entry.tick}
										</span>
										<span className="w-14 shrink-0 text-muted tnum">
											seq {entry.seq}
										</span>
										<span className={`flex-1 ${statusTone(entry.status)}`}>
											{entry.status}
										</span>
										<span className="text-muted">
											{t("landing.scrubber.attempt", {
												n: String(entry.attempt),
											})}
										</span>
									</li>
								))}
							</ul>
						)}

						<div className="mt-6">
							<h3 className="data-label">
								{t("landing.scrubber.deadLetters")}
							</h3>
							<p
								className="mt-2 font-mono text-sm text-amber tnum"
								data-testid="scrubber-dead-letters"
							>
								{deadLetters.length === 0
									? t("common.none")
									: deadLetters.map((entry) => `seq ${entry.seq}`).join(", ")}
							</p>
						</div>

						<p className="mt-6 font-mono text-xs text-muted">
							{t("landing.scrubber.deterministic")}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
