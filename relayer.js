"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var ethers_1 = require("ethers");
var dotenv_1 = require("dotenv");
var fs_1 = require("fs");
var path_1 = require("path");
var winston_1 = require("winston");
// Load environment variables
(0, dotenv_1.config)();
// Logger setup
var logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.File({ filename: 'relayer.log' }),
        new winston_1.default.transports.Console()
    ]
});
// Bridge contract ABI (minimal ABI for required functions and events)
var BRIDGE_ABI = [
    // Events
    'event MessageSent(bytes32 indexed messageId, address indexed sender, address indexed target, bytes data, uint256 nonce)',
    'event MessageReceived(bytes32 indexed messageId, address indexed sender, address indexed target, bytes data, uint256 nonce)',
    // Functions
    'function receiveMessage(bytes32 messageId, address sender, address target, bytes calldata data) external',
    'function isMessageProcessed(bytes32 messageId) external view returns (bool)'
];
// Load configuration
var configPath = path_1.default.resolve(__dirname, 'relayer.config.json');
var config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf-8'));
// Validate configuration
if (!config.privateKey || !config.chains || config.chains.length !== 2) {
    logger.error('Invalid configuration: privateKey and exactly two chains are required');
    process.exit(1);
}
// Relayer class
var Relayer = /** @class */ (function () {
    function Relayer() {
        this.wallets = new Map();
        this.providers = new Map();
        this.bridgeContracts = new Map();
        this.chainConfigs = new Map();
        this.isRunning = false;
        this.initialize();
    }
    Relayer.prototype.initialize = function () {
        // Initialize providers, wallets, and contracts for each chain
        for (var _i = 0, _a = config.chains; _i < _a.length; _i++) {
            var chain = _a[_i];
            var provider = new ethers_1.providers.JsonRpcProvider(chain.rpcUrl);
            var wallet = new ethers_1.Wallet(config.privateKey, provider);
            var bridgeContract = new ethers_1.Contract(chain.bridgeAddress, BRIDGE_ABI, wallet);
            this.providers.set(chain.chainId, provider);
            this.wallets.set(chain.chainId, wallet);
            this.bridgeContracts.set(chain.chainId, bridgeContract);
            this.chainConfigs.set(chain.chainId, chain);
            logger.info("Initialized chain ".concat(chain.chainId, ": Bridge at ").concat(chain.bridgeAddress));
        }
    };
    Relayer.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, _b, chainId, bridgeContract;
            return __generator(this, function (_c) {
                if (this.isRunning) {
                    logger.warn('Relayer is already running');
                    return [2 /*return*/];
                }
                this.isRunning = true;
                logger.info('Starting relayer...');
                // Start event listeners for each chain
                for (_i = 0, _a = this.bridgeContracts; _i < _a.length; _i++) {
                    _b = _a[_i], chainId = _b[0], bridgeContract = _b[1];
                    this.setupEventListener(chainId, bridgeContract);
                }
                // Handle graceful shutdown
                process.on('SIGINT', this.shutdown.bind(this));
                process.on('SIGTERM', this.shutdown.bind(this));
                return [2 /*return*/];
            });
        });
    };
    Relayer.prototype.setupEventListener = function (chainId, bridgeContract) {
        var _this = this;
        logger.info("Setting up event listener for chain ".concat(chainId));
        // Listen for MessageSent events
        bridgeContract.on('MessageSent', function (messageId, sender, target, data, nonce, event) { return __awaiter(_this, void 0, void 0, function () {
            var sourceChainConfig, destChainId, destBridgeContract, destProvider, destWallet, isProcessed, sourceBridgeAddress, tx, receipt, error_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 4, , 5]);
                        logger.info("Detected MessageSent on chain ".concat(chainId, ": messageId=").concat(messageId, ", sender=").concat(sender, ", target=").concat(target, ", nonce=").concat(nonce));
                        sourceChainConfig = this.chainConfigs.get(chainId);
                        if (!sourceChainConfig) {
                            logger.error("No configuration found for chain ".concat(chainId));
                            return [2 /*return*/];
                        }
                        destChainId = sourceChainConfig.remoteChainId;
                        destBridgeContract = this.bridgeContracts.get(destChainId);
                        destProvider = this.providers.get(destChainId);
                        destWallet = this.wallets.get(destChainId);
                        if (!destBridgeContract || !destProvider || !destWallet) {
                            logger.error("Destination chain ".concat(destChainId, " not initialized"));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, destBridgeContract.isMessageProcessed(messageId)];
                    case 1:
                        isProcessed = _b.sent();
                        if (isProcessed) {
                            logger.warn("Message ".concat(messageId, " already processed on chain ").concat(destChainId));
                            return [2 /*return*/];
                        }
                        sourceBridgeAddress = (_a = this.chainConfigs.get(chainId)) === null || _a === void 0 ? void 0 : _a.bridgeAddress;
                        if (!sourceBridgeAddress) {
                            logger.error("Source bridge address not found for chain ".concat(chainId));
                            return [2 /*return*/];
                        }
                        // Relay the message to the destination chain
                        logger.info("Relaying message ".concat(messageId, " to chain ").concat(destChainId));
                        return [4 /*yield*/, destBridgeContract.receiveMessage(messageId, sourceBridgeAddress, // Sender is the source chain's Bridge contract
                            target, data, { gasLimit: 500000 } // Adjust gas limit as needed
                            )];
                    case 2:
                        tx = _b.sent();
                        logger.info("Transaction sent: ".concat(tx.hash));
                        return [4 /*yield*/, tx.wait()];
                    case 3:
                        receipt = _b.sent();
                        if (receipt.status === 1) {
                            logger.info("Message ".concat(messageId, " successfully relayed to chain ").concat(destChainId, ": tx=").concat(tx.hash));
                        }
                        else {
                            logger.error("Message ".concat(messageId, " relay failed: tx=").concat(tx.hash));
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _b.sent();
                        logger.error("Error processing MessageSent for messageId ".concat(messageId, ": ").concat(error_1.message));
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); });
        logger.info("Event listener active for chain ".concat(chainId));
    };
    Relayer.prototype.shutdown = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, _b, chainId, bridgeContract, _c, _d, _e, chainId, provider;
            return __generator(this, function (_f) {
                if (!this.isRunning)
                    return [2 /*return*/];
                logger.info('Shutting down relayer...');
                this.isRunning = false;
                // Remove event listeners
                for (_i = 0, _a = this.bridgeContracts; _i < _a.length; _i++) {
                    _b = _a[_i], chainId = _b[0], bridgeContract = _b[1];
                    bridgeContract.removeAllListeners();
                    logger.info("Removed listeners for chain ".concat(chainId));
                }
                // Disconnect providers
                for (_c = 0, _d = this.providers; _c < _d.length; _c++) {
                    _e = _d[_c], chainId = _e[0], provider = _e[1];
                    provider.removeAllListeners();
                    logger.info("Disconnected provider for chain ".concat(chainId));
                }
                process.exit(0);
                return [2 /*return*/];
            });
        });
    };
    return Relayer;
}());
// Start the relayer
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var relayer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    relayer = new Relayer();
                    return [4 /*yield*/, relayer.start()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (error) {
    logger.error("Relayer failed to start: ".concat(error.message));
    process.exit(1);
});
