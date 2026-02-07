import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export interface FileHashInfo {
	bytes: number;
	sha256: string;
}

export async function sha256File(path: string): Promise<FileHashInfo> {
	const hash = createHash("sha256");
	let bytes = 0;

	await new Promise<void>((resolve, reject) => {
		const stream = createReadStream(path);
		stream.on("data", (chunk) => {
			bytes += chunk.length;
			hash.update(chunk);
		});
		stream.on("error", reject);
		stream.on("end", () => resolve());
	});

	return { bytes, sha256: hash.digest("hex") };
}
