/**
 * Static stand-in for the persistent stage. Same visual language, no motion,
 * no script: a dot lattice receding in perspective plus a small amber cluster
 * near the incident origin. Used while the 3D chunk loads, when WebGL is
 * missing, and whenever motion is reduced or `?motion=off` is present.
 */
export function SceneFallback() {
	return (
		<div
			data-testid="hero-scene-fallback"
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
		>
			<svg
				viewBox="0 0 800 450"
				preserveAspectRatio="xMidYMid slice"
				className="h-full w-full"
				role="presentation"
			>
				<defs>
					<pattern
						id="stage-lattice"
						width="26"
						height="13"
						patternUnits="userSpaceOnUse"
					>
						<circle cx="4" cy="6" r="1.5" fill="#3bb89a" opacity="0.4" />
					</pattern>
					<linearGradient id="stage-fade" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor="#0b0c0e" stopOpacity="0.92" />
						<stop offset="0.45" stopColor="#0b0c0e" stopOpacity="0.1" />
						<stop offset="1" stopColor="#0b0c0e" stopOpacity="0.9" />
					</linearGradient>
					<radialGradient id="stage-incident" cx="0.5" cy="0.5" r="0.5">
						<stop offset="0" stopColor="#ffb020" stopOpacity="0.65" />
						<stop offset="1" stopColor="#ffb020" stopOpacity="0" />
					</radialGradient>
				</defs>

				<rect width="800" height="450" fill="#0b0c0e" />
				<g transform="translate(400 270) scale(1 0.5) skewX(-26) translate(-400 -270)">
					<rect
						x="-200"
						y="-100"
						width="1200"
						height="740"
						fill="url(#stage-lattice)"
					/>
				</g>
				<rect width="800" height="450" fill="url(#stage-fade)" />

				<circle
					cx="400"
					cy="270"
					r="120"
					fill="url(#stage-incident)"
					opacity="0.35"
				/>
				<circle cx="400" cy="270" r="3.4" fill="#ffb020" />
				<circle cx="362" cy="258" r="2.6" fill="#ffb020" opacity="0.7" />
				<circle cx="438" cy="282" r="2.6" fill="#ffb020" opacity="0.55" />
				<circle cx="420" cy="238" r="2" fill="#ffb020" opacity="0.4" />
			</svg>
			<div className="vignette relative" />
		</div>
	);
}
