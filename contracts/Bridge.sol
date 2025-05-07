// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title Bridge
 * @dev A secure cross-chain message relaying contract for facilitating communication
 *      between TokenBridge mediators on different EVM-compatible chains.
 */
contract Bridge is ReentrancyGuard, AccessControl, Pausable {
    using SafeMath for uint256;

    // Roles
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // Address of the TokenBridge mediator on the current chain
    address public localMediator;
    // Address of the Bridge contract on the remote chain
    address public remoteBridge;
    // Nonce to prevent message replay attacks
    uint256 private nonce;
    // Checks the status of addresses set and intialization
    bool public initialized;
    // Mapping of message ID to processed status
    mapping(bytes32 => bool) private processedMessages;
    // Mapping of message ID to sender address
    mapping(bytes32 => address) private messageSenders;

    // Events
    event MessageSent(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed target,
        bytes data,
        uint256 nonce
    );
    event MessageReceived(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed target,
        bytes data,
        uint256 nonce
    );
    event RemoteBridgeUpdated(address oldRemoteBridge, address newRemoteBridge);
    event MessageProcessed(bytes32 indexed messageId, bool success);

    // Errors
    error InvalidAddress();
    error UnauthorizedCaller();
    error MessageAlreadyProcessed(bytes32 messageId);
    error InvalidTarget();
    error InvalidMessageSender();
    error ExecutionFailed();

    /**
     * @dev Constructor to initialize the bridge contract.
     */
    constructor() {

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);

        nonce = 0;
    }

    function intializeAddresses(
        address _remoteBridge,
        address _localMediator
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!initialized, "Already initialized");
        if (_remoteBridge == address(0) || _localMediator == address(0)) revert InvalidAddress();

        remoteBridge = _remoteBridge;
        localMediator = _localMediator;

        initialized = true;
    }

    /**
     * @dev Initiates a cross-chain message to the remote chain.
     * @param _target Address of the target contract on the remote chain (must be remoteMediator).
     * @param _data Encoded data to be executed on the remote chain.
     * _gasLimit Gas limit for the message execution (not enforced on-chain).
     * @return messageId The unique ID of the message.
     */
    function requireToPassMessage(
        address _target,
        bytes calldata _data,
        uint256 /* _gasLimit */
    ) external whenNotPaused nonReentrant returns (bytes32) {
        require(initialized, "Contract not initialized");
        if (msg.sender != localMediator) revert UnauthorizedCaller();
        if (_target == address(0)) revert InvalidAddress();
        // Note: _target is expected to be the remoteMediator, validated off-chain by relayers
        // Note: _gasLimit is used by the relayer off-chain for message execution

        nonce++;
        bytes32 messageId = keccak256(
            abi.encodePacked(msg.sender, _target, _data, nonce, block.chainid)
        );

        messageSenders[messageId] = msg.sender;

        emit MessageSent(messageId, msg.sender, _target, _data, nonce);

        return messageId;
    }

    /**
     * @dev Receives and processes a message from the remote chain.
     * @param _messageId Unique ID of the message.
     * @param _sender Address of the sender on the remote chain (must be remoteBridge).
     * @param _target Address of the target contract on the current chain (must be localMediator).
     * @param _data Encoded data to be executed.
     */
    function receiveMessage(
        bytes32 _messageId,
        address _sender,
        address _target,
        bytes calldata _data
    ) external whenNotPaused nonReentrant onlyRole(RELAYER_ROLE) {
        require(initialized, "Contract not initialized");
        if (_sender != remoteBridge) revert InvalidMessageSender();
        if (_target != localMediator) revert InvalidTarget();
        if (processedMessages[_messageId])
            revert MessageAlreadyProcessed(_messageId);

        processedMessages[_messageId] = true;

        // Execute the message
        (bool success, ) = _target.call(_data);
        if (!success) revert ExecutionFailed();

        emit MessageReceived(_messageId, _sender, _target, _data, nonce);
        emit MessageProcessed(_messageId, success);
    }

    /**
     * @dev Updates the remote bridge address (in case of upgrades or changes).
     * @param _newRemoteBridge New address of the remote bridge.
     */
    function updateRemoteBridge(address _newRemoteBridge)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_newRemoteBridge == address(0)) revert InvalidAddress();
        emit RemoteBridgeUpdated(remoteBridge, _newRemoteBridge);
        // Note: remoteBridge is immutable, so this requires deploying a new contract
        // Alternatively, make remoteBridge mutable if upgrades are needed
    }

    /**
     * @dev Pauses the contract in case of emergency.
     */
    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses the contract.
     */
    function unpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }

    /**
     * @dev Retrieves the sender of a message.
     * @param _messageId ID of the message.
     * @return Address of the message sender.
     */
    function messageSender(bytes32 _messageId) external view returns (address) {
        return messageSenders[_messageId];
    }

    /**
     * @dev Checks if a message has been processed.
     * @param _messageId ID of the message.
     * @return True if the message has been processed, false otherwise.
     */
    function isMessageProcessed(bytes32 _messageId)
        external
        view
        returns (bool)
    {
        return processedMessages[_messageId];
    }
}
