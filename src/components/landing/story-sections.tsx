import { useEffect, useRef } from "react";
import { useI18n } from "#/lib/i18n/use-i18n";
import { useReveal } from "./reveal";
import type { DrillPreview } from "./use-drill-preview";

/** One band for every section reveal: applies once, then unobserves. */
const sharedReveal = { rootMargin: "-10% 0px -10% 0px" } as const;

/* ------------------------------------------------------------------ */
/* 01 - Healthy                                                         */
/* ------------------------------------------------------------------ */

const TICKER_ITEMS = [
	{ key: "drill.metric.latency", value: "180 ms" },
	{ key: "drill.metric.queueDepth", value: "4" },
	{ key: "drill.metric.errorRate", value: "0.02" },
] as const;

export function HealthySection() {
	const { t } = useI18n();
	const reveal = useReveal(sharedReveal);

	const track = TICKER_ITEMS.map((item) => (
		<span
			key={item.key}
			className="mx-8 inline-flex items-baseline gap-3 whitespace-nowrap font-mono text-sm tnum"
		>
			<span className="data-label">{t(item.key)}</span>
			<span className="text-text">{item.value}</span>
			<span aria-hidden="true" className="h-1 w-1 rounded-full bg-teal" />
		</span>
	));

	return (
		<section
			ref={reveal}
			data-section-index={1}
			data-testid="section-01"
			className="section-block site-max"
		>
			<span
				aria-hidden="true"
				className="wash"
				style={{ "--wash": "59 184 154" } as React.CSSProperties}
			/>
			<span
				aria-hidden="true"
				className="reveal-fade numeral-outline pointer-events-none absolute right-0 top-[6vh] select-none text-[clamp(6rem,14vw,12rem)]"
			>
				01
			</span>

			<div className="grid gap-10 lg:grid-cols-12">
				<div className="lg:col-span-5">
					<p className="eyebrow reveal-fade">{t("landing.story.eyebrow")}</p>
					<h2
						className="display mt-4 text-[clamp(2.6rem,4.6vw,4.2rem)] text-text"
						data-testid="story-step-1"
					>
						{t("landing.story.1.title")}
					</h2>
				</div>
				<div className="lg:col-span-6 lg:col-start-7">
					<p className="reveal-fade max-w-[46ch] text-base leading-relaxed text-muted lg:pt-14">
						{t("landing.story.1.body")}
					</p>
				</div>
			</div>

			<div
				data-testid="tick-ticker"
				className="reveal-fade mt-16 overflow-hidden border-y border-line py-4"
				style={{ transitionDelay: "160ms" }}
			>
				<div className="ticker-track inline-flex will-change-transform">
					{track}
					<span className="sr-only">
						{TICKER_ITEMS.map((item) => `${t(item.key)} ${item.value}`).join(
							", ",
						)}
					</span>
				</div>
				<div
					aria-hidden="true"
					className="ticker-track inline-flex will-change-transform"
				>
					{track}
				</div>
			</div>
		</section>
	);
}

/* ------------------------------------------------------------------ */
/* 02 - Brownout                                                        */
/* ------------------------------------------------------------------ */

const INCIDENT_CODES = [
	{ code: "E-STATE-409", delay: 0, dur: 2400, top: "12%" },
	{ code: "E-RATE-429", delay: 320, dur: 3000, top: "38%" },
	{ code: "E-SIG-401", delay: 760, dur: 2600, top: "60%" },
	{ code: "E-STATE-409", delay: 200, dur: 3200, top: "78%" },
] as const;

export function BrownoutSection() {
	const { t } = useI18n();

	return (
		<section
			data-section-index={2}
			data-testid="section-02"
			className="section-block site-max"
			style={{ "--wash": "255 176 32" } as React.CSSProperties}
		>
			<span
				aria-hidden="true"
				className="wash"
				style={{ "--wash-x": "62%", "--wash-y": "20%" } as React.CSSProperties}
			/>
			<span
				aria-hidden="true"
				className="reveal-fade numeral-shake numeral-outline pointer-events-none absolute left-0 top-[6vh] select-none text-[clamp(6rem,14vw,12rem)]"
				style={{ WebkitTextStrokeColor: "rgba(255,176,32,0.30)" }}
			>
				02
			</span>

			<div className="grid gap-10 lg:grid-cols-12">
				<div className="lg:col-span-6">
					<p className="eyebrow-amber reveal-fade">
						{t("landing.story.eyebrow")}
					</p>
					<h2
						className="display mt-4 text-[clamp(2.6rem,4.6vw,4.2rem)] text-text"
						data-testid="story-step-2"
					>
						{t("landing.story.2.title")}
					</h2>
					<p className="reveal-fade mt-6 max-w-[46ch] text-base leading-relaxed text-muted">
						{t("landing.story.2.body")}
					</p>
				</div>
				<div className="relative hidden lg:col-span-5 lg:col-start-8 lg:block">
					{INCIDENT_CODES.map((item) => (
						<p
							key={`${item.code}-${item.delay}-${item.top}`}
							className="code-rise absolute inset-x-0 font-mono text-xs tnum tracking-[0.14em] text-amber"
							style={
								{
									top: item.top,
									"--rise-delay": `${item.delay}ms`,
									"--rise-dur": `${item.dur}ms`,
								} as React.CSSProperties
							}
						>
							{item.code}
						</p>
					))}
				</div>
			</div>
		</section>
	);
}

/* ------------------------------------------------------------------ */
/* 03 - Mitigate                                                        */
/* ------------------------------------------------------------------ */

const ACTION_KEYS = [
	"drill.action.rotate_token",
	"drill.action.restart_worker",
	"drill.action.scale_up",
	"drill.action.enable_circuit_breaker",
	"drill.action.failover_db",
] as const;

/** The demo timeline applies the first two actions at ticks 30 and 32. */
const APPLIED_ACTIONS = 2;

export function MitigateSection({
	onRecoverNext,
	recoveredCount,
	totalNodes,
}: {
	onRecoverNext: () => void;
	recoveredCount: number;
	totalNodes: number;
}) {
	const { t } = useI18n();

	return (
		<section
			data-section-index={3}
			data-testid="section-03"
			className="section-block site-max"
			style={{ "--wash": "88 120 255" } as React.CSSProperties}
		>
			<span
				aria-hidden="true"
				className="wash"
				style={{ "--wash-x": "24%", "--wash-y": "55%" } as React.CSSProperties}
			/>
			<span
				aria-hidden="true"
				className="reveal-fade numeral-outline pointer-events-none absolute right-0 top-[6vh] select-none text-[clamp(6rem,14vw,12rem)]"
			>
				03
			</span>

			<div className="grid gap-10 lg:grid-cols-12">
				<div className="lg:col-span-6">
					<p className="eyebrow reveal-fade">{t("landing.story.eyebrow")}</p>
					<h2
						className="display mt-4 text-[clamp(2.6rem,4.6vw,4.2rem)] text-text"
						data-testid="story-step-3"
					>
						{t("landing.story.3.title")}
					</h2>
					<p className="reveal-fade mt-6 max-w-[46ch] text-base leading-relaxed text-muted">
						{t("landing.story.3.body")}
					</p>

					<div className="reveal-fade mt-10 flex items-center gap-5">
						<button
							type="button"
							onClick={onRecoverNext}
							data-testid="recover-nodes"
							className="press btn btn-ghost btn-sm"
						>
							{t("landing.story.recover")}
						</button>
						<span
							className="font-mono text-sm text-muted tnum"
							data-testid="node-grid-counter"
						>
							{recoveredCount} / {totalNodes}
						</span>
					</div>
					<p className="reveal-fade mt-3 text-[11px] text-muted">
						{t("landing.story.recoverHint")}
					</p>
				</div>

				<ul className="space-y-0 self-center lg:col-span-5 lg:col-start-8">
					{ACTION_KEYS.map((key, index) => (
						<li
							key={key}
							className="reveal-fade flex items-center gap-3 border-t border-line py-3 last:border-b"
							style={{ transitionDelay: `${index * 90}ms` }}
						>
							<span
								aria-hidden="true"
								className={`h-1 w-1 rounded-full ${
									index < APPLIED_ACTIONS ? "bg-teal" : "bg-muted"
								}`}
							/>
							<span className="font-mono text-sm text-text">{t(key)}</span>
							<span
								className={`ml-auto font-mono text-[10px] uppercase tracking-[0.14em] ${
									index < APPLIED_ACTIONS ? "text-teal" : "text-muted"
								}`}
							>
								{index < APPLIED_ACTIONS ? t("drill.done") : t("drill.pending")}
							</span>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

/* ------------------------------------------------------------------ */
/* 04 - Score                                                           */
/* ------------------------------------------------------------------ */

/**
 * Keeps the final value in the DOM (data-final) from the first paint, and
 * eases the shown number toward it with tabular figures whenever the scrubber
 * moves the score.
 */
function CountValue({ value }: { value: number }) {
	const nodeRef = useRef<HTMLSpanElement | null>(null);

	useEffect(() => {
		const node = nodeRef.current;
		if (!node) return;
		node.dataset.final = String(value);

		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			node.textContent = String(value);
			return;
		}

		const from = Number(node.textContent) || 0;
		if (from === value) {
			node.textContent = String(value);
			return;
		}
		const start = 0;
		const duration = 900;
		let raf = requestAnimationFrame(function step(now) {
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - (1 - t) ** 3;
			node.textContent = String(Math.round(from + (value - from) * eased));
			if (t < 1) raf = requestAnimationFrame(step);
			void raf;
		});
		return () => cancelAnimationFrame(raf);
	}, [value]);

	return (
		<span
			ref={nodeRef}
			className="font-mono tnum"
			data-testid="score-gauge-value"
			data-final={value}
		>
			{value}
		</span>
	);
}

export function ScoreSection({ preview }: { preview: DrillPreview }) {
	const { t } = useI18n();
	const { score, tick } = preview;

	const rows = [
		{ key: "mtta", label: t("landing.score.mtta"), value: score.mttaPenalty },
		{
			key: "wrong",
			label: t("landing.score.wrong"),
			value: score.wrongActionPenalty,
		},
		{ key: "sla", label: t("landing.score.sla"), value: score.slaPenalty },
		{ key: "hints", label: t("landing.score.hints"), value: score.hintPenalty },
	];

	const frac = Math.min(1, Math.max(0, score.total / 100));
	// Gauge arc: r = 84 -> circumference 527.79; the arc sweeps the score share.
	const circumference = 527.79;

	return (
		<section
			data-section-index={4}
			data-testid="section-04"
			className="section-block site-max"
			style={{ "--wash": "176 116 255" } as React.CSSProperties}
		>
			<span
				aria-hidden="true"
				className="wash"
				style={{ "--wash-x": "70%", "--wash-y": "30%" } as React.CSSProperties}
			/>
			<span
				aria-hidden="true"
				className="reveal-fade numeral-outline pointer-events-none absolute left-0 top-[6vh] select-none text-[clamp(6rem,14vw,12rem)]"
			>
				04
			</span>

			<div className="grid gap-10 lg:grid-cols-12">
				<div className="lg:col-span-5">
					<p className="eyebrow reveal-fade">{t("landing.score.eyebrow")}</p>
					<h2
						className="display mt-4 max-w-[12ch] text-[clamp(2.6rem,4.6vw,4.2rem)] text-text"
						data-testid="story-step-4"
					>
						{t("landing.score.title")}
					</h2>
					<p className="reveal-fade mt-6 max-w-[46ch] text-base leading-relaxed text-muted">
						{t("landing.score.body")}
					</p>

					<div
						className="reveal-fade relative mt-12 inline-flex items-center justify-center"
						style={{ transitionDelay: "140ms" }}
					>
						<svg
							className="score-gauge h-48 w-48"
							viewBox="0 0 200 200"
							role="img"
							aria-label={`${t("landing.score.total")} ${score.total} / 100`}
						>
							<circle
								cx="100"
								cy="100"
								r="84"
								fill="none"
								stroke="var(--color-line)"
								strokeWidth="3"
							/>
							<circle
								cx="100"
								cy="100"
								r="84"
								fill="none"
								stroke="var(--color-teal)"
								strokeWidth="3"
								strokeLinecap="round"
								strokeDasharray={`${frac * circumference} ${circumference}`}
								transform="rotate(-90 100 100)"
								className="transition-[stroke-dasharray] duration-700"
							/>
						</svg>
						<div className="absolute inset-0 flex flex-col items-center justify-center">
							<CountValue value={score.total} />
							<span className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
								{t("landing.score.total")} · {t("landing.score.grade")}{" "}
								{score.grade}
							</span>
						</div>
					</div>
					<p className="reveal-fade mt-4 font-mono text-xs text-muted">
						{t("landing.score.note")} ({t("common.tick")} {tick})
					</p>
				</div>

				<div className="grid content-center gap-3 sm:grid-cols-2 lg:col-span-7">
					{rows.map((row, index) => (
						<div
							key={row.key}
							className="reveal-fade card p-5"
							style={{ transitionDelay: `${index * 80}ms` }}
						>
							<p className="data-label">{row.label}</p>
							<p
								className="mt-2 font-mono text-2xl text-text tnum"
								data-testid={`score-${row.key}`}
							>
								−{row.value}
							</p>
						</div>
					))}
					<div
						className="reveal-fade card p-5 sm:col-span-2"
						style={{ transitionDelay: "320ms" }}
					>
						<div className="flex flex-wrap items-baseline justify-between gap-4">
							<div>
								<p className="data-label">{t("landing.score.base")}</p>
								<p
									className="mt-2 font-mono text-2xl text-text tnum"
									data-testid="score-base"
								>
									{score.base}
								</p>
							</div>
							<div className="text-right">
								<p className="data-label">{t("landing.score.total")}</p>
								<p className="mt-2 flex items-baseline gap-3">
									<span
										className="font-mono text-3xl text-text tnum"
										data-testid="score-total"
									>
										{score.total}
									</span>
									<span
										className="font-mono text-lg text-amber tnum"
										data-testid="score-grade"
									>
										{score.grade}
									</span>
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
