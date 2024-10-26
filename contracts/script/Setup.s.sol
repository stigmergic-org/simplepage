// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SimplePage.sol";
import "../src/SimplePageManager.sol";
import "../src/TokenRenderer.sol";

/*
To deploy contracts:

forge script script/Setup.s.sol:SetupScript \
    --rpc-url <your_rpc_url> \
    --private-key <your_private_key> \
    --broadcast \
    --verify \
    -vvvv \
    --sig "run(address,address)" <beneficiary_address> <price_feed_address>

Example:
forge script script/Setup.s.sol:SetupScript \
    --rpc-url https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY \
    --private-key 0xabc123... \
    --broadcast \
    --verify \
    -vvvv \
    --sig "run(address,address)" 0x1234... 0x5678...

Note: 
- Replace <your_rpc_url> with your RPC endpoint
- Replace <your_private_key> with deployer private key
- Replace <beneficiary_address> with address to receive fees
- Replace <price_feed_address> with Chainlink ETH/USD price feed address
*/

contract SetupScript is Script {
    function run(address beneficiary, address priceFeed) external {
        vm.startBroadcast();

        (, address msgSender,) = vm.readCallers();
        console.log("Sender:", msgSender);

        // Deploy Pages contract
        SimplePage simplePage = new SimplePage();

        // Deploy TokenRenderer contract
        TokenRenderer tokenRenderer = new TokenRenderer(simplePage);

        // Deploy SimplePageManager contract
        SimplePageManager pageManager = new SimplePageManager(address(simplePage), beneficiary, priceFeed);

        // Set token renderer
        simplePage.setRenderer(address(tokenRenderer));

        // Grant minter role to SimplePageManager contract
        simplePage.grantRole(simplePage.MINTER_ROLE(), address(pageManager));

        // Transfer ownership of Pages to beneficiary
        simplePage.grantRole(simplePage.DEFAULT_ADMIN_ROLE(), beneficiary);
        simplePage.revokeRole(simplePage.DEFAULT_ADMIN_ROLE(), msgSender);

        vm.stopBroadcast();

        console.log("SimplePage deployed to:", address(simplePage));
        console.log("TokenRenderer deployed to:", address(tokenRenderer));
        console.log("SimplePageManager deployed to:", address(pageManager));
        console.log("Ownership transferred to:", beneficiary);
    }
}
