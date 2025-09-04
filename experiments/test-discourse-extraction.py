#!/usr/bin/env python3
"""
Test discourse extraction on sample documents
Only extracts discourse elements that are actually present
"""

import asyncio
import json
from pathlib import Path
import sys
sys.path.append('/Users/darrenzal/koi-research')
from process_documents_discourse import DiscourseMetabolicProcessor

async def test_discourse_extraction():
    """Test extraction on documents with varying discourse content"""
    print("🔬 Testing Discourse Extraction on Sample Documents")
    print("=" * 60)
    
    # Initialize processor
    processor = DiscourseMetabolicProcessor(
        model="deepseek-coder:6.7b",
        use_llm=True
    )
    
    # Process test documents
    test_dir = Path("/Users/darrenzal/koi-research/test-documents")
    
    print("\n📂 Processing test documents with discourse awareness...")
    await processor.process_directory(
        test_dir,
        limit=10,  # Process all test docs
        exclude_twitter=False  # No twitter files here anyway
    )
    
    # Print summary
    processor.print_summary()
    
    # Save results
    output_path = Path("/Users/darrenzal/koi-research/test-discourse-results.json")
    processor.save_results(output_path)
    
    # Analyze results by document type
    print("\n📊 Discourse Analysis by Document:")
    print("-" * 60)
    
    for doc in processor.processed_entities:
        if doc and 'entities' in doc:
            filename = doc['metadata']['filename']
            total_entities = len(doc['entities'])
            
            # Count discourse types
            discourse_types = {
                'Questions': 0,
                'Claims': 0,
                'Evidence': 0,
                'Sources': 0,
                'Hypotheses': 0,
                'Experiments': 0,
                'Results': 0,
                'Conclusions': 0,
                'Theories': 0
            }
            
            for entity in doc['entities']:
                entity_type = entity.get('@type', '').split(':')[-1]
                if entity_type == 'Question':
                    discourse_types['Questions'] += 1
                elif entity_type == 'Hypothesis':
                    discourse_types['Hypotheses'] += 1
                elif entity_type == 'Claim':
                    discourse_types['Claims'] += 1
                elif entity_type == 'Conclusion':
                    discourse_types['Conclusions'] += 1
                elif entity_type == 'Theory':
                    discourse_types['Theories'] += 1
                elif entity_type == 'Evidence':
                    discourse_types['Evidence'] += 1
                elif entity_type == 'Result':
                    discourse_types['Results'] += 1
                elif entity_type == 'Experiment':
                    discourse_types['Experiments'] += 1
                elif entity_type == 'Source':
                    discourse_types['Sources'] += 1
            
            print(f"\n📄 {filename}:")
            print(f"   Total entities: {total_entities}")
            
            # Only show discourse types that were found
            found_types = {k: v for k, v in discourse_types.items() if v > 0}
            if found_types:
                print("   Discourse elements found:")
                for dtype, count in found_types.items():
                    print(f"     - {dtype}: {count}")
            else:
                print("   No discourse elements (simple document)")
            
            # Show sample entities
            for entity in doc['entities'][:2]:
                if entity.get('discourseRole') or entity.get('@type', '').split(':')[-1] in discourse_types:
                    print(f"   Sample: {entity.get('@type')}: {entity.get('name', '')[:50]}")
    
    print("\n" + "=" * 60)
    print("✅ Test complete! Results saved to test-discourse-results.json")
    
    # Check expected patterns
    print("\n🎯 Validation:")
    scientific_found = False
    governance_found = False
    simple_found = False
    
    for doc in processor.processed_entities:
        if doc:
            filename = doc['metadata']['filename']
            entities = doc.get('entities', [])
            
            if 'scientific' in filename:
                # Should have hypotheses, experiments, results, conclusions
                has_science = any(e.get('@type', '').endswith(('Hypothesis', 'Experiment', 'Result', 'Conclusion')) 
                                 for e in entities)
                scientific_found = has_science
                print(f"   Scientific paper: {'✅' if has_science else '❌'} discourse elements")
                
            elif 'governance' in filename:
                # Should have claims, governance acts
                has_governance = any(e.get('@type', '').endswith(('Claim', 'GovernanceAct', 'Question'))
                                    for e in entities)
                governance_found = has_governance
                print(f"   Governance proposal: {'✅' if has_governance else '❌'} discourse elements")
                
            elif 'readme' in filename:
                # Should be mostly SemanticAsset without discourse elements
                discourse_count = sum(1 for e in entities 
                                     if e.get('discourseRole') or 
                                     e.get('@type', '').split(':')[-1] in 
                                     ['Question', 'Claim', 'Evidence', 'Source'])
                simple_found = discourse_count == 0
                print(f"   Simple README: {'✅' if simple_found else '❌'} minimal discourse")

if __name__ == "__main__":
    asyncio.run(test_discourse_extraction())