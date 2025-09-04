#!/usr/bin/env python3
"""
Test deduplication on small subset
"""

import asyncio
from pathlib import Path
import sys
import json
sys.path.append('/Users/darrenzal/koi-research')

from process_all_with_deduplication import DeduplicatingProcessor

async def test_deduplication():
    """Test on first 10 documents"""
    print("🧪 Testing Deduplication System")
    print("=" * 60)
    
    processor = DeduplicatingProcessor(model="mistral:7b")
    
    # Find test documents
    data_dir = Path("/Users/darrenzal/GAIA/data")
    patterns = ["*.md", "*.json", "*.txt"]
    files = []
    
    for pattern in patterns:
        found_files = list(data_dir.rglob(pattern))
        found_files = [f for f in found_files 
                      if "twitter" not in str(f).lower() 
                      and "test-documents" not in str(f)]
        files.extend(found_files)
    
    # Process first 10 files
    files = files[:10]
    processor.stats.total_documents = len(files)
    
    print(f"📊 Processing {len(files)} documents for deduplication test")
    
    for i, file_path in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] Processing: {file_path.name}")
        result = await processor.process_document(file_path)
        
        if result:
            processor.processed_entities.append(result)
            entities = result.get('entities', [])
            
            # Add to deduplicator immediately to show dedup in action
            for entity in entities:
                original_id = entity.get('@id', '')
                canonical_id = processor.entity_dedup.add_entity(entity)
                processor.entity_mapping[original_id] = canonical_id
                
                if original_id != canonical_id:
                    print(f"  🔄 Deduplicated: {entity.get('name', '')[:30]}")
            
            print(f"  ✅ Extracted {len(entities)} entities")
    
    # Show deduplication results
    stats = processor.entity_dedup.get_statistics()
    
    print("\n" + "=" * 60)
    print("📊 Deduplication Results:")
    print(f"  Original entities: {processor.stats.entities_extracted}")
    print(f"  Canonical entities: {stats['total_canonical_entities']}")
    
    if processor.stats.entities_extracted > 0:
        reduction = 100 * (1 - stats['total_canonical_entities'] / processor.stats.entities_extracted)
        print(f"  Reduction: {reduction:.1f}%")
    
    print("\n📈 Top Entity Types:")
    for entity_type, count in sorted(stats['type_distribution'].items(), 
                                    key=lambda x: x[1], reverse=True)[:5]:
        print(f"    {entity_type}: {count}")
    
    # Show some examples of merged entities
    print("\n🔍 Examples of Deduplicated Entities:")
    canonical_entities = processor.entity_dedup.export_canonical_entities()
    
    for entity in canonical_entities[:5]:
        if entity['aliases'] or len(entity['source_documents']) > 1:
            print(f"\n  Entity: {entity['name']}")
            if entity['aliases']:
                print(f"    Aliases: {', '.join(list(entity['aliases'])[:3])}")
            print(f"    Found in {len(entity['source_documents'])} documents")
    
    # Save test results
    output_path = Path("/Users/darrenzal/koi-research/deduplication-test-results.json")
    processor.save_deduplicated_results(output_path)
    print(f"\n✅ Test results saved to {output_path}")

if __name__ == "__main__":
    asyncio.run(test_deduplication())