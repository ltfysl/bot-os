#!/usr/bin/env node
/**
 * Verification script for Z.ai provider integration with AgentBus
 */

const { AgentBus } = require('./dist/main/agent-bus');
const { ZaiProvider } = require('./dist/main/providers/zai-provider');
const { setProviderSecret, clearProviderSecrets } = require('./dist/main/secrets');

async function verifyBusIntegration() {
  console.log('Z.ai AgentBus Integration Verification\n');
  console.log('================================\n');

  // Test 1: Provider registration
  console.log('Test 1: Provider registration');
  const provider = new ZaiProvider();
  const bus = new AgentBus({
    providers: [provider],
  });
  const registeredProvider = bus.getProvider('zai');
  console.log(`  Provider registered: ${registeredProvider ? 'Yes' : 'No'}`);
  console.log(`  Provider id: ${registeredProvider?.id}`);
  console.log(`  Result: ${registeredProvider?.id === 'zai' ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 2: Provider list without secret
  console.log('Test 2: Provider list without secret');
  clearProviderSecrets('zai');
  const providersWithoutSecret = await bus.getAllProviders();
  const zaiWithoutSecret = providersWithoutSecret.find(p => p.id === 'zai');
  console.log(`  Found in list: ${zaiWithoutSecret ? 'Yes' : 'No'}`);
  console.log(`  hasSecret: ${zaiWithoutSecret?.hasSecret}`);
  console.log(`  isAvailable: ${zaiWithoutSecret?.isAvailable}`);
  console.log(`  Expected hasSecret: false, isAvailable: false`);
  console.log(`  Result: ${zaiWithoutSecret && !zaiWithoutSecret.hasSecret && !zaiWithoutSecret.isAvailable ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 3: Provider list with secret
  console.log('Test 3: Provider list with secret');
  setProviderSecret('zai', 'apiKey', 'test-key-123');
  const providersWithSecret = await bus.getAllProviders();
  const zaiWithSecret = providersWithSecret.find(p => p.id === 'zai');
  console.log(`  Found in list: ${zaiWithSecret ? 'Yes' : 'No'}`);
  console.log(`  hasSecret: ${zaiWithSecret?.hasSecret}`);
  console.log(`  isAvailable: ${zaiWithSecret?.isAvailable}`);
  console.log(`  Expected hasSecret: true, isAvailable: true`);
  console.log(`  Result: ${zaiWithSecret && zaiWithSecret.hasSecret && zaiWithSecret.isAvailable ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 4: Agent can bind to Z.ai provider
  console.log('Test 4: Agent binding to Z.ai provider');
  bus.registerAgent({
    id: 'test-agent',
    name: 'Test Agent',
    providerId: 'zai',
    avatar: '🤖',
    status: 'active',
  });
  const agent = bus.getAgent('test-agent');
  console.log(`  Agent registered: ${agent ? 'Yes' : 'No'}`);
  console.log(`  Agent provider: ${agent?.providerId}`);
  console.log(`  Result: ${agent?.providerId === 'zai' ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 5: Try to send message without secret (should fail gracefully)
  console.log('Test 5: Send message without secret (graceful failure)');
  clearProviderSecrets('zai');
  try {
    await bus.sendMessage('test', 'test-agent');
    console.log(`  Result: ❌ FAIL (should have thrown error)\n`);
  } catch (error) {
    console.log(`  Error caught: ${error.message}`);
    console.log(`  Result: ${error.message.includes('not available') ? '✅ PASS' : '❌ FAIL'}\n`);
  }

  console.log('================================\n');
  console.log('All integration tests complete!');
}

verifyBusIntegration().catch(console.error);
