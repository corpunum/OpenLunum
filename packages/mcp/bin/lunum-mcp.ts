#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLunumMcpServer } from '../src/server.js';

const server = createLunumMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
