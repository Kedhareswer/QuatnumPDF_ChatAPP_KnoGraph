# Neo4j Quick-Start (Docker)

## Prerequisites

* **Docker Desktop** installed on Windows/macOS/Linux.
* Ports **7474** and **7687** free on your machine.

## Start the database

\`\`\`powershell
cd path\to\QuatnumPDF_ChatAPP_KnoGraph
# runs Neo4j in the background
docker compose up -d
\`\`\`

What happens:
1. Pulls the `neo4j:5.18-community` image (first run only).
2. Creates a container named `neo4j`.
3. Mounts the data folder at `./neo4j/data` so your graph persists.

## Verify & first login
1. Open <http://localhost:7474> in your browser.
2. Login with:
   * **User**: `neo4j`
   * **Password**: `test`
3. Neo4j will prompt you to change the password — update your local `.env` accordingly.

## Stopping the database
\`\`\`powershell
docker compose down
\`\`\`

## Useful commands
| Purpose | Command |
| --- | --- |
| Tail logs | `docker compose logs -f neo4j` |
| Restart container | `docker compose restart neo4j` |
| Backup (offline) | `zip -r backup.zip neo4j/data` |

## Environment variables

Add these lines to a local `.env` file (same directory as `docker-compose.yml`):

\`\`\`env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=test
GRAPH_RAG_ENABLED=true
\`\`\`

## Next steps
* Define the graph schema (`schema.cypher`).
* Run the ETL container to load documents.
* Integrate the graph into the RAG pipeline via `GraphService`.
