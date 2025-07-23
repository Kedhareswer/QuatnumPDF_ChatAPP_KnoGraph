import type React from "react"
import type { Message } from "@/types/types"
import { Brain, Zap } from "lucide-react"

interface ChatInterfaceProps {
  messages: Message[]
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages }) => {
  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <div key={index} className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`rounded-xl p-3 w-fit max-w-2xl ${message.sender === "user" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`}
          >
            {message.content}
            {/* Graph Insights */}
            {message.metadata?.graphNodes && message.metadata.graphNodes > 0 && (
              <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs">
                <div className="flex items-center space-x-2 text-purple-700">
                  <Brain className="w-3 h-3" />
                  <span className="font-medium">Knowledge Graph Insights</span>
                </div>
                <div className="mt-1 text-purple-600">
                  Found {message.metadata.graphNodes} entities and {message.metadata.graphRelationships} relationships
                  {message.metadata.explanation && (
                    <div className="mt-1 text-xs text-purple-500">{message.metadata.explanation}</div>
                  )}
                </div>
              </div>
            )}

            {/* Hybrid Score */}
            {message.metadata?.hybridScore && (
              <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500">
                <Zap className="w-3 h-3" />
                <span>Hybrid Confidence: {(message.metadata.hybridScore * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default ChatInterface
