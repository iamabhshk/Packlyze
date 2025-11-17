#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const packlyze_1 = require("./analyzer/packlyze");
const reports_1 = require("./visualization/reports");
const fs_1 = __importDefault(require("fs"));
const program = new commander_1.Command();
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
    const spinner = (0, ora_1.default)('Analyzing package...').start();
    try {
        // Validate file exists
        if (!fs_1.default.existsSync(statsFile)) {
            throw new Error(`File not found: ${statsFile}`);
        }
        const analyzer = new packlyze_1.Packlyze(statsFile);
        const result = await analyzer.analyze();
        spinner.succeed('Analysis complete!');
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
        }
        else {
            // Display formatted results
            console.log(chalk_1.default.bold.cyan('\n📊 Package Analysis Results\n'));
            console.log(chalk_1.default.bold('Metrics:'));
            console.log(`  Total Size: ${chalk_1.default.red((result.metrics.totalSize / 1024 / 1024).toFixed(2))}MB`);
            console.log(`  Gzip Size: ${chalk_1.default.yellow((result.metrics.totalGzipSize / 1024 / 1024).toFixed(2))}MB`);
            console.log(`  Modules: ${chalk_1.default.blue(result.metrics.moduleCount)}`);
            console.log(`  Chunks: ${chalk_1.default.blue(result.metrics.chunkCount)}`);
            console.log(`  Avg Module: ${chalk_1.default.green((result.metrics.averageModuleSize / 1024).toFixed(2))}KB\n`);
            // Top modules
            console.log(chalk_1.default.bold('Top 5 Modules:'));
            result.bundleStats.modules.slice(0, 5).forEach((m, i) => {
                const bar = '█'.repeat(Math.round(m.percentage / 2));
                console.log(`  ${i + 1}. ${m.name.slice(-30).padEnd(30)} ${(m.size / 1024).toFixed(2)}KB ${bar}`);
            });
            // Recommendations
            if (result.recommendations.length > 0) {
                console.log(chalk_1.default.bold.cyan('\n💡 Recommendations\n'));
                result.recommendations.forEach(rec => {
                    const icon = rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '🟡' : '🟢';
                    console.log(`${icon} ${rec.message}`);
                    console.log(`   → ${rec.action}\n`);
                });
            }
            // Tree-shaking issues
            if (result.treeshakingIssues.length > 0) {
                console.log(chalk_1.default.bold.yellow('\n🌳 Tree-Shaking Issues\n'));
                result.treeshakingIssues.slice(0, 3).forEach(issue => {
                    console.log(`  • ${issue}`);
                });
                if (result.treeshakingIssues.length > 3) {
                    console.log(`  ... and ${result.treeshakingIssues.length - 3} more`);
                }
                console.log();
            }
            // Generate HTML report
            (0, reports_1.generateHTMLReport)(result, options.output);
            console.log(chalk_1.default.green(`✅ Report saved to ${options.output}`));
        }
    }
    catch (error) {
        spinner.fail('Analysis failed');
        console.error(chalk_1.default.red(`Error: ${String(error)}`));
        process.exit(1);
    }
});
program.parse();
//# sourceMappingURL=cli.js.map