import { Link } from "@tanstack/react-router";
import { useI18n } from "#/lib/i18n/use-i18n";
import { useReveal } from "./reveal";

interface Token {
	word: string;
	italic: boolean;
}

/**
 * Parses `*bad day*` style emphasis out of a headline and re-splits it into
 * word tokens, carrying the italic flag. Locale-safe: nothing is reordered
 * or reworded, words inside a marker simply inherit the italic style.
 */
function parseEmphasis(text: string): Array<Token & { key: string }> {
	const segments = text.split(/\*([^*]+)\*/g);
	const tokens: Array<Token> = [];
	segments.forEach((segment, index) => {
		const italic = index % 2 === 1;
		for (const word of segment.split(" ")) {
			if (word.length > 0) tokens.push({ word, italic });
		}
	});
	const nth = new Map<string, number>();
	return tokens.map((token) => {
		const count = nth.get(token.word) ?? 0;
		nth.set(token.word, count + 1);
		return { ...token, key: `${token.word}-${count}` };
	});
}

/**
 * Section 00 - hero. Copy is in the DOM from the first paint; the headline
 * reveal is a mask translate with a 60 ms per-word stagger, run once.
 */
export function HeroCopy() {
	const { t } = useI18n();
	const reveal = useReveal();
	const tokens = parseEmphasis(t("landing.title"));

	return (
		<div ref={reveal}>
			<p className="eyebrow-amber reveal-fade">{t("landing.eyebrow")}</p>
			<h1
				className="display mt-7 max-w-[15ch] text-[clamp(3rem,7.2vw,6.5rem)] text-text"
				data-testid="hero-title"
			>
				{/* Screen readers get the sentence whole (markers stripped); the
						spans are the mask. */}
				<span className="sr-only">
					{tokens.map((token) => token.word).join(" ")}
				</span>
				{tokens.map((token, index) => (
					<span
						key={token.key}
						className="mr-[0.24em] inline-block overflow-hidden pb-[0.08em] align-top"
					>
						<span
							className={`reveal-inner ${token.italic ? "font-display italic" : ""}`}
							style={{ transitionDelay: `${index * 60}ms` }}
						>
							{token.word}
						</span>
					</span>
				))}
			</h1>
			<p
				className="reveal-fade mt-7 max-w-[52ch] text-base leading-relaxed text-muted sm:text-lg"
				style={{ transitionDelay: "240ms" }}
			>
				{t("landing.promise")}
			</p>
			<div
				className="reveal-fade mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
				style={{ transitionDelay: "340ms" }}
			>
				<span data-testid="hero-primary-cta" className="contents">
					<Link
						to="/demo"
						data-testid="hero-cta-demo"
						className="btn btn-primary btn-md press"
					>
						{t("landing.ctaDemo")}
					</Link>
				</span>
				<span data-testid="hero-secondary-cta" className="contents">
					<Link
						to="/rulebook"
						data-testid="hero-cta-rulebook"
						className="btn btn-ghost btn-md press"
					>
						{t("landing.ctaRulebook")}
					</Link>
				</span>
			</div>
			<p
				className="reveal-fade mt-5 font-mono text-xs text-muted"
				style={{ transitionDelay: "420ms" }}
			>
				{t("landing.demoNote")}
			</p>
		</div>
	);
}
