import { existsSync, readFileSync } from "node:fs";
import { parse as parseTOML } from "smol-toml";

// ============================================================================
// Configuration Types
// ============================================================================

export type ModelName = string;

/** Reasoning effort levels for LLM calls */
export type ReasoningEffort =
	| "xhigh"
	| "high"
	| "medium"
	| "low"
	| "minimal"
	| "none";

/** A role entry defines a model and its settings for that role */
export interface RoleEntry {
	/** OpenRouter model slug (e.g., "anthropic/claude-4.5-opus") */
	model: string;
	/** Reasoning effort for this role */
	effort?: ReasoningEffort;
	/** Optional temperature override */
	temperature?: number;
}

/** Role configuration - each role is an array of model entries */
export interface RolesConfig {
	/** Models that generate initial drafts */
	generators: RoleEntry[];
	/** Models that review drafts */
	reviewers: RoleEntry[];
	/** Models that revise drafts */
	revisers: RoleEntry[];
	/** Swiss tournament judge */
	swissJudge: RoleEntry;
	/** Playoff judges (dual-judge voting) */
	playoffJudges: RoleEntry[];
	/** Initial leaderboard judges (optional, defaults to playoffJudges) */
	initialLeaderboardJudges?: RoleEntry[];
}

export interface InitialLeaderboardConfig {
	enabled: boolean;
}

export interface TournamentConfig {
	swissRounds: number;
	playoffSize: number;
	initialGenerations: number;
	initialLeaderboard: InitialLeaderboardConfig;
	/** Swiss match format: 1v1 (pairwise) or 1v1v1 (three-way). Default: 1v1v1 */
	swissFormat?: "1v1" | "1v1v1";
}

export interface OutputConfig {
	runsDirectory: string;
}

export interface ConcurrencyConfig {
	/** Maximum parallel API calls. Null or omitted = unlimited. */
	maxParallel?: number | null;
}

export interface PromptsConfig {
	generate: {
		system: string;
		user: string;
	};
	review: {
		system: string;
		userTemplate: string; // {statblock}
	};
	revise: {
		system: string;
		userTemplate: string; // {statblock}, {feedback}
	};
	judgePairwise: {
		system: string;
		userTemplate: string; // {idA}, {idB}, {textA}, {textB}
	};
	judgeThreeWay: {
		system: string;
		userTemplate: string; // {idA}, {idB}, {idC}, {textA}, {textB}, {textC}
	};
}

export interface PipelineConfig {
	roles: RolesConfig;
	concurrency?: ConcurrencyConfig;
	tournament: TournamentConfig;
	output: OutputConfig;
	prompts: PromptsConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PipelineConfig = {
	roles: {
		generators: [
			{ model: "anthropic/claude-sonnet-4", effort: "high" },
			{ model: "openai/gpt-4.1", effort: "high" },
			{ model: "google/gemini-2.5-pro-preview", effort: "high" },
		],
		reviewers: [
			{ model: "anthropic/claude-sonnet-4", effort: "medium" },
			{ model: "openai/gpt-4.1", effort: "medium" },
			{ model: "google/gemini-2.5-pro-preview", effort: "medium" },
		],
		revisers: [
			{ model: "anthropic/claude-sonnet-4", effort: "high" },
			{ model: "openai/gpt-4.1", effort: "high" },
			{ model: "google/gemini-2.5-pro-preview", effort: "high" },
		],
		swissJudge: { model: "anthropic/claude-sonnet-4", effort: "low" },
		playoffJudges: [
			{ model: "anthropic/claude-sonnet-4", effort: "low" },
			{ model: "openai/gpt-4.1", effort: "high" },
		],
	},
	tournament: {
		swissRounds: 7,
		playoffSize: 8,
		initialGenerations: 1,
		initialLeaderboard: {
			enabled: false,
		},
	},
	output: {
		runsDirectory: "runs",
	},
	prompts: {
		generate: {
			system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Create well constructed monster statblocks that follow official 5e formatting conventions. Include all standard statblock components: size/type/alignment, AC, HP, speed, ability scores, saving throws, skills, damage immunities/resistances/vulnerabilities, senses, languages, challenge rating, and special abilities/actions.`,
			user: `Create a D&D 5e monster statblock for Doctor Doom (Marvel Comics). This should be a powerful villain suitable for high-level play. Output only the statblock without commentary.`,
		},
		review: {
			system: `You are an expert D&D 5e game designer and balance consultant. Review the monster statblock provided and give constructive feedback on: mechanical balance, CR accuracy, thematic representation of the character, adherence to 5e formatting conventions, action economy, and potential gameplay issues. Be thorough but constructive. Focus on actionable improvements.`,
			userTemplate: `Please review the following D&D 5e monster statblock and provide feedback:\n\n{statblock}`,
		},
		revise: {
			system: `You are an expert TTRPG designer specializing in D&D 5th Edition. Revise the provided monster statblock based on the feedback given.`,
			userTemplate: `Original statblock:\n{statblock}\n\nReview feedback:\n{feedback}\n\nPlease revise the statblock based on the feedback above. Output only the revised statblock without commentary.`,
		},
		judgePairwise: {
			system: `You are an expert D&D 5e game designer. Compare the two statblocks and pick the better one based on: mechanical balance, CR accuracy, thematic representation, 5e formatting, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "winner": "ID of the better statblock",
  "reasoning": "One sentence explaining why."
}

The IDs are: "{idA}" and "{idB}". Pick exactly one winner.`,
			userTemplate: `Compare these two D&D 5e statblocks:

## Statblock: {idA}

{textA}

---

## Statblock: {idB}

{textB}`,
		},
		judgeThreeWay: {
			system: `You are an expert D&D 5e game designer. Compare the three statblocks and rank them from best to worst based on: mechanical balance, CR accuracy, thematic representation, 5e formatting, and playability.

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "first": "ID of the best statblock",
  "second": "ID of the second-best statblock",
  "third": "ID of the worst statblock",
  "reasoning": "One sentence explaining the ranking."
}

The IDs are: "{idA}", "{idB}", "{idC}". Rank all three.`,
			userTemplate: `Compare and rank these three D&D 5e statblocks:

## Statblock: {idA}

{textA}

---

## Statblock: {idB}

{textB}

---

## Statblock: {idC}

{textC}`,
		},
	},
};

// ============================================================================
// Configuration Loading
// ============================================================================

let loadedConfig: PipelineConfig | null = null;

/**
 * Deep merge two objects, with source overwriting target for matching keys.
 */
function deepMerge(
	target: PipelineConfig,
	source: Partial<PipelineConfig>,
): PipelineConfig {
	const result = { ...target };

	// Merge roles (replace arrays entirely if provided)
	if (source.roles) {
		result.roles = {
			...target.roles,
			...source.roles,
		};
	}

	// Merge tournament
	if (source.tournament) {
		result.tournament = {
			...target.tournament,
			...source.tournament,
			initialLeaderboard: {
				...target.tournament.initialLeaderboard,
				...source.tournament.initialLeaderboard,
			},
		};
	}

	// Merge output
	if (source.output) {
		result.output = { ...target.output, ...source.output };
	}

	// Merge concurrency
	if (source.concurrency) {
		result.concurrency = { ...target.concurrency, ...source.concurrency };
	}

	// Merge prompts (nested)
	if (source.prompts) {
		result.prompts = {
			generate: { ...target.prompts.generate, ...source.prompts.generate },
			review: { ...target.prompts.review, ...source.prompts.review },
			revise: { ...target.prompts.revise, ...source.prompts.revise },
			judgePairwise: {
				...target.prompts.judgePairwise,
				...source.prompts.judgePairwise,
			},
			judgeThreeWay: {
				...target.prompts.judgeThreeWay,
				...source.prompts.judgeThreeWay,
			},
		};
	}

	return result;
}

/**
 * Parse TOML config file and convert to PipelineConfig.
 */
function parseTOMLConfig(content: string): Partial<PipelineConfig> {
	const raw = parseTOML(content) as Record<string, unknown>;
	const result: Partial<PipelineConfig> = {};

	// Parse roles
	if (raw.roles) {
		const rolesRaw = raw.roles as Record<string, unknown>;
		result.roles = {} as RolesConfig;

		if (rolesRaw.generators) {
			result.roles.generators = rolesRaw.generators as RoleEntry[];
		}
		if (rolesRaw.reviewers) {
			result.roles.reviewers = rolesRaw.reviewers as RoleEntry[];
		}
		if (rolesRaw.revisers) {
			result.roles.revisers = rolesRaw.revisers as RoleEntry[];
		}
		if (rolesRaw.swissJudge) {
			result.roles.swissJudge = rolesRaw.swissJudge as RoleEntry;
		}
		if (rolesRaw.playoffJudges) {
			result.roles.playoffJudges = rolesRaw.playoffJudges as RoleEntry[];
		}
		if (rolesRaw.initialLeaderboardJudges) {
			result.roles.initialLeaderboardJudges =
				rolesRaw.initialLeaderboardJudges as RoleEntry[];
		}
	}

	// Parse tournament
	if (raw.tournament) {
		const tournamentRaw = raw.tournament as Record<string, unknown>;
		result.tournament = {} as TournamentConfig;

		if (tournamentRaw.swissRounds !== undefined) {
			result.tournament.swissRounds = tournamentRaw.swissRounds as number;
		}
		if (tournamentRaw.playoffSize !== undefined) {
			result.tournament.playoffSize = tournamentRaw.playoffSize as number;
		}
		if (tournamentRaw.initialGenerations !== undefined) {
			result.tournament.initialGenerations =
				tournamentRaw.initialGenerations as number;
		}
		if (tournamentRaw.swissFormat !== undefined) {
			result.tournament.swissFormat = tournamentRaw.swissFormat as
				| "1v1"
				| "1v1v1";
		}
		if (tournamentRaw.initialLeaderboard) {
			const ilRaw = tournamentRaw.initialLeaderboard as Record<string, unknown>;
			result.tournament.initialLeaderboard = {
				enabled: ilRaw.enabled as boolean,
			};
		}
	}

	// Parse output
	if (raw.output) {
		const outputRaw = raw.output as Record<string, unknown>;
		result.output = {
			runsDirectory: outputRaw.runsDirectory as string,
		};
	}

	// Parse concurrency
	if (raw.concurrency) {
		const concurrencyRaw = raw.concurrency as Record<string, unknown>;
		result.concurrency = {
			maxParallel: concurrencyRaw.maxParallel as number | null,
		};
	}

	// Parse prompts (nested structure)
	if (raw.prompts) {
		const promptsRaw = raw.prompts as Record<string, Record<string, string>>;
		result.prompts = {} as PromptsConfig;

		if (promptsRaw.generate) {
			result.prompts.generate = promptsRaw.generate as {
				system: string;
				user: string;
			};
		}
		if (promptsRaw.review) {
			result.prompts.review = promptsRaw.review as {
				system: string;
				userTemplate: string;
			};
		}
		if (promptsRaw.revise) {
			result.prompts.revise = promptsRaw.revise as {
				system: string;
				userTemplate: string;
			};
		}
		if (promptsRaw.judgePairwise) {
			result.prompts.judgePairwise = promptsRaw.judgePairwise as {
				system: string;
				userTemplate: string;
			};
		}
		if (promptsRaw.judgeThreeWay) {
			result.prompts.judgeThreeWay = promptsRaw.judgeThreeWay as {
				system: string;
				userTemplate: string;
			};
		}
	}

	return result;
}

/**
 * Parses prompts from a TOML file.
 */
function parsePromptsTOML(content: string): Partial<PromptsConfig> {
	const raw = parseTOML(content) as Record<string, Record<string, string>>;
	const result: Partial<PromptsConfig> = {};

	if (raw.generate) {
		result.generate = {
			system: raw.generate.system ?? "",
			user: raw.generate.user ?? "",
		};
	}
	if (raw.review) {
		result.review = {
			system: raw.review.system ?? "",
			userTemplate: raw.review.userTemplate ?? "",
		};
	}
	if (raw.revise) {
		result.revise = {
			system: raw.revise.system ?? "",
			userTemplate: raw.revise.userTemplate ?? "",
		};
	}
	if (raw.judgePairwise) {
		result.judgePairwise = {
			system: raw.judgePairwise.system ?? "",
			userTemplate: raw.judgePairwise.userTemplate ?? "",
		};
	}
	if (raw.judgeThreeWay) {
		result.judgeThreeWay = {
			system: raw.judgeThreeWay.system ?? "",
			userTemplate: raw.judgeThreeWay.userTemplate ?? "",
		};
	}

	return result;
}

/**
 * Loads prompts from a separate TOML file.
 */
export function loadPrompts(promptsPath: string): Partial<PromptsConfig> {
	if (!existsSync(promptsPath)) {
		throw new Error(`Prompts file not found: ${promptsPath}`);
	}

	const content = readFileSync(promptsPath, "utf-8");
	return parsePromptsTOML(content);
}

/**
 * Loads configuration from a TOML file, merging with defaults.
 * If no path provided, looks for config.toml in current directory.
 * If file doesn't exist, uses defaults.
 * @param configPath Path to config TOML file
 * @param promptsPath Optional path to separate prompts TOML file
 */
export function loadConfig(
	configPath?: string,
	promptsPath?: string,
): PipelineConfig {
	if (loadedConfig) {
		return loadedConfig;
	}

	const path = configPath ?? "config.toml";
	let userConfig: Partial<PipelineConfig> = {};

	if (existsSync(path)) {
		try {
			const content = readFileSync(path, "utf-8");
			userConfig = parseTOMLConfig(content);
			console.log(`📁 Loaded config from: ${path}`);
		} catch (e) {
			console.error(`⚠️ Failed to parse config file ${path}:`, e);
			console.log("   Using default configuration.");
		}
	} else if (configPath) {
		// User explicitly specified a config that doesn't exist
		throw new Error(`Config file not found: ${configPath}`);
	} else {
		console.log("📁 No config.toml found, using defaults.");
	}

	const mergedConfig = deepMerge(DEFAULT_CONFIG, userConfig);

	// Load prompts from separate file
	// Priority: --prompts flag > prompts.toml in cwd > defaults
	const resolvedPromptsPath = promptsPath ?? "prompts.toml";
	if (existsSync(resolvedPromptsPath)) {
		try {
			const prompts = loadPrompts(resolvedPromptsPath);
			mergedConfig.prompts = {
				generate: { ...mergedConfig.prompts.generate, ...prompts.generate },
				review: { ...mergedConfig.prompts.review, ...prompts.review },
				revise: { ...mergedConfig.prompts.revise, ...prompts.revise },
				judgePairwise: {
					...mergedConfig.prompts.judgePairwise,
					...prompts.judgePairwise,
				},
				judgeThreeWay: {
					...mergedConfig.prompts.judgeThreeWay,
					...prompts.judgeThreeWay,
				},
			};
			console.log(`📝 Loaded prompts from: ${resolvedPromptsPath}`);
		} catch (e) {
			console.error(`⚠️ Failed to parse prompts file ${resolvedPromptsPath}:`, e);
			console.log("   Using default prompts.");
		}
	} else if (promptsPath) {
		// User explicitly specified a prompts file that doesn't exist
		throw new Error(`Prompts file not found: ${promptsPath}`);
	}
	// If no prompts.toml found and no --prompts flag, silently use defaults

	validateConfig(mergedConfig);
	loadedConfig = mergedConfig;
	return mergedConfig;
}

/**
 * Gets the current configuration (must call loadConfig first).
 */
export function getConfig(): PipelineConfig {
	if (!loadedConfig) {
		return loadConfig();
	}
	return loadedConfig;
}

/**
 * Resets loaded config (useful for testing).
 */
export function resetConfig(): void {
	loadedConfig = null;
}

/**
 * Helper to interpolate template strings with variables.
 * Uses {varname} syntax.
 */
export function interpolate(
	template: string,
	vars: Record<string, string>,
): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/**
 * Gets role entries for a specific role.
 * Returns an array of RoleEntry objects with model slugs and effort.
 */
export function getRoleEntries(
	role: "generators" | "reviewers" | "revisers",
): RoleEntry[] {
	const config = getConfig();
	return config.roles[role];
}

/**
 * Gets model slugs for a specific role (for backward compatibility).
 * Returns just the model slug strings.
 */
export function getModelsForRole(
	role: "generators" | "reviewers" | "revisers",
): string[] {
	return getRoleEntries(role).map((e) => e.model);
}

/**
 * Gets the effort for a specific model in a specific role.
 * Returns the first matching entry's effort, or "high" as default.
 */
export function getEffortForRole(
	role:
		| "generators"
		| "reviewers"
		| "revisers"
		| "swissJudge"
		| "playoffJudges",
	modelSlug: string,
): ReasoningEffort {
	const config = getConfig();

	if (role === "swissJudge") {
		return config.roles.swissJudge.effort ?? "high";
	}

	if (role === "playoffJudges") {
		const entry = config.roles.playoffJudges.find((e) => e.model === modelSlug);
		return entry?.effort ?? "high";
	}

	const entries = config.roles[role];
	const entry = entries.find((e) => e.model === modelSlug);
	return entry?.effort ?? "high";
}

/**
 * Gets the Swiss judge configuration.
 */
export function getSwissJudge(): RoleEntry {
	return getConfig().roles.swissJudge;
}

/**
 * Gets the playoff judges configuration.
 */
export function getPlayoffJudges(): RoleEntry[] {
	return getConfig().roles.playoffJudges;
}

/**
 * Gets the initial leaderboard judges (falls back to playoff judges if not set).
 */
export function getInitialLeaderboardJudges(): RoleEntry[] {
	const config = getConfig();
	return config.roles.initialLeaderboardJudges ?? config.roles.playoffJudges;
}

/**
 * Validates the loaded configuration for consistency.
 */
function validateConfig(config: PipelineConfig): void {
	// Validate that role arrays are non-empty
	if (!config.roles.generators || config.roles.generators.length === 0) {
		throw new Error("roles.generators must have at least one entry");
	}
	if (!config.roles.reviewers || config.roles.reviewers.length === 0) {
		throw new Error("roles.reviewers must have at least one entry");
	}
	if (!config.roles.revisers || config.roles.revisers.length === 0) {
		throw new Error("roles.revisers must have at least one entry");
	}
	if (!config.roles.swissJudge || !config.roles.swissJudge.model) {
		throw new Error("roles.swissJudge must be defined with a model");
	}
	if (!config.roles.playoffJudges || config.roles.playoffJudges.length === 0) {
		throw new Error("roles.playoffJudges must have at least one entry");
	}

	// Validate that all role entries have valid model slugs
	const allEntries = [
		...config.roles.generators,
		...config.roles.reviewers,
		...config.roles.revisers,
		config.roles.swissJudge,
		...config.roles.playoffJudges,
		...(config.roles.initialLeaderboardJudges ?? []),
	];

	for (const entry of allEntries) {
		if (!entry.model || typeof entry.model !== "string") {
			throw new Error(`Invalid role entry: missing or invalid 'model' field`);
		}
		// Basic OpenRouter slug validation (should contain a /)
		if (!entry.model.includes("/")) {
			throw new Error(
				`Invalid model slug "${entry.model}": OpenRouter slugs should be in format "provider/model-name"`,
			);
		}
	}
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

export interface CLIArgs {
	configPath?: string;
	promptsPath?: string;
	resumeDir?: string;
	dryRun: boolean;
}

/**
 * Parses command line arguments.
 * Supports: --config <path>, --prompts <path>, --resume <run-dir>, --dry-run
 */
export function parseArgs(argv: string[] = process.argv): CLIArgs {
	const args: CLIArgs = {
		dryRun: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--config" && argv[i + 1]) {
			args.configPath = argv[i + 1];
			i++; // Skip next arg
		} else if (arg === "--prompts" && argv[i + 1]) {
			args.promptsPath = argv[i + 1];
			i++; // Skip next arg
		} else if (arg === "--resume" && argv[i + 1]) {
			args.resumeDir = argv[i + 1];
			i++; // Skip next arg
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		}
	}

	return args;
}

// Export types for model names derived from config
