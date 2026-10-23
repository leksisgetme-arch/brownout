import { Fragment, useEffect, useRef } from "react";

/**
 * Marks `*word*` spans in i18n copy so a headline can carry at most one or
 * two Instrument Serif italic words. Locale-safe: the marker parses the
 * translated string, it does not reorder or reword it.
 */
export function MarkedText({ text }: { text: string }) {
	const parts = text.split(/\*([^*]+)\*/g);
	const seen = new Map<string, number>();
	return (
		<>
			{parts.map((part, index) => {
				const kind = index % 2 === 1 ? "em" : "tx";
				const nth = seen.get(`${kind}:${part}`) ?? 0;
				seen.set(`${kind}:${part}`, nth + 1);
				const key = `${kind}:${part}:${nth}`;
				return index % 2 === 1 ? (
					<em key={key} className="font-display italic tracking-[-0.01em]">
						{part}
					</em>
				) : (
					<Fragment key={key}>{part}</Fragment>
				);
			})}
		</>
	);
}

/**
 * Adds `.revealed` once the element enters the reading band. Initial states
 * are opacity/transform only, so copy stays in the DOM from the first paint.
 */
export function useReveal({
	rootMargin = "-12% 0px -12% 0px",
}: {
	rootMargin?: string;
} = {}): React.RefCallback<HTMLElement> {
	const observerRef = useRef<IntersectionObserver | null>(null);

	return (node: HTMLElement | null) => {
		observerRef.current?.disconnect();
		if (!node) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					entry.target.classList.add("revealed");
					observer.unobserve(entry.target);
				}
			},
			{ rootMargin, threshold: 0 },
		);
		observerRef.current = observer;
		observer.observe(node);
	};
}

/**
 * Count-up for tabular mono figures. The final value is in the DOM from the
 * first paint (data-final); the animation only eases the displayed number
 * toward it when the element first enters the reading band.
 */
export function useCountUp({
	duration = 1100,
}: {
	duration?: number;
} = {}): React.RefObject<HTMLSpanElement | null> {
	const nodeRef = useRef<HTMLSpanElement | null>(null);

	useEffect(() => {
		const node = nodeRef.current;
		if (!node) return;
		const finalText = node.dataset.final ?? node.textContent ?? "0";
		const final = Number(finalText);
		if (!Number.isFinite(final)) return;

		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (reduced) return;

		node.textContent = "0";
		let start = 0;
		let raf = 0;

		const step = (now: number) => {
			if (!start) start = now;
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - (1 - t) ** 3;
			node.textContent = String(Math.round(final * eased));
			if (t < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);

		return () => {
			cancelAnimationFrame(raf);
			node.textContent = finalText;
		};
	}, [duration]);

	return nodeRef;
}
