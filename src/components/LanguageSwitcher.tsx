import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LOCALE_LABELS, LOCALES, type Locale } from "#/lib/i18n/locale";
import { useI18n } from "#/lib/i18n/use-i18n";
import { setLocaleFn } from "#/server/auth/functions";

export function LanguageSwitcher() {
	const { locale, t } = useI18n();
	const router = useRouter();
	const [pending, setPending] = useState<Locale | null>(null);

	async function change(next: Locale) {
		if (next === locale) return;
		setPending(next);
		try {
			await setLocaleFn({ data: { locale: next } });
			await router.invalidate();
		} finally {
			setPending(null);
		}
	}

	return (
		<span data-testid="lang-toggle" className="inline-flex">
			<fieldset
				className="m-0 flex items-center gap-1 p-0"
				data-testid="language-switcher"
			>
				<legend className="sr-only">{t("common.language")}</legend>
				{LOCALES.map((code) => (
					<button
						key={code}
						type="button"
						data-testid={`lang-${code}`}
						aria-pressed={locale === code}
						aria-label={LOCALE_LABELS[code]}
						disabled={pending !== null}
						onClick={() => void change(code)}
						className={`press rounded px-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
							locale === code ? "text-amber" : "text-ink-3 hover:text-ink"
						}`}
					>
						{code.toUpperCase()}
					</button>
				))}
			</fieldset>
		</span>
	);
}
