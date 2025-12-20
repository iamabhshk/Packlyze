import fs from 'fs';
import path from 'path';
import {
  BundleStats,
  ModuleInfo,
  ChunkInfo,
  Recommendation,
  BundleMetrics,
  DuplicateModule,
  PackageStats,
  ChunkAnalysis,
  UnusedModule,
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
  private verboseLog?: (message: string) => void;

  constructor(statsPath: string, verboseLog?: (message: string) => void) {
    this.verboseLog = verboseLog;
    if (!fs.existsSync(statsPath)) {
      throw new Error(`Stats file not found: ${statsPath}`);
    }
    this.baseDir = path.dirname(statsPath);
    this.loadStats(statsPath);
  }

  private log(message: string): void {
    if (this.verboseLog) {
      this.verboseLog(message);
    }
  }

  private loadStats(statsPath: string): void {
    this.log('Reading stats file...');
    const content = fs.readFileSync(statsPath, 'utf-8');
    this.log(`Stats file size: ${(content.length / 1024).toFixed(2)} KB`);
    
    try {
      this.log('Parsing JSON...');
      this.statsData = JSON.parse(content);
      this.log('Validating stats structure...');
      this.validateStats();
      
      // Count modules from different sources
      const topLevelModules = this.statsData.modules?.length || 0;
      const chunks = this.statsData.chunks || [];
      let chunkModules = 0;
      chunks.forEach((chunk) => {
        if (Array.isArray(chunk.modules)) {
          chunkModules += chunk.modules.length;
        }
      });
      
      this.log(`Found ${topLevelModules} top-level modules, ${chunkModules} modules in chunks, ${chunks.length} chunks`);
    } catch (e) {
      if (e instanceof Error && e.message.includes('Invalid stats')) {
        throw e;
      }
      throw new Error(`Invalid JSON in stats file: ${e}`);
    }
  }

  private validateStats(): void {
    if (!this.statsData || typeof this.statsData !== 'object') {
      throw new Error('Invalid stats: stats file must be a valid JSON object');
    }

    // Check for webpack build errors
    const errors = Array.isArray((this.statsData as { errors?: unknown[] }).errors) 
      ? (this.statsData as { errors: Array<{ message?: string; details?: string }> }).errors 
      : [];
    
    if (errors.length > 0) {
      const errorMessages = errors
        .slice(0, 3)
        .map((e, i) => `${i + 1}. ${e.message || 'Unknown error'}`)
        .join('\n   ');
      
      throw new Error(
        `Webpack build failed with ${errors.length} error(s). Cannot analyze bundle.\n\n` +
        `Errors:\n   ${errorMessages}${errors.length > 3 ? `\n   ... and ${errors.length - 3} more error(s)` : ''}\n\n` +
        `💡 Fix the webpack build errors first, then regenerate stats.json:\n` +
        `   npx webpack --profile --json stats.json`
      );
    }

    // Check for required structure (at least one of assets, modules, or chunks should exist)
    const hasAssets = Array.isArray(this.statsData.assets);
    const hasModules = Array.isArray(this.statsData.modules);
    const hasChunks = Array.isArray(this.statsData.chunks);

    if (!hasAssets && !hasModules && !hasChunks) {
      throw new Error(
        'Invalid stats: stats file must contain at least one of: assets, modules, or chunks arrays. ' +
        'Ensure you generated the stats file correctly (e.g., webpack --profile --json stats.json)'
      );
    }

    // Check if stats file is empty (no actual content)
    const assetsCount = hasAssets ? this.statsData.assets!.length : 0;
    const modulesCount = hasModules ? this.statsData.modules!.length : 0;
    const chunks = hasChunks ? this.statsData.chunks! : [];
    const chunksWithModules = chunks.filter((c: { modules?: unknown[] }) => 
      Array.isArray(c.modules) && c.modules.length > 0
    ).length;

    if (assetsCount === 0 && modulesCount === 0 && chunksWithModules === 0) {
      throw new Error(
        'Stats file contains no modules or assets. This usually means:\n' +
        '1. The webpack build failed (check for errors above)\n' +
        '2. The entry point is missing or incorrect\n' +
        '3. No files were processed by webpack\n\n' +
        '💡 Ensure your webpack configuration is correct and the build succeeds before generating stats.'
      );
    }

    // Validate modules if present
    if (hasModules && Array.isArray(this.statsData.modules)) {
      for (const module of this.statsData.modules) {
        if (module && typeof module !== 'object') {
          throw new Error('Invalid stats: all modules must be objects');
        }
        if (module && module.size !== undefined && (typeof module.size !== 'number' || module.size < 0)) {
          throw new Error('Invalid stats: module sizes must be non-negative numbers');
        }
      }
    }

    // Validate assets if present
    if (hasAssets && Array.isArray(this.statsData.assets)) {
      for (const asset of this.statsData.assets) {
        if (asset && typeof asset !== 'object') {
          throw new Error('Invalid stats: all assets must be objects');
        }
        if (asset && asset.size !== undefined && (typeof asset.size !== 'number' || asset.size < 0)) {
          throw new Error('Invalid stats: asset sizes must be non-negative numbers');
        }
      }
    }
  }

  async analyze(): Promise<AnalysisResult> {
    this.log('Extracting bundle statistics...');
    const bundleStats = this.extractBundleStats();
    
    this.log('Analyzing packages...');
    const packages = this.analyzePackages(bundleStats);
    
    this.log('Detecting duplicate modules...');
    const duplicates = this.findDuplicates(bundleStats);
    
    this.log('Detecting tree-shaking issues...');
    const treeshakingIssues = this.detectTreeshakingIssues(bundleStats);
    
    this.log('Generating recommendations...');
    const recommendations = this.generateRecommendations(bundleStats);
    
    this.log('Calculating metrics...');
    const metrics = this.calculateMetrics(bundleStats);
    
    this.log('Analyzing chunks...');
    const chunkAnalysis = this.analyzeChunks(bundleStats);
    
    this.log('Detecting unused modules...');
    const unusedModules = this.detectUnusedModules(bundleStats);

    this.log('Analysis complete!');
    return {
      bundleStats,
      recommendations,
      treeshakingIssues,
      duplicates,
      packages,
      chunkAnalysis,
      unusedModules,
      metrics,
      timestamp: new Date().toISOString()
    };
  }

  private extractBundleStats(): BundleStats {
    const assets = this.statsData.assets || [];
    
    // Extract modules from top-level or from chunks (webpack 5+ format)
    let modules: ModuleInfo[] = [];
    
    // First, try top-level modules array
    if (Array.isArray(this.statsData.modules) && this.statsData.modules.length > 0) {
      modules = this.statsData.modules.map((m) => ({
        name: m.name || 'unknown',
        size: m.size || 0,
        gzipSize: m.gzipSize,
        percentage: 0, // Will calculate after we know total size
        reasons: Array.isArray(m.reasons)
          ? (m.reasons as Array<{ moduleName?: string } | string>).map((r) => typeof r === 'string' ? r : r.moduleName ?? '')
          : []
      }));
    } else {
      // Extract modules from chunks (webpack 5+ format)
      const moduleMap = new Map<string, ModuleInfo>();
      const chunks = this.statsData.chunks || [];
      
      chunks.forEach((chunk) => {
        if (Array.isArray(chunk.modules)) {
          chunk.modules.forEach((m: { name?: string; size?: number; gzipSize?: number; reasons?: unknown } | string) => {
            // Handle both object and string formats
            let moduleName: string;
            let moduleSize: number;
            let moduleGzipSize: number | undefined;
            let moduleReasons: unknown;
            
            if (typeof m === 'string') {
              // Module is just a name string
              moduleName = m;
              moduleSize = 0; // Size unknown, will be calculated from chunk or assets
              moduleGzipSize = undefined;
              moduleReasons = [];
            } else {
              // Module is an object
              moduleName = m.name || 'unknown';
              moduleSize = m.size || 0;
              moduleGzipSize = m.gzipSize;
              moduleReasons = m.reasons;
            }
            
            if (!moduleMap.has(moduleName)) {
              moduleMap.set(moduleName, {
                name: moduleName,
                size: moduleSize,
                gzipSize: moduleGzipSize,
                percentage: 0,
                reasons: Array.isArray(moduleReasons)
                  ? (moduleReasons as Array<{ moduleName?: string } | string>).map((r) => typeof r === 'string' ? r : r.moduleName ?? '')
                  : []
              });
            } else {
              // If module appears in multiple chunks, use the maximum size (not sum)
              // because the same module shouldn't be counted multiple times
              const existing = moduleMap.get(moduleName)!;
              existing.size = Math.max(existing.size, moduleSize);
              if (moduleGzipSize) {
                existing.gzipSize = existing.gzipSize ? Math.max(existing.gzipSize, moduleGzipSize) : moduleGzipSize;
              }
              // Merge reasons if available
              if (Array.isArray(moduleReasons) && moduleReasons.length > 0) {
                const existingReasons = new Set(existing.reasons);
                (moduleReasons as Array<{ moduleName?: string } | string>).forEach((r) => {
                  const reasonStr = typeof r === 'string' ? r : r.moduleName ?? '';
                  if (reasonStr) existingReasons.add(reasonStr);
                });
                existing.reasons = Array.from(existingReasons);
              }
            }
          });
        }
      });
      
      modules = Array.from(moduleMap.values());
    }
    
    // Calculate total size from assets or modules
    const totalSize = this.getTotalSize() || modules.reduce((sum, m) => sum + (m.size || 0), 0);
    
    // Calculate percentages
    modules = modules.map((m) => ({
      ...m,
      percentage: totalSize > 0 ? ((m.size || 0) / totalSize) * 100 : 0
    }));

    return {
      name: this.statsData.name || 'bundle',
      size: totalSize,
      gzipSize: this.getTotalGzipSize() || modules.reduce((sum, m) => sum + (m.gzipSize || 0), 0),
      modules: modules.sort((a: ModuleInfo, b: ModuleInfo) => b.size - a.size),
      chunks: this.extractChunks(),
      isInitialBySize: this.getInitialBundleSize(),
      isInitialByCount: assets.length,
      parsedSize: this.statsData.parsedSize || 0
    };
  }

  private getTotalSize(): number {
    const assets = this.statsData.assets || [];
    const assetSize = assets.reduce((sum: number, asset) => sum + (asset.size || 0), 0);
    
    // If assets are empty or zero, try to calculate from modules
    if (assetSize === 0) {
      // Try top-level modules
      if (Array.isArray(this.statsData.modules) && this.statsData.modules.length > 0) {
        return this.statsData.modules.reduce((sum: number, m) => sum + (m.size || 0), 0);
      }
      
      // Try modules from chunks
      const chunks = this.statsData.chunks || [];
      let moduleSize = 0;
      const seenModules = new Set<string>();
      
      chunks.forEach((chunk) => {
        if (Array.isArray(chunk.modules)) {
          chunk.modules.forEach((m: { name?: string; size?: number }) => {
            const moduleName = m.name || 'unknown';
            // Only count each module once (in case it appears in multiple chunks)
            if (!seenModules.has(moduleName)) {
              seenModules.add(moduleName);
              moduleSize += (m.size || 0);
            }
          });
        }
      });
      
      if (moduleSize > 0) {
        return moduleSize;
      }
      
      // Try chunk sizes as fallback
      const chunkSize = chunks.reduce((sum: number, c) => sum + (c.size || 0), 0);
      if (chunkSize > 0) {
        return chunkSize;
      }
    }
    
    return assetSize;
  }

  private getTotalGzipSize(): number {
    const assets = this.statsData.assets || [];
    const assetGzipSize = assets.reduce((sum: number, asset) => sum + (asset.gzipSize || 0), 0);
    
    // If assets are empty or zero, try to calculate from modules
    if (assetGzipSize === 0) {
      // Try top-level modules
      if (Array.isArray(this.statsData.modules) && this.statsData.modules.length > 0) {
        return this.statsData.modules.reduce((sum: number, m) => sum + (m.gzipSize || 0), 0);
      }
      
      // Try modules from chunks
      const chunks = this.statsData.chunks || [];
      let moduleGzipSize = 0;
      const seenModules = new Set<string>();
      
      chunks.forEach((chunk) => {
        if (Array.isArray(chunk.modules)) {
          chunk.modules.forEach((m: { name?: string; gzipSize?: number }) => {
            const moduleName = m.name || 'unknown';
            if (!seenModules.has(moduleName)) {
              seenModules.add(moduleName);
              moduleGzipSize += (m.gzipSize || 0);
            }
          });
        }
      });
      
      if (moduleGzipSize > 0) {
        return moduleGzipSize;
      }
      
      // Try chunk gzip sizes as fallback
      return chunks.reduce((sum: number, c) => sum + (c.gzipSize || 0), 0);
    }
    
    return assetGzipSize;
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
    const duplicates = this.findDuplicates(stats);
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

  private detectTreeshakingIssues(stats: BundleStats): string[] {
    const issues: string[] = [];
    
    // Check modules from BundleStats (which includes extracted modules)
    stats.modules.forEach((m) => {
      // Try to get source from original stats data
      const originalModule = Array.isArray(this.statsData.modules) 
        ? this.statsData.modules.find((om: { name?: string }) => om.name === m.name)
        : null;
      
      if (originalModule && typeof originalModule.source === 'string' && 
          (originalModule.source.includes('module.exports') || originalModule.source.includes('require('))) {
        issues.push(`${m.name}: Uses CommonJS - reduces tree-shaking effectiveness`);
      }
    });

    return issues.slice(0, 10); // Limit to top 10
  }

  /**
   * Extract package name from module path.
   * Handles node_modules paths like:
   * - node_modules/lodash/index.js -> lodash
   * - node_modules/@types/node/index.d.ts -> @types/node
   * - node_modules/react-dom/client.js -> react-dom
   */
  private extractPackageName(modulePath: string): string | null {
    if (!modulePath) return null;

    // Match node_modules packages
    const nodeModulesMatch = modulePath.match(/node_modules[/\\](@[^/\\]+[/\\][^/\\]+|[^/\\]+)/);
    if (nodeModulesMatch) {
      return nodeModulesMatch[1].replace(/[/\\]/g, '/');
    }

    // For non-node_modules paths, use basename as fallback
    // This helps catch duplicates in source code (e.g., utils/helper.js and components/helper.js)
    return path.basename(modulePath);
  }

  private findDuplicates(stats: BundleStats): DuplicateModule[] {
    // Group by package name (for node_modules) or basename (for source files)
    const packageMap = new Map<string, ModuleInfo[]>();
    const duplicates: DuplicateModule[] = [];

    stats.modules.forEach((module) => {
      const moduleName = module.name || '';
      const packageName = this.extractPackageName(moduleName) || 'unknown';

      if (!packageMap.has(packageName)) {
        packageMap.set(packageName, []);
      }
      packageMap.get(packageName)!.push(module);
    });

    // Find actual duplicates (same package/module appearing multiple times)
    packageMap.forEach((modules) => {
      if (modules.length > 1) {
        // Only consider it a duplicate if the modules have different full paths
        // (same package imported from different locations)
        const uniquePaths = new Set(modules.map(m => m.name));
        if (uniquePaths.size > 1) {
          const totalSize = modules.reduce((s: number, m) => s + (m.size || 0), 0);
          const minSize = Math.min(...modules.map(m => m.size || 0));
          duplicates.push({
            names: modules.map(m => m.name),
            totalSize,
            savings: totalSize - minSize
          });
        }
      }
    });

    return duplicates.sort((a, b) => b.totalSize - a.totalSize).slice(0, 10);
  }

  private analyzePackages(stats: BundleStats): PackageStats[] {
    const packageMap = new Map<string, { modules: ModuleInfo[]; totalGzip: number }>();
    const bundleTotalSize = stats.size;

    stats.modules.forEach((module) => {
      const packageName = this.extractPackageName(module.name);
      if (!packageName) return;

      if (!packageMap.has(packageName)) {
        packageMap.set(packageName, { modules: [], totalGzip: 0 });
      }

      const pkg = packageMap.get(packageName)!;
      pkg.modules.push(module);
      if (module.gzipSize) {
        pkg.totalGzip += module.gzipSize;
      }
    });

    const packages: PackageStats[] = [];
    packageMap.forEach((pkg, name) => {
      const packageTotalSize = pkg.modules.reduce((sum, m) => sum + m.size, 0);
      packages.push({
        name,
        totalSize: packageTotalSize,
        gzipSize: pkg.totalGzip > 0 ? pkg.totalGzip : undefined,
        moduleCount: pkg.modules.length,
        modules: pkg.modules.map(m => m.name),
        percentage: bundleTotalSize > 0 ? (packageTotalSize / bundleTotalSize) * 100 : 0
      });
    });

    return packages
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 20); // Top 20 packages
  }

  private detectUnusedModules(stats: BundleStats): UnusedModule[] {
    const unused: UnusedModule[] = [];
    const importedModules = new Set<string>();

    // Build set of all modules that are imported by others
    stats.modules.forEach(module => {
      const reasons = Array.isArray(module.reasons) ? module.reasons : [];
      reasons.forEach(reason => {
        // Extract module name from reason (format varies by bundler)
        if (typeof reason === 'string' && reason !== 'entry' && reason !== 'cjs require') {
          // Try to extract module path from reason
          const match = reason.match(/([^\s]+\.(js|ts|jsx|tsx))/);
          if (match && match[1]) {
            importedModules.add(match[1]);
          }
        }
      });
    });

    // Find modules that are not entry points and not imported
    stats.modules.forEach(module => {
      const reasons = Array.isArray(module.reasons) ? module.reasons : [];
      const isEntry = reasons.some(r => {
        const reasonStr = typeof r === 'string' ? r : String(r);
        return reasonStr === 'entry' || reasonStr.includes('entry');
      });
      const isImported = importedModules.has(module.name);
      
      if (!isEntry && !isImported && (module.size || 0) > 0) {
        // Additional check: module might be in a chunk but not actually used
        const inChunk = stats.chunks.some(chunk => {
          const chunkModules = Array.isArray(chunk.modules) ? chunk.modules : [];
          return chunkModules.includes(module.name);
        });
        
        if (inChunk) {
          unused.push({
            name: module.name || 'unknown',
            size: module.size || 0,
            reason: 'Module in bundle but no clear import path detected'
          });
        }
      }
    });

    return unused
      .sort((a, b) => b.size - a.size)
      .slice(0, 20); // Top 20 potentially unused modules
  }

  private analyzeChunks(stats: BundleStats): ChunkAnalysis {
    const chunks = stats.chunks;
    if (chunks.length === 0) {
      return {
        averageChunkSize: 0,
        averageModulesPerChunk: 0,
        largestChunk: { id: 0, name: 'N/A', size: 0, modules: [] },
        smallestChunk: { id: 0, name: 'N/A', size: 0, modules: [] },
        initialChunkSize: 0,
        recommendations: []
      };
    }

    const chunkSizes = chunks.map(c => c.size || 0);
    const totalChunkSize = chunkSizes.reduce((a, b) => a + b, 0);
    const averageChunkSize = chunks.length > 0 ? totalChunkSize / chunks.length : 0;
    
    const modulesPerChunk = chunks.map(c => (c.modules && Array.isArray(c.modules)) ? c.modules.length : 0);
    const totalModules = modulesPerChunk.reduce((a, b) => a + b, 0);
    const averageModulesPerChunk = chunks.length > 0 ? totalModules / chunks.length : 0;

    const sortedBySize = [...chunks].sort((a, b) => (b.size || 0) - (a.size || 0));
    const largestChunk = sortedBySize[0] || { id: 0, name: 'N/A', size: 0, modules: [] };
    const smallestChunk = sortedBySize[sortedBySize.length - 1] || { id: 0, name: 'N/A', size: 0, modules: [] };

    const initialChunks = chunks.filter(c => {
      // Try to identify initial chunks
      const chunkInfo = stats.chunks.find(ch => ch.id === c.id);
      return chunkInfo && 'initial' in chunkInfo && (chunkInfo as { initial?: boolean }).initial === true;
    });
    const initialChunkSize = initialChunks.reduce((sum, c) => sum + (c.size || 0), 0);

    const recommendations: string[] = [];
    
    // Large chunks recommendation
    if (averageChunkSize > 500000) {
      recommendations.push(`Average chunk size is ${(averageChunkSize / 1024).toFixed(2)}KB - consider splitting large chunks`);
    }
    
    // Too many small chunks
    if (chunks.length > 20 && averageChunkSize < 50000) {
      recommendations.push(`Many small chunks (${chunks.length}) - consider combining related chunks`);
    }
    
    // Initial chunk too large
    if (initialChunkSize > 500000) {
      recommendations.push(`Initial chunk is ${(initialChunkSize / 1024).toFixed(2)}KB - implement code-splitting for better load times`);
    }
    
    // Chunk size imbalance
    if (smallestChunk.size > 0 && largestChunk.size > smallestChunk.size * 10) {
      recommendations.push(`Chunk size imbalance detected - largest chunk is ${(largestChunk.size / smallestChunk.size).toFixed(1)}x larger than smallest`);
    }

    return {
      averageChunkSize,
      averageModulesPerChunk,
      largestChunk,
      smallestChunk,
      initialChunkSize,
      recommendations
    };
  }

  private calculateMetrics(stats: BundleStats): BundleMetrics {
    const sizes = stats.modules.map(m => m.size);
    const averageSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
    const gzipSize = stats.gzipSize || 0;
    // Brotli is typically 15-20% smaller than gzip, estimate at 17% reduction
    const brotliSize = gzipSize > 0 ? Math.round(gzipSize * 0.83) : undefined;
    
    return {
      totalSize: stats.size,
      totalGzipSize: gzipSize,
      totalBrotliSize: brotliSize,
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
