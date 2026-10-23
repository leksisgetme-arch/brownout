import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

const STORAGE_KEY = "brownout.motion";

interface MotionContextValue {
	/** False means "reduce": no scene, no scroll-linked motion. */
	motionEnabled: boolean;
	/** True once the client preference has been read, so 3D can mount safely. */
	ready: boolean;
	toggle: () => void;
}

const MotionContext = createContext<MotionContextValue>({
	motionEnabled: false,
	ready: false,
	toggle: () => {},
});

function readStored(): string | null {
	try {
		return window.localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeStored(value: "on" | "off"): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, value);
	} catch {
		// Private mode or a blocked storage partition: the toggle still works
		// for this page view, it just does not persist.
	}
}

export function MotionProvider({
	urlDisabled,
	children,
}: {
	/** `?motion=off` — known on the server, so the first paint is already static. */
	urlDisabled: boolean;
	children: ReactNode;
}) {
	const [override, setOverride] = useState<boolean | null>(null);
	const [stored, setStored] = useState<string | null>(null);
	const [systemReduced, setSystemReduced] = useState(false);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setStored(readStored());
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		setSystemReduced(query.matches);
		setReady(true);

		const onChange = (event: MediaQueryListEvent) =>
			setSystemReduced(event.matches);
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	const motionEnabled =
		override ??
		!(urlDisabled || stored === "off" || (stored === null && systemReduced));

	useEffect(() => {
		document.documentElement.classList.toggle("reduce-motion", !motionEnabled);
	}, [motionEnabled]);

	const toggle = useCallback(() => {
		setOverride((current) => {
			const next = !(current ?? motionEnabled);
			writeStored(next ? "on" : "off");
			return next;
		});
	}, [motionEnabled]);

	const value = useMemo(
		() => ({ motionEnabled, ready, toggle }),
		[motionEnabled, ready, toggle],
	);

	return (
		<MotionContext.Provider value={value}>{children}</MotionContext.Provider>
	);
}

export function useMotionPreference(): MotionContextValue {
	return useContext(MotionContext);
}
