import { AnalysisResult } from '../types.js';
import fs from 'fs';
import path from 'path';

export function exportToCSV(result: AnalysisResult, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines: string[] = [];

  // Header
  lines.push('Metric,Value');
  lines.push(`Total Size (MB),${(result.metrics.totalSize / 1024 / 1024).toFixed(2)}`);
  lines.push(`Gzip Size (MB),${(result.metrics.totalGzipSize / 1024 / 1024).toFixed(2)}`);
  if (result.metrics.totalBrotliSize) {
    lines.push(`Brotli Size (MB),${(result.metrics.totalBrotliSize / 1024 / 1024).toFixed(2)}`);
  }
  lines.push(`Module Count,${result.metrics.moduleCount}`);
  lines.push(`Chunk Count,${result.metrics.chunkCount}`);
  lines.push('');

  // Top Modules
  lines.push('Top Modules');
  lines.push('Module Name,Size (KB),Percentage');
  result.bundleStats.modules.slice(0, 20).forEach(m => {
    lines.push(`"${m.name}",${(m.size / 1024).toFixed(2)},${m.percentage.toFixed(2)}`);
  });
  lines.push('');

  // Packages
  if (result.packages.length > 0) {
    lines.push('Packages');
    lines.push('Package Name,Size (KB),Modules,Percentage');
    result.packages.slice(0, 20).forEach(pkg => {
      lines.push(`"${pkg.name}",${(pkg.totalSize / 1024).toFixed(2)},${pkg.moduleCount},${pkg.percentage.toFixed(2)}`);
    });
    lines.push('');
  }

  // Duplicates
  if (result.duplicates.length > 0) {
    lines.push('Duplicates');
    lines.push('Count,Total Size (KB),Potential Savings (KB),Example Names');
    result.duplicates.forEach(dup => {
      lines.push(`${dup.names.length},${(dup.totalSize / 1024).toFixed(2)},${(dup.savings / 1024).toFixed(2)},"${dup.names[0]}"`);
    });
  }

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

export function exportToMarkdown(result: AnalysisResult, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines: string[] = [];

  lines.push('# Bundle Analysis Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date(result.timestamp).toLocaleString()}`);
  lines.push('');

  // Metrics
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Size | ${(result.metrics.totalSize / 1024 / 1024).toFixed(2)} MB |`);
  lines.push(`| Gzip Size | ${(result.metrics.totalGzipSize / 1024 / 1024).toFixed(2)} MB |`);
  if (result.metrics.totalBrotliSize) {
    lines.push(`| Brotli Size (est) | ${(result.metrics.totalBrotliSize / 1024 / 1024).toFixed(2)} MB |`);
  }
  lines.push(`| Modules | ${result.metrics.moduleCount} |`);
  lines.push(`| Chunks | ${result.metrics.chunkCount} |`);
  lines.push(`| Avg Module Size | ${(result.metrics.averageModuleSize / 1024).toFixed(2)} KB |`);
  lines.push('');

  // Top Modules
  lines.push('## Top Modules');
  lines.push('');
  lines.push('| # | Module | Size (KB) | Percentage |');
  lines.push('|---|--------|-----------|------------|');
  result.bundleStats.modules.slice(0, 20).forEach((m, i) => {
    lines.push(`| ${i + 1} | \`${m.name}\` | ${(m.size / 1024).toFixed(2)} | ${m.percentage.toFixed(2)}% |`);
  });
  lines.push('');

  // Packages
  if (result.packages.length > 0) {
    lines.push('## Top Packages');
    lines.push('');
    lines.push('| # | Package | Size (KB) | Modules | % of Bundle |');
    lines.push('|---|---------|-----------|---------|--------------|');
    result.packages.slice(0, 20).forEach((pkg, i) => {
      lines.push(`| ${i + 1} | \`${pkg.name}\` | ${(pkg.totalSize / 1024).toFixed(2)} | ${pkg.moduleCount} | ${pkg.percentage.toFixed(2)}% |`);
    });
    lines.push('');
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    result.recommendations.forEach(rec => {
      const icon = rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '🟡' : '🟢';
      lines.push(`### ${icon} ${rec.severity.toUpperCase()}: ${rec.message}`);
      lines.push('');
      lines.push(`**Action:** ${rec.action}`);
      lines.push('');
    });
  }

  // Duplicates
  if (result.duplicates.length > 0) {
    lines.push('## Duplicate Modules');
    lines.push('');
    lines.push('| Count | Total Size (KB) | Potential Savings (KB) | Example |');
    lines.push('|-------|----------------|------------------------|---------|');
    result.duplicates.forEach(dup => {
      lines.push(`| ${dup.names.length} | ${(dup.totalSize / 1024).toFixed(2)} | ${(dup.savings / 1024).toFixed(2)} | \`${dup.names[0]}\` |`);
    });
    lines.push('');
  }

  // Tree-shaking issues
  if (result.treeshakingIssues.length > 0) {
    lines.push('## Tree-Shaking Issues');
    lines.push('');
    result.treeshakingIssues.slice(0, 10).forEach(issue => {
      lines.push(`- ${issue}`);
    });
    lines.push('');
  }

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

