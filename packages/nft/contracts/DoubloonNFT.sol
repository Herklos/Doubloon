// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC5643 {
    event SubscriptionUpdate(uint256 indexed tokenId, uint64 expiration);
    function renewSubscription(uint256 tokenId, uint64 duration) external payable;
    function cancelSubscription(uint256 tokenId) external payable;
    function expiresAt(uint256 tokenId) external view returns (uint64);
    function isRenewable(uint256 tokenId) external view returns (bool);
}

contract DoubloonNFT is IERC5643 {
    string public name = "Doubloon Subscription";
    string public symbol = "DBLN";
    address public owner;
    address public doubloonContract;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => uint64) private _expirations;
    mapping(uint256 => bool) private _renewable;

    modifier onlyOwnerOrContract() {
        require(msg.sender == owner || msg.sender == doubloonContract, "Not authorized");
        _;
    }

    constructor(address _doubloon) {
        owner = msg.sender;
        doubloonContract = _doubloon;
    }

    function mintSubscriptionNFT(
        bytes32 productId,
        address user,
        uint64 expiration,
        bool renewable
    ) external onlyOwnerOrContract {
        uint256 tokenId = uint256(keccak256(abi.encodePacked(productId, user)));

        if (_owners[tokenId] == address(0)) {
            _owners[tokenId] = user;
            _balances[user]++;
        }

        _expirations[tokenId] = expiration;
        _renewable[tokenId] = renewable;
        emit SubscriptionUpdate(tokenId, expiration);
    }

    function expiresAt(uint256 tokenId) external view override returns (uint64) {
        return _expirations[tokenId];
    }

    function isRenewable(uint256 tokenId) external view override returns (bool) {
        return _renewable[tokenId];
    }

    function renewSubscription(uint256 tokenId, uint64 duration) external payable override {
        require(msg.sender == doubloonContract || msg.sender == owner, "Not authorized");
        _expirations[tokenId] = uint64(block.timestamp) + duration;
        emit SubscriptionUpdate(tokenId, _expirations[tokenId]);
    }

    function cancelSubscription(uint256 tokenId) external payable override {
        require(msg.sender == doubloonContract || msg.sender == owner, "Not authorized");
        _renewable[tokenId] = false;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function computeTokenId(bytes32 productId, address user) external pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(productId, user)));
    }
}
