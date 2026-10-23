import { createFileRoute } from "@tanstack/react-router";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { ClosingSection } from "#/components/landing/closing";
import { HeroCopy } from "#/components/landing/hero";
import { useMotionPreference } from "#/components/landing/motion-preference";
import {
	clusterAround,
	gridIndexFromWorld,
	KEYBOARD_CLUSTER_ORIGINS,
	NODE_COUNT,
	nodeGridToWorld,
} from "#/components/landing/node-grid";
import { SceneFallback } from "#/components/landing/scene-fallback";
import { TickScrubberSection } from "#/components/landing/scrubber";
import { pushWave, sceneTargets } from "#/components/landing/stage/state";
import { PHASE_I18N_KEYS } from "#/components/landing/stage/timeline";
import { useScrollStory } from "#/components/landing/stage/use-scroll-story";
import {
	BrownoutSection,
	HealthySection,
	MitigateSection,
	ScoreSection,
} from "#/components/landing/story-sections";
import { useDrillPreview } from "#/components/landing/use-drill-preview";
import { useI18n } from "#/lib/i18n/use-i18n";

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) => ({
		motion: search.motion === "off" ? ("off" as const) : undefined,
	}),
	component: LandingPage,
});

/** The three.js bundle loads only after mount, and only when it will render. */
const LazyStageCanvas = lazy(
	() => import("#/components/landing/stage/stage-canvas"),
);

function hasWebgl(): boolean {
	try {
		const canvas = document.createElement("canvas");
		const context =
			canvas.getContext("webgl2") ??
			canvas.getContext("webgl") ??
			canvas.getContext("experimental-webgl");
		return Boolean(context);
	} catch {
		return false;
	}
}

function LandingPage() {
	return <LandingContent />;
}

function LandingContent() {
	const { t } = useI18n();
	const { motionEnabled, ready } = useMotionPreference();
	const preview = useDrillPreview();
	const [phase, setPhase] = useState(0);
	const [recovered, setRecovered] = useState<ReadonlySet<number>>(
		() => new Set(),
	);
	const [webgl, setWebgl] = useState<boolean | null>(null);
	const hitareaRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		setWebgl(hasWebgl());
	}, []);

	const showStage = motionEnabled && ready && webgl === true;

	/**
	 * Scroll choreography: narrative targets for the stage, the phase label
	 * for the screen-reader status, and interaction/darkening levels that the
	 * DOM mirrors as direct style writes (never React state).
	 */
	useScrollStory({
		onPhase: (section) => {
			setPhase(section);
		},
		onTelemetry: ({ interaction, darkening }) => {
			const root = document.documentElement;
			root.style.setProperty(
				"--stage-grain",
				(0.05 + darkening * 0.05).toFixed(3),
			);
			root.style.setProperty(
				"--stage-vignette",
				(0.85 + darkening * 0.2).toFixed(2),
			);
			const hitarea = hitareaRef.current;
			if (hitarea) {
				hitarea.dataset.active = interaction > 0.5 ? "true" : "false";
			}
		},
	});

	const recover = useCallback((gridIndex: number) => {
		setRecovered((current) => {
			const next = new Set(current);
			for (const member of clusterAround(gridIndex)) next.add(member);
			return next;
		});
	}, []);

	/**
	 * Keyboard/button equivalent of clicking the grid: walks a fixed list of
	 * cluster origins so the counter always moves in the same order, and
	 * emits the same world-space ripple the viewer sees.
	 */
	const recoverNext = useCallback(() => {
		setRecovered((current) => {
			const next = new Set(current);
			const origin =
				KEYBOARD_CLUSTER_ORIGINS.find((candidate) =>
					clusterAround(candidate).some((member) => !current.has(member)),
				) ??
				KEYBOARD_CLUSTER_ORIGINS[0] ??
				0;
			for (const member of clusterAround(origin)) next.add(member);
			const world = nodeGridToWorld(origin);
			pushWave({ x: world.x, z: world.z, t0: -1 });
			return next;
		});
	}, []);

	useEffect(() => {
		sceneTargets.onHit = (x: number, z: number) => {
			recover(gridIndexFromWorld(x, z));
		};
		return () => {
			sceneTargets.onHit = null;
		};
	}, [recover]);

	const onHitareaPointerMove = useCallback((event: React.PointerEvent) => {
		sceneTargets.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
		sceneTargets.pointerY = -((event.clientY / window.innerHeight) * 2 - 1);
		if (sceneTargets.interaction > 0.5) sceneTargets.pointerSeed += 1;
	}, []);

	const onHitareaClick = useCallback((event: React.MouseEvent) => {
		sceneTargets.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
		sceneTargets.pointerY = -((event.clientY / window.innerHeight) * 2 - 1);
		sceneTargets.clickSeed += 1;
	}, []);

	return (
		<article data-testid="landing-page" className="relative z-10 min-h-screen">
			{/* Persistent stage: one fixed canvas behind all content. */}
			{showStage ? (
				<Suspense fallback={null}>
					<LazyStageCanvas enabled />
				</Suspense>
			) : ready ? (
				<SceneFallback />
			) : null}

			{/* Mitigate interaction: enabled only while section 03 is in view. */}
			<div
				ref={hitareaRef}
				data-testid="mitigate-hitarea"
				data-active="false"
				onPointerMove={onHitareaPointerMove}
				onClick={onHitareaClick}
				aria-hidden="true"
				className="fixed inset-0 z-[5] pointer-events-none data-[active=true]:pointer-events-auto"
			/>

			{/* Cinematic dressing above the stage, below the content. */}
			<div
				className="vignette"
				style={{
					opacity: "var(--stage-vignette, 0.85)" as never,
				}}
			/>

			{/* 00 — Hero */}
			<section
				data-section-index={0}
				data-testid="section-00"
				className="site-max relative isolate pt-[22vh] pb-[18vh]"
				style={{ "--wash": "96 116 190" } as React.CSSProperties}
			>
				<span
					aria-hidden="true"
					className="wash"
					style={
						{ "--wash-x": "30%", "--wash-y": "10%" } as React.CSSProperties
					}
				/>
				<span
					aria-hidden="true"
					data-speed="0.3"
					className="numeral-outline pointer-events-none absolute right-0 top-[8vh] select-none text-[clamp(8rem,18vw,15rem)]"
				>
					00
				</span>
				<span
					aria-hidden="true"
					data-speed="0.6"
					className="pointer-events-none absolute left-[63%] top-[10vh] hidden h-[46vh] w-px bg-line lg:block"
				/>
				<span
					aria-hidden="true"
					data-speed="0.3"
					className="pointer-events-none absolute left-[38%] top-[16vh] hidden h-[52vh] w-px bg-line lg:block"
				/>
				<div className="grid lg:grid-cols-12">
					<div className="lg:col-span-8">
						<HeroCopy />
					</div>
				</div>
			</section>

			<div data-testid="story-steps">
				<HealthySection />
				<BrownoutSection />
				<MitigateSection
					onRecoverNext={recoverNext}
					recoveredCount={recovered.size}
					totalNodes={NODE_COUNT}
				/>
				<ScoreSection preview={preview} />
			</div>

			<TickScrubberSection preview={preview} />
			<ClosingSection />

			{/* Screen-reader stage narration and live counter. */}
			<p className="sr-only" data-testid="scene-phase">
				{t(PHASE_I18N_KEYS[phase])}
			</p>
			<p className="sr-only" aria-live="polite">
				{t("landing.story.counter")}: {recovered.size} / {NODE_COUNT}
			</p>

			<div
				className="grain"
				style={{ opacity: "var(--stage-grain, 0.05)" as never }}
			/>
		</article>
	);
}
