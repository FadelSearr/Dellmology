'use client';
import { fmtCompact } from '@/lib/utils';
import type { FlowLink } from '@/lib/analysis';

interface BrokerFlowNetworkProps {
  links: FlowLink[];
  sellers: { code: string; typeColor: string; netValue: number }[];
  buyers: { code: string; typeColor: string; netValue: number }[];
}

export default function BrokerFlowNetwork({ links, sellers, buyers }: BrokerFlowNetworkProps) {
  if (!links.length || !sellers.length || !buyers.length) return null;

  // Constants for SVG drawing
  const width = 280;
  const height = Math.max(160, Math.max(sellers.length, buyers.length) * 32);
  const nodeWidth = 30;
  const paddingY = 8;
  const xLeft = 10;
  const xRight = width - nodeWidth - 10;

  // Calculate total flow for height mapping
  const totalSell = sellers.reduce((acc, s) => acc + Math.abs(s.netValue), 0);
  const totalBuy = buyers.reduce((acc, b) => acc + Math.abs(b.netValue), 0);
  const maxFlow = Math.max(totalSell, totalBuy);
  const availableHeight = height - (Math.max(sellers.length, buyers.length) * paddingY);

  // Position nodes
  const sNodes = new Map();
  let currentYLeft = 0;
  sellers.forEach(s => {
    const nodeHeight = Math.max(12, (Math.abs(s.netValue) / maxFlow) * availableHeight);
    sNodes.set(s.code, { y: currentYLeft, h: nodeHeight, color: s.typeColor });
    currentYLeft += nodeHeight + paddingY;
  });

  const bNodes = new Map();
  let currentYRight = 0;
  buyers.forEach(b => {
    const nodeHeight = Math.max(12, (Math.abs(b.netValue) / maxFlow) * availableHeight);
    bNodes.set(b.code, { y: currentYRight, h: nodeHeight, color: b.typeColor });
    currentYRight += nodeHeight + paddingY;
  });

  // Calculate link paths (Sankey logic)
  const linkPaths = [];
  const sourceOffsets = new Map(); // tracks running Y offset per source
  const targetOffsets = new Map(); // tracks running Y offset per target

  for (const link of links) {
    const source = sNodes.get(link.source);
    const target = bNodes.get(link.target);
    if (!source || !target) continue;

    const sOffset = sourceOffsets.get(link.source) || 0;
    const tOffset = targetOffsets.get(link.target) || 0;

    // Link thickness based on value proportion
    const linkHeight = Math.max(2, (link.value / maxFlow) * availableHeight);

    const y1 = source.y + sOffset + (linkHeight / 2);
    const y2 = target.y + tOffset + (linkHeight / 2);

    // Update running offsets
    sourceOffsets.set(link.source, sOffset + linkHeight);
    targetOffsets.set(link.target, tOffset + linkHeight);

    // Draw cubic bezier curve
    const x1 = xLeft + nodeWidth;
    const x2 = xRight;
    const controlPointX = (x1 + x2) / 2;

    const path = `M ${x1} ${y1} C ${controlPointX} ${y1}, ${controlPointX} ${y2}, ${x2} ${y2}`;

    linkPaths.push(
      <path
        key={`${link.source}-${link.target}`}
        d={path}
        stroke={source.color}
        strokeWidth={linkHeight}
        fill="none"
        opacity={0.3}
        className="flow-link"
      >
        <title>{link.source} → {link.target} : {fmtCompact(link.value)}</title>
      </path>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, padding: '0 10px' }}>
        <span>DISTRIBUSI</span>
        <span>AKUMULASI</span>
      </div>
      
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Draw Links */}
        {linkPaths}

        {/* Draw Seller Nodes */}
        {sellers.map(s => {
          const node = sNodes.get(s.code);
          return (
            <g key={s.code} transform={`translate(${xLeft}, ${node.y})`}>
              <rect width={nodeWidth} height={node.h} fill={node.color} rx={2} />
              <text x={nodeWidth / 2} y={node.h / 2} dy={4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}>
                {s.code}
              </text>
            </g>
          );
        })}

        {/* Draw Buyer Nodes */}
        {buyers.map(b => {
          const node = bNodes.get(b.code);
          return (
            <g key={b.code} transform={`translate(${xRight}, ${node.y})`}>
              <rect width={nodeWidth} height={node.h} fill={node.color} rx={2} />
              <text x={nodeWidth / 2} y={node.h / 2} dy={4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}>
                {b.code}
              </text>
            </g>
          );
        })}
      </svg>
      
      <style>{`
        .flow-link {
          transition: opacity 0.2s;
        }
        .flow-link:hover {
          opacity: 0.8;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
