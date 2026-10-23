/**
 * Scene state that is *not* React state. The scroll hook writes targets, the
 * canvas loop reads them and damps toward them every frame, and the mitigate
 * overlay writes pointer/click seeds here. One module singleton keeps the
 * render loop allocation-free.
 */

export interface RecoveryWave {
	/** World-space origin of the ripple, set by the frame loop or React. */
	x: number;
	z: number;
	/**ElapsedTime (canvas clock seconds) when the wave started. */
	t0: number;
}

export interface SceneTargets {
	/**
	 * Narrative progress in section units: 0 = hero (00), 6 = close (06).
	 * Continuous and reversible.
	 */
	narrative: number;
	/** Scrubber mirror: 0..1 fraction of nodes showing amber. */
	amberFraction: number;
	/** 1 while the Mitigate section owns the stage, eased by the hook. */
	interaction: number;
	/** Pointer NDC (-1..1), consumed by the canvas raycaster. */
	pointerX: number;
	pointerY: number;
	/** Monotonic id; >0 means "raycast this pointer and highlight". */
	pointerSeed: number;
	/** Monotonic id; >0 means "raycast and emit a recovery ripple". */
	clickSeed: number;
	/**
	 * Callback installed by the landing page so a world-space click can
	 * recover the cluster under it. Receives the hit's world coordinates.
	 */
	onHit: ((x: number, z: number) => void) | null;
}

export const sceneTargets: SceneTargets = {
	narrative: 0,
	amberFraction: 0.02,
	interaction: 0,
	pointerX: 0,
	pointerY: 0,
	pointerSeed: 0,
	clickSeed: 0,
	onHit: null,
};

/**
 * Damped chasing value: critically-damped-ish lerp that is dt-aware, so
 * reverse scrolling replays the same curve, and frame-rate independent.
 */
export function damp(
	current: number,
	target: number,
	lambda: number,
	dt: number,
): number {
	const t = 1 - Math.exp(-lambda * dt);
	const value = current + (target - current) * t;
	return Math.abs(value - target) < 1e-4 ? target : value;
}

export interface WavePool {
	waves: RecoveryWave[];
	lastProcessedClick: number;
	lastProcessedPointer: number;
}

export const wavePool: WavePool = {
	waves: [],
	lastProcessedClick: 0,
	lastProcessedPointer: 0,
};

export function pushWave(wave: RecoveryWave): void {
	if (wavePool.waves.length > 6) wavePool.waves.shift();
	wavePool.waves.push(wave);
}

/** ReMeasured every frame for data-speed DOM parallax to read directly. */
export const domScroll = {
	y: 0,
};
