// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SimplePage.sol";
import "../src/TokenRenderer.sol";
import "../src/TokenRendererV2.sol";
import "../src/TokenRendererV3.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

contract RenderersDemoScript is Script {
    SimplePage public pages;
    TokenRenderer public rendererV1;
    TokenRendererV2 public rendererV2;
    TokenRendererV3 public rendererV3;

    // Test domains and configurations
    string[] public sampleDomains = [
        "test1.eth",
        "test2.eth",
        "test3.eth",
        "test4.eth",
        "test5.eth",
        "test6.eth",
        "simplepage.eth",
        "new.simplepage.eth"
    ];

    // Test unit configurations (expiration timestamps)
    // Each unit must expire after the previous one sequentially
    uint256[][] public sampleUnits;

    // Store initial timestamp for time manipulation
    uint256 public initialTimestamp;

    function setUp() public {
        initialTimestamp = block.timestamp;
        sampleUnits = new uint256[][](8);

        // Single unit, expires in 1 year
        sampleUnits[0] = new uint256[](1);
        sampleUnits[0][0] = initialTimestamp + 365 days;

        // Two units, shorter time for later unit (reversed)
        sampleUnits[1] = new uint256[](2);
        sampleUnits[1][0] = initialTimestamp + 365 days; // First unit expires later
        sampleUnits[1][1] = initialTimestamp + 180 days; // Second unit expires sooner

        // Three units, progressively shorter times (reversed)
        sampleUnits[2] = new uint256[](3);
        sampleUnits[2][0] = initialTimestamp + 365 days; // First unit expires later
        sampleUnits[2][1] = initialTimestamp + 180 days; // Second unit expires sooner
        sampleUnits[2][2] = initialTimestamp + 90 days; // Third unit expires soonest

        // Five units, progressively shorter times (reversed) with some expired
        sampleUnits[3] = new uint256[](5);
        sampleUnits[3][0] = initialTimestamp + 730 days; // First unit expires latest
        sampleUnits[3][1] = initialTimestamp + 365 days; // Second unit expires later
        sampleUnits[3][2] = initialTimestamp + 180 days; // Third unit expires sooner
        sampleUnits[3][3] = initialTimestamp + 30 days; // Fourth unit expires soon
        sampleUnits[3][4] = initialTimestamp + 1 days; // Fifth unit expires very soon

        // Four units, varied times (reversed)
        sampleUnits[4] = new uint256[](4);
        sampleUnits[4][0] = initialTimestamp + 540 days; // First unit expires later
        sampleUnits[4][1] = initialTimestamp + 240 days; // Second unit expires sooner
        sampleUnits[4][2] = initialTimestamp + 120 days; // Third unit expires soon
        sampleUnits[4][3] = initialTimestamp + 14 days; // Fourth unit expires very soon

        // Six units, wide spread (reversed)
        sampleUnits[5] = new uint256[](6);
        sampleUnits[5][0] = initialTimestamp + 900 days; // First unit expires latest
        sampleUnits[5][1] = initialTimestamp + 540 days; // Second unit expires later
        sampleUnits[5][2] = initialTimestamp + 270 days; // Third unit expires sooner
        sampleUnits[5][3] = initialTimestamp + 120 days; // Fourth unit expires soon
        sampleUnits[5][4] = initialTimestamp + 60 days; // Fifth unit expires sooner
        sampleUnits[5][5] = initialTimestamp + 7 days; // Sixth unit expires very soon

        // One unit active
        sampleUnits[6] = new uint256[](1);
        sampleUnits[6][0] = initialTimestamp + 365 days;

        // One unit active
        sampleUnits[7] = new uint256[](1);
        sampleUnits[7][0] = initialTimestamp + 200 days;
    }

    function run() external {
        address deployer = msg.sender;

        // Deploying contracts with address: deployer

        vm.startBroadcast();

        // Deploy SimplePage contract
        pages = new SimplePage();
        // SimplePage deployed at: address(pages)

        // Deploy renderers
        rendererV1 = new TokenRenderer(ISimplePage(address(pages)));
        // TokenRenderer V1 deployed at: address(rendererV1)

        rendererV2 = new TokenRendererV2(ISimplePage(address(pages)));
        // TokenRenderer V2 deployed at: address(rendererV2)

        rendererV3 = new TokenRendererV3(ISimplePage(address(pages)));
        // TokenRenderer V3 deployed at: address(rendererV3)

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
        for (uint256 i = 0; i < sampleDomains.length; i++) {
            string memory domain = sampleDomains[i];
            uint256[] memory units = sampleUnits[i];

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

        // Warp to 100 days in the future to expire shorter-duration units
        uint256 futureTime = initialTimestamp + 100 days;
        vm.warp(futureTime);
        console.log("Warped to timestamp:", futureTime);
        console.log("This will expire units on pages with short-duration units");
    }

    function _testRenderers() internal {
        // === Testing TokenRenderer V1 ===
        _testRenderer(address(rendererV1), "v1");

        // === Testing TokenRenderer V2 ===
        _testRenderer(address(rendererV2), "v2");

        // === Testing TokenRenderer V3 ===
        _testRenderer(address(rendererV3), "v3");
    }

    function _testRenderer(address rendererAddress, string memory version) internal {
        // Test each page
        for (uint256 i = 0; i < sampleDomains.length; i++) {
            string memory domain = sampleDomains[i];
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
            } else if (keccak256(abi.encodePacked(version)) == keccak256(abi.encodePacked("v2"))) {
                tokenURI = TokenRendererV2(rendererAddress).renderPage(tokenId);
            } else {
                tokenURI = TokenRendererV3(rendererAddress).renderPage(tokenId);
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
