import type { PipelineConfig } from "./types";

interface LoadedPaths {
	configPath: string;
	promptsPath: string;
}

let loadedConfig: PipelineConfig | null = null;
let loadedPaths: LoadedPaths | null = null;

export function getLoadedConfig(): PipelineConfig | null {
	return loadedConfig;
}

export function getLoadedPaths(): LoadedPaths | null {
	return loadedPaths;
}

export function setLoadedConfig(
	config: PipelineConfig,
	paths: LoadedPaths,
): void {
	loadedConfig = config;
	loadedPaths = paths;
}

export function resetLoadedConfig(): void {
	loadedConfig = null;
	loadedPaths = null;
}
