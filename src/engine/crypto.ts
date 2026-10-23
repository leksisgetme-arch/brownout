/**
 * Minimal SHA-256 / HMAC-SHA256 in pure TypeScript.
 *
 * The engine must run identically in Node and the browser and must not import
 * node:crypto, so the receiver can verify signatures inside the pure domain.
 * Correctness is pinned against node:crypto in tests/engine-crypto.test.ts.
 */

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
	return (value >>> bits) | (value << (32 - bits));
}

export function sha256(input: Uint8Array): Uint8Array {
	const bitLength = input.length * 8;
	const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
	const buffer = new Uint8Array(paddedLength);
	buffer.set(input);
	buffer[input.length] = 0x80;

	const view = new DataView(buffer.buffer);
	view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
	view.setUint32(paddedLength - 4, bitLength >>> 0);

	const state = new Uint32Array([
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
		0x1f83d9ab, 0x5be0cd19,
	]);
	const words = new Uint32Array(64);

	for (let offset = 0; offset < paddedLength; offset += 64) {
		for (let index = 0; index < 16; index += 1) {
			words[index] = view.getUint32(offset + index * 4);
		}
		for (let index = 16; index < 64; index += 1) {
			const w15 = words[index - 15] as number;
			const w2 = words[index - 2] as number;
			const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
			const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
			words[index] =
				((words[index - 16] as number) +
					s0 +
					(words[index - 7] as number) +
					s1) >>>
				0;
		}

		let a = state[0] as number;
		let b = state[1] as number;
		let c = state[2] as number;
		let d = state[3] as number;
		let e = state[4] as number;
		let f = state[5] as number;
		let g = state[6] as number;
		let h = state[7] as number;

		for (let index = 0; index < 64; index += 1) {
			const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const t1 =
				(h + s1 + ch + (K[index] as number) + (words[index] as number)) >>> 0;
			const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const t2 = (s0 + maj) >>> 0;

			h = g;
			g = f;
			f = e;
			e = (d + t1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) >>> 0;
		}

		state[0] = ((state[0] as number) + a) >>> 0;
		state[1] = ((state[1] as number) + b) >>> 0;
		state[2] = ((state[2] as number) + c) >>> 0;
		state[3] = ((state[3] as number) + d) >>> 0;
		state[4] = ((state[4] as number) + e) >>> 0;
		state[5] = ((state[5] as number) + f) >>> 0;
		state[6] = ((state[6] as number) + g) >>> 0;
		state[7] = ((state[7] as number) + h) >>> 0;
	}

	const output = new Uint8Array(32);
	const outView = new DataView(output.buffer);
	for (let index = 0; index < 8; index += 1) {
		outView.setUint32(index * 4, state[index] as number);
	}
	return output;
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
	const output = new Uint8Array(left.length + right.length);
	output.set(left);
	output.set(right, left.length);
	return output;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
	const blockSize = 64;
	const keyBlock = new Uint8Array(blockSize);
	keyBlock.set(key.length > blockSize ? sha256(key) : key);

	const inner = new Uint8Array(blockSize);
	const outer = new Uint8Array(blockSize);
	for (let index = 0; index < blockSize; index += 1) {
		inner[index] = (keyBlock[index] as number) ^ 0x36;
		outer[index] = (keyBlock[index] as number) ^ 0x5c;
	}

	return sha256(concat(outer, sha256(concat(inner, message))));
}

const encoder = new TextEncoder();

export function toBytes(value: string): Uint8Array {
	return encoder.encode(value);
}

export function toHex(bytes: Uint8Array): string {
	let output = "";
	for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
	return output;
}

export function hmacHex(secret: string, message: string): string {
	return toHex(hmacSha256(toBytes(secret), toBytes(message)));
}

/** Compares two hex digests without an early exit on the first differing byte. */
export function timingSafeEqualHex(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let diff = 0;
	for (let index = 0; index < left.length; index += 1) {
		diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return diff === 0;
}
