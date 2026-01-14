/**
 * API route to connect MCP server with BYOK (Bring Your Own Key)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { storeMCPConnection } from '@/lib/mcp-connection';
import { mcpClientManager } from '@/mcp/client';
import { registerAllMCPServers } from '@/mcp/servers/config-extended';

registerAllMCPServers(mcpClientManager);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      serverName,
      apiKey,
      apiToken,
      customEnv,
      projectId,
      url, // For SSE/HTTP type servers
    }: {
      serverName: string;
      apiKey?: string;
      apiToken?: string;
      customEnv?: Record<string, string>;
      projectId?: string;
      url?: string;
    } = await request.json();

    if (!serverName) {
      return NextResponse.json(
        { error: 'Server name is required' },
        { status: 400 }
      );
    }

    if (!apiKey && !apiToken && !customEnv) {
      return NextResponse.json(
        { error: 'API key, API token, or custom environment variables are required' },
        { status: 400 }
      );
    }

    // Determine auth type
    let authType: 'api_key' | 'api_token' | 'env' = 'env';
    if (apiKey) authType = 'api_key';
    else if (apiToken) authType = 'api_token';

    const credentials = {
      apiKey,
      apiToken,
      customEnv,
    };

    // For SSE/HTTP servers, update the config URL if provided
    // Access the private configs map via type assertion
    if (url) {
      const configsMap = (mcpClientManager as any).configs as Map<string, any>;
      const config = configsMap.get(serverName);
      if (config && (config.type === 'sse' || config.type === 'http')) {
        // Update the config URL temporarily for this connection
        const updatedConfig = { ...config, url };
        mcpClientManager.registerServer(updatedConfig);
      }
    }

    // Test connection with userId for isolation
    try {
      await mcpClientManager.connect(serverName, { ...credentials, userId: user.id });
    } catch (error: any) {
      return NextResponse.json(
        { error: `Connection test failed: ${error.message}` },
        { status: 400 }
      );
    }

    // Store connection
    const connectionId = await storeMCPConnection(
      user.id,
      serverName,
      authType,
      credentials,
      projectId
    );

    return NextResponse.json({
      success: true,
      connectionId,
      message: 'BYOK connection established successfully',
    });
  } catch (error: any) {
    console.error('BYOK connection error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to establish BYOK connection' },
      { status: 500 }
    );
  }
}

