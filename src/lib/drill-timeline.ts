import type { RunLogEntry } from "#/engine";
import type { MessageKey } from "./i18n/messages";

export type TimelineTranslator = (
	key: MessageKey,
	vars?: Record<string, string | number>,
) => string;

export interface TimelineLine {
	key: string;
	tick: number;
	text: string;
	tone: "text-ink-2" | "text-amber" | "text-teal";
}

/**
 * One readable line for an engine log entry. Metrics are charted elsewhere, so
 * only deliveries, actions, and state transitions become timeline lines; those
 * are exactly the facts an incident review argues about.
 */
export function runLogLine(
	entry: RunLogEntry,
	t: TimelineTranslator,
): TimelineLine | null {
	if (entry.kind === "delivery") {
		const failed = entry.status === "dead_letter" || entry.status === "failed";
		return {
			key: `delivery-${entry.tick}-${entry.seq}-${entry.attempt}-${entry.status}`,
			tick: entry.tick,
			text: t("rulebook.walk.delivery", {
				seq: entry.seq,
				status: entry.status,
				failure: entry.failure ? ` (${entry.failure})` : "",
			}),
			tone: failed ? "text-amber" : "text-ink-2",
		};
	}
	if (entry.kind === "action") {
		return {
			key: `action-${entry.tick}-${entry.action}-${entry.correct ? "ok" : "wrong"}`,
			tick: entry.tick,
			text: t("rulebook.walk.actionLine", {
				action: entry.action,
				verdict: entry.correct
					? t("rulebook.walk.correct")
					: t("rulebook.walk.incorrect"),
			}),
			tone: entry.correct ? "text-teal" : "text-amber",
		};
	}
	if (entry.kind === "state") {
		return {
			key: `state-${entry.tick}-${entry.from}-${entry.to}`,
			tick: entry.tick,
			text: t("rulebook.walk.stateLine", { from: entry.from, to: entry.to }),
			tone:
				entry.to === "RESOLVED"
					? "text-teal"
					: entry.to === "FAILED"
						? "text-amber"
						: "text-ink-2",
		};
	}
	return null;
}
