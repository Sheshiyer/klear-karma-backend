/**
 * Script Runner for Mock Data Population
 * Usage: wrangler dev --local --test-scheduled
 */

import { populateMockData } from '../src/populate-mock-data';
import { WorkerEnv } from '../src/types/env';

// Type definitions for Cloudflare Workers
interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

// This function will be called when running as a scheduled worker
export default {
  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    console.log('🎯 Mock data population script started');
    
    try {
      await populateMockData(env);
      console.log('🎉 Mock data population completed');
    } catch (error) {
      console.error('💥 Mock data population failed:', error);
      throw error;
    }
  },

  // Also expose as a fetch handler for manual triggering
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/populate-mock-data' && request.method === 'POST') {
      try {
        console.log('🎯 Manual mock data population triggered');
        await populateMockData(env);
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Mock data populated successfully',
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        console.error('💥 Mock data population failed:', error);
        
        return new Response(JSON.stringify({
          success: false,
          message: 'Mock data population failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
    
    return new Response(JSON.stringify({
      message: 'Mock Data Population Script',
      usage: 'POST /populate-mock-data to trigger data population',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};