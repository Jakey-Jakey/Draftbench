import type { CLIArgs } from "./types";

export function parseArgs(argv: string[] = process.argv): CLIArgs {
	const args: CLIArgs = {
		dryRun: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--config" && argv[i + 1]) {
			args.configPath = argv[i + 1];
			i++;
		} else if (arg === "--prompts" && argv[i + 1]) {
			args.promptsPath = argv[i + 1];
			i++;
		} else if (arg === "--resume" && argv[i + 1]) {
			args.resumeDir = argv[i + 1];
			i++;
		} else if (arg === "--reuse-artifacts" && argv[i + 1]) {
			args.reuseArtifactsDir = argv[i + 1];
			i++;
		} else if (arg === "--skip-coarse") {
			args.skipCoarse = true;
		} else if (arg === "--skip-fine") {
			args.skipFine = true;
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		}
	}

	if (args.reuseArtifactsDir && args.resumeDir) {
		throw new Error("Cannot use --reuse-artifacts and --resume together");
	}
	if ((args.skipCoarse || args.skipFine) && !args.reuseArtifactsDir) {
		throw new Error("--skip-coarse and --skip-fine require --reuse-artifacts");
	}

	return args;
}
