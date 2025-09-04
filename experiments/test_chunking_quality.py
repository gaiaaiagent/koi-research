#!/usr/bin/env python3
"""
Test and evaluate the quality of ontology-informed chunking
Compare against baseline fixed-size chunking
"""

import asyncio
import json
from pathlib import Path
from typing import List, Dict, Tuple
import numpy as np
from dataclasses import dataclass
import sys
sys.path.append('/Users/darrenzal/koi-research')

from ontology_informed_chunker import OntologyInformedChunker, SemanticChunk
from process_all_documents_mistral import ProductionMetabolicProcessor

@dataclass
class ChunkingMetrics:
    """Metrics for evaluating chunk quality"""
    avg_chunk_size: float
    chunk_size_variance: float
    entity_coverage: float  # % of entities included in chunks
    entity_fragmentation: float  # avg times an entity is split
    discourse_preservation: float  # % of discourse elements kept intact
    boundary_quality: float  # Score for boundary placement
    semantic_coherence: float  # Estimated coherence score

class ChunkingEvaluator:
    """Evaluate and compare different chunking strategies"""
    
    def __init__(self):
        self.ontology_chunker = OntologyInformedChunker(
            min_chunk_size=200,
            max_chunk_size=1500,
            overlap_size=50
        )
        self.processor = ProductionMetabolicProcessor(model="mistral:7b")
    
    def fixed_size_chunking(self, text: str, chunk_size: int = 1000, overlap: int = 100) -> List[Dict]:
        """Baseline: Simple fixed-size chunking"""
        chunks = []
        words = text.split()
        
        for i in range(0, len(words), chunk_size - overlap):
            chunk_words = words[i:i + chunk_size]
            chunk_text = ' '.join(chunk_words)
            chunks.append({
                'content': chunk_text,
                'start_idx': i,
                'end_idx': min(i + chunk_size, len(words)),
                'size': len(chunk_text)
            })
        
        return chunks
    
    def evaluate_chunks(self, 
                       chunks: List,
                       text: str,
                       entities: List[Dict]) -> ChunkingMetrics:
        """Evaluate quality of chunks"""
        
        # Basic statistics
        if isinstance(chunks[0], SemanticChunk):
            chunk_sizes = [len(c.content) for c in chunks]
        else:
            chunk_sizes = [c['size'] for c in chunks]
        
        avg_size = np.mean(chunk_sizes)
        size_variance = np.var(chunk_sizes)
        
        # Entity coverage and fragmentation
        entity_coverage, entity_fragmentation = self._calculate_entity_metrics(
            chunks, entities, text
        )
        
        # Discourse preservation
        discourse_preservation = self._calculate_discourse_preservation(
            chunks, entities
        )
        
        # Boundary quality
        boundary_quality = self._calculate_boundary_quality(chunks, text)
        
        # Semantic coherence (simplified)
        semantic_coherence = self._estimate_semantic_coherence(chunks)
        
        return ChunkingMetrics(
            avg_chunk_size=avg_size,
            chunk_size_variance=size_variance,
            entity_coverage=entity_coverage,
            entity_fragmentation=entity_fragmentation,
            discourse_preservation=discourse_preservation,
            boundary_quality=boundary_quality,
            semantic_coherence=semantic_coherence
        )
    
    def _calculate_entity_metrics(self, chunks, entities, text) -> Tuple[float, float]:
        """Calculate entity coverage and fragmentation"""
        entities_found = 0
        entity_splits = []
        
        for entity in entities:
            entity_name = entity.get('name', '')
            if not entity_name:
                continue
            
            # Count how many chunks contain this entity
            containing_chunks = 0
            
            if isinstance(chunks[0], SemanticChunk):
                for chunk in chunks:
                    if entity_name.lower() in chunk.content.lower():
                        containing_chunks += 1
            else:
                for chunk in chunks:
                    if entity_name.lower() in chunk['content'].lower():
                        containing_chunks += 1
            
            if containing_chunks > 0:
                entities_found += 1
                entity_splits.append(containing_chunks)
        
        coverage = entities_found / max(len(entities), 1)
        avg_fragmentation = np.mean(entity_splits) if entity_splits else 1.0
        
        return coverage, avg_fragmentation
    
    def _calculate_discourse_preservation(self, chunks, entities) -> float:
        """Check if discourse elements are kept intact"""
        discourse_types = {
            'regen:Question', 'regen:Hypothesis', 'regen:Claim',
            'regen:Evidence', 'regen:Experiment', 'regen:Result',
            'regen:Conclusion', 'regen:Theory'
        }
        
        discourse_entities = [
            e for e in entities 
            if e.get('@type', '') in discourse_types
        ]
        
        if not discourse_entities:
            return 1.0  # No discourse elements to preserve
        
        preserved = 0
        for entity in discourse_entities:
            entity_text = entity.get('name', '')
            if not entity_text:
                continue
            
            # Check if entity appears complete in a single chunk
            if isinstance(chunks[0], SemanticChunk):
                for chunk in chunks:
                    if entity_text in chunk.content:
                        preserved += 1
                        break
            else:
                for chunk in chunks:
                    if entity_text in chunk['content']:
                        preserved += 1
                        break
        
        return preserved / len(discourse_entities)
    
    def _calculate_boundary_quality(self, chunks, text) -> float:
        """Score boundary placement (sentences, paragraphs)"""
        score = 0
        total = len(chunks)
        
        for chunk in chunks:
            if isinstance(chunk, SemanticChunk):
                content = chunk.content
            else:
                content = chunk['content']
            
            # Check if chunk starts with capital letter (sentence start)
            if content and content[0].isupper():
                score += 0.5
            
            # Check if chunk ends with punctuation (sentence end)
            if content and content.rstrip()[-1] in '.!?':
                score += 0.5
        
        return score / max(total, 1)
    
    def _estimate_semantic_coherence(self, chunks) -> float:
        """Estimate semantic coherence of chunks"""
        # Simplified: Check for entity consistency within chunks
        coherence_scores = []
        
        for chunk in chunks:
            if isinstance(chunk, SemanticChunk):
                # Ontology-informed chunks have entity metadata
                if chunk.entities:
                    # Higher score for chunks with related entities
                    if chunk.entity_types:
                        coherence = min(1.0, len(chunk.entities) / 3)
                    else:
                        coherence = 0.5
                else:
                    coherence = 0.3
                
                # Bonus for having aligned essence or discourse type
                if chunk.essence_alignments:
                    coherence += 0.1
                if chunk.discourse_type:
                    coherence += 0.1
                
                coherence_scores.append(min(1.0, coherence))
            else:
                # Fixed-size chunks - estimate based on content
                coherence_scores.append(0.5)  # Neutral score
        
        return np.mean(coherence_scores) if coherence_scores else 0.5
    
    async def compare_strategies(self, test_file: Path):
        """Compare ontology-informed vs fixed-size chunking"""
        print(f"\n📄 Testing chunking strategies on: {test_file.name}")
        print("=" * 60)
        
        # Read document
        text = test_file.read_text(encoding='utf-8', errors='ignore')
        
        # Extract entities with Mistral
        print("🤖 Extracting entities with Mistral...")
        metadata = {
            'filename': test_file.name,
            'path': str(test_file),
            'id': test_file.stem,
            'source': 'test'
        }
        
        entities = await self.processor.extract_with_mistral(text[:3000], metadata)
        print(f"   Extracted {len(entities)} entities\n")
        
        # Strategy 1: Ontology-informed chunking
        print("📊 Strategy 1: Ontology-Informed Chunking")
        ontology_chunks = self.ontology_chunker.chunk_document(text, entities)
        ontology_metrics = self.evaluate_chunks(ontology_chunks, text, entities)
        
        print(f"   Created {len(ontology_chunks)} chunks")
        print(f"   Avg size: {ontology_metrics.avg_chunk_size:.0f} chars")
        print(f"   Entity coverage: {ontology_metrics.entity_coverage:.1%}")
        print(f"   Discourse preservation: {ontology_metrics.discourse_preservation:.1%}")
        print(f"   Semantic coherence: {ontology_metrics.semantic_coherence:.2f}")
        
        # Strategy 2: Fixed-size chunking
        print("\n📊 Strategy 2: Fixed-Size Chunking")
        fixed_chunks = self.fixed_size_chunking(text)
        fixed_metrics = self.evaluate_chunks(fixed_chunks, text, entities)
        
        print(f"   Created {len(fixed_chunks)} chunks")
        print(f"   Avg size: {fixed_metrics.avg_chunk_size:.0f} chars")
        print(f"   Entity coverage: {fixed_metrics.entity_coverage:.1%}")
        print(f"   Discourse preservation: {fixed_metrics.discourse_preservation:.1%}")
        print(f"   Semantic coherence: {fixed_metrics.semantic_coherence:.2f}")
        
        # Comparison
        print("\n🎯 Improvement with Ontology-Informed Chunking:")
        improvements = {
            'Entity Coverage': (ontology_metrics.entity_coverage - fixed_metrics.entity_coverage) * 100,
            'Discourse Preservation': (ontology_metrics.discourse_preservation - fixed_metrics.discourse_preservation) * 100,
            'Boundary Quality': (ontology_metrics.boundary_quality - fixed_metrics.boundary_quality) * 100,
            'Semantic Coherence': (ontology_metrics.semantic_coherence - fixed_metrics.semantic_coherence) * 100,
            'Less Fragmentation': (fixed_metrics.entity_fragmentation - ontology_metrics.entity_fragmentation) * 100
        }
        
        for metric, improvement in improvements.items():
            symbol = "✅" if improvement > 0 else "❌"
            print(f"   {symbol} {metric}: {improvement:+.1f}%")
        
        return {
            'file': test_file.name,
            'ontology_metrics': ontology_metrics.__dict__,
            'fixed_metrics': fixed_metrics.__dict__,
            'improvements': improvements
        }


async def main():
    """Run chunking quality tests"""
    print("🧪 Chunking Quality Evaluation")
    print("=" * 60)
    
    evaluator = ChunkingEvaluator()
    
    # Test on different document types
    test_dir = Path("/Users/darrenzal/koi-research/test-documents")
    test_files = [
        test_dir / "scientific-paper.md",
        test_dir / "governance-proposal.md",
        test_dir / "simple-readme.md"
    ]
    
    results = []
    for test_file in test_files:
        if test_file.exists():
            result = await evaluator.compare_strategies(test_file)
            results.append(result)
    
    # Summary
    print("\n" + "=" * 60)
    print("📈 OVERALL SUMMARY")
    print("=" * 60)
    
    avg_improvements = {}
    for result in results:
        for metric, value in result['improvements'].items():
            if metric not in avg_improvements:
                avg_improvements[metric] = []
            avg_improvements[metric].append(value)
    
    print("\nAverage Improvements Across All Documents:")
    for metric, values in avg_improvements.items():
        avg = np.mean(values)
        symbol = "✅" if avg > 0 else "❌"
        print(f"   {symbol} {metric}: {avg:+.1f}%")
    
    # Save results
    output_path = Path("/Users/darrenzal/koi-research/chunking-evaluation-results.json")
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n💾 Detailed results saved to: {output_path}")
    print("\n✅ Chunking evaluation complete!")


if __name__ == "__main__":
    asyncio.run(main())