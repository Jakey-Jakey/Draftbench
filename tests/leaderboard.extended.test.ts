import { describe, expect, test } from "bun:test";
import {
    computeLeaderboard,
    getLeaderboard,
    runtimeToStoredContestants,
    storedToRuntimeContestants,
    type PlayoffResult,
    type SwissContestant,
    type SwissMatch,
} from "../leaderboard";
import type { StoredInitialLeaderboardResult } from "../state";

// ============================================================================
// Helper Functions
// ============================================================================

function createContestant(
    id: string,
    points = 0,
    first = 0,
    second = 0,
    third = 0,
): SwissContestant {
    return {
        id,
        text: `Mock text for ${id}`,
        points,
        opponents: new Set<string>(),
        placements: { first, second, third },
        wins: 0,
        losses: 0,
        draws: 0,
    };
}

// ============================================================================
// Leaderboard Formatting Tests
// ============================================================================

describe("Leaderboard markdown formatting", () => {
    test("computeLeaderboard returns markdown with header", () => {
        const contestants = [createContestant("model_a", 10, 5, 0, 0)];
        const matches: SwissMatch[] = [];
        const md = computeLeaderboard(contestants, matches, null);

        expect(md).toContain("# 🏆 Tournament Leaderboard");
    });

    test("computeLeaderboard includes winner section", () => {
        const contestants = [
            createContestant("winner_rev", 15, 7, 0, 0),
            createContestant("loser_rev", 5, 2, 1, 2),
        ];
        const md = computeLeaderboard(contestants, [], null);

        expect(md).toContain("## 🥇 Winner");
    });

    test("computeLeaderboard includes model performance section", () => {
        const contestants = [createContestant("a_b_c", 10, 5, 0, 0)];
        const md = computeLeaderboard(contestants, [], null);

        expect(md).toContain("## 📊 Model Performance");
        expect(md).toContain("### As Generator");
        expect(md).toContain("### As Reviewer");
        expect(md).toContain("### As Reviser");
    });

    test("computeLeaderboard includes final rankings table", () => {
        const contestants = [
            createContestant("a_b_c", 10, 5, 0, 0),
            createContestant("d_e_f", 8, 4, 0, 0),
        ];
        const md = computeLeaderboard(contestants, [], null);

        expect(md).toContain("## 🏅 Final Rankings");
        expect(md).toContain("| # | Revision |");
    });

    test("computeLeaderboard includes seed selection when provided", () => {
        const contestants = [createContestant("model_a", 10, 5, 0, 0)];
        const initialResults: StoredInitialLeaderboardResult[] = [
            {
                model: "anthropic/claude-opus-4",
                selectedDraftIndex: 3,
                totalDrafts: 5,
                wins: 4,
                draws: 0,
                losses: 0,
            },
        ];
        const md = computeLeaderboard(contestants, [], null, undefined, initialResults);

        expect(md).toContain("## 🌱 Seed Selection");
        expect(md).toContain("Draft 3/5");
    });

    test("computeLeaderboard handles empty initial results", () => {
        const contestants = [createContestant("a_b_c", 10, 5, 0, 0)];
        const md = computeLeaderboard(contestants, [], null, undefined, []);

        expect(md).toContain("## 🌱 Seed Selection");
        expect(md).toContain("Initial leaderboard was not enabled");
    });

    test("computeLeaderboard includes playoff details when provided", () => {
        const contestants = [createContestant("a_b_c", 10, 5, 0, 0)];
        const playoffResults = new Map<string, PlayoffResult>([
            ["a_b_c", { points: 5, wins: 5, draws: 0, losses: 2 }],
        ]);
        const md = computeLeaderboard(contestants, [], playoffResults);

        expect(md).toContain("## 🎯 Playoff Details");
        expect(md).toContain("5W");
    });
});

// ============================================================================
// Contestant Conversion Tests
// ============================================================================

describe("Contestant conversion functions", () => {
    test("runtimeToStoredContestants converts Set to array", () => {
        const runtime: SwissContestant[] = [
            {
                id: "test",
                text: "text",
                points: 5,
                opponents: new Set(["a", "b"]),
                placements: { first: 1, second: 2, third: 0 },
                wins: 3,
                losses: 1,
                draws: 0,
            },
        ];

        const stored = runtimeToStoredContestants(runtime);

        expect(stored[0]!.opponents).toEqual(["a", "b"]);
        expect(Array.isArray(stored[0]!.opponents)).toBe(true);
    });

    test("storedToRuntimeContestants converts array to Set", () => {
        const stored = [
            {
                id: "test",
                points: 5,
                opponents: ["a", "b"],
                placements: { first: 1, second: 2, third: 0 },
                wins: 3,
                losses: 1,
                draws: 0,
            },
        ];
        const textLookup = new Map([["test", "Test text"]]);

        const runtime = storedToRuntimeContestants(stored, textLookup);

        expect(runtime[0]!.opponents).toBeInstanceOf(Set);
        expect(runtime[0]!.opponents.has("a")).toBe(true);
        expect(runtime[0]!.opponents.has("b")).toBe(true);
        expect(runtime[0]!.text).toBe("Test text");
    });

    test("storedToRuntimeContestants handles missing text lookup", () => {
        const stored = [
            {
                id: "test",
                points: 5,
                opponents: [],
                placements: { first: 0, second: 0, third: 0 },
            },
        ];
        const textLookup = new Map<string, string>();

        const runtime = storedToRuntimeContestants(stored, textLookup);

        expect(runtime[0]!.text).toBe("");
    });
});

// ============================================================================
// Leaderboard Ranking Tests
// ============================================================================

describe("getLeaderboard ranking logic", () => {
    test("sorts by points descending", () => {
        const contestants = [
            createContestant("low", 5),
            createContestant("high", 15),
            createContestant("mid", 10),
        ];

        const sorted = getLeaderboard(contestants, [], null);

        expect(sorted[0]!.id).toBe("high");
        expect(sorted[1]!.id).toBe("mid");
        expect(sorted[2]!.id).toBe("low");
    });

    test("assigns correct ranks", () => {
        const contestants = [
            createContestant("a", 10),
            createContestant("b", 8),
            createContestant("c", 6),
        ];

        const sorted = getLeaderboard(contestants, [], null);

        expect(sorted[0]!.rank).toBe(1);
        expect(sorted[1]!.rank).toBe(2);
        expect(sorted[2]!.rank).toBe(3);
    });

    test("tiebreaker: playoff points weighted higher", () => {
        const contestants = [
            createContestant("a", 10),
            createContestant("b", 10), // Same Swiss points
        ];
        const playoffResults = new Map<string, PlayoffResult>([
            ["a", { points: 3, wins: 3, losses: 0, draws: 0 }],
            ["b", { points: 5, wins: 5, losses: 0, draws: 0 }], // Better playoff
        ]);

        const sorted = getLeaderboard(contestants, [], playoffResults);

        // b should be first due to better playoff performance
        expect(sorted[0]!.id).toBe("b");
    });

    test("calculates total score with playoff bonus", () => {
        const contestants = [createContestant("a", 10)];
        const playoffResults = new Map<string, PlayoffResult>([
            ["a", { points: 5, wins: 5, losses: 0, draws: 0 }],
        ]);

        const sorted = getLeaderboard(contestants, [], playoffResults);

        // Total = Swiss points + playoff points * 2
        expect(sorted[0]!.totalScore).toBe(10 + 5 * 2);
    });

    test("extracts generator/reviewer/reviser from revision ID", () => {
        const contestants = [createContestant("claude_gpt_gemini", 10)];

        const sorted = getLeaderboard(contestants, [], null);

        expect(sorted[0]!.generator).toBe("claude");
        expect(sorted[0]!.reviewer).toBe("gpt");
        expect(sorted[0]!.reviser).toBe("gemini");
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Leaderboard edge cases", () => {
    test("handles empty contestants array", () => {
        const sorted = getLeaderboard([], [], null);
        expect(sorted).toEqual([]);
    });

    test("handles single contestant", () => {
        const contestants = [createContestant("only_one", 10)];
        const sorted = getLeaderboard(contestants, [], null);
        expect(sorted.length).toBe(1);
        expect(sorted[0]!.rank).toBe(1);
    });

    test("handles contestants with zero points", () => {
        const contestants = [
            createContestant("zero", 0),
            createContestant("positive", 5),
        ];
        const sorted = getLeaderboard(contestants, [], null);
        expect(sorted[0]!.id).toBe("positive");
        expect(sorted[1]!.id).toBe("zero");
    });

    test("handles very long revision IDs", () => {
        const longId = "a".repeat(50) + "_" + "b".repeat(50) + "_" + "c".repeat(50);
        const contestants = [createContestant(longId, 10)];
        const sorted = getLeaderboard(contestants, [], null);
        expect(sorted.length).toBe(1);
    });
});
