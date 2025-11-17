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
export interface AnalysisResult {
    bundleStats: BundleStats;
    recommendations: Recommendation[];
    treeshakingIssues: string[];
    duplicates: DuplicateModule[];
    metrics: BundleMetrics;
    timestamp: string;
}
//# sourceMappingURL=types.d.ts.map