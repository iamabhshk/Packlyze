# Packlyze

[![NPM Version](https://img.shields.io/npm/v/packlyze.svg)](https://www.npmjs.com/package/packlyze)
[![Build Status](https://img.shields.io/github/workflow/status/iamabhshk/Packlyze/CI)](https://github.com/iamabhshk/Packlyze/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Packlyze

Advanced bundle analyzer with insights, recommendations, and historical tracking.

## 📊 Features

- **Package Analysis**: Parse and analyze webpack, rollup, and esbuild stats files
- **Smart Recommendations**: AI-powered suggestions to optimize your bundle
- **Tree-Shaking Detection**: Identify modules preventing tree-shaking
- **Duplicate Detection**: Find and quantify duplicate modules
- **Beautiful Reports**: Generate interactive HTML reports
- **CLI Tool**: Easy-to-use command-line interface
- **TypeScript Ready**: Full TypeScript support with type definitions

## 🚀 Installation

You can install Packlyze globally or use it via npx:

```bash
npm install -g packlyze               
# or
npx packlyze
```



## 📖 How to Use

Packlyze can be used in two main ways: as a CLI tool and as a Node.js/TypeScript library.

### 1. CLI Usage

#### Step-by-step:
1. **Install Packlyze** (globally or use npx):
  ```bash
  npm install -g packlyze
  # or
  npx packlyze --help
  ```
2. **Generate a stats file** from your bundler (e.g., webpack, rollup, esbuild):
  ```bash
  # For webpack:
  webpack --profile --json > stats.json
  ```
3. **Run Packlyze analysis**:
  ```bash
  packlyze analyze stats.json
  # or (if using npx)
  npx packlyze analyze stats.json
  ```
4. **Output an HTML report to a custom location**:
  ```bash
  packlyze analyze stats.json -o ./reports/bundle-report.html
  ```
5. **Get results in JSON format (for CI/CD or automation):**
  ```bash
  packlyze analyze stats.json --json
  ```

### 2. Library Usage

#### Step-by-step:
1. **Install Packlyze** as a dependency:
  ```bash
  npm install packlyze
  ```
2. **Import and use in your code:**
  ```typescript
  import { Packlyze } from 'packlyze';

  const analyzer = new Packlyze('./dist/stats.json');
  const result = await analyzer.analyze();

  console.log(result.recommendations);
  console.log(result.metrics);
  console.log(result.bundleStats.modules);
  ```

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
- Tree-shaking issues
- Duplicate modules
- Large modules (>5% of bundle)
- Module count analysis

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