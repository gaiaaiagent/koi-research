#!/usr/bin/env python3
"""
Provenance-Aware Entity Resolution System
Tracks complete history of entity observations and transformations
"""

import hashlib
import json
from typing import Dict, List, Set, Optional, Tuple
from datetime import datetime, timezone
from dataclasses import dataclass, field
import uuid

@dataclass
class EntityObservation:
    """Single observation of an entity in a document"""
    observation_id: str  # Unique ID for this observation
    entity_type: str
    name: str
    properties: Dict
    source_document: str
    source_cid: str  # Content ID of source document
    extraction_timestamp: str
    extraction_method: str
    position: Dict  # Where in document (line, offset, etc)
    confidence: float = 1.0

@dataclass
class EntityResolution:
    """Records the resolution/linking of multiple observations to canonical entity"""
    resolution_id: str
    canonical_id: str
    observation_ids: List[str]
    resolution_method: str
    resolution_confidence: float
    resolution_timestamp: str
    resolution_evidence: Dict  # Why these were linked

@dataclass 
class CanonicalEntity:
    """The resolved canonical entity with full provenance"""
    canonical_id: str
    primary_name: str
    entity_type: str
    all_names: Set[str]
    merged_properties: Dict
    observations: List[EntityObservation]
    resolutions: List[EntityResolution]
    created_at: str
    last_updated: str

class ProvenanceTracker:
    """
    Complete Content-Addressable Transformation tracking for entity resolution
    Every step is recorded and can be audited
    """
    
    def __init__(self):
        # Stores for complete provenance
        self.observations = {}  # observation_id -> EntityObservation
        self.resolutions = {}   # resolution_id -> EntityResolution
        self.canonical = {}     # canonical_id -> CanonicalEntity
        
        # Indices for efficient lookup
        self.name_to_observations = {}  # normalized_name -> [observation_ids]
        self.doc_to_observations = {}   # doc_path -> [observation_ids]
        self.canonical_to_observations = {}  # canonical_id -> [observation_ids]
        
        # CAT tracking
        self.transformations = []  # List of all transformations
        
    def generate_cid(self, content: str) -> str:
        """Generate content ID"""
        hash_obj = hashlib.sha256(content.encode())
        return f"cid:sha256:{hash_obj.hexdigest()[:16]}"
    
    def generate_rid(self, resource_type: str, identifier: str) -> str:
        """Generate resource ID"""
        return f"orn:regen.{resource_type}:{identifier}"
    
    def record_observation(self, entity: Dict, source_doc: str, source_cid: str, 
                          position: Dict = None, method: str = "mistral:7b") -> str:
        """
        Record a single entity observation from a document
        This is the raw extraction, before any deduplication
        """
        observation_id = f"obs:{uuid.uuid4().hex[:12]}"
        
        observation = EntityObservation(
            observation_id=observation_id,
            entity_type=entity.get('@type', 'Unknown'),
            name=entity.get('name', ''),
            properties={k: v for k, v in entity.items() 
                       if k not in ['@type', 'name', '@id']},
            source_document=source_doc,
            source_cid=source_cid,
            extraction_timestamp=datetime.now(tz=timezone.utc).isoformat(),
            extraction_method=method,
            position=position or {},
            confidence=entity.get('confidence', 1.0)
        )
        
        self.observations[observation_id] = observation
        
        # Update indices
        normalized = self.normalize_name(entity.get('name', ''))
        if normalized not in self.name_to_observations:
            self.name_to_observations[normalized] = []
        self.name_to_observations[normalized].append(observation_id)
        
        if source_doc not in self.doc_to_observations:
            self.doc_to_observations[source_doc] = []
        self.doc_to_observations[source_doc].append(observation_id)
        
        # Record extraction transformation (CAT)
        self.record_transformation({
            "@type": "regen:Transformation",
            "@id": self.generate_rid("transform", f"extract_{observation_id}"),
            "process": "Extract",
            "fromState": source_cid,
            "toState": observation_id,
            "method": method,
            "timestamp": observation.extraction_timestamp,
            "confidence": observation.confidence
        })
        
        return observation_id
    
    def normalize_name(self, name: str) -> str:
        """Normalize for matching"""
        return name.lower().strip().replace('.', '').replace(',', '')
    
    def find_matching_canonical(self, observation_id: str, threshold: float = 0.85) -> Optional[str]:
        """
        Find if this observation matches an existing canonical entity
        Returns canonical_id if match found, None otherwise
        """
        observation = self.observations[observation_id]
        normalized = self.normalize_name(observation.name)
        
        # Check exact matches first
        for canonical_id, canonical in self.canonical.items():
            if observation.entity_type != canonical.entity_type:
                continue
                
            # Check all known names for this canonical entity
            for name in canonical.all_names:
                if self.normalize_name(name) == normalized:
                    return canonical_id
        
        # TODO: Add fuzzy matching, property matching, etc.
        return None
    
    def create_canonical_entity(self, observation_ids: List[str], 
                               resolution_method: str = "exact_match") -> str:
        """
        Create a new canonical entity from observations
        OR add observations to existing canonical entity
        """
        if not observation_ids:
            raise ValueError("Need at least one observation to create canonical entity")
        
        # Check if any observation already has a canonical entity
        existing_canonical = None
        for obs_id in observation_ids:
            match = self.find_matching_canonical(obs_id)
            if match:
                existing_canonical = match
                break
        
        if existing_canonical:
            # Add to existing canonical entity
            canonical = self.canonical[existing_canonical]
            canonical_id = existing_canonical
        else:
            # Create new canonical entity
            canonical_id = f"entity:{uuid.uuid4().hex[:12]}"
            first_obs = self.observations[observation_ids[0]]
            
            canonical = CanonicalEntity(
                canonical_id=canonical_id,
                primary_name=first_obs.name,
                entity_type=first_obs.entity_type,
                all_names={first_obs.name},
                merged_properties={},
                observations=[],
                resolutions=[],
                created_at=datetime.now(tz=timezone.utc).isoformat(),
                last_updated=datetime.now(tz=timezone.utc).isoformat()
            )
            self.canonical[canonical_id] = canonical
        
        # Create resolution record
        resolution_id = f"res:{uuid.uuid4().hex[:12]}"
        resolution = EntityResolution(
            resolution_id=resolution_id,
            canonical_id=canonical_id,
            observation_ids=observation_ids,
            resolution_method=resolution_method,
            resolution_confidence=0.95 if resolution_method == "exact_match" else 0.8,
            resolution_timestamp=datetime.now(tz=timezone.utc).isoformat(),
            resolution_evidence={
                "method": resolution_method,
                "matched_on": "name" if resolution_method == "exact_match" else "similarity"
            }
        )
        self.resolutions[resolution_id] = resolution
        
        # Add observations to canonical entity
        for obs_id in observation_ids:
            obs = self.observations[obs_id]
            canonical.observations.append(obs)
            canonical.all_names.add(obs.name)
            
            # Merge properties
            for key, value in obs.properties.items():
                if key not in canonical.merged_properties:
                    canonical.merged_properties[key] = value
                elif isinstance(value, list) and isinstance(canonical.merged_properties[key], list):
                    canonical.merged_properties[key] = list(set(canonical.merged_properties[key] + value))
            
            # Update index
            if canonical_id not in self.canonical_to_observations:
                self.canonical_to_observations[canonical_id] = []
            self.canonical_to_observations[canonical_id].append(obs_id)
        
        canonical.resolutions.append(resolution)
        canonical.last_updated = datetime.now(tz=timezone.utc).isoformat()
        
        # Record resolution transformation (CAT)
        self.record_transformation({
            "@type": "regen:Transformation",
            "@id": self.generate_rid("transform", f"resolve_{resolution_id}"),
            "process": "Resolve",
            "fromState": observation_ids,
            "toState": canonical_id,
            "method": resolution_method,
            "timestamp": resolution.resolution_timestamp,
            "confidence": resolution.resolution_confidence,
            "evidence": resolution.resolution_evidence
        })
        
        return canonical_id
    
    def record_transformation(self, transformation: Dict):
        """Record a Content-Addressable Transformation"""
        # Add CID for the transformation itself
        transformation['cid'] = self.generate_cid(json.dumps(transformation, sort_keys=True))
        self.transformations.append(transformation)
    
    def get_entity_provenance(self, canonical_id: str) -> Dict:
        """
        Get complete provenance for a canonical entity
        Shows all observations, sources, and transformations
        """
        if canonical_id not in self.canonical:
            return None
        
        canonical = self.canonical[canonical_id]
        
        provenance = {
            "@context": {
                "regen": "https://regen.network/ontology#",
                "prov": "http://www.w3.org/ns/prov#"
            },
            "@type": "regen:EntityProvenance",
            "@id": canonical_id,
            "canonical": {
                "name": canonical.primary_name,
                "type": canonical.entity_type,
                "properties": canonical.merged_properties,
                "aliases": list(canonical.all_names)
            },
            "observations": [
                {
                    "@id": obs.observation_id,
                    "name": obs.name,
                    "source": obs.source_document,
                    "source_cid": obs.source_cid,
                    "timestamp": obs.extraction_timestamp,
                    "method": obs.extraction_method,
                    "position": obs.position,
                    "confidence": obs.confidence
                }
                for obs in canonical.observations
            ],
            "resolutions": [
                {
                    "@id": res.resolution_id,
                    "method": res.resolution_method,
                    "timestamp": res.resolution_timestamp,
                    "confidence": res.resolution_confidence,
                    "linked_observations": res.observation_ids,
                    "evidence": res.resolution_evidence
                }
                for res in canonical.resolutions
            ],
            "transformations": [
                t for t in self.transformations 
                if canonical_id in str(t.get('toState', ''))
                or any(obs_id in str(t.get('fromState', '')) 
                      for obs_id in self.canonical_to_observations.get(canonical_id, []))
            ],
            "statistics": {
                "total_observations": len(canonical.observations),
                "unique_sources": len(set(obs.source_document for obs in canonical.observations)),
                "name_variations": len(canonical.all_names),
                "created_at": canonical.created_at,
                "last_updated": canonical.last_updated
            }
        }
        
        return provenance
    
    def export_provenance_graph(self) -> Dict:
        """
        Export complete provenance graph with all entities and transformations
        """
        return {
            "@context": {
                "regen": "https://regen.network/ontology#",
                "prov": "http://www.w3.org/ns/prov#",
                "koi": "https://regen.network/koi#"
            },
            "metadata": {
                "generated_at": datetime.now(tz=timezone.utc).isoformat(),
                "total_observations": len(self.observations),
                "total_resolutions": len(self.resolutions),
                "total_canonical_entities": len(self.canonical),
                "total_transformations": len(self.transformations)
            },
            "canonical_entities": [
                {
                    "@id": canonical_id,
                    "primary_name": entity.primary_name,
                    "type": entity.entity_type,
                    "aliases": list(entity.all_names),
                    "properties": entity.merged_properties,
                    "observation_count": len(entity.observations),
                    "source_count": len(set(obs.source_document for obs in entity.observations))
                }
                for canonical_id, entity in self.canonical.items()
            ],
            "transformations": self.transformations,
            "provenance_links": {
                canonical_id: self.get_entity_provenance(canonical_id)
                for canonical_id in self.canonical.keys()
            }
        }


# Example usage
if __name__ == "__main__":
    tracker = ProvenanceTracker()
    
    # Simulate processing multiple documents
    docs = [
        {
            "path": "data/notion/page1.md",
            "cid": "cid:sha256:abc123",
            "entities": [
                {"@type": "regen:Agent", "name": "Regen Network", "website": "https://regen.network"},
                {"@type": "regen:EcologicalAsset", "name": "Carbon Credits", "amount": "1000"}
            ]
        },
        {
            "path": "data/discourse/thread2.json", 
            "cid": "cid:sha256:def456",
            "entities": [
                {"@type": "regen:Agent", "name": "Regen Network Inc.", "email": "info@regen.network"},
                {"@type": "regen:GovernanceAct", "name": "Proposal #23", "status": "passed"}
            ]
        },
        {
            "path": "data/github/readme.md",
            "cid": "cid:sha256:ghi789",
            "entities": [
                {"@type": "regen:Agent", "name": "REGEN NETWORK", "description": "Ecological platform"}
            ]
        }
    ]
    
    print("📊 Processing documents with provenance tracking...\n")
    
    all_observations = []
    for doc in docs:
        print(f"Processing: {doc['path']}")
        for entity in doc['entities']:
            obs_id = tracker.record_observation(
                entity, 
                doc['path'], 
                doc['cid'],
                {"file": doc['path'], "index": doc['entities'].index(entity)}
            )
            all_observations.append((obs_id, entity['name']))
            print(f"  Recorded: {entity['name']} -> {obs_id}")
    
    print("\n🔄 Performing entity resolution...")
    
    # Group observations by potential matches
    regen_observations = [obs_id for obs_id, name in all_observations 
                         if 'regen network' in name.lower()]
    
    if regen_observations:
        canonical_id = tracker.create_canonical_entity(regen_observations, "exact_match")
        print(f"  Created canonical entity: {canonical_id}")
        print(f"  Merged {len(regen_observations)} observations")
    
    # Get provenance for the canonical entity
    print("\n📜 Entity Provenance:")
    provenance = tracker.get_entity_provenance(canonical_id)
    
    print(f"\nCanonical Entity: {provenance['canonical']['name']}")
    print(f"  Type: {provenance['canonical']['type']}")
    print(f"  Aliases: {', '.join(provenance['canonical']['aliases'])}")
    print(f"  Total observations: {provenance['statistics']['total_observations']}")
    print(f"  Unique sources: {provenance['statistics']['unique_sources']}")
    
    print("\n  Source History:")
    for obs in provenance['observations']:
        print(f"    - {obs['source']}: '{obs['name']}' (confidence: {obs['confidence']})")
    
    print("\n  Transformations (CAT):")
    for trans in provenance['transformations'][:5]:
        print(f"    - {trans['process']}: {trans['@id']}")
        print(f"      From: {trans['fromState']}")
        print(f"      To: {trans['toState']}")
    
    # Export complete provenance graph
    graph = tracker.export_provenance_graph()
    
    with open('provenance-graph.json', 'w') as f:
        json.dump(graph, f, indent=2)
    
    print(f"\n✅ Complete provenance graph saved to provenance-graph.json")
    print(f"   Total canonical entities: {graph['metadata']['total_canonical_entities']}")
    print(f"   Total transformations tracked: {graph['metadata']['total_transformations']}")