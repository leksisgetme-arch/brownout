import { useAppContext } from "#/lib/app-context";
import { type MessageKey, t } from "./messages";

export function useI18n() {
	const { locale } = useAppContext();
	return {
		locale,
		t: (key: MessageKey, vars?: Record<string, string | number>) =>
			t(locale, key, vars),
	};
}
