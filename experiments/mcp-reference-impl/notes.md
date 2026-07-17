## Experiment Notes

### Current Status
- Created experiment manifest for MCP reference implementation
- Claimed area: adoption
- Branch: agent/adoption/mcp-reference-impl

### Next Steps
1. Research MCP protocol specifications
2. Define Lunum-specific tools and schemas
3. Implement MCP server with core tools
4. Add context management capabilities
5. Create client example
6. Document integration patterns

### Resources
- Dataset: datasets/dev/multilingual-core-v1.jsonl
- Model: profiles/models/local-openai-compatible.example.json
- Base commit: e17b95f3d8d0f523c37fbb35c2d90397739a3d72

### MCP Protocol Reference
The Model Context Protocol (MCP) provides a standardized way for AI applications to communicate with external tools and services. The implementation should:
- Follow MCP specification for tool definitions
- Support streaming responses for long operations
- Include proper error handling
- Document all tool schemas