import { Link } from "@tanstack/react-router";
import { REQUIREMENT_COVERAGE } from "#/lib/coverage";
import { useI18n } from "#/lib/i18n/use-i18n";
import { useReveal } from "./reveal";

const SAFETY_KEYS = [
	"landing.safety.1",
	"landing.safety.2",
	"landing.safety.3",
	"landing.safety.4",
] as const;

const ERROR_CODES = [
	"E-STATE-409",
	"E-BLD-TARGET",
	"E-SIG-401",
	"E-RATE-429",
] as const;

/**
 * Section 06 - close. The camera rises and the field recedes behind this
 * block; the same primary button returns for the final CTA. Safety notes and
 * the rulebook teaser keep their full copy and test ids in the DOM.
 */
export function ClosingSection() {
	const { t } = useI18n();
	const reveal = useReveal();
	const entries = REQUIREMENT_COVERAGE.slice(0, 6);

	return (
		<section
			ref={reveal}
			data-section-index={6}
			data-testid="section-06"
			className="section-block site-max"
			style={{ "--wash": "255 200 96" } as React.CSSProperties}
		>
			<span
				aria-hidden="true"
				className="wash"
				style={{ "--wash-x": "26%", "--wash-y": "24%" } as React.CSSProperties}
			/>
			<div className="grid gap-16 lg:grid-cols-12">
				<div className="lg:col-span-6">
					<p className="eyebrow reveal-fade">{t("landing.safety.eyebrow")}</p>
					<h2 className="display mt-4 text-[clamp(2.6rem,5vw,4.6rem)] text-text">
						{t("app.tagline")}
					</h2>
					<p className="reveal-fade mt-6 max-w-[48ch] text-base leading-relaxed text-muted">
						{t("landing.safety.body")}
					</p>

					<ul className="mt-10 space-y-0">
						{SAFETY_KEYS.map((key, index) => (
							<li
								key={key}
								className="reveal-fade flex items-start gap-4 border-t border-line py-4 last:border-b"
								style={{ transitionDelay: `${index * 70}ms` }}
							>
								<span
									aria-hidden="true"
									className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal"
								/>
								<span className="text-sm leading-relaxed text-muted">
									{t(key)}
								</span>
							</li>
						))}
					</ul>

					<div
						className="reveal-fade mt-12"
						style={{ transitionDelay: "120ms" }}
					>
						<Link
							to="/demo"
							data-testid="close-cta-demo"
							className="btn btn-primary btn-md press"
						>
							{t("landing.ctaDemo")}
						</Link>
					</div>
				</div>

				<div className="lg:col-span-5 lg:col-start-8">
					<p className="eyebrow reveal-fade">{t("landing.rulebook.eyebrow")}</p>
					<h2 className="display mt-4 text-[clamp(2.2rem,4vw,3.4rem)] text-text">
						{t("landing.rulebook.title")}
					</h2>
					<p className="reveal-fade mt-4 max-w-[48ch] text-sm leading-relaxed text-muted">
						{t("landing.rulebook.body")}
					</p>
					<Link
						to="/rulebook"
						className="link-underline reveal-fade mt-5 inline-block font-mono text-sm text-amber"
					>
						{t("landing.rulebook.link")}
					</Link>

					<div className="mt-10">
						<h3 className="data-label">{t("rulebook.functional")}</h3>
						<ul className="mt-3 space-y-0" data-testid="teaser-requirements">
							{entries.map((entry) => (
								<li
									key={entry.id}
									className="reveal-fade border-t border-line py-2.5"
								>
									<Link
										to="/rulebook"
										className="link-underline font-mono text-xs text-muted hover:text-text"
									>
										{entry.id}
									</Link>
									<span className="ml-3 text-xs text-muted">
										{entry.summary}
									</span>
								</li>
							))}
						</ul>
					</div>
					<div className="mt-8">
						<h3 className="data-label">{t("rulebook.errors")}</h3>
						<ul className="mt-3 space-y-0" data-testid="teaser-errors">
							{ERROR_CODES.map((code, index) => (
								<li
									key={code}
									className="reveal-fade border-t border-line py-2.5"
									style={{ transitionDelay: `${index * 60}ms` }}
								>
									<Link
										to="/rulebook"
										className="link-underline font-mono text-xs text-amber hover:text-text"
									>
										{code}
									</Link>
								</li>
							))}
						</ul>
					</div>
				</div>
			</div>
		</section>
	);
}
