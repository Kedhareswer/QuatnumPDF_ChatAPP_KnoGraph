// Knowledge Graph Type Definitions for QuantumPDF ChatApp

export interface KnowledgeGraphNode {
  id: string
  type: NodeType
  properties: Record<string, any>
  labels: string[]
  createdAt: Date
  updatedAt: Date
}

export interface KnowledgeGraphRelationship {
  id: string
  type: RelationshipType
  sourceNodeId: string
  targetNodeId: string
  properties: Record<string, any>
  weight?: number
  confidence?: number
  createdAt: Date
}

export enum NodeType {
  DOCUMENT = "Document",
  SECTION = "Section",
  PARAGRAPH = "Paragraph",
  ENTITY = "Entity",
  CONCEPT = "Concept",
  CITATION = "Citation",
  AUTHOR = "Author",
  ORGANIZATION = "Organization",
  LOCATION = "Location",
  DATE = "Date",
  TOPIC = "Topic",
}

export enum RelationshipType {
  CONTAINS = "CONTAINS",
  MENTIONS = "MENTIONS",
  RELATES_TO = "RELATES_TO",
  CITES = "CITES",
  AUTHORED_BY = "AUTHORED_BY",
  SIMILAR_TO = "SIMILAR_TO",
  FOLLOWS = "FOLLOWS",
  PRECEDES = "PRECEDES",
  PART_OF = "PART_OF",
  REFERENCES = "REFERENCES",
  LOCATED_IN = "LOCATED_IN",
  OCCURRED_ON = "OCCURRED_ON",
  ASSOCIATED_WITH = "ASSOCIATED_WITH",
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[]
  relationships: ExtractedRelationship[]
  confidence: number
  processingTime: number
}

export interface ExtractedEntity {
  text: string
  type: string
  startOffset: number
  endOffset: number
  confidence: number
  properties: Record<string, any>
  aliases?: string[]
}

export interface ExtractedRelationship {
  sourceEntity: string
  targetEntity: string
  relationshipType: string
  confidence: number
  context: string
  properties: Record<string, any>
}

export interface GraphQuery {
  query: string
  parameters?: Record<string, any>
  maxDepth?: number
  limit?: number
}

export interface GraphQueryResult {
  nodes: KnowledgeGraphNode[]
  relationships: KnowledgeGraphRelationship[]
  paths?: GraphPath[]
  executionTime: number
  resultCount: number
}

export interface GraphPath {
  nodes: KnowledgeGraphNode[]
  relationships: KnowledgeGraphRelationship[]
  length: number
  weight: number
}

export interface KnowledgeGraphConfig {
  provider: "neo4j" | "memory" | "arangodb"
  connectionString?: string
  username?: string
  password?: string
  database?: string
  maxConnections?: number
  connectionTimeout?: number
}

export interface GraphSearchOptions {
  searchType: "entity" | "relationship" | "path" | "pattern"
  maxResults?: number
  minConfidence?: number
  includeRelationships?: boolean
  maxDepth?: number
  filters?: Record<string, any>
}

export interface HybridSearchResult {
  vectorResults: VectorSearchResult[]
  graphResults: GraphQueryResult
  combinedScore: number
  explanation: string
  sources: string[]
}

export interface VectorSearchResult {
  id: string
  content: string
  score: number
  metadata: Record<string, any>
}

export interface DocumentGraphStructure {
  documentNode: KnowledgeGraphNode
  sections: KnowledgeGraphNode[]
  entities: KnowledgeGraphNode[]
  relationships: KnowledgeGraphRelationship[]
  hierarchy: DocumentHierarchy
}

export interface DocumentHierarchy {
  document: string
  sections: Array<{
    id: string
    title: string
    level: number
    children: string[]
    parent?: string
  }>
}

export interface GraphAnalytics {
  nodeCount: number
  relationshipCount: number
  averageDegree: number
  density: number
  connectedComponents: number
  centralityScores: Record<string, number>
  clusteringCoefficient: number
}

export interface EntityResolutionResult {
  resolvedEntities: ResolvedEntity[]
  mergedEntities: Array<{
    canonical: string
    aliases: string[]
    confidence: number
  }>
  ambiguousEntities: Array<{
    entity: string
    possibleResolutions: string[]
  }>
}

export interface ResolvedEntity {
  id: string
  canonicalName: string
  type: string
  aliases: string[]
  properties: Record<string, any>
  confidence: number
}

export interface GraphUpdateOperation {
  type:
    | "CREATE_NODE"
    | "UPDATE_NODE"
    | "DELETE_NODE"
    | "CREATE_RELATIONSHIP"
    | "UPDATE_RELATIONSHIP"
    | "DELETE_RELATIONSHIP"
  data: any
  timestamp: Date
  userId?: string
}

export interface GraphValidationResult {
  isValid: boolean
  errors: GraphValidationError[]
  warnings: GraphValidationWarning[]
  statistics: GraphAnalytics
}

export interface GraphValidationError {
  type: string
  message: string
  nodeId?: string
  relationshipId?: string
  severity: "HIGH" | "MEDIUM" | "LOW"
}

export interface GraphValidationWarning {
  type: string
  message: string
  suggestion: string
  nodeId?: string
  relationshipId?: string
}
