/*
 Copyright (c) 2022 Radar Global

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TheStableMoney is ERC20 {
    address public owner;
    address public pendingOwner;

    mapping(address => bool) public minter;

    bytes32 immutable public DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant PERMIT_TYPEHASH = 0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint) public nonces;

    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner {
        require(msg.sender == owner, "Unauthorized");
        _;
    }

    modifier onlyMinter {
        require(minter[msg.sender] == true, "Unauthorized");
        _;
    }

    constructor() ERC20("The Stable Money", "TSM") {
        owner = msg.sender;
        minter[msg.sender] = true;

        // Build DOMAIN_SEPARATOR
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("The Stable Money")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        emit MinterAdded(msg.sender);
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // User functions

    // EIP-2612: permit() https://eips.ethereum.org/EIPS/eip-2612
    function permit(address _owner, address _spender, uint _value, uint _deadline, uint8 _v, bytes32 _r, bytes32 _s) external {
        require(_deadline >= block.timestamp, "Permit: EXPIRED");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, _owner, _spender, _value, nonces[_owner]++, _deadline))
            )
        );
        address recoveredAddress = ecrecover(digest, _v, _r, _s);
        require(recoveredAddress != address(0) && recoveredAddress == _owner, "Permit: INVALID_SIGNATURE");
        _approve(_owner, _spender, _value);
    }

    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }

    // Minter functions

    function mint(address _to, uint256 _amount) external onlyMinter {
        _mint(_to, _amount);
    }

    // Owner Functions

    function addMinter(address _minter) external onlyOwner {
        minter[_minter] = true;
        emit MinterAdded(_minter);
    }

    function removeMinter(address _minter) external onlyOwner {
        minter[_minter] = false;
        emit MinterRemoved(_minter);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        pendingOwner = _newOwner;
    }

    function claimOwnership() external {
        require(msg.sender == pendingOwner, "Unauthorized");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }
}