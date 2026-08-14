import { createInterface } from 'node:readline';

const protocolVersion = '2026-07-28';
const requiredMeta = (request) => {
  const meta = request.params?._meta;
  return (
    meta?.['io.modelcontextprotocol/protocolVersion'] === protocolVersion &&
    typeof meta?.['io.modelcontextprotocol/clientInfo'] === 'object' &&
    typeof meta?.['io.modelcontextprotocol/clientCapabilities'] === 'object'
  );
};
const reply = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') {
    reply({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: 'initialize_removed' } });
    return;
  }
  if (!requiredMeta(request)) {
    reply({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: 'modern_metadata_required' } });
    return;
  }
  if (request.method === 'server/discover') {
    reply({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resultType: 'complete',
        supportedVersions: [protocolVersion],
        capabilities: { tools: {} },
        serverInfo: { name: 'modern-fixture', version: '1.0.0' },
      },
    });
    return;
  }
  if (request.method === 'tools/list') {
    reply({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resultType: 'complete',
        tools: [{ name: 'echo', description: 'Echoes input text', inputSchema: { type: 'object' } }],
      },
    });
    return;
  }
  if (request.method === 'tools/call') {
    reply({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resultType: 'complete',
        content: [{ type: 'text', text: request.params.arguments.text }],
        isError: false,
      },
    });
    return;
  }
  reply({ jsonrpc: '2.0', id: request.id, result: { resultType: 'complete' } });
});
