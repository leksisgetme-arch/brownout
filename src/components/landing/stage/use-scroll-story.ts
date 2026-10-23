import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";
import { clamp01 } from "./math";
import { damp, domScroll, sceneTargets } from "./state";

gsap.registerPlugin(ScrollTrigger);

export interface StageTelemetry {
	interaction: number;
	darkening: number;
}

interface ScrollStoryOptions {
	/** Called with 0..6 whenever the nearest section centre changes. */
	onPhase?: (section: number) => void;
	/** Per-frame damped scalars the DOM layers mirror via CSS variables. */
	onTelemetry?: (telemetry: StageTelemetry) => void;
}

const DAMPING = 7.5;

/**
 * ScrollTrigger provides one band per section; the viewport centre inside a
 * band gives `index + progress - 0.5`, a continuous reversible narrative
 * value. A fixed-step rAF loop then damps that target (so reverse scrolling
 * replays backward smoothly), applies transform-only parallax to
 * `[data-speed]` layers, and mirrors levels back to the DOM as CSS vars.
 */
export function useScrollStory(options: ScrollStoryOptions): void {
	const optionsRef = useRef(options);
	optionsRef.current = options;

	useEffect(() => {
		const article = document.querySelector<HTMLElement>(
			'[data-testid="landing-page"]',
		);
		if (!article) return;
		const sections = Array.from(
			article.querySelectorAll<HTMLElement>("section[data-section-index]"),
		);
		if (sections.length === 0) return;

		const parallax = Array.from(
			article.querySelectorAll<HTMLElement>("[data-speed]"),
		).map((node) => ({
			node,
			speed: clamp01(Number(node.dataset.speed ?? 0.3)) * 0.8 + 0.2,
		}));

		const latest = { index: 0, fraction: 0 };

		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		const triggers = sections.map((el, index) =>
			ScrollTrigger.create({
				trigger: el,
				start: "top 50%",
				end: "bottom 50%",
				onUpdate: (self) => {
					latest.index = index;
					latest.fraction = self.progress;
				},
			}),
		);

		let narrative = 0;
		let interaction = 0;
		let darkening = 0;
		let displayedPhase = -1;
		let raf = 0;
		let previousY = window.scrollY;

		const frame = () => {
			raf = requestAnimationFrame(frame);
			const dt = 1 / 60;
			const scrollY = window.scrollY;

			const target = latest.index + latest.fraction - 0.5;
			narrative = damp(
				narrative,
				Math.min(Math.max(target, 0), sections.length - 1),
				DAMPING,
				dt,
			);
			sceneTargets.narrative = narrative;

			// Mitigate section (index 3) owns pointer interaction.
			const mitigate = sections[3];
			let inMitigate = 0;
			if (mitigate) {
				const rect = mitigate.getBoundingClientRect();
				const visible =
					rect.top < window.innerHeight * 0.6 &&
					rect.bottom > window.innerHeight * 0.4;
				inMitigate = visible ? 1 : 0;
			}

			interaction = damp(interaction, inMitigate, DAMPING, dt);
			sceneTargets.interaction = interaction;

			const phase = Math.min(
				Math.max(Math.round(narrative), 0),
				sections.length - 1,
			);
			if (phase !== displayedPhase) {
				displayedPhase = phase;
				optionsRef.current.onPhase?.(phase);
			}

			const brownout = 1 - Math.min(1, Math.abs(narrative - 2) * 1.35);
			const scrub = 1 - Math.min(1, Math.abs(narrative - 5) * 1.55);
			darkening = damp(
				darkening,
				Math.min(1, brownout * 0.45 + scrub * 0.55),
				DAMPING,
				dt,
			);
			optionsRef.current.onTelemetry?.({ interaction, darkening });

			// Transform-only parallax over scroll deltas, 0.2x..0.8x.
			const deltaY = scrollY - previousY;
			previousY = scrollY;
			if (!reduced) {
				for (const layer of parallax) {
					const current =
						Number(layer.node.dataset.drift ?? 0) + deltaY * layer.speed;
					layer.node.dataset.drift = current.toFixed(2);
					layer.node.style.transform = `translate3d(0, ${current.toFixed(2)}px, 0)`;
				}
			}

			domScroll.y = scrollY;
		};

		raf = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(raf);
			for (const trigger of triggers) trigger.kill();
		};
	}, []);
}
