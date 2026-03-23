#!/usr/bin/env npx tsx
/**
 * Code generation script for Doubloon.
 *
 * Generates typed client bindings from the core TypeScript types:
 *   - Python dataclasses / Pydantic models
 *   - JSON Schema
 *
 * Usage:
 *   npx tsx scripts/codegen.ts --target python --out generated/python/
 *   npx tsx scripts/codegen.ts --target json-schema --out generated/schema/
 *   npx tsx scripts/codegen.ts --target all --out generated/
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

interface CodegenConfig {
  target: 'python' | 'json-schema' | 'all';
  outDir: string;
}

function parseArgs(): CodegenConfig {
  const args = process.argv.slice(2);
  const config: CodegenConfig = { target: 'all', outDir: 'generated' };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--target':
      case '-t':
        config.target = args[++i] as CodegenConfig['target'];
        break;
      case '--out':
      case '-o':
        config.outDir = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npx tsx scripts/codegen.ts [options]

Options:
  --target, -t <type>   Target: python, json-schema, all (default: all)
  --out, -o <dir>       Output directory (default: generated/)
  --help, -h            Show this help
        `.trim());
        process.exit(0);
    }
  }
  return config;
}

// Type definitions extracted from @doubloon/core
const DOUBLOON_TYPES = {
  Store: {
    type: 'enum',
    values: ['apple', 'google', 'stripe', 'x402'],
  },
  EntitlementSource: {
    type: 'enum',
    values: ['apple', 'google', 'stripe', 'x402', 'manual', 'migration'],
  },
  NotificationType: {
    type: 'enum',
    values: [
      'initial_purchase', 'renewal', 'cancellation', 'uncancellation',
      'expiration', 'refund', 'revocation', 'billing_recovery',
      'offer_redeemed', 'plan_change', 'grace_period_start',
      'billing_retry_start', 'price_increase_consent', 'pause', 'resume', 'test',
    ],
  },
  MintInstruction: {
    type: 'object',
    fields: {
      productId: { type: 'string', required: true },
      user: { type: 'string', required: true },
      expiresAt: { type: 'date_or_null', required: true },
      source: { type: 'EntitlementSource', required: true },
      sourceId: { type: 'string', required: true },
    },
  },
  RevokeInstruction: {
    type: 'object',
    fields: {
      productId: { type: 'string', required: true },
      user: { type: 'string', required: true },
      reason: { type: 'string', required: true },
    },
  },
  EntitlementCheck: {
    type: 'object',
    fields: {
      entitled: { type: 'boolean', required: true },
      entitlement: { type: 'Entitlement_or_null', required: true },
      reason: { type: 'string', required: true },
      expiresAt: { type: 'date_or_null', required: true },
      product: { type: 'string_or_null', required: true },
    },
  },
  Entitlement: {
    type: 'object',
    fields: {
      productId: { type: 'string', required: true },
      user: { type: 'string', required: true },
      active: { type: 'boolean', required: true },
      grantedAt: { type: 'date', required: true },
      expiresAt: { type: 'date_or_null', required: true },
      revokedAt: { type: 'date_or_null', required: true },
      source: { type: 'EntitlementSource', required: true },
      sourceId: { type: 'string', required: true },
      autoRenew: { type: 'boolean', required: true },
    },
  },
  StoreNotification: {
    type: 'object',
    fields: {
      id: { type: 'string', required: true },
      type: { type: 'NotificationType', required: true },
      store: { type: 'Store', required: true },
      environment: { type: 'string', required: true },
      productId: { type: 'string', required: true },
      userWallet: { type: 'string', required: true },
      originalTransactionId: { type: 'string', required: true },
      expiresAt: { type: 'date_or_null', required: true },
      autoRenew: { type: 'boolean', required: true },
      storeTimestamp: { type: 'date', required: true },
      receivedTimestamp: { type: 'date', required: true },
      deduplicationKey: { type: 'string', required: true },
    },
  },
} as const;

type TypeDef = (typeof DOUBLOON_TYPES)[keyof typeof DOUBLOON_TYPES];

function toPythonType(t: string): string {
  switch (t) {
    case 'string': return 'str';
    case 'boolean': return 'bool';
    case 'number': return 'float';
    case 'date': return 'datetime';
    case 'date_or_null': return 'Optional[datetime]';
    case 'string_or_null': return 'Optional[str]';
    case 'Entitlement_or_null': return 'Optional[Entitlement]';
    default:
      if (DOUBLOON_TYPES[t as keyof typeof DOUBLOON_TYPES]) return t;
      return 'Any';
  }
}

function generatePython(): string {
  const lines: string[] = [
    '"""',
    'Auto-generated Doubloon types.',
    'Do not edit manually — regenerate with: npx tsx scripts/codegen.ts --target python',
    '"""',
    'from __future__ import annotations',
    'from dataclasses import dataclass',
    'from datetime import datetime',
    'from enum import Enum',
    'from typing import Any, Optional',
    '',
  ];

  for (const [name, def] of Object.entries(DOUBLOON_TYPES)) {
    if (def.type === 'enum') {
      lines.push(`class ${name}(str, Enum):`);
      for (const v of def.values) {
        const pyName = v.toUpperCase();
        lines.push(`    ${pyName} = "${v}"`);
      }
      lines.push('');
    } else if (def.type === 'object') {
      lines.push('@dataclass');
      lines.push(`class ${name}:`);
      for (const [fieldName, fieldDef] of Object.entries(def.fields)) {
        const snakeName = fieldName.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        lines.push(`    ${snakeName}: ${toPythonType(fieldDef.type)}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function toJsonSchemaType(t: string): Record<string, unknown> {
  switch (t) {
    case 'string': return { type: 'string' };
    case 'boolean': return { type: 'boolean' };
    case 'number': return { type: 'number' };
    case 'date': return { type: 'string', format: 'date-time' };
    case 'date_or_null': return { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] };
    case 'string_or_null': return { oneOf: [{ type: 'string' }, { type: 'null' }] };
    case 'Entitlement_or_null': return { oneOf: [{ $ref: '#/$defs/Entitlement' }, { type: 'null' }] };
    default:
      if (DOUBLOON_TYPES[t as keyof typeof DOUBLOON_TYPES]) {
        return { $ref: `#/$defs/${t}` };
      }
      return {};
  }
}

function generateJsonSchema(): string {
  const defs: Record<string, unknown> = {};

  for (const [name, def] of Object.entries(DOUBLOON_TYPES)) {
    if (def.type === 'enum') {
      defs[name] = { type: 'string', enum: def.values };
    } else if (def.type === 'object') {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [fieldName, fieldDef] of Object.entries(def.fields)) {
        properties[fieldName] = toJsonSchemaType(fieldDef.type);
        if (fieldDef.required) required.push(fieldName);
      }
      defs[name] = { type: 'object', properties, required };
    }
  }

  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Doubloon Types',
    description: 'Auto-generated JSON Schema for Doubloon core types',
    $defs: defs,
  };

  return JSON.stringify(schema, null, 2);
}

function main() {
  const config = parseArgs();
  const outDir = resolve(config.outDir);

  console.log(`Doubloon Codegen`);
  console.log(`  Target: ${config.target}`);
  console.log(`  Output: ${outDir}\n`);

  if (config.target === 'python' || config.target === 'all') {
    const pythonDir = config.target === 'all' ? join(outDir, 'python') : outDir;
    mkdirSync(pythonDir, { recursive: true });
    const pythonCode = generatePython();
    const pythonPath = join(pythonDir, 'doubloon_types.py');
    writeFileSync(pythonPath, pythonCode);
    console.log(`  Generated: ${pythonPath}`);
  }

  if (config.target === 'json-schema' || config.target === 'all') {
    const schemaDir = config.target === 'all' ? join(outDir, 'schema') : outDir;
    mkdirSync(schemaDir, { recursive: true });
    const schema = generateJsonSchema();
    const schemaPath = join(schemaDir, 'doubloon.schema.json');
    writeFileSync(schemaPath, schema);
    console.log(`  Generated: ${schemaPath}`);
  }

  console.log('\nCodegen complete!');
}

main();
