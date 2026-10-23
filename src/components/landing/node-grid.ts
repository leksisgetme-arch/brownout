/**
 * The hero grid is described here once, so the WebGL scene and the static SVG
 * fallback draw the same thing and the keyboard control can pick the same
 * clusters as a click.
 */
export const GRID_COLUMNS = 20;
export const GRID_ROWS = 20;
export const NODE_COUNT = GRID_COLUMNS * GRID_ROWS;
export const NODE_SPACING = 0.92;
export const CLUSTER_RADIUS = 2.4;

export interface NodePosition {
	x: number;
	z: number;
	row: number;
	column: number;
}

export function nodePosition(index: number): NodePosition {
	const row = Math.floor(index / GRID_COLUMNS);
	const column = index % GRID_COLUMNS;
	return {
		column,
		row,
		x: (column - (GRID_COLUMNS - 1) / 2) * NODE_SPACING,
		z: (row - (GRID_ROWS - 1) / 2) * NODE_SPACING,
	};
}

/** Deterministic height jitter: no randomness, so the fallback matches the scene. */
export function nodeHeight(index: number): number {
	return 0.06 + ((index * 37) % 11) * 0.012;
}

export function clusterAround(
	index: number,
	radius = CLUSTER_RADIUS,
): number[] {
	const origin = nodePosition(index);
	const members: number[] = [];

	for (let row = 0; row < GRID_ROWS; row += 1) {
		for (let column = 0; column < GRID_COLUMNS; column += 1) {
			const dx = column - origin.column;
			const dz = row - origin.row;
			if (Math.hypot(dx, dz) <= radius) {
				members.push(row * GRID_COLUMNS + column);
			}
		}
	}

	return members;
}

/**
 * A fixed recovery order for the keyboard control, starting at the incident
 * origin and walking outward so the ripple reads the same as a click.
 */
/**
 * The WebGL stage field is larger than this grid; everything node-grid does
 * (clusters, keyboard origins) is mapped onto the same world space so the
 * ripple the viewer sees matches the counter the DOM reports.
 */
export const WORLD_SCALE = 1.5;

export function nodeGridToWorld(index: number): { x: number; z: number } {
	const position = nodePosition(index);
	return { x: position.x * WORLD_SCALE, z: position.z * WORLD_SCALE };
}

export function gridIndexFromWorld(x: number, z: number): number {
	const column = Math.round(
		x / WORLD_SCALE / NODE_SPACING + (GRID_COLUMNS - 1) / 2,
	);
	const row = Math.round(z / WORLD_SCALE / NODE_SPACING + (GRID_ROWS - 1) / 2);
	const clamped = (value: number, max: number) =>
		Math.min(Math.max(value, 0), max - 1);
	return clamped(row, GRID_ROWS) * GRID_COLUMNS + clamped(column, GRID_COLUMNS);
}

export const KEYBOARD_CLUSTER_ORIGINS: readonly number[] = [
	Math.floor(NODE_COUNT / 2) - Math.floor(GRID_COLUMNS / 2),
	Math.floor(NODE_COUNT / 2) - Math.floor(GRID_COLUMNS / 2) + 5,
	Math.floor(NODE_COUNT / 2) - Math.floor(GRID_COLUMNS / 2) - 5,
	Math.floor(NODE_COUNT / 2) + 3 * GRID_COLUMNS,
	Math.floor(NODE_COUNT / 2) - 3 * GRID_COLUMNS,
	Math.floor(NODE_COUNT / 2) + 6,
	Math.floor(NODE_COUNT / 2) - 6,
	Math.floor(NODE_COUNT / 2) + 6 * GRID_COLUMNS,
];
