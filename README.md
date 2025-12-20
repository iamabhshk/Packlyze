# Packlyze

[![NPM Version](https://img.shields.io/npm/v/packlyze.svg)](https://www.npmjs.com/package/packlyze)
[![Build Status](https://img.shields.io/github/workflow/status/iamabhshk/Packlyze/CI)](https://github.com/iamabhshk/Packlyze/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Packlyze

Advanced bundle analyzer with insights, recommendations, historical tracking, and a sleek HTML report.

## 📊 Features

- **Package Analysis**: Parse and analyze webpack, rollup, and esbuild stats files.
- **Package-Level Insights**: Group modules by npm package to identify heavy dependencies.
- **Smart Recommendations**: Suggestions to optimize bundle size and structure.
- **Tree-Shaking Detection**: Identify modules and patterns that block tree-shaking.
- **Duplicate Detection**: Find and quantify duplicate modules with potential savings.
- **Chunk Analysis**: Analyze code-splitting efficiency and get optimization recommendations.
- **Unused Code Detection**: Identify potentially unused modules in your bundle.
- **Historical Tracking**: Track bundle size trends over time with `packlyze trends`.
- **Dependency Graph**: Generate Graphviz DOT files to visualize module dependencies.
- **Beautiful HTML Report**: Sleek, dark-themed, interactive report with search, filter, and sort.
- **Baseline Comparison**: Compare current vs previous stats to see regressions and improvements.
- **Multiple Export Formats**: Export to HTML, CSV, or Markdown.
- **Config File Support**: Use `.packlyzerc` or `packlyze.config.json` for project defaults.
- **CLI Tool**: Easy-to-use command-line interface with filters and CI-friendly thresholds.
- **Brotli Estimates**: Get Brotli compression size estimates (17% smaller than gzip).
- **TypeScript Ready**: Full TypeScript support with type definitions.

## 🚀 Quick Start

Packlyze can be used in two main ways: as a CLI tool and as a Node.js/TypeScript library.

**1. Install Packlyze (globally or with npx):**

You can install Packlyze globally or use it via npx:

```bash
npm install -g packlyze
# or
npx packlyze --help
```

**2. Generate a stats file from your bundler (e.g., webpack):**

> ⚠️ **Important:**  
> You must generate a valid JSON stats file before running Packlyze.  
> For webpack, use the following command in your project folder:

```bash
npx webpack --profile --json stats.json
```
- This will create a readable `stats.json` file in your project directory.

**3. Run Packlyze analysis (CLI):**
```bash
packlyze analyze stats.json
# or (if using npx)
npx packlyze analyze stats.json
```

**4. (Optional) Output an HTML report:**
```bash
packlyze analyze stats.json -o ./reports/bundle-report.html
```

---

## 🐛 Common Issues & Solutions

- **"Stats file not found":**  
  Make sure `stats.json` exists in your folder.  
  Generate it using your bundler (see above).

- **"Invalid JSON in stats file":**  
  Your stats file may be corrupted or not plain JSON.  
  - Delete the file and re-run the correct webpack command.
  - Open `stats.json` in a text editor; it should start with `{` and be readable.

- **"webpack not recognized":**  
  Install webpack locally in your project:
  ```bash
  npm install --save-dev webpack webpack-cli
  ```
  Then use `npx webpack ...` to generate stats.

---

## 📁 File  Structure

Typical structure for a Packlyze:

```
Packlyze/
├── src/
│   ├── types.ts                    # TypeScript interfaces
│   ├── index.ts                    # Main entry point
│   ├── cli.ts                      # CLI interface
│   ├── analyzer/
│   │   └── packlyze.ts             # Core analysis logic
│   └── visualization/
│       └── reports.ts             # HTML report generation
├── tests/
│   └── analyzer.test.ts
├── dist/                           # Compiled output
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
├── .gitignore
└── README.md
```


## 📊 Analysis Output

Packlyze provides detailed metrics, recommendations, and insights to help you optimize your bundle.

The analyzer provides:

### Metrics
- Total bundle size
- Gzip size
- Number of modules and chunks
- Largest module
- Average module size

### Recommendations
- Critical: Address immediately
- Warning: Consider optimizing
- Info: Monitor for growth

### Insights
- Tree-shaking issues.
- Duplicate modules.
- Large modules (configurable threshold, default >5% of bundle).
- Module count and chunk analysis.

### HTML Report

The generated HTML report is a single, static file with a modern dark UI:

- **Header**: Run timestamp, optional baseline timestamp, and quick badges that summarize what you’re seeing.
- **Metrics Grid**: Cards for total size, gzip size, modules, chunks, average module size, and largest module.
  - When a `--baseline` is provided, each metric shows a colored delta (green for improvement, red for regression).
- **Recommendations**: Color-coded cards grouped by severity (critical, warning, info) with clear “Action” text.
- **Top Modules Table**: Top 10 modules by size, with size and share of the bundle.
- **Duplicate Modules Section**: Table with count, total size, potential savings, and example module names.
- **Tree-Shaking Section**: List of CommonJS / `require`-style modules that may block tree-shaking.

You can open the HTML report directly in any modern browser; no network access or JS bundling is required.

---

## ⚙️ CLI Usage & Options

The main CLI entry point is the `analyze` command:

```bash
packlyze analyze <statsFile> [options]
```

### Core options

- `-o, --output <path>`: Path to the HTML report (default: `./bundle-report.html`).
- `-j, --json`: Output raw JSON analysis to stdout instead of human-readable text/HTML.
- `-v, --verbose`: Reserved for future verbose logging.

### Focus & filter options

- `--only-duplicates`: Only print duplicate modules table in the CLI output.
- `--only-large-modules`: Only print large modules table in the CLI output.
- `--large-module-threshold <percent>`: Percentage of bundle size at which a module is considered “large” (default: `5`).
- `--no-html`: Skip HTML report generation (useful in fast CLI-only workflows).

### Baseline comparison

- `--baseline <statsFile>`: Provide a previous stats file to compare against.

When a baseline is provided:

- CLI summary prints deltas for total size, gzip size, module count, and chunk count.
- HTML metrics cards show deltas under each metric (green good, red regression).

Example:

```bash
packlyze analyze dist/stats.new.json --baseline dist/stats.old.json
```

### CI-friendly thresholds

Packlyze can enforce bundle-size budgets and fail your CI when limits are exceeded:

- `--max-gzip-size <mb>`: Fail if gzip size exceeds this many megabytes.
- `--max-initial-size <mb>`: Fail if initial bundle size (initial chunks) exceeds this many megabytes.

When thresholds are violated:

- The CLI prints a clear error message.
- `packlyze` exits with a non-zero exit code so your CI job can fail on regressions.

Example:

```bash
packlyze analyze dist/stats.json \
  --max-gzip-size 1.2 \
  --max-initial-size 0.9 \
  --no-html
```

### Historical tracking

Track bundle size over time:

```bash
# Automatically saves to .packlyze/history.json after each analysis
packlyze analyze stats.json

# View trends
packlyze trends

# View more entries
packlyze trends --limit 20
```

### Dependency graph

Generate a dependency graph visualization:

```bash
packlyze analyze stats.json --dependency-graph graph.dot

# Render with Graphviz
dot -Tsvg graph.dot -o graph.svg
```

## 🎯 Use Cases

Common scenarios where Packlyze is helpful:

- **Performance Optimization**: Identify and reduce bundle bloat
- **Code Splitting**: Find optimal splitting points
- **Dependency Analysis**: Detect unused or duplicate packages
- **Tree-Shaking Audit**: Ensure modules support ES6 imports
- **CI/CD Integration**: Monitor bundle size over time

## 📝 Examples

Here are some example commands and configurations for different frameworks:

### Webpack Project

```bash
# In your webpack config
const path = require('path');

module.exports = {
  // ... your config
  plugins: [
    // Add BundleAnalyzerPlugin if available
  ],
  // Generate stats.json
  profile: true,
};

# Command
npx packlyze analyze stats.json
```

### Next.js Project

```bash
# Build and analyze
ANALYZE=true npm run build
```

### Vue/Nuxt Project

```bash
# Generate stats
npm run build -- --report

# Analyze
packlyze analyze dist/stats.json
```

## 🐛 Troubleshooting

If you encounter issues, check the following:

### "Stats file not found"
Ensure your stats.json path is correct and the file exists.

### "Invalid JSON"
Verify your stats file is valid JSON. Generate it using your bundler's profiling mode.

### Large bundle warnings
Consider:
- Code splitting with dynamic imports
- Tree-shaking verification
- Removing unused dependencies
- Using lighter alternatives

## 🤝 Contributing

We welcome contributions! Please follow the steps below:

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For issues and questions:
- GitHub Issues: [https://github.com/iamabhshk/Packlyze/issues](https://github.com/iamabhshk/Packlyze/issues)
- Email: [abhisheksrinivasan5@gmail.com]

## 🙏 Acknowledgments

Packlyze is built with TypeScript, Commander.js, and Chalk. Special thanks to all contributors and users!

Built with TypeScript, Commander.js, and Chalk

---

**Made with ❤️ by Abhishek**