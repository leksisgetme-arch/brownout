export const clamp01 = (value: number): number =>
	Math.min(1, Math.max(0, value));

export const smoothStep = (t: number): number => t * t * (3 - 2 * t);

export const lerp = (a: number, b: number, t: number): number =>
	a + (b - a) * t;
