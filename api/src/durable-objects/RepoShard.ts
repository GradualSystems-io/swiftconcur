import type { Env } from '../types';

/**
 * Durable Object for per-repository state management and real-time updates
 */
export class RepoShard implements DurableObject {
  private state: DurableObjectState;
  private connections: Set<WebSocket> = new Set();
  private recentActivity: Array<{
    type: string;
    data: any;
    timestamp: number;
  }> = [];
  
  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    
    // Set up alarm for periodic cleanup
    this.state.blockConcurrencyWhile(async () => {
      const alarm = await this.state.storage.getAlarm();
      if (alarm === null) {
        // Set initial cleanup alarm for 1 hour
        await this.state.storage.setAlarm(Date.now() + 60 * 60 * 1000);
      }
    });
  }
  
  /**
   * Handle incoming requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/websocket':
        return this.handleWebSocket(request);
      case '/notify':
        return this.handleNotify(request);
      case '/activity':
        return this.handleActivity(request);
      case '/stats':
        return this.handleStats(request);
      default:
        return new Response('Not Found', { status: 404 });
    }
  }
  
  /**
   * Handle WebSocket connections for real-time updates
   */
  async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }
    
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    // Accept the WebSocket connection
    this.state.acceptWebSocket(server);
    this.connections.add(server);
    
    // Set up event handlers
    server.addEventListener('close', () => {
      this.connections.delete(server);
      console.log('WebSocket connection closed');
    });
    
    server.addEventListener('error', (event) => {
      console.error('WebSocket error:', event);
      this.connections.delete(server);
    });
    
    server.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data as string);
        await this.handleWebSocketMessage(server, message);
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        server.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }));
      }
    });
    
    // Send connection confirmation
    server.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      timestamp: Date.now(),
    }));
    
    // Send recent activity
    if (this.recentActivity.length > 0) {
      server.send(JSON.stringify({
        type: 'activity_history',
        data: this.recentActivity.slice(-10), // Last 10 activities
      }));
    }
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
  
  /**
   * Handle notifications from other parts of the system
   */
  async handleNotify(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    try {
      const data = await request.json() as Record<string, any>;
      
      // Store activity
      const activity = {
        type: data.type || 'notification',
        data,
        timestamp: Date.now(),
      };
      
      this.recentActivity.push(activity);
      
      // Keep only last 50 activities
      if (this.recentActivity.length > 50) {
        this.recentActivity.shift();
      }
      
      // Broadcast to all connected clients
      const message = JSON.stringify({
        type: 'notification',
        ...data,
      });
      
      const promises = Array.from(this.connections).map(ws => {
        try {
          ws.send(message);
          return Promise.resolve();
        } catch (error) {
          console.error('Error sending to WebSocket:', error);
          this.connections.delete(ws);
          return Promise.resolve();
        }
      });
      
      await Promise.all(promises);
      
      return new Response(JSON.stringify({
        success: true,
        connections_notified: this.connections.size,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
      
    } catch (error) {
      console.error('Error handling notification:', error);
      return new Response('Invalid request body', { status: 400 });
    }
  }
  
  /**
   * Handle activity requests
   */
  async handleActivity(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    const activities = this.recentActivity
      .slice(-Math.min(limit, 50))
      .reverse(); // Most recent first
    
    return new Response(JSON.stringify({
      success: true,
      data: activities,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  /**
   * Handle stats requests
   */
  async handleStats(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    const stats = {
      active_connections: this.connections.size,
      recent_activities: this.recentActivity.length,
      uptime_ms: Date.now() - (await this.getCreationTime()),
      last_activity: this.recentActivity.length > 0 
        ? this.recentActivity[this.recentActivity.length - 1].timestamp 
        : null,
    };
    
    return new Response(JSON.stringify({
      success: true,
      data: stats,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  /**
   * Handle WebSocket messages from clients
   */
  async handleWebSocketMessage(ws: WebSocket, message: any): Promise<void> {
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now(),
        }));
        break;
        
      case 'subscribe':
        // Subscribe to specific event types
        ws.send(JSON.stringify({
          type: 'subscribed',
          events: message.events || ['all'],
        }));
        break;
        
      case 'get_activity': {
        const limit = message.limit || 10;
        const activities = this.recentActivity
          .slice(-Math.min(limit, 50))
          .reverse();
        
        ws.send(JSON.stringify({
          type: 'activity_response',
          data: activities,
        }));
        break;
      }
        
      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${message.type}`,
        }));
    }
  }
  
  /**
   * Handle Durable Object alarms for cleanup
   */
  async alarm(): Promise<void> {
    try {
      // Clean up old activities (keep only last 24 hours)
      const cutoff = Date.now() - (24 * 60 * 60 * 1000);
      this.recentActivity = this.recentActivity.filter(
        activity => activity.timestamp > cutoff
      );
      
      // Clean up closed connections
      const toRemove: WebSocket[] = [];
      for (const ws of this.connections) {
        if (ws.readyState === WebSocket.CLOSED) {
          toRemove.push(ws);
        }
      }
      
      toRemove.forEach(ws => this.connections.delete(ws));
      
      console.log(`Cleaned up ${toRemove.length} closed connections`);
      
      // Set next alarm for 1 hour
      await this.state.storage.setAlarm(Date.now() + 60 * 60 * 1000);
      
    } catch (error) {
      console.error('Error in alarm handler:', error);
      // Set alarm again even if cleanup failed
      await this.state.storage.setAlarm(Date.now() + 60 * 60 * 1000);
    }
  }
  
  /**
   * Get creation time from storage
   */
  private async getCreationTime(): Promise<number> {
    let creationTime = await this.state.storage.get<number>('creation_time');
    if (!creationTime) {
      creationTime = Date.now();
      await this.state.storage.put('creation_time', creationTime);
    }
    return creationTime;
  }
  
}