#!/usr/bin/env npx tsx
/**
 * Deploy the Doubloon Solana program.
 *
 * Usage:
 *   npx tsx scripts/deploy-program.ts --cluster devnet
 *   npx tsx scripts/deploy-program.ts --cluster mainnet-beta --keypair ~/.config/solana/deployer.json
 *   npx tsx scripts/deploy-program.ts --cluster localnet
 *
 * Prerequisites:
 *   - Solana CLI installed (solana, anchor)
 *   - Anchor CLI installed
 *   - Program built: cd packages/chains/solana/program && anchor build
 */

import { execSync, type ExecSyncOptions } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const PROGRAM_DIR = resolve(import.meta.dirname ?? '.', '../packages/chains/solana/program');
const ANCHOR_TOML = join(PROGRAM_DIR, 'Anchor.toml');
const BUILD_DIR = join(PROGRAM_DIR, 'target/deploy');

interface DeployConfig {
  cluster: string;
  keypair?: string;
  programKeypair?: string;
  skipBuild?: boolean;
  dryRun?: boolean;
}

function parseArgs(): DeployConfig {
  const args = process.argv.slice(2);
  const config: DeployConfig = { cluster: 'localnet' };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--cluster':
      case '-c':
        config.cluster = args[++i];
        break;
      case '--keypair':
      case '-k':
        config.keypair = args[++i];
        break;
      case '--program-keypair':
        config.programKeypair = args[++i];
        break;
      case '--skip-build':
        config.skipBuild = true;
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npx tsx scripts/deploy-program.ts [options]

Options:
  --cluster, -c <name>     Cluster: localnet, devnet, mainnet-beta (default: localnet)
  --keypair, -k <path>     Path to deployer keypair (default: Solana CLI default)
  --program-keypair <path> Path to program keypair (default: target/deploy/doubloon-keypair.json)
  --skip-build             Skip anchor build step
  --dry-run                Print commands without executing
  --help, -h               Show this help
        `.trim());
        process.exit(0);
    }
  }
  return config;
}

function run(cmd: string, opts?: ExecSyncOptions & { dryRun?: boolean }): string {
  console.log(`> ${cmd}`);
  if (opts?.dryRun) {
    console.log('  (dry run — skipped)');
    return '';
  }
  return execSync(cmd, { stdio: 'inherit', encoding: 'utf-8', ...opts }) ?? '';
}

function clusterUrl(cluster: string): string {
  switch (cluster) {
    case 'localnet':
      return 'http://127.0.0.1:8899';
    case 'devnet':
      return 'https://api.devnet.solana.com';
    case 'testnet':
      return 'https://api.testnet.solana.com';
    case 'mainnet-beta':
      return 'https://api.mainnet-beta.solana.com';
    default:
      return cluster; // Allow custom RPC URL
  }
}

async function main() {
  const config = parseArgs();
  const rpcUrl = clusterUrl(config.cluster);

  console.log(`\nDoubloon Program Deployment`);
  console.log(`  Cluster:  ${config.cluster} (${rpcUrl})`);
  console.log(`  Program:  ${PROGRAM_DIR}`);
  console.log('');

  // Verify prerequisites
  if (!existsSync(ANCHOR_TOML)) {
    console.error(`Error: Anchor.toml not found at ${ANCHOR_TOML}`);
    process.exit(1);
  }

  // Step 1: Build
  if (!config.skipBuild) {
    console.log('Step 1: Building program...');
    run(`anchor build`, { cwd: PROGRAM_DIR, dryRun: config.dryRun });
  } else {
    console.log('Step 1: Build skipped (--skip-build)');
  }

  // Verify build output exists
  const programSo = join(BUILD_DIR, 'doubloon.so');
  if (!config.dryRun && !existsSync(programSo)) {
    console.error(`Error: Program binary not found at ${programSo}. Run 'anchor build' first.`);
    process.exit(1);
  }

  // Step 2: Read program ID
  const programKeypairPath = config.programKeypair ?? join(BUILD_DIR, 'doubloon-keypair.json');
  if (!config.dryRun && existsSync(programKeypairPath)) {
    const keypairData = JSON.parse(readFileSync(programKeypairPath, 'utf-8'));
    console.log(`Program keypair: ${programKeypairPath}`);
    console.log(`  (${keypairData.length} bytes)`);
  }

  // Step 3: Deploy
  console.log('\nStep 2: Deploying program...');
  const keypairArg = config.keypair ? `--provider.wallet ${config.keypair}` : '';
  const clusterArg = `--provider.cluster ${rpcUrl}`;

  if (config.cluster === 'mainnet-beta' && !config.dryRun) {
    console.log('\n⚠  WARNING: You are deploying to mainnet-beta!');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(r => setTimeout(r, 5000));
  }

  run(
    `anchor deploy ${clusterArg} ${keypairArg}`.trim(),
    { cwd: PROGRAM_DIR, dryRun: config.dryRun },
  );

  // Step 3: Verify
  console.log('\nStep 3: Verifying deployment...');
  run(
    `solana program show doubloon --url ${rpcUrl}`,
    { cwd: PROGRAM_DIR, dryRun: config.dryRun },
  );

  console.log('\nDeployment complete!');
}

main().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
