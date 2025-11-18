import fs from 'fs';
import path from 'path';
import {
  BundleStats,
  ModuleInfo,
  ChunkInfo,
  Recommendation,
  BundleMetrics,
  DuplicateModule,
  AnalysisResult
} from '../types.js';

export class Packlyze {
  private statsData: {
    assets?: Array<{ size?: number; gzipSize?: number; }>;
    modules?: Array<ModuleInfo & { reasons?: Array<{ moduleName: string }>;
      source?: string; }>;
    chunks?: Array<{
      id: string | number;
      name?: string;
      size?: number;
      gzipSize?: number;
      modules?: Array<{ name: string }>;
      initial?: boolean;
    }>;
    name?: string;
    parsedSize?: number;
  } = {};
  private baseDir: string;

  constructor(statsPath: string) {
    if (!fs.existsSync(statsPath)) {
      throw new Error(`Stats file not found: ${statsPath}`);
    }
    this.baseDir = path.dirname(statsPath);
    this.loadStats(statsPath);
  }

  private loadStats(statsPath: string): void {
    const content = fs.readFileSync(statsPath, 'utf-8');
    try {
      this.statsData = JSON.parse(content);
    } catch (e) {
      throw new Error(`Invalid JSON in stats file: ${e}`);
    }
  }

  async analyze(): Promise<AnalysisResult> {
    const bundleStats = this.extractBundleStats();
    const recommendations = this.generateRecommendations(bundleStats);
    const treeshakingIssues = this.detectTreeshakingIssues();
    const duplicates = this.findDuplicates();
    const metrics = this.calculateMetrics(bundleStats);

    return {
      bundleStats,
      recommendations,
      treeshakingIssues,
      duplicates,
      metrics,
      timestamp: new Date().toISOString()
    };
  }

  private extractBundleStats(): BundleStats {
    const assets = this.statsData.assets || [];
    const modules = (this.statsData.modules || []).map((m) => ({
      name: m.name || 'unknown',
      size: m.size || 0,
      gzipSize: m.gzipSize,
      percentage: (m.size || 0) / this.getTotalSize() * 100,
      reasons: Array.isArray(m.reasons)
        ? (m.reasons as Array<{ moduleName?: string } | string>).map((r) => typeof r === 'string' ? r : r.moduleName ?? '')
        : []
    }));

    return {
      name: this.statsData.name || 'bundle',
      size: this.getTotalSize(),
      gzipSize: this.getTotalGzipSize(),
      modules: modules.sort((a: ModuleInfo, b: ModuleInfo) => b.size - a.size),
      chunks: this.extractChunks(),
      isInitialBySize: this.getInitialBundleSize(),
      isInitialByCount: assets.length,
      parsedSize: this.statsData.parsedSize || 0
    };
  }

  private getTotalSize(): number {
  const assets = this.statsData.assets || [];
  return assets.reduce((sum: number, asset) => sum + (asset.size || 0), 0);
  }

  private getTotalGzipSize(): number {
  const assets = this.statsData.assets || [];
  return assets.reduce((sum: number, asset) => sum + (asset.gzipSize || 0), 0);
  }

  private extractChunks(): ChunkInfo[] {
    return (this.statsData.chunks || []).map((chunk) => ({
      id: chunk.id,
      name: chunk.name || `chunk-${chunk.id}`,
      size: chunk.size || 0,
      gzipSize: chunk.gzipSize,
      modules: Array.isArray(chunk.modules) ? chunk.modules.map((m: { name: string }) => m.name) : []
    }));
  }

  private getInitialBundleSize(): number {
    return (this.statsData.chunks || [])
      .filter((c) => c.initial === true)
      .reduce((sum: number, c) => sum + (c.size || 0), 0);
  }

  private generateRecommendations(stats: BundleStats): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Large bundle check
    if (stats.gzipSize && stats.gzipSize > 500000) {
      recommendations.push({
        severity: 'critical',
        message: `Bundle size is ${(stats.gzipSize / 1024 / 1024).toFixed(2)}MB (gzipped)`,
        action: 'Implement aggressive code-splitting or consider alternative libraries'
      });
    } else if (stats.gzipSize && stats.gzipSize > 250000) {
      recommendations.push({
        severity: 'warning',
        message: `Bundle size is ${(stats.gzipSize / 1024 / 1024).toFixed(2)}MB (gzipped)`,
        action: 'Consider code-splitting frequently used features'
      });
    }

    // Large modules check
    const largeModules = stats.modules.filter(m => m.percentage > 5);
    if (largeModules.length > 0) {
      recommendations.push({
        severity: 'warning',
        message: `Found ${largeModules.length} modules exceeding 5% of bundle size`,
        action: 'Consider extracting to separate chunk or lazy-loading'
      });
    }

    // Duplicate check
    const duplicates = this.findDuplicates();
    if (duplicates.length > 0) {
      recommendations.push({
        severity: 'warning',
        message: `Found ${duplicates.length} duplicate modules totaling ${(duplicates.reduce((s, d) => s + d.totalSize, 0) / 1024).toFixed(2)}KB`,
        action: 'Use npm dedupe or resolve version conflicts'
      });
    }

    // Module count check
    if (stats.modules.length > 500) {
      recommendations.push({
        severity: 'info',
        message: `High module count (${stats.modules.length}) - may impact build performance`,
        action: 'Monitor module growth and consider monorepo approach'
      });
    }

    return recommendations;
  }

  private detectTreeshakingIssues(): string[] {
    const issues: string[] = [];
    const modules = this.statsData.modules || [];
    modules.forEach((m) => {
      if (typeof m.source === 'string' && (m.source.includes('module.exports') || m.source.includes('require('))) {
        issues.push(`${m.name}: Uses CommonJS - reduces tree-shaking effectiveness`);
      }
    });

    return issues.slice(0, 10); // Limit to top 10
  }

  private findDuplicates(): DuplicateModule[] {
    const moduleMap = new Map<string, ModuleInfo[]>();
    const duplicates: DuplicateModule[] = [];
    (this.statsData.modules || []).forEach((module: ModuleInfo) => {
      const baseName = path.basename(module.name || '');
      if (!moduleMap.has(baseName)) {
        moduleMap.set(baseName, []);
      }
      moduleMap.get(baseName)!.push(module);
    });
    moduleMap.forEach((modules) => {
      if (modules.length > 1) {
        const totalSize = modules.reduce((s: number, m) => s + (m.size || 0), 0);
        const minSize = Math.min(...modules.map(m => m.size || 0));
        duplicates.push({
          names: modules.map(m => m.name),
          totalSize,
          savings: totalSize - minSize
        });
      }
    });

    return duplicates.sort((a, b) => b.totalSize - a.totalSize).slice(0, 10);
  }

  private calculateMetrics(stats: BundleStats): BundleMetrics {
    const sizes = stats.modules.map(m => m.size);
    const averageSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
    return {
      totalSize: stats.size,
      totalGzipSize: stats.gzipSize || 0,
      moduleCount: stats.modules.length,
      chunkCount: stats.chunks.length,
      largestModule: stats.modules[0] || {
        name: 'N/A',
        size: 0,
        percentage: 0,
        reasons: [],
        gzipSize: 0
      },
      averageModuleSize: averageSize
    };
  }
}
