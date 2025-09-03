#!/usr/bin/env python3
"""
Ontology-Informed Chunking System
Creates semantically meaningful chunks based on extracted metabolic ontology entities
"""

import re
import json
from typing import List, Dict, Tuple, Optional, Set
from dataclasses import dataclass
from collections import defaultdict
import numpy as np

@dataclass
class EntityMarker:
    """Marks where an entity appears in text"""
    entity_id: str
    entity_type: str
    start_pos: int
    end_pos: int
    text: str
    importance: float
    properties: Dict

@dataclass
class SemanticChunk:
    """A chunk with ontology awareness"""
    content: str
    start_pos: int
    end_pos: int
    entities: List[str]  # Entity IDs contained
    entity_types: Set[str]  # Types of entities
    metabolic_process: Optional[str]  # Which process it relates to
    essence_alignments: List[str]  # Re-Whole, Nest, Harmonize
    discourse_type: Optional[str]  # If it contains discourse elements
    metadata: Dict

class OntologyInformedChunker:
    """
    Chunks documents based on extracted ontology entities
    Respects entity boundaries, metabolic processes, and essence alignments
    """
    
    def __init__(self, 
                 min_chunk_size: int = 200,
                 max_chunk_size: int = 1500,
                 overlap_size: int = 100):
        self.min_chunk_size = min_chunk_size
        self.max_chunk_size = max_chunk_size
        self.overlap_size = overlap_size
        
        # Metabolic process flow
        self.metabolic_processes = [
            "Anchor", "Attest", "Issue", "Circulate", "Govern", "Retire"
        ]
        
        # Entity type importance (for boundary decisions)
        self.entity_importance = {
            'regen:GovernanceAct': 1.0,
            'regen:Agent': 0.9,
            'regen:EcologicalAsset': 0.85,
            'regen:SemanticAsset': 0.8,
            'regen:MetabolicFlow': 0.75,
            'regen:Transformation': 0.7,
            # Discourse elements
            'regen:Question': 0.9,
            'regen:Hypothesis': 0.85,
            'regen:Claim': 0.85,
            'regen:Evidence': 0.9,
            'regen:Experiment': 0.8,
            'regen:Result': 0.8,
            'regen:Conclusion': 0.85,
            'regen:Theory': 0.75
        }
    
    def chunk_document(self, 
                      text: str, 
                      extracted_entities: List[Dict],
                      document_metadata: Dict = None) -> List[SemanticChunk]:
        """
        Create chunks based on extracted ontology entities
        
        Args:
            text: The document text
            extracted_entities: List of entities extracted by Mistral
            document_metadata: Optional document metadata
            
        Returns:
            List of semantic chunks
        """
        # 1. Find entity positions in text
        entity_markers = self._locate_entities_in_text(text, extracted_entities)
        
        # 2. Identify natural boundaries
        boundaries = self._identify_boundaries(text, entity_markers)
        
        # 3. Create chunks respecting boundaries
        chunks = self._create_chunks(text, entity_markers, boundaries)
        
        # 4. Enhance chunks with metadata
        chunks = self._enhance_chunk_metadata(chunks, extracted_entities)
        
        return chunks
    
    def _locate_entities_in_text(self, text: str, entities: List[Dict]) -> List[EntityMarker]:
        """Find where entities appear in the text"""
        markers = []
        text_lower = text.lower()
        
        for entity in entities:
            entity_name = entity.get('name', '')
            if not entity_name:
                continue
                
            # Try to find entity text in document
            # First try exact match
            pattern = re.escape(entity_name)
            matches = list(re.finditer(pattern, text, re.IGNORECASE))
            
            if not matches and ' ' in entity_name:
                # Try partial match for multi-word entities
                words = entity_name.split()
                if len(words) > 1:
                    # Try first and last word
                    pattern = re.escape(words[0]) + r'.*?' + re.escape(words[-1])
                    matches = list(re.finditer(pattern, text, re.IGNORECASE))[:1]
            
            for match in matches:
                marker = EntityMarker(
                    entity_id=entity.get('@id', ''),
                    entity_type=entity.get('@type', 'Unknown'),
                    start_pos=match.start(),
                    end_pos=match.end(),
                    text=match.group(),
                    importance=self.entity_importance.get(
                        entity.get('@type', ''), 0.5
                    ),
                    properties=entity
                )
                markers.append(marker)
        
        # Sort by position
        markers.sort(key=lambda x: x.start_pos)
        return markers
    
    def _identify_boundaries(self, text: str, markers: List[EntityMarker]) -> List[int]:
        """
        Identify natural boundaries for chunking
        Based on: entity positions, paragraphs, sentences
        """
        boundaries = set([0, len(text)])
        
        # Add paragraph boundaries
        for match in re.finditer(r'\n\n+', text):
            boundaries.add(match.start())
        
        # Add high-importance entity boundaries
        for marker in markers:
            if marker.importance >= 0.85:
                # Add boundary before important entities
                boundaries.add(marker.start_pos)
                
                # For Questions and Hypotheses, find the end of their context
                if marker.entity_type in ['regen:Question', 'regen:Hypothesis']:
                    # Look for next sentence or paragraph end
                    next_boundary = self._find_next_sentence_end(text, marker.end_pos)
                    if next_boundary:
                        boundaries.add(next_boundary)
        
        # Add boundaries for metabolic process transitions
        for process in self.metabolic_processes:
            pattern = rf'\b{process}\b'
            for match in re.finditer(pattern, text, re.IGNORECASE):
                boundaries.add(match.start())
        
        return sorted(list(boundaries))
    
    def _find_next_sentence_end(self, text: str, start_pos: int) -> Optional[int]:
        """Find the next sentence ending after position"""
        sentence_end_pattern = r'[.!?][\s\n]'
        match = re.search(sentence_end_pattern, text[start_pos:])
        if match:
            return start_pos + match.end()
        return None
    
    def _create_chunks(self, 
                      text: str, 
                      markers: List[EntityMarker],
                      boundaries: List[int]) -> List[SemanticChunk]:
        """Create chunks respecting boundaries and size constraints"""
        chunks = []
        current_pos = 0
        
        while current_pos < len(text):
            # Find optimal chunk end
            chunk_end = self._find_optimal_chunk_end(
                text, current_pos, boundaries, markers
            )
            
            # Create chunk
            chunk_text = text[current_pos:chunk_end].strip()
            
            if len(chunk_text) >= self.min_chunk_size or current_pos == 0:
                # Find entities in this chunk
                chunk_entities = [
                    marker for marker in markers
                    if marker.start_pos >= current_pos and marker.end_pos <= chunk_end
                ]
                
                chunk = SemanticChunk(
                    content=chunk_text,
                    start_pos=current_pos,
                    end_pos=chunk_end,
                    entities=[m.entity_id for m in chunk_entities],
                    entity_types=set(m.entity_type for m in chunk_entities),
                    metabolic_process=None,  # Will be set in enhancement
                    essence_alignments=[],   # Will be set in enhancement
                    discourse_type=None,     # Will be set in enhancement
                    metadata={}
                )
                chunks.append(chunk)
            
            # Move to next position with overlap
            current_pos = chunk_end - self.overlap_size
            if current_pos <= chunks[-1].start_pos if chunks else 0:
                current_pos = chunk_end
        
        return chunks
    
    def _find_optimal_chunk_end(self,
                               text: str,
                               start_pos: int,
                               boundaries: List[int],
                               markers: List[EntityMarker]) -> int:
        """Find the best end position for a chunk"""
        # Maximum possible end
        max_end = min(start_pos + self.max_chunk_size, len(text))
        
        # Find boundaries within range
        valid_boundaries = [
            b for b in boundaries 
            if start_pos + self.min_chunk_size <= b <= max_end
        ]
        
        if valid_boundaries:
            # Prefer boundary that includes complete entities
            best_boundary = valid_boundaries[0]
            best_score = 0
            
            for boundary in valid_boundaries:
                # Count complete entities
                complete_entities = sum(
                    1 for m in markers
                    if m.start_pos >= start_pos and m.end_pos <= boundary
                )
                
                # Prefer boundaries that complete high-importance entities
                importance_sum = sum(
                    m.importance for m in markers
                    if m.start_pos >= start_pos and m.end_pos <= boundary
                )
                
                score = complete_entities + importance_sum
                if score > best_score:
                    best_score = score
                    best_boundary = boundary
            
            return best_boundary
        
        # No good boundary found, use max size
        return max_end
    
    def _enhance_chunk_metadata(self, 
                               chunks: List[SemanticChunk],
                               entities: List[Dict]) -> List[SemanticChunk]:
        """Add rich metadata to chunks based on entities"""
        # Create entity lookup
        entity_lookup = {e.get('@id'): e for e in entities}
        
        for chunk in chunks:
            # Determine metabolic process
            chunk_text_lower = chunk.content.lower()
            for process in self.metabolic_processes:
                if process.lower() in chunk_text_lower:
                    chunk.metabolic_process = process
                    break
            
            # Collect essence alignments
            alignments = set()
            for entity_id in chunk.entities:
                if entity_id in entity_lookup:
                    entity = entity_lookup[entity_id]
                    if 'alignsWith' in entity:
                        aligns = entity['alignsWith']
                        if isinstance(aligns, list):
                            alignments.update(aligns)
                        elif aligns:
                            alignments.add(aligns)
            chunk.essence_alignments = list(alignments)
            
            # Determine discourse type
            discourse_types = {
                'regen:Question': 'question',
                'regen:Hypothesis': 'hypothesis',
                'regen:Claim': 'claim',
                'regen:Evidence': 'evidence',
                'regen:Experiment': 'experiment',
                'regen:Result': 'result',
                'regen:Conclusion': 'conclusion',
                'regen:Theory': 'theory'
            }
            
            for entity_type in chunk.entity_types:
                if entity_type in discourse_types:
                    chunk.discourse_type = discourse_types[entity_type]
                    break
            
            # Add metadata
            chunk.metadata = {
                'entity_count': len(chunk.entities),
                'unique_entity_types': len(chunk.entity_types),
                'has_governance': any('Governance' in t for t in chunk.entity_types),
                'has_ecological': any('Ecological' in t for t in chunk.entity_types),
                'chunk_size': len(chunk.content)
            }
        
        return chunks
    
    def export_chunks(self, chunks: List[SemanticChunk]) -> List[Dict]:
        """Export chunks to JSON-serializable format"""
        return [
            {
                'content': chunk.content,
                'start_pos': chunk.start_pos,
                'end_pos': chunk.end_pos,
                'entities': chunk.entities,
                'entity_types': list(chunk.entity_types),
                'metabolic_process': chunk.metabolic_process,
                'essence_alignments': chunk.essence_alignments,
                'discourse_type': chunk.discourse_type,
                'metadata': chunk.metadata
            }
            for chunk in chunks
        ]


# Example usage
if __name__ == "__main__":
    # Example document
    text = """
    Regen Network is pioneering regenerative agriculture through blockchain technology.
    
    The organization has developed a comprehensive carbon credit system that enables
    farmers to earn revenue from sustainable practices. This represents a significant
    governance act in the ecological finance space.
    
    Question: How can we scale regenerative practices globally?
    
    Our hypothesis is that economic incentives aligned with ecological outcomes will
    drive widespread adoption. Evidence from pilot programs shows 40% increase in
    soil carbon sequestration when farmers are properly compensated.
    
    This transformation anchors value in ecological health, attesting to positive
    outcomes through verified data, and circulating benefits throughout the community.
    """
    
    # Example extracted entities (from Mistral)
    entities = [
        {
            '@id': 'entity:agent:regen01',
            '@type': 'regen:Agent',
            'name': 'Regen Network',
            'alignsWith': ['Re-Whole Value', 'Harmonize Agency']
        },
        {
            '@id': 'entity:asset:carbon01',
            '@type': 'regen:EcologicalAsset',
            'name': 'carbon credit system',
            'alignsWith': ['Re-Whole Value']
        },
        {
            '@id': 'entity:gov:act01',
            '@type': 'regen:GovernanceAct',
            'name': 'governance act',
            'alignsWith': ['Harmonize Agency']
        },
        {
            '@id': 'entity:question:01',
            '@type': 'regen:Question',
            'name': 'How can we scale regenerative practices globally'
        },
        {
            '@id': 'entity:hypothesis:01',
            '@type': 'regen:Hypothesis',
            'name': 'economic incentives aligned with ecological outcomes'
        },
        {
            '@id': 'entity:evidence:01',
            '@type': 'regen:Evidence',
            'name': '40% increase in soil carbon sequestration'
        }
    ]
    
    # Create chunker
    chunker = OntologyInformedChunker(
        min_chunk_size=100,
        max_chunk_size=500
    )
    
    # Create chunks
    chunks = chunker.chunk_document(text, entities)
    
    # Display results
    print(f"Created {len(chunks)} chunks from document\n")
    
    for i, chunk in enumerate(chunks, 1):
        print(f"Chunk {i}:")
        print(f"  Size: {len(chunk.content)} characters")
        print(f"  Entities: {len(chunk.entities)}")
        print(f"  Entity types: {chunk.entity_types}")
        print(f"  Metabolic process: {chunk.metabolic_process}")
        print(f"  Essence alignments: {chunk.essence_alignments}")
        print(f"  Discourse type: {chunk.discourse_type}")
        print(f"  Content preview: {chunk.content[:100]}...")
        print()
    
    # Export to JSON
    json_chunks = chunker.export_chunks(chunks)
    print("JSON export ready with", len(json_chunks), "chunks")