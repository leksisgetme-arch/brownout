import { useRouterState } from "@tanstack/react-router";
import { useEffect, useId, useRef } from "react";
import { useI18n } from "#/lib/i18n/use-i18n";
import { SITE_GITHUB_URL } from "#/lib/site";

/**
 * A 5x7 bitmap alphabet, just the letters the wordmark needs. Each row is a
 * string of "1"s and "0"s; a lit cell becomes one square in the SVG.
 */
const GLYPHS: Record<string, readonly string[]> = {
	B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
	R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
	O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
	W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
	N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
	U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
	T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
};

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const GLYPH_GAP = 1;
const WORD = "BROWNOUT";
const COLUMNS = WORD.length * (GLYPH_WIDTH + GLYPH_GAP) - GLYPH_GAP;
const CELL_INSET = 0.05;
const CELL_SIZE = 1 - CELL_INSET * 2;

/** Flat list of cells for the whole word, computed once at module scope. */
const CELLS = [...WORD].flatMap((letter, letterIndex) => {
	const glyph = GLYPHS[letter] ?? [];
	return glyph.flatMap((row, y) =>
		[...row].flatMap((cell, x) =>
			cell === "1"
				? [
						{
							key: `${letterIndex}-${x}-${y}`,
							x: letterIndex * (GLYPH_WIDTH + GLYPH_GAP) + x,
							y,
						},
					]
				: [],
		),
	);
});

/**
 * Footer decoration for the landing page only: the product name set in a
 * bitmap alphabet, dim at rest and flooded amber from the bottom up as the
 * footer scrolls into view (the "brownout rising"). One rAF-throttled scroll
 * listener moves a single clip rectangle, so React never re-renders on scroll;
 * screen readers get nothing (aria-hidden).
 */
function PixelWordmark() {
	const box = useRef<HTMLDivElement>(null);
	const clip = useRef<SVGRectElement>(null);
	const glyphsId = `footer-glyphs-${useId().replace(/:/g, "")}`;
	const clipId = `footer-clip-${useId().replace(/:/g, "")}`;

	useEffect(() => {
		let frame = 0;

		const measure = () => {
			frame = 0;
			const node = box.current;
			if (!node) return;
			const rect = node.getBoundingClientRect();
			const span = Math.min(rect.height, window.innerHeight) || 1;
			const visible = window.innerHeight - rect.top;
			const fill = Math.max(0, Math.min(1, visible / span));
			const height = fill * GLYPH_HEIGHT;
			clip.current?.setAttribute("y", String(GLYPH_HEIGHT - height));
			clip.current?.setAttribute("height", String(height));
		};

		const schedule = () => {
			if (frame) return;
			frame = window.requestAnimationFrame(measure);
		};

		measure();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			if (frame) window.cancelAnimationFrame(frame);
		};
	}, []);

	return (
		<div
			ref={box}
			aria-hidden="true"
			data-testid="footer-wordmark"
			className="mx-auto mt-8 w-full max-w-6xl px-6 pb-6"
		>
			<svg
				viewBox={`0 0 ${COLUMNS} ${GLYPH_HEIGHT}`}
				className="block h-auto w-full"
				shapeRendering="crispEdges"
				role="presentation"
			>
				<defs>
					<g id={glyphsId}>
						{CELLS.map((cell) => (
							<rect
								key={cell.key}
								x={cell.x + CELL_INSET}
								y={cell.y + CELL_INSET}
								width={CELL_SIZE}
								height={CELL_SIZE}
							/>
						))}
					</g>
					<clipPath id={clipId}>
						<rect
							ref={clip}
							x="0"
							y={GLYPH_HEIGHT}
							width={COLUMNS}
							height="0"
						/>
					</clipPath>
				</defs>
				<use href={`#${glyphsId}`} fill="rgba(255,255,255,0.07)" />
				<use
					href={`#${glyphsId}`}
					fill="var(--color-amber)"
					clipPath={`url(#${clipId})`}
				/>
			</svg>
		</div>
	);
}

/**
 * Minimal landing footer: a quiet status row and the pixel wordmark. App pages
 * get none of the decoration — their footer is the plain status row.
 */
export function SiteFooter() {
	const { t } = useI18n();
	const landing =
		useRouterState({ select: (state) => state.location.pathname }) === "/";

	return (
		<footer className="relative z-20 overflow-hidden border-t border-line bg-graphite-950">
			<div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 pt-6 text-xs text-ink-3">
				<a
					href={SITE_GITHUB_URL}
					data-testid="footer-github"
					className="link-underline font-mono text-ink-2 hover:text-ink"
					rel="noreferrer noopener"
					target="_blank"
				>
					{t("landing.footer.github")}
				</a>
				<p className="flex items-center gap-2">
					<span>{t("landing.footer.builtFor")}</span>
					<span
						aria-hidden="true"
						className="inline-block h-1 w-1 rounded-full bg-teal"
					/>
					{t("landing.footer.tested")}
				</p>
			</div>
			{landing ? <PixelWordmark /> : null}
		</footer>
	);
}
