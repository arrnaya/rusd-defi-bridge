// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

interface IBridge {
    function requireToPassMessage(
        address _target,
        bytes calldata _data,
        uint256 _gasLimit
    ) external returns (bytes32);

    function messageSender() external view returns (address);
}

interface IERC20Detailed is IERC20 {
    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);
}

/**
 * @title TokenBridge
 * @dev A secure cross-chain token bridge for transferring ERC20 tokens between EVM-compatible chains.
 *      Includes robust security measures, access control, and emergency pause functionality.
 */
contract TokenBridge is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    // Roles
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // Bridge contract on the current chain
    IBridge public immutable bridgeContract;
    // Mediator contract address on the destination chain
    address public immutable remoteMediator;
    // Gas limit for cross-chain message passing
    uint256 public requestGasLimit;

    // Nonce to prevent message replay attacks
    uint256 private nonce;
    // Mapping of local token to remote token addresses
    mapping(address => address) private tokenMapping;
    // Mapping of message ID to message details
    mapping(bytes32 => Message) private messages;
    // Mapping of message ID to fixed status
    mapping(bytes32 => bool) private messageFixed;

    // Struct to store message details
    struct Message {
        address recipient;
        address tokenAddress;
        uint256 value;
        uint256 nonce;
    }

    // Events
    event TokensLocked(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed recipient,
        address localToken,
        address remoteToken,
        uint256 value,
        uint256 nonce
    );
    event TokensUnlocked(
        bytes32 indexed messageId,
        address indexed recipient,
        address tokenAddress,
        uint256 value,
        uint256 nonce
    );
    event FailedMessageFixed(
        bytes32 indexed messageId,
        address indexed recipient,
        address tokenAddress,
        uint256 value
    );
    event TokenMappingUpdated(
        address indexed localToken,
        address indexed remoteToken
    );
    event RequestGasLimitUpdated(uint256 oldGasLimit, uint256 newGasLimit);
    event TokensClaimed(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    // Errors
    error InvalidAddress();
    error TokenNotMapped(address token);
    error UnauthorizedCaller();
    error MessageAlreadyFixed(bytes32 messageId);
    error InvalidMessageSender();
    error InsufficientBalance(
        address token,
        uint256 required,
        uint256 available
    );
    error MessageNotFound(bytes32 messageId);

    /**
     * @dev Constructor to initialize the bridge contract.
     * @param _bridgeContract Address of the bridge contract on the current chain.
     * @param _remoteMediator Address of the mediator contract on the destination chain.
     * @param _requestGasLimit Gas limit for cross-chain message passing.
     */
    constructor(
        address _bridgeContract,
        address _remoteMediator,
        uint256 _requestGasLimit
    ) {
        if (_bridgeContract == address(0) || _remoteMediator == address(0))
            revert InvalidAddress();

        bridgeContract = IBridge(_bridgeContract);
        remoteMediator = _remoteMediator;
        requestGasLimit = _requestGasLimit;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);

        nonce = 0;
    }

    /**
     * @dev Initiates a token transfer from the current chain to the destination chain.
     * @param _recipient Address on the destination chain to receive the tokens.
     * @param _tokenAddress Address of the token on the current chain.
     * @param _value Amount of tokens to transfer.
     */
    function transferToken(
        address _recipient,
        address _tokenAddress,
        uint256 _value
    ) external whenNotPaused nonReentrant {
        if (_recipient == address(0) || _tokenAddress == address(0))
            revert InvalidAddress();
        if (_value == 0) revert InvalidAddress();
        if (tokenMapping[_tokenAddress] == address(0))
            revert TokenNotMapped(_tokenAddress);

        // Lock tokens
        IERC20 token = IERC20(_tokenAddress);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), _value);
        uint256 balanceAfter = token.balanceOf(address(this));
        uint256 actualValue = balanceAfter.sub(balanceBefore);

        // Increment nonce
        nonce++;

        // Prepare message
        bytes memory data = abi.encodeWithSelector(
            this.handleBridgedTokens.selector,
            _recipient,
            tokenMapping[_tokenAddress],
            actualValue,
            nonce
        );

        // Send cross-chain message
        bytes32 messageId = bridgeContract.requireToPassMessage(
            remoteMediator,
            data,
            requestGasLimit
        );

        // Store message details
        messages[messageId] = Message({
            recipient: _recipient,
            tokenAddress: _tokenAddress,
            value: actualValue,
            nonce: nonce
        });

        emit TokensLocked(
            messageId,
            msg.sender,
            _recipient,
            _tokenAddress,
            tokenMapping[_tokenAddress],
            actualValue,
            nonce
        );
    }

    /**
     * @dev Handles incoming bridged tokens on the destination chain.
     * @param _recipient Address to receive the tokens.
     * @param _tokenAddress Address of the token on the destination chain.
     * @param _value Amount of tokens to unlock.
     * @param _nonce Nonce of the message.
     */
    function handleBridgedTokens(
        address _recipient,
        address _tokenAddress,
        uint256 _value,
        uint256 _nonce
    ) external whenNotPaused nonReentrant {
        if (msg.sender != address(bridgeContract)) revert UnauthorizedCaller();
        if (bridgeContract.messageSender() != remoteMediator)
            revert InvalidMessageSender();
        if (_recipient == address(0) || _tokenAddress == address(0))
            revert InvalidAddress();
        if (_value == 0) revert InvalidAddress();

        // Verify token balance
        IERC20 token = IERC20(_tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        if (balance < _value)
            revert InsufficientBalance(_tokenAddress, _value, balance);

        // Unlock tokens
        token.safeTransfer(_recipient, _value);

        // Generate a deterministic message ID for event logging
        bytes32 messageId = keccak256(
            abi.encodePacked(_recipient, _tokenAddress, _value, _nonce)
        );

        emit TokensUnlocked(
            messageId,
            _recipient,
            _tokenAddress,
            _value,
            _nonce
        );
    }

    /**
     * @dev Fixes a failed message by unlocking tokens on the current chain.
     * @param _messageId ID of the failed message.
     */
    function fixFailedMessage(bytes32 _messageId)
        external
        whenNotPaused
        nonReentrant
    {
        if (msg.sender != address(bridgeContract)) revert UnauthorizedCaller();
        if (bridgeContract.messageSender() != remoteMediator)
            revert InvalidMessageSender();
        if (messageFixed[_messageId]) revert MessageAlreadyFixed(_messageId);
        if (messages[_messageId].recipient == address(0))
            revert MessageNotFound(_messageId);

        Message memory message = messages[_messageId];
        messageFixed[_messageId] = true;

        // Unlock tokens
        IERC20(messages[_messageId].tokenAddress).safeTransfer(
            message.recipient,
            message.value
        );

        emit FailedMessageFixed(
            _messageId,
            message.recipient,
            message.tokenAddress,
            message.value
        );
    }

    /**
     * @dev Sets the token mapping between local and remote chains.
     * @param _localToken Address of the token on the current chain.
     * @param _remoteToken Address of the token on the destination chain.
     */
    function setTokenMapping(address _localToken, address _remoteToken)
        external
        onlyRole(OPERATOR_ROLE)
    {
        if (_localToken == address(0) || _remoteToken == address(0))
            revert InvalidAddress();
        tokenMapping[_localToken] = _remoteToken;
        emit TokenMappingUpdated(_localToken, _remoteToken);
    }

    /**
     * @dev Updates the gas limit for cross-chain message passing.
     * @param _newGasLimit New gas limit.
     */
    function setRequestGasLimit(uint256 _newGasLimit)
        external
        onlyRole(OPERATOR_ROLE)
    {
        if (_newGasLimit == 0) revert InvalidAddress();
        emit RequestGasLimitUpdated(requestGasLimit, _newGasLimit);
        requestGasLimit = _newGasLimit;
    }

    /**
     * @dev Claims tokens accidentally sent to the contract (emergency recovery).
     * @param _token Address of the token to claim.
     * @param _to Address to send the tokens to.
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
     * @dev Retrieves the token mapping for a local token.
     * @param _localToken Address of the local token.
     * @return Address of the remote token.
     */
    function getTokenMapping(address _localToken)
        external
        view
        returns (address)
    {
        return tokenMapping[_localToken];
    }

    /**
     * @dev Retrieves message details for a given message ID.
     * @param _messageId ID of the message.
     * @return Message struct containing recipient, token address, value, and nonce.
     */
    function getMessage(bytes32 _messageId)
        external
        view
        returns (Message memory)
    {
        return messages[_messageId];
    }

    /**
     * @dev Checks if a message has been fixed.
     * @param _messageId ID of the message.
     * @return True if the message has been fixed, false otherwise.
     */
    function isMessageFixed(bytes32 _messageId) external view returns (bool) {
        return messageFixed[_messageId];
    }
}
