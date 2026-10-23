import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createField, HIGH_NODE_COUNT } from "./field";
import { pushWave, sceneTargets, wavePool } from "./state";
import { sampleTimeline } from "./timeline";

const BODY = new THREE.Color("#16181c");
const BODY_EDGE = new THREE.Color("#242830");
const TEAL_PAYLOAD = new THREE.Color("#3bb89a").multiplyScalar(1.7);
const TEAL_DIM = new THREE.Color("#0f322b");
const AMBER = new THREE.Color("#ffb020").multiplyScalar(1.9);
const AMBER_BODY = new THREE.Color("#3a2708");

const SHOCK_SPEED = 20; // world units across the brownout passage
const RIPPLE_SPEED = 6.5; // world units per second, recovery
const RIPPLE_WIDTH = 1.6;
const FIELD_SPAN = 22;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothStep = (t: number): number => t * t * (3 - 2 * t);

/**
 * Two instanced draws: dark anodized bodies and their thin emissive top
 * strips. Bodies are procedural RoundedBoxGeometry; no GLB assets anywhere.
 * The per-frame loop reads the damped scene state and never touches React.
 */
export function Nodes({ count }: { count: number }) {
	const meshRef = useRef<THREE.InstancedMesh>(null);
	const stripRef = useRef<THREE.InstancedMesh>(null);
	const { scene } = useThree();

	const field = useMemo(() => createField(HIGH_NODE_COUNT), []);
	const activeField = useMemo(() => field.slice(0, count), [field, count]);

	const geometry = useMemo(
		() => new RoundedBoxGeometry(0.36, 1, 0.36, 2, 0.07),
		[],
	);
	const stripGeometry = useMemo(
		() => new THREE.BoxGeometry(0.34, 0.03, 0.34),
		[],
	);

	const bodyMaterial = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				color: "#ffffff",
				metalness: 0.78,
				roughness: 0.38,
				envMapIntensity: 0.4,
			}),
		[],
	);
	const stripMaterial = useMemo(
		() => new THREE.MeshBasicMaterial({ color: "#ffffff" }),
		[],
	);

	useEffect(
		() => () => {
			geometry.dispose();
			stripGeometry.dispose();
			bodyMaterial.dispose();
			stripMaterial.dispose();
		},
		[geometry, stripGeometry, bodyMaterial, stripMaterial],
	);

	const scratch = useRef({
		dummy: new THREE.Object3D(),
		color: new THREE.Color(),
		shockRadius: 0,
		rise: 0,
	});

	useEffect(() => {
		const strip = stripRef.current;
		if (!strip) return;
		for (let i = 0; i < count; i += 1) strip.setColorAt(i, TEAL_DIM);
		if (strip.instanceColor) strip.instanceColor.needsUpdate = true;
	}, [count]);

	useFrame((frameState) => {
		const mesh = meshRef.current;
		const strip = stripRef.current;
		if (!mesh || !strip) return;

		const time = frameState.clock.elapsedTime;
		const progress = sceneTargets.narrative;
		const sample = sampleTimeline(progress);
		const node = sample.node;
		const scratchRef = scratch.current;
		const { dummy, color } = scratchRef;

		// Hero entrance: nodes rise in one staggered wave on load (once).
		scratchRef.rise = clamp01(time / 1.6);
		const rise = smoothStep(scratchRef.rise);

		// Mitigate pointer: raycast into the field plane while it is held.
		let pointerWorld: THREE.Vector3 | null = null;
		if (sceneTargets.pointerSeed > 0 && sceneTargets.interaction > 0.5) {
			const raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(
				new THREE.Vector2(sceneTargets.pointerX, sceneTargets.pointerY),
				frameState.camera,
			);
			const hit = new THREE.Vector3();
			if (
				raycaster.ray.intersectPlane(
					new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
					hit,
				)
			) {
				pointerWorld = hit;
			}
		}

		// Recovery clicks become a time-based ripple + a cluster pick.
		if (sceneTargets.clickSeed > wavePool.lastProcessedClick) {
			wavePool.lastProcessedClick = sceneTargets.clickSeed;
			const raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(
				new THREE.Vector2(sceneTargets.pointerX, sceneTargets.pointerY),
				frameState.camera,
			);
			const hit = new THREE.Vector3();
			if (
				raycaster.ray.intersectPlane(
					new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
					hit,
				)
			) {
				pushWave({ x: hit.x, z: hit.z, t0: time });
				sceneTargets.onHit?.(hit.x, hit.z);
			}
		}

		// Brownout shockwave: directly scroll driven, so scrolling back
		// pulls the ring inward along the same curve.
		const flareProgress = clamp01((progress - 1.55) / 1.35);
		const originFlare =
			progress > 1.55 && progress < 2.9
				? smoothStep(clamp01((progress - 1.55) / 0.35)) *
					(1 - smoothStep(clamp01((progress - 2.6) / 0.3)))
				: 0;
		const shockRadius = flareProgress > 0 ? flareProgress * SHOCK_SPEED : -10;

		// The scrubber mirror applies while section 05 owns the stage.
		const mirror = sceneTargets.amberFraction;
		const scrubActive = progress > 4.45 && progress < 5.55;

		for (let i = 0; i < activeField.length; i += 1) {
			const n = activeField[i] as {
				x: number;
				z: number;
				height: number;
				phase: number;
				seed: number;
				ringAngle: number;
				ringRadius: number;
			};
			const dist = Math.hypot(n.x, n.z);

			// Entrance wave lands nodes outward-in over ~1.6 s.
			const staggerEntry = clamp01(
				rise * 1.4 - (dist / FIELD_SPAN) * 0.3 - n.seed * 0.1,
			);
			const entrance = smoothStep(staggerEntry);

			const idle =
				Math.sin(time * 1.1 + n.phase) * 0.06 +
				Math.cos(time * 0.7 + n.seed * 9) * 0.04;

			// Score ring migration: mix from terrain home to ring home.
			const ringT = smoothStep(clamp01(node.ring * 1.4 - n.seed * 0.4));
			const ringHomeX = Math.cos(n.ringAngle) * n.ringRadius;
			const ringHomeZ = Math.sin(n.ringAngle) * n.ringRadius;
			const x = n.x + (ringHomeX - n.x) * ringT;
			const z = n.z + (ringHomeZ - n.z) * ringT;

			// Close: the field recedes toward the horizon.
			const recedeT = smoothStep(clamp01(node.recede * 1.25 - n.seed * 0.25));
			const shrink = 1 - recedeT * 0.5;

			const bodyHeight =
				(n.height + idle * node.breath) *
					entrance *
					shrink *
					(1 - ringT * 0.55) +
				ringT * (n.height * 0.35 + 0.25);

			let wobble = 0;
			let band = 0;
			if (shockRadius > 0) {
				const dOrigin = dist;
				band =
					Math.exp(-((dOrigin - shockRadius) ** 2) / 3.2) *
					flareProgress *
					clamp01(node.wobble * 1.2);
				wobble = (Math.sin(time * 4.2 + n.phase * 3) * 0.5 + 0.5) * band * 0.28;
			}

			// Recovery ripples: time-based, teal band outward. Waves pushed
			// from the DOM arrive with t0 = -1 and are stamped here, once.
			let ripple = 0;
			for (let w = 0; w < wavePool.waves.length; w += 1) {
				const wave = wavePool.waves[w] as { x: number; z: number; t0: number };
				if (wave.t0 < 0) wave.t0 = time;
				const age = time - wave.t0;
				if (age < 0 || age > 4) continue;
				const d = Math.hypot(n.x - wave.x, n.z - wave.z);
				const ring = Math.exp(
					-((d - age * RIPPLE_SPEED) ** 2) / (RIPPLE_WIDTH * RIPPLE_WIDTH),
				);
				ripple = Math.max(ripple, ring * Math.exp(-age * 0.55));
			}

			// Mitigate: soft radius highlight under the pointer.
			let pointerGlow = 0;
			if (pointerWorld) {
				const d = Math.hypot(n.x - pointerWorld.x, n.z - pointerWorld.z);
				pointerGlow = Math.exp(-(d * d) / 3.4) * sceneTargets.interaction;
			}

			// Scrubber mirror: deterministic fringe of amber nodes.
			const amber = scrubActive && n.seed < mirror;

			dummy.position.set(
				x,
				bodyHeight * 0.92 +
					wobble +
					(ripple + pointerGlow * 0.6) * 0.45 -
					(1 - entrance) * 1.2,
				z + recedeT * n.z * 0.25,
			);
			const bodyScale = Math.max(0.001, bodyHeight);
			dummy.scale.set(0.85 + n.seed * 0.35, bodyScale, 0.85 + n.seed * 0.35);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);

			dummy.position.y += bodyScale * 0.5;
			dummy.updateMatrix();
			strip.setMatrixAt(i, dummy.matrix);

			// Body colour: anodized dark, warmed by ripple or amber fringe.
			const glow = Math.max(ripple * 0.85, pointerGlow * 0.5);
			color.copy(BODY).lerp(BODY_EDGE, clamp01(0.2 + glow * 1.4));
			if (originFlare > 0 && dist < 0.9) color.lerp(AMBER_BODY, originFlare);
			if (band > 0.05) color.lerp(AMBER_BODY, clamp01(band));
			else if (amber) color.lerp(AMBER_BODY, 0.85);
			if (node.strip < 0.55) color.lerp(BODY, 0.12);
			mesh.setColorAt(i, color);

			// Strip colour: teal payload; amber only for the incident states.
			const breath =
				0.72 + 0.28 * Math.sin(time * 1.9 + n.phase * 2 + dist * 0.12);
			color
				.copy(TEAL_DIM)
				.lerp(
					TEAL_PAYLOAD,
					clamp01(
						node.strip * breath * 0.72 + ripple * 0.85 + pointerGlow * 0.7,
					),
				);
			if (originFlare > 0 && dist < 0.9) color.lerp(AMBER, originFlare);
			if (band > 0.04) color.lerp(AMBER, clamp01(band * 1.1));
			else if (amber) color.lerp(AMBER, 0.8);
			if (recedeT > 0.4) color.multiplyScalar(1 - (recedeT - 0.4) * 1.6);
			strip.setColorAt(i, color);
		}

		mesh.count = activeField.length;
		strip.count = activeField.length;
		mesh.instanceMatrix.needsUpdate = true;
		strip.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		if (strip.instanceColor) strip.instanceColor.needsUpdate = true;

		const fog = scene.fog as THREE.FogExp2 | null;
		if (fog) fog.density = sample.light.fogDensity;
	});

	return (
		<group>
			<instancedMesh
				ref={meshRef}
				args={[geometry, bodyMaterial, HIGH_NODE_COUNT]}
				frustumCulled={false}
			/>
			<instancedMesh
				ref={stripRef}
				args={[stripGeometry, stripMaterial, HIGH_NODE_COUNT]}
				frustumCulled={false}
			/>
		</group>
	);
}
