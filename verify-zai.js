#!/usr/bin/env node
/**
 * Verification script for Z.ai provider
 * Tests availability checking and secret management
 */

const { ZaiProvider } = require('./dist/main/providers/zai-provider');
const { setProviderSecret, clearProviderSecrets } = require('./dist/main/secrets');

async function verify() {
  console.log('Z.ai Provider Verification\n');
  console.log('================================\n');

  // Test 1: Provider without secret
  console.log('Test 1: Provider availability without secret');
  clearProviderSecrets('zai');
  const provider1 = new ZaiProvider();
  const available1 = await provider1.isAvailable();
  console.log(`  isAvailable(): ${available1}`);
  console.log(`  Expected: false`);
  console.log(`  Result: ${available1 === false ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 2: Provider with secret
  console.log('Test 2: Provider availability with secret');
  setProviderSecret('zai', 'apiKey', 'test-key-123');
  const provider2 = new ZaiProvider();
  const available2 = await provider2.isAvailable();
  console.log(`  isAvailable(): ${available2}`);
  console.log(`  Expected: true`);
  console.log(`  Result: ${available2 === true ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 3: Provider with env var
  console.log('Test 3: Provider availability with env var');
  clearProviderSecrets('zai');
  process.env.ZAI_APIKEY = 'env-test-key-456';
  const provider3 = new ZaiProvider();
  const available3 = await provider3.isAvailable();
  console.log(`  isAvailable(): ${available3}`);
  console.log(`  Expected: true`);
  console.log(`  Result: ${available3 === true ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 4: Provider metadata
  console.log('Test 4: Provider metadata');
  console.log(`  id: ${provider3.id}`);
  console.log(`  name: ${provider3.name}`);
  console.log(`  Expected id: zai`);
  console.log(`  Expected name: Z.ai`);
  console.log(`  Result: ${provider3.id === 'zai' && provider3.name === 'Z.ai' ? '✅ PASS' : '❌ FAIL'}\n`);

  console.log('================================\n');
  console.log('Note: Actual API calls not tested (requires valid Z.ai API key)');
  console.log('To test real API calls, set ZAI_APIKEY env var and use the app.');
}

verify().catch(console.error);
