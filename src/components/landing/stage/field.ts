/**
 * The node field is described once here so the WebGL scene and the static
 * fallback draw the same world. It is a golden-angle spiral over a slightly
 * warped plane: concentric terrain, deliberately not rows, with a seeded
 * generator so heights and phases are identical between reloads.
 */

export const HIGH_NODE_COUNT = 1600;
export const MED_NODE_COUNT = 800;
export const FIELD_RADIUS = 19;
/** Heavier nodes through the reading centre, sparse out to the fog. */
export const CORE_RADIUS = 13;
export const GOLDEN_ANGLE = 2.399963229728653;

export interface FieldNode {
	x: number;
	z: number;
	height: number;
	/** Per-node phase for idle breathing and pulse offsets. */
	phase: number;
	/** Seeded 0..1 used for scrubber mirroring and stagger. */
	seed: number;
	/** Cross-section slot when nodes migrate into the score ring. */
	ringAngle: number;
	ringRadius: number;
}

function mulberry(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const warp = (x: number, z: number): number =>
	Math.sin(x * 0.22 + z * 0.1) * 0.9 + Math.cos(z * 0.17 - x * 0.06) * 0.7;

/**
 * Concentric spiral layout. Density is weighted so the area in front of the
 * camera holds most nodes while the periphery dissolves into fog.
 */
function buildField(count: number): FieldNode[] {
	const random = mulberry(20260222);
	const nodes: FieldNode[] = [];
	const ringShare = 0.56; // share of the field that reaches the score ring

	for (let i = 0; i < count; i += 1) {
		const t = i / count;
		// Bias radius toward the core, then fade periphery outward.
		const bias =
			t < ringShare
				? t / ringShare
				: 0.62 + 0.38 * ((t - ringShare) / (1 - ringShare));
		const radius = FIELD_RADIUS * Math.sqrt(bias);
		const angle = i * GOLDEN_ANGLE;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);

		const x =
			radius * cos +
			warp(radius * cos, radius * sin) * (0.5 + (0.5 * radius) / FIELD_RADIUS);
		const z =
			radius * sin +
			warp(radius * sin, -radius * cos) * (0.5 + (0.5 * radius) / FIELD_RADIUS);

		const seedT = random();
		const height = 0.35 + seedT ** 2.2 * 2.9 + Math.sin(radius * 0.8) * 0.18;
		const ringAngle = seedT * Math.PI * 2;
		const ringRadius = 6.4 + (random() - 0.5) * 0.5;

		nodes.push({
			x,
			z,
			height,
			phase: angle + seedT * Math.PI * 2,
			seed: seedT,
			ringAngle,
			ringRadius,
		});
	}
	return nodes;
}

/** Build once per quality tier; the field is a constant of the tier. */
export function createField(count: number): FieldNode[] {
	return buildField(count);
}

/** Deterministic 0..1 keyed by index; used instead of Math.random anywhere. */
export function fieldNoise(i: number): number {
	return mulberry(i + 17)();
}

/** The incident origin sits in the middle of the field. */
export const ORIGIN_INDEX = 0;
