import { AnalysisResult } from '../types.js';
import fs from 'fs';
import path from 'path';

export function generateDependencyGraph(result: AnalysisResult, outputPath: string): void {
  const dot = generateDOT(result);
  const dir = path.dirname(outputPath);

  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, dot, 'utf-8');
}

function generateDOT(result: AnalysisResult): string {
  const nodes: string[] = [];
  const edges: string[] = [];
  const moduleMap = new Map<string, number>();

  const modules = result.bundleStats.modules || [];
  if (modules.length === 0) {
    return `digraph BundleDependencies {
  rankdir=LR;
  node [shape=box, style=rounded, fontname="Arial"];
  edge [color=gray];
  
  empty [label="No modules found"];
}`;
  }

  // Create nodes for top modules
  modules.slice(0, 50).forEach((module, index) => {
    const nodeId = `m${index}`;
    moduleMap.set(module.name, index);
    const sizeKB = ((module.size || 0) / 1024).toFixed(1);
    nodes.push(`  ${nodeId} [label="${escapeDotLabel(module.name)}\\n${sizeKB}KB", tooltip="${escapeDotLabel(module.name)}"];`);
  });

  // Create edges based on reasons
  modules.slice(0, 50).forEach((module, index) => {
    const sourceId = `m${index}`;
    const reasons = Array.isArray(module.reasons) ? module.reasons : [];
    reasons.forEach(reason => {
      if (typeof reason !== 'string') return;
      // Try to find target module
      const targetIndex = Array.from(moduleMap.keys()).findIndex(name => 
        reason.includes(name) || name.includes(reason)
      );
      if (targetIndex >= 0 && targetIndex !== index) {
        const targetId = `m${targetIndex}`;
        edges.push(`  ${sourceId} -> ${targetId};`);
      }
    });
  });

  return `digraph BundleDependencies {
  rankdir=LR;
  node [shape=box, style=rounded, fontname="Arial"];
  edge [color=gray];
  
${nodes.join('\n')}

${edges.join('\n')}
}`;
}

function escapeDotLabel(text: string): string {
  if (!text) return 'unknown';
  return text
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/[<>{}|]/g, '_') // Replace Graphviz special chars
    .slice(-30); // Limit length
}

interface GraphNode {
  id: number;
  label: string;
  size: number;
  group: number;
}

interface GraphEdge {
  from: number;
  to: number;
}

interface DependencyGraphJSON {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function generateDependencyGraphJSON(result: AnalysisResult): DependencyGraphJSON {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const moduleMap = new Map<string, number>();

  // Create nodes for top modules
  result.bundleStats.modules.slice(0, 100).forEach((module, index) => {
    moduleMap.set(module.name, index);
    nodes.push({
      id: index,
      label: module.name,
      size: module.size,
      group: module.name.includes('node_modules') ? 1 : 2
    });
  });

  // Create edges
  result.bundleStats.modules.slice(0, 100).forEach((module, index) => {
    module.reasons.forEach(reason => {
      const targetIndex = Array.from(moduleMap.keys()).findIndex(name => 
        reason.includes(name) || name.includes(reason)
      );
      if (targetIndex >= 0 && targetIndex !== index) {
        edges.push({
          from: index,
          to: targetIndex
        });
      }
    });
  });

  return { nodes, edges };
}

