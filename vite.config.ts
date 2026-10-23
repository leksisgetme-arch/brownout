import netlify from "@netlify/vite-plugin-tanstack-start";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Netlify declares DEPLOY_TARGET=netlify in netlify.toml; Vercel and local dev
// keep Nitro. Both plugins own the server output, so only one may be active.
const onNetlify =
	process.env.DEPLOY_TARGET === "netlify" || process.env.NETLIFY === "true";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	// gsap ships CommonJS-only entry points. Bundling it for SSR keeps the
	// Netlify function free of bare `import { ScrollTrigger } from
	// "gsap/ScrollTrigger"` statements, which Node 24 rejects with
	// "Named export 'ScrollTrigger' not found".
	ssr: { noExternal: [/^gsap(\/|$)/] },
	plugins: [
		devtools(),
		onNetlify ? netlify() : nitro(),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
