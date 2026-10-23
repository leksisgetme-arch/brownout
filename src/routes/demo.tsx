import { createFileRoute, Link } from "@tanstack/react-router";
import { TickScrubberSection } from "#/components/landing/scrubber";
import { ScoreSection } from "#/components/landing/story-sections";
import { useDrillPreview } from "#/components/landing/use-drill-preview";
import { useI18n } from "#/lib/i18n/use-i18n";

export const Route = createFileRoute("/demo")({
	component: DemoPage,
});

/**
 * Public, read-only demo. It renders the engine output in the browser, so it
 * needs no session, no database row, and exposes no action buttons (FR-A4).
 */
function DemoPage() {
	const { t } = useI18n();
	const preview = useDrillPreview();

	return (
		<article className="mx-auto w-full max-w-5xl" data-testid="demo-page">
			<header className="border-b border-line pb-8">
				<p className="font-mono text-[11px] uppercase tracking-[0.24em] text-teal">
					{t("demo.readOnly")}
				</p>
				<h1 className="mt-4 text-[clamp(1.9rem,4vw,3rem)] font-medium leading-tight tracking-[-0.02em] text-ink">
					{t("demo.title")}
				</h1>
				<p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-ink-2">
					{t("demo.subtitle")}
				</p>
				<Link
					to="/"
					search={{ motion: undefined }}
					className="link-underline mt-6 inline-block font-mono text-xs text-amber"
				>
					{t("demo.back")}
				</Link>
			</header>

			<TickScrubberSection preview={preview} />
			<ScoreSection preview={preview} />
		</article>
	);
}
