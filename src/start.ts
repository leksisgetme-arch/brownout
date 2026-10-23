import { createMiddleware, createStart } from "@tanstack/react-start";
import { checkEnv } from "./server/env";

let envReported = false;

/**
 * Fail fast: the first server request validates the environment and logs one
 * actionable message. Server functions then throw E-ENV-500 with the same text.
 */
const environmentGuard = createMiddleware().server(({ next }) => {
	if (!envReported) {
		envReported = true;
		const result = checkEnv();
		if (!result.ok) {
			console.error(`[brownout] ${result.message}`);
		}
	}
	return next();
});

export const startInstance = createStart(() => ({
	requestMiddleware: [environmentGuard],
}));
