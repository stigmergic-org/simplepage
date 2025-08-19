// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SimplePage.sol";
import "../src/TokenRenderer.sol";
import "../src/TokenRendererV2.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

contract TestRenderersScript is Script {
    SimplePage public pages;
    TokenRenderer public rendererV1;
    TokenRendererV2 public rendererV2;

    // Test domains and configurations
    string[] public testDomains = ["test1.eth", "test2.eth", "test3.eth", "test4.eth"];

    // Test unit configurations (expiration timestamps)
    // Each unit must expire after the previous one sequentially
    uint256[][] public testUnits;

    // Store initial timestamp for time manipulation
    uint256 public initialTimestamp;

    function setUp() public {
        initialTimestamp = block.timestamp;
        testUnits = new uint256[][](4);

        // Single unit, expires in 1 year
        testUnits[0] = new uint256[](1);
        testUnits[0][0] = initialTimestamp + 365 days;

        // Two units, shorter time for later unit (reversed)
        testUnits[1] = new uint256[](2);
        testUnits[1][0] = initialTimestamp + 365 days; // First unit expires later
        testUnits[1][1] = initialTimestamp + 180 days; // Second unit expires sooner

        // Three units, progressively shorter times (reversed)
        testUnits[2] = new uint256[](3);
        testUnits[2][0] = initialTimestamp + 365 days; // First unit expires later
        testUnits[2][1] = initialTimestamp + 180 days; // Second unit expires sooner
        testUnits[2][2] = initialTimestamp + 90 days; // Third unit expires soonest

        // Five units, progressively shorter times (reversed) with some expired
        testUnits[3] = new uint256[](5);
        testUnits[3][0] = initialTimestamp + 730 days; // First unit expires latest
        testUnits[3][1] = initialTimestamp + 365 days; // Second unit expires later
        testUnits[3][2] = initialTimestamp + 180 days; // Third unit expires sooner
        testUnits[3][3] = initialTimestamp + 30 days; // Fourth unit expires soon
        testUnits[3][4] = initialTimestamp + 1 days; // Fifth unit expires very soon
    }

    function run() external {
        address deployer = msg.sender;

        // Deploying contracts with address: deployer

        vm.startBroadcast();

        // Deploy SimplePage contract
        pages = new SimplePage();
        // SimplePage deployed at: address(pages)

        // Deploy both renderers
        rendererV1 = new TokenRenderer(ISimplePage(address(pages)));
        // TokenRenderer V1 deployed at: address(rendererV1)

        rendererV2 = new TokenRendererV2(ISimplePage(address(pages)));
        // TokenRenderer V2 deployed at: address(rendererV2)

        // Set renderer V1 as the default renderer
        pages.setRenderer(address(rendererV1));
        // Set TokenRenderer V1 as default renderer

        vm.stopBroadcast();

        // Create test pages and test both renderers
        _createTestPages();

        // Warp time forward to expire some units before testing
        _expireSomeUnits();

        _testRenderers();
    }

    function _createTestPages() internal {
        address deployer = msg.sender;

        vm.startBroadcast();

        // Grant MINTER_ROLE to the deployer
        pages.grantRole(pages.MINTER_ROLE(), deployer);

        // Create test pages with different unit configurations
        for (uint256 i = 0; i < testDomains.length; i++) {
            string memory domain = testDomains[i];
            uint256[] memory units = testUnits[i];

            // Create page with units directly using the pages contract
            for (uint256 j = units.length; j > 0; j--) {
                pages.updateUnits(domain, units[j - 1], j - 1, deployer);
            }

            // Created page for domain: domain with units.length units
        }

        vm.stopBroadcast();
    }

    function _expireSomeUnits() internal {
        console.log("=== EXPIRING SOME UNITS ===");

        // Warp to 200 days in the future to expire the 90-day and 180-day units
        // This will affect pages 2 and 3 which have units expiring at 90 and 180 days
        uint256 futureTime = initialTimestamp + 100 days;
        vm.warp(futureTime);
        console.log("Warped to timestamp:", futureTime);
        console.log("This will expire units on pages 2 and 3");
    }

    function _testRenderers() internal {
        // === Testing TokenRenderer V1 ===
        _testRenderer(address(rendererV1), "v1");

        // === Testing TokenRenderer V2 ===
        _testRenderer(address(rendererV2), "v2");
    }

    function _testRenderer(address rendererAddress, string memory version) internal {
        // Test each page
        for (uint256 i = 0; i < testDomains.length; i++) {
            string memory domain = testDomains[i];
            uint256 tokenId = pages.tokenIdForDomain(domain);

            // Testing domain: domain token ID: tokenId

            // Get page data
            PageData memory pageData = pages.getPageData(tokenId);
            // Domain: pageData.domain
            // Units count: pageData.units.length

            // Test rendering and log results
            string memory tokenURI;
            if (keccak256(abi.encodePacked(version)) == keccak256(abi.encodePacked("v1"))) {
                tokenURI = TokenRenderer(rendererAddress).renderPage(tokenId);
            } else {
                tokenURI = TokenRendererV2(rendererAddress).renderPage(tokenId);
            }

            // Log the tokenURI for extraction
            console.log("=== TOKEN_URI_START ===");
            console.log("DOMAIN:", domain);
            console.log("VERSION:", version);
            console.log("TOKEN_URI:", tokenURI);
            console.log("=== TOKEN_URI_END ===");

            // Test rendering successful for domain: domain with version: version
        }
    }
}
