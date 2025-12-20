import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { AnalysisResult } from '../types.js';

const HISTORY_DIR = '.packlyze';
const HISTORY_FILE = 'history.json';

export interface HistoryEntry {
  timestamp: string;
  metrics: {
    totalSize: number;
    totalGzipSize: number;
    totalBrotliSize?: number;
    moduleCount: number;
    chunkCount: number;
  };
  gitCommit?: string;
  gitBranch?: string;
}

export interface HistoryData {
  entries: HistoryEntry[];
}

export function getHistoryPath(projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  return path.join(root, HISTORY_DIR, HISTORY_FILE);
}

export function ensureHistoryDir(projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  const historyDir = path.join(root, HISTORY_DIR);
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
  return historyDir;
}

export function loadHistory(projectRoot?: string): HistoryData {
  const historyPath = getHistoryPath(projectRoot);
  
  if (!fs.existsSync(historyPath)) {
    return { entries: [] };
  }

  try {
    const content = fs.readFileSync(historyPath, 'utf-8');
    return JSON.parse(content) as HistoryData;
  } catch (error) {
    console.warn(`Warning: Failed to load history: ${error}`);
    return { entries: [] };
  }
}

export function saveHistoryEntry(result: AnalysisResult, projectRoot?: string): void {
  ensureHistoryDir(projectRoot);
  const historyPath = getHistoryPath(projectRoot);
  const history = loadHistory(projectRoot);

  // Get git info if available
  let gitCommit: string | undefined;
  let gitBranch: string | undefined;
  
  try {
    try {
      gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: projectRoot || process.cwd() }).trim();
    } catch {
      // Git not available or not a git repo
    }
    try {
      gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: projectRoot || process.cwd() }).trim();
    } catch {
      // Git not available or not a git repo
    }
  } catch {
    // Git commands failed, continue without git info
  }

  const entry: HistoryEntry = {
    timestamp: result.timestamp,
    metrics: {
      totalSize: result.metrics.totalSize,
      totalGzipSize: result.metrics.totalGzipSize,
      totalBrotliSize: result.metrics.totalBrotliSize,
      moduleCount: result.metrics.moduleCount,
      chunkCount: result.metrics.chunkCount
    },
    gitCommit,
    gitBranch
  };

  history.entries.push(entry);
  
  // Keep only last 100 entries
  if (history.entries.length > 100) {
    history.entries = history.entries.slice(-100);
  }

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}

export function getTrends(projectRoot?: string, limit: number = 10): HistoryEntry[] {
  const history = loadHistory(projectRoot);
  return history.entries.slice(-limit);
}

