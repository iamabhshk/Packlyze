import { AnalysisResult } from '../types.js';
export declare class Packlyze {
    private statsData;
    private baseDir;
    constructor(statsPath: string);
    private loadStats;
    analyze(): Promise<AnalysisResult>;
    private extractBundleStats;
    private getTotalSize;
    private getTotalGzipSize;
    private extractChunks;
    private getInitialBundleSize;
    private generateRecommendations;
    private detectTreeshakingIssues;
    private findDuplicates;
    private calculateMetrics;
}
//# sourceMappingURL=packlyze.d.ts.map