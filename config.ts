import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ============================================================================
// Configuration Types
// ============================================================================

export type ModelName = string;

export interface ModelConfig {
    slug: string;
    reasoningEffort: "low" | "medium" | "high";
}

export interface JudgeConfig {
    model: ModelName;
    effort: "low" | "medium" | "high";
}

export interface InitialLeaderboardConfig {
    enabled: boolean;
    judges: JudgeConfig[];
}

export interface TournamentConfig {
    swissRounds: number;
    playoffSize: number;
    initialGenerations: number;
    initialLeaderboard: InitialLeaderboardConfig;
    swissJudge: JudgeConfig;
    playoffJudges: JudgeConfig[];
}

export interface OutputConfig {
    runsDirectory: string;
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
    models: Record<string, ModelConfig>;
    tournament: TournamentConfig;
    output: OutputConfig;
    prompts: PromptsConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PipelineConfig = {
    models: {
        claude: {
            slug: "anthropic/claude-4.5-opus",
            reasoningEffort: "high",
        },
        gpt: {
            slug: "openai/gpt-5.2",
            reasoningEffort: "high",
        },
        gemini: {
            slug: "google/gemini-3-pro-preview",
            reasoningEffort: "high",
        },
    },
    tournament: {
        swissRounds: 7,
        playoffSize: 8,
        initialGenerations: 1,
        initialLeaderboard: {
            enabled: false,
            judges: [],
        },
        swissJudge: {
            model: "claude",
            effort: "low",
        },
        playoffJudges: [
            { model: "claude", effort: "low" },
            { model: "gpt", effort: "high" },
        ],
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

function mergeJudge(defaultJudge: JudgeConfig, override?: Partial<JudgeConfig>): JudgeConfig {
    if (!override) {
        return defaultJudge;
    }

    return {
        ...defaultJudge,
        ...override,
    };
}

/**
 * Deep merge two objects, with source overwriting target for matching keys.
 */
function deepMerge(target: PipelineConfig, source: Partial<PipelineConfig>): PipelineConfig {
    const result = { ...target };

    // Merge models
    if (source.models) {
        result.models = { ...target.models, ...source.models };
    }

    // Merge tournament
    if (source.tournament) {
        const mergedTournament = { ...target.tournament, ...source.tournament };

        if (source.tournament.swissJudge) {
            mergedTournament.swissJudge = mergeJudge(
                target.tournament.swissJudge,
                source.tournament.swissJudge,
            );
        }

        if (source.tournament.playoffJudges) {
            mergedTournament.playoffJudges = source.tournament.playoffJudges.map((judge, index) =>
                mergeJudge(target.tournament.playoffJudges[index] ?? target.tournament.swissJudge, judge),
            );
        }

        if (source.tournament.initialLeaderboard) {
            mergedTournament.initialLeaderboard = {
                ...target.tournament.initialLeaderboard,
                ...source.tournament.initialLeaderboard,
            };

            if (source.tournament.initialLeaderboard.judges) {
                mergedTournament.initialLeaderboard.judges = source.tournament.initialLeaderboard.judges.map(
                    (judge, index) =>
                        mergeJudge(
                            target.tournament.initialLeaderboard.judges[index] ?? target.tournament.swissJudge,
                            judge,
                        ),
                );
            }
        }

        result.tournament = mergedTournament;
    }

    // Merge output
    if (source.output) {
        result.output = { ...target.output, ...source.output };
    }

    // Merge prompts (nested)
    if (source.prompts) {
        result.prompts = {
            generate: { ...target.prompts.generate, ...source.prompts.generate },
            review: { ...target.prompts.review, ...source.prompts.review },
            revise: { ...target.prompts.revise, ...source.prompts.revise },
            judgePairwise: { ...target.prompts.judgePairwise, ...source.prompts.judgePairwise },
            judgeThreeWay: { ...target.prompts.judgeThreeWay, ...source.prompts.judgeThreeWay },
        };
    }

    return result;
}

/**
 * Loads configuration from a JSON file, merging with defaults.
 * If no path provided, looks for config.json in current directory.
 * If file doesn't exist, uses defaults.
 */
export function loadConfig(configPath?: string): PipelineConfig {
    if (loadedConfig) {
        return loadedConfig;
    }

    const path = configPath ?? "config.json";
    let userConfig: Partial<PipelineConfig> = {};

    if (existsSync(path)) {
        try {
            const content = readFileSync(path, "utf-8");
            userConfig = JSON.parse(content);
            console.log(`📁 Loaded config from: ${path}`);
        } catch (e) {
            console.error(`⚠️ Failed to parse config file ${path}:`, e);
            console.log("   Using default configuration.");
        }
    } else if (configPath) {
        // User explicitly specified a config that doesn't exist
        throw new Error(`Config file not found: ${configPath}`);
    } else {
        console.log("📁 No config.json found, using defaults.");
    }

    const mergedConfig = deepMerge(DEFAULT_CONFIG, userConfig);
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
export function interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

export interface CLIArgs {
    configPath?: string;
    dryRun: boolean;
}

/**
 * Parses command line arguments.
 * Supports: --config <path>, --dry-run
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
        } else if (arg === "--dry-run") {
            args.dryRun = true;
        }
    }

    return args;
}

// Export types for model names derived from config
