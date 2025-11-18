#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import { table } from 'table';

import { Packlyze } from './analyzer/packlyze';
import { generateHTMLReport } from './visualization/reports';
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
}

const program = new Command();

program
  .name('packlyze')
  .description('Advanced package analyzer with insights and recommendations')
  .version('1.0.0')
  .helpOption('-h, --help', 'Show help');

program
  .command('analyze <statsFile>')
  .description('Analyze a webpack/rollup/esbuild stats.json file')
  .option('-o, --output <path>', 'Output HTML report path', './bundle-report.html')
  .option('-j, --json', 'Output as JSON')
  .option('-v, --verbose', 'Verbose output')
  .option('--no-html', 'Do not generate HTML report')
  .option('--only-duplicates', 'Show only duplicate modules information')
  .option('--only-large-modules', 'Show only large modules information')
  .option('--large-module-threshold <percent>', 'Threshold in % of bundle size for a module to be considered large', parseFloat, 5)
  .option('--max-gzip-size <mb>', 'Fail if gzip bundle size exceeds this value (in MB)', parseFloat)
  .option('--max-initial-size <mb>', 'Fail if initial bundle size exceeds this value (in MB)', parseFloat)
  .option('--baseline <statsFile>', 'Baseline stats file to compare against')
  .action(async (statsFile: string, options: AnalyzeOptions) => {
    const spinner = ora('Analyzing package...').start();

    try {
      // Validate file exists
      if (!fs.existsSync(statsFile)) {
        throw new Error(`File not found: ${statsFile}`);
      }

      const analyzer = new Packlyze(statsFile);
      const result = await analyzer.analyze();

      let baselineResult: AnalysisResult | undefined;

      if (options.baseline) {
        const baselinePath = options.baseline as string;
        if (!fs.existsSync(baselinePath)) {
          throw new Error(`Baseline file not found: ${baselinePath}`);
        }
        const baselineAnalyzer = new Packlyze(baselinePath);
        baselineResult = await baselineAnalyzer.analyze();
      }

      spinner.succeed('Analysis complete!');

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Display formatted results
        printSummary(result, options, baselineResult);

        if (!options.onlyDuplicates && !options.onlyLargeModules) {
          printTopModules(result);
          printRecommendations(result);
          printTreeshakingIssues(result);
        }

        if (options.onlyDuplicates || (!options.onlyLargeModules && !options.onlyDuplicates)) {
          printDuplicates(result);
        }

        if (options.onlyLargeModules || (!options.onlyLargeModules && !options.onlyDuplicates)) {
          printLargeModules(result, options.largeModuleThreshold);
        }

        if (options.html !== false) {
          generateHTMLReport(result, options.output, baselineResult);
          console.log(chalk.green(`✅ Report saved to ${options.output}`));
        }

        const exitCode = evaluateThresholds(result, options);
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

program.parse();

function printSummary(result: AnalysisResult, options: AnalyzeOptions, baseline?: AnalysisResult): void {
  console.log(chalk.bold.cyan('\n📊 Package Analysis Results\n'));

  console.log(chalk.bold('Metrics:'));
  const totalMb = result.metrics.totalSize / 1024 / 1024;
  const gzipMb = result.metrics.totalGzipSize / 1024 / 1024;

  console.log(`  Total Size: ${chalk.red(totalMb.toFixed(2))}MB${formatDeltaMb(baseline?.metrics.totalSize, result.metrics.totalSize)}`);
  console.log(`  Gzip Size: ${chalk.yellow(gzipMb.toFixed(2))}MB${formatDeltaMb(baseline?.metrics.totalGzipSize, result.metrics.totalGzipSize)}`);
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
