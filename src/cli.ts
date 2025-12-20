#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { table } from 'table';

import { Packlyze } from './analyzer/packlyze';
import { generateHTMLReport } from './visualization/reports';
import { exportToCSV, exportToMarkdown } from './exporters/formats';
import { loadConfig, mergeConfigWithOptions } from './config/loader';
import { saveHistoryEntry, getTrends } from './tracking/history';
import { generateDependencyGraph } from './visualization/dependency-graph';
import type { AnalysisResult } from './types';

interface AnalyzeOptions {
  output: string;
  json?: boolean;
  verbose?: boolean;
  html?: boolean;
  onlyDuplicates?: boolean;
  onlyLargeModules?: boolean;
  largeModuleThreshold: number;
  maxGzipSize?: number;
  maxInitialSize?: number;
  baseline?: string;
  format?: string;
  dependencyGraph?: string;
}

// Read version from package.json
const getVersion = (): string => {
  try {
    // In compiled CommonJS output, __dirname will be available
    const packagePath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
};

const program = new Command();

program
  .name('packlyze')
  .description('Advanced package analyzer with insights and recommendations')
  .version(getVersion())
  .helpOption('-h, --help', 'Show help');

program
  .command('analyze <statsFile>')
  .description('Analyze a webpack/rollup/esbuild stats.json file')
  .option('-o, --output <path>', 'Output HTML report path', './bundle-report.html')
  .option('-j, --json', 'Output as JSON')
  .option('-v, --verbose', 'Verbose output')
  .option('--no-html', 'Do not generate HTML report')
  .option('--format <format>', 'Export format: csv, markdown, or html (default: html)', 'html')
  .option('--only-duplicates', 'Show only duplicate modules information')
  .option('--only-large-modules', 'Show only large modules information')
  .option('--large-module-threshold <percent>', 'Threshold in % of bundle size for a module to be considered large', parseFloat, 5)
  .option('--max-gzip-size <mb>', 'Fail if gzip bundle size exceeds this value (in MB)', parseFloat)
  .option('--max-initial-size <mb>', 'Fail if initial bundle size exceeds this value (in MB)', parseFloat)
  .option('--baseline <statsFile>', 'Baseline stats file to compare against')
  .option('--dependency-graph <path>', 'Generate dependency graph DOT file')
  .action(async (statsFile: string, options: AnalyzeOptions) => {
    // Load config file and merge with CLI options
    const config = loadConfig();
    const mergedOptions = mergeConfigWithOptions(config, options as unknown as Record<string, unknown>) as unknown as AnalyzeOptions;

    const spinner = ora('Analyzing package...').start();

    const logVerbose = (message: string) => {
      if (mergedOptions.verbose) {
        spinner.text = message;
      }
    };

    try {
      // Validate file exists
      logVerbose('Validating stats file...');
      if (!fs.existsSync(statsFile)) {
        throw new Error(
          `File not found: ${statsFile}\n` +
          `💡 Tip: Generate stats file with: webpack --profile --json ${statsFile}\n` +
          `   Or for other bundlers, check the Packlyze documentation.`
        );
      }

      logVerbose('Loading and parsing stats file...');
      const analyzer = new Packlyze(statsFile, mergedOptions.verbose ? logVerbose : undefined);
      
      logVerbose('Extracting bundle statistics...');
      const result = await analyzer.analyze();

      let baselineResult: AnalysisResult | undefined;

      if (mergedOptions.baseline) {
        logVerbose('Loading baseline file...');
        const baselinePath = mergedOptions.baseline as string;
        if (!fs.existsSync(baselinePath)) {
          throw new Error(
            `Baseline file not found: ${baselinePath}\n` +
            `💡 Tip: Use a previous stats.json file as baseline for comparison.`
          );
        }
        logVerbose('Analyzing baseline...');
        const baselineAnalyzer = new Packlyze(baselinePath, mergedOptions.verbose ? logVerbose : undefined);
        baselineResult = await baselineAnalyzer.analyze();
      }

      spinner.succeed('Analysis complete!');

      if (mergedOptions.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Display formatted results
        printSummary(result, mergedOptions, baselineResult);

        if (!mergedOptions.onlyDuplicates && !mergedOptions.onlyLargeModules) {
          printTopModules(result);
          printPackageAnalysis(result);
          printChunkAnalysis(result);
          printUnusedModules(result);
          printRecommendations(result);
          printTreeshakingIssues(result);
        }

        if (mergedOptions.onlyDuplicates || (!mergedOptions.onlyLargeModules && !mergedOptions.onlyDuplicates)) {
          printDuplicates(result);
        }

        if (mergedOptions.onlyLargeModules || (!mergedOptions.onlyLargeModules && !mergedOptions.onlyDuplicates)) {
          printLargeModules(result, mergedOptions.largeModuleThreshold);
        }

        if (mergedOptions.html !== false) {
          const format = mergedOptions.format || 'html';
          const outputPath = mergedOptions.output;

          if (format === 'csv') {
            exportToCSV(result, outputPath.replace(/\.html$/, '.csv'));
            console.log(chalk.green(`✅ CSV report saved to ${outputPath.replace(/\.html$/, '.csv')}`));
          } else if (format === 'markdown' || format === 'md') {
            exportToMarkdown(result, outputPath.replace(/\.html$/, '.md'));
            console.log(chalk.green(`✅ Markdown report saved to ${outputPath.replace(/\.html$/, '.md')}`));
          } else {
            generateHTMLReport(result, outputPath, baselineResult);
            console.log(chalk.green(`✅ HTML report saved to ${outputPath}`));
          }
        }

        const exitCode = evaluateThresholds(result, mergedOptions);
        
        // Generate dependency graph if requested
        if (mergedOptions.dependencyGraph) {
          const graphPath = mergedOptions.dependencyGraph;
          generateDependencyGraph(result, graphPath);
          console.log(chalk.green(`✅ Dependency graph saved to ${graphPath}`));
          console.log(chalk.gray('   Render with: dot -Tsvg graph.dot -o graph.svg'));
        }

        // Save to history if not in JSON mode
        if (!mergedOptions.json) {
          try {
            saveHistoryEntry(result);
            if (mergedOptions.verbose) {
              console.log(chalk.gray('💾 Analysis saved to history'));
            }
          } catch (err) {
            // Silently fail - history is optional
          }
        }

        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      }
    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(`Error: ${String(error)}`));
      process.exit(1);
    }
  });

program
  .command('trends')
  .description('Show bundle size trends over time')
  .option('-l, --limit <number>', 'Number of entries to show', '10')
  .action((options) => {
    const limit = Math.max(1, Math.min(100, parseInt(options.limit || '10', 10) || 10));
    const trends = getTrends(undefined, limit);

    if (trends.length === 0) {
      console.log(chalk.yellow('\n📊 No history found. Run "packlyze analyze" to start tracking.\n'));
      return;
    }

    console.log(chalk.bold.cyan(`\n📈 Bundle Size Trends (Last ${trends.length} builds)\n`));

    const data: string[][] = [];
    data.push(['#', 'Date', 'Total (MB)', 'Gzip (MB)', 'Modules', 'Chunks', 'Change']);

    trends.forEach((entry, index) => {
      const date = new Date(entry.timestamp).toLocaleDateString();
      const totalMb = (entry.metrics.totalSize / 1024 / 1024).toFixed(2);
      const gzipMb = (entry.metrics.totalGzipSize / 1024 / 1024).toFixed(2);
      
      let change = '';
      if (index > 0) {
        const prevGzip = trends[index - 1].metrics.totalGzipSize;
        const diff = entry.metrics.totalGzipSize - prevGzip;
        const diffMb = (diff / 1024 / 1024).toFixed(2);
        if (diff > 0) {
          change = chalk.red(`+${diffMb}MB`);
        } else if (diff < 0) {
          change = chalk.green(`${diffMb}MB`);
        } else {
          change = chalk.gray('0MB');
        }
      }

      data.push([
        String(trends.length - index),
        date,
        totalMb,
        gzipMb,
        String(entry.metrics.moduleCount),
        String(entry.metrics.chunkCount),
        change || '-'
      ]);
    });

    console.log(table(data, {
      columns: {
        0: { alignment: 'right' },
        1: { alignment: 'left' },
        2: { alignment: 'right' },
        3: { alignment: 'right' },
        4: { alignment: 'right' },
        5: { alignment: 'right' },
        6: { alignment: 'left' }
      }
    }));

    console.log();
  });

program.parse();

function printSummary(result: AnalysisResult, options: AnalyzeOptions, baseline?: AnalysisResult): void {
  console.log(chalk.bold.cyan('\n📊 Package Analysis Results\n'));

  console.log(chalk.bold('Metrics:'));
  const totalMb = result.metrics.totalSize / 1024 / 1024;
  const gzipMb = result.metrics.totalGzipSize / 1024 / 1024;

  console.log(`  Total Size: ${chalk.red(totalMb.toFixed(2))}MB${formatDeltaMb(baseline?.metrics.totalSize, result.metrics.totalSize)}`);
  console.log(`  Gzip Size: ${chalk.yellow(gzipMb.toFixed(2))}MB${formatDeltaMb(baseline?.metrics.totalGzipSize, result.metrics.totalGzipSize)}`);
  if (result.metrics.totalBrotliSize) {
    const brotliMb = result.metrics.totalBrotliSize / 1024 / 1024;
    console.log(`  Brotli Size (est): ${chalk.cyan(brotliMb.toFixed(2))}MB`);
  }
  console.log(`  Modules: ${chalk.blue(result.metrics.moduleCount)}${formatDeltaCount(baseline?.metrics.moduleCount, result.metrics.moduleCount)}`);
  console.log(`  Chunks: ${chalk.blue(result.metrics.chunkCount)}${formatDeltaCount(baseline?.metrics.chunkCount, result.metrics.chunkCount)}`);
  console.log(`  Avg Module: ${chalk.green((result.metrics.averageModuleSize / 1024).toFixed(2))}KB\n`);

  if (options.maxGzipSize) {
    console.log(
      `  Max Gzip Threshold: ${chalk.yellow(options.maxGzipSize)}MB (${result.metrics.totalGzipSize / 1024 / 1024 > options.maxGzipSize ? chalk.red('violated') : chalk.green('ok')})`,
    );
  }

  if (options.maxInitialSize) {
    const initialMb = (result.bundleStats.isInitialBySize / 1024 / 1024).toFixed(2);
    console.log(
      `  Max Initial Threshold: ${chalk.yellow(options.maxInitialSize)}MB (${Number(initialMb) > options.maxInitialSize ? chalk.red('violated') : chalk.green('ok')})`,
    );
  }
  console.log();
}

function printTopModules(result: AnalysisResult): void {
  console.log(chalk.bold('Top 5 Modules:'));
  result.bundleStats.modules.slice(0, 5).forEach((m, i) => {
    const bar = '█'.repeat(Math.round(m.percentage / 2));
    console.log(`  ${i + 1}. ${m.name.slice(-30).padEnd(30)} ${(m.size / 1024).toFixed(2)}KB ${bar}`);
  });
  console.log();
}

function printPackageAnalysis(result: AnalysisResult): void {
  if (result.packages.length === 0) return;

  console.log(chalk.bold.magenta('\n📦 Top Packages by Size\n'));

  const data: string[][] = [];
  data.push(['#', 'Package', 'Size (KB)', 'Modules', '% of Bundle']);

  result.packages.slice(0, 10).forEach((pkg, index) => {
    data.push([
      String(index + 1),
      pkg.name.slice(-40),
      (pkg.totalSize / 1024).toFixed(2),
      String(pkg.moduleCount),
      pkg.percentage.toFixed(2)
    ]);
  });

  console.log(
    table(data, {
      columns: {
        0: { alignment: 'right' },
        1: { alignment: 'left' },
        2: { alignment: 'right' },
        3: { alignment: 'right' },
        4: { alignment: 'right' }
      }
    })
  );
}

function printChunkAnalysis(result: AnalysisResult): void {
  if (!result.chunkAnalysis) return;

  const analysis = result.chunkAnalysis;
  console.log(chalk.bold.blue('\n📦 Chunk Analysis\n'));

  console.log(`  Average Chunk Size: ${chalk.cyan((analysis.averageChunkSize / 1024).toFixed(2))}KB`);
  console.log(`  Average Modules per Chunk: ${chalk.cyan(analysis.averageModulesPerChunk.toFixed(1))}`);
  console.log(`  Largest Chunk: ${chalk.yellow(analysis.largestChunk.name)} (${(analysis.largestChunk.size / 1024).toFixed(2)}KB)`);
  console.log(`  Smallest Chunk: ${chalk.green(analysis.smallestChunk.name)} (${(analysis.smallestChunk.size / 1024).toFixed(2)}KB)`);
  console.log(`  Initial Chunk Size: ${chalk.magenta((analysis.initialChunkSize / 1024).toFixed(2))}KB\n`);

  if (analysis.recommendations.length > 0) {
    console.log(chalk.bold('Chunk Recommendations:'));
    analysis.recommendations.forEach(rec => {
      console.log(`  • ${rec}`);
    });
    console.log();
  }
}

function printUnusedModules(result: AnalysisResult): void {
  if (!result.unusedModules || result.unusedModules.length === 0) return;

  console.log(chalk.bold.yellow('\n🔍 Potentially Unused Modules\n'));
  console.log(chalk.gray('  Note: These modules may be unused or have unclear import paths\n'));

  const data: string[][] = [];
  data.push(['#', 'Module', 'Size (KB)', 'Reason']);

  result.unusedModules.slice(0, 10).forEach((module, index) => {
    data.push([
      String(index + 1),
      module.name.slice(-50),
      (module.size / 1024).toFixed(2),
      module.reason.slice(0, 40)
    ]);
  });

  console.log(
    table(data, {
      columns: {
        0: { alignment: 'right' },
        1: { alignment: 'left' },
        2: { alignment: 'right' },
        3: { alignment: 'left' }
      }
    })
  );
}

function printRecommendations(result: AnalysisResult): void {
  if (result.recommendations.length === 0) return;

  console.log(chalk.bold.cyan('\n💡 Recommendations\n'));
  result.recommendations.forEach((rec) => {
    const icon = rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '🟡' : '🟢';
    console.log(`${icon} ${rec.message}`);
    console.log(`   → ${rec.action}\n`);
  });
}

function printTreeshakingIssues(result: AnalysisResult): void {
  if (result.treeshakingIssues.length === 0) return;

  console.log(chalk.bold.yellow('\n🌳 Tree-Shaking Issues\n'));
  result.treeshakingIssues.slice(0, 3).forEach((issue) => {
    console.log(`  • ${issue}`);
  });
  if (result.treeshakingIssues.length > 3) {
    console.log(`  ... and ${result.treeshakingIssues.length - 3} more`);
  }
  console.log();
}

function printDuplicates(result: AnalysisResult): void {
  if (result.duplicates.length === 0) {
    console.log(chalk.bold.green('\n✅ No duplicate modules detected\n'));
    return;
  }

  console.log(chalk.bold.magenta('\n🔁 Duplicate Modules\n'));

  const data: string[][] = [];
  data.push(['#', 'Count', 'Total Size (KB)', 'Potential Savings (KB)', 'Example Names']);

  result.duplicates.forEach((dup, index) => {
    const totalKb = (dup.totalSize / 1024).toFixed(2);
    const savingsKb = (dup.savings / 1024).toFixed(2);
    const sampleNames = dup.names.slice(0, 3).join('\n');

    data.push([String(index + 1), String(dup.names.length), totalKb, savingsKb, sampleNames]);
  });

  console.log(
    table(data, {
      columns: {
        0: { alignment: 'right' },
        1: { alignment: 'right' },
        2: { alignment: 'right' },
        3: { alignment: 'right' },
        4: { alignment: 'left' },
      },
    }),
  );
}

function printLargeModules(result: AnalysisResult, thresholdPercent: number): void {
  const threshold = Number.isFinite(thresholdPercent) ? thresholdPercent : 5;
  const largeModules = result.bundleStats.modules.filter((m) => m.percentage >= threshold);

  if (largeModules.length === 0) {
    console.log(chalk.bold.green(`\n✅ No modules above ${threshold}% of bundle size\n`));
    return;
  }

  console.log(chalk.bold.red(`\n📦 Modules >= ${threshold}% of bundle size\n`));
  const data: string[][] = [];
  data.push(['#', 'Module', 'Size (KB)', '% of Bundle']);

  largeModules.forEach((m, index) => {
    data.push([String(index + 1), m.name.slice(-60), (m.size / 1024).toFixed(2), m.percentage.toFixed(2)]);
  });

  console.log(
    table(data, {
      columns: {
        0: { alignment: 'right' },
        1: { alignment: 'left' },
        2: { alignment: 'right' },
        3: { alignment: 'right' },
      },
    }),
  );
}

function evaluateThresholds(result: AnalysisResult, options: AnalyzeOptions): number {
  let exitCode = 0;

  if (typeof options.maxGzipSize === 'number') {
    const gzipMb = result.metrics.totalGzipSize / 1024 / 1024;
    if (gzipMb > options.maxGzipSize) {
      console.error(
        chalk.red(
          `\n❌ Bundle gzip size (${gzipMb.toFixed(2)}MB) exceeds threshold (${options.maxGzipSize}MB).`,
        ),
      );
      exitCode = 2;
    }
  }

  if (typeof options.maxInitialSize === 'number') {
    const initialMb = result.bundleStats.isInitialBySize / 1024 / 1024;
    if (initialMb > options.maxInitialSize) {
      console.error(
        chalk.red(
          `\n❌ Initial bundle size (${initialMb.toFixed(2)}MB) exceeds threshold (${options.maxInitialSize}MB).`,
        ),
      );
      exitCode = Math.max(exitCode, 3);
    }
  }

  return exitCode;
}

function formatDeltaMb(baselineBytes?: number, currentBytes?: number): string {
  if (baselineBytes === undefined || currentBytes === undefined) return '';
  const diffMb = (currentBytes - baselineBytes) / 1024 / 1024;
  if (Math.abs(diffMb) < 0.01) return '';
  const sign = diffMb > 0 ? '+' : '-';
  const color = diffMb > 0 ? chalk.red : chalk.green;
  return ` (${color(`${sign}${Math.abs(diffMb).toFixed(2)}MB vs baseline`)})`;
}

function formatDeltaCount(baseline?: number, current?: number): string {
  if (baseline === undefined || current === undefined) return '';
  const diff = current - baseline;
  if (diff === 0) return '';
  const sign = diff > 0 ? '+' : '-';
  const color = diff > 0 ? chalk.red : chalk.green;
  return ` (${color(`${sign}${Math.abs(diff)} vs baseline`)})`;
}
