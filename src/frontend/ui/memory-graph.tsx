import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Memory, UUID } from '@elizaos/core';
// @ts-ignore
import ForceGraph2D, { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d';

interface MemoryNode extends NodeObject {
    id: UUID;
    name: string;
    val?: number; // Node size
    memory: Memory;
}

interface MemoryLink extends LinkObject {
    source: UUID;
    target: UUID;
    value?: number; // Link strength/thickness
}

interface MemoryGraphProps {
    memories: Memory[];
    onNodeClick: (memory: Memory) => void;
    selectedMemoryId?: UUID | null;
}

const MAX_NODES_INITIAL = 50; // Limit initial nodes for performance
const MAX_LINKS_PER_NODE = 2; // Limit links for clarity

export function MemoryGraph({ memories, onNodeClick, selectedMemoryId }: MemoryGraphProps) {
    const fgRef = useRef<ForceGraphMethods<MemoryNode, MemoryLink> | undefined>(undefined);
    const [graphData, setGraphData] = useState<{ nodes: MemoryNode[]; links: MemoryLink[] }>({ nodes: [], links: [] });
    const [highlightNodes, setHighlightNodes] = useState<Set<UUID>>(new Set());
    const [highlightLinks, setHighlightLinks] = useState<Set<MemoryLink>>(new Set());
    const [hoverNode, setHoverNode] = useState<MemoryNode | null>(null);

    useEffect(() => {
        if (memories && memories.length > 0) {
            const nodes: MemoryNode[] = memories.slice(0, MAX_NODES_INITIAL).map((mem) => ({
                id: mem.id as UUID,
                name: (mem.metadata as any)?.title || mem.id?.substring(0, 8) || 'Memory',
                val: 5, // Default size
                memory: mem,
            }));

            const links: MemoryLink[] = [];
            if (nodes.length > 1) {
                for (let i = 0; i < nodes.length; i++) {
                    const sourceNode = nodes[i];
                    for (let k = 0; k < Math.min(MAX_LINKS_PER_NODE, nodes.length - 1); k++) {
                        let targetIndex = Math.floor(Math.random() * nodes.length);
                        while (targetIndex === i || links.some(l => l.source === sourceNode.id && l.target === nodes[targetIndex].id)) {
                            targetIndex = Math.floor(Math.random() * nodes.length);
                        }
                        if (nodes[targetIndex]) {
                            links.push({ source: sourceNode.id, target: nodes[targetIndex].id, value: Math.random() * 2 + 1 });
                        }
                    }
                }
            }
            setGraphData({ nodes, links });
        } else {
            setGraphData({ nodes: [], links: [] });
        }
    }, [memories]);

    const handleNodeHover = (node: MemoryNode | null) => {
        highlightNodes.clear();
        highlightLinks.clear();
        if (node) {
            highlightNodes.add(node.id);
            graphData.links.forEach(link => {
                if (link.source === node.id || link.target === node.id) {
                    highlightLinks.add(link);
                    highlightNodes.add(link.source as UUID);
                    highlightNodes.add(link.target as UUID);
                }
            });
        }
        setHoverNode(node);
        setHighlightNodes(new Set(highlightNodes));
        setHighlightLinks(new Set(highlightLinks));
    };

    const handleNodeClick = useCallback((node: MemoryNode) => {
        onNodeClick(node.memory);
        fgRef.current?.centerAt(node.x, node.y, 1000);
        fgRef.current?.zoom(2, 1000);
    }, [onNodeClick, fgRef]);


    if (!memories || memories.length === 0) {
        return <div className="text-center text-muted-foreground p-8">No memories to display in graph.</div>;
    }

    if (graphData.nodes.length === 0 && memories.length > 0) {
        return <div className="text-center text-muted-foreground p-8">Preparing graph data...</div>;
    }


    return (
        <div style={{ margin: 'auto', position: 'relative', border: '1px solid #e2e8f0', borderRadius: '0.375rem' }}>
            <ForceGraph2D<MemoryNode, MemoryLink>
                ref={fgRef}
                graphData={graphData}
                nodeLabel="name"
                nodeVal="val"
                nodeRelSize={4}
                linkDirectionalParticles={1}
                linkDirectionalParticleWidth={(link: MemoryLink) => highlightLinks.has(link) ? 2 : 0}
                linkWidth={(link: MemoryLink) => highlightLinks.has(link) ? 1.5 : 0.5}
                linkColor={(link: MemoryLink) => highlightLinks.has(link) ? 'rgba(100,100,255,0.7)' : 'rgba(0,0,0,0.15)'}
                nodeCanvasObjectMode={() => 'after'}
                nodeCanvasObject={(node, ctx, globalScale) => {
                    const memNode = node as MemoryNode;
                    const label = memNode.name;
                    const fontSize = 12 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const isSelected = selectedMemoryId === memNode.id;
                    const isHovered = hoverNode?.id === memNode.id;
                    const isHighlighted = highlightNodes.has(memNode.id);

                    ctx.fillStyle = isSelected ? 'rgba(60, 100, 200, 0.9)' : (isHovered || isHighlighted ? 'rgba(0, 50, 150, 0.7)' : 'rgba(0, 0, 0, 0.5)');
                    ctx.fillText(label, memNode.x || 0, (memNode.y || 0) + 8);

                    // Node circle
                    ctx.beginPath();
                    ctx.arc(memNode.x || 0, memNode.y || 0, memNode.val || 5, 0, 2 * Math.PI, false);
                    ctx.fillStyle = isSelected ? 'blue' : (isHovered ? 'darkslateblue' : (isHighlighted ? 'slateblue' : 'lightblue'));
                    ctx.fill();
                    if (isSelected) {
                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 1 / globalScale;
                        ctx.stroke();
                    }
                }}
                onNodeHover={handleNodeHover as any}
                onNodeClick={handleNodeClick as any}
                width={600} // Default width, will be overridden by parent
                height={500} // Default height
                cooldownTicks={100}
                onEngineStop={() => fgRef.current?.zoomToFit(400, 100)}
            />
            {memories.length > MAX_NODES_INITIAL && (
                <div className="absolute bottom-2 right-2 text-xs bg-background/80 p-1 rounded">
                    Displaying {MAX_NODES_INITIAL} of {memories.length} memories for performance.
                </div>
            )}
        </div>
    );
} 