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

**3. Run Packlyze analysis:**
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