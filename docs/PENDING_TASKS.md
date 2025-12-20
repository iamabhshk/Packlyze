# Pending Tasks & Next Steps

## ✅ **Completed (Just Finished)**

1. ✅ **Package-Level Analysis** - Groups modules by npm package, shows top packages
2. ✅ **Brotli Compression Estimates** - Added to metrics and reports
3. ✅ **Config File Support** - Supports `.packlyzerc`, `packlyze.config.json`, etc.
4. ✅ **Export Formats** - CSV and Markdown export options
5. ✅ **Better Error Messages** - Actionable error messages with tips
6. ✅ **Version Mismatch** - Fixed to read from package.json dynamically
7. ✅ **Division by Zero Bug** - Fixed percentage calculation
8. ✅ **Duplicate Detection** - Improved to detect real package duplicates
9. ✅ **Input Validation** - Comprehensive validation added
10. ✅ **Test Coverage** - Expanded from 1 to 17 comprehensive tests

---

## ⚠️ **Minor Issues to Address**

### 1. **Unused Verbose Flag** (Quick Fix)
**Location**: `src/cli.ts:39`
- `--verbose` option is defined but never used
- **Options**:
  - **Option A**: Remove the flag (simplest)
  - **Option B**: Implement verbose logging (show detailed analysis steps)
- **Recommendation**: Implement it - useful for debugging

### 2. **Progress Feedback for Large Files** (Nice to Have)
**Location**: `src/analyzer/packlyze.ts`
- Large stats files can take time to parse
- **Fix**: Add progress indicators or at least log parsing stages
- **Priority**: Low (most stats files are small)

### 3. **Memory Concerns for Very Large Bundles** (Low Priority)
**Location**: `src/analyzer/packlyze.ts:40`
- Entire stats file loaded into memory
- **Fix**: Consider streaming JSON parser for 100MB+ files
- **Priority**: Very Low (edge case)

---

## 🚀 **Next Features to Implement (Tier 2)**

### 1. **Historical Tracking / Trend Analysis** ⭐⭐⭐
**Effort**: Medium | **Impact**: Very High

Store analysis results over time:
```bash
packlyze track stats.json  # Saves to .packlyze/history.json
packlyze trends            # Shows bundle size over last 10 builds
```

**Benefits**: Track bundle size regressions over time, see trends

### 2. **Module Dependency Graph** ⭐⭐
**Effort**: Medium | **Impact**: High

Visualize which modules import which others:
- Generate Graphviz DOT file
- Or use `vis-network` in HTML report
- Helps identify circular dependencies

### 3. **Interactive HTML Report** ⭐⭐
**Effort**: Medium | **Impact**: Medium

Make HTML report interactive:
- Search/filter modules
- Sort tables by different columns
- Expand/collapse sections
- Click modules to see dependencies

### 4. **Unused Code Detection** ⭐⭐⭐
**Effort**: Medium-High | **Impact**: High

Identify modules that are imported but never actually used:
- Modules with no `reasons` (entry points) but also not imported elsewhere
- Requires analyzing the full dependency graph

### 5. **Chunk Analysis & Recommendations** ⭐⭐
**Effort**: Medium | **Impact**: Medium

Analyze chunk structure:
- Average chunk size
- Chunk efficiency (modules per chunk)
- Recommendations for better code-splitting

---

## 🔧 **Code Quality Improvements**

### 1. **Add JSDoc Comments**
Document all public methods and interfaces

### 2. **Extract Constants**
Magic numbers (500KB, 250KB thresholds) should be constants

### 3. **Add Logging Utility**
Replace direct `console.log` with a logger for better CI control

### 4. **Add Progress Callbacks**
For long-running operations

---

## 📊 **Metrics to Add**

1. **Bundle Composition**: % of code vs dependencies vs polyfills
2. **Compression Ratios**: gzip vs raw size ratios
3. **Chunk Efficiency**: Average chunk size, modules per chunk
4. **Module Health Score**: Composite score based on all metrics

---

## 🎨 **UX Improvements**

1. **Progress Indicators**: Show progress when analyzing large files
2. **Summary Stats**: Quick "health score" at the top
3. **Color-Coded Output**: More consistent use of colors
4. **Comparison Mode**: Better visualization when comparing baselines

---

## 🔒 **Security & Performance**

1. **File Path Validation**: Ensure output paths can't be used for path traversal
2. **JSON Size Limits**: Prevent DoS with huge JSON files
3. **Memory Limits**: Add memory usage warnings

---

## 📝 **Documentation**

1. **API Documentation**: Document the programmatic API
2. **Examples Directory**: Add example stats files and outputs
3. **Integration Guides**: Step-by-step for Webpack, Rollup, esbuild
4. **Best Practices**: When to use which features

---

## 🎯 **Recommended Next Steps**

### **Immediate (This Week)**
1. ✅ Fix unused verbose flag (implement or remove)
2. ✅ Add progress feedback for large files
3. ✅ Update README with new features

### **Short Term (Next 2-4 Weeks)**
1. Historical tracking / trend analysis
2. Interactive HTML report
3. Chunk analysis & recommendations

### **Medium Term (1-2 Months)**
1. Module dependency graph
2. Unused code detection
3. Webpack plugin integration
4. GitHub Action

---

## 📈 **Current Status**

**Completed**: 10/10 priority items ✅
**Pending Minor Issues**: 3 items
**Next Features**: 5 high-value features identified
**Test Coverage**: 17/17 tests passing ✅
**Build Status**: ✅ Successful
**Linting**: ✅ No errors

---

## 💡 **Quick Wins Available**

If you want to knock out some quick improvements:

1. **Remove/Implement Verbose Flag** (5 minutes)
2. **Add Progress Logging** (15 minutes)
3. **Extract Constants** (10 minutes)
4. **Add JSDoc Comments** (30 minutes)
5. **Update README** (20 minutes)

Total: ~1.5 hours for significant polish improvements

---

**Overall**: The project is in excellent shape! All critical issues are fixed, and all Tier 1 features are implemented. The remaining items are enhancements and nice-to-haves. 🎉

