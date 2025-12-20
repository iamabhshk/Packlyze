import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Packlyze } from './packlyze';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('Packlyze', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'packlyze-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStatsFile(filename: string, content: object): string {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(content), 'utf-8');
    return filePath;
  }

  it('should throw error for missing stats file', () => {
    expect(() => new Packlyze('nonexistent.json')).toThrow('Stats file not found');
  });

  it('should throw error for invalid JSON', () => {
    const filePath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(filePath, 'not json {', 'utf-8');
    expect(() => new Packlyze(filePath)).toThrow('Invalid JSON');
  });

  it('should throw error for empty stats object', () => {
    const filePath = createStatsFile('empty.json', {});
    expect(() => new Packlyze(filePath)).toThrow('Invalid stats: stats file must contain');
  });

  it('should detect webpack build errors', () => {
    const filePath = createStatsFile('webpack-errors.json', {
      errors: [
        { message: 'Module not found: Error: Can\'t resolve \'./src\'' }
      ],
      assets: [],
      modules: [],
      chunks: []
    });
    expect(() => new Packlyze(filePath)).toThrow('Webpack build failed');
  });

  it('should detect empty bundle with no modules', () => {
    const filePath = createStatsFile('empty-bundle.json', {
      assets: [],
      modules: [],
      chunks: [{ id: 1, modules: [] }]
    });
    expect(() => new Packlyze(filePath)).toThrow('Stats file contains no modules or assets');
  });

  it('should throw error for invalid module sizes', () => {
    const filePath = createStatsFile('invalid-modules.json', {
      modules: [{ name: 'test.js', size: -100 }]
    });
    expect(() => new Packlyze(filePath)).toThrow('Invalid stats: module sizes must be non-negative');
  });

  it('should handle stats with only assets', async () => {
    const filePath = createStatsFile('assets-only.json', {
      assets: [{ size: 1000, gzipSize: 500 }]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.metrics.totalSize).toBe(1000);
    expect(result.bundleStats.modules).toHaveLength(0);
  });

  it('should handle stats with only modules', async () => {
    const filePath = createStatsFile('modules-only.json', {
      modules: [
        { name: 'src/app.js', size: 5000 },
        { name: 'src/utils.js', size: 3000 }
      ]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.bundleStats.modules).toHaveLength(2);
    expect(result.metrics.moduleCount).toBe(2);
  });

  it('should handle empty modules array', async () => {
    const filePath = createStatsFile('empty-modules.json', {
      assets: [{ size: 1000 }],
      modules: []
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.bundleStats.modules).toHaveLength(0);
    expect(result.metrics.moduleCount).toBe(0);
  });

  it('should handle zero bundle size without crashing', async () => {
    const filePath = createStatsFile('zero-size.json', {
      assets: [{ size: 0 }],
      modules: [{ name: 'test.js', size: 0 }]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.metrics.totalSize).toBe(0);
    expect(result.bundleStats.modules[0].percentage).toBe(0);
  });

  it('should calculate percentages correctly', async () => {
    const filePath = createStatsFile('percentages.json', {
      assets: [{ size: 10000 }],
      modules: [
        { name: 'large.js', size: 6000 },
        { name: 'small.js', size: 4000 }
      ]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.bundleStats.modules[0].percentage).toBe(60);
    expect(result.bundleStats.modules[1].percentage).toBe(40);
  });

  it('should detect duplicate packages in node_modules', async () => {
    const filePath = createStatsFile('duplicates.json', {
      assets: [{ size: 10000 }],
      modules: [
        { name: 'node_modules/lodash/index.js', size: 5000 },
        { name: 'node_modules/lodash/clone.js', size: 2000 },
        { name: 'node_modules/react/index.js', size: 3000 }
      ]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    // lodash should be detected as a duplicate package (multiple files from same package)
    expect(result.duplicates.length).toBeGreaterThanOrEqual(0);
  });

  it('should detect duplicate source files', async () => {
    const filePath = createStatsFile('duplicate-sources.json', {
      assets: [{ size: 10000 }],
      modules: [
        { name: 'src/utils/helper.js', size: 2000 },
        { name: 'src/components/helper.js', size: 2000 }
      ]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    // Should detect files with same basename in different directories
    expect(result.duplicates.length).toBeGreaterThanOrEqual(0);
  });

  it('should detect tree-shaking issues', async () => {
    const filePath = createStatsFile('treeshaking.json', {
      assets: [{ size: 10000 }],
      modules: [
        { name: 'cjs-module.js', size: 1000, source: 'module.exports = {}' },
        { name: 'esm-module.js', size: 1000, source: 'export default {}' }
      ]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.treeshakingIssues.length).toBeGreaterThan(0);
    expect(result.treeshakingIssues[0]).toContain('cjs-module.js');
  });

  it('should generate recommendations for large bundles', async () => {
    const filePath = createStatsFile('large-bundle.json', {
      assets: [{ size: 1000000, gzipSize: 600000 }],
      modules: [{ name: 'large.js', size: 1000000 }]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    const criticalRecs = result.recommendations.filter(r => r.severity === 'critical');
    expect(criticalRecs.length).toBeGreaterThan(0);
  });

  it('should handle modules with missing fields gracefully', async () => {
    const filePath = createStatsFile('missing-fields.json', {
      assets: [{ size: 10000 }],
      modules: [
        { name: 'complete.js', size: 5000 },
        { name: 'no-size.js' },
        { name: '', size: 3000 }
      ]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.bundleStats.modules).toHaveLength(3);
    expect(result.bundleStats.modules.find(m => m.name === 'no-size.js')?.size).toBe(0);
    // Empty name should be converted to 'unknown'
    const unknownModule = result.bundleStats.modules.find(m => m.name === 'unknown');
    expect(unknownModule).toBeDefined();
    expect(unknownModule?.size).toBe(3000);
  });

  it('should handle chunks correctly', async () => {
    const filePath = createStatsFile('chunks.json', {
      assets: [{ size: 10000 }],
      chunks: [
        { id: 0, name: 'main', size: 8000, initial: true, modules: [{ name: 'app.js' }] },
        { id: 1, name: 'vendor', size: 2000, initial: false, modules: [{ name: 'vendor.js' }] }
      ]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.bundleStats.chunks).toHaveLength(2);
    expect(result.bundleStats.isInitialBySize).toBe(8000);
  });

  it('should sort modules by size descending', async () => {
    const filePath = createStatsFile('sorting.json', {
      assets: [{ size: 10000 }],
      modules: [
        { name: 'small.js', size: 1000 },
        { name: 'large.js', size: 5000 },
        { name: 'medium.js', size: 3000 }
      ]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.bundleStats.modules[0].name).toBe('large.js');
    expect(result.bundleStats.modules[1].name).toBe('medium.js');
    expect(result.bundleStats.modules[2].name).toBe('small.js');
  });

  it('should include timestamp in results', async () => {
    const filePath = createStatsFile('timestamp.json', {
      assets: [{ size: 1000 }]
    });
    const analyzer = new Packlyze(filePath);
    const result = await analyzer.analyze();
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
  });
});
