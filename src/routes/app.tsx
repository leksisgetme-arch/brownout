import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireUser } from "#/server/auth/guards";

export const Route = createFileRoute("/app")({
	beforeLoad: async () => {
		await requireUser();
	},
	component: () => <Outlet />,
});
