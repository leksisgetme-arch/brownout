import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_LOCALE, isLocale, type Locale } from "#/lib/i18n/locale";
import {
	currentSession,
	loginWithPassword,
	logout,
	readLocaleCookie,
	signupWithPassword,
	writeLocaleCookie,
} from "./auth.server";
import type { AuthResult, CredentialsInput } from "./types";

function asCredentials(input: unknown): CredentialsInput {
	const value = (input ?? {}) as Partial<CredentialsInput>;
	return {
		email: typeof value.email === "string" ? value.email : "",
		password: typeof value.password === "string" ? value.password : "",
	};
}

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const lookup = await currentSession();
		return { user: lookup.user, expired: lookup.expired };
	},
);

export const loginFn = createServerFn({ method: "POST" })
	.validator(asCredentials)
	.handler(async ({ data }): Promise<AuthResult> => loginWithPassword(data));

export const signupFn = createServerFn({ method: "POST" })
	.validator(asCredentials)
	.handler(async ({ data }): Promise<AuthResult> => signupWithPassword(data));

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
	await logout();
	return { ok: true as const };
});

export const getLocaleFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<Locale> => readLocaleCookie(),
);

export const setLocaleFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const value = (input ?? {}) as { locale?: unknown };
		return { locale: isLocale(value.locale) ? value.locale : DEFAULT_LOCALE };
	})
	.handler(async ({ data }) => {
		writeLocaleCookie(data.locale);
		return { ok: true as const, locale: data.locale };
	});
