// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.17;

import "./IERC20.sol";
import "./SafeERC20.sol";
import "./ReentrancyGuard.sol";
import "./AccessControl.sol";
import "./Pausable.sol";

interface IERC20Detailed is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

/**
 * @title TokenBridge
 * @dev A secure cross-chain token bridge for transferring ERC20 tokens between EVM-compatible chains,
 *      with integrated message relaying and robust security measures.
 */
contract TokenBridge is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    // Roles
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // Configuration
    address public remoteTokenBridge; // Bridge contract on the remote chain
    uint256 public requestGasLimit; // Gas limit for cross-chain messages
    bool public initialized; // Initialization status
    uint256 private nonce; // Nonce for message uniqueness

    // Mappings
    mapping(address => address) private tokenMapping; // Local to remote token addresses
    mapping(bytes32 => bool) private processedMessages; // Message ID to processed status
    mapping(bytes32 => address) private messageSenders; // Message ID to sender
    mapping(bytes32 => Message) private messages; // Message ID to details
    mapping(bytes32 => bool) private messageFixed; // Message ID to fixed status

    // Struct for message details
    struct Message {
        address recipient;
        address tokenAddress;
        uint256 value;
        uint256 nonce;
    }

    // Events
    event MessageSent(bytes32 indexed messageId, address indexed sender, address indexed target, bytes data, uint256 nonce);
    event MessageReceived(bytes32 indexed messageId, address indexed sender, address indexed target, bytes data, uint256 nonce);
    event MessageProcessed(bytes32 indexed messageId, bool success);
    event TokensLocked(bytes32 indexed messageId, address indexed sender, address indexed recipient, address localToken, address remoteToken, uint256 value, uint256 nonce);
    event TokensUnlocked(bytes32 indexed messageId, address indexed recipient, address tokenAddress, uint256 value, uint256 nonce);
    event FailedMessageFixed(bytes32 indexed messageId, address indexed recipient, address tokenAddress, uint256 value);
    event TokenMappingUpdated(address indexed localToken, address indexed remoteToken);
    event RemoteBridgeUpdated(address oldRemoteBridge, address newRemoteBridge);
    event RemoteMediatorUpdated(address oldRemoteMediator, address newRemoteMediator);
    event RequestGasLimitUpdated(uint256 oldGasLimit, uint256 newGasLimit);
    event TokensClaimed(address indexed token, address indexed to, uint256 amount);

    // Errors
    error InvalidAddress(); // 0xe83ab09d
    error UnauthorizedCaller(); // 0xa7b4e3e7
    error MessageAlreadyProcessed(bytes32 messageId); // 0x9d4e14e3
    error InvalidTarget(); // 0xacfdb444
    error InvalidMessageSender(); // 0x1b4aa4e4
    error ExecutionFailed(); // 0x94bc9b42
    error TokenNotMapped(address token); // 0x7b4e3e7
    error MessageAlreadyFixed(bytes32 messageId); // 0x2b4e3e7
    error InsufficientBalance(address token, uint256 required, uint256 available); // 0x3b4e3e7
    error MessageNotFound(bytes32 messageId); // 0x4b4e3e7
    error NotInitialized(); // 0x5b4e3e7

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        nonce = 0;
        requestGasLimit = 800000;
    }

    /**
     * @dev Initializes the contract with bridge and token mapping parameters.
     * @param _remoteTokenBridge Remote bridge contract address.
     * @param _localToken Local token address.
     * @param _remoteToken Remote token address.
     */
    function initialize(address _remoteTokenBridge, address _localToken, address _remoteToken)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (initialized) revert NotInitialized();
        if (_remoteTokenBridge == address(0) || _localToken == address(0) || _remoteToken == address(0))
            revert InvalidAddress();

        remoteTokenBridge = _remoteTokenBridge;
        tokenMapping[_localToken] = _remoteToken;
        initialized = true;

        emit RemoteBridgeUpdated(address(0), _remoteTokenBridge);
        emit TokenMappingUpdated(_localToken, _remoteToken);
    }

    /**
     * @dev Initiates a token transfer to the remote chain.
     * @param _recipient Recipient address on the remote chain.
     * @param _tokenAddress Local token address.
     * @param _value Amount of tokens to transfer.
     * @return messageId Unique message ID.
     */
    function transferToken(address _recipient, address _tokenAddress, uint256 _value)
        external
        whenNotPaused
        nonReentrant
        returns (bytes32)
    {
        if (!initialized) revert NotInitialized();
        if (_recipient == address(0) || _tokenAddress == address(0) || _value == 0) revert InvalidAddress();
        if (tokenMapping[_tokenAddress] == address(0)) revert TokenNotMapped(_tokenAddress);

        // Lock tokens
        IERC20 token = IERC20(_tokenAddress);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), _value);
        uint256 balanceAfter = token.balanceOf(address(this));
        uint256 actualValue = balanceAfter - balanceBefore;

        // Increment nonce and generate message ID
        nonce++;
        bytes32 messageId = keccak256(abi.encodePacked(msg.sender, remoteTokenBridge, _tokenAddress, actualValue, nonce, block.chainid));
        messageSenders[messageId] = msg.sender;

        // Prepare and encode message
        bytes memory data = abi.encodeWithSelector(
            this.handleBridgedTokens.selector,
            _recipient,
            tokenMapping[_tokenAddress],
            actualValue,
            nonce
        );

        // Store message
        messages[messageId] = Message({
            recipient: _recipient,
            tokenAddress: _tokenAddress,
            value: actualValue,
            nonce: nonce
        });

        emit MessageSent(messageId, msg.sender, remoteTokenBridge, data, nonce);
        emit TokensLocked(messageId, msg.sender, _recipient, _tokenAddress, tokenMapping[_tokenAddress], actualValue, nonce);

        return messageId;
    }

    /**
     * @dev Processes a message from the remote chain.
     * @param _messageId Unique message ID.
     * @param _sender Sender address (remote bridge).
     * @param _target Target address (this contract).
     * @param _data Encoded data to execute.
     */
    function receiveMessage(bytes32 _messageId, address _sender, address _target, bytes calldata _data)
        external
        whenNotPaused
        onlyRole(RELAYER_ROLE)
    {
        if (!initialized) revert NotInitialized();
        if (_sender != remoteTokenBridge) revert InvalidMessageSender();
        if (_target != address(this)) revert InvalidTarget();
        if (processedMessages[_messageId]) revert MessageAlreadyProcessed(_messageId);

        processedMessages[_messageId] = true;

        // Execute the message
        (bool success, bytes memory returnData) = address(this).call(_data);
        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    revert(add(returnData, 32), mload(returnData))
                }
            }
            revert ExecutionFailed();
        }

        emit MessageReceived(_messageId, _sender, _target, _data, nonce);
        emit MessageProcessed(_messageId, success);
    }

    /**
     * @dev Handles incoming bridged tokens on the destination chain.
     * @param _recipient Recipient address.
     * @param _tokenAddress Remote token address.
     * @param _value Amount of tokens.
     * @param _nonce Message nonce.
     */
    function handleBridgedTokens(address _recipient, address _tokenAddress, uint256 _value, uint256 _nonce)
        external
        nonReentrant
        whenNotPaused
    {
        if (!initialized) revert NotInitialized();
        if (msg.sender != address(this)) revert UnauthorizedCaller();
        if (_recipient == address(0) || _tokenAddress == address(0) || _value == 0) revert InvalidAddress();

        IERC20 token = IERC20(_tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        if (balance < _value) revert InsufficientBalance(_tokenAddress, _value, balance);

        token.safeTransfer(_recipient, _value);

        bytes32 messageId = keccak256(abi.encodePacked(_recipient, _tokenAddress, _value, _nonce));
        emit TokensUnlocked(messageId, _recipient, _tokenAddress, _value, _nonce);
    }

    /**
     * @dev Refunds tokens on the source chain for a failed message.
     * @param _messageId ID of the failed message.
     */
    function fixFailedMessage(bytes32 _messageId)
        external
        whenNotPaused
        nonReentrant
        onlyRole(RELAYER_ROLE)
    {
        if (!initialized) revert NotInitialized();
        if (messageFixed[_messageId]) revert MessageAlreadyFixed(_messageId);
        if (messages[_messageId].recipient == address(0)) revert MessageNotFound(_messageId);

        Message memory message = messages[_messageId];
        messageFixed[_messageId] = true;

        IERC20(messages[_messageId].tokenAddress).safeTransfer(message.recipient, message.value);

        emit FailedMessageFixed(_messageId, message.recipient, message.tokenAddress, message.value);
    }

    /**
     * @dev Updates configuration parameters.
     */
    function updateRemoteBridge(address _newRemoteBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_newRemoteBridge == address(0) && _newRemoteBridge == remoteTokenBridge) revert InvalidAddress();
        remoteTokenBridge = _newRemoteBridge;
        emit RemoteBridgeUpdated(remoteTokenBridge, _newRemoteBridge);
    }

    function setTokenMapping(address _localToken, address _remoteToken) external onlyRole(OPERATOR_ROLE) {
        if (_localToken == address(0) || _remoteToken == address(0)) revert InvalidAddress();
        tokenMapping[_localToken] = _remoteToken;
        emit TokenMappingUpdated(_localToken, _remoteToken);
    }

    function setRequestGasLimit(uint256 _newGasLimit) external onlyRole(OPERATOR_ROLE) {
        if (_newGasLimit == 0) revert InvalidAddress();
        emit RequestGasLimitUpdated(requestGasLimit, _newGasLimit);
        requestGasLimit = _newGasLimit;
    }

    /**
     * @dev Emergency token recovery.
     * @param _token Token address.
     * @param _to Recipient address.
     */
    function claimTokens(address _token, address _to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        if (_to == address(0)) revert InvalidAddress();
        IERC20 token = IERC20(_token);
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.safeTransfer(_to, balance);
            emit TokensClaimed(_token, _to, balance);
        }
    }

    /**
     * @dev Pause and unpause functions.
     */
    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }

    /**
     * @dev View functions.
     */
    function messageSender(bytes32 _messageId) external view returns (address) {
        return messageSenders[_messageId];
    }

    function isMessageProcessed(bytes32 _messageId) external view returns (bool) {
        return processedMessages[_messageId];
    }

    function getTokenMapping(address _localToken) external view returns (address) {
        return tokenMapping[_localToken];
    }

    function getMessage(bytes32 _messageId) external view returns (Message memory) {
        return messages[_messageId];
    }

    function isMessageFixed(bytes32 _messageId) external view returns (bool) {
        return messageFixed[_messageId];
    }
}