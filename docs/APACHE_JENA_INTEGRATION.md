# Apache Jena Integration Guide for KOI

## Overview

**UPDATE (September 26, 2025)**: Apache Jena Fuseki is **FULLY OPERATIONAL** and actively integrated with the complete KOI provenance tracking system. Jena serves as the semantic reasoning layer alongside the operational BGE pipeline, providing RDF/SPARQL capabilities for complex knowledge graph queries and provenance exploration.

**Current Deployment Status**: ✅ **ACTIVE**
- **Jena Fuseki**: Running on port 3030 with KOI dataset loaded
- **SPARQL Endpoint**: Accessible at https://regen.gaiaai.xyz/sparql/
- **RDF Data**: 326+ entities with complete provenance tracking loaded from koi-entities-production.ttl
- **Pipeline Integration**: Real-time updates from Pipeline Metadata API (port 8002)
- **Web UI Integration**: Interactive SPARQL queries via React frontend

This guide provides comprehensive instructions for the fully operational KOI-Jena integration, including the dual-database architecture with PostgreSQL for operations and Jena for semantic reasoning.

## Architecture Alignment

### Dual-Database Architecture ✅ **OPERATIONAL**

The KOI system implements a sophisticated dual-database architecture that combines the strengths of both relational and semantic database technologies:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           DUAL-DATABASE ARCHITECTURE                                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────────────────────────┐    ┌─────────────────────────────────────────┐   │
│  │         POSTGRESQL              │    │         APACHE JENA FUSEKI             │   │
│  │        (Operations)             │    │      (Semantic Reasoning)               │   │
│  │         Port 5433               │    │           Port 3030                     │   │
│  │                                 │    │                                         │   │
│  │  ✅ Real-time Operations        │    │  ✅ Semantic Queries                   │   │
│  │  • Agent memory storage         │◄──►│  • RDF triples and provenance         │   │
│  │  • BGE embeddings (1024D)       │    │  • SPARQL complex reasoning           │   │
│  │  • CAT receipts tracking        │    │  • Ontology-based inference           │   │
│  │  • Fast vector similarity       │    │  • Cross-entity relationships         │   │
│  │  • ElizaOS agent integration    │    │  • Transformation provenance          │   │
│  │                                 │    │  • Pipeline component metadata        │   │
│  │  Tables:                        │    │                                         │   │
│  │  • koi_memories                 │    │  Datasets:                             │   │
│  │  • koi_embeddings               │    │  • /koi (main knowledge graph)         │   │
│  │  • koi_receipts                 │    │  • 326+ entities with RIDs             │   │
│  │  • memories (agent access)      │    │  • Complete provenance chains          │   │
│  │                                 │    │  • Infrastructure component RIDs       │   │
│  └─────────────────────────────────┘    └─────────────────────────────────────────┘   │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              SYNCHRONIZATION LAYER                              │   │
│  │                                                                                 │   │
│  │  • Pipeline Metadata API (port 8002) coordinates both databases               │   │
│  │  • CAT receipts exported from PostgreSQL to RDF format                        │   │
│  │  • Infrastructure components synchronized with real-time status               │   │
│  │  • Provenance chains maintained in both operational and semantic formats      │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Why Apache Jena for KOI?

**Registry Framework Integration**: Direct compatibility with Regen Network's RDF-based infrastructure enables:
- **Credits as Claims**: Semantic modeling of credit lifecycles with full provenance
- **Cross-Methodology Reasoning**: Automated validation and interoperability
- **W3C Standards Compliance**: Native semantic web integration
- **Ontology Federation**: Direct integration with ENVO and environmental knowledge bases
- **Complex Provenance Queries**: SPARQL-based exploration of transformation chains
- **Infrastructure Metadata**: RDF representation of pipeline components and their relationships

## Installation & Setup

### 1. Apache Jena Installation ✅ **COMPLETE AND OPERATIONAL**

**Current Status**: Apache Jena Fuseki is running in production with the complete KOI dataset loaded.

#### Production Deployment (Current)
```bash
# Fuseki is currently running with:
# - Port 3030 exposed via nginx proxy
# - KOI dataset (/koi) loaded with 326+ entities
# - Production RDF data from koi-entities-production.ttl
# - Real-time integration with Pipeline Metadata API

# Access endpoints:
# Web UI: https://regen.gaiaai.xyz/sparql/
# SPARQL endpoint: https://regen.gaiaai.xyz/api/koi/sparql/
# Direct Fuseki: http://localhost:3030/ (internal)

# Health check
curl https://regen.gaiaai.xyz/api/koi/health/
```

#### Docker Setup (For Development)
```bash
# Start Fuseki SPARQL server
docker run -d \
  --name fuseki \
  -p 3030:3030 \
  -e ADMIN_PASSWORD=regennetwork \
  -e JVM_ARGS=-Xmx4g \
  -v $(pwd)/fuseki-data:/fuseki/databases \
  stain/jena-fuseki:latest

# Verify installation
curl http://localhost:3030/$/ping
```

#### Native Installation
```bash
# Download and extract Jena
wget https://archive.apache.org/dist/jena/binaries/apache-jena-4.9.0.tar.gz
tar -xzf apache-jena-4.9.0.tar.gz
export JENA_HOME=/path/to/apache-jena-4.9.0
export PATH=$PATH:$JENA_HOME/bin

# Download and extract Fuseki
wget https://archive.apache.org/dist/jena/binaries/apache-jena-fuseki-4.9.0.tar.gz
tar -xzf apache-jena-fuseki-4.9.0.tar.gz
```

### 2. Python Dependencies
```bash
pip install rdflib SPARQLWrapper requests beautifulsoup4
```

### 3. Dataset Creation
```bash
# Create KOI dataset in Fuseki
curl -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "dbName=koi&dbType=tdb2" \
  http://admin:regennetwork@localhost:3030/$/datasets
```

## KOI-Jena Integration

### 1. RDF Graph Setup

```python
# koi_jena_client.py
from rdflib import Graph, Namespace, Literal, URIRef
from rdflib.namespace import RDF, RDFS, OWL, XSD
from SPARQLWrapper import SPARQLWrapper, POST, GET, JSON
import json
import hashlib
from datetime import datetime

class KOIJenaClient:
    def __init__(self, fuseki_url="http://localhost:3030", dataset="koi"):
        self.fuseki_url = fuseki_url
        self.dataset = dataset
        self.sparql_endpoint = f"{fuseki_url}/{dataset}/sparql"
        self.update_endpoint = f"{fuseki_url}/{dataset}/update"
        
        # Define namespaces
        self.REGEN = Namespace("https://regen.network/ontology#")
        self.KOI = Namespace("https://regen.network/koi#")
        self.PROV = Namespace("http://www.w3.org/ns/prov#")
        
        # Initialize SPARQL wrapper
        self.sparql = SPARQLWrapper(self.sparql_endpoint)
        self.sparql_update = SPARQLWrapper(self.update_endpoint)
        self.sparql_update.method = POST
        
    def generate_rid(self, source: str, identifier: str) -> str:
        """Generate Resource Identifier"""
        return f"orn:regen.{source}:{identifier}"
    
    def generate_cid(self, content: str) -> str:
        """Generate Content Identifier"""
        hash_obj = hashlib.sha256(content.encode())
        return f"cid:sha256:{hash_obj.hexdigest()[:16]}"
```

### 2. JSON-LD to RDF Conversion

```python
def jsonld_to_rdf(self, jsonld_entities: list) -> Graph:
    """Convert KOI JSON-LD entities to RDF graph"""
    g = Graph()
    
    # Bind prefixes
    g.bind("regen", self.REGEN)
    g.bind("koi", self.KOI)
    g.bind("prov", self.PROV)
    
    for entity in jsonld_entities:
        # Parse JSON-LD into RDF
        temp_graph = Graph()
        temp_graph.parse(data=json.dumps(entity), format='json-ld')
        
        # Add to main graph
        g += temp_graph
        
        # Add KOI-specific triples
        entity_uri = URIRef(entity.get('@id'))
        
        # Add CID for content addressing
        if 'cid' in entity:
            g.add((entity_uri, self.KOI.cid, Literal(entity['cid'])))
        
        # Add provenance information
        if 'wasExtractedUsing' in entity:
            g.add((entity_uri, self.PROV.wasGeneratedBy, URIRef(entity['wasExtractedUsing'])))
        
        # Add temporal information
        if 'extractedAt' in entity:
            g.add((entity_uri, self.PROV.generatedAtTime, 
                  Literal(entity['extractedAt'], datatype=XSD.dateTime)))
    
    return g

def store_entities(self, jsonld_entities: list) -> bool:
    """Store KOI entities in Jena TDB"""
    try:
        # Convert to RDF
        graph = self.jsonld_to_rdf(jsonld_entities)
        
        # Generate SPARQL INSERT query
        insert_query = f"""
        PREFIX regen: <https://regen.network/ontology#>
        PREFIX koi: <https://regen.network/koi#>
        PREFIX prov: <http://www.w3.org/ns/prov#>
        
        INSERT DATA {{
            {graph.serialize(format='turtle')}
        }}
        """
        
        # Execute update
        self.sparql_update.setQuery(insert_query)
        self.sparql_update.query()
        
        return True
        
    except Exception as e:
        print(f"Error storing entities: {e}")
        return False
```

### 3. SPARQL Query Interface

```python
def query_entities_by_type(self, entity_type: str) -> list:
    """Query entities by ontology type"""
    query = f"""
    PREFIX regen: <https://regen.network/ontology#>
    PREFIX koi: <https://regen.network/koi#>
    
    SELECT ?entity ?name ?essence ?cid WHERE {{
        ?entity a regen:{entity_type} ;
                rdfs:label ?name ;
                regen:alignsWith ?essence ;
                koi:cid ?cid .
    }} 
    ORDER BY ?name
    """
    
    self.sparql.setQuery(query)
    self.sparql.setReturnFormat(JSON)
    results = self.sparql.query().convert()
    
    return results["results"]["bindings"]

def query_provenance_chain(self, entity_rid: str) -> dict:
    """Query complete provenance chain for an entity"""
    query = f"""
    PREFIX regen: <https://regen.network/ontology#>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX koi: <https://regen.network/koi#>
    
    SELECT ?entity ?generator ?method ?timestamp ?source_doc WHERE {{
        <{entity_rid}> prov:wasGeneratedBy ?generator ;
                       prov:generatedAtTime ?timestamp .
        
        OPTIONAL {{ ?generator regen:usedMethod ?method }}
        OPTIONAL {{ ?generator regen:processedDocument ?source_doc }}
    }}
    """
    
    self.sparql.setQuery(query)
    self.sparql.setReturnFormat(JSON)
    results = self.sparql.query().convert()
    
    return results["results"]["bindings"][0] if results["results"]["bindings"] else {}

def semantic_similarity_query(self, essence: str, threshold: float = 0.8) -> list:
    """Find entities with similar essence alignments"""
    query = f"""
    PREFIX regen: <https://regen.network/ontology#>
    
    SELECT ?entity ?name ?alignments WHERE {{
        ?entity regen:alignsWith "{essence}" ;
                rdfs:label ?name ;
                regen:alignsWith ?alignments .
    }}
    """
    
    self.sparql.setQuery(query)
    self.sparql.setReturnFormat(JSON)
    results = self.sparql.query().convert()
    
    return results["results"]["bindings"]
```

## Registry Framework Integration

### 1. Credits as Claims Modeling

```python
def model_credit_as_claim(self, credit_data: dict) -> Graph:
    """Model ecological credit using Registry Framework RDF patterns"""
    g = Graph()
    g.bind("regen", self.REGEN)
    
    # Credit as a claim
    credit_uri = URIRef(self.generate_rid("credit", credit_data["credit_id"]))
    g.add((credit_uri, RDF.type, self.REGEN.EcologicalAsset))
    g.add((credit_uri, RDF.type, self.REGEN.Claim))
    
    # Link to supporting evidence
    for evidence_id in credit_data.get("evidence", []):
        evidence_uri = URIRef(self.generate_rid("evidence", evidence_id))
        g.add((credit_uri, self.REGEN.supportedBy, evidence_uri))
        g.add((evidence_uri, RDF.type, self.REGEN.Evidence))
    
    # Methodology reference
    methodology_uri = URIRef(credit_data["methodology_uri"])
    g.add((credit_uri, self.REGEN.validatedBy, methodology_uri))
    
    return g

def query_credit_validity(self, credit_rid: str) -> bool:
    """Use OWL reasoning to validate credit claims"""
    query = f"""
    PREFIX regen: <https://regen.network/ontology#>
    
    ASK {{
        <{credit_rid}> a regen:EcologicalAsset ;
                       regen:supportedBy ?evidence ;
                       regen:validatedBy ?methodology .
        
        ?evidence a regen:Evidence ;
                  regen:hasValidationStatus "verified" .
        
        ?methodology a regen:Methodology ;
                     regen:isActive true .
    }}
    """
    
    self.sparql.setQuery(query)
    self.sparql.setReturnFormat(JSON)
    result = self.sparql.query().convert()
    
    return result["boolean"]
```

### 2. Cross-Methodology Reasoning

```python
def compare_methodologies(self, methodology1: str, methodology2: str) -> dict:
    """Compare methodologies using semantic reasoning"""
    query = f"""
    PREFIX regen: <https://regen.network/ontology#>
    
    SELECT ?commonCriteria ?differences WHERE {{
        # Find common criteria
        <{methodology1}> regen:requiresCriteria ?criteria1 .
        <{methodology2}> regen:requiresCriteria ?criteria2 .
        
        FILTER(?criteria1 = ?criteria2)
        BIND(?criteria1 AS ?commonCriteria)
        
        # Find differences (simplified)
        OPTIONAL {{
            <{methodology1}> regen:requiresCriteria ?diff1 .
            FILTER NOT EXISTS {{ <{methodology2}> regen:requiresCriteria ?diff1 }}
            BIND(?diff1 AS ?differences)
        }}
    }}
    """
    
    self.sparql.setQuery(query)
    self.sparql.setReturnFormat(JSON)
    results = self.sparql.query().convert()
    
    return {
        "common_criteria": [r["commonCriteria"]["value"] for r in results["results"]["bindings"]],
        "differences": [r["differences"]["value"] for r in results["results"]["bindings"] if "differences" in r]
    }
```

## OWL Reasoning Integration

### 1. Setting up OWL Reasoner

```python
from owlrl import DeductiveClosure, OWLRL_Semantics

def enable_owl_reasoning(self, ontology_file: str):
    """Enable OWL reasoning with ontology"""
    # Load ontology
    g = Graph()
    g.parse(ontology_file, format='turtle')
    
    # Apply OWL reasoning
    DeductiveClosure(OWLRL_Semantics).expand(g)
    
    # Upload to Fuseki with reasoning enabled
    self.store_ontology_with_reasoning(g)

def infer_missing_relationships(self) -> list:
    """Use OWL reasoning to infer missing entity relationships"""
    query = """
    PREFIX regen: <https://regen.network/ontology#>
    PREFIX owl: <http://www.w3.org/2002/07/owl#>
    
    CONSTRUCT {
        ?entity1 regen:relatedTo ?entity2 .
    }
    WHERE {
        ?entity1 regen:alignsWith ?essence .
        ?entity2 regen:alignsWith ?essence .
        
        FILTER(?entity1 != ?entity2)
        FILTER NOT EXISTS { 
            ?entity1 regen:relatedTo ?entity2 
        }
    }
    """
    
    self.sparql.setQuery(query)
    results = self.sparql.query()
    
    # Parse inferred triples
    inferred_graph = Graph()
    inferred_graph.parse(data=results.serialize(), format='turtle')
    
    return list(inferred_graph)
```

### 2. Link Prediction and Graph Completion

```python
def predict_missing_links(self, entity_rid: str) -> list:
    """Predict missing relationships using semantic similarity"""
    query = f"""
    PREFIX regen: <https://regen.network/ontology#>
    
    SELECT ?relatedEntity ?sharedConcepts (COUNT(?sharedConcepts) as ?similarity) WHERE {{
        <{entity_rid}> regen:alignsWith ?essence1 ;
                       regen:relatedToConcept ?concept1 .
        
        ?relatedEntity regen:alignsWith ?essence2 ;
                       regen:relatedToConcept ?concept2 .
        
        FILTER(?essence1 = ?essence2 || ?concept1 = ?concept2)
        FILTER(?relatedEntity != <{entity_rid}>)
        
        BIND(?concept1 AS ?sharedConcepts)
    }}
    GROUP BY ?relatedEntity ?sharedConcepts
    ORDER BY DESC(?similarity)
    LIMIT 10
    """
    
    self.sparql.setQuery(query)
    self.sparql.setReturnFormat(JSON)
    results = self.sparql.query().convert()
    
    return results["results"]["bindings"]
```

## Performance Optimization

### 1. Batch Processing

```python
def batch_insert_entities(self, entity_batches: list, batch_size: int = 1000):
    """Efficiently insert large numbers of entities"""
    for batch in [entity_batches[i:i+batch_size] for i in range(0, len(entity_batches), batch_size)]:
        # Convert batch to RDF
        batch_graph = self.jsonld_to_rdf(batch)
        
        # Single INSERT query for entire batch
        insert_query = f"""
        PREFIX regen: <https://regen.network/ontology#>
        PREFIX koi: <https://regen.network/koi#>
        
        INSERT DATA {{
            {batch_graph.serialize(format='turtle')}
        }}
        """
        
        self.sparql_update.setQuery(insert_query)
        self.sparql_update.query()
        
        print(f"Inserted batch of {len(batch)} entities")

def create_indexes(self):
    """Create indexes for common query patterns"""
    # Note: Index creation is typically done at Fuseki configuration level
    # This would be part of the TDB2 database configuration
    pass
```

### 2. Query Optimization

```python
def optimized_entity_search(self, search_term: str, limit: int = 50) -> list:
    """Optimized full-text search across entities"""
    query = f"""
    PREFIX regen: <https://regen.network/ontology#>
    PREFIX text: <http://jena.apache.org/text#>
    
    SELECT ?entity ?name ?type ?score WHERE {{
        (?entity ?score) text:query (rdfs:label "{search_term}*") .
        ?entity a ?type ;
                rdfs:label ?name .
        
        FILTER(STRSTARTS(str(?type), "https://regen.network/ontology#"))
    }}
    ORDER BY DESC(?score)
    LIMIT {limit}
    """
    
    self.sparql.setQuery(query)
    self.sparql.setReturnFormat(JSON)
    results = self.sparql.query().convert()
    
    return results["results"]["bindings"]
```

## Usage Examples

### 1. Basic KOI-Jena Workflow

```python
# Initialize client
koi_client = KOIJenaClient()

# Process KOI entities from processor
with open('production-pipeline-results.json', 'r') as f:
    koi_data = json.load(f)

# Extract entities
all_entities = []
for document in koi_data['entities']:
    all_entities.extend(document['entities'])

# Store in Jena
print(f"Storing {len(all_entities)} entities...")
success = koi_client.store_entities(all_entities)

if success:
    print("✅ Entities stored successfully")
    
    # Query by type
    agents = koi_client.query_entities_by_type("Agent")
    print(f"Found {len(agents)} agents")
    
    # Query provenance
    if agents:
        provenance = koi_client.query_provenance_chain(agents[0]["entity"]["value"])
        print(f"Provenance: {provenance}")
```

### 2. Registry Framework Integration

```python
# Model a carbon credit
credit_data = {
    "credit_id": "VCS001",
    "evidence": ["monitoring_report_001", "verification_report_001"],
    "methodology_uri": "orn:regen.methodology:vcs-soil-carbon-v1"
}

credit_graph = koi_client.model_credit_as_claim(credit_data)
koi_client.store_rdf_graph(credit_graph)

# Validate credit
is_valid = koi_client.query_credit_validity("orn:regen.credit:VCS001")
print(f"Credit valid: {is_valid}")
```

## Deployment Guide

### 1. Production Setup

```yaml
# docker-compose.yml for production
version: '3.8'

services:
  fuseki:
    image: stain/jena-fuseki:latest
    ports:
      - "3030:3030"
    environment:
      - ADMIN_PASSWORD=${FUSEKI_PASSWORD}
      - JVM_ARGS=-Xmx8g -XX:MaxDirectMemorySize=2g
      - FUSEKI_DATASET_1=koi
      - FUSEKI_DATASET_1_TYPE=tdb2
    volumes:
      - fuseki_data:/fuseki/databases
      - ./config:/fuseki/config
    restart: unless-stopped
    
  koi-processor:
    build: .
    environment:
      - FUSEKI_URL=http://fuseki:3030
      - FUSEKI_DATASET=koi
    depends_on:
      - fuseki
    restart: unless-stopped

volumes:
  fuseki_data:
```

### 2. Monitoring and Maintenance

```python
def health_check(self) -> dict:
    """Check system health and performance metrics"""
    
    # Query count
    count_query = """
    SELECT (COUNT(*) as ?totalTriples) WHERE { ?s ?p ?o }
    """
    
    self.sparql.setQuery(count_query)
    self.sparql.setReturnFormat(JSON)
    result = self.sparql.query().convert()
    
    total_triples = int(result["results"]["bindings"][0]["totalTriples"]["value"])
    
    # Entity type distribution
    type_query = """
    PREFIX regen: <https://regen.network/ontology#>
    
    SELECT ?type (COUNT(?entity) as ?count) WHERE {
        ?entity a ?type .
        FILTER(STRSTARTS(str(?type), "https://regen.network/ontology#"))
    }
    GROUP BY ?type
    ORDER BY DESC(?count)
    """
    
    self.sparql.setQuery(type_query)
    self.sparql.setReturnFormat(JSON)
    type_results = self.sparql.query().convert()
    
    return {
        "total_triples": total_triples,
        "entity_types": {
            binding["type"]["value"]: int(binding["count"]["value"]) 
            for binding in type_results["results"]["bindings"]
        },
        "status": "healthy" if total_triples > 0 else "empty"
    }
```

## Troubleshooting

### Common Issues

1. **Memory Issues**
   - Increase JVM heap size: `-Xmx8g`
   - Use TDB2 for better performance with large datasets

2. **Query Performance**
   - Enable text indexing for full-text search
   - Use LIMIT clauses for large result sets
   - Consider materialized views for complex queries

3. **RDF Format Issues**
   - Validate JSON-LD before conversion
   - Check namespace bindings
   - Ensure URIs are properly formatted

### Performance Tuning

```bash
# Fuseki configuration for high performance
export JVM_ARGS="-Xmx8g -XX:MaxDirectMemorySize=2g -XX:+UseG1GC"

# TDB2 tuning
tdb2.tdbloader --loc=/data/tdb2 --graph=default ontology.ttl
```

---

**This integration enables KOI to leverage the full power of semantic web technologies while maintaining perfect alignment with Regen Network's Registry Framework architecture.** 🌐🌱

## Current Status: Integrated with BGE Pipeline ✅ **FULLY OPERATIONAL**

**Production Architecture**: The KOI system operates with complete dual-database integration:

1. **Primary Pipeline**: KOI Event Bridge → BGE Embeddings → PostgreSQL → Agent RAG ✅ **OPERATIONAL**
2. **Semantic Layer**: Apache Jena + RDF/SPARQL for reasoning and ontological queries ✅ **OPERATIONAL**
3. **Provenance Integration**: CAT receipts synchronized between PostgreSQL and RDF ✅ **OPERATIONAL**
4. **Pipeline Metadata**: Real-time component status via RDF/SPARQL ✅ **OPERATIONAL**

### Ontology Files Integration ✅ **ACTIVE**

#### koi-ontology.ttl
The KOI ontology defines the complete infrastructure and provenance vocabulary:

```turtle
@prefix koi: <http://koi.network/ontology#> .
@prefix regen: <http://regen.network/ontology#> .
@prefix prov: <http://www.w3.org/ns/prov#> .

# Infrastructure Classes (Active in Production)
koi:Sensor a rdfs:Class ;
    rdfs:label "KOI Sensor Node" ;
    rdfs:comment "Monitors external data sources and generates KOI events" .

koi:Infrastructure a rdfs:Class ;
    rdfs:label "KOI Infrastructure Component" ;
    rdfs:comment "Core system components for processing and storage" .

koi:Pipeline a rdfs:Class ;
    rdfs:label "KOI Processing Pipeline" ;
    rdfs:comment "Complete data flow from sensors to agents" .

# Provenance Classes (Active in Production)
koi:Transformation a rdfs:Class ;
    rdfs:label "Content Transformation" ;
    rdfs:subClassOf prov:Activity ;
    rdfs:comment "Any processing step with complete CAT receipt tracking" .

koi:CATReceipt a rdfs:Class ;
    rdfs:label "Content Addressable Transformation Receipt" ;
    rdfs:subClassOf prov:Entity ;
    rdfs:comment "Complete audit trail for any transformation" .

# Active Properties (In Production Use)
koi:sensedBy rdfs:subPropertyOf prov:wasGeneratedBy .
koi:processedBy rdfs:subPropertyOf prov:wasGeneratedBy .
koi:storedIn rdfs:subPropertyOf prov:wasGeneratedBy .
koi:hasTransformation rdfs:subPropertyOf prov:wasGeneratedBy .
koi:hasComponent rdfs:range koi:Infrastructure .
koi:monitors rdfs:domain koi:Sensor .
koi:status rdfs:range ["active", "idle", "offline"] .
```

#### pipeline-metadata.ttl
Real-time pipeline structure (dynamically generated by Pipeline Metadata API):

```turtle
# Current Production Pipeline (Live Data)
<koi.pipeline:main> a koi:Pipeline ;
    koi:hasComponent <koi.sensor:github-sensor>,
                     <koi.sensor:website-sensor>,
                     <koi.sensor:discord-sensor>,
                     <koi.sensor:medium-sensor>,
                     <koi.sensor:telegram-sensor>,
                     <koi.sensor:twitter-sensor>,
                     <koi.sensor:notion-sensor>,
                     <koi.sensor:gitlab-sensor>,
                     <koi.sensor:research-retreat-papers>,
                     <koi.sensor:discourse-sensor>,
                     <koi.sensor:youtube-sensor>,
                     <koi.infrastructure:koi-coordinator>,
                     <koi.infrastructure:event-bridge-v2>,
                     <koi.infrastructure:bge-server>,
                     <koi.infrastructure:postgresql>,
                     <koi.infrastructure:apache-jena>,
                     <koi.infrastructure:mcp-server>,
                     <koi.infrastructure:pipeline-metadata-api>,
                     <koi.infrastructure:content-api> ;
    koi:status "operational" ;
    koi:lastUpdated "2025-09-26T10:30:00Z" ;
    rdfs:comment "Complete KOI pipeline with 11 sensors and 8 infrastructure components" .

# Active Sensors (Real-time Status)
<koi.sensor:github-sensor> a koi:Sensor ;
    koi:monitors "github.com/RegenNetwork/*" ;
    koi:status "active" ;
    koi:endpoint "http://localhost:8010" ;
    koi:lastSeen "2025-09-26T10:25:00Z" .

<koi.sensor:website-sensor> a koi:Sensor ;
    koi:monitors "regen.network, registry.regen.network, forum.regen.network" ;
    koi:status "active" ;
    koi:endpoint "http://localhost:8020" ;
    koi:lastSeen "2025-09-26T10:24:00Z" .

# Infrastructure Components (Live Status)
<koi.infrastructure:pipeline-metadata-api> a koi:Infrastructure ;
    koi:type "api" ;
    koi:endpoint "http://localhost:8002" ;
    koi:provides "Dynamic pipeline structure and provenance data" ;
    koi:status "active" .

<koi.infrastructure:apache-jena> a koi:Infrastructure ;
    koi:type "triplestore" ;
    koi:endpoint "http://localhost:3030/koi" ;
    koi:provides "RDF storage and SPARQL queries" ;
    koi:status "active" ;
    koi:datasetSize "326+ entities with provenance" .
```

## Next Steps

✅ **COMPLETED**: All core integration steps are now operational in production

**Current Status**:
1. ✅ **Fuseki server deployed** with complete KOI dataset
2. ✅ **Unified ontology loaded** with koi-ontology.ttl and pipeline-metadata.ttl
3. ✅ **Production entities processed** with 326+ entities in RDF format
4. ✅ **SPARQL endpoints enabled** via https://regen.gaiaai.xyz/sparql/
5. ✅ **Pipeline Metadata API** providing real-time component status
6. ✅ **Integrated with BGE pipeline** for hybrid semantic + vector search

**Future Enhancements**:
1. **Advanced Reasoning Rules**: Implement OWL reasoning for credit validation
2. **Registry Framework Federation**: Connect to external Regen Network infrastructure
3. **Real-time Synchronization**: Enhance PostgreSQL→RDF data flow automation
4. **SPARQL Query Optimization**: Implement query caching and indexing
5. **Ontology Versioning**: Track ontology evolution with complete provenance

**Access Points** ✅ **ACTIVE**:
- **SPARQL Web UI**: https://regen.gaiaai.xyz/sparql/
- **SPARQL API**: https://regen.gaiaai.xyz/api/koi/sparql/
- **Pipeline Metadata**: https://regen.gaiaai.xyz/api/koi/graph/pipeline
- **Provenance Queries**: https://regen.gaiaai.xyz/api/koi/graph/provenance/{rid}

*Fully operational semantic web deployment running alongside the BGE-based KOI pipeline!* 🚀✅