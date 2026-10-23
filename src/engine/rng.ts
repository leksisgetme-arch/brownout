/**
 * Seeded pseudo-random generator (mulberry32). Deterministic across runtimes and
 * independent of ambient randomness. src/engine must never read the wall clock.
 */
export interface Rng {
	next(): number;
	int(maxExclusive: number): number;
	pick<T>(items: readonly T[]): T;
	chance(probability: number): boolean;
}

export function normaliseSeed(seed: number): number {
	if (!Number.isFinite(seed)) return 0;
	const truncated = Math.trunc(seed);
	return truncated >>> 0;
}

export function createRng(seed: number): Rng {
	let state = normaliseSeed(seed);

	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	return {
		next,
		int(maxExclusive: number): number {
			if (maxExclusive <= 0) return 0;
			return Math.floor(next() * maxExclusive);
		},
		pick<T>(items: readonly T[]): T {
			if (items.length === 0) {
				throw new Error("E-INPUT-400 Cannot pick from an empty list");
			}
			return items[Math.floor(next() * items.length)] as T;
		},
		chance(probability: number): boolean {
			return next() < probability;
		},
	};
}
