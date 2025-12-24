import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  BundleStats,
  ModuleInfo,
  ChunkInfo,
  Recommendation,
  BundleMetrics,
  DuplicateModule,
  PackageStats,
  ChunkAnalysis,
  UnusedModule,
  AnalysisResult
} from '../types.js';

export class Packlyze {
  private statsData: {
    assets?: Array<{ size?: number; gzipSize?: number; }>;
    modules?: Array<ModuleInfo & { reasons?: Array<{ moduleName: string }>;
      source?: string; }>;
    chunks?: Array<{
      id: string | number;
      name?: string;
      size?: number;
      gzipSize?: number;
      modules?: Array<{ name: string }>;
      initial?: boolean;
    }>;
    name?: string;
    parsedSize?: number;
  } = {};
  private baseDir: string;
  private verboseLog?: (message: string) => void;

  constructor(statsPath: string, verboseLog?: (message: string) => void) {
    this.verboseLog = verboseLog;
    if (!fs.existsSync(statsPath)) {
      throw new Error(`Stats file not found: ${statsPath}`);
    }
    this.baseDir = path.dirname(statsPath);
    this.loadStats(statsPath);
  }

  private log(message: string): void {
    if (this.verboseLog) {
      this.verboseLog(message);
    }
  }

  /**
   * Automatically detect entry point by scanning common locations
   * Returns entry point path relative to where webpack config will be (this.baseDir)
   */
  private detectEntryPoint(): string | null {
    // Try src in the same directory as stats file, or one level up (common patterns)
    const possibleSrcDirs = [
      path.join(this.baseDir, 'src'),           // stats.json in project root, src in same dir
      path.join(path.dirname(this.baseDir), 'src')  // stats.json in subdirectory, src one level up
    ];
    
    let srcDir: string | null = null;
    let srcDirRelativePath: string | null = null;
    
    for (const dir of possibleSrcDirs) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        srcDir = dir;
        // Calculate relative path from webpack config location (this.baseDir)
        srcDirRelativePath = path.relative(this.baseDir, dir);
        // Normalize to use forward slashes and ensure it starts with ./
        if (!srcDirRelativePath.startsWith('.')) {
          srcDirRelativePath = './' + srcDirRelativePath.replace(/\\/g, '/');
        } else {
          srcDirRelativePath = srcDirRelativePath.replace(/\\/g, '/');
        }
        break;
      }
    }
    
    if (!srcDir || !srcDirRelativePath) {
      return null;
    }

    // Priority order for entry point detection
    // main.* files are typically the actual entry points, so check them first
    const entryPointPatterns = [
      // Main entry points (highest priority - these are typically the actual entry points)
      'main.tsx', 'main.ts', 'main.jsx', 'main.js',
      // React App files (common but not always the entry point)
      'App.tsx', 'App.jsx', 'app.tsx', 'app.jsx',
      // Index files (fallback entry points)
      'index.tsx', 'index.ts', 'index.jsx', 'index.js',
      // Vue/Angular
      'app.ts', 'app.js',
    ];

    try {
      const files = fs.readdirSync(srcDir);
      
      // Check for exact matches first (case-sensitive)
      for (const pattern of entryPointPatterns) {
        if (files.includes(pattern)) {
          const entryFile = path.join(srcDir, pattern);
          // Verify file exists
          if (fs.existsSync(entryFile) && fs.statSync(entryFile).isFile()) {
            // Return path relative to webpack config location
            const relativePath = path.relative(this.baseDir, entryFile);
            return relativePath.startsWith('.') ? relativePath.replace(/\\/g, '/') : './' + relativePath.replace(/\\/g, '/');
          }
        }
      }

      // Fallback: case-insensitive search
      for (const pattern of entryPointPatterns) {
        const lowerPattern = pattern.toLowerCase();
        const found = files.find(f => f.toLowerCase() === lowerPattern);
        if (found) {
          const entryFile = path.join(srcDir, found);
          // Verify file exists
          if (fs.existsSync(entryFile) && fs.statSync(entryFile).isFile()) {
            // Return path relative to webpack config location
            const relativePath = path.relative(this.baseDir, entryFile);
            return relativePath.startsWith('.') ? relativePath.replace(/\\/g, '/') : './' + relativePath.replace(/\\/g, '/');
          }
        }
      }

      // Last resort: find any .tsx, .ts, .jsx, or .js file in src root
      const jsFiles = files.filter(f => 
        /\.(tsx?|jsx?)$/i.test(f) && 
        !f.includes('.test.') && 
        !f.includes('.spec.')
      );
      
      if (jsFiles.length > 0) {
        // Prefer files that look like entry points
        const entryLike = jsFiles.find(f => 
          /^(app|main|index)\./i.test(f)
        );
        const selectedFile = entryLike || jsFiles[0];
        const entryFile = path.join(srcDir, selectedFile);
        
        // Verify file exists
        if (fs.existsSync(entryFile) && fs.statSync(entryFile).isFile()) {
          // Return path relative to webpack config location
          const relativePath = path.relative(this.baseDir, entryFile);
          return relativePath.startsWith('.') ? relativePath.replace(/\\/g, '/') : './' + relativePath.replace(/\\/g, '/');
        }
      }
    } catch (error) {
      // Silently fail - can't read directory
      this.log(`Could not scan src directory: ${error}`);
    }

    return null;
  }

  /**
   * Automatically install missing dependencies
   */
  public async installMissingDependencies(missingPackages: string[]): Promise<boolean> {
    if (missingPackages.length === 0) return false;
    
    const installCommand = this.generateInstallCommand(missingPackages);
    if (!installCommand) return false;
    
    try {
      this.log(`Installing missing dependencies: ${missingPackages.join(', ')}...`);
      execSync(installCommand, { 
        stdio: 'inherit',
        cwd: this.baseDir
      });
      this.log(`✅ Successfully installed missing dependencies!`);
      return true;
    } catch (error) {
      this.log(`❌ Failed to install dependencies: ${error}`);
      return false;
    }
  }

  /**
   * Detect missing loaders/dependencies from webpack errors
   */
  private detectMissingDependencies(errors: Array<{ message?: string; details?: string }>): string[] {
    const missingPackages: string[] = [];
    
    // Map of loader names to their required npm packages
    const loaderToPackages: Record<string, string[]> = {
      'ts-loader': ['ts-loader', 'typescript'],
      'babel-loader': ['babel-loader', '@babel/core', '@babel/preset-env'],
      'css-loader': ['css-loader'],
      'style-loader': ['style-loader'],
      'sass-loader': ['sass-loader', 'sass'],
      'less-loader': ['less-loader', 'less'],
      'file-loader': ['file-loader'],
      'url-loader': ['url-loader'],
      'html-loader': ['html-loader'],
      'vue-loader': ['vue-loader', 'vue'],
    };
    
    // Additional mappings for common module resolution errors
    const moduleToPackages: Record<string, string[]> = {
      'typescript': ['typescript'],
      'react': ['react', 'react-dom'],
      '@babel/core': ['@babel/core'],
      '@babel/preset-env': ['@babel/preset-env'],
      '@babel/preset-react': ['@babel/preset-react'],
      '@babel/preset-typescript': ['@babel/preset-typescript'],
    };
    
    // Check for "Can't resolve" errors that mention loaders or modules
    for (const error of errors) {
      const message = (error.message || '') + ' ' + (error.details || '');
      
      // Pattern: "Can't resolve 'ts-loader'" or "Cannot find module 'ts-loader'"
      const resolveMatch = message.match(/Can'?t resolve ['"]([^'"]+)['"]|Cannot find module ['"]([^'"]+)['"]/i);
      if (resolveMatch) {
        const moduleName = resolveMatch[1] || resolveMatch[2];
        
        // Check if it's a known loader
        if (loaderToPackages[moduleName]) {
          missingPackages.push(...loaderToPackages[moduleName]);
        } 
        // Check if it's a known module
        else if (moduleToPackages[moduleName]) {
          missingPackages.push(...moduleToPackages[moduleName]);
        } 
        // Generic loader pattern (ends with -loader)
        else if (moduleName.includes('-loader')) {
          missingPackages.push(moduleName);
        }
        // Check for TypeScript-related errors
        else if (moduleName === 'typescript' || message.includes('typescript')) {
          missingPackages.push('typescript');
        }
      }
    }
    
    // Remove duplicates
    return [...new Set(missingPackages)];
  }

  /**
   * Check if packages are installed by reading package.json
   */
  private checkPackagesInstalled(packages: string[]): { missing: string[]; installed: string[] } {
    const possibleRoots = [
      this.baseDir,
      path.dirname(this.baseDir)
    ];
    
    for (const projectRoot of possibleRoots) {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          const allDeps = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
            ...(pkg.peerDependencies || {})
          };
          
          const missing: string[] = [];
          const installed: string[] = [];
          
          for (const pkgName of packages) {
            // Check exact match
            if (allDeps[pkgName]) {
              installed.push(pkgName);
            } else {
              // For scoped packages, check if any version is installed
              if (pkgName.startsWith('@')) {
                const scope = pkgName.split('/')[0];
                const isInstalled = Object.keys(allDeps).some(dep => 
                  dep === pkgName || dep.startsWith(scope + '/')
                );
                if (isInstalled) {
                  installed.push(pkgName);
                } else {
                  missing.push(pkgName);
                }
              } else {
                missing.push(pkgName);
              }
            }
          }
          
          return { missing, installed };
        } catch {
          // If we can't read package.json, assume all are missing
          return { missing: packages, installed: [] };
        }
      }
    }
    
    return { missing: packages, installed: [] };
  }

  /**
   * Generate install command for missing packages
   */
  private generateInstallCommand(missingPackages: string[]): string {
    if (missingPackages.length === 0) return '';
    
    // Check if npm, yarn, or pnpm is being used
    const possibleRoots = [this.baseDir, path.dirname(this.baseDir)];
    let packageManager = 'npm';
    
    for (const projectRoot of possibleRoots) {
      if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
        packageManager = 'yarn';
        break;
      }
      if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
        packageManager = 'pnpm';
        break;
      }
    }
    
    const packagesStr = missingPackages.join(' ');
    
    if (packageManager === 'yarn') {
      return `yarn add --dev ${packagesStr}`;
    } else if (packageManager === 'pnpm') {
      return `pnpm add --save-dev ${packagesStr}`;
    } else {
      return `npm install --save-dev ${packagesStr}`;
    }
  }

  /**
   * Find project root by looking for package.json
   */
  private findProjectRoot(): string[] {
    const possibleRoots: string[] = [];
    
    // Start from baseDir and walk up the directory tree
    let currentDir = this.baseDir;
    const maxDepth = 5; // Limit search depth
    let depth = 0;
    
    while (depth < maxDepth && currentDir !== path.dirname(currentDir)) {
      possibleRoots.push(currentDir);
      currentDir = path.dirname(currentDir);
      depth++;
    }
    
    return possibleRoots;
  }

  /**
   * Detect missing file extensions in resolve.extensions
   * Example: Error resolving './App' when App.tsx exists but .tsx not in extensions
   */
  private detectMissingExtensions(errors: Array<{ message?: string; details?: string }>): Array<string> {
    const missingExtensions: Set<string> = new Set();
    
    for (const error of errors) {
      const message = (error.message || '') + ' ' + (error.details || '');
      
      // Pattern: Can't resolve './App' or './Component'
      // Check if file exists with common extensions
      const resolveError = message.match(/Can't resolve ['"]([^'"]+)['"]/);
      if (resolveError) {
        const importPath = resolveError[1];
        // Skip if it's a package (starts with letter, no ./ or ../)
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          const projectRoot = this.baseDir;
          const possibleExtensions = ['.tsx', '.ts', '.jsx', '.js', '.json', '.css', '.scss', '.svg', '.png'];
          
          for (const ext of possibleExtensions) {
            const possibleFile = path.resolve(projectRoot, importPath + ext);
            if (fs.existsSync(possibleFile)) {
              // File exists with this extension, but webpack couldn't resolve it
              // This suggests the extension is missing from resolve.extensions
              missingExtensions.add(ext);
            }
          }
        }
      }
    }
    
    return Array.from(missingExtensions);
  }

  /**
   * Detect missing CSS/image loaders
   */
  private detectMissingAssetLoaders(errors: Array<{ message?: string; details?: string }>): { css: boolean; images: boolean } {
    let css = false;
    let images = false;
    
    for (const error of errors) {
      const message = (error.message || '') + ' ' + (error.details || '');
      
      // CSS loader errors
      if (message.includes('.css') && 
          (message.includes("You may need an appropriate loader") || 
           message.includes("Can't resolve") && message.match(/\.css['"]/))) {
        css = true;
      }
      
      // Image loader errors
      if ((message.includes('.svg') || message.includes('.png') || message.includes('.jpg') || message.includes('.gif')) &&
          (message.includes("You may need an appropriate loader") || 
           message.includes("Can't resolve") && message.match(/\.(svg|png|jpg|jpeg|gif)['"]/))) {
        images = true;
      }
    }
    
    return { css, images };
  }

  /**
   * Detect baseUrl usage without proper webpack configuration
   */
  private detectBaseUrlIssues(errors: Array<{ message?: string; details?: string }>): boolean {
    for (const error of errors) {
      const message = (error.message || '') + ' ' + (error.details || '');
      
      // Pattern: Can't resolve 'src/utils' or 'app/components' (absolute imports without ./ or ../)
      // This suggests baseUrl is set in tsconfig but not configured in webpack
      const absoluteImportError = message.match(/Can't resolve ['"]([^./][^'"]+)['"]/);
      if (absoluteImportError) {
        const importPath = absoluteImportError[1];
        // Check if it's not a node_modules package (doesn't start with @ or common package names)
        if (!importPath.startsWith('@') && 
            !importPath.match(/^(react|vue|angular|@babel|@types)/)) {
          // Check if this path exists in the project
          const projectRoot = this.baseDir;
          const possiblePath = path.join(projectRoot, importPath);
          if (fs.existsSync(possiblePath) || fs.existsSync(possiblePath + '.ts') || fs.existsSync(possiblePath + '.tsx')) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Detect case-sensitivity issues
   */
  private detectCaseSensitivityIssues(errors: Array<{ message?: string; details?: string }>): Array<{ expected: string; actual: string }> {
    const issues: Array<{ expected: string; actual: string }> = [];
    
    for (const error of errors) {
      const message = (error.message || '') + ' ' + (error.details || '');
      
      // Pattern: Can't resolve './components/Button' but './Components/button.tsx' exists
      const resolveError = message.match(/Can't resolve ['"]([^'"]+)['"]/);
      if (resolveError) {
        const importPath = resolveError[1];
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          const projectRoot = this.baseDir;
          const fullPath = path.resolve(projectRoot, importPath);
          const dir = path.dirname(fullPath);
          const basename = path.basename(fullPath);
          
          if (fs.existsSync(dir)) {
            // Check for case-insensitive matches
            const files = fs.readdirSync(dir);
            const lowerBasename = basename.toLowerCase();
            
            for (const file of files) {
              if (file.toLowerCase() === lowerBasename && file !== basename) {
                issues.push({ expected: importPath, actual: path.join(path.dirname(importPath), file) });
                break;
              }
            }
          }
        }
      }
    }
    
    return issues;
  }

  /**
   * Extract alias patterns from error messages
   * Example: "Can't resolve '@/hooks/useAuth'" -> { alias: '@', path: '@/hooks/useAuth' }
   */
  private extractAliasFromErrors(errors: Array<{ message?: string; details?: string }>): Array<{ alias: string; examplePath: string }> {
    const aliases: Map<string, string> = new Map();
    
    for (const error of errors) {
      const message = (error.message || '') + ' ' + (error.details || '');
      
      // Match patterns like '@/hooks/useAuth', '@\\hooks\\useAuth', or "'@/hooks/useAuth'"
      const aliasPatterns = [
        /['"`]?(@[^/\\'"`\s]+)[/\\]/g,  // @/something or @\something
        /Can't resolve ['"`]?(@[^/\\'"`\s]+)[/\\]/g,
        /Cannot resolve ['"`]?(@[^/\\'"`\s]+)[/\\]/g,
      ];
      
      for (const pattern of aliasPatterns) {
        let match;
        while ((match = pattern.exec(message)) !== null) {
          const alias = match[1];
          if (alias && !aliases.has(alias)) {
            // Extract the example path
            const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const fullPathMatch = message.match(new RegExp(`['"]?${escapedAlias}[/\\\\][^'"\\s]+`));
            aliases.set(alias, fullPathMatch ? fullPathMatch[0].replace(/['"`]/g, '') : `${alias}/...`);
          }
        }
      }
    }
    
    return Array.from(aliases.entries()).map(([alias, examplePath]) => ({ alias, examplePath }));
  }

  /**
   * Infer alias mapping by analyzing project structure
   * Example: '@' -> 'src' (most common convention)
   */
  private inferAliasMapping(alias: string, examplePath: string): string | null {
    // Common alias mappings
    const commonMappings: Record<string, string[]> = {
      '@': ['src', 'source', 'app', 'lib'],
      '~': ['src', 'source'],
      '@app': ['src/app', 'app'],
      '@components': ['src/components', 'components'],
      '@utils': ['src/utils', 'utils'],
      '@lib': ['src/lib', 'lib'],
    };
    
    // Check if we have a known mapping
    if (commonMappings[alias]) {
      const projectRoot = this.baseDir;
      for (const possiblePath of commonMappings[alias]) {
        const fullPath = path.join(projectRoot, possiblePath);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          return possiblePath;
        }
      }
    }
    
    // Try to infer from the example path
    // If error is '@/hooks/useAuth', try to find where 'hooks' directory exists
    const pathParts = examplePath.split(/[/\\]/);
    if (pathParts.length >= 2) {
      const firstPart = pathParts[1]; // e.g., 'hooks' from '@/hooks/useAuth'
      const projectRoot = this.baseDir;
      
      // Check common locations
      const possibleLocations = [
        path.join(projectRoot, 'src', firstPart),
        path.join(projectRoot, firstPart),
        path.join(path.dirname(projectRoot), 'src', firstPart),
      ];
      
      for (const location of possibleLocations) {
        if (fs.existsSync(location) && fs.statSync(location).isDirectory()) {
          // Found the directory, infer the base path
          const relativePath = path.relative(projectRoot, path.dirname(location));
          return relativePath || 'src'; // Default to 'src' if at root
        }
      }
      
      // If we found 'hooks' in 'src/hooks', infer '@' -> 'src'
      const srcHooks = path.join(projectRoot, 'src', firstPart);
      if (fs.existsSync(srcHooks)) {
        return 'src';
      }
    }
    
    // Default inference: '@' usually maps to 'src'
    if (alias === '@') {
      const srcPath = path.join(this.baseDir, 'src');
      if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
        return 'src';
      }
    }
    
    return null;
  }

  /**
   * Extract TypeScript path aliases from tsconfig.json
   * Note: Does not handle "extends" - only reads the direct tsconfig.json file
   */
  private getTypeScriptPathAliases(): Record<string, string> {
    // Search in multiple locations: baseDir, parent dirs, and project root (where package.json is)
    const possibleRoots = this.findProjectRoot();
    
    this.log(`Searching for tsconfig.json in: ${possibleRoots.join(', ')}`);

    for (const projectRoot of possibleRoots) {
      const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
      this.log(`Checking: ${tsconfigPath}`);
      
      if (fs.existsSync(tsconfigPath)) {
        this.log(`Found tsconfig.json at: ${tsconfigPath}`);
        try {
          const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
          // Remove comments (simple regex-based approach)
          // Note: This is a basic implementation and may not handle all edge cases
          // For production, consider using a proper JSONC parser
          const cleanedContent = tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
          const tsconfig = JSON.parse(cleanedContent);
          
          // Check if tsconfig uses "extends" - we can't resolve that without additional tooling
          if (tsconfig.extends) {
            this.log(`Note: tsconfig.json uses "extends" - path aliases from extended configs are not automatically resolved`);
            this.log(`Extended config: ${tsconfig.extends}`);
          }
          
          // Check if compilerOptions exists
          if (!tsconfig.compilerOptions) {
            this.log(`Warning: tsconfig.json found but compilerOptions is missing`);
            continue;
          }
          
          // Check for moduleResolution: "bundler" which doesn't work well with webpack
          const moduleResolution = tsconfig.compilerOptions.moduleResolution;
          if (moduleResolution === 'bundler') {
            this.log(`Warning: moduleResolution: "bundler" is set in tsconfig.json. This works with Vite/esbuild but not webpack.`);
            this.log(`Consider using "node" or "node16" for webpack compatibility.`);
          }
          
          const paths = tsconfig.compilerOptions.paths;
          if (paths && typeof paths === 'object') {
            this.log(`Found compilerOptions.paths in tsconfig.json`);
            const aliases: Record<string, string> = {};
            
            for (const [alias, pathArray] of Object.entries(paths)) {
              // Validate alias key
              if (!alias || typeof alias !== 'string') {
                continue;
              }
              
              if (Array.isArray(pathArray) && pathArray.length > 0) {
                // Take the first path mapping
                let mappedPath = pathArray[0] as string;
                
                // Validate mapped path
                if (!mappedPath || typeof mappedPath !== 'string') {
                  continue;
                }
                
                // Remove wildcards from both alias and mapped path
                // TypeScript: "@/*": ["src/*"] -> webpack: "@": "src"
                // TypeScript: "@/components/*": ["src/components/*"] -> webpack: "@/components": "src/components"
                const aliasKey = alias.replace(/\*$/, '');
                
                // Skip empty alias keys
                if (!aliasKey) {
                  continue;
                }
                
                if (mappedPath.includes('*')) {
                  mappedPath = mappedPath.replace(/\*$/, '');
                }
                
                // Skip empty mapped paths
                if (!mappedPath) {
                  continue;
                }
                
                // Resolve the mapped path relative to tsconfig.json location
                // The path in tsconfig is relative to the tsconfig.json file location
                // If the path doesn't start with . or /, it's relative to baseUrl or tsconfig location
                let resolvedPath: string;
                if (path.isAbsolute(mappedPath)) {
                  resolvedPath = mappedPath;
                } else {
                  // Check if there's a baseUrl in tsconfig
                  const baseUrl = tsconfig.compilerOptions?.baseUrl;
                  if (baseUrl && typeof baseUrl === 'string') {
                    const baseUrlPath = path.isAbsolute(baseUrl) 
                      ? baseUrl 
                      : path.resolve(path.dirname(tsconfigPath), baseUrl);
                    resolvedPath = path.resolve(baseUrlPath, mappedPath);
                  } else {
                    resolvedPath = path.resolve(path.dirname(tsconfigPath), mappedPath);
                  }
                }
                
                // Validate that the resolved path exists (or at least the directory)
                const resolvedDir = path.dirname(resolvedPath);
                if (!fs.existsSync(resolvedDir)) {
                  this.log(`Warning: Path alias "${aliasKey}" resolves to non-existent directory: ${resolvedDir}`);
                  // Continue anyway - webpack will handle the error
                }
                
                // Store the absolute path - we'll make it relative in the webpack config generation
                aliases[aliasKey] = resolvedPath;
              }
            }
            
            if (Object.keys(aliases).length > 0) {
              this.log(`Found ${Object.keys(aliases).length} TypeScript path alias(es) in tsconfig.json`);
              return aliases;
            }
          } else {
            this.log(`tsconfig.json found but compilerOptions.paths is missing or invalid`);
          }
        } catch (error) {
          // Log the error for debugging
          this.log(`Could not parse tsconfig.json at ${tsconfigPath}: ${error}`);
          // Continue searching other locations
        }
      } else {
        this.log(`tsconfig.json not found at: ${tsconfigPath}`);
      }
    }
    
    // If we get here, no tsconfig.json was found or it had no paths
    this.log(`No tsconfig.json with path aliases found. Searched in: ${possibleRoots.map(p => path.join(p, 'tsconfig.json')).join(', ')}`);
    return {};
  }

  /**
   * Check if webpack config file exists and detect project type
   */
  private checkWebpackConfig(): { exists: boolean; path: string | null; isESModule: boolean; hasTypeScript: boolean; framework: string | null; wrongExtension: boolean; correctFileName: string } {
    const configNames = ['webpack.config.js', 'webpack.config.cjs', 'webpack.config.ts'];
    // Try project root (same directory as stats.json) or one level up
    const possibleRoots = [
      this.baseDir,  // stats.json in project root
      path.dirname(this.baseDir)  // stats.json in subdirectory
    ];
    
    // First, check project type
    const projectRoot = possibleRoots[0];
    const packageJsonPath = path.join(projectRoot, 'package.json');
    let isESModule = false;
    let hasTypeScript = false;
    let framework: string | null = null;
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        isESModule = pkg.type === 'module';
        
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.react || deps['react-dom']) {
          framework = 'react';
        } else if (deps.vue || deps['@vue/cli-service']) {
          framework = 'vue';
        } else if (deps['@angular/core']) {
          framework = 'angular';
        }
        
        hasTypeScript = !!deps.typescript || fs.existsSync(path.join(projectRoot, 'tsconfig.json'));
      } catch {
        // Ignore parse errors
      }
    }
    
    const correctFileName = isESModule ? 'webpack.config.cjs' : 'webpack.config.js';
    
    // Now check for existing config files
    for (const projectRoot of possibleRoots) {
      for (const name of configNames) {
        const configPath = path.join(projectRoot, name);
        if (fs.existsSync(configPath)) {
          // Check if the config file has the wrong extension for this project type
          const wrongExtension = isESModule && name === 'webpack.config.js';
          
          return { 
            exists: true, 
            path: configPath, 
            isESModule, 
            hasTypeScript, 
            framework,
            wrongExtension,
            correctFileName
          };
        }
      }
    }
    
    // Config not found
    return { 
      exists: false, 
      path: null, 
      isESModule, 
      hasTypeScript, 
      framework,
      wrongExtension: false,
      correctFileName
    };
  }

  /**
   * Generate webpack config template based on project type
   */
  private generateWebpackConfig(entryPoint: string, isESModule: boolean, hasTypeScript: boolean, framework: string | null): string {
    const useTypeScript = hasTypeScript;
    const isReact = framework === 'react';
    
    // Get TypeScript path aliases if available
    const pathAliases = hasTypeScript ? this.getTypeScriptPathAliases() : {};
    const hasAliases = Object.keys(pathAliases).length > 0;
    
    // Generate alias configuration string
    let aliasConfig = '';
    if (hasAliases) {
      // Determine the project root (where webpack.config will be)
      const projectRoot = this.baseDir;
      const aliasEntries = Object.entries(pathAliases)
        .map(([key, absolutePath]) => {
          // Escape single quotes in the key if present
          const escapedKey = key.replace(/'/g, "\\'");
          
          // Make the path relative to the project root (where webpack.config will be)
          let relativePath = path.relative(projectRoot, absolutePath);
          
          // Handle edge case: if paths are the same, use '.'
          if (!relativePath || relativePath === '') {
            relativePath = '.';
          }
          
          // Handle edge case: if path goes outside project root, use absolute path
          // This can happen with complex baseUrl configurations
          if (relativePath.startsWith('..')) {
            // Use absolute path resolution
            const normalizedAbsolute = absolutePath.replace(/\\/g, '/');
            return `    '${escapedKey}': '${normalizedAbsolute}'`;
          }
          
          // Normalize path separators for cross-platform compatibility
          const normalizedPath = relativePath.replace(/\\/g, '/');
          
          // Escape any single quotes in the path
          const escapedPath = normalizedPath.replace(/'/g, "\\'");
          
          // Use path.resolve(__dirname, ...) to ensure correct resolution
          // __dirname in webpack config will be the project root
          return `    '${escapedKey}': path.resolve(__dirname, '${escapedPath}')`;
        })
        .join(',\n');
      aliasConfig = `,\n    alias: {\n${aliasEntries}\n    }`;
      
      // Add note about tsconfig-paths-webpack-plugin as alternative
      this.log(`Note: Using webpack resolve.alias for path aliases.`);
      this.log(`Alternative: You can use tsconfig-paths-webpack-plugin for automatic sync with tsconfig.json`);
    }
    
    let config = '';
    
    if (isESModule) {
      // CommonJS config for ES module projects
      config = `const path = require('path');

module.exports = {
  entry: '${entryPoint}',
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  
  resolve: {
    extensions: ['.js', '.jsx'${useTypeScript ? ", '.ts', '.tsx'" : ''}, '.json']${aliasConfig},
    modules: ['node_modules', path.resolve(__dirname, 'src')],
  },
  
  module: {
    rules: [
`;
      
      if (useTypeScript) {
        // Configure ts-loader to work better with path aliases
        // Note: transpileOnly: true speeds up builds but webpack still needs resolve.alias for path resolution
        const tsLoaderOptions = hasAliases 
          ? `{
            transpileOnly: true,
            // Path aliases are handled by webpack resolve.alias above
            // TypeScript type checking happens separately (e.g., via tsc --noEmit)
          }`
          : `{
            transpileOnly: true
          }`;
        
        config += `      {
        test: /\\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: ${tsLoaderOptions}
        }
      },
`;
      }
      
      if (isReact && !useTypeScript) {
        config += `      {
        test: /\\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
`;
      }
      
      config += `      {
        test: /\\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource'
      },
      {
        test: /\\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  
  mode: 'production',
  
  stats: {
    modules: true,
    chunks: true,
    chunkModules: true,
    chunkOrigins: true,
    assets: true,
    entrypoints: true
  }
};
`;
    } else {
      // Standard CommonJS config
      config = `const path = require('path');

module.exports = {
  entry: '${entryPoint}',
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  
  resolve: {
    extensions: ['.js', '.jsx'${useTypeScript ? ", '.ts', '.tsx'" : ''}, '.json']${aliasConfig},
    modules: ['node_modules', path.resolve(__dirname, 'src')],
  },
  
  module: {
    rules: [
`;
      
      if (useTypeScript) {
        // Configure ts-loader to work better with path aliases
        // Note: transpileOnly: true speeds up builds but webpack still needs resolve.alias for path resolution
        const tsLoaderOptions = hasAliases 
          ? `{
            transpileOnly: true,
            // Path aliases are handled by webpack resolve.alias above
            // TypeScript type checking happens separately (e.g., via tsc --noEmit)
          }`
          : `{
            transpileOnly: true
          }`;
        
        config += `      {
        test: /\\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: ${tsLoaderOptions}
        }
      },
`;
      }
      
      if (isReact && !useTypeScript) {
        config += `      {
        test: /\\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
`;
      }
      
      config += `      {
        test: /\\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource'
      },
      {
        test: /\\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  
  mode: 'production',
  
  stats: {
    modules: true,
    chunks: true,
    chunkModules: true,
    chunkOrigins: true,
    assets: true,
    entrypoints: true
  }
};
`;
    }
    
    return config;
  }

  /**
   * Automatically create webpack config file
   */
  private createWebpackConfig(entryPoint: string, isESModule: boolean, hasTypeScript: boolean, framework: string | null): string {
    const projectRoot = this.baseDir; // Use stats.json directory as project root
    
    // Validate project root exists and is writable
    if (!fs.existsSync(projectRoot)) {
      throw new Error(`Project root directory does not exist: ${projectRoot}`);
    }
    
    const stats = fs.statSync(projectRoot);
    if (!stats.isDirectory()) {
      throw new Error(`Project root is not a directory: ${projectRoot}`);
    }
    
    const configFileName = isESModule ? 'webpack.config.cjs' : 'webpack.config.js';
    const configPath = path.join(projectRoot, configFileName);
    
    // Check if file already exists
    if (fs.existsSync(configPath)) {
      // Check if it's actually a file (not a directory)
      const existingStats = fs.statSync(configPath);
      if (!existingStats.isFile()) {
        throw new Error(`Path exists but is not a file: ${configPath}`);
      }
      
      // Check if we need to regenerate the config (e.g., if path aliases are missing)
      const pathAliases = hasTypeScript ? this.getTypeScriptPathAliases() : {};
      const hasAliases = Object.keys(pathAliases).length > 0;
      
      if (hasAliases) {
        // Read existing config to check if it has aliases
        try {
          const existingConfig = fs.readFileSync(configPath, 'utf-8');
          // Check if the config has a resolve.alias section
          const hasAliasSection = existingConfig.includes('resolve:') && 
                                  existingConfig.includes('alias:');
          
          if (!hasAliasSection) {
            // Config exists but doesn't have aliases - regenerate it
            this.log(`Regenerating webpack config to include path aliases...`);
            const configContent = this.generateWebpackConfig(entryPoint, isESModule, hasTypeScript, framework);
            fs.writeFileSync(configPath, configContent, 'utf-8');
            this.log(`Updated ${configFileName} with path alias configuration`);
            return configPath;
          }
        } catch (error) {
          // If we can't read the existing config, regenerate it
          this.log(`Could not read existing config, regenerating...`);
          const configContent = this.generateWebpackConfig(entryPoint, isESModule, hasTypeScript, framework);
          fs.writeFileSync(configPath, configContent, 'utf-8');
          this.log(`Regenerated ${configFileName} with path alias configuration`);
          return configPath;
        }
      }
      
      this.log(`Webpack config already exists at ${configPath}`);
      return configPath; // Return existing path
    }
    
    // Validate entry point exists and fix path if needed
    let entryPointPath: string;
    let finalEntryPoint = entryPoint;
    
    if (path.isAbsolute(entryPoint)) {
      entryPointPath = entryPoint;
    } else {
      // Resolve relative to project root (where webpack config will be)
      entryPointPath = path.resolve(projectRoot, entryPoint);
    }
    
    // If entry point doesn't exist at the specified path, try to find it
    if (!fs.existsSync(entryPointPath)) {
      this.log(`Warning: Entry point does not exist at: ${entryPointPath}`);
      
      // Try to find the correct path
      const entryFileName = path.basename(entryPoint);
      const possiblePaths = [
        path.join(projectRoot, 'src', entryFileName),           // src/App.tsx in same dir as stats.json
        path.join(path.dirname(projectRoot), 'src', entryFileName), // src/App.tsx one level up
        path.join(projectRoot, entryFileName),                  // App.tsx in same dir as stats.json
      ];
      
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath) && fs.statSync(possiblePath).isFile()) {
          // Found it! Update the entry point to the correct relative path
          const correctRelative = path.relative(projectRoot, possiblePath);
          finalEntryPoint = correctRelative.startsWith('.') 
            ? correctRelative.replace(/\\/g, '/') 
            : './' + correctRelative.replace(/\\/g, '/');
          entryPointPath = possiblePath;
          this.log(`✅ Found entry point at: ${entryPointPath}`);
          this.log(`✅ Updated entry point in config to: ${finalEntryPoint}`);
          break;
        }
      }
      
      // If still not found, log warning but continue
      if (!fs.existsSync(entryPointPath)) {
        this.log(`Warning: Could not find entry point file: ${entryFileName}`);
        this.log(`Warning: Searched in: ${possiblePaths.join(', ')}`);
        // Continue anyway - webpack will handle the error
      }
    } else {
      // Verify it's actually a file
      const stats = fs.statSync(entryPointPath);
      if (!stats.isFile()) {
        this.log(`Warning: Entry point is not a file: ${entryPointPath}`);
      } else {
        // Verify the path is correct relative to project root
        const relativePath = path.relative(projectRoot, entryPointPath);
        finalEntryPoint = relativePath.startsWith('.') 
          ? relativePath.replace(/\\/g, '/') 
          : './' + relativePath.replace(/\\/g, '/');
        this.log(`✅ Entry point verified: ${entryPointPath} (using: ${finalEntryPoint})`);
      }
    }
    
    // Use the corrected entry point
    entryPoint = finalEntryPoint;
    
    // Generate config content
    const configContent = this.generateWebpackConfig(entryPoint, isESModule, hasTypeScript, framework);
    
    // Write config file
    try {
      fs.writeFileSync(configPath, configContent, 'utf-8');
      this.log(`Created ${configFileName} at ${configPath}`);
      return configPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Failed to create ${configFileName}: ${errorMessage}`);
      
      // Provide helpful error message
      if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
        throw new Error(`Permission denied: Cannot write to ${configPath}\n💡 Check file permissions or run with appropriate privileges`);
      }
      if (errorMessage.includes('ENOSPC')) {
        throw new Error(`No space left on device: Cannot write ${configPath}`);
      }
      throw new Error(`Failed to create webpack config: ${errorMessage}`);
    }
  }

  private loadStats(statsPath: string): void {
    this.log('Reading stats file...');
    
    // Check if file exists and is readable
    if (!fs.existsSync(statsPath)) {
      throw new Error(`Stats file not found: ${statsPath}`);
    }
    
    // Check if it's a file (not a directory)
    const stats = fs.statSync(statsPath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${statsPath}`);
    }
    
    // Check file size (warn if very large)
    const fileSizeKB = stats.size / 1024;
    const fileSizeMB = fileSizeKB / 1024;
    this.log(`Stats file size: ${fileSizeKB.toFixed(2)} KB`);
    
    if (fileSizeMB > 100) {
      this.log(`Warning: Stats file is very large (${fileSizeMB.toFixed(2)} MB). Parsing may take a while...`);
    }
    
    try {
      const content = fs.readFileSync(statsPath, 'utf-8');
      
      // Check if file is empty
      if (!content || content.trim().length === 0) {
        throw new Error('Stats file is empty');
      }
      
      this.log('Parsing JSON...');
      this.statsData = JSON.parse(content);
      this.log('Validating stats structure...');
      this.validateStats();
      
      // Count modules from different sources
      const topLevelModules = this.statsData.modules?.length || 0;
      const chunks = this.statsData.chunks || [];
      let chunkModules = 0;
      chunks.forEach((chunk) => {
        if (Array.isArray(chunk.modules)) {
          chunkModules += chunk.modules.length;
        }
      });
      
      this.log(`Found ${topLevelModules} top-level modules, ${chunkModules} modules in chunks, ${chunks.length} chunks`);
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error(`Invalid JSON in stats file: ${e.message}\n💡 Make sure the stats file was generated correctly (e.g., webpack --profile --json stats.json)`);
      }
      if (e instanceof Error && e.message.includes('Invalid stats')) {
        throw e;
      }
      if (e instanceof Error && e.message.includes('empty')) {
        throw e;
      }
      throw new Error(`Error reading stats file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private validateStats(): void {
    if (!this.statsData || typeof this.statsData !== 'object') {
      throw new Error('Invalid stats: stats file must be a valid JSON object');
    }

    // Check for webpack build errors
    const errors = Array.isArray((this.statsData as { errors?: unknown[] }).errors) 
      ? (this.statsData as { errors: Array<{ message?: string; details?: string }> }).errors 
      : [];
    
    if (errors.length > 0) {
      const errorMessages = errors
        .slice(0, 3)
        .map((e, i) => `${i + 1}. ${e.message || 'Unknown error'}`)
        .join('\n   ');
      
      // Check for entry point resolution errors and auto-detect entry files
      const entryPointError = errors.find(e => 
        e.message?.includes("Can't resolve") && 
        (e.message.includes('./src') || e.message.includes("'./src'") || e.message.includes('"./src"'))
      );
      
      // Check for ES module config loading errors
      const esModuleConfigError = errors.find(e => 
        e.message?.includes('require is not defined in ES module scope') ||
        e.message?.includes('To treat it as a CommonJS script, rename it to use the \'.cjs\' file extension')
      );
      
      let suggestion = '';
      
      if (esModuleConfigError) {
        // ES module config loading error - config has wrong extension
        const configCheck = this.checkWebpackConfig();
        const detectedEntry = this.detectEntryPoint();
        const entryPoint = detectedEntry || './src/index.js';
        
          try {
            // Automatically create the correct config file
            this.createWebpackConfig(
              entryPoint,
              configCheck.isESModule,
              configCheck.hasTypeScript,
              configCheck.framework
            );
          
          const currentFileName = configCheck.path ? path.basename(configCheck.path) : 'webpack.config.js';
          
          suggestion = `\n\n✅ Created ${configCheck.correctFileName} automatically!\n\n` +
            `Your project uses ES modules, so webpack needs ${configCheck.correctFileName} instead of ${currentFileName}.\n\n` +
            `🔍 Auto-detected entry point: ${entryPoint}\n` +
            `📦 Project type: ${configCheck.framework || 'Generic'}${configCheck.hasTypeScript ? ' + TypeScript' : ''} (ES Modules)\n\n` +
            `💡 Next steps:\n`;
          
          if (configCheck.hasTypeScript) {
            suggestion += `   1. Install required loaders: npm install --save-dev ts-loader typescript\n`;
          }
          if (configCheck.framework === 'react' && !configCheck.hasTypeScript) {
            suggestion += `   1. Install required loaders: npm install --save-dev babel-loader @babel/core @babel/preset-env @babel/preset-react\n`;
          }
          
          suggestion += `   2. Regenerate stats.json: npx webpack --profile --json stats.json\n`;
        } catch (error) {
          // If creation fails, fall back to manual instructions
          const configTemplate = this.generateWebpackConfig(
            entryPoint,
            configCheck.isESModule,
            configCheck.hasTypeScript,
            configCheck.framework
          );
          
          const currentFileName = configCheck.path ? path.basename(configCheck.path) : 'webpack.config.js';
          
          suggestion = `\n\n⚠️  Webpack config file has wrong extension!\n\n` +
            `Your project uses ES modules (package.json has "type": "module"), but you have ${currentFileName}.\n` +
            `Webpack can't load CommonJS config files (.js) in ES module projects.\n\n` +
            `🔍 Auto-detected entry point: ${entryPoint}\n` +
            `📦 Project type: ${configCheck.framework || 'Generic'}${configCheck.hasTypeScript ? ' + TypeScript' : ''} (ES Modules)\n\n` +
            `Create ${configCheck.correctFileName} with the following content:\n\n` +
            `\`\`\`javascript\n${configTemplate}\`\`\`\n\n` +
            `💡 After creating the config file, regenerate stats.json:\n` +
            `   npx webpack --profile --json stats.json\n`;
        }
      } else if (entryPointError) {
        const configCheck = this.checkWebpackConfig();
        const detectedEntry = this.detectEntryPoint();
        
        if (!configCheck.exists) {
          // Webpack config doesn't exist - automatically create it
          const entryPoint = detectedEntry || './src/index.js';
          
          try {
            this.createWebpackConfig(
              entryPoint,
              configCheck.isESModule,
              configCheck.hasTypeScript,
              configCheck.framework
            );
            
            suggestion = `\n\n✅ Created ${configCheck.correctFileName} automatically!\n\n` +
              `🔍 Auto-detected entry point: ${entryPoint}\n` +
              `📦 Project type: ${configCheck.framework || 'Generic'}${configCheck.hasTypeScript ? ' + TypeScript' : ''}${configCheck.isESModule ? ' (ES Modules)' : ''}\n\n` +
              `💡 Next steps:\n`;
            
            if (configCheck.hasTypeScript) {
              suggestion += `   1. Install required loaders: npm install --save-dev ts-loader typescript\n`;
            }
            if (configCheck.framework === 'react' && !configCheck.hasTypeScript) {
              suggestion += `   1. Install required loaders: npm install --save-dev babel-loader @babel/core @babel/preset-env @babel/preset-react\n`;
            }
            
            suggestion += `   2. Regenerate stats.json: npx webpack --profile --json stats.json\n`;
          } catch (error) {
            // If creation fails, fall back to manual instructions
            const configTemplate = this.generateWebpackConfig(
              entryPoint,
              configCheck.isESModule,
              configCheck.hasTypeScript,
              configCheck.framework
            );
            
            suggestion = `\n\n📝 Webpack config file not found!\n\n` +
              `🔍 Auto-detected entry point: ${entryPoint}\n` +
              `📦 Project type: ${configCheck.framework || 'Generic'}${configCheck.hasTypeScript ? ' + TypeScript' : ''}${configCheck.isESModule ? ' (ES Modules)' : ''}\n\n` +
              `Create ${configCheck.correctFileName} with the following content:\n\n` +
              `\`\`\`javascript\n${configTemplate}\`\`\`\n\n` +
              `💡 After creating the config file, install required loaders:\n`;
            
            if (configCheck.hasTypeScript) {
              suggestion += `   npm install --save-dev ts-loader typescript\n`;
            }
            if (configCheck.framework === 'react' && !configCheck.hasTypeScript) {
              suggestion += `   npm install --save-dev babel-loader @babel/core @babel/preset-env @babel/preset-react\n`;
            }
            
            suggestion += `\n   Then regenerate stats.json:\n` +
              `   npx webpack --profile --json stats.json\n`;
          }
        } else if (configCheck.wrongExtension) {
          // Config exists but has wrong extension - create the correct one
          const entryPoint = detectedEntry || './src/index.js';
          
          try {
            this.createWebpackConfig(
              entryPoint,
              configCheck.isESModule,
              configCheck.hasTypeScript,
              configCheck.framework
            );
            
            const currentFileName = path.basename(configCheck.path || 'webpack.config.js');
            
            suggestion = `\n\n✅ Created ${configCheck.correctFileName} automatically!\n\n` +
              `Your project uses ES modules, so webpack needs ${configCheck.correctFileName} instead of ${currentFileName}.\n\n` +
              `🔍 Auto-detected entry point: ${entryPoint}\n` +
              `📦 Project type: ${configCheck.framework || 'Generic'}${configCheck.hasTypeScript ? ' + TypeScript' : ''} (ES Modules)\n\n` +
              `💡 Next steps:\n` +
              `   1. You can delete ${currentFileName} if you no longer need it\n` +
              `   2. Regenerate stats.json: npx webpack --profile --json stats.json\n`;
          } catch (error) {
            // If creation fails, fall back to manual instructions
            const configTemplate = this.generateWebpackConfig(
              entryPoint,
              configCheck.isESModule,
              configCheck.hasTypeScript,
              configCheck.framework
            );
            
            const currentFileName = path.basename(configCheck.path || 'webpack.config.js');
            
            suggestion = `\n\n⚠️  Webpack config file has wrong extension!\n\n` +
              `Your project uses ES modules (package.json has "type": "module"), but you have ${currentFileName}.\n` +
              `Webpack can't load CommonJS config files (.js) in ES module projects.\n\n` +
              `🔍 Auto-detected entry point: ${entryPoint}\n` +
              `📦 Project type: ${configCheck.framework || 'Generic'}${configCheck.hasTypeScript ? ' + TypeScript' : ''} (ES Modules)\n\n` +
              `Create ${configCheck.correctFileName} with the following content:\n\n` +
              `\`\`\`javascript\n${configTemplate}\`\`\`\n\n` +
              `💡 After creating the config file, regenerate stats.json:\n` +
              `   npx webpack --profile --json stats.json\n`;
          }
        } else if (detectedEntry) {
          // Config exists and extension is correct, but entry point is wrong
          suggestion = `\n\n🔍 Auto-detected entry point: ${detectedEntry}\n` +
            `   Update your ${path.basename(configCheck.path || 'webpack.config.js')}:\n` +
            `   entry: '${detectedEntry}',\n`;
        } else {
          suggestion = `\n\n💡 Tip: Your entry point should be a FILE, not a directory.\n` +
            `   Common entry points: ./src/App.tsx, ./src/index.jsx, ./src/main.js\n` +
            `   Update the 'entry' field in your webpack config.\n`;
        }
      }
      
      // Check for missing dependencies/loaders
      const missingDeps = this.detectMissingDependencies(errors);
      const dependencyCheck = missingDeps.length > 0 ? this.checkPackagesInstalled(missingDeps) : null;
      
      let dependencySuggestion = '';
      if (dependencyCheck && dependencyCheck.missing.length > 0) {
        const installCommand = this.generateInstallCommand(dependencyCheck.missing);
        dependencySuggestion = `\n\n📦 Missing Dependencies Detected!\n` +
          `   The following packages are required but not installed:\n` +
          `   ${dependencyCheck.missing.map(p => `     - ${p}`).join('\n')}\n\n` +
          `   💡 Install them with:\n` +
          `      ${installCommand}\n\n` +
          `   Then regenerate stats.json:\n` +
          `      npx webpack --profile --json stats.json\n`;
      }
      
      // Check if errors are related to path aliases
      // Look for errors containing '@/' or '@\' in the message
      const pathAliasErrors = errors.filter(e => {
        const message = e.message || '';
        const details = e.details || '';
        const fullMessage = `${message} ${details}`;
        return (message.includes("Can't resolve") || message.includes("Cannot resolve")) &&
               (fullMessage.includes('@/') || fullMessage.includes('@\\') || fullMessage.includes("'@"));
      });
      
      let pathAliasSuggestion = '';
      let configRegenerated = false;
      
      if (pathAliasErrors.length > 0) {
        const pathAliases = this.getTypeScriptPathAliases();
        const hasAliases = Object.keys(pathAliases).length > 0;
        const configCheck = this.checkWebpackConfig();
        
        if (hasAliases) {
          // Try to automatically regenerate the config with path aliases
          if (configCheck.exists && configCheck.hasTypeScript) {
            try {
              const detectedEntry = this.detectEntryPoint();
              const entryPoint = detectedEntry || './src/index.js';
              
              // Attempt to regenerate the config with path aliases
              this.createWebpackConfig(
                entryPoint,
                configCheck.isESModule,
                configCheck.hasTypeScript,
                configCheck.framework
              );
              
              configRegenerated = true;
              pathAliasSuggestion = `\n\n✅ Regenerated ${configCheck.correctFileName} with path alias configuration!\n` +
                `   Found ${Object.keys(pathAliases).length} path alias(es) in tsconfig.json:\n` +
                `   ${Object.keys(pathAliases).slice(0, 3).map(k => `     - ${k}`).join('\n')}${Object.keys(pathAliases).length > 3 ? `\n     ... and ${Object.keys(pathAliases).length - 3} more` : ''}\n\n` +
                `   💡 Next steps:\n` +
                `      1. Regenerate stats.json: npx webpack --profile --json stats.json\n` +
                `      2. Run packlyze analyze stats.json again\n`;
            } catch (regenerateError) {
              // If regeneration fails, provide manual instructions
              pathAliasSuggestion = `\n\n⚠️  Path alias errors detected!\n` +
                `   Found ${Object.keys(pathAliases).length} path alias(es) in tsconfig.json:\n` +
                `   ${Object.keys(pathAliases).slice(0, 3).map(k => `     - ${k}`).join('\n')}${Object.keys(pathAliases).length > 3 ? `\n     ... and ${Object.keys(pathAliases).length - 3} more` : ''}\n\n` +
                `   The webpack config needs to include these path aliases.\n` +
                `   💡 Solution:\n` +
                `      1. Delete ${configCheck.correctFileName} (if it exists)\n` +
                `      2. Run packlyze analyze again (it will regenerate the config with path aliases)\n` +
                `      3. Regenerate stats.json: npx webpack --profile --json stats.json\n` +
                `      4. Run packlyze analyze stats.json again\n`;
            }
          } else {
            // Config doesn't exist or TypeScript not detected
            pathAliasSuggestion = `\n\n⚠️  Path alias errors detected!\n` +
              `   Found ${Object.keys(pathAliases).length} path alias(es) in tsconfig.json:\n` +
              `   ${Object.keys(pathAliases).slice(0, 3).map(k => `     - ${k}`).join('\n')}${Object.keys(pathAliases).length > 3 ? `\n     ... and ${Object.keys(pathAliases).length - 3} more` : ''}\n\n` +
              `   The webpack config needs to include these path aliases.\n` +
              `   💡 Solution:\n` +
              `      1. Delete ${configCheck.correctFileName} (if it exists)\n` +
              `      2. Run packlyze analyze again (it will regenerate the config with path aliases)\n` +
              `      3. Regenerate stats.json: npx webpack --profile --json stats.json\n` +
              `      4. Run packlyze analyze stats.json again\n`;
          }
        } else {
          // No aliases in tsconfig.json, but we have path alias errors
          // Try to infer aliases from error messages and auto-fix
          const inferredAliases = this.extractAliasFromErrors(pathAliasErrors);
          
          if (inferredAliases.length > 0) {
            this.log(`Detected ${inferredAliases.length} alias pattern(s) from error messages: ${inferredAliases.map(a => a.alias).join(', ')}`);
            
            // Try to infer mappings and add them to webpack config
            const aliasMappings: Record<string, string> = {};
            
            for (const { alias, examplePath } of inferredAliases) {
              const inferredPath = this.inferAliasMapping(alias, examplePath);
              if (inferredPath) {
                const projectRoot = this.baseDir;
                const absolutePath = path.isAbsolute(inferredPath) 
                  ? inferredPath 
                  : path.resolve(projectRoot, inferredPath);
                aliasMappings[alias] = absolutePath;
                this.log(`Inferred mapping: ${alias} -> ${inferredPath}`);
              } else {
                this.log(`Could not infer mapping for alias: ${alias}`);
              }
            }
            
            // If we found mappings, try to add them to webpack config
            if (Object.keys(aliasMappings).length > 0 && configCheck.exists) {
              try {
                // Read existing config
                const configPath = configCheck.path!;
                let configContent = fs.readFileSync(configPath, 'utf-8');
                
                // Check if alias section exists
                const hasAliasSection = configContent.includes('resolve:') && 
                                       configContent.includes('alias:');
                
                if (!hasAliasSection) {
                  // Add alias section to resolve
                  const aliasEntries = Object.entries(aliasMappings)
                    .map(([key, absolutePath]) => {
                      const relativePath = path.relative(this.baseDir, absolutePath);
                      const normalizedPath = relativePath.replace(/\\/g, '/');
                      const escapedKey = key.replace(/'/g, "\\'");
                      return `      '${escapedKey}': path.resolve(__dirname, '${normalizedPath}')`;
                    })
                    .join(',\n');
                  
                  // Try to insert alias into resolve section
                  if (configContent.includes('resolve:')) {
                    // Find resolve section and add alias
                    const resolveMatch = configContent.match(/resolve:\s*\{[^}]*\}/s);
                    if (resolveMatch) {
                      const resolveSection = resolveMatch[0];
                      if (!resolveSection.includes('alias:')) {
                        // Add alias before closing brace
                        const newResolveSection = resolveSection.replace(/\}\s*$/, `,\n    alias: {\n${aliasEntries}\n    }\n  }`);
                        configContent = configContent.replace(resolveSection, newResolveSection);
                        
                        fs.writeFileSync(configPath, configContent, 'utf-8');
                        configRegenerated = true;
                        
                        pathAliasSuggestion = `\n\n✅ Auto-detected and added path aliases to ${configCheck.correctFileName}!\n` +
                          `   Detected aliases from error messages:\n` +
                          Object.entries(aliasMappings).map(([key, mappedPath]) => {
                            const relativePath = path.relative(this.baseDir, mappedPath);
                            return `     - ${key} -> ${relativePath}`;
                          }).join('\n') +
                          `\n\n   💡 Next steps:\n` +
                          `      1. Regenerate stats.json: npx webpack --profile --json stats.json\n` +
                          `      2. Run packlyze analyze stats.json again\n`;
                      }
                    }
                  }
                }
              } catch (error) {
                this.log(`Could not auto-add aliases to config: ${error}`);
              }
            }
            
            // If we couldn't auto-fix, provide helpful suggestions
            if (!configRegenerated) {
              const searchPaths = this.findProjectRoot();
              const searchedLocations = searchPaths.map(p => path.join(p, 'tsconfig.json')).join('\n     - ');
              
              const aliasExamples = inferredAliases.map(a => `     - ${a.alias} (from: ${a.examplePath})`).join('\n');
              const suggestedMappings = Object.entries(aliasMappings).length > 0
                ? `\n   Inferred mappings:\n` +
                  Object.entries(aliasMappings).map(([key, mappedPath]) => {
                    const relativePath = path.relative(this.baseDir, mappedPath);
                    return `     - ${key} -> ${relativePath}`;
                  }).join('\n')
                : '';
              
              pathAliasSuggestion = `\n\n⚠️  Path alias errors detected, but no path aliases found in tsconfig.json.\n\n` +
                `   Detected alias patterns from errors:\n${aliasExamples}\n` +
                (suggestedMappings || '') +
                `\n   Searched for tsconfig.json in:\n` +
                `     - ${searchedLocations}\n\n` +
                (Object.keys(aliasMappings).length > 0 ? 
                  `   💡 Quick fix - Add to your ${configCheck.correctFileName}:\n` +
                  `      resolve: {\n` +
                  `        alias: {\n` +
                  Object.entries(aliasMappings).map(([key, mappedPath]) => {
                    const relativePath = path.relative(this.baseDir, mappedPath);
                    const normalizedPath = relativePath.replace(/\\/g, '/');
                    return `          '${key}': path.resolve(__dirname, '${normalizedPath}')`;
                  }).join(',\n') +
                  `\n        }\n` +
                  `      }\n\n` +
                  `   Or add to tsconfig.json:\n` +
                  `     {\n` +
                  `       "compilerOptions": {\n` +
                  `         "baseUrl": ".",\n` +
                  `         "moduleResolution": "node",\n` +
                  `         "paths": {\n` +
                  Object.entries(aliasMappings).map(([key, mappedPath]) => {
                    const relativePath = path.relative(this.baseDir, mappedPath);
                    const normalizedPath = relativePath.replace(/\\/g, '/');
                    return `           "${key}/*": ["${normalizedPath}/*"]`;
                  }).join(',\n') +
                  `\n         }\n` +
                  `       }\n` +
                  `     }\n` :
                  `   Make sure:\n` +
                  `     1. tsconfig.json exists in one of the locations above\n` +
                  `     2. tsconfig.json has compilerOptions.paths configured:\n` +
                  `        {\n` +
                  `          "compilerOptions": {\n` +
                  `            "baseUrl": ".",\n` +
                  `            "moduleResolution": "node",\n` +
                  `            "paths": {\n` +
                  `              "@/*": ["src/*"]\n` +
                  `            }\n` +
                  `          }\n` +
                  `        }\n` +
                  `     3. If using "extends", path aliases must be in the main tsconfig.json (not just in extended config)\n` +
                  `     4. If using moduleResolution: "bundler", change it to "node" or "node16" for webpack compatibility\n` +
                  `     5. Run with --verbose to see detailed search logs\n\n` +
                  `   💡 Alternative: Install tsconfig-paths-webpack-plugin for automatic path alias resolution:\n` +
                  `      npm install --save-dev tsconfig-paths-webpack-plugin\n`);
            }
          } else {
            // Could not extract aliases from errors
            const searchPaths = this.findProjectRoot();
            const searchedLocations = searchPaths.map(p => path.join(p, 'tsconfig.json')).join('\n     - ');
            
            pathAliasSuggestion = `\n\n⚠️  Path alias errors detected, but no path aliases found in tsconfig.json.\n\n` +
              `   Searched for tsconfig.json in:\n` +
              `     - ${searchedLocations}\n\n` +
              `   Make sure:\n` +
              `     1. tsconfig.json exists in one of the locations above\n` +
              `     2. tsconfig.json has compilerOptions.paths configured:\n` +
              `        {\n` +
              `          "compilerOptions": {\n` +
              `            "baseUrl": ".",\n` +
              `            "moduleResolution": "node",\n` +
              `            "paths": {\n` +
              `              "@/*": ["src/*"]\n` +
              `            }\n` +
              `          }\n` +
              `        }\n` +
              `     3. If using "extends", path aliases must be in the main tsconfig.json (not just in extended config)\n` +
              `     4. If using moduleResolution: "bundler", change it to "node" or "node16" for webpack compatibility\n` +
              `     5. Run with --verbose to see detailed search logs\n\n` +
              `   💡 Alternative: Install tsconfig-paths-webpack-plugin for automatic path alias resolution:\n` +
              `      npm install --save-dev tsconfig-paths-webpack-plugin\n`;
          }
        }
      }
      
      // Build the error message
      let errorMessage = `Webpack build failed with ${errors.length} error(s). Cannot analyze bundle.\n\n` +
        `Errors:\n   ${errorMessages}${errors.length > 3 ? `\n   ... and ${errors.length - 3} more error(s)` : ''}`;
      
      // Add dependency suggestion first (most actionable)
      if (dependencySuggestion) {
        errorMessage += dependencySuggestion;
      }
      
      // Add path alias suggestion if config was regenerated (important)
      if (configRegenerated) {
        errorMessage += pathAliasSuggestion;
      }
      
      // Add other suggestions
      if (suggestion) {
        errorMessage += suggestion;
      }
      
      // Add path alias suggestion if not already added
      if (!configRegenerated && pathAliasSuggestion) {
        errorMessage += pathAliasSuggestion;
      }
      
      // Detect and handle other common issues
      let otherIssues = '';
      
      // 1. Missing extensions in resolve.extensions
      const missingExtensions = this.detectMissingExtensions(errors);
      if (missingExtensions.length > 0) {
        const configCheck = this.checkWebpackConfig();
        if (configCheck.exists && configCheck.path) {
          try {
            let configContent = fs.readFileSync(configCheck.path, 'utf-8');
            
            // Check if extensions are already in config
            const hasExtensions = configContent.includes('extensions:');
            if (hasExtensions) {
              // Try to add missing extensions
              const extensionsMatch = configContent.match(/extensions:\s*\[([^\]]+)\]/);
              if (extensionsMatch) {
                const existingExtensions = extensionsMatch[1];
                const newExtensions = missingExtensions
                  .filter(ext => !existingExtensions.includes(ext))
                  .map(ext => `'${ext}'`)
                  .join(', ');
                
                if (newExtensions) {
                  const newExtensionsList = existingExtensions.trim() 
                    ? `${existingExtensions}, ${newExtensions}`
                    : newExtensions;
                  configContent = configContent.replace(
                    /extensions:\s*\[([^\]]+)\]/,
                    `extensions: [${newExtensionsList}]`
                  );
                  fs.writeFileSync(configCheck.path, configContent, 'utf-8');
                  
                  otherIssues += `\n\n✅ Auto-added missing extensions to resolve.extensions: ${missingExtensions.join(', ')}\n`;
                }
              }
            } else {
              // Add extensions section
              if (configContent.includes('resolve:')) {
                const resolveMatch = configContent.match(/resolve:\s*\{[^}]*\}/s);
                if (resolveMatch) {
                  const extensionsList = missingExtensions.map(ext => `'${ext}'`).join(', ');
                  const newResolveSection = resolveMatch[0].replace(
                    /\}\s*$/,
                    `,\n    extensions: ['.js', '.jsx', '.ts', '.tsx', ${extensionsList}]\n  }`
                  );
                  configContent = configContent.replace(resolveMatch[0], newResolveSection);
                  fs.writeFileSync(configCheck.path, configContent, 'utf-8');
                  
                  otherIssues += `\n\n✅ Auto-added resolve.extensions: ${missingExtensions.join(', ')}\n`;
                }
              }
            }
          } catch (error) {
            otherIssues += `\n\n⚠️  Missing file extensions in resolve.extensions: ${missingExtensions.join(', ')}\n` +
              `   Add to your webpack config:\n` +
              `   resolve: {\n` +
              `     extensions: ['.js', '.jsx', '.ts', '.tsx', ${missingExtensions.map(e => `'${e}'`).join(', ')}]\n` +
              `   }\n`;
          }
        } else {
          otherIssues += `\n\n⚠️  Missing file extensions in resolve.extensions: ${missingExtensions.join(', ')}\n` +
            `   Add these extensions to your webpack config's resolve.extensions array.\n`;
        }
      }
      
      // 2. Missing CSS/image loaders
      const missingLoaders = this.detectMissingAssetLoaders(errors);
      if (missingLoaders.css || missingLoaders.images) {
        const missingPackages: string[] = [];
        if (missingLoaders.css) {
          missingPackages.push('css-loader', 'style-loader');
        }
        if (missingLoaders.images) {
          // Webpack 5 uses asset/resource, no loader needed, but we should suggest it
        }
        
        if (missingPackages.length > 0) {
          const configCheck = this.checkWebpackConfig();
          const dependencyCheck = this.checkPackagesInstalled(missingPackages);
          
          if (dependencyCheck && dependencyCheck.missing.length > 0) {
            const installCommand = this.generateInstallCommand(dependencyCheck.missing);
            otherIssues += `\n\n⚠️  Missing CSS/Asset loaders detected!\n` +
              `   The following packages are required but not installed:\n` +
              `   ${dependencyCheck.missing.map(p => `     - ${p}`).join('\n')}\n\n` +
              `   💡 Install them with:\n` +
              `      ${installCommand}\n\n` +
              `   Then add to your webpack config:\n` +
              (missingLoaders.css ? 
                `   module: {\n` +
                `     rules: [\n` +
                `       { test: /\\.css$/, use: ['style-loader', 'css-loader'] }\n` +
                `     ]\n` +
                `   }\n` : '');
          }
        }
      }
      
      // 3. baseUrl issues
      const hasBaseUrlIssue = this.detectBaseUrlIssues(errors);
      if (hasBaseUrlIssue) {
        const configCheck = this.checkWebpackConfig();
        const tsconfigAliases = this.getTypeScriptPathAliases();
        const tsconfigPath = this.findProjectRoot().map(p => path.join(p, 'tsconfig.json')).find(p => fs.existsSync(p));
        
        if (tsconfigPath) {
          try {
            const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
            const cleanedContent = tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            const tsconfig = JSON.parse(cleanedContent);
            
            if (tsconfig.compilerOptions?.baseUrl && !tsconfig.compilerOptions?.paths) {
              otherIssues += `\n\n⚠️  baseUrl is set in tsconfig.json but paths are not configured.\n` +
                `   TypeScript can resolve imports like 'src/utils', but webpack cannot.\n\n` +
                `   💡 Solution 1: Add resolve.modules to webpack config:\n` +
                `      resolve: {\n` +
                `        modules: ['node_modules', '${tsconfig.compilerOptions.baseUrl}']\n` +
                `      }\n\n` +
                `   💡 Solution 2: Add paths to tsconfig.json:\n` +
                `      "compilerOptions": {\n` +
                `        "baseUrl": ".",\n` +
                `        "paths": {\n` +
                `          "src/*": ["src/*"],\n` +
                `          "app/*": ["app/*"]\n` +
                `        }\n` +
                `      }\n`;
            }
          } catch (error) {
            // Ignore parse errors
          }
        }
      }
      
      // 4. Case-sensitivity issues
      const caseIssues = this.detectCaseSensitivityIssues(errors);
      if (caseIssues.length > 0) {
        otherIssues += `\n\n⚠️  Case-sensitivity issues detected!\n` +
          `   Your imports use different casing than the actual files:\n` +
          caseIssues.map(issue => `     - Imported: ${issue.expected}\n       Actual: ${issue.actual}`).join('\n') +
          `\n\n   💡 Fix: Update your imports to match the exact file casing.\n` +
          `   This is especially important for Linux/CI environments where file systems are case-sensitive.\n`;
      }
      
      // Add other issues to error message
      if (otherIssues) {
        errorMessage += otherIssues;
      }
      
      // Add default suggestion if no other suggestions
      if (!suggestion && !pathAliasSuggestion && !dependencySuggestion && !otherIssues) {
        errorMessage += `\n💡 Fix the webpack build errors first, then regenerate stats.json:\n` +
          `   npx webpack --profile --json stats.json`;
      }
      
      throw new Error(errorMessage);
    }

    // Check for required structure (at least one of assets, modules, or chunks should exist)
    const hasAssets = Array.isArray(this.statsData.assets);
    const hasModules = Array.isArray(this.statsData.modules);
    const hasChunks = Array.isArray(this.statsData.chunks);

    if (!hasAssets && !hasModules && !hasChunks) {
      throw new Error(
        'Invalid stats: stats file must contain at least one of: assets, modules, or chunks arrays. ' +
        'Ensure you generated the stats file correctly (e.g., webpack --profile --json stats.json)'
      );
    }

    // Check if stats file is empty (no actual content)
    const assetsCount = hasAssets ? this.statsData.assets!.length : 0;
    const modulesCount = hasModules ? this.statsData.modules!.length : 0;
    const chunks = hasChunks ? this.statsData.chunks! : [];
    const chunksWithModules = chunks.filter((c: { modules?: unknown[] }) => 
      Array.isArray(c.modules) && c.modules.length > 0
    ).length;

    if (assetsCount === 0 && modulesCount === 0 && chunksWithModules === 0) {
      throw new Error(
        'Stats file contains no modules or assets. This usually means:\n' +
        '1. The webpack build failed (check for errors above)\n' +
        '2. The entry point is missing or incorrect\n' +
        '3. No files were processed by webpack\n\n' +
        '💡 Ensure your webpack configuration is correct and the build succeeds before generating stats.'
      );
    }

    // Validate modules if present
    if (hasModules && Array.isArray(this.statsData.modules)) {
      for (const module of this.statsData.modules) {
        if (module && typeof module !== 'object') {
          throw new Error('Invalid stats: all modules must be objects');
        }
        if (module && module.size !== undefined && (typeof module.size !== 'number' || module.size < 0)) {
          throw new Error('Invalid stats: module sizes must be non-negative numbers');
        }
      }
    }

    // Validate assets if present
    if (hasAssets && Array.isArray(this.statsData.assets)) {
      for (const asset of this.statsData.assets) {
        if (asset && typeof asset !== 'object') {
          throw new Error('Invalid stats: all assets must be objects');
        }
        if (asset && asset.size !== undefined && (typeof asset.size !== 'number' || asset.size < 0)) {
          throw new Error('Invalid stats: asset sizes must be non-negative numbers');
        }
      }
    }
  }

  async analyze(): Promise<AnalysisResult> {
    this.log('Extracting bundle statistics...');
    const bundleStats = this.extractBundleStats();
    
    this.log('Analyzing packages...');
    const packages = this.analyzePackages(bundleStats);
    
    this.log('Detecting duplicate modules...');
    const duplicates = this.findDuplicates(bundleStats);
    
    this.log('Detecting tree-shaking issues...');
    const treeshakingIssues = this.detectTreeshakingIssues(bundleStats);
    
    this.log('Generating recommendations...');
    const recommendations = this.generateRecommendations(bundleStats);
    
    this.log('Calculating metrics...');
    const metrics = this.calculateMetrics(bundleStats);

    this.log('Analyzing chunks...');
    const chunkAnalysis = this.analyzeChunks(bundleStats);
    
    this.log('Detecting unused modules...');
    const unusedModules = this.detectUnusedModules(bundleStats);

    this.log('Analysis complete!');
    return {
      bundleStats,
      recommendations,
      treeshakingIssues,
      duplicates,
      packages,
      chunkAnalysis,
      unusedModules,
      metrics,
      timestamp: new Date().toISOString()
    };
  }

  private extractBundleStats(): BundleStats {
    const assets = this.statsData.assets || [];
    
    // Extract modules from top-level or from chunks (webpack 5+ format)
    let modules: ModuleInfo[] = [];
    
    // First, try top-level modules array
    if (Array.isArray(this.statsData.modules) && this.statsData.modules.length > 0) {
      modules = this.statsData.modules.map((m) => ({
      name: m.name || 'unknown',
      size: m.size || 0,
      gzipSize: m.gzipSize,
        percentage: 0, // Will calculate after we know total size
      reasons: Array.isArray(m.reasons)
        ? (m.reasons as Array<{ moduleName?: string } | string>).map((r) => typeof r === 'string' ? r : r.moduleName ?? '')
        : []
      }));
    } else {
      // Extract modules from chunks (webpack 5+ format)
      const moduleMap = new Map<string, ModuleInfo>();
      const chunks = this.statsData.chunks || [];
      
      chunks.forEach((chunk) => {
        if (Array.isArray(chunk.modules)) {
          chunk.modules.forEach((m: { name?: string; size?: number; gzipSize?: number; reasons?: unknown } | string) => {
            // Handle both object and string formats
            let moduleName: string;
            let moduleSize: number;
            let moduleGzipSize: number | undefined;
            let moduleReasons: unknown;
            
            if (typeof m === 'string') {
              // Module is just a name string
              moduleName = m;
              moduleSize = 0; // Size unknown, will be calculated from chunk or assets
              moduleGzipSize = undefined;
              moduleReasons = [];
            } else {
              // Module is an object
              moduleName = m.name || 'unknown';
              moduleSize = m.size || 0;
              moduleGzipSize = m.gzipSize;
              moduleReasons = m.reasons;
            }
            
            if (!moduleMap.has(moduleName)) {
              moduleMap.set(moduleName, {
                name: moduleName,
                size: moduleSize,
                gzipSize: moduleGzipSize,
                percentage: 0,
                reasons: Array.isArray(moduleReasons)
                  ? (moduleReasons as Array<{ moduleName?: string } | string>).map((r) => typeof r === 'string' ? r : r.moduleName ?? '')
                  : []
              });
            } else {
              // If module appears in multiple chunks, use the maximum size (not sum)
              // because the same module shouldn't be counted multiple times
              const existing = moduleMap.get(moduleName)!;
              existing.size = Math.max(existing.size, moduleSize);
              if (moduleGzipSize) {
                existing.gzipSize = existing.gzipSize ? Math.max(existing.gzipSize, moduleGzipSize) : moduleGzipSize;
              }
              // Merge reasons if available
              if (Array.isArray(moduleReasons) && moduleReasons.length > 0) {
                const existingReasons = new Set(existing.reasons);
                (moduleReasons as Array<{ moduleName?: string } | string>).forEach((r) => {
                  const reasonStr = typeof r === 'string' ? r : r.moduleName ?? '';
                  if (reasonStr) existingReasons.add(reasonStr);
                });
                existing.reasons = Array.from(existingReasons);
              }
            }
          });
        }
      });
      
      modules = Array.from(moduleMap.values());
    }
    
    // Calculate total size from assets or modules
    const totalSize = this.getTotalSize() || modules.reduce((sum, m) => sum + (m.size || 0), 0);
    
    // Calculate percentages
    modules = modules.map((m) => ({
      ...m,
      percentage: totalSize > 0 ? ((m.size || 0) / totalSize) * 100 : 0
    }));

    return {
      name: this.statsData.name || 'bundle',
      size: totalSize,
      gzipSize: this.getTotalGzipSize() || modules.reduce((sum, m) => sum + (m.gzipSize || 0), 0),
      modules: modules.sort((a: ModuleInfo, b: ModuleInfo) => b.size - a.size),
      chunks: this.extractChunks(),
      isInitialBySize: this.getInitialBundleSize(),
      isInitialByCount: assets.length,
      parsedSize: this.statsData.parsedSize || 0
    };
  }

  private getTotalSize(): number {
  const assets = this.statsData.assets || [];
    const assetSize = assets.reduce((sum: number, asset) => sum + (asset.size || 0), 0);
    
    // If assets are empty or zero, try to calculate from modules
    if (assetSize === 0) {
      // Try top-level modules
      if (Array.isArray(this.statsData.modules) && this.statsData.modules.length > 0) {
        return this.statsData.modules.reduce((sum: number, m) => sum + (m.size || 0), 0);
      }
      
      // Try modules from chunks
      const chunks = this.statsData.chunks || [];
      let moduleSize = 0;
      const seenModules = new Set<string>();
      
      chunks.forEach((chunk) => {
        if (Array.isArray(chunk.modules)) {
          chunk.modules.forEach((m: { name?: string; size?: number }) => {
            const moduleName = m.name || 'unknown';
            // Only count each module once (in case it appears in multiple chunks)
            if (!seenModules.has(moduleName)) {
              seenModules.add(moduleName);
              moduleSize += (m.size || 0);
            }
          });
        }
      });
      
      if (moduleSize > 0) {
        return moduleSize;
      }
      
      // Try chunk sizes as fallback
      const chunkSize = chunks.reduce((sum: number, c) => sum + (c.size || 0), 0);
      if (chunkSize > 0) {
        return chunkSize;
      }
    }
    
    return assetSize;
  }

  private getTotalGzipSize(): number {
  const assets = this.statsData.assets || [];
    const assetGzipSize = assets.reduce((sum: number, asset) => sum + (asset.gzipSize || 0), 0);
    
    // If assets are empty or zero, try to calculate from modules
    if (assetGzipSize === 0) {
      // Try top-level modules
      if (Array.isArray(this.statsData.modules) && this.statsData.modules.length > 0) {
        return this.statsData.modules.reduce((sum: number, m) => sum + (m.gzipSize || 0), 0);
      }
      
      // Try modules from chunks
      const chunks = this.statsData.chunks || [];
      let moduleGzipSize = 0;
      const seenModules = new Set<string>();
      
      chunks.forEach((chunk) => {
        if (Array.isArray(chunk.modules)) {
          chunk.modules.forEach((m: { name?: string; gzipSize?: number }) => {
            const moduleName = m.name || 'unknown';
            if (!seenModules.has(moduleName)) {
              seenModules.add(moduleName);
              moduleGzipSize += (m.gzipSize || 0);
            }
          });
        }
      });
      
      if (moduleGzipSize > 0) {
        return moduleGzipSize;
      }
      
      // Try chunk gzip sizes as fallback
      return chunks.reduce((sum: number, c) => sum + (c.gzipSize || 0), 0);
    }
    
    return assetGzipSize;
  }

  private extractChunks(): ChunkInfo[] {
    return (this.statsData.chunks || []).map((chunk) => ({
      id: chunk.id,
      name: chunk.name || `chunk-${chunk.id}`,
      size: chunk.size || 0,
      gzipSize: chunk.gzipSize,
      modules: Array.isArray(chunk.modules) ? chunk.modules.map((m: { name: string }) => m.name) : []
    }));
  }

  private getInitialBundleSize(): number {
    return (this.statsData.chunks || [])
      .filter((c) => c.initial === true)
      .reduce((sum: number, c) => sum + (c.size || 0), 0);
  }

  private generateRecommendations(stats: BundleStats): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Large bundle check
    if (stats.gzipSize && stats.gzipSize > 500000) {
      recommendations.push({
        severity: 'critical',
        message: `Bundle size is ${(stats.gzipSize / 1024 / 1024).toFixed(2)}MB (gzipped)`,
        action: 'Implement aggressive code-splitting or consider alternative libraries'
      });
    } else if (stats.gzipSize && stats.gzipSize > 250000) {
      recommendations.push({
        severity: 'warning',
        message: `Bundle size is ${(stats.gzipSize / 1024 / 1024).toFixed(2)}MB (gzipped)`,
        action: 'Consider code-splitting frequently used features'
      });
    }

    // Large modules check
    const largeModules = stats.modules.filter(m => m.percentage > 5);
    if (largeModules.length > 0) {
      recommendations.push({
        severity: 'warning',
        message: `Found ${largeModules.length} modules exceeding 5% of bundle size`,
        action: 'Consider extracting to separate chunk or lazy-loading'
      });
    }

    // Duplicate check
    const duplicates = this.findDuplicates(stats);
    if (duplicates.length > 0) {
      recommendations.push({
        severity: 'warning',
        message: `Found ${duplicates.length} duplicate modules totaling ${(duplicates.reduce((s, d) => s + d.totalSize, 0) / 1024).toFixed(2)}KB`,
        action: 'Use npm dedupe or resolve version conflicts'
      });
    }

    // Module count check
    if (stats.modules.length > 500) {
      recommendations.push({
        severity: 'info',
        message: `High module count (${stats.modules.length}) - may impact build performance`,
        action: 'Monitor module growth and consider monorepo approach'
      });
    }

    return recommendations;
  }

  private detectTreeshakingIssues(stats: BundleStats): string[] {
    const issues: string[] = [];
    
    // Check modules from BundleStats (which includes extracted modules)
    stats.modules.forEach((m) => {
      // Try to get source from original stats data
      const originalModule = Array.isArray(this.statsData.modules) 
        ? this.statsData.modules.find((om: { name?: string }) => om.name === m.name)
        : null;
      
      if (originalModule && typeof originalModule.source === 'string' && 
          (originalModule.source.includes('module.exports') || originalModule.source.includes('require('))) {
        issues.push(`${m.name}: Uses CommonJS - reduces tree-shaking effectiveness`);
      }
    });

    return issues.slice(0, 10); // Limit to top 10
  }

  /**
   * Extract package name from module path.
   * Handles node_modules paths like:
   * - node_modules/lodash/index.js -> lodash
   * - node_modules/@types/node/index.d.ts -> @types/node
   * - node_modules/react-dom/client.js -> react-dom
   */
  private extractPackageName(modulePath: string): string | null {
    if (!modulePath) return null;

    // Match node_modules packages
    const nodeModulesMatch = modulePath.match(/node_modules[/\\](@[^/\\]+[/\\][^/\\]+|[^/\\]+)/);
    if (nodeModulesMatch) {
      return nodeModulesMatch[1].replace(/[/\\]/g, '/');
    }

    // For non-node_modules paths, use basename as fallback
    // This helps catch duplicates in source code (e.g., utils/helper.js and components/helper.js)
    return path.basename(modulePath);
  }

  private findDuplicates(stats: BundleStats): DuplicateModule[] {
    // Group by package name (for node_modules) or basename (for source files)
    const packageMap = new Map<string, ModuleInfo[]>();
    const duplicates: DuplicateModule[] = [];

    stats.modules.forEach((module) => {
      const moduleName = module.name || '';
      const packageName = this.extractPackageName(moduleName) || 'unknown';

      if (!packageMap.has(packageName)) {
        packageMap.set(packageName, []);
      }
      packageMap.get(packageName)!.push(module);
    });

    // Find actual duplicates (same package/module appearing multiple times)
    packageMap.forEach((modules) => {
      if (modules.length > 1) {
        // Only consider it a duplicate if the modules have different full paths
        // (same package imported from different locations)
        const uniquePaths = new Set(modules.map(m => m.name));
        if (uniquePaths.size > 1) {
        const totalSize = modules.reduce((s: number, m) => s + (m.size || 0), 0);
        const minSize = Math.min(...modules.map(m => m.size || 0));
        duplicates.push({
          names: modules.map(m => m.name),
          totalSize,
          savings: totalSize - minSize
        });
        }
      }
    });

    return duplicates.sort((a, b) => b.totalSize - a.totalSize).slice(0, 10);
  }

  private analyzePackages(stats: BundleStats): PackageStats[] {
    const packageMap = new Map<string, { modules: ModuleInfo[]; totalGzip: number }>();
    const bundleTotalSize = stats.size;

    stats.modules.forEach((module) => {
      const packageName = this.extractPackageName(module.name);
      if (!packageName) return;

      if (!packageMap.has(packageName)) {
        packageMap.set(packageName, { modules: [], totalGzip: 0 });
      }

      const pkg = packageMap.get(packageName)!;
      pkg.modules.push(module);
      if (module.gzipSize) {
        pkg.totalGzip += module.gzipSize;
      }
    });

    const packages: PackageStats[] = [];
    packageMap.forEach((pkg, name) => {
      const packageTotalSize = pkg.modules.reduce((sum, m) => sum + m.size, 0);
      packages.push({
        name,
        totalSize: packageTotalSize,
        gzipSize: pkg.totalGzip > 0 ? pkg.totalGzip : undefined,
        moduleCount: pkg.modules.length,
        modules: pkg.modules.map(m => m.name),
        percentage: bundleTotalSize > 0 ? (packageTotalSize / bundleTotalSize) * 100 : 0
      });
    });

    return packages
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 20); // Top 20 packages
  }

  private detectUnusedModules(stats: BundleStats): UnusedModule[] {
    const unused: UnusedModule[] = [];
    const importedModules = new Set<string>();

    // Build set of all modules that are imported by others
    stats.modules.forEach(module => {
      const reasons = Array.isArray(module.reasons) ? module.reasons : [];
      reasons.forEach(reason => {
        // Extract module name from reason (format varies by bundler)
        if (typeof reason === 'string' && reason !== 'entry' && reason !== 'cjs require') {
          // Try to extract module path from reason
          const match = reason.match(/([^\s]+\.(js|ts|jsx|tsx))/);
          if (match && match[1]) {
            importedModules.add(match[1]);
          }
        }
      });
    });

    // Find modules that are not entry points and not imported
    stats.modules.forEach(module => {
      const reasons = Array.isArray(module.reasons) ? module.reasons : [];
      const isEntry = reasons.some(r => {
        const reasonStr = typeof r === 'string' ? r : String(r);
        return reasonStr === 'entry' || reasonStr.includes('entry');
      });
      const isImported = importedModules.has(module.name);
      
      if (!isEntry && !isImported && (module.size || 0) > 0) {
        // Additional check: module might be in a chunk but not actually used
        const inChunk = stats.chunks.some(chunk => {
          const chunkModules = Array.isArray(chunk.modules) ? chunk.modules : [];
          return chunkModules.includes(module.name);
        });
        
        if (inChunk) {
          unused.push({
            name: module.name || 'unknown',
            size: module.size || 0,
            reason: 'Module in bundle but no clear import path detected'
          });
        }
      }
    });

    return unused
      .sort((a, b) => b.size - a.size)
      .slice(0, 20); // Top 20 potentially unused modules
  }

  private analyzeChunks(stats: BundleStats): ChunkAnalysis {
    const chunks = stats.chunks;
    if (chunks.length === 0) {
      return {
        averageChunkSize: 0,
        averageModulesPerChunk: 0,
        largestChunk: { id: 0, name: 'N/A', size: 0, modules: [] },
        smallestChunk: { id: 0, name: 'N/A', size: 0, modules: [] },
        initialChunkSize: 0,
        recommendations: []
      };
    }

    const chunkSizes = chunks.map(c => c.size || 0);
    const totalChunkSize = chunkSizes.reduce((a, b) => a + b, 0);
    const averageChunkSize = chunks.length > 0 ? totalChunkSize / chunks.length : 0;
    
    const modulesPerChunk = chunks.map(c => (c.modules && Array.isArray(c.modules)) ? c.modules.length : 0);
    const totalModules = modulesPerChunk.reduce((a, b) => a + b, 0);
    const averageModulesPerChunk = chunks.length > 0 ? totalModules / chunks.length : 0;

    const sortedBySize = [...chunks].sort((a, b) => (b.size || 0) - (a.size || 0));
    const largestChunk = sortedBySize[0] || { id: 0, name: 'N/A', size: 0, modules: [] };
    const smallestChunk = sortedBySize[sortedBySize.length - 1] || { id: 0, name: 'N/A', size: 0, modules: [] };

    const initialChunks = chunks.filter(c => {
      // Try to identify initial chunks
      const chunkInfo = stats.chunks.find(ch => ch.id === c.id);
      return chunkInfo && 'initial' in chunkInfo && (chunkInfo as { initial?: boolean }).initial === true;
    });
    const initialChunkSize = initialChunks.reduce((sum, c) => sum + (c.size || 0), 0);

    const recommendations: string[] = [];
    
    // Large chunks recommendation
    if (averageChunkSize > 500000) {
      recommendations.push(`Average chunk size is ${(averageChunkSize / 1024).toFixed(2)}KB - consider splitting large chunks`);
    }
    
    // Too many small chunks
    if (chunks.length > 20 && averageChunkSize < 50000) {
      recommendations.push(`Many small chunks (${chunks.length}) - consider combining related chunks`);
    }
    
    // Initial chunk too large
    if (initialChunkSize > 500000) {
      recommendations.push(`Initial chunk is ${(initialChunkSize / 1024).toFixed(2)}KB - implement code-splitting for better load times`);
    }
    
    // Chunk size imbalance
    if (smallestChunk.size > 0 && largestChunk.size > smallestChunk.size * 10) {
      recommendations.push(`Chunk size imbalance detected - largest chunk is ${(largestChunk.size / smallestChunk.size).toFixed(1)}x larger than smallest`);
    }

    return {
      averageChunkSize,
      averageModulesPerChunk,
      largestChunk,
      smallestChunk,
      initialChunkSize,
      recommendations
    };
  }

  private calculateMetrics(stats: BundleStats): BundleMetrics {
    const sizes = stats.modules.map(m => m.size);
    const averageSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
    const gzipSize = stats.gzipSize || 0;
    // Brotli is typically 15-20% smaller than gzip, estimate at 17% reduction
    const brotliSize = gzipSize > 0 ? Math.round(gzipSize * 0.83) : undefined;
    
    return {
      totalSize: stats.size,
      totalGzipSize: gzipSize,
      totalBrotliSize: brotliSize,
      moduleCount: stats.modules.length,
      chunkCount: stats.chunks.length,
      largestModule: stats.modules[0] || {
        name: 'N/A',
        size: 0,
        percentage: 0,
        reasons: [],
        gzipSize: 0
      },
      averageModuleSize: averageSize
    };
  }
}
