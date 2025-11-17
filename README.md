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

```bash
npm install -g packlyze               
# or
npx packlyze
```

## 📖 Usage

### Basic Analysis

```bash
# Generate webpack stats
webpack --profile --json > stats.json

# Analyze with packlyze
packlyze analyze stats.json

# Output HTML report to custom location
packlyze analyze stats.json -o ./reports/bundle-report.html
```

### JSON Output

```bash
packlyze analyze stats.json --json
```

### As a Library

```typescript
import { Packlyze } from 'packlyze';

const analyzer = new Packlyze('./dist/stats.json');
const result = await analyzer.analyze();

console.log(result.recommendations);
console.log(result.metrics);
console.log(result.bundleStats.modules);
```

## 📁 Project Structure

```
Packlyze-plus/
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

## 🔧 Development

### Setup

```bash
npm install
npm run dev    # Watch mode TypeScript compilation
```

### Build

```bash
npm run build  # Compile TypeScript to JavaScript
```

### Testing

```bash
npm run test           # Run all tests
npm run test:coverage  # Generate coverage report
```

### Code Quality

```bash
npm run lint      # ESLint check and fix
npm run format    # Prettier formatting
```

## 📊 Analysis Output

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

- **Performance Optimization**: Identify and reduce bundle bloat
- **Code Splitting**: Find optimal splitting points
- **Dependency Analysis**: Detect unused or duplicate packages
- **Tree-Shaking Audit**: Ensure modules support ES6 imports
- **CI/CD Integration**: Monitor bundle size over time

## 📝 Examples

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

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For issues and questions:
- GitHub Issues: [link]
- Email: [your-email]
- Twitter: [@yourhandle]

## 🙏 Acknowledgments

Built with TypeScript, Commander.js, and Chalk

---

**Made with ❤️ by [Your Name]**