import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createInitialState, saveState } from "../../state";
import { getModelToken } from "../../utils";

const tmpRoots: string[] = [];
const workspaceRoot = process.cwd();

function makeTempRoot(label: string): string {
	const root = resolve(
		"test-runs",
		`integration-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	);
	mkdirSync(root, { recursive: true });
	tmpRoots.push(root);
	return root;
}

function writeConfig(path: string, runsDir: string, body: string): void {
	writeFileSync(
		path,
		`[output]\nrunsDirectory = "${runsDir.replace(/\\/g, "\\\\")}"\n\n${body}`,
	);
}

function runPipeline(
	args: string[],
	options?: { cwd?: string },
): { stdout: string; stderr: string } {
	const proc = Bun.spawnSync({
		cmd: ["bun", "run", join(workspaceRoot, "index.ts"), ...args],
		cwd: options?.cwd ?? workspaceRoot,
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});

	const stdout = proc.stdout.toString();
	const stderr = proc.stderr.toString();
	if (proc.exitCode !== 0) {
		throw new Error(
			`Pipeline exited with code ${proc.exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
		);
	}
	return { stdout, stderr };
}

function runPipelineExpectFailure(
	args: string[],
	options?: { cwd?: string },
): {
	exitCode: number;
	stdout: string;
	stderr: string;
} {
	const proc = Bun.spawnSync({
		cmd: ["bun", "run", join(workspaceRoot, "index.ts"), ...args],
		cwd: options?.cwd ?? workspaceRoot,
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});

	return {
		exitCode: proc.exitCode,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}

afterEach(() => {
	for (const root of tmpRoots.splice(0, tmpRoots.length)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("integration pipeline", () => {
	test("dry-run generates run outputs", () => {
		const root = makeTempRoot("dry");
		const runsDir = join(root, "runs");
		mkdirSync(runsDir, { recursive: true });
		const cfgPath = join(root, "config.toml");
		writeConfig(
			cfgPath,
			runsDir,
			`[roles]
[[roles.generators]]
model = "openai/gpt-5.2"

[[roles.reviewers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "openai/gpt-5.2"

[[roles.coarseJudges]]
model = "openai/gpt-5.2"

[[roles.fineJudges]]
model = "openai/gpt-5.2"

[tournament]
coarseRounds = 1
coarseFormat = "1v1"

[tournament.firstDraftSelection]
enabled = false
initialGenerations = 1

[tournament.fineRanking]
enabled = false
maxMatchesPerBatch = 0
maxTotalMatches = 0
`,
		);

		const before = new Set(readdirSync(runsDir));
		runPipeline(["--config", cfgPath, "--dry-run"]);
		const after = readdirSync(runsDir);
		const newRuns = after.filter((entry) => !before.has(entry));
		expect(newRuns.length).toBe(1);

		const runName = newRuns[0];
		expect(runName).toBeDefined();
		if (!runName) throw new Error("Expected a new run directory");
		const runDir = join(runsDir, runName);
		const leaderboardPath = join(runDir, "leaderboard.md");
		const summaryPath = join(runDir, "summary.json");
		expect(readFileSync(leaderboardPath, "utf-8")).toContain("Leaderboard");
		const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
		expect(summary).toHaveProperty("leaderboard.entries");
		expect(summary).toHaveProperty("tournament");
	});

	test("resume dry-run reuses seeded state", async () => {
		const root = makeTempRoot("resume");
		const runsDir = join(root, "runs");
		const runDir = join(runsDir, "resume-seeded");
		mkdirSync(runDir, { recursive: true });
		const cfgPath = join(root, "config.toml");
		writeConfig(
			cfgPath,
			runsDir,
			`[roles]
[[roles.generators]]
model = "openai/gpt-5.2"

[[roles.reviewers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "anthropic/claude-opus-4.5"

[[roles.coarseJudges]]
model = "openai/gpt-5.2"

[[roles.fineJudges]]
model = "openai/gpt-5.2"

[tournament]
coarseRounds = 1
coarseFormat = "1v1"

[tournament.firstDraftSelection]
enabled = false
initialGenerations = 1

[tournament.rating]
enabled = false

[tournament.stopRules]
enabled = false

[tournament.fineRanking]
enabled = false
maxMatchesPerBatch = 0
maxTotalMatches = 0
`,
		);

		const gen = "openai/gpt-5.2";
		const reviewer = "openai/gpt-5.2";
		const reviserA = "openai/gpt-5.2";
		const reviserB = "anthropic/claude-opus-4.5";
		const idA = `${getModelToken(gen)}_${getModelToken(reviewer)}_${getModelToken(reviserA)}`;
		const idB = `${getModelToken(gen)}_${getModelToken(reviewer)}_${getModelToken(reviserB)}`;

		const state = createInitialState();
		state.phasesCompleted = [
			"generate",
			"initial_leaderboard",
			"review",
			"revise",
			"swiss",
		];
		state.generatedDrafts = new Map([
			[gen, [{ text: "seed draft", model: gen }]],
		]);
		state.completedGenerators = [gen];
		state.selectedDrafts = new Map([[gen, { text: "seed draft", model: gen }]]);
		state.completedLeaderboardModels = [gen];
		state.initialLeaderboardResults = [
			{
				model: gen,
				selectedDraftIndex: 1,
				wins: 0,
				draws: 0,
				losses: 0,
				totalDrafts: 1,
			},
		];
		state.reviews = [{ text: "seed review", reviewer, reviewed: gen }];
		state.revisions = new Map([
			[
				idA,
				{
					id: idA,
					text: "seed rev A",
					generator: gen,
					reviewer,
					reviser: reviserA,
				},
			],
			[
				idB,
				{
					id: idB,
					text: "seed rev B",
					generator: gen,
					reviewer,
					reviser: reviserB,
				},
			],
		]);
		state.swissRound = 1;
		state.swissMatches = [
			{
				round: 1,
				ids: [idA, idB, "BYE"],
				first: idA,
				second: idB,
				third: "BYE",
				reasoning: "seeded",
			},
		];
		state.contestants = [
			{
				id: idA,
				points: 1,
				opponents: [idB],
				placements: { first: 1, second: 0, third: 0, ties: 0 },
				wins: 1,
				losses: 0,
				draws: 0,
			},
			{
				id: idB,
				points: 0,
				opponents: [idA],
				placements: { first: 0, second: 1, third: 0, ties: 0 },
				wins: 0,
				losses: 1,
				draws: 0,
			},
		];
		await saveState(runDir, state);

		const { stdout } = runPipeline([
			"--config",
			cfgPath,
			"--resume",
			runDir,
			"--dry-run",
		]);
		expect(stdout).toContain("RESUMING");
		expect(readFileSync(join(runDir, "leaderboard.md"), "utf-8")).toContain(
			"Leaderboard",
		);
		expect(
			JSON.parse(readFileSync(join(runDir, "summary.json"), "utf-8")),
		).toHaveProperty("leaderboard.entries");
	});

	test("reuse-artifacts reruns coarse phase from a fresh run directory", async () => {
		const root = makeTempRoot("reuse-coarse");
		const runsDir = join(root, "runs");
		const sourceRunDir = join(runsDir, "reuse-seeded");
		mkdirSync(sourceRunDir, { recursive: true });
		const cfgPath = join(root, "config.toml");
		writeConfig(
			cfgPath,
			runsDir,
			`[roles]
[[roles.generators]]
model = "openai/gpt-5.2"

[[roles.reviewers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "anthropic/claude-opus-4.5"

[[roles.coarseJudges]]
model = "openai/gpt-5.2"

[[roles.fineJudges]]
model = "openai/gpt-5.2"

[tournament]
coarseRounds = 1
coarseFormat = "1v1"

[tournament.firstDraftSelection]
enabled = false
initialGenerations = 1

[tournament.rating]
enabled = false

[tournament.stopRules]
enabled = false

[tournament.fineRanking]
enabled = false
maxMatchesPerBatch = 0
maxTotalMatches = 0
`,
		);

		const gen = "openai/gpt-5.2";
		const reviewer = "openai/gpt-5.2";
		const reviserA = "openai/gpt-5.2";
		const reviserB = "anthropic/claude-opus-4.5";
		const idA = `${getModelToken(gen)}_${getModelToken(reviewer)}_${getModelToken(reviserA)}`;
		const idB = `${getModelToken(gen)}_${getModelToken(reviewer)}_${getModelToken(reviserB)}`;

		const sourceState = createInitialState();
		sourceState.phasesCompleted = [
			"generate",
			"initial_leaderboard",
			"review",
			"revise",
			"swiss",
			"finale",
		];
		sourceState.generatedDrafts = new Map([
			[gen, [{ text: "seed draft", model: gen }]],
		]);
		sourceState.completedGenerators = [gen];
		sourceState.selectedDrafts = new Map([
			[gen, { text: "seed draft", model: gen }],
		]);
		sourceState.completedLeaderboardModels = [gen];
		sourceState.reviews = [{ text: "seed review", reviewer, reviewed: gen }];
		sourceState.revisions = new Map([
			[
				idA,
				{
					id: idA,
					text: "seed rev A",
					generator: gen,
					reviewer,
					reviser: reviserA,
				},
			],
			[
				idB,
				{
					id: idB,
					text: "seed rev B",
					generator: gen,
					reviewer,
					reviser: reviserB,
				},
			],
		]);
		sourceState.swissRound = 1;
		sourceState.swissMatches = [
			{
				round: 1,
				ids: [idA, idB, "BYE"],
				first: idA,
				second: idB,
				third: "BYE",
				reasoning: "seeded",
			},
		];
		await saveState(sourceRunDir, sourceState);
		writeFileSync(
			join(sourceRunDir, `${getModelToken(gen)}_original_1.md`),
			"# Source original draft\n\nseed draft",
		);
		mkdirSync(join(sourceRunDir, "reviews"), { recursive: true });
		writeFileSync(
			join(
				sourceRunDir,
				"reviews",
				`${getModelToken(reviewer)}_reviews_${getModelToken(gen)}.md`,
			),
			"# Source review\n\nseed review",
		);
		mkdirSync(join(sourceRunDir, "revisions"), { recursive: true });
		writeFileSync(
			join(sourceRunDir, "revisions", `${idA}.md`),
			"# Source revision A\n\nseed rev A",
		);
		mkdirSync(join(sourceRunDir, "initial_leaderboard"), { recursive: true });
		writeFileSync(
			join(sourceRunDir, "initial_leaderboard", "leaderboard.md"),
			"# Source first draft leaderboard",
		);
		const sourceStateBefore = readFileSync(
			join(sourceRunDir, "state.json"),
			"utf-8",
		);

		const before = new Set(readdirSync(runsDir));
		const { stdout } = runPipeline([
			"--config",
			cfgPath,
			"--reuse-artifacts",
			sourceRunDir,
			"--dry-run",
		]);
		const after = readdirSync(runsDir);
		const newRuns = after.filter((entry) => !before.has(entry));

		expect(stdout).toContain("REUSING ARTIFACTS");
		expect(stdout).toContain("New run directory:");
		expect(stdout).toContain("Phase 5/6: Coarse Ranking");
		expect(newRuns.length).toBe(1);
		const runName = newRuns[0];
		expect(runName).toBeDefined();
		expect(runName).not.toBe("reuse-seeded");
		if (!runName) throw new Error("Expected a new run directory");
		const newRunDir = join(runsDir, runName);
		expect(
			readFileSync(
				join(newRunDir, `${getModelToken(gen)}_original_1.md`),
				"utf-8",
			),
		).toContain("Source original draft");
		expect(
			readFileSync(
				join(
					newRunDir,
					"reviews",
					`${getModelToken(reviewer)}_reviews_${getModelToken(gen)}.md`,
				),
				"utf-8",
			),
		).toContain("Source review");
		expect(
			readFileSync(join(newRunDir, "revisions", `${idA}.md`), "utf-8"),
		).toContain("Source revision A");
		expect(
			readFileSync(
				join(newRunDir, "initial_leaderboard", "leaderboard.md"),
				"utf-8",
			),
		).toContain("Source first draft leaderboard");
		expect(readFileSync(join(sourceRunDir, "state.json"), "utf-8")).toBe(
			sourceStateBefore,
		);
	});

	test("reuse-artifacts accepts an absolute source path when runsDirectory is relative", async () => {
		const root = makeTempRoot("reuse-absolute-default-runs");
		const sourceRunDir = join(root, "absolute-source-run");
		const runsDir = join(root, "runs");
		mkdirSync(sourceRunDir, { recursive: true });
		const cfgPath = join(root, "config.toml");
		await Bun.write(
			cfgPath,
			`[roles]
[[roles.generators]]
model = "openai/gpt-5.2"

[[roles.reviewers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "openai/gpt-5.2"

[[roles.coarseJudges]]
model = "openai/gpt-5.2"

[[roles.fineJudges]]
model = "openai/gpt-5.2"

[tournament]
coarseRounds = 1
coarseFormat = "1v1"

[tournament.firstDraftSelection]
enabled = false
initialGenerations = 1

[tournament.fineRanking]
enabled = false
maxMatchesPerBatch = 0
maxTotalMatches = 0
`,
		);

		const gen = "openai/gpt-5.2";
		const reviewer = "openai/gpt-5.2";
		const reviser = "openai/gpt-5.2";
		const revisionId = `${getModelToken(gen)}_${getModelToken(reviewer)}_${getModelToken(reviser)}`;
		const sourceState = createInitialState();
		sourceState.phasesCompleted = [
			"generate",
			"initial_leaderboard",
			"review",
			"revise",
		];
		sourceState.generatedDrafts = new Map([
			[gen, [{ text: "seed draft", model: gen }]],
		]);
		sourceState.completedGenerators = [gen];
		sourceState.selectedDrafts = new Map([
			[gen, { text: "seed draft", model: gen }],
		]);
		sourceState.completedLeaderboardModels = [gen];
		sourceState.reviews = [{ text: "seed review", reviewer, reviewed: gen }];
		sourceState.revisions = new Map([
			[
				revisionId,
				{
					id: revisionId,
					text: "seed revision",
					generator: gen,
					reviewer,
					reviser,
				},
			],
		]);
		await saveState(sourceRunDir, sourceState);

		mkdirSync(runsDir, { recursive: true });
		const before = new Set(readdirSync(runsDir));
		const { stdout } = runPipeline(
			["--config", cfgPath, "--reuse-artifacts", sourceRunDir, "--dry-run"],
			{ cwd: root },
		);
		const after = readdirSync(runsDir);
		const newRuns = after.filter((entry) => !before.has(entry));

		expect(stdout).toContain(`REUSING ARTIFACTS from: ${sourceRunDir}`);
		expect(newRuns.length).toBe(1);
	});

	test("skip-fine propagates into generated summaries", () => {
		const root = makeTempRoot("reuse-skip-fine-summary");
		const runsDir = join(root, "runs");
		const sourceRunDir = join(runsDir, "reuse-source");
		mkdirSync(sourceRunDir, { recursive: true });
		const cfgPath = join(root, "config.toml");
		writeConfig(
			cfgPath,
			runsDir,
			`[roles]
[[roles.generators]]
model = "openai/gpt-5.2"

[[roles.reviewers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "anthropic/claude-opus-4.5"

[[roles.coarseJudges]]
model = "openai/gpt-5.2"

[[roles.fineJudges]]
model = "openai/gpt-5.2"

[tournament]
coarseRounds = 1
coarseFormat = "1v1"

[tournament.firstDraftSelection]
enabled = false
initialGenerations = 1

[tournament.rating]
enabled = false

[tournament.stopRules]
enabled = false

[tournament.fineRanking]
enabled = true
maxMatchesPerBatch = 1
maxTotalMatches = 1
`,
		);

		const gen = "openai/gpt-5.2";
		const reviewer = "openai/gpt-5.2";
		const reviserA = "openai/gpt-5.2";
		const reviserB = "anthropic/claude-opus-4.5";
		const idA = `${getModelToken(gen)}_${getModelToken(reviewer)}_${getModelToken(reviserA)}`;
		const idB = `${getModelToken(gen)}_${getModelToken(reviewer)}_${getModelToken(reviserB)}`;

		const sourceState = createInitialState();
		sourceState.phasesCompleted = [
			"generate",
			"initial_leaderboard",
			"review",
			"revise",
		];
		sourceState.generatedDrafts = new Map([
			[gen, [{ text: "seed draft", model: gen }]],
		]);
		sourceState.completedGenerators = [gen];
		sourceState.selectedDrafts = new Map([
			[gen, { text: "seed draft", model: gen }],
		]);
		sourceState.completedLeaderboardModels = [gen];
		sourceState.reviews = [{ text: "seed review", reviewer, reviewed: gen }];
		sourceState.revisions = new Map([
			[
				idA,
				{
					id: idA,
					text: "seed rev A",
					generator: gen,
					reviewer,
					reviser: reviserA,
				},
			],
			[
				idB,
				{
					id: idB,
					text: "seed rev B",
					generator: gen,
					reviewer,
					reviser: reviserB,
				},
			],
		]);
		saveState(sourceRunDir, sourceState);

		const before = new Set(readdirSync(runsDir));
		runPipeline([
			"--config",
			cfgPath,
			"--reuse-artifacts",
			sourceRunDir,
			"--skip-fine",
			"--dry-run",
		]);
		const after = readdirSync(runsDir);
		const newRuns = after.filter((entry) => !before.has(entry));
		expect(newRuns.length).toBe(1);

		const runName = newRuns[0];
		expect(runName).toBeDefined();
		if (!runName) throw new Error("Expected a new run directory");
		const runDir = join(runsDir, runName);
		const summary = JSON.parse(
			readFileSync(join(runDir, "summary.json"), "utf-8"),
		);
		expect(summary.fineRanking.enabled).toBe(false);
		expect(readFileSync(join(runDir, "leaderboard.md"), "utf-8")).toContain(
			"Fine ranking is disabled.",
		);
	});

	test("reuse-artifacts with --skip-coarse carries over swiss state into a fresh run", async () => {
		const root = makeTempRoot("reuse-skip-coarse");
		const runsDir = join(root, "runs");
		const sourceRunDir = join(runsDir, "reuse-fine-seeded");
		mkdirSync(sourceRunDir, { recursive: true });
		const cfgPath = join(root, "config.toml");
		writeConfig(
			cfgPath,
			runsDir,
			`[roles]
[[roles.generators]]
model = "openai/gpt-5.2"

[[roles.reviewers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "anthropic/claude-opus-4.5"

[[roles.coarseJudges]]
model = "openai/gpt-5.2"

[[roles.fineJudges]]
model = "openai/gpt-5.2"

[tournament]
coarseRounds = 1
coarseFormat = "1v1"

[tournament.firstDraftSelection]
enabled = false
initialGenerations = 1

[tournament.rating]
enabled = true
backend = "elo"

[tournament.stopRules]
enabled = true
topK = 2

[tournament.fineRanking]
enabled = true
maxMatchesPerBatch = 1
maxTotalMatches = 1
`,
		);

		const gen = "openai/gpt-5.2";
		const reviewer = "openai/gpt-5.2";
		const reviserA = "openai/gpt-5.2";
		const reviserB = "anthropic/claude-opus-4.5";
		const idA = `${getModelToken(gen)}_${getModelToken(reviewer)}_${getModelToken(reviserA)}`;
		const idB = `${getModelToken(gen)}_${getModelToken(reviewer)}_${getModelToken(reviserB)}`;

		const sourceState = createInitialState();
		sourceState.phasesCompleted = [
			"generate",
			"initial_leaderboard",
			"review",
			"revise",
			"swiss",
			"finale",
		];
		sourceState.generatedDrafts = new Map([
			[gen, [{ text: "seed draft", model: gen }]],
		]);
		sourceState.completedGenerators = [gen];
		sourceState.selectedDrafts = new Map([
			[gen, { text: "seed draft", model: gen }],
		]);
		sourceState.completedLeaderboardModels = [gen];
		sourceState.reviews = [{ text: "seed review", reviewer, reviewed: gen }];
		sourceState.revisions = new Map([
			[
				idA,
				{
					id: idA,
					text: "seed rev A",
					generator: gen,
					reviewer,
					reviser: reviserA,
				},
			],
			[
				idB,
				{
					id: idB,
					text: "seed rev B",
					generator: gen,
					reviewer,
					reviser: reviserB,
				},
			],
		]);
		sourceState.swissRound = 1;
		sourceState.swissMatches = [
			{
				round: 1,
				ids: [idA, idB, "BYE"],
				first: idA,
				second: idB,
				third: "BYE",
				reasoning: "seeded",
			},
		];
		sourceState.contestants = [
			{
				id: idA,
				points: 1,
				opponents: [idB],
				placements: { first: 1, second: 0, third: 0, ties: 0 },
				wins: 1,
				losses: 0,
				draws: 0,
				rating: 1510,
				ratingUncertainty: 80,
				ratingCiLow: 1430,
				ratingCiHigh: 1590,
			},
			{
				id: idB,
				points: 0,
				opponents: [idA],
				placements: { first: 0, second: 1, third: 0, ties: 0 },
				wins: 0,
				losses: 1,
				draws: 0,
				rating: 1490,
				ratingUncertainty: 80,
				ratingCiLow: 1410,
				ratingCiHigh: 1570,
			},
		];
		sourceState.ratingState = {
			config: {
				backend: "elo",
				initialRating: 1500,
				kFactor: 24,
				tieValue: 0.5,
				provisionalMatches: 0,
				btIterations: 100,
				btTolerance: 0.0001,
				ciBootstrapSamples: 0,
				btRegularization: 0,
				btUseNewton: false,
				ciMode: "normal",
			},
			records: [
				{
					id: idA,
					rating: 1510,
					matches: 1,
					wins: 1,
					losses: 0,
					draws: 0,
					uncertainty: 80,
				},
				{
					id: idB,
					rating: 1490,
					matches: 1,
					wins: 0,
					losses: 1,
					draws: 0,
					uncertainty: 80,
				},
			],
			history: [{ aId: idA, bId: idB, scoreA: 1, scoreB: 0, round: 1 }],
		};
		sourceState.finaleMatches = [
			{
				iteration: 1,
				aId: idA,
				bId: idB,
				scoreA: 1,
				scoreB: 0,
				votesA: 1,
				votesB: 0,
				judges: ["openai/gpt-5.2"],
			},
		];
		sourceState.finaleIterations = 1;
		sourceState.finaleConverged = true;
		await saveState(sourceRunDir, sourceState);

		const before = new Set(readdirSync(runsDir));
		const { stdout } = runPipeline([
			"--config",
			cfgPath,
			"--reuse-artifacts",
			sourceRunDir,
			"--skip-coarse",
			"--dry-run",
		]);
		const after = readdirSync(runsDir);
		const newRuns = after.filter((entry) => !before.has(entry));

		expect(stdout).toContain("REUSING ARTIFACTS");
		expect(stdout).toContain(
			"Coarse ranking: skipped (reusing source results)",
		);
		expect(stdout).toContain("Loaded coarse ranking state (Swiss)");
		expect(stdout).toContain("Phase 6/6: Fine Ranking");
		expect(newRuns.length).toBe(1);
		expect(newRuns[0]).not.toBe("reuse-fine-seeded");
	});

	test("reuse-artifacts fails fast for incomplete source runs", async () => {
		const root = makeTempRoot("reuse-invalid");
		const runsDir = join(root, "runs");
		const sourceRunDir = join(runsDir, "reuse-incomplete");
		mkdirSync(sourceRunDir, { recursive: true });
		const cfgPath = join(root, "config.toml");
		writeConfig(
			cfgPath,
			runsDir,
			`[roles]
[[roles.generators]]
model = "openai/gpt-5.2"

[[roles.reviewers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "openai/gpt-5.2"

[[roles.coarseJudges]]
model = "openai/gpt-5.2"

[[roles.fineJudges]]
model = "openai/gpt-5.2"

[tournament]
coarseRounds = 1
coarseFormat = "1v1"

[tournament.firstDraftSelection]
enabled = false
initialGenerations = 1

[tournament.fineRanking]
enabled = false
maxMatchesPerBatch = 0
maxTotalMatches = 0
`,
		);

		const state = createInitialState();
		state.phasesCompleted = ["generate", "review"];
		await saveState(sourceRunDir, state);

		const result = runPipelineExpectFailure([
			"--config",
			cfgPath,
			"--reuse-artifacts",
			sourceRunDir,
			"--dry-run",
		]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain(
			"Source run is missing completed phases: initial_leaderboard, revise",
		);
	});

	test("deprecated key warnings are emitted", () => {
		const root = makeTempRoot("warnings");
		const runsDir = join(root, "runs");
		mkdirSync(runsDir, { recursive: true });
		const cfgPath = join(root, "config.toml");
		writeConfig(
			cfgPath,
			runsDir,
			`[roles]
[[roles.generators]]
model = "openai/gpt-5.2"

[[roles.reviewers]]
model = "openai/gpt-5.2"

[[roles.revisers]]
model = "openai/gpt-5.2"

[[roles.swissJudges]]
model = "openai/gpt-5.2"

[[roles.finaleJudges]]
model = "openai/gpt-5.2"

[tournament]
swissRounds = 1
playoffSize = 2

[tournament.finale]
enabled = false
maxMatchesPerBatch = 0
maxTotalMatches = 0
`,
		);

		const { stderr } = runPipeline(["--config", cfgPath, "--dry-run"]);
		expect(stderr).toContain("Deprecated config key tournament.swissRounds");
		expect(stderr).toContain("Deprecated config key tournament.playoffSize");
	});
});
