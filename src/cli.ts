#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Packlyze } from './analyzer/packlyze';
import { generateHTMLReport } from './visualization/reports';
import fs from 'fs';

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
  .action(async (statsFile, options) => {
    const spinner = ora('Analyzing package...').start();

    try {
      // Validate file exists
      if (!fs.existsSync(statsFile)) {
        throw new Error(`File not found: ${statsFile}`);
      }

      const analyzer = new Packlyze(statsFile);
      const result = await analyzer.analyze();

      spinner.succeed('Analysis complete!');

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Display formatted results
        console.log(chalk.bold.cyan('\n📊 Package Analysis Results\n'));
        
        console.log(chalk.bold('Metrics:'));
        console.log(`  Total Size: ${chalk.red((result.metrics.totalSize / 1024 / 1024).toFixed(2))}MB`);
        console.log(`  Gzip Size: ${chalk.yellow((result.metrics.totalGzipSize / 1024 / 1024).toFixed(2))}MB`);
        console.log(`  Modules: ${chalk.blue(result.metrics.moduleCount)}`);
        console.log(`  Chunks: ${chalk.blue(result.metrics.chunkCount)}`);
        console.log(`  Avg Module: ${chalk.green((result.metrics.averageModuleSize / 1024).toFixed(2))}KB\n`);

        // Top modules
        console.log(chalk.bold('Top 5 Modules:'));
        result.bundleStats.modules.slice(0, 5).forEach((m, i) => {
          const bar = '█'.repeat(Math.round(m.percentage / 2));
          console.log(`  ${i + 1}. ${m.name.slice(-30).padEnd(30)} ${(m.size / 1024).toFixed(2)}KB ${bar}`);
        });

        // Recommendations
        if (result.recommendations.length > 0) {
          console.log(chalk.bold.cyan('\n💡 Recommendations\n'));
          result.recommendations.forEach(rec => {
            const icon = rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '🟡' : '🟢';
            console.log(`${icon} ${rec.message}`);
            console.log(`   → ${rec.action}\n`);
          });
        }

        // Tree-shaking issues
        if (result.treeshakingIssues.length > 0) {
          console.log(chalk.bold.yellow('\n🌳 Tree-Shaking Issues\n'));
          result.treeshakingIssues.slice(0, 3).forEach(issue => {
            console.log(`  • ${issue}`);
          });
          if (result.treeshakingIssues.length > 3) {
            console.log(`  ... and ${result.treeshakingIssues.length - 3} more`);
          }
          console.log();
        }

        // Generate HTML report
        generateHTMLReport(result, options.output);
        console.log(chalk.green(`✅ Report saved to ${options.output}`));
      }
    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(`Error: ${String(error)}`));
      process.exit(1);
    }
  });

program.parse();
