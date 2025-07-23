import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Cpu, ServerIcon as Server2, Database, Brain, Zap } from "lucide-react"

interface SystemStatusProps {
  ragEngine: any // Replace 'any' with a more specific type if available
}

const SystemStatus: React.FC<SystemStatusProps> = ({ ragEngine }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* CPU Status */}
      <Card className="border-2 border-black shadow-none">
        <CardHeader className="border-b border-black">
          <CardTitle className="text-sm flex items-center space-x-2">
            <Cpu className="w-4 h-4" />
            <span>CPU</span>
          </CardTitle>
          <CardDescription>Overall CPU Usage</CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Usage:</span>
            <span className="font-bold">75%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Temperature:</span>
            <span className="font-bold">62°C</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Cores:</span>
            <span className="font-bold">8</span>
          </div>
        </CardContent>
      </Card>

      {/* Server Status */}
      <Card className="border-2 border-black shadow-none">
        <CardHeader className="border-b border-black">
          <CardTitle className="text-sm flex items-center space-x-2">
            <Server2 className="w-4 h-4" />
            <span>SERVER</span>
          </CardTitle>
          <CardDescription>Server Load & Uptime</CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Load Average:</span>
            <span className="font-bold">0.85</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Uptime:</span>
            <span className="font-bold">2 days</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Memory Usage:</span>
            <span className="font-bold">60%</span>
          </div>
        </CardContent>
      </Card>

      {/* Database Status */}
      <Card className="border-2 border-black shadow-none">
        <CardHeader className="border-b border-black">
          <CardTitle className="text-sm flex items-center space-x-2">
            <Database className="w-4 h-4" />
            <span>DATABASE</span>
          </CardTitle>
          <CardDescription>Database Connection & Size</CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Connection:</span>
            <Badge variant="default" className="bg-green-600">
              ACTIVE
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Size:</span>
            <span className="font-bold">12 GB</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Version:</span>
            <span className="font-bold">15.2</span>
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Graph Status */}
      <Card className="border-2 border-black shadow-none">
        <CardHeader className="border-b border-black">
          <CardTitle className="text-sm flex items-center space-x-2">
            <Brain className="w-4 h-4" />
            <span>KNOWLEDGE GRAPH</span>
            <Badge variant="outline" className="text-xs">
              BETA
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Status:</span>
            <Badge variant="default" className="bg-green-600">
              ACTIVE
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Entities:</span>
            <span className="font-bold">{ragEngine?.knowledgeGraph?.nodeCount || 0}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Relationships:</span>
            <span className="font-bold">{ragEngine?.knowledgeGraph?.relationshipCount || 0}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Graph Density:</span>
            <span className="font-bold">{((ragEngine?.knowledgeGraph?.density || 0) * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Provider:</span>
            <Badge variant="outline" className="text-xs">
              IN-MEMORY
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Hybrid Search Status */}
      <Card className="border-2 border-black shadow-none">
        <CardHeader className="border-b border-black">
          <CardTitle className="text-sm flex items-center space-x-2">
            <Zap className="w-4 h-4" />
            <span>HYBRID SEARCH</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Vector Weight:</span>
            <span className="font-bold">60%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Graph Weight:</span>
            <span className="font-bold">40%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Max Depth:</span>
            <span className="font-bold">3 hops</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Reasoning:</span>
            <Badge variant="default" className="bg-purple-600">
              ENABLED
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default SystemStatus
