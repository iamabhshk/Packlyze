import fs from 'fs';
import path from 'path';

export interface PacklyzeConfig {
  thresholds?: {
    maxGzipSize?: number;
    maxInitialSize?: number;
    largeModuleThreshold?: number;
  };
  output?: string;
  baseline?: string;
  format?: 'html' | 'csv' | 'markdown' | 'md';
}

const CONFIG_FILES = [
  'packlyze.config.json',
  '.packlyzerc',
  '.packlyzerc.json',
  'packlyze.json'
];

export function loadConfig(projectRoot?: string): PacklyzeConfig | null {
  const root = projectRoot || process.cwd();

  for (const configFile of CONFIG_FILES) {
    const configPath = path.join(root, configFile);
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as PacklyzeConfig;
        return config;
      } catch (error) {
        console.warn(`Warning: Failed to parse config file ${configFile}: ${error}`);
        return null;
      }
    }
  }

  return null;
}

export function mergeConfigWithOptions(
  config: PacklyzeConfig | null,
  options: Record<string, unknown>
): Record<string, unknown> {
  if (!config) return options;

  const merged: Record<string, unknown> = { ...options };

  // Merge thresholds
  if (config.thresholds) {
    if (config.thresholds.maxGzipSize !== undefined && !options.maxGzipSize) {
      merged.maxGzipSize = config.thresholds.maxGzipSize;
    }
    if (config.thresholds.maxInitialSize !== undefined && !options.maxInitialSize) {
      merged.maxInitialSize = config.thresholds.maxInitialSize;
    }
    if (config.thresholds.largeModuleThreshold !== undefined && options.largeModuleThreshold === 5) {
      merged.largeModuleThreshold = config.thresholds.largeModuleThreshold;
    }
  }

  // Merge output path
  if (config.output && !options.output) {
    merged.output = config.output;
  }

  // Merge baseline
  if (config.baseline && !options.baseline) {
    merged.baseline = config.baseline;
  }

  // Merge format
  if (config.format && !options.format) {
    merged.format = config.format;
  }

  return merged;
}

