#!/usr/bin/env python3
"""
Entity Deduplication System for KOI Knowledge Graph
Implements standard practices for entity resolution and merging
"""

import hashlib
import re
from typing import Dict, List, Set, Tuple, Optional
from dataclasses import dataclass
from collections import defaultdict
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import networkx as nx

@dataclass
class EntitySignature:
    """Unique signature for entity deduplication"""
    canonical_name: str
    entity_type: str
    aliases: Set[str]
    properties: Dict
    source_documents: Set[str]
    confidence: float = 1.0

class EntityDeduplicator:
    """
    Implements best practices for entity deduplication:
    1. Exact matching (canonical forms)
    2. Fuzzy matching (similarity thresholds)
    3. Graph-based resolution (connected components)
    4. Property-based matching (shared attributes)
    5. Context-aware disambiguation
    """
    
    def __init__(self, similarity_threshold: float = 0.85):
        self.similarity_threshold = similarity_threshold
        self.entity_registry = {}  # canonical_id -> EntitySignature
        self.name_index = defaultdict(set)  # normalized_name -> set of canonical_ids
        self.type_index = defaultdict(set)  # entity_type -> set of canonical_ids
        self.vectorizer = TfidfVectorizer(
            analyzer='char_wb',
            ngram_range=(2, 4),
            lowercase=True
        )
        
    def normalize_name(self, name: str) -> str:
        """Normalize entity name for matching"""
        # Convert to lowercase
        normalized = name.lower()
        
        # Remove special characters but keep spaces
        normalized = re.sub(r'[^\w\s-]', '', normalized)
        
        # Collapse multiple spaces
        normalized = ' '.join(normalized.split())
        
        # Remove common suffixes
        suffixes = [' inc', ' llc', ' corp', ' corporation', ' limited', ' ltd']
        for suffix in suffixes:
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)]
                
        return normalized.strip()
    
    def generate_canonical_id(self, entity_type: str, name: str) -> str:
        """Generate deterministic canonical ID for entity"""
        normalized = self.normalize_name(name)
        content = f"{entity_type}:{normalized}"
        hash_obj = hashlib.sha256(content.encode())
        return f"entity:{entity_type.lower()}:{hash_obj.hexdigest()[:12]}"
    
    def calculate_similarity(self, name1: str, name2: str) -> float:
        """Calculate similarity between two entity names"""
        if not name1 or not name2:
            return 0.0
            
        # Exact match after normalization
        if self.normalize_name(name1) == self.normalize_name(name2):
            return 1.0
        
        # TF-IDF character n-gram similarity
        try:
            vectors = self.vectorizer.fit_transform([name1, name2])
            similarity = cosine_similarity(vectors[0:1], vectors[1:2])[0][0]
            return similarity
        except:
            # Fallback to simple character overlap
            set1 = set(name1.lower().replace(' ', ''))
            set2 = set(name2.lower().replace(' ', ''))
            if not set1 or not set2:
                return 0.0
            return len(set1 & set2) / len(set1 | set2)
    
    def find_matches(self, entity: Dict) -> List[Tuple[str, float]]:
        """Find potential matches for an entity"""
        matches = []
        entity_name = entity.get('name', '')
        entity_type = entity.get('@type', '')
        
        if not entity_name:
            return matches
            
        normalized = self.normalize_name(entity_name)
        
        # 1. Exact match on normalized name
        if normalized in self.name_index:
            for canonical_id in self.name_index[normalized]:
                if self.entity_registry[canonical_id].entity_type == entity_type:
                    matches.append((canonical_id, 1.0))
        
        # 2. Fuzzy matching within same type
        if entity_type in self.type_index:
            for canonical_id in self.type_index[entity_type]:
                signature = self.entity_registry[canonical_id]
                
                # Check against canonical name and aliases
                names_to_check = [signature.canonical_name] + list(signature.aliases)
                
                for name in names_to_check:
                    similarity = self.calculate_similarity(entity_name, name)
                    if similarity >= self.similarity_threshold:
                        matches.append((canonical_id, similarity))
                        break
        
        # 3. Property-based matching (for high-value entities)
        if entity.get('email') or entity.get('website') or entity.get('identifier'):
            for canonical_id, signature in self.entity_registry.items():
                if signature.entity_type != entity_type:
                    continue
                    
                # Email match
                if entity.get('email') and entity['email'] == signature.properties.get('email'):
                    matches.append((canonical_id, 0.95))
                    
                # Website match  
                if entity.get('website') and entity['website'] == signature.properties.get('website'):
                    matches.append((canonical_id, 0.95))
                    
                # Identifier match
                if entity.get('identifier') and entity['identifier'] == signature.properties.get('identifier'):
                    matches.append((canonical_id, 1.0))
        
        # Deduplicate and sort by confidence
        seen = set()
        unique_matches = []
        for canonical_id, confidence in sorted(matches, key=lambda x: x[1], reverse=True):
            if canonical_id not in seen:
                seen.add(canonical_id)
                unique_matches.append((canonical_id, confidence))
                
        return unique_matches
    
    def merge_entities(self, canonical_id: str, new_entity: Dict, confidence: float = 1.0):
        """Merge new entity into existing canonical entity"""
        signature = self.entity_registry[canonical_id]
        
        # Add new name as alias if different
        new_name = new_entity.get('name', '')
        if new_name and self.normalize_name(new_name) != self.normalize_name(signature.canonical_name):
            signature.aliases.add(new_name)
        
        # Merge properties (keep non-null values)
        for key, value in new_entity.items():
            if key not in ['@id', '@type', 'name'] and value:
                if key not in signature.properties or not signature.properties[key]:
                    signature.properties[key] = value
                elif isinstance(value, list) and isinstance(signature.properties.get(key), list):
                    # Merge lists
                    signature.properties[key] = list(set(signature.properties[key] + value))
        
        # Add source document
        if new_entity.get('foundIn'):
            signature.source_documents.add(new_entity['foundIn'])
        
        # Update confidence (weighted average)
        signature.confidence = (signature.confidence + confidence) / 2
    
    def add_entity(self, entity: Dict) -> str:
        """Add entity with deduplication"""
        # Find potential matches
        matches = self.find_matches(entity)
        
        if matches and matches[0][1] >= self.similarity_threshold:
            # Merge with best match
            canonical_id = matches[0][0]
            self.merge_entities(canonical_id, entity, matches[0][1])
            return canonical_id
        else:
            # Create new canonical entity
            canonical_id = self.generate_canonical_id(
                entity.get('@type', 'Unknown'),
                entity.get('name', 'unnamed')
            )
            
            signature = EntitySignature(
                canonical_name=entity.get('name', ''),
                entity_type=entity.get('@type', ''),
                aliases=set(),
                properties={k: v for k, v in entity.items() 
                          if k not in ['@id', '@type', 'name']},
                source_documents={entity.get('foundIn', '')} if entity.get('foundIn') else set()
            )
            
            self.entity_registry[canonical_id] = signature
            
            # Update indices
            normalized = self.normalize_name(signature.canonical_name)
            self.name_index[normalized].add(canonical_id)
            self.type_index[signature.entity_type].add(canonical_id)
            
            return canonical_id
    
    def resolve_coreferences(self, entities: List[Dict]) -> nx.Graph:
        """
        Build coreference graph for entity resolution
        Uses graph components to find entity clusters
        """
        G = nx.Graph()
        
        # Add nodes for each entity
        for i, entity in enumerate(entities):
            G.add_node(i, **entity)
        
        # Add edges for potential coreferences
        for i in range(len(entities)):
            for j in range(i + 1, len(entities)):
                entity1 = entities[i]
                entity2 = entities[j]
                
                # Skip different types
                if entity1.get('@type') != entity2.get('@type'):
                    continue
                
                # Calculate similarity
                similarity = self.calculate_similarity(
                    entity1.get('name', ''),
                    entity2.get('name', '')
                )
                
                # Add edge if similar enough
                if similarity >= self.similarity_threshold:
                    G.add_edge(i, j, weight=similarity)
        
        return G
    
    def get_statistics(self) -> Dict:
        """Get deduplication statistics"""
        total_entities = len(self.entity_registry)
        total_aliases = sum(len(sig.aliases) for sig in self.entity_registry.values())
        total_documents = len(set().union(*[sig.source_documents for sig in self.entity_registry.values()]))
        
        type_distribution = defaultdict(int)
        for sig in self.entity_registry.values():
            type_distribution[sig.entity_type] += 1
        
        return {
            'total_canonical_entities': total_entities,
            'total_aliases': total_aliases,
            'total_source_documents': total_documents,
            'average_confidence': np.mean([sig.confidence for sig in self.entity_registry.values()]) if total_entities > 0 else 0,
            'type_distribution': dict(type_distribution),
            'deduplication_ratio': total_aliases / max(total_entities, 1)
        }
    
    def export_canonical_entities(self) -> List[Dict]:
        """Export deduplicated canonical entities"""
        canonical_entities = []
        
        for canonical_id, signature in self.entity_registry.items():
            entity = {
                '@id': canonical_id,
                '@type': signature.entity_type,
                'name': signature.canonical_name,
                'aliases': list(signature.aliases),
                'confidence': signature.confidence,
                'source_documents': list(signature.source_documents),
                **signature.properties
            }
            canonical_entities.append(entity)
        
        return canonical_entities


class RelationshipDeduplicator:
    """Deduplicate relationships between entities"""
    
    def __init__(self):
        self.relationships = {}  # (subject, predicate, object) -> properties
        
    def normalize_relationship(self, subject: str, predicate: str, obj: str) -> Tuple[str, str, str]:
        """Normalize relationship triple"""
        # Normalize predicate variations
        predicate_map = {
            'supports': 'supports',
            'support': 'supports',
            'evidenceFor': 'supports',
            'opposes': 'opposes',
            'oppose': 'opposes',
            'contradicts': 'opposes',
            'addresses': 'addresses',
            'address': 'addresses',
            'answers': 'addresses'
        }
        
        normalized_predicate = predicate_map.get(predicate.lower(), predicate.lower())
        return (subject, normalized_predicate, obj)
    
    def add_relationship(self, subject: str, predicate: str, obj: str, properties: Dict = None):
        """Add relationship with deduplication"""
        triple = self.normalize_relationship(subject, predicate, obj)
        
        if triple not in self.relationships:
            self.relationships[triple] = properties or {}
        else:
            # Merge properties
            if properties:
                for key, value in properties.items():
                    if key not in self.relationships[triple]:
                        self.relationships[triple][key] = value
    
    def get_relationships(self) -> List[Dict]:
        """Get deduplicated relationships"""
        return [
            {
                'subject': subj,
                'predicate': pred,
                'object': obj,
                **props
            }
            for (subj, pred, obj), props in self.relationships.items()
        ]


# Example usage
if __name__ == "__main__":
    # Create deduplicator
    dedup = EntityDeduplicator(similarity_threshold=0.85)
    
    # Example entities that should be merged
    entities = [
        {
            '@type': 'regen:Agent',
            'name': 'Regen Network',
            'website': 'https://regen.network',
            'foundIn': 'doc1.md'
        },
        {
            '@type': 'regen:Agent', 
            'name': 'Regen Network Inc.',
            'email': 'info@regen.network',
            'foundIn': 'doc2.md'
        },
        {
            '@type': 'regen:Agent',
            'name': 'REGEN NETWORK',
            'description': 'Ecological data platform',
            'foundIn': 'doc3.md'
        }
    ]
    
    # Process entities
    canonical_ids = []
    for entity in entities:
        canonical_id = dedup.add_entity(entity)
        canonical_ids.append(canonical_id)
        print(f"Entity '{entity['name']}' -> {canonical_id}")
    
    # Check if they were merged
    unique_ids = len(set(canonical_ids))
    print(f"\n{len(entities)} entities reduced to {unique_ids} canonical entities")
    
    # Get statistics
    stats = dedup.get_statistics()
    print(f"\nDeduplication Statistics:")
    for key, value in stats.items():
        print(f"  {key}: {value}")
    
    # Export canonical entities
    canonical = dedup.export_canonical_entities()
    for entity in canonical:
        print(f"\nCanonical Entity: {entity['name']}")
        if entity['aliases']:
            print(f"  Aliases: {', '.join(entity['aliases'])}")
        print(f"  Sources: {', '.join(entity['source_documents'])}")