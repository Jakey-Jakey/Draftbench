import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "./args";
import {
	getLoadedConfig,
	getLoadedPaths,
	resetLoadedConfig,
	setLoadedConfig,
} from "./context";
import { DEFAULT_CONFIG } from "./defaults";
import { deepMerge, loadPrompts, parseTOMLConfig } from "./loader";
import type { PipelineConfig, ReasoningEffort, RoleEntry } from "./types";
import { estimateApiCalls, normalizeConfig, validateConfig } from "./validator";

export * from "./types";
export { parseArgs };

export function loadConfig(
	configPath?: string,
	promptsPath?: string,
): PipelineConfig {
	const effectiveConfigPath = resolve(configPath ?? "config.toml");
	const effectivePromptsPath = resolve(promptsPath ?? "prompts.toml");
	const cached = getLoadedConfig();
	const paths = getLoadedPaths();

	if (
		cached &&
		paths &&
		paths.configPath === effectiveConfigPath &&
		paths.promptsPath === effectivePromptsPath
	) {
		return cached;
	}

	if (cached && paths) {
		console.log("🔄 Config paths changed, reloading...");
	}

	const path = configPath ?? "config.toml";
	let userConfig: Partial<PipelineConfig> = {};

	if (existsSync(path)) {
		try {
			const content = readFileSync(path, "utf-8");
			userConfig = parseTOMLConfig(content);
			console.log(`📁 Loaded config from: ${path}`);
		} catch (e) {
			if (configPath) {
				const message = e instanceof Error ? e.message : String(e);
				throw new Error(`Failed to parse config file ${path}: ${message}`);
			}
			console.error(`⚠️ Failed to parse config file ${path}:`, e);
			console.log("   Using default configuration.");
		}
	} else if (configPath) {
		throw new Error(`Config file not found: ${configPath}`);
	} else {
		console.log("📁 No config.toml found, using defaults.");
	}

	const mergedConfig = deepMerge(
		JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as PipelineConfig,
		userConfig,
	);

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
				judgeRank: {
					...mergedConfig.prompts.judgeRank,
					...prompts.judgeRank,
				},
			};
			console.log(`📝 Loaded prompts from: ${resolvedPromptsPath}`);
		} catch (e) {
			console.error(
				`⚠️ Failed to parse prompts file ${resolvedPromptsPath}:`,
				e,
			);
			console.log("   Using default prompts.");
		}
	} else if (promptsPath) {
		throw new Error(`Prompts file not found: ${promptsPath}`);
	}

	const normalizeWarnings = normalizeConfig(mergedConfig);
	const validateWarnings = validateConfig(mergedConfig);
	for (const warning of [...normalizeWarnings, ...validateWarnings]) {
		console.warn(`⚠️ ${warning}`);
	}

	const estimate = estimateApiCalls(mergedConfig);
	console.log(
		`📊 Estimated API calls: total ${estimate.total} (gen ${estimate.generation}, firstDraftSelection ${estimate.initialLeaderboard}, review ${estimate.review}, revise ${estimate.revise}, coarse ${estimate.swiss}, fine ${estimate.finale})`,
	);

	setLoadedConfig(mergedConfig, {
		configPath: effectiveConfigPath,
		promptsPath: effectivePromptsPath,
	});

	return mergedConfig;
}

export function getConfig(): PipelineConfig {
	const config = getLoadedConfig();
	if (!config) {
		throw new Error(
			"Config has not been loaded. Call loadConfig() explicitly before using config helpers.",
		);
	}
	return config;
}

export function resetConfig(): void {
	resetLoadedConfig();
}

export function interpolate(
	template: string,
	vars: Record<string, string>,
): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export function getRoleEntries(
	role: "generators" | "reviewers" | "revisers",
): RoleEntry[] {
	const config = getConfig();
	return config.roles[role];
}

export function getModelsForRole(
	role: "generators" | "reviewers" | "revisers",
): string[] {
	return getRoleEntries(role).map((e) => e.model);
}

export function getEffortForRole(
	role:
		| "generators"
		| "reviewers"
		| "revisers"
		| "swissJudges"
		| "finaleJudges"
		| "playoffJudges",
	modelSlug: string,
): ReasoningEffort {
	const config = getConfig();

	if (role === "swissJudges") {
		const entry = config.roles.swissJudges.find((e) => e.model === modelSlug);
		return entry?.effort ?? "high";
	}

	if (role === "finaleJudges" || role === "playoffJudges") {
		const entry = config.roles.finaleJudges.find((e) => e.model === modelSlug);
		return entry?.effort ?? "high";
	}

	const entries = config.roles[role];
	const entry = entries.find((e) => e.model === modelSlug);
	return entry?.effort ?? "high";
}

export function getSwissJudges(): RoleEntry[] {
	return getConfig().roles.swissJudges;
}

export function getFinaleJudges(): RoleEntry[] {
	return getConfig().roles.finaleJudges;
}

export function getPlayoffJudges(): RoleEntry[] {
	console.warn(
		"⚠️ getPlayoffJudges() is deprecated. Use getFinaleJudges() and [[roles.finaleJudges]] instead.",
	);
	return getFinaleJudges();
}

export function getInitialLeaderboardJudges(): RoleEntry[] {
	const config = getConfig();
	return config.roles.initialLeaderboardJudges ?? config.roles.finaleJudges;
}
