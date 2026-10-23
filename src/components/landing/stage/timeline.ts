/**
 * The scene is a pure function of scroll progress. This timeline declares, in
 * one typed table, how the camera, lights, fog, and node behaviours move
 * through the six sections. Everything downstream is interpolation between
 * these keyframes; reverse scrolling replays the same curves backward.
 */

import type { MessageKey } from "#/lib/i18n/messages";

export type SectionKey =
	| "hero"
	| "healthy"
	| "brownout"
	| "mitigate"
	| "score"
	| "scrubber"
	| "close";

/**
 * i18n key per section centre, used by the screen-reader status line. The
 * index matches narrative units 0..6 (hero 00 .. close 06).
 */
export const PHASE_I18N_KEYS = [
	"landing.story.eyebrow",
	"landing.story.1.title",
	"landing.story.2.title",
	"landing.story.3.title",
	"landing.story.4.title",
	"landing.scrubber.title",
	"landing.score.total",
] as const satisfies readonly MessageKey[];

export type Vec3 = readonly [number, number, number];
/** Linear-light RGB triple, 0..1, so tints mix numerically. */
export type Tint = readonly [number, number, number];

export interface CameraKey {
	/** Camera position at the section's centre. */
	position: Vec3;
	/** LookAt target at the section's centre. */
	lookAt: Vec3;
	/** Extra orbit around the lookAt axis, radians, progress driven. */
	orbit: number;
	/** Key and rim light tints at the section's centre. */
	keyTint: Tint;
	rimTint: Tint;
}

export interface NodeKey {
	/** Idle breathing amplitude. */
	breath: number;
	/** Emissive strip intensity multiplier for the teal state. */
	strip: number;
	/** Wobble amplitude multiplier (brownout band). */
	wobble: number;
	/** 0..1: how much the field has migrated to the score ring. */
	ring: number;
	/** 0..1: nodes receding toward the horizon (close). */
	recede: number;
}

export interface LightKey {
	keyWarm: number;
	rimCool: number;
	ambient: number;
	fogDensity: number;
}

export interface SectionBeat {
	camera: CameraKey;
	node: NodeKey;
	light: LightKey;
	/** Shockwave strength for the section, 0..1. */
	shock: number;
	/** Grain/vignette lift on the 2D dressing, 0..1. */
	darkening: number;
}

const HERO: SectionBeat = {
	camera: {
		position: [0, 8.2, 15.5],
		lookAt: [0, 1.4, 0],
		orbit: 0,
		keyTint: [1, 0.86, 0.66],
		rimTint: [0.5, 0.62, 0.82],
	},
	node: { breath: 0.35, strip: 0.55, wobble: 0, ring: 0, recede: 0 },
	light: { keyWarm: 1.5, rimCool: 0.65, ambient: 0.5, fogDensity: 0.052 },
	shock: 0,
	darkening: 0,
};

const HEALTHY: SectionBeat = {
	camera: {
		position: [0, 2.6, 17.5],
		lookAt: [0, 1, 0],
		orbit: 0,
		keyTint: [0.72, 1, 0.88],
		rimTint: [0.36, 0.72, 0.66],
	},
	node: { breath: 1, strip: 1, wobble: 0, ring: 0, recede: 0 },
	light: { keyWarm: 1.15, rimCool: 0.85, ambient: 0.42, fogDensity: 0.045 },
	shock: 0,
	darkening: 0,
};

const BROWNOUT: SectionBeat = {
	camera: {
		position: [2.4, 5.6, 12.5],
		lookAt: [0, 1.1, 0],
		orbit: 0.36,
		keyTint: [1, 0.76, 0.44],
		rimTint: [0.82, 0.42, 0.24],
	},
	node: { breath: 0.6, strip: 0.5, wobble: 1, ring: 0, recede: 0 },
	light: { keyWarm: 0.9, rimCool: 0.55, ambient: 0.3, fogDensity: 0.06 },
	shock: 1,
	darkening: 0.35,
};

const MITIGATE: SectionBeat = {
	camera: {
		position: [4.5, 12.5, 7.5],
		lookAt: [0, 0, 0],
		orbit: 0,
		keyTint: [0.8, 0.86, 1],
		rimTint: [0.44, 0.52, 0.9],
	},
	node: { breath: 0.5, strip: 0.8, wobble: 0.25, ring: 0, recede: 0 },
	light: { keyWarm: 1.35, rimCool: 0.7, ambient: 0.46, fogDensity: 0.05 },
	shock: 0.2,
	darkening: 0,
};

const SCORE: SectionBeat = {
	camera: {
		position: [0, 9.5, 10.5],
		lookAt: [0, 2.6, 0],
		orbit: -0.14,
		keyTint: [1, 0.9, 0.62],
		rimTint: [0.62, 0.5, 0.94],
	},
	node: { breath: 0.4, strip: 1.05, wobble: 0, ring: 1, recede: 0.35 },
	light: { keyWarm: 1.05, rimCool: 0.95, ambient: 0.5, fogDensity: 0.058 },
	shock: 0,
	darkening: 0.1,
};

const SCRUBBER: SectionBeat = {
	camera: {
		position: [0, 10.5, 9.5],
		lookAt: [0, 1.4, 0],
		orbit: 0,
		keyTint: [0.64, 0.78, 1],
		rimTint: [0.3, 0.44, 0.8],
	},
	node: { breath: 0.55, strip: 0.6, wobble: 0, ring: 0, recede: 0 },
	light: { keyWarm: 0.85, rimCool: 0.5, ambient: 0.34, fogDensity: 0.065 },
	shock: 0,
	darkening: 0.6,
};

const CLOSE: SectionBeat = {
	camera: {
		position: [0, 16.5, 6.5],
		lookAt: [0, 1.2, -6],
		orbit: 0,
		keyTint: [1, 0.85, 0.6],
		rimTint: [0.7, 0.56, 0.92],
	},
	node: { breath: 0.4, strip: 0.5, wobble: 0, ring: 0, recede: 1 },
	light: { keyWarm: 0.8, rimCool: 0.9, ambient: 0.6, fogDensity: 0.075 },
	shock: 0,
	darkening: 0.2,
};

/**
 * Keyframes at each section centre, in scroll order 00..06. The value at
 * narrative n interpolates between BEATS[floor] and BEATS[ceil].
 */
export const BEATS: readonly SectionBeat[] = [
	HERO,
	HEALTHY,
	BROWNOUT,
	MITIGATE,
	SCORE,
	SCRUBBER,
	CLOSE,
];

export const LAST_SECTION = BEATS.length - 1;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth the transition between beats so sections hand over continuously. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

export interface Sample {
	camera: CameraKey;
	node: NodeKey;
	light: LightKey;
	shock: number;
	darkening: number;
}

function mixCamera(a: CameraKey, b: CameraKey, t: number): CameraKey {
	return {
		position: [
			lerp(a.position[0], b.position[0], t),
			lerp(a.position[1], b.position[1], t),
			lerp(a.position[2], b.position[2], t),
		],
		lookAt: [
			lerp(a.lookAt[0], b.lookAt[0], t),
			lerp(a.lookAt[1], b.lookAt[1], t),
			lerp(a.lookAt[2], b.lookAt[2], t),
		],
		orbit: lerp(a.orbit, b.orbit, t),
		keyTint: [
			lerp(a.keyTint[0], b.keyTint[0], t),
			lerp(a.keyTint[1], b.keyTint[1], t),
			lerp(a.keyTint[2], b.keyTint[2], t),
		],
		rimTint: [
			lerp(a.rimTint[0], b.rimTint[0], t),
			lerp(a.rimTint[1], b.rimTint[1], t),
			lerp(a.rimTint[2], b.rimTint[2], t),
		],
	};
}

export function sampleTimeline(narrative: number): Sample {
	const clamped = Math.min(Math.max(narrative, 0), LAST_SECTION);
	const index = Math.floor(clamped);
	const next = Math.min(index + 1, LAST_SECTION);
	const t = smooth(narrative - index);

	const a = BEATS[index] as SectionBeat;
	const b = BEATS[next] as SectionBeat;

	return {
		camera: index === next ? { ...a.camera } : mixCamera(a.camera, b.camera, t),
		node: {
			breath: lerp(a.node.breath, b.node.breath, t),
			strip: lerp(a.node.strip, b.node.strip, t),
			wobble: lerp(a.node.wobble, b.node.wobble, t),
			ring: lerp(a.node.ring, b.node.ring, t),
			recede: lerp(a.node.recede, b.node.recede, t),
		},
		light: {
			keyWarm: lerp(a.light.keyWarm, b.light.keyWarm, t),
			rimCool: lerp(a.light.rimCool, b.light.rimCool, t),
			ambient: lerp(a.light.ambient, b.light.ambient, t),
			fogDensity: lerp(a.light.fogDensity, b.light.fogDensity, t),
		},
		shock: lerp(a.shock, b.shock, t),
		darkening: lerp(a.darkening, b.darkening, t),
	};
}
