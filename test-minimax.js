#!/usr/bin/env node

/**
 * Manual verification script for MiniMax provider
 * 
 * Usage:
 *   # Without secret - should show unavailable
 *   node test-minimax.js
 * 
 *   # With secret - should make real API call
 *   MINIMAX_APIKEY=your_key node test-minimax.js
 */

const { MiniMaxProvider } = require('./dist/main/providers/minimax-provider');

async function testProvider() {
  console.log('=== MiniMax Provider Test ===\n');
  
  const provider = new MiniMaxProvider();
  
  console.log('Provider ID:', provider.id);
  console.log('Provider Name:', provider.name);
  
  const isAvailable = await provider.isAvailable();
  console.log('Is Available:', isAvailable);
  console.log('Has API Key from env:', Boolean(process.env.MINIMAX_APIKEY));
  
  if (!isAvailable) {
    console.log('\n✓ Provider correctly reports unavailable when no secret is present');
    console.log('  To test with a real key: MINIMAX_APIKEY=your_key node test-minimax.js');
    return;
  }
  
  console.log('\n--- Attempting real API call ---');
  try {
    const response = await provider.sendMessage('Say "hello" in exactly one word.');
    console.log('\n✓ API call successful!');
    console.log('Response:', response);
    console.log('\nVerify: Response should be short and contain "hello"');
  } catch (error) {
    console.error('\n✗ API call failed:', error.message);
    console.error('\nThis could mean:');
    console.error('  - Invalid API key');
    console.error('  - Network issue');
    console.error('  - API endpoint changed');
    console.error('  - Rate limiting');
  }
}

testProvider().catch(console.error);
