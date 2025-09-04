#!/usr/bin/env python3
"""
Enhanced KOI Document Processor with Discourse Graph Elements
Extracts metabolic ontology + discourse graph (questions, claims, evidence, sources)
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
from dotenv import load_dotenv

# Load environment
load_dotenv('/Users/darrenzal/koi-research/.env')

@dataclass
class ProcessingStats:
    """Track processing statistics"""
    total_documents: int = 0
    processed_documents: int = 0
    failed_documents: int = 0
    entities_extracted: int = 0
    discourse_elements: int = 0
    processing_time: float = 0.0
    

class DiscourseMetabolicProcessor:
    """Process documents with metabolic + discourse graph extraction"""
    
    def __init__(self, model: str = "deepseek-coder:6.7b", use_llm: bool = True):
        self.model = model
        self.use_llm = use_llm
        self.stats = ProcessingStats()
        self.processed_entities = []
        self.client = ollama.Client()
        
        # Enhanced ontology context with discourse elements
        self.ontology_context = {
            "@context": {
                "regen": "https://regen.network/ontology#",
                "schema": "http://schema.org/",
                "prov": "http://www.w3.org/ns/prov#",
                "koi": "https://regen.network/koi#"
            }
        }
    
    def generate_rid(self, source: str, identifier: str) -> str:
        """Generate Resource Identifier"""
        return f"orn:regen.{source}:{identifier}"
    
    def generate_cid(self, content: str) -> str:
        """Generate Content Identifier"""
        hash_obj = hashlib.sha256(content.encode())
        return f"cid:sha256:{hash_obj.hexdigest()[:16]}"
    
    def detect_discourse_elements(self, content: str) -> List[str]:
        """Detect discourse element types in content"""
        elements = []
        content_lower = content.lower()
        
        # Question indicators
        if any(indicator in content_lower for indicator in 
               ["?", "how ", "what ", "why ", "when ", "where ", "who ", 
                "hypothesis", "hypothesize", "propose", "suggest", "wonder"]):
            elements.append("Question")
            if "hypothesis" in content_lower or "hypothesize" in content_lower:
                elements.append("Hypothesis")
        
        # Claim indicators
        if any(indicator in content_lower for indicator in 
               ["conclude", "conclusion", "therefore", "thus", "shows that",
                "demonstrates", "proves", "theory", "model", "framework"]):
            elements.append("Claim")
            if "conclusion" in content_lower:
                elements.append("Conclusion")
            if "theory" in content_lower or "model" in content_lower:
                elements.append("Theory")
        
        # Evidence indicators
        if any(indicator in content_lower for indicator in 
               ["data", "result", "found", "observed", "measured", "evidence",
                "study", "research", "experiment", "test", "analysis"]):
            elements.append("Evidence")
            if "result" in content_lower:
                elements.append("Result")
            if "experiment" in content_lower:
                elements.append("Experiment")
        
        # Source indicators
        if any(indicator in content_lower for indicator in 
               ["according to", "source", "reference", "citation", "paper",
                "article", "publication", "author", "researcher"]):
            elements.append("Source")
        
        return elements
    
    async def extract_entities_llm(self, content: str, metadata: Dict) -> List[Dict]:
        """Extract entities using Ollama with discourse awareness"""
        try:
            # Detect discourse elements first
            discourse_types = self.detect_discourse_elements(content)
            
            # Enhanced prompt with discourse elements
            prompt = f"""Extract entities using Regen Network's metabolic + discourse ontology:

METABOLIC TYPES:
- regen:Agent (people, organizations)  
- regen:SemanticAsset (documents, proposals)
- regen:EcologicalAsset (carbon credits, ecological resources)
- regen:GovernanceAct (votes, decisions)
- regen:MetabolicFlow (value flows)
- regen:Transformation (state changes)

DISCOURSE TYPES:
- regen:Question (inquiries, unknowns)
- regen:Hypothesis (testable predictions)
- regen:Claim (assertions, statements)
- regen:Conclusion (judgments from reasoning)
- regen:Theory (explanations, models)
- regen:Evidence (data, observations)
- regen:Result (experimental outcomes)
- regen:Experiment (tests, investigations)
- regen:Source (origins, references)

Document: {metadata.get('filename', 'Unknown')}
Detected discourse elements: {', '.join(discourse_types) if discourse_types else 'None'}
Content: {content[:2000]}

Extract ALL relevant entities. For discourse elements, include relationships:
- Evidence supports/opposes Claims
- Sources contextualize Evidence  
- Claims synthesize Evidence
- Experiments test Hypotheses
- Results validate/refute Hypotheses
- Conclusions inform Theories

Return JSON array with entities AND relationships:
[
  {{
    "@type": "regen:TYPE",
    "@id": "orn:regen.category:{metadata.get('id', 'unknown')}_N",
    "name": "Entity Name",
    "alignsWith": ["Re-Whole Value"|"Nest Caring"|"Harmonize Agency"],
    "metabolicProcess": "Anchor"|"Attest"|"Issue"|"Circulate"|"Govern"|"Retire",
    "discourseRole": "Question"|"Claim"|"Evidence"|"Source",
    "relationships": [
      {{"type": "supports"|"opposes"|"contextualizes"|"synthesizes"|"tests", "target": "entity_id"}}
    ]
  }}
]

Extract entities now. Return ONLY the JSON array:"""
            
            # Call Ollama
            response = self.client.generate(
                model=self.model,
                prompt=prompt,
                format="json",
                options={
                    "temperature": 0.2,
                    "top_p": 0.9,
                    "num_predict": 3000,  # More tokens for relationships
                    "seed": 42
                }
            )
            
            # Parse response
            result_text = response['response']
            # Clean JSON
            result_text = re.sub(r'```json\s*', '', result_text)
            result_text = re.sub(r'```\s*', '', result_text)
            
            # Find JSON array
            json_match = re.search(r'\[[\s\S]*\]', result_text)
            if json_match:
                result_text = json_match.group()
            elif not result_text.startswith('['):
                result_text = f"[{result_text}]"
            
            entities = json.loads(result_text)
            
            if isinstance(entities, dict):
                entities = [entities]
            
            # Add metadata and count discourse elements
            for i, entity in enumerate(entities):
                if isinstance(entity, dict):
                    if '@id' not in entity:
                        entity['@id'] = self.generate_rid(
                            metadata.get('source', 'document'),
                            f"{metadata.get('id', 'unknown')}_{i}"
                        )
                    entity['foundIn'] = metadata.get('path', '')
                    entity['extractedAt'] = datetime.now(tz=timezone.utc).isoformat()
                    
                    # Count discourse elements
                    if entity.get('discourseRole') or entity.get('@type', '').split(':')[1] in [
                        'Question', 'Hypothesis', 'Claim', 'Conclusion', 'Theory',
                        'Evidence', 'Result', 'Experiment', 'Source'
                    ]:
                        self.stats.discourse_elements += 1
            
            return entities
            
        except Exception as e:
            print(f"LLM extraction failed: {e}")
            return self.extract_entities_basic(content, metadata)
    
    def extract_entities_basic(self, content: str, metadata: Dict) -> List[Dict]:
        """Basic entity extraction with discourse detection (fallback)"""
        entities = []
        
        # Document as Semantic Asset
        doc_entity = {
            **self.ontology_context,
            "@type": "regen:SemanticAsset",
            "@id": self.generate_rid(metadata.get("source", "document"), metadata.get("id", "unknown")),
            "name": metadata.get("filename", "Unknown Document"),
            "content_preview": content[:500],
            "cid": self.generate_cid(content),
            "alignsWith": [],
            "metabolicProcess": "Anchor",
            "timestamp": datetime.now(tz=timezone.utc).isoformat()
        }
        
        # Detect discourse elements
        discourse_types = self.detect_discourse_elements(content)
        if discourse_types:
            doc_entity["discourseRole"] = discourse_types[0]  # Primary role
            doc_entity["discourseTypes"] = discourse_types    # All detected types
        
        # Detect essence alignments
        content_lower = content.lower()
        
        if any(word in content_lower for word in ["regenerat", "restore", "heal", "ecosystem"]):
            doc_entity["alignsWith"].append("Re-Whole Value")
        
        if any(word in content_lower for word in ["community", "collaborat", "caring", "together"]):
            doc_entity["alignsWith"].append("Nest Caring")
        
        if any(word in content_lower for word in ["govern", "coordinat", "decision", "autonomy"]):
            doc_entity["alignsWith"].append("Harmonize Agency")
        
        entities.append(doc_entity)
        
        # Extract specific discourse entities
        if "Question" in discourse_types or "?" in content:
            # Extract questions from content
            questions = re.findall(r'[^.!?]*\?', content[:1000])
            for i, question in enumerate(questions[:2]):  # First 2 questions
                entities.append({
                    **self.ontology_context,
                    "@type": "regen:Question",
                    "@id": self.generate_rid("question", f"{metadata.get('id', 'unknown')}_{i}"),
                    "name": question.strip()[:100],
                    "foundIn": doc_entity["@id"],
                    "alignsWith": doc_entity["alignsWith"]
                })
        
        if "Evidence" in discourse_types or "Result" in discourse_types:
            entities.append({
                **self.ontology_context,
                "@type": "regen:Evidence",
                "@id": self.generate_rid("evidence", metadata.get('id', 'unknown')),
                "name": f"Evidence from {metadata.get('filename', 'document')}",
                "foundIn": doc_entity["@id"],
                "alignsWith": ["Re-Whole Value"]
            })
        
        if "Claim" in discourse_types or "Conclusion" in discourse_types:
            entities.append({
                **self.ontology_context,
                "@type": "regen:Claim",
                "@id": self.generate_rid("claim", metadata.get('id', 'unknown')),
                "name": f"Claims in {metadata.get('filename', 'document')}",
                "foundIn": doc_entity["@id"],
                "alignsWith": doc_entity["alignsWith"]
            })
        
        # Count discourse elements
        self.stats.discourse_elements += sum(1 for e in entities 
                                             if e.get('@type', '').endswith(('Question', 'Claim', 'Evidence', 'Source')))
        
        return entities
    
    async def process_document(self, file_path: Path) -> Dict:
        """Process a single document"""
        import time
        start_time = time.time()
        
        try:
            # Read document
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Create metadata
            metadata = {
                "filename": file_path.name,
                "path": str(file_path),
                "id": file_path.stem,
                "source": self._identify_source(file_path),
                "size": len(content)
            }
            
            # Extract entities
            if self.use_llm:
                entities = await self.extract_entities_llm(content, metadata)
            else:
                entities = self.extract_entities_basic(content, metadata)
            
            self.stats.entities_extracted += len(entities)
            self.stats.processed_documents += 1
            
            # Track metabolic transformation
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
            print(f"Error processing {file_path}: {e}")
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
        elif "twitter" in path_str:
            return "twitter"
        elif "github" in path_str:
            return "github"
        else:
            return "document"
    
    async def process_directory(self, directory: Path, limit: Optional[int] = None, exclude_twitter: bool = True) -> None:
        """Process documents in a directory"""
        import time
        overall_start = time.time()
        
        # Find all documents
        patterns = ["*.md", "*.json", "*.txt"]
        files = []
        
        for pattern in patterns:
            found_files = list(directory.rglob(pattern))
            if exclude_twitter:
                found_files = [f for f in found_files if "twitter" not in str(f).lower()]
            files.extend(found_files)
        
        # Apply limit if specified
        if limit:
            files = files[:limit]
        
        self.stats.total_documents = len(files)
        
        print(f"📊 Processing {len(files)} documents with {self.model}")
        print(f"🔬 Discourse graph extraction enabled")
        print(f"📐 Exclude Twitter: {exclude_twitter}")
        
        # Process in batches
        batch_size = 5
        for i in range(0, len(files), batch_size):
            batch = files[i:i+batch_size]
            tasks = [self.process_document(f) for f in batch]
            results = await asyncio.gather(*tasks)
            
            # Store results
            for result in results:
                if result:
                    self.processed_entities.append(result)
            
            # Progress update
            print(f"Progress: {self.stats.processed_documents}/{self.stats.total_documents} "
                  f"(Failed: {self.stats.failed_documents}) "
                  f"Discourse elements: {self.stats.discourse_elements}")
        
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
        print("📊 PROCESSING SUMMARY")
        print("=" * 60)
        print(f"Model: {self.model}")
        print(f"Documents processed: {self.stats.processed_documents}/{self.stats.total_documents}")
        print(f"Documents failed: {self.stats.failed_documents}")
        print(f"Total entities: {self.stats.entities_extracted}")
        print(f"Discourse elements: {self.stats.discourse_elements}")
        print(f"Total time: {self.stats.processing_time:.2f} seconds")
        print(f"Avg time per doc: {self.stats.processing_time / max(self.stats.processed_documents, 1):.2f} seconds")
        
        if self.stats.entities_extracted > 0:
            print(f"Avg entities per doc: {self.stats.entities_extracted / max(self.stats.processed_documents, 1):.1f}")
            print(f"Discourse ratio: {100 * self.stats.discourse_elements / self.stats.entities_extracted:.1f}%")


async def main():
    """Main processing function"""
    print("🌿 KOI Document Processor with Discourse Graph")
    print("=" * 60)
    
    # Initialize processor with discourse extraction
    processor = DiscourseMetabolicProcessor(
        model="deepseek-coder:6.7b",
        use_llm=True
    )
    
    # Process test batch
    data_dir = Path("/Users/darrenzal/GAIA/data")
    
    print("\n📂 Processing test batch with discourse extraction...")
    await processor.process_directory(
        data_dir, 
        limit=10,  # Test with 10 documents
        exclude_twitter=True
    )
    
    # Print summary
    processor.print_summary()
    
    # Save results
    output_path = Path("/Users/darrenzal/koi-research/discourse-extraction-results.json")
    processor.save_results(output_path)
    
    # Show sample of extracted discourse elements
    if processor.processed_entities:
        print("\n📝 Sample discourse elements extracted:")
        for doc in processor.processed_entities[:3]:
            if doc and 'entities' in doc:
                discourse_entities = [e for e in doc['entities'] 
                                      if e.get('discourseRole') or 
                                      e.get('@type', '').endswith(('Question', 'Claim', 'Evidence', 'Source'))]
                if discourse_entities:
                    print(f"\n📄 {doc['metadata']['filename']}:")
                    for entity in discourse_entities[:2]:
                        print(f"   - {entity.get('@type', 'Unknown')}: {entity.get('name', 'Unknown')[:50]}")
                        if entity.get('discourseRole'):
                            print(f"     Role: {entity.get('discourseRole')}")
                        if entity.get('relationships'):
                            print(f"     Relations: {entity.get('relationships')}")
    
    print("\n" + "=" * 60)
    print("✅ Discourse extraction test complete!")


if __name__ == "__main__":
    asyncio.run(main())