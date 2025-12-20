export interface BundleStats {
  name: string;
  size: number;
  gzipSize?: number;
  modules: ModuleInfo[];
  chunks: ChunkInfo[];
  isInitialBySize: number;
  isInitialByCount: number;
  parsedSize: number;
}

export interface ModuleInfo {
  name: string;
  size: number;
  gzipSize?: number;
  percentage: number;
  reasons: string[];
}

export interface ChunkInfo {
  id: string | number;
  name: string;
  size: number;
  gzipSize?: number;
  modules: string[];
}

export interface Recommendation {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  action: string;
}

export interface BundleMetrics {
  totalSize: number;
  totalGzipSize: number;
  totalBrotliSize?: number;
  moduleCount: number;
  chunkCount: number;
  largestModule: ModuleInfo;
  averageModuleSize: number;
}

export interface DuplicateModule {
  names: string[];
  totalSize: number;
  savings: number;
}

export interface PackageStats {
  name: string;
  totalSize: number;
  gzipSize?: number;
  moduleCount: number;
  modules: string[];
  percentage: number;
}

export interface ChunkAnalysis {
  averageChunkSize: number;
  averageModulesPerChunk: number;
  largestChunk: ChunkInfo;
  smallestChunk: ChunkInfo;
  initialChunkSize: number;
  recommendations: string[];
}

export interface UnusedModule {
  name: string;
  size: number;
  reason: string;
}

export interface AnalysisResult {
  bundleStats: BundleStats;
  recommendations: Recommendation[];
  treeshakingIssues: string[];
  duplicates: DuplicateModule[];
  packages: PackageStats[];
  chunkAnalysis?: ChunkAnalysis;
  unusedModules?: UnusedModule[];
  metrics: BundleMetrics;
  timestamp: string;
}
