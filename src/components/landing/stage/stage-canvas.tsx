import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
	Bloom,
	EffectComposer,
	Noise,
	Vignette,
} from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Nodes } from "./nodes";
import { sceneTargets } from "./state";
import { sampleTimeline } from "./timeline";

export type QualityTier = "high" | "medium" | "low";

const TIER_NODES: Record<Exclude<QualityTier, "low">, number> = {
	high: 1600,
	medium: 800,
};

const KEY_LIGHT = new THREE.Color("#ffd9a6");
const RIM_LIGHT = new THREE.Color("#7fa6c9");
const AMBIENT = new THREE.Color("#2a3138");

interface RigTargets {
	position: THREE.Vector3;
	lookAt: THREE.Vector3;
}

function CameraRig() {
	const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
	const targets = useRef<RigTargets>({
		position: new THREE.Vector3(0, 8.2, 15.5),
		lookAt: new THREE.Vector3(0, 1.4, 0),
	});
	const look = useRef(new THREE.Vector3(0, 1.4, 0));

	useFrame((_, rawDelta) => {
		const dt = Math.min(rawDelta, 0.05);
		const sample = sampleTimeline(sceneTargets.narrative);
		const { position, lookAt, orbit } = sample.camera;

		const t = targets.current;
		t.position.set(position[0], position[1], position[2]);
		t.lookAt.set(lookAt[0], lookAt[1], lookAt[2]);

		// Orbit around the look target: rotate the offset vector in XZ.
		const offset = t.position.clone().sub(t.lookAt);
		if (orbit !== 0) {
			offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit * 0.9);
		}

		camera.position.lerp(t.lookAt.clone().add(offset), 1 - Math.exp(-3.2 * dt));
		look.current.lerp(t.lookAt, 1 - Math.exp(-3.2 * dt));
		camera.lookAt(look.current);
	});

	return null;
}

function LightsRig() {
	const keyRef = useRef<THREE.DirectionalLight>(null);
	const rimRef = useRef<THREE.DirectionalLight>(null);
	const ambRef = useRef<THREE.AmbientLight>(null);

	useFrame((_, rawDelta) => {
		const dt = Math.min(rawDelta, 0.05);
		const sample = sampleTimeline(sceneTargets.narrative);
		const k = 1 - Math.exp(-2.4 * dt);
		if (keyRef.current) {
			keyRef.current.intensity +=
				(sample.light.keyWarm * 2.1 - keyRef.current.intensity) * k;
			keyRef.current.color.setRGB(...sample.camera.keyTint);
		}
		if (rimRef.current) {
			rimRef.current.intensity +=
				(sample.light.rimCool * 1.6 - rimRef.current.intensity) * k;
			rimRef.current.color.setRGB(...sample.camera.rimTint);
		}
		if (ambRef.current) {
			ambRef.current.intensity +=
				(sample.light.ambient - ambRef.current.intensity) * k;
		}
	});

	return (
		<group>
			<ambientLight ref={ambRef} color={AMBIENT} intensity={0.5} />
			{/* Warm key: like a console room, slightly camera-left. */}
			<directionalLight
				ref={keyRef}
				position={[-6, 12, 8]}
				color={KEY_LIGHT}
				intensity={3}
			/>
			{/* Cool rim from the back-right edge of the field. */}
			<directionalLight
				ref={rimRef}
				position={[8, 5, -10]}
				color={RIM_LIGHT}
				intensity={1}
			/>
		</group>
	);
}

/** Faint radial floor: fakes reflection without a second render pass. */
function FloorPlane() {
	const texture = useMemo(() => {
		const size = 256;
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext("2d");
		if (context) {
			const gradient = context.createRadialGradient(
				size / 2,
				size / 2,
				0,
				size / 2,
				size / 2,
				size / 2,
			);
			gradient.addColorStop(0, "rgba(46, 52, 58, 0.55)");
			gradient.addColorStop(0.45, "rgba(16, 18, 21, 0.25)");
			gradient.addColorStop(1, "rgba(11, 12, 14, 0)");
			context.fillStyle = gradient;
			context.fillRect(0, 0, size, size);
		}
		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		return tex;
	}, []);

	useEffect(() => () => texture.dispose(), [texture]);

	return (
		<mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
			<planeGeometry args={[90, 90]} />
			<meshBasicMaterial
				map={texture}
				transparent
				depthWrite={false}
				opacity={0.5}
			/>
		</mesh>
	);
}

function PostEffects({ enabled }: { enabled: boolean }) {
	if (!enabled) return null;
	return (
		<EffectComposer multisampling={0} enableNormalPass={false}>
			<Bloom
				intensity={0.55}
				luminanceThreshold={0.55}
				luminanceSmoothing={0.25}
				mipmapBlur
			/>
			<Vignette offset={0.28} darkness={0.55} />
			<Noise opacity={0.022} premultiply />
		</EffectComposer>
	);
}

/** Rolling FPS monitor: downgrades the tier once, never thrashes. */
function useQualityTier(): QualityTier {
	const [tier, setTier] = useState<QualityTier>(() => {
		if (typeof navigator === "undefined") return "medium";
		const cores = navigator.hardwareConcurrency ?? 4;
		if (cores <= 2) return "medium";
		return "high";
	});

	useEffect(() => {
		if (tier === "medium") return;
		let frames = 0;
		let last = performance.now();
		let slowStreaks = 0;
		let raf = 0;

		const tick = () => {
			frames += 1;
			const now = performance.now();
			if (now - last >= 1000) {
				const fps = (frames * 1000) / (now - last);
				if (fps < 42) slowStreaks += 1;
				else slowStreaks = 0;
				if (slowStreaks >= 2 && tier === "high") {
					setTier("medium");
					return;
				}
				frames = 0;
				last = now;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [tier]);

	return tier;
}

interface StageCanvasProps {
	/** False while the landing hero must be static (no WebGL / motion off). */
	enabled: boolean;
}

/**
 * One fixed full-viewport canvas behind all content. pointer-events none:
 * interaction happens only through the mitigate overlay, never the canvas.
 */
export default function StageCanvas({ enabled }: StageCanvasProps) {
	const tier = useQualityTier();
	const [paused, setPaused] = useState(false);

	useEffect(() => {
		const onVisibility = () => setPaused(document.hidden);
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, []);

	if (!enabled || tier === "low") return null;

	const running = !paused;

	return (
		<div
			data-testid="stage-canvas"
			className="pointer-events-none fixed inset-0 z-0"
		>
			<Canvas
				aria-hidden="true"
				dpr={[1, 1.5]}
				frameloop={running ? "always" : "never"}
				camera={{ fov: 38, near: 0.1, far: 90, position: [0, 8, 15.5] }}
				gl={{
					antialias: tier === "high",
					powerPreference: "high-performance",
					toneMapping: THREE.ACESFilmicToneMapping,
				}}
			>
				<color attach="background" args={["#0b0c0e"]} />
				<fogExp2 attach="fog" args={["#0b0c0e", 0.052]} />
				<CameraRig />
				<LightsRig />
				<FloorPlane />
				<Nodes count={tier === "high" ? TIER_NODES.high : TIER_NODES.medium} />
				<Suspense fallback={null}>
					<PostEffects enabled={tier === "high"} />
				</Suspense>
			</Canvas>
		</div>
	);
}
