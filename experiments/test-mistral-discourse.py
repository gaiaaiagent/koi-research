#!/usr/bin/env python3
"""
Test Mistral 7B for discourse extraction
"""

import asyncio
import json
from pathlib import Path
import sys
sys.path.append('/Users/darrenzal/koi-research')

# Modify the processor to use Mistral
from process_documents_discourse import DiscourseMetabolicProcessor

async def test_mistral_extraction():
    """Test Mistral 7B on documents with discourse elements"""
    print("🔬 Testing Mistral 7B for Discourse Extraction")
    print("=" * 60)
    
    # Initialize processor with Mistral
    processor = DiscourseMetabolicProcessor(
        model="mistral:7b",  # Use Mistral instead of DeepSeek
        use_llm=True
    )
    
    # Process test documents
    test_dir = Path("/Users/darrenzal/koi-research/test-documents")
    
    print("\n📂 Processing test documents with Mistral 7B...")
    print("Documents:")
    for f in test_dir.glob("*.md"):
        print(f"  - {f.name}")
    
    await processor.process_directory(
        test_dir,
        limit=10,
        exclude_twitter=False
    )
    
    # Print summary
    processor.print_summary()
    
    # Save results
    output_path = Path("/Users/darrenzal/koi-research/mistral-discourse-results.json")
    processor.save_results(output_path)
    
    # Analyze results
    print("\n📊 Discourse Analysis with Mistral 7B:")
    print("-" * 60)
    
    for doc in processor.processed_entities:
        if doc and 'entities' in doc:
            filename = doc['metadata']['filename']
            entities = doc.get('entities', [])
            
            print(f"\n📄 {filename}:")
            print(f"   Total entities: {len(entities)}")
            
            # Show entity types extracted
            entity_types = {}
            for entity in entities:
                etype = entity.get('@type', 'Unknown').split(':')[-1]
                entity_types[etype] = entity_types.get(etype, 0) + 1
            
            if entity_types:
                print("   Entity types found:")
                for etype, count in entity_types.items():
                    print(f"     - {etype}: {count}")
            
            # Show sample entities with discourse roles
            discourse_entities = [e for e in entities 
                                 if e.get('discourseRole') or 
                                 e.get('@type', '').endswith(
                                     ('Question', 'Hypothesis', 'Claim', 'Evidence', 
                                      'Result', 'Conclusion', 'Theory', 'Experiment', 'Source'))]
            
            if discourse_entities:
                print("   Discourse elements:")
                for entity in discourse_entities[:3]:
                    print(f"     - {entity.get('@type')}: {entity.get('name', '')[:50]}")
                    if entity.get('relationships'):
                        print(f"       Relations: {entity.get('relationships')}")
    
    print("\n" + "=" * 60)
    
    # Validation
    print("🎯 Validation Results:")
    
    success_count = 0
    for doc in processor.processed_entities:
        if doc:
            filename = doc['metadata']['filename']
            entities = doc.get('entities', [])
            
            if 'scientific' in filename:
                has_science = any(
                    e.get('@type', '').endswith(('Hypothesis', 'Experiment', 'Result', 'Conclusion', 'Evidence'))
                    or e.get('discourseRole') in ['Question', 'Evidence', 'Claim']
                    for e in entities
                )
                print(f"   Scientific paper: {'✅' if has_science else '❌'} discourse elements detected")
                if has_science:
                    success_count += 1
                    
            elif 'governance' in filename:
                has_governance = any(
                    e.get('@type', '').endswith(('GovernanceAct', 'Claim', 'Question'))
                    or 'govern' in str(e.get('alignsWith', [])).lower()
                    for e in entities
                )
                print(f"   Governance proposal: {'✅' if has_governance else '❌'} governance elements detected")
                if has_governance:
                    success_count += 1
                    
            elif 'readme' in filename:
                # Simple readme should mostly be SemanticAsset
                semantic_count = sum(1 for e in entities if e.get('@type', '').endswith('SemanticAsset'))
                is_simple = semantic_count > 0 and len(entities) <= 3
                print(f"   Simple README: {'✅' if is_simple else '❌'} minimal extraction")
                if is_simple:
                    success_count += 1
    
    print(f"\n📈 Success Rate: {success_count}/3 documents correctly analyzed")
    
    if processor.stats.discourse_elements > 0:
        print(f"✅ Mistral successfully extracted {processor.stats.discourse_elements} discourse elements!")
    else:
        print("⚠️ Mistral didn't extract discourse elements - may need prompt adjustments")
    
    print(f"\n💾 Results saved to {output_path}")

if __name__ == "__main__":
    asyncio.run(test_mistral_extraction())