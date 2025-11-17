"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Packlyze = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class Packlyze {
    constructor(statsPath) {
        if (!fs_1.default.existsSync(statsPath)) {
            throw new Error(`Stats file not found: ${statsPath}`);
        }
        this.baseDir = path_1.default.dirname(statsPath);
        this.loadStats(statsPath);
    }
    loadStats(statsPath) {
        const content = fs_1.default.readFileSync(statsPath, 'utf-8');
        try {
            this.statsData = JSON.parse(content);
        }
        catch (e) {
            throw new Error(`Invalid JSON in stats file: ${e}`);
        }
    }
    async analyze() {
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
    extractBundleStats() {
        const assets = this.statsData.assets || [];
        const modules = (this.statsData.modules || []).map((m) => ({
            name: m.name || 'unknown',
            size: m.size || 0,
            gzipSize: m.gzipSize,
            percentage: (m.size || 0) / this.getTotalSize() * 100,
            reasons: m.reasons?.map((r) => r.moduleName) || []
        }));
        return {
            name: this.statsData.name || 'bundle',
            size: this.getTotalSize(),
            gzipSize: this.getTotalGzipSize(),
            modules: modules.sort((a, b) => b.size - a.size),
            chunks: this.extractChunks(),
            isInitialBySize: this.getInitialBundleSize(),
            isInitialByCount: assets.length,
            parsedSize: this.statsData.parsedSize || 0
        };
    }
    getTotalSize() {
        const assets = this.statsData.assets || [];
        return assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
    }
    getTotalGzipSize() {
        const assets = this.statsData.assets || [];
        return assets.reduce((sum, asset) => sum + (asset.gzipSize || 0), 0);
    }
    extractChunks() {
        return (this.statsData.chunks || []).map((chunk) => ({
            id: chunk.id,
            name: chunk.name || `chunk-${chunk.id}`,
            size: chunk.size || 0,
            gzipSize: chunk.gzipSize,
            modules: chunk.modules?.map((m) => m.name) || []
        }));
    }
    getInitialBundleSize() {
        return (this.statsData.chunks || [])
            .filter((c) => c.initial === true)
            .reduce((sum, c) => sum + (c.size || 0), 0);
    }
    generateRecommendations(stats) {
        const recommendations = [];
        // Large bundle check
        if (stats.gzipSize && stats.gzipSize > 500000) {
            recommendations.push({
                severity: 'critical',
                message: `Bundle size is ${(stats.gzipSize / 1024 / 1024).toFixed(2)}MB (gzipped)`,
                action: 'Implement aggressive code-splitting or consider alternative libraries'
            });
        }
        else if (stats.gzipSize && stats.gzipSize > 250000) {
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
    detectTreeshakingIssues() {
        const issues = [];
        const modules = this.statsData.modules || [];
        modules.forEach((m) => {
            if (m.source?.includes('module.exports') || m.source?.includes('require(')) {
                issues.push(`${m.name}: Uses CommonJS - reduces tree-shaking effectiveness`);
            }
        });
        return issues.slice(0, 10); // Limit to top 10
    }
    findDuplicates() {
        const moduleMap = new Map();
        const duplicates = [];
        (this.statsData.modules || []).forEach((module) => {
            const baseName = path_1.default.basename(module.name || '');
            if (!moduleMap.has(baseName)) {
                moduleMap.set(baseName, []);
            }
            moduleMap.get(baseName).push(module);
        });
        moduleMap.forEach((modules) => {
            if (modules.length > 1) {
                const totalSize = modules.reduce((s, m) => s + (m.size || 0), 0);
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
    calculateMetrics(stats) {
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
                reasons: []
            },
            averageModuleSize: averageSize
        };
    }
}
exports.Packlyze = Packlyze;
//# sourceMappingURL=packlyze.js.map