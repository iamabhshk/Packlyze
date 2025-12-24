import fs from 'fs';
import path from 'path';
import { AnalysisResult } from '../types.js';

export function generateHTMLReport(result: AnalysisResult, outputPath: string, baselineResult?: AnalysisResult): void {
  const html = generateHTML(result, baselineResult);
  const dir = path.dirname(outputPath);

  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html);
}

function generateHTML(result: AnalysisResult, baseline?: AnalysisResult): string {
  const recommendations = result.recommendations
    .map(rec => `
      <div class="recommendation ${rec.severity}">
        <div class="rec-icon">${rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '🟡' : '🟢'}</div>
        <div class="rec-content">
          <div class="rec-message">${escapeHtml(rec.message)}</div>
          <div class="rec-action">Action: ${escapeHtml(rec.action)}</div>
        </div>
      </div>
    `)
    .join('');

  const topModules = (result.bundleStats?.modules || [])
    .slice(0, 10)
    .map(m => `
      <tr>
        <td>${escapeHtml((m.name || '').slice(-50))}</td>
        <td>${((m.size || 0) / 1024).toFixed(2)} KB</td>
        <td>${((m.percentage || 0)).toFixed(2)}%</td>
      </tr>
    `)
    .join('');

  const duplicates = (result.duplicates || [])
    .map(dup => `
      <tr>
        <td>${(dup.names || []).length}</td>
        <td>${((dup.totalSize || 0) / 1024).toFixed(2)} KB</td>
        <td>${((dup.savings || 0) / 1024).toFixed(2)} KB</td>
        <td>${(dup.names || []).slice(0, 3).map(name => escapeHtml(name || '')).join('<br/>')}${(dup.names || []).length > 3 ? '…' : ''}</td>
      </tr>
    `)
    .join('');

  const treeshakingIssues = (result.treeshakingIssues || [])
    .slice(0, 10)
    .map(issue => `<li>${escapeHtml(issue || '')}</li>`)
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Package Analysis Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --bg-body: #050816;
      --bg-panel: #0f172a;
      --bg-panel-soft: #020617;
      --border-subtle: rgba(148, 163, 184, 0.3);
      --accent: #6366f1;
      --accent-soft: rgba(99, 102, 241, 0.18);
      --accent-strong: #4f46e5;
      --text-main: #e5e7eb;
      --text-soft: #9ca3af;
      --text-subtle: #6b7280;
      --critical: #f97373;
      --warning: #fb923c;
      --info: #38bdf8;
      --good: #22c55e;
      --shadow-soft: 0 18px 40px rgba(15, 23, 42, 0.75);
      --radius-lg: 18px;
      --radius-md: 12px;
      --radius-sm: 9px;
      --blur-backdrop: 20px;
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
      background: radial-gradient(circle at top, #1e293b 0, #020617 45%, #000 100%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 32px 20px 40px;
      display: flex;
      justify-content: center;
    }

    .container {
      width: 100%;
      max-width: 1120px;
    }

    header {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.92));
      border-radius: 24px;
      padding: 24px 28px 20px;
      margin-bottom: 24px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      box-shadow: var(--shadow-soft);
      backdrop-filter: blur(var(--blur-backdrop));
      position: relative;
      overflow: hidden;
    }

    header::before {
      content: '';
      position: absolute;
      inset: -40%;
      background:
        radial-gradient(circle at 0% 0%, rgba(56, 189, 248, 0.09) 0, transparent 55%),
        radial-gradient(circle at 100% 0%, rgba(129, 140, 248, 0.18) 0, transparent 60%);
      opacity: 0.7;
      pointer-events: none;
    }

    .header-inner {
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    h1 {
      color: #f9fafb;
      font-size: 26px;
      letter-spacing: 0.02em;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    h1 span.icon {
      font-size: 26px;
    }

    .header-subtitle {
      color: var(--text-soft);
      font-size: 13px;
    }

    .timestamp-group {
      text-align: right;
      font-size: 11px;
      color: var(--text-subtle);
    }

    .timestamp-label {
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 10px;
      color: var(--text-subtle);
    }

    .timestamp-value {
      margin-top: 3px;
    }

    .badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }

    .badge {
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 11px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      color: var(--text-soft);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(10px);
    }

    .badge-accent {
      border-color: rgba(99, 102, 241, 0.5);
      color: #e0e7ff;
      background: rgba(79, 70, 229, 0.22);
    }

    .badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--good);
      box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.17);
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 14px;
      margin-bottom: 22px;
    }

    .metric-card {
      background: radial-gradient(circle at 0 0, rgba(148, 163, 184, 0.08) 0, rgba(15, 23, 42, 0.98) 55%);
      padding: 16px 16px 14px;
      border-radius: var(--radius-md);
      border: 1px solid rgba(30, 64, 175, 0.55);
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.8);
      position: relative;
      overflow: hidden;
    }

    .metric-card::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(148, 163, 184, 0.05), transparent 40%);
      opacity: 0.9;
      pointer-events: none;
    }

    .metric-label {
      color: var(--text-subtle);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 8px;
    }

    .metric-value {
      font-size: 22px;
      font-weight: 600;
      color: #e5e7eb;
      position: relative;
      z-index: 1;
    }

    .metric-delta {
      font-size: 11px;
      margin-top: 4px;
      position: relative;
      z-index: 1;
    }

    .delta-positive {
      color: #4ade80;
    }

    .delta-negative {
      color: #fb7185;
    }

    .section {
      background: radial-gradient(circle at 0 0, rgba(148, 163, 184, 0.07) 0, rgba(15, 23, 42, 0.98) 55%);
      padding: 20px 20px 18px;
      border-radius: var(--radius-lg);
      margin-bottom: 18px;
      border: 1px solid var(--border-subtle);
      box-shadow: var(--shadow-soft);
      position: relative;
      overflow: hidden;
    }

    .section::before {
      content: '';
      position: absolute;
      inset: -30%;
      background: radial-gradient(circle at 100% 0, rgba(96, 165, 250, 0.11) 0, transparent 55%);
      opacity: 0.75;
      pointer-events: none;
    }

    .section-inner {
      position: relative;
    }

    .section h2 {
      color: #e5e7eb;
      margin-bottom: 16px;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.25);
      padding-bottom: 9px;
    }

    .section-tag {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--text-subtle);
    }

    .recommendation {
      display: flex;
      gap: 14px;
      padding: 13px 12px;
      margin-bottom: 10px;
      border-radius: var(--radius-md);
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(15, 23, 42, 0.92);
    }

    .recommendation.critical {
      border-color: rgba(248, 113, 113, 0.6);
      background: linear-gradient(135deg, rgba(127, 29, 29, 0.9), rgba(15, 23, 42, 0.96));
    }

    .recommendation.warning {
      border-color: rgba(251, 146, 60, 0.7);
      background: linear-gradient(135deg, rgba(124, 45, 18, 0.9), rgba(15, 23, 42, 0.96));
    }

    .recommendation.info {
      border-color: rgba(56, 189, 248, 0.65);
      background: linear-gradient(135deg, rgba(12, 74, 110, 0.9), rgba(15, 23, 42, 0.96));
    }

    .rec-icon {
      font-size: 22px;
      line-height: 1;
      margin-top: 2px;
    }

    .rec-content {
      flex: 1;
    }

    .rec-message {
      font-weight: 600;
      margin-bottom: 4px;
      color: #f9fafb;
      font-size: 14px;
    }

    .rec-action {
      font-size: 12px;
      color: var(--text-soft);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th,
    td {
      padding: 9px 10px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.9);
    }

    th {
      background: radial-gradient(circle at 0 0, rgba(148, 163, 184, 0.22) 0, rgba(15, 23, 42, 0.98) 70%);
      text-align: left;
      font-weight: 600;
      color: #e5e7eb;
      position: sticky;
      top: 0;
      z-index: 1;
    }

    td {
      color: var(--text-main);
      vertical-align: top;
    }

    tr:nth-child(even) td {
      background: rgba(15, 23, 42, 0.92);
    }

    tr:nth-child(odd) td {
      background: rgba(15, 23, 42, 0.86);
    }

    tr:hover td {
      background: rgba(30, 64, 175, 0.6);
    }

    ul {
      list-style: none;
      padding-left: 0;
      font-size: 13px;
      color: var(--text-main);
    }

    ul li {
      margin-bottom: 7px;
      padding-left: 14px;
      position: relative;
    }

    ul li::before {
      content: '•';
      position: absolute;
      left: 0;
      color: var(--accent);
    }

    footer {
      text-align: center;
      color: var(--text-subtle);
      font-size: 11px;
      margin-top: 28px;
    }

    footer span {
      color: var(--accent);
      font-weight: 500;
    }

    @media (max-width: 768px) {
      body {
        padding: 18px 12px 28px;
      }

      header {
        padding: 18px 16px 16px;
      }

      .header-inner {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }

      .timestamp-group {
        text-align: left;
      }

      .metrics-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 520px) {
      .metrics-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-inner">
        <div>
          <h1><span class="icon">📊</span> Package Analysis Report</h1>
          <p class="header-subtitle">High-signal insights into your JavaScript bundle: size, composition, and optimization opportunities.</p>
          <div class="badge-row">
            <span class="badge badge-accent"><span class="badge-dot"></span> Bundle Health Overview</span>
            <span class="badge">Metrics, duplicates, and tree-shaking diagnostics</span>
            ${baseline ? '<span class="badge">Baseline comparison enabled</span>' : ''}
          </div>
        </div>
        <div class="timestamp-group">
          <div>
            <div class="timestamp-label">Current Run</div>
            <div class="timestamp-value">${new Date(result.timestamp).toLocaleString()}</div>
          </div>
          ${
            baseline
              ? `<div style="margin-top:8px;">
            <div class="timestamp-label">Baseline</div>
            <div class="timestamp-value">${new Date(baseline.timestamp).toLocaleString()}</div>
          </div>`
              : ''
          }
        </div>
      </div>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Size</div>
        <div class="metric-value">${(result.metrics.totalSize / 1024 / 1024).toFixed(2)} MB</div>
        ${formatDeltaHtmlMb(baseline?.metrics.totalSize, result.metrics.totalSize)}
      </div>
      <div class="metric-card">
        <div class="metric-label">Gzip Size</div>
        <div class="metric-value">${(result.metrics.totalGzipSize / 1024 / 1024).toFixed(2)} MB</div>
        ${formatDeltaHtmlMb(baseline?.metrics.totalGzipSize, result.metrics.totalGzipSize)}
      </div>
      ${result.metrics.totalBrotliSize ? `
      <div class="metric-card">
        <div class="metric-label">Brotli Size (est)</div>
        <div class="metric-value">${(result.metrics.totalBrotliSize / 1024 / 1024).toFixed(2)} MB</div>
      </div>
      ` : ''}
      <div class="metric-card">
        <div class="metric-label">Modules</div>
        <div class="metric-value">${result.metrics.moduleCount}</div>
        ${formatDeltaHtmlCount(baseline?.metrics.moduleCount, result.metrics.moduleCount)}
      </div>
      <div class="metric-card">
        <div class="metric-label">Chunks</div>
        <div class="metric-value">${result.metrics.chunkCount}</div>
        ${formatDeltaHtmlCount(baseline?.metrics.chunkCount, result.metrics.chunkCount)}
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg Module Size</div>
        <div class="metric-value">${(result.metrics.averageModuleSize / 1024).toFixed(2)} KB</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Largest Module</div>
        <div class="metric-value">${(result.metrics.largestModule.size / 1024).toFixed(2)} KB</div>
      </div>
    </div>

    ${result.recommendations && result.recommendations.length > 0 ? `
      <div class="section">
        <div class="section-inner">
          <h2>
            <span>💡 Recommendations</span>
            <span class="section-tag">Optimization guidance</span>
          </h2>
          ${recommendations}
        </div>
      </div>
    ` : ''}

    <div class="section">
      <div class="section-inner">
        <h2>
          <span>📦 Top 10 Modules by Size</span>
          <span class="section-tag">Heaviest contributors</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Module Name</th>
              <th>Size</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            ${topModules}
          </tbody>
        </table>
      </div>
    </div>

    ${result.packages && result.packages.length > 0 ? `
    <div class="section">
      <div class="section-inner">
        <h2>
          <span>📦 Top Packages by Size</span>
          <span class="section-tag">npm package breakdown</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Package</th>
              <th>Size</th>
              <th>Modules</th>
              <th>% of Bundle</th>
            </tr>
          </thead>
          <tbody>
            ${result.packages.slice(0, 15).map(pkg => `
              <tr>
                <td>${escapeHtml(pkg.name)}</td>
                <td>${(pkg.totalSize / 1024).toFixed(2)} KB</td>
                <td>${pkg.moduleCount}</td>
                <td>${pkg.percentage.toFixed(2)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    ${result.chunkAnalysis ? `
    <div class="section">
      <div class="section-inner">
        <h2>
          <span>📦 Chunk Analysis</span>
          <span class="section-tag">Code-splitting insights</span>
        </h2>
        <div style="margin-bottom: 16px;">
          <p><strong>Average Chunk Size:</strong> ${(result.chunkAnalysis.averageChunkSize / 1024).toFixed(2)} KB</p>
          <p><strong>Average Modules per Chunk:</strong> ${result.chunkAnalysis.averageModulesPerChunk.toFixed(1)}</p>
          <p><strong>Largest Chunk:</strong> ${escapeHtml(result.chunkAnalysis.largestChunk.name)} (${(result.chunkAnalysis.largestChunk.size / 1024).toFixed(2)} KB)</p>
          <p><strong>Initial Chunk Size:</strong> ${(result.chunkAnalysis.initialChunkSize / 1024).toFixed(2)} KB</p>
        </div>
        ${result.chunkAnalysis.recommendations.length > 0 ? `
        <div style="background: rgba(251, 146, 60, 0.1); padding: 12px; border-radius: 8px; border-left: 3px solid var(--warning);">
          <strong>Recommendations:</strong>
          <ul style="margin-top: 8px; margin-left: 20px;">
            ${result.chunkAnalysis.recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}

    ${result.unusedModules && result.unusedModules.length > 0 ? `
    <div class="section">
      <div class="section-inner">
        <h2>
          <span>🔍 Potentially Unused Modules</span>
          <span class="section-tag">Dead code detection</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>Size</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${result.unusedModules.slice(0, 15).map(module => `
              <tr>
                <td>${escapeHtml(module.name)}</td>
                <td>${(module.size / 1024).toFixed(2)} KB</td>
                <td>${escapeHtml(module.reason)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-inner">
        <h2>
          <span>🔁 Duplicate Modules</span>
          <span class="section-tag">De-duplication opportunities</span>
        </h2>
        ${
          result.duplicates.length === 0
            ? '<p>No duplicate modules detected.</p>'
            : `
        <table>
          <thead>
            <tr>
              <th>Count</th>
              <th>Total Size</th>
              <th>Potential Savings</th>
              <th>Example Names</th>
            </tr>
          </thead>
          <tbody>
            ${duplicates}
          </tbody>
        </table>
        `
        }
      </div>
    </div>

    <div class="section">
      <div class="section-inner">
        <h2>
          <span>🌳 Tree-Shaking Issues</span>
          <span class="section-tag">Modern module usage</span>
        </h2>
        ${
          result.treeshakingIssues.length === 0
            ? '<p>No obvious tree-shaking issues detected.</p>'
            : `
        <ul>
          ${treeshakingIssues}
        </ul>
        `
        }
      </div>
    </div>

    <footer>
      <p><span>Packlyze</span> · Advanced JavaScript bundle analysis</p>
    </footer>
  </div>

  <script>
    // Interactive features: search, filter, sort
    (function() {
      // Add search boxes to tables
      const tables = document.querySelectorAll('table');
      tables.forEach((table, index) => {
        const thead = table.querySelector('thead');
        if (!thead) return;
        
        const searchRow = document.createElement('tr');
        searchRow.className = 'search-row';
        const th = document.createElement('th');
        th.colSpan = thead.querySelectorAll('th').length;
        th.innerHTML = '<input type="text" placeholder="Search..." class="table-search" data-table="' + index + '">';
        searchRow.appendChild(th);
        thead.appendChild(searchRow);
      });

      // Search functionality
      document.querySelectorAll('.table-search').forEach(input => {
        input.addEventListener('input', function(e) {
          const searchTerm = e.target.value.toLowerCase();
          const tableIndex = parseInt(e.target.dataset.table);
          const table = document.querySelectorAll('table')[tableIndex];
          const rows = table.querySelectorAll('tbody tr');
          
          rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
          });
        });
      });

      // Make table headers sortable (exclude search row)
      tables.forEach((table, tableIndex) => {
        const thead = table.querySelector('thead');
        if (!thead) return;
        
        // Get all header rows (excluding search row)
        const headerRows = Array.from(thead.querySelectorAll('tr')).filter(tr => !tr.classList.contains('search-row'));
        if (headerRows.length === 0) return;
        
        // Get the first header row (actual column headers)
        const firstHeaderRow = headerRows[0];
        const headers = firstHeaderRow.querySelectorAll('th');
        
        headers.forEach((th, index) => {
          // Skip if empty or inside search row
          if (th.textContent.trim() === '' || th.closest('.search-row')) return;
          
          th.style.cursor = 'pointer';
          th.style.userSelect = 'none';
          th.title = 'Click to sort';
          
          th.addEventListener('click', function() {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            
            const rows = Array.from(tbody.querySelectorAll('tr'));
            if (rows.length === 0) return;
            
            const isAscending = th.dataset.sort === 'asc';
            
            // Reset all headers in this table
            headers.forEach(h => {
              h.dataset.sort = '';
              h.textContent = h.textContent.replace(' ▲', '').replace(' ▼', '');
            });
            
            // Sort rows
            rows.sort((a, b) => {
              const aCell = a.cells[index];
              const bCell = b.cells[index];
              
              if (!aCell || !bCell) return 0;
              
              const aText = aCell.textContent.trim() || '';
              const bText = bCell.textContent.trim() || '';
              
              // Try numeric comparison
              const aNum = parseFloat(aText.replace(/[^0-9.-]/g, ''));
              const bNum = parseFloat(bText.replace(/[^0-9.-]/g, ''));
              
              if (!isNaN(aNum) && !isNaN(bNum)) {
                return isAscending ? bNum - aNum : aNum - bNum;
              }
              
              // String comparison
              return isAscending 
                ? bText.localeCompare(aText)
                : aText.localeCompare(bText);
            });
            
            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));
            
            // Update header
            th.dataset.sort = isAscending ? 'desc' : 'asc';
            const originalText = th.textContent.replace(' ▲', '').replace(' ▼', '').trim();
            th.textContent = originalText + (isAscending ? ' ▼' : ' ▲');
          });
        });
      });

      // Add expand/collapse for sections
      document.querySelectorAll('.section h2').forEach(h2 => {
        const section = h2.closest('.section');
        if (!section) return;
        
        const inner = section.querySelector('.section-inner');
        if (!inner) return;
        
        h2.style.cursor = 'pointer';
        h2.style.position = 'relative';
        h2.title = 'Click to expand/collapse';
        
        // Add visual indicator
        const indicator = document.createElement('span');
        indicator.textContent = ' ▼';
        indicator.style.fontSize = '12px';
        indicator.style.marginLeft = '8px';
        indicator.style.opacity = '0.6';
        h2.appendChild(indicator);
        
        h2.addEventListener('click', function() {
          const isHidden = inner.style.display === 'none';
          inner.style.display = isHidden ? '' : 'none';
          indicator.textContent = isHidden ? ' ▼' : ' ▶';
        });
      });

      // Add CSS for search
      const style = document.createElement('style');
      style.textContent = \`
        .search-row { background: rgba(99, 102, 241, 0.1) !important; }
        .table-search {
          width: 100%;
          padding: 8px;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 6px;
          color: var(--text-main);
          font-size: 13px;
        }
        .table-search:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }
        th[data-sort] {
          position: relative;
        }
        th:hover {
          background: rgba(99, 102, 241, 0.1);
        }
      \`;
      document.head.appendChild(style);
    })();
  </script>
</body>
</html>
  `;
}

function escapeHtml(text: string): string {
  const map: {[key: string]: string} = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}

function formatDeltaHtmlMb(baselineBytes?: number, currentBytes?: number): string {
  if (baselineBytes === undefined || currentBytes === undefined) return '';
  const diffMb = (currentBytes - baselineBytes) / 1024 / 1024;
  if (Math.abs(diffMb) < 0.01) return '';
  const sign = diffMb > 0 ? '+' : '-';
  const cls = diffMb > 0 ? 'delta-negative' : 'delta-positive';
  return `<div class="metric-delta ${cls}">${sign}${Math.abs(diffMb).toFixed(2)} MB vs baseline</div>`;
}

function formatDeltaHtmlCount(baseline?: number, current?: number): string {
  if (baseline === undefined || current === undefined) return '';
  const diff = current - baseline;
  if (diff === 0) return '';
  const sign = diff > 0 ? '+' : '-';
  const cls = diff > 0 ? 'delta-negative' : 'delta-positive';
  return `<div class="metric-delta ${cls}">${sign}${Math.abs(diff)} vs baseline</div>`;
}
