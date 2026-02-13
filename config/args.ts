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
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		}
	}

	return args;
}
