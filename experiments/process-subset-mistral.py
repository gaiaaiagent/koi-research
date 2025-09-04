#!/usr/bin/env python3
"""
Process a subset of documents to validate the extraction pipeline
"""

import asyncio
import json
from pathlib import Path
import sys
sys.path.append('/Users/darrenzal/koi-research')
from process_all_documents_mistral import ProductionMetabolicProcessor
from datetime import datetime

async def process_subset():
    """Process first 50 non-Twitter documents"""
    print("🌿 KOI Subset Processing with Mistral 7B")
    print("=" * 60)
    
    # Initialize processor
    processor = ProductionMetabolicProcessor(model="mistral:7b")
    
    # Find documents
    data_dir = Path("/Users/darrenzal/GAIA/data")
    patterns = ["*.md", "*.json", "*.txt"]
    files = []
    
    print("📂 Scanning for documents...")
    for pattern in patterns:
        found_files = list(data_dir.rglob(pattern))
        found_files = [f for f in found_files 
                      if "twitter" not in str(f).lower() 
                      and "test-documents" not in str(f)]
        files.extend(found_files)
    
    # Take first 50 files
    files = files[:50]
    processor.stats.total_documents = len(files)
    
    print(f"📊 Processing {len(files)} documents (subset)")
    print(f"🤖 Using Mistral 7B")
    print(f"⏱️  Estimated time: {len(files) * 12 / 60:.1f} minutes\n")
    
    # Process files
    import time
    overall_start = time.time()
    
    for i, file_path in enumerate(files, 1):
        print(f"[{i}/{len(files)}] Processing: {file_path.name[:50]}...")
        
        result = await processor.process_document(file_path)
        
        if result:
            processor.processed_entities.append(result)
            entities = result.get('entities', [])
            
            # Show what was extracted
            entity_types = {}
            discourse_count = 0
            for entity in entities:
                etype = entity.get('@type', '').split(':')[-1]
                entity_types[etype] = entity_types.get(etype, 0) + 1
                if etype in ['Question', 'Hypothesis', 'Claim', 'Evidence', 
                            'Experiment', 'Result', 'Conclusion', 'Theory']:
                    discourse_count += 1
            
            type_summary = ', '.join([f"{t}:{c}" for t, c in entity_types.items()])
            print(f"  ✅ Extracted: {type_summary}")
            if discourse_count > 0:
                print(f"  🔬 Discourse elements: {discourse_count}")
        else:
            print(f"  ❌ Failed or skipped")
        
        # Progress
        if i % 10 == 0:
            elapsed = time.time() - overall_start
            avg_time = elapsed / i
            remaining = (len(files) - i) * avg_time
            print(f"\n  Progress: {i}/{len(files)} ({100*i/len(files):.1f}%)")
            print(f"  Time remaining: {remaining/60:.1f} minutes\n")
    
    processor.stats.processing_time = time.time() - overall_start
    
    # Print summary
    processor.print_summary()
    
    # Save results
    output_path = Path("/Users/darrenzal/koi-research/subset-extraction-results.json")
    processor.save_results(output_path)
    
    # Analyze results
    print("\n📊 Entity Distribution:")
    total_by_type = {}
    for doc in processor.processed_entities:
        if doc:
            for entity in doc.get('entities', []):
                etype = entity.get('@type', '').split(':')[-1]
                total_by_type[etype] = total_by_type.get(etype, 0) + 1
    
    for etype, count in sorted(total_by_type.items(), key=lambda x: x[1], reverse=True):
        print(f"  {etype}: {count}")
    
    print("\n✅ Subset processing complete!")
    print(f"📁 Results saved to {output_path}")
    
    if processor.stats.discourse_elements > 0:
        print(f"\n🎉 Successfully extracted {processor.stats.discourse_elements} discourse elements!")
        print("Ready to process full dataset.")
    else:
        print("\n⚠️ No discourse elements extracted - documents may not contain them")

if __name__ == "__main__":
    asyncio.run(process_subset())