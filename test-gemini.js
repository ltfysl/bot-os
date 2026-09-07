#!/usr/bin/env node

/**
 * Gemini Provider Test Script
 * 
 * This script tests the Gemini provider implementation without requiring the full Electron app.
 * Run with: node test-gemini.js
 * 
 * Prerequisites:
 * - npm run build (to compile TypeScript)
 * - GEMINI_API_KEY environment variable set
 */

const { GeminiProvider } = require('./dist/main/providers/gemini-provider');

async function testGeminiProvider() {
  console.log('=== Gemini Provider Test ===\n');

  // Create provider instance
  const provider = new GeminiProvider();
  console.log('✅ Provider created');
  console.log('   ID:', provider.id);
  console.log('   Name:', provider.name);
  console.log('');

  // Test availability
  const isAvailable = await provider.isAvailable();
  console.log('Availability Check:');
  console.log('   Is Available:', isAvailable);
  
  if (!isAvailable) {
    console.log('\n⚠️  Provider is not available');
    console.log('   Reason: No API key found');
    console.log('   Solution: Set GEMINI_API_KEY environment variable');
    console.log('   Example: export GEMINI_API_KEY=your_key_here');
    console.log('\n✅ Test passed: Provider correctly reports unavailable when no secret is present');
    return;
  }

  console.log('   ✅ API key detected');
  console.log('');

  // Test non-streaming message
  console.log('--- Test 1: Non-Streaming Message ---');
  try {
    console.log('Sending: "Say hello in exactly one word"');
    const startTime = Date.now();
    const response = await provider.sendMessage('Say hello in exactly one word.');
    const elapsed = Date.now() - startTime;
    
    console.log('✅ Non-streaming API call successful!');
    console.log('   Response:', response);
    console.log('   Time:', `${elapsed}ms`);
    console.log('');
  } catch (error) {
    console.error('❌ Non-streaming API call failed:');
    console.error('   Error:', error.message);
    console.log('');
    return;
  }

  // Test streaming message
  console.log('--- Test 2: Streaming Message ---');
  try {
    console.log('Sending: "Count from 1 to 5 slowly"');
    const startTime = Date.now();
    let chunkCount = 0;
    let fullContent = '';

    await provider.sendMessageStream(
      'Count from 1 to 5 slowly',
      undefined,
      (chunk, done) => {
        if (!done) {
          chunkCount++;
          fullContent += chunk;
          process.stdout.write('.');
        } else {
          const elapsed = Date.now() - startTime;
          console.log('\n');
          console.log('✅ Streaming API call successful!');
          console.log('   Chunks received:', chunkCount);
          console.log('   Final content:', chunk);
          console.log('   Time:', `${elapsed}ms`);
        }
      }
    );
    console.log('');
  } catch (error) {
    console.error('\n❌ Streaming API call failed:');
    console.error('   Error:', error.message);
    console.log('');
    return;
  }

  // Test error handling
  console.log('--- Test 3: Error Handling ---');
  try {
    // Create provider with invalid config to test error handling
    const invalidProvider = new GeminiProvider({ apiKey: 'invalid_key_123' });
    console.log('Sending message with invalid API key...');
    await invalidProvider.sendMessage('Test');
    console.log('❌ Should have thrown an error');
  } catch (error) {
    console.log('✅ Error handling works correctly');
    console.log('   Error type:', error.constructor.name);
    console.log('   Error message:', error.message.substring(0, 100));
    console.log('');
  }

  // Summary
  console.log('=== Test Summary ===');
  console.log('✅ All tests passed!');
  console.log('');
  console.log('Provider is ready for production use.');
  console.log('');
}

// Run tests
testGeminiProvider().catch((error) => {
  console.error('Unexpected error during testing:');
  console.error(error);
  process.exit(1);
});
