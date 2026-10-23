export const BASE_SCORE = 100;
export const MTTA_GRACE_TICKS = 3;
export const WRONG_ACTION_PENALTY = 5;
export const SLA_BREACH_PENALTY = 10;
export const HINT_PENALTY = 5;

export type Grade = "A" | "B" | "C" | "D" | "F";

export const GRADE_THRESHOLDS: ReadonlyArray<{ grade: Grade; min: number }> = [
	{ grade: "A", min: 90 },
	{ grade: "B", min: 75 },
	{ grade: "C", min: 60 },
	{ grade: "D", min: 40 },
	{ grade: "F", min: 0 },
];

export interface ScoreInput {
	/** Tick of the first mitigation action, or null when none was taken. */
	firstActionTick: number | null;
	maxTicks: number;
	wrongActions: number;
	slaBreachWindows: number;
	hintsUsed: number;
}

export interface ScoreBreakdown {
	base: number;
	mttaTicks: number;
	mttaPenalty: number;
	wrongActionPenalty: number;
	slaPenalty: number;
	hintPenalty: number;
	total: number;
	grade: Grade;
}

export function gradeFor(total: number): Grade {
	for (const { grade, min } of GRADE_THRESHOLDS) {
		if (total >= min) return grade;
	}
	return "F";
}

export function clampScore(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, Math.round(value)));
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
	const mttaTicks = input.firstActionTick ?? input.maxTicks;
	const mttaPenalty = Math.max(0, mttaTicks - MTTA_GRACE_TICKS);
	const wrongActionPenalty =
		Math.max(0, input.wrongActions) * WRONG_ACTION_PENALTY;
	const slaPenalty = Math.max(0, input.slaBreachWindows) * SLA_BREACH_PENALTY;
	const hintPenalty = Math.max(0, input.hintsUsed) * HINT_PENALTY;

	const total = clampScore(
		BASE_SCORE - mttaPenalty - wrongActionPenalty - slaPenalty - hintPenalty,
	);

	return {
		base: BASE_SCORE,
		mttaTicks,
		mttaPenalty,
		wrongActionPenalty,
		slaPenalty,
		hintPenalty,
		total,
		grade: gradeFor(total),
	};
}
