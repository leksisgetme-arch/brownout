import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { isErrorCode } from "#/lib/errors";
import { messages } from "#/lib/i18n/messages";
import { useI18n } from "#/lib/i18n/use-i18n";
import { Button } from "./ui";

const en = messages.en;

export function GlobalError({ error, reset }: ErrorComponentProps) {
	const candidate = error as { code?: unknown; message?: unknown } | null;
	const code = isErrorCode(candidate?.code) ? candidate.code : "E-UNKNOWN-500";
	const message =
		typeof candidate?.message === "string" ? candidate.message : "";

	return (
		<div className="mx-auto max-w-2xl px-4 py-16" data-testid="error-boundary">
			<p className="font-mono text-xs font-semibold uppercase tracking-widest text-amber">
				{code}
			</p>
			<h1 className="mt-2 text-2xl font-semibold text-ink">
				{en["error.boundaryTitle"]}
			</h1>
			<p className="mt-2 text-sm text-ink-3">{en["error.boundaryBody"]}</p>
			{message ? (
				<pre className="mt-4 overflow-x-auto rounded border border-line bg-graphite-900 p-3 text-xs text-ink-2">
					{message}
				</pre>
			) : null}
			<div className="mt-6 flex gap-3">
				<Button onClick={reset} data-testid="error-retry">
					{en["common.retry"]}
				</Button>
				<Link
					to="/"
					search={{ motion: undefined }}
					className="inline-flex items-center rounded-md border border-line-strong px-3.5 py-2 text-sm text-ink hover:bg-graphite-900"
				>
					{en["common.back"]}
				</Link>
			</div>
		</div>
	);
}

export function NotFoundPage() {
	const { t } = useI18n();
	return (
		<div className="mx-auto max-w-2xl px-4 py-16" data-testid="not-found">
			<p className="font-mono text-xs font-semibold uppercase tracking-widest text-amber">
				E-NOT-FOUND-404
			</p>
			<h1 className="mt-2 text-2xl font-semibold text-ink">
				{t("error.notFoundTitle")}
			</h1>
			<p className="mt-2 text-sm text-ink-3">{t("error.notFoundBody")}</p>
			<Link
				to="/"
				search={{ motion: undefined }}
				className="mt-6 inline-flex rounded-md border border-line-strong px-3.5 py-2 text-sm text-ink hover:bg-graphite-900"
				data-testid="not-found-home"
			>
				{t("common.back")}
			</Link>
		</div>
	);
}
