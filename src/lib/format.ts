import type { Locale } from "./i18n/locale";

/** Always render timestamps in UTC so SSR and hydration agree. */
export function formatDateTime(iso: string | null, locale: Locale): string {
	if (!iso) return "—";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	const formatted = new Intl.DateTimeFormat(
		locale === "id" ? "id-ID" : "en-GB",
		{
			dateStyle: "medium",
			timeStyle: "short",
			timeZone: "UTC",
		},
	).format(date);
	return `${formatted} UTC`;
}
