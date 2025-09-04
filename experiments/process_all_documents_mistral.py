#!/usr/bin/env python3
"""
Production processing of all non-Twitter documents with Mistral 7B
Extracts metabolic ontology + discourse graph elements
"""

import asyncio
import json
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import ollama
import time

@dataclass
class ProcessingStats:
    """Track processing statistics"""
    total_documents: int = 0
    processed_documents: int = 0
    failed_documents: int = 0
    entities_extracted: int = 0
    discourse_elements: int = 0
    processing_time: float = 0.0
    

class ProductionMetabolicProcessor:
    """Production processor with Mistral 7B"""
    
    def __init__(self, model: str = "mistral:7b"):
        self.model = model
        self.stats = ProcessingStats()
        self.processed_entities = []
        self.client = ollama.Client()
        
        # Metabolic + discourse ontology context
        self.ontology_context = {
            "@context": {
                "regen": "https://regen.network/ontology#",
                "schema": "http://schema.org/",
                "prov": "http://www.w3.org/ns/prov#"
            }
        }
    
    def generate_rid(self, source: str, identifier: str) -> str:
        """Generate Resource Identifier"""
        return f"orn:regen.{source}:{identifier}"
    
    def generate_cid(self, content: str) -> str:
        """Generate Content Identifier"""
        hash_obj = hashlib.sha256(content.encode())
        return f"cid:sha256:{hash_obj.hexdigest()[:16]}"
    
    async def extract_with_mistral(self, content: str, metadata: Dict) -> List[Dict]:
        """Extract entities using Mistral 7B"""
        try:
            # Optimized prompt for Mistral
            prompt = f"""Extract entities from this document using Regen Network ontology.

METABOLIC TYPES:
- regen:Agent (people, organizations)
- regen:SemanticAsset (documents, proposals)
- regen:EcologicalAsset (carbon credits, ecological resources)
- regen:GovernanceAct (votes, decisions)

DISCOURSE TYPES (if present):
- regen:Question (inquiries)
- regen:Hypothesis (testable predictions)
- regen:Claim (assertions)
- regen:Evidence (data, results)
- regen:Experiment (tests)

Document: {metadata.get('filename', 'Unknown')}
Content excerpt: {content[:1500]}

Extract relevant entities as JSON array. Include:
- @type: entity type from above
- @id: unique identifier
- name: entity name/description
- alignsWith: ["Re-Whole Value" and/or "Nest Caring" and/or "Harmonize Agency"]

Focus on substantive entities, not forcing discourse elements if not present.

JSON array:"""

            # Call Mistral
            response = self.client.generate(
                model=self.model,
                prompt=prompt,
                format="json",
                options={
                    "temperature": 0.3,
                    "num_predict": 2000,
                    "top_k": 40,
                    "top_p": 0.9
                },
                stream=False
            )
            
            # Parse response
            result_text = response['response']
            
            # Clean and extract JSON
            result_text = re.sub(r'```json\s*', '', result_text)
            result_text = re.sub(r'```\s*', '', result_text)
            
            # Try to find JSON array
            json_match = re.search(r'\[[\s\S]*\]', result_text)
            if json_match:
                result_text = json_match.group()
            elif not result_text.strip().startswith('['):
                # Try to extract object and wrap in array
                obj_match = re.search(r'\{[\s\S]*\}', result_text)
                if obj_match:
                    result_text = f"[{obj_match.group()}]"
            
            entities = json.loads(result_text)
            
            if isinstance(entities, dict):
                # Handle case where response is wrapped in object
                if 'entities' in entities:
                    entities = entities['entities']
                else:
                    entities = [entities]
            
            # Add metadata to entities
            valid_entities = []
            for i, entity in enumerate(entities):
                if isinstance(entity, dict):
                    # Ensure @type is present
                    if '@type' not in entity and 'type' in entity:
                        entity['@type'] = f"regen:{entity['type']}"
                    
                    # Generate @id if missing
                    if '@id' not in entity:
                        entity['@id'] = self.generate_rid(
                            metadata.get('source', 'document'),
                            f"{metadata.get('id', 'unknown')}_{i}"
                        )
                    
                    # Add metadata
                    entity['foundIn'] = metadata.get('path', '')
                    entity['extractedAt'] = datetime.now(tz=timezone.utc).isoformat()
                    
                    # Count discourse elements
                    entity_type = entity.get('@type', '').split(':')[-1]
                    if entity_type in ['Question', 'Hypothesis', 'Claim', 'Evidence', 
                                       'Experiment', 'Result', 'Conclusion', 'Theory']:
                        self.stats.discourse_elements += 1
                    
                    valid_entities.append(entity)
            
            return valid_entities if valid_entities else self.extract_basic(content, metadata)
            
        except Exception as e:
            print(f"  Mistral extraction failed: {e}")
            return self.extract_basic(content, metadata)
    
    def extract_basic(self, content: str, metadata: Dict) -> List[Dict]:
        """Basic fallback extraction"""
        entities = []
        
        # Always create document as SemanticAsset
        doc_entity = {
            **self.ontology_context,
            "@type": "regen:SemanticAsset",
            "@id": self.generate_rid(metadata.get("source", "document"), metadata.get("id", "unknown")),
            "name": metadata.get("filename", "Unknown Document"),
            "cid": self.generate_cid(content),
            "alignsWith": [],
            "metabolicProcess": "Anchor",
            "timestamp": datetime.now(tz=timezone.utc).isoformat()
        }
        
        # Detect alignments
        content_lower = content.lower()
        
        if any(word in content_lower for word in ["regenerat", "restore", "heal", "ecosystem"]):
            doc_entity["alignsWith"].append("Re-Whole Value")
        
        if any(word in content_lower for word in ["community", "collaborat", "caring", "together"]):
            doc_entity["alignsWith"].append("Nest Caring")
        
        if any(word in content_lower for word in ["govern", "coordinat", "decision", "autonomy"]):
            doc_entity["alignsWith"].append("Harmonize Agency")
        
        entities.append(doc_entity)
        
        # Add specific entities if detected
        if "carbon" in content_lower or "credit" in content_lower:
            entities.append({
                **self.ontology_context,
                "@type": "regen:EcologicalAsset",
                "@id": self.generate_rid("asset", f"carbon_{metadata.get('id', 'unknown')}"),
                "name": "Carbon Credit Reference",
                "foundIn": doc_entity["@id"],
                "alignsWith": ["Re-Whole Value"]
            })
        
        return entities
    
    async def process_document(self, file_path: Path) -> Dict:
        """Process a single document"""
        start_time = time.time()
        
        try:
            # Read document
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Skip very small files
            if len(content.strip()) < 50:
                return None
            
            # Create metadata
            metadata = {
                "filename": file_path.name,
                "path": str(file_path),
                "id": file_path.stem,
                "source": self._identify_source(file_path),
                "size": len(content)
            }
            
            # Extract entities with Mistral
            entities = await self.extract_with_mistral(content, metadata)
            
            self.stats.entities_extracted += len(entities)
            self.stats.processed_documents += 1
            
            # Track transformation
            transformation = {
                "@type": "regen:Transformation",
                "@id": self.generate_rid("transform", f"{metadata['id']}_extraction"),
                "fromState": metadata["path"],
                "toState": [e["@id"] for e in entities],
                "process": "Extract",
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                "processingTime": time.time() - start_time
            }
            
            return {
                "metadata": metadata,
                "entities": entities,
                "transformation": transformation
            }
            
        except Exception as e:
            print(f"  Error processing {file_path.name}: {e}")
            self.stats.failed_documents += 1
            return None
    
    def _identify_source(self, file_path: Path) -> str:
        """Identify source from file path"""
        path_str = str(file_path).lower()
        if "notion" in path_str:
            return "notion"
        elif "discourse" in path_str:
            return "discourse"
        elif "medium" in path_str:
            return "medium"
        elif "podcast" in path_str:
            return "podcast"
        elif "github" in path_str:
            return "github"
        else:
            return "document"
    
    async def process_directory(self, directory: Path) -> None:
        """Process all non-Twitter documents"""
        overall_start = time.time()
        
        # Find all documents excluding Twitter
        patterns = ["*.md", "*.json", "*.txt"]
        files = []
        
        print("📂 Scanning for documents...")
        for pattern in patterns:
            found_files = list(directory.rglob(pattern))
            # Exclude Twitter and test documents
            found_files = [f for f in found_files 
                          if "twitter" not in str(f).lower() 
                          and "test-documents" not in str(f)]
            files.extend(found_files)
        
        self.stats.total_documents = len(files)
        
        print(f"📊 Found {len(files)} non-Twitter documents to process")
        print(f"🤖 Using Mistral 7B for extraction")
        print(f"⏱️  Estimated time: {len(files) * 10 / 60:.1f} minutes\n")
        
        # Process in batches for progress tracking
        batch_size = 10
        for i in range(0, len(files), batch_size):
            batch = files[i:i+batch_size]
            batch_start = time.time()
            
            print(f"Processing batch {i//batch_size + 1}/{(len(files) + batch_size - 1)//batch_size}")
            
            # Process batch
            tasks = [self.process_document(f) for f in batch]
            results = await asyncio.gather(*tasks)
            
            # Store results
            for result in results:
                if result:
                    self.processed_entities.append(result)
            
            # Progress update
            batch_time = time.time() - batch_start
            print(f"  Batch completed in {batch_time:.1f}s")
            print(f"  Progress: {self.stats.processed_documents}/{self.stats.total_documents} "
                  f"(Failed: {self.stats.failed_documents})")
            print(f"  Entities: {self.stats.entities_extracted} "
                  f"(Discourse: {self.stats.discourse_elements})")
            
            # Estimate remaining time
            if self.stats.processed_documents > 0:
                avg_time = (time.time() - overall_start) / self.stats.processed_documents
                remaining = (self.stats.total_documents - self.stats.processed_documents) * avg_time
                print(f"  Estimated time remaining: {remaining/60:.1f} minutes\n")
        
        self.stats.processing_time = time.time() - overall_start
    
    def save_results(self, output_path: Path) -> None:
        """Save processing results"""
        output = {
            "metadata": {
                "processing_date": datetime.now(tz=timezone.utc).isoformat(),
                "model": self.model,
                "total_documents": self.stats.total_documents,
                "processed_documents": self.stats.processed_documents,
                "failed_documents": self.stats.failed_documents,
                "entities_extracted": self.stats.entities_extracted,
                "discourse_elements": self.stats.discourse_elements,
                "processing_time": self.stats.processing_time,
                "avg_time_per_doc": self.stats.processing_time / max(self.stats.processed_documents, 1)
            },
            "entities": self.processed_entities
        }
        
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"✅ Results saved to {output_path}")
    
    def print_summary(self):
        """Print processing summary"""
        print("\n" + "=" * 60)
        print("📊 FINAL PROCESSING SUMMARY")
        print("=" * 60)
        print(f"Model: {self.model}")
        print(f"Documents processed: {self.stats.processed_documents}/{self.stats.total_documents}")
        print(f"Documents failed: {self.stats.failed_documents}")
        print(f"Total entities: {self.stats.entities_extracted}")
        print(f"Discourse elements: {self.stats.discourse_elements}")
        print(f"Total time: {self.stats.processing_time/60:.1f} minutes")
        print(f"Avg time per doc: {self.stats.processing_time / max(self.stats.processed_documents, 1):.1f} seconds")
        
        if self.stats.entities_extracted > 0:
            print(f"Avg entities per doc: {self.stats.entities_extracted / max(self.stats.processed_documents, 1):.1f}")
            if self.stats.discourse_elements > 0:
                print(f"Discourse ratio: {100 * self.stats.discourse_elements / self.stats.entities_extracted:.1f}%")


async def main():
    """Main processing function"""
    print("🌿 KOI Production Document Processing with Mistral 7B")
    print("=" * 60)
    
    # Initialize processor
    processor = ProductionMetabolicProcessor(model="mistral:7b")
    
    # Process all non-Twitter documents
    data_dir = Path("/Users/darrenzal/GAIA/data")
    
    print("\n📂 Processing ALL non-Twitter documents...")
    print("This will extract both metabolic ontology and discourse elements")
    print("Press Ctrl+C to cancel\n")
    
    await asyncio.sleep(3)  # Give user time to cancel
    
    await processor.process_directory(data_dir)
    
    # Print summary
    processor.print_summary()
    
    # Save results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = Path(f"/Users/darrenzal/koi-research/production-extraction-{timestamp}.json")
    processor.save_results(output_path)
    
    # Show statistics by source
    print("\n📈 Extraction by Source:")
    source_stats = {}
    for doc in processor.processed_entities:
        if doc:
            source = doc['metadata'].get('source', 'unknown')
            if source not in source_stats:
                source_stats[source] = {'docs': 0, 'entities': 0, 'discourse': 0}
            source_stats[source]['docs'] += 1
            source_stats[source]['entities'] += len(doc.get('entities', []))
            
            # Count discourse elements
            for entity in doc.get('entities', []):
                entity_type = entity.get('@type', '').split(':')[-1]
                if entity_type in ['Question', 'Hypothesis', 'Claim', 'Evidence', 
                                  'Experiment', 'Result', 'Conclusion', 'Theory']:
                    source_stats[source]['discourse'] += 1
    
    for source, stats in source_stats.items():
        print(f"  {source}: {stats['docs']} docs, {stats['entities']} entities "
              f"({stats['discourse']} discourse elements)")
    
    print("\n" + "=" * 60)
    print("✅ Production extraction complete!")
    print(f"📁 Results: {output_path}")
    print("\nNext steps:")
    print("1. Review extracted entities for quality")
    print("2. Load into Neo4j knowledge graph")
    print("3. Create queries for discourse analysis")


if __name__ == "__main__":
    asyncio.run(main())