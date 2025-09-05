#!/usr/bin/env python3
"""
Load TTL data into Apache Jena Fuseki triplestore
"""

import requests
import sys
from pathlib import Path
from rdflib import Graph, URIRef

def load_ttl_to_fuseki(ttl_file, dataset_name="koi", fuseki_url="http://localhost:3030"):
    """
    Load TTL file into Fuseki using SPARQL Update
    """
    # Read the TTL file
    ttl_path = Path(ttl_file)
    if not ttl_path.exists():
        print(f"Error: File {ttl_file} not found")
        return False
    
    with open(ttl_path, 'r') as f:
        ttl_content = f.read()
    
    # Prepare the SPARQL Update endpoint
    update_url = f"{fuseki_url}/{dataset_name}/update"
    
    print(f"Uploading {ttl_path.name} to Fuseki dataset '{dataset_name}'...")
    print(f"URL: {update_url}")
    
    # Authentication
    auth = ('admin', 'admin')
    
    try:
        # First, clear existing data (optional - comment out to append)
        print("Clearing existing data...")
        clear_query = "CLEAR DEFAULT"
        clear_response = requests.post(update_url, 
                                      data={'update': clear_query},
                                      auth=auth)
        if clear_response.status_code in [200, 204]:
            print("Existing data cleared successfully")
        else:
            print(f"Warning: Could not clear data (status: {clear_response.status_code})")
        
        # Convert TTL to INSERT DATA query
        # Split into chunks if needed (Fuseki has query size limits)
        print("Uploading new data...")
        
        # Parse TTL and split into smaller chunks
        from rdflib import Graph
        g = Graph()
        g.parse(data=ttl_content, format="turtle")
        
        # Convert to N-Triples for easier chunking
        triples = []
        for s, p, o in g:
            # Format triple for SPARQL
            s_str = f"<{s}>" if isinstance(s, URIRef) else str(s.n3())
            p_str = f"<{p}>" if isinstance(p, URIRef) else str(p.n3())
            o_str = f"<{o}>" if isinstance(o, URIRef) else o.n3()
            triples.append(f"{s_str} {p_str} {o_str} .")
        
        # Upload in chunks of 100 triples
        chunk_size = 100
        total_triples = len(triples)
        
        for i in range(0, total_triples, chunk_size):
            chunk = triples[i:i+chunk_size]
            insert_query = f"INSERT DATA {{ {' '.join(chunk)} }}"
            
            response = requests.post(update_url, 
                                    data={'update': insert_query},
                                    auth=auth)
            
            if response.status_code not in [200, 201, 204]:
                print(f"❌ Failed chunk {i//chunk_size + 1}: {response.status_code}")
                return False
            
            if (i + chunk_size) % 500 == 0 or (i + chunk_size) >= total_triples:
                print(f"  Uploaded {min(i + chunk_size, total_triples)}/{total_triples} triples...")
        
        print(f"✅ Successfully loaded {total_triples} triples to Fuseki")
        
        # Query to count triples
        count_query = """
        SELECT (COUNT(*) as ?count)
        WHERE { ?s ?p ?o }
        """
        
        query_url = f"{fuseki_url}/{dataset_name}/sparql"
        query_response = requests.post(query_url, 
                                      data={'query': count_query},
                                      headers={'Accept': 'application/json'})
        
        if query_response.status_code == 200:
            result = query_response.json()
            count = result['results']['bindings'][0]['count']['value']
            print(f"✅ Total triples in dataset: {count}")
        
        return True
            
    except Exception as e:
        print(f"❌ Error loading data: {e}")
        return False

def query_sample_data(dataset_name="koi", fuseki_url="http://localhost:3030"):
    """
    Query sample data to verify loading
    """
    print("\nQuerying sample data...")
    
    # Query for entity types
    type_query = """
    PREFIX regen: <http://regen.network/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?type (COUNT(?entity) as ?count)
    WHERE {
        ?entity rdf:type ?type .
        FILTER(STRREG(STR(?type), "regen"))
    }
    GROUP BY ?type
    ORDER BY DESC(?count)
    LIMIT 10
    """
    
    query_url = f"{fuseki_url}/{dataset_name}/sparql"
    
    try:
        response = requests.post(query_url,
                                data={'query': type_query},
                                headers={'Accept': 'application/json'})
        
        if response.status_code == 200:
            result = response.json()
            bindings = result['results']['bindings']
            
            print("\nEntity Type Distribution:")
            print("-" * 40)
            for binding in bindings:
                type_name = binding['type']['value'].split('#')[-1]
                count = binding['count']['value']
                print(f"{type_name:30} {count:>5}")
            
            return True
        else:
            print(f"Query failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"Error querying: {e}")
        return False

def main():
    # Load the production dataset
    production_file = "/Users/darrenzal/projects/RegenAI/koi-research/koi-entities-production.ttl"
    
    print("=" * 50)
    print("KOI Dataset Loading to Apache Jena Fuseki")
    print("=" * 50)
    
    # Load the data
    success = load_ttl_to_fuseki(production_file)
    
    if success:
        # Query sample data to verify
        query_sample_data()
        
        print("\n✅ Dataset successfully loaded!")
        print("You can now access the data via:")
        print("  - SPARQL endpoint: http://localhost:3030/koi/sparql")
        print("  - Django API: http://localhost:8000/api/koi/")
        print("  - Web UI: http://localhost:3030/")
    else:
        print("\n❌ Failed to load dataset")
        sys.exit(1)

if __name__ == "__main__":
    main()