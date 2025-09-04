#!/usr/bin/env python3
"""
Production processing with entity deduplication
Processes all documents and builds deduplicated knowledge graph
"""

import asyncio
import json
from pathlib import Path
from datetime import datetime, timezone
import sys
sys.path.append('/Users/darrenzal/koi-research')

from process_all_documents_mistral import ProductionMetabolicProcessor
from entity_deduplication_system import EntityDeduplicator, RelationshipDeduplicator

class DeduplicatingProcessor(ProductionMetabolicProcessor):
    """Enhanced processor with deduplication"""
    
    def __init__(self, model: str = "mistral:7b"):
        super().__init__(model)
        self.entity_dedup = EntityDeduplicator(similarity_threshold=0.85)
        self.relation_dedup = RelationshipDeduplicator()
        self.entity_mapping = {}  # original_id -> canonical_id
        
    async def process_with_deduplication(self, directory: Path):
        """Process documents with entity deduplication"""
        # First, process all documents
        await self.process_directory(directory)
        
        print("\n🔄 Starting entity deduplication...")
        
        # Deduplicate all extracted entities
        for doc_result in self.processed_entities:
            if doc_result and 'entities' in doc_result:
                for entity in doc_result['entities']:
                    original_id = entity.get('@id', '')
                    canonical_id = self.entity_dedup.add_entity(entity)
                    self.entity_mapping[original_id] = canonical_id
                    
                    # Process relationships if present
                    if 'relationships' in entity:
                        for rel in entity['relationships']:
                            if isinstance(rel, dict):
                                self.relation_dedup.add_relationship(
                                    canonical_id,
                                    rel.get('type', 'related'),
                                    rel.get('target', ''),
                                    {'source': entity.get('foundIn')}
                                )
        
        # Get deduplication statistics
        stats = self.entity_dedup.get_statistics()
        
        print("\n📊 Deduplication Results:")
        print(f"  Original entities: {self.stats.entities_extracted}")
        print(f"  Canonical entities: {stats['total_canonical_entities']}")
        print(f"  Reduction: {100 * (1 - stats['total_canonical_entities'] / max(self.stats.entities_extracted, 1)):.1f}%")
        print(f"  Average confidence: {stats['average_confidence']:.2f}")
        
        print("\n📈 Entity Type Distribution:")
        for entity_type, count in sorted(stats['type_distribution'].items(), 
                                        key=lambda x: x[1], reverse=True)[:10]:
            print(f"    {entity_type}: {count}")
    
    def save_deduplicated_results(self, output_path: Path):
        """Save deduplicated entities and relationships"""
        canonical_entities = self.entity_dedup.export_canonical_entities()
        canonical_relationships = self.relation_dedup.get_relationships()
        
        output = {
            "metadata": {
                "processing_date": datetime.now(tz=timezone.utc).isoformat(),
                "model": self.model,
                "total_documents": self.stats.total_documents,
                "processed_documents": self.stats.processed_documents,
                "original_entities": self.stats.entities_extracted,
                "canonical_entities": len(canonical_entities),
                "canonical_relationships": len(canonical_relationships),
                "deduplication_ratio": 1 - (len(canonical_entities) / max(self.stats.entities_extracted, 1))
            },
            "canonical_entities": canonical_entities,
            "relationships": canonical_relationships,
            "entity_mapping": self.entity_mapping
        }
        
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"✅ Deduplicated results saved to {output_path}")
    
    def generate_neo4j_import(self, output_path: Path):
        """Generate Neo4j import statements for deduplicated entities"""
        canonical_entities = self.entity_dedup.export_canonical_entities()
        canonical_relationships = self.relation_dedup.get_relationships()
        
        with open(output_path, 'w') as f:
            f.write("// Neo4j Import Statements for Deduplicated KOI Knowledge Graph\n\n")
            
            # Create constraints
            f.write("// Create constraints for unique IDs\n")
            f.write("CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE;\n\n")
            
            # Create entities
            f.write("// Create canonical entities\n")
            for entity in canonical_entities:
                entity_type = entity['@type'].split(':')[-1]
                props = {
                    'id': entity['@id'],
                    'name': entity['name'],
                    'confidence': entity['confidence']
                }
                
                if entity.get('aliases'):
                    props['aliases'] = entity['aliases']
                if entity.get('alignsWith'):
                    props['alignsWith'] = entity['alignsWith']
                if entity.get('description'):
                    props['description'] = entity['description']
                
                props_str = ', '.join([f"{k}: {json.dumps(v)}" for k, v in props.items()])
                f.write(f"CREATE (:{entity_type}:Entity {{{props_str}}});\n")
            
            f.write("\n// Create relationships\n")
            for rel in canonical_relationships:
                f.write(f"MATCH (s:Entity {{id: '{rel['subject']}'}}), ")
                f.write(f"(o:Entity {{id: '{rel['object']}'}}) ")
                f.write(f"CREATE (s)-[:{rel['predicate'].upper()}]->(o);\n")
        
        print(f"✅ Neo4j import statements saved to {output_path}")


async def main():
    """Main processing with deduplication"""
    print("🌿 KOI Production Processing with Entity Deduplication")
    print("=" * 60)
    
    # Initialize processor with deduplication
    processor = DeduplicatingProcessor(model="mistral:7b")
    
    # Process documents
    data_dir = Path("/Users/darrenzal/GAIA/data")
    
    print("\n📂 Processing documents with entity extraction...")
    await processor.process_with_deduplication(data_dir)
    
    # Save results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Save deduplicated entities
    dedup_output = Path(f"/Users/darrenzal/koi-research/deduplicated-entities-{timestamp}.json")
    processor.save_deduplicated_results(dedup_output)
    
    # Generate Neo4j import
    neo4j_output = Path(f"/Users/darrenzal/koi-research/neo4j-import-{timestamp}.cypher")
    processor.generate_neo4j_import(neo4j_output)
    
    print("\n" + "=" * 60)
    print("✅ Processing complete with deduplication!")
    print(f"📁 Deduplicated entities: {dedup_output}")
    print(f"📁 Neo4j import: {neo4j_output}")
    print("\nNext steps:")
    print("1. Review deduplicated entities for quality")
    print("2. Import into Neo4j using the generated Cypher script")
    print("3. Build graph queries for knowledge retrieval")


if __name__ == "__main__":
    asyncio.run(main())