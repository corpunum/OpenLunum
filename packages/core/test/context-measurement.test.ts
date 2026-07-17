import { test } from 'node:test';
import assert from 'node:assert';
import { 
  ContextMeasurementFramework,
  type ContextMeasurementConfig
} from '../src/context-measurement.js';

// Helper to create mock messages
const createMockMessages = (count: number) => {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: 'user',
      content: `Test message ${i}`,
      lunumCode: i % 2 === 0 ? `lunum-code-${i}` : null
    });
  }
  return messages;
};

test('ContextMeasurementFramework disabled by default', () => {
  const framework = new ContextMeasurementFramework();
  const config = framework.getConfig();
  
  assert.strictEqual(config.enabled, false);
});

test('ContextMeasurementFramework measures quality', () => {
  const framework = new ContextMeasurementFramework({ enabled: true });
  
  const messages = createMockMessages(2);
  const measurement = framework.measure(messages);
  
  assert.ok(measurement.quality);
  assert.ok(measurement.quality.overall >= 0 && measurement.quality.overall <= 1);
  assert.ok(measurement.tokens > 0);
});

test('ContextMeasurementFramework compares contexts', () => {
  const framework = new ContextMeasurementFramework({ 
    enabled: true,
    compareContexts: true
  });
  
  const messages = createMockMessages(2);
  const measurement = framework.measure(messages);
  
  assert.ok(measurement.comparison);
  assert.ok(measurement.comparison!.naturalQuality);
  assert.ok(measurement.comparison!.lunumQuality);
  assert.ok(measurement.comparison!.mixedQuality);
  assert.ok(['natural', 'lunum', 'mixed'].includes(measurement.comparison!.best));
});

test('ContextMeasurementFramework stores measurements', () => {
  const framework = new ContextMeasurementFramework({ enabled: true });
  
  const messages = createMockMessages(2);
  framework.measure(messages);
  framework.measure(messages);
  
  const measurements = framework.getMeasurements();
  assert.strictEqual(measurements.length, 2);
});

test('ContextMeasurementFramework enforces max measurements', () => {
  const framework = new ContextMeasurementFramework({ 
    enabled: true,
    maxMeasurements: 2
  });
  
  const messages = createMockMessages(2);
  framework.measure(messages);
  framework.measure(messages);
  framework.measure(messages);
  
  const measurements = framework.getMeasurements();
  assert.strictEqual(measurements.length, 2);
});

test('ContextMeasurementFramework gets stats', () => {
  const framework = new ContextMeasurementFramework({ 
    enabled: true,
    maxMeasurements: 100,
    thresholds: {
      minimumNaturalQuality: 0.7,
      minimumLunumQuality: 0.8,
      minimumMixedQuality: 0.75
    }
  });
  
  const stats = framework.getStats();
  
  assert.strictEqual(stats.enabled, true);
  assert.strictEqual(stats.totalMeasurements, 0);
  assert.ok(stats.thresholds);
});

test('ContextMeasurementFramework clears measurements', () => {
  const framework = new ContextMeasurementFramework({ enabled: true });
  
  const messages = createMockMessages(2);
  framework.measure(messages);
  framework.clear();
  
  const measurements = framework.getMeasurements();
  assert.strictEqual(measurements.length, 0);
});

test('ContextMeasurementFramework config can be updated', () => {
  const framework = new ContextMeasurementFramework();
  
  framework.setConfig({ 
    enabled: true,
    maxMeasurements: 500,
    compareContexts: false
  });
  
  const config = framework.getConfig();
  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.maxMeasurements, 500);
  assert.strictEqual(config.compareContexts, false);
});