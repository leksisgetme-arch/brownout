import type { ReactNode } from "react";

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

const buttonTones: Record<ButtonTone, string> = {
	primary: "bg-amber text-graphite-950 hover:bg-[#ffc449] ring-amber/30",
	secondary:
		"bg-surface text-text border border-line-strong hover:border-ink-3 hover:bg-surface-2",
	ghost:
		"bg-transparent text-muted border border-transparent hover:bg-surface hover:text-text",
	danger:
		"bg-transparent text-amber border border-amber/50 hover:bg-amber/10 hover:border-amber",
};

const baseButton =
	"press inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
	tone = "primary",
	className = "",
	type = "button",
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
	return (
		<button
			type={type}
			className={`${baseButton} ${buttonTones[tone]} ${className}`}
			{...props}
		/>
	);
}

export function Card({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={`rounded-lg border border-line bg-graphite-900/60 p-5 ${className}`}
		>
			{children}
		</section>
	);
}

export function PageHeader({
	title,
	subtitle,
	actions,
	eyebrow,
}: {
	title: string;
	subtitle?: string;
	actions?: ReactNode;
	eyebrow?: string;
}) {
	return (
		<header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div>
				{eyebrow ? (
					<p className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-amber">
						{eyebrow}
					</p>
				) : null}
				<h1 className="text-2xl font-medium tracking-[-0.02em] text-ink sm:text-3xl">
					{title}
				</h1>
				{subtitle ? (
					<p className="mt-2 max-w-2xl text-sm text-ink-3">{subtitle}</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			) : null}
		</header>
	);
}

type BadgeTone = "neutral" | "amber" | "green" | "red" | "blue";

const badgeTones: Record<BadgeTone, string> = {
	neutral: "border-line-strong bg-graphite-800/70 text-ink-2",
	amber: "border-amber/45 bg-amber/10 text-amber",
	green: "border-teal/45 bg-teal/10 text-teal",
	red: "border-amber/60 bg-amber/15 text-amber",
	blue: "border-teal/40 bg-teal/10 text-teal",
};

export function Badge({
	children,
	tone = "neutral",
	testId,
}: {
	children: ReactNode;
	tone?: BadgeTone;
	testId?: string;
}) {
	return (
		<span
			data-testid={testId}
			className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] ${badgeTones[tone]}`}
		>
			{children}
		</span>
	);
}

export function EmptyState({
	title,
	hint,
	testId,
	action,
}: {
	title: string;
	hint?: string;
	testId: string;
	action?: ReactNode;
}) {
	return (
		<div
			data-testid={testId}
			className="rounded-lg border border-dashed border-line-strong bg-graphite-900/30 px-6 py-10 text-center"
		>
			<p className="text-sm font-medium text-ink">{title}</p>
			{hint ? (
				<p className="mx-auto mt-1 max-w-md text-sm text-ink-3">{hint}</p>
			) : null}
			{action ? <div className="mt-4 flex justify-center">{action}</div> : null}
		</div>
	);
}

export function ErrorNotice({
	code,
	message,
	testId = "error-notice",
}: {
	code: string;
	message: string;
	testId?: string;
}) {
	return (
		<div
			role="alert"
			data-testid={testId}
			className="rounded border border-amber/45 bg-amber/10 px-4 py-3 text-sm text-ink"
		>
			<span
				className="mr-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-amber"
				data-testid="error-code"
			>
				{code}
			</span>
			<span className="text-ink-2">{message}</span>
		</div>
	);
}

export function Field({
	label,
	hint,
	htmlFor,
	children,
}: {
	label: string;
	hint?: string;
	htmlFor: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
				{label}
			</label>
			{children}
			{hint ? (
				<p id={`${htmlFor}-hint`} className="text-xs text-ink-3">
					{hint}
				</p>
			) : null}
		</div>
	);
}

export const inputClass =
	"w-full rounded border border-line-strong bg-graphite-950 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:border-amber";

export function DataRow({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
			<dt className="text-sm text-ink-3">{label}</dt>
			<dd className="text-right font-mono text-sm text-ink">{value}</dd>
		</div>
	);
}
