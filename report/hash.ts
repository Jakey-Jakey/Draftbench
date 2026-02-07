import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export interface FileHashInfo {
	bytes: number;
	sha256: string;
}

export async function sha256File(path: string): Promise<FileHashInfo> {
	const st = await stat(path);
	const hash = createHash("sha256");

	await new Promise<void>((resolve, reject) => {
		const stream = createReadStream(path);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve());
	});

	return { bytes: st.size, sha256: hash.digest("hex") };
}

