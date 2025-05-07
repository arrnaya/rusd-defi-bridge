import { ethers, Contract, Wallet, providers } from 'ethers';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import winston from 'winston';

// Load environment variables
dotenvConfig();

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'relayer.log' }),
    new winston.transports.Console()
  ]
});

// Bridge contract ABI (minimal ABI for required functions and events)
const BRIDGE_ABI = [
  // Events
  'event MessageSent(bytes32 indexed messageId, address indexed sender, address indexed target, bytes data, uint256 nonce)',
  'event MessageReceived(bytes32 indexed messageId, address indexed sender, address indexed target, bytes data, uint256 nonce)',
  // Functions
  'function receiveMessage(bytes32 messageId, address sender, address target, bytes calldata data) external',
  'function isMessageProcessed(bytes32 messageId) external view returns (bool)'
];

// Configuration interface
interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  bridgeAddress: string;
  tokenBridgeAddress: string;
  remoteChainId: number;
}

interface RelayerConfig {
  privateKey: string;
  chains: ChainConfig[];
}

// Load configuration
const configPath = path.resolve(__dirname, 'relayer.config.json');
const config: RelayerConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Validate configuration
if (!config.privateKey || !config.chains || config.chains.length !== 2) {
  logger.error('Invalid configuration: privateKey and exactly two chains are required');
  process.exit(1);
}

// Relayer class
class Relayer {
  private wallets: Map<number, Wallet> = new Map();
  private providers: Map<number, providers.JsonRpcProvider> = new Map();
  private bridgeContracts: Map<number, Contract> = new Map();
  private chainConfigs: Map<number, ChainConfig> = new Map();
  private isRunning: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Initialize providers, wallets, and contracts for each chain
    for (const chain of config.chains) {
      const provider = new providers.JsonRpcProvider(chain.rpcUrl);
      const wallet = new Wallet(config.privateKey, provider);
      const bridgeContract = new Contract(chain.bridgeAddress, BRIDGE_ABI, wallet);

      this.providers.set(chain.chainId, provider);
      this.wallets.set(chain.chainId, wallet);
      this.bridgeContracts.set(chain.chainId, bridgeContract);
      this.chainConfigs.set(chain.chainId, chain);

      logger.info(`Initialized chain ${chain.chainId}: Bridge at ${chain.bridgeAddress}`);
    }
  }

  public async start() {
    if (this.isRunning) {
      logger.warn('Relayer is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting relayer...');

    // Start event listeners for each chain
    for (const [chainId, bridgeContract] of this.bridgeContracts) {
      this.setupEventListener(chainId, bridgeContract);
    }

    // Handle graceful shutdown
    process.on('SIGINT', this.shutdown.bind(this));
    process.on('SIGTERM', this.shutdown.bind(this));
  }

  private setupEventListener(chainId: number, bridgeContract: Contract) {
    logger.info(`Setting up event listener for chain ${chainId}`);

    // Listen for MessageSent events
    bridgeContract.on('MessageSent', async (messageId, sender, target, data, nonce, event) => {
      try {
        logger.info(`Detected MessageSent on chain ${chainId}: messageId=${messageId}, sender=${sender}, target=${target}, nonce=${nonce}`);

        // Get the destination chain configuration
        const sourceChainConfig = this.chainConfigs.get(chainId);
        if (!sourceChainConfig) {
          logger.error(`No configuration found for chain ${chainId}`);
          return;
        }

        const destChainId = sourceChainConfig.remoteChainId;
        const destBridgeContract = this.bridgeContracts.get(destChainId);
        const destProvider = this.providers.get(destChainId);
        const destWallet = this.wallets.get(destChainId);

        if (!destBridgeContract || !destProvider || !destWallet) {
          logger.error(`Destination chain ${destChainId} not initialized`);
          return;
        }

        // Check if the message has already been processed
        const isProcessed = await destBridgeContract.isMessageProcessed(messageId);
        if (isProcessed) {
          logger.warn(`Message ${messageId} already processed on chain ${destChainId}`);
          return;
        }

        // Prepare to relay the message
        const sourceBridgeAddress = this.chainConfigs.get(chainId)?.bridgeAddress;
        if (!sourceBridgeAddress) {
          logger.error(`Source bridge address not found for chain ${chainId}`);
          return;
        }

        // Relay the message to the destination chain
        logger.info(`Relaying message ${messageId} to chain ${destChainId}`);
        const tx = await destBridgeContract.receiveMessage(
          messageId,
          sourceBridgeAddress, // Sender is the source chain's Bridge contract
          target,
          data,
          { gasLimit: 500000 } // Adjust gas limit as needed
        );

        logger.info(`Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
          logger.info(`Message ${messageId} successfully relayed to chain ${destChainId}: tx=${tx.hash}`);
        } else {
          logger.error(`Message ${messageId} relay failed: tx=${tx.hash}`);
        }
      } catch (error: any) {
        logger.error(`Error processing MessageSent for messageId ${messageId}: ${error.message}`);
      }
    });

    logger.info(`Event listener active for chain ${chainId}`);
  }

  private async shutdown() {
    if (!this.isRunning) return;

    logger.info('Shutting down relayer...');
    this.isRunning = false;

    // Remove event listeners
    for (const [chainId, bridgeContract] of this.bridgeContracts) {
      bridgeContract.removeAllListeners();
      logger.info(`Removed listeners for chain ${chainId}`);
    }

    // Disconnect providers
    for (const [chainId, provider] of this.providers) {
      provider.removeAllListeners();
      logger.info(`Disconnected provider for chain ${chainId}`);
    }

    process.exit(0);
  }
}

// Start the relayer
async function main() {
  const relayer = new Relayer();
  await relayer.start();
}

main().catch((error) => {
  logger.error(`Relayer failed to start: ${error.message}`);
  process.exit(1);
});