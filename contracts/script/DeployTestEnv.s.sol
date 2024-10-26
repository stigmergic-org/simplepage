// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/SimplePage.sol";
import "../src/SimplePageManager.sol";
import "./NameCoder.sol";

// Mock resolver contract defined inline
contract MockResolver {
    event ContenthashChanged(bytes32 indexed node, bytes hash);

    mapping(bytes32 => bytes) private _contenthash;
    mapping(bytes32 => mapping(string => string)) private _text;

    function setContenthash(bytes32 node, bytes calldata hash) external {
        _contenthash[node] = hash;
        emit ContenthashChanged(node, hash);
    }

    function contenthash(bytes32 node) external view returns (bytes memory) {
        return _contenthash[node];
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        _text[node][key] = value;
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return _text[node][key];
    }
}

contract MockUniversalResolver {
    mapping(bytes32 => address) public resolvers;

    event NewResolver(bytes32 indexed node, address resolver);

    function setResolver(bytes32 node, address newResolver) external {
        resolvers[node] = newResolver;
        emit NewResolver(node, newResolver);
    }

    function resolver(bytes32 node) public view returns (address) {
        return resolvers[node];
    }

    // Universal Resolver specific functions
    function findResolver(bytes calldata name) external view returns (address, bytes32, uint256) {
        bytes32 node = NameCoder.namehash(name, 0);
        return (resolvers[node], node, 0);
    }

    // Add resolve function for test compatibility
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory, address) {
        bytes32 node = NameCoder.namehash(name, 0);
        address nodeResolver = resolvers[node];
        require(nodeResolver != address(0), "No resolver set");
        (bool success, bytes memory result) = nodeResolver.staticcall(data);
        require(success, "Resolver call failed");
        return (result, nodeResolver);
    }
}

contract MockPriceFeed {
    int256 public price;

    constructor(int256 _price) {
        price = _price;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (0, price, 0, 0, 0);
    }
}

contract DeployTestEnv is Script {
    function run() public {
        vm.startBroadcast();

        // Deploy mock resolver
        MockResolver resolver1 = new MockResolver();
        MockResolver resolver2 = new MockResolver();
        MockResolver resolver3 = new MockResolver();

        // Deploy mock universal resolver
        MockUniversalResolver universalResolver = new MockUniversalResolver();

        // Deploy Pages contract
        SimplePage pages = new SimplePage();
        pages.grantRole(pages.MINTER_ROLE(), msg.sender);

        // Log deployment info as JSON
        console.log(
            string.concat(
                '{"resolver1":"',
                vm.toString(address(resolver1)),
                '","resolver2":"',
                vm.toString(address(resolver2)),
                '","resolver3":"',
                vm.toString(address(resolver3)),
                '","universalResolver":"',
                vm.toString(address(universalResolver)),
                '","simplepage":"',
                vm.toString(address(pages)),
                '"}'
            )
        );

        vm.stopBroadcast();
    }

    function runWithManager() public {
        vm.startBroadcast();

        // Deploy mock resolver
        MockResolver resolver1 = new MockResolver();
        MockResolver resolver2 = new MockResolver();
        MockResolver resolver3 = new MockResolver();

        // Deploy mock universal resolver
        MockUniversalResolver universalResolver = new MockUniversalResolver();

        // Deploy Pages contract
        SimplePage pages = new SimplePage();

        // Deploy mock price feed (e.g. 2000 USD, 8 decimals)
        MockPriceFeed priceFeed = new MockPriceFeed(2000e8);

        // Deploy SimplePageManager
        SimplePageManager manager = new SimplePageManager(address(pages), msg.sender, address(priceFeed));
        pages.grantRole(pages.MINTER_ROLE(), address(manager));

        // Log deployment info as JSON
        console.log(
            string.concat(
                '{"resolver1":"',
                vm.toString(address(resolver1)),
                '","resolver2":"',
                vm.toString(address(resolver2)),
                '","resolver3":"',
                vm.toString(address(resolver3)),
                '","universalResolver":"',
                vm.toString(address(universalResolver)),
                '","simplepage":"',
                vm.toString(address(pages)),
                '","manager":"',
                vm.toString(address(manager)),
                '","priceFeed":"',
                vm.toString(address(priceFeed)),
                '"}'
            )
        );

        vm.stopBroadcast();
    }
}
