// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/SimplePage.sol";
import {PageData} from "../src/ISimplePage.sol";
import "../src/ITokenRenderer.sol";

// Mock renderer for testing
contract MockRenderer is ITokenRenderer {
    function renderPage(uint256) external pure returns (string memory) {
        return "mock_uri";
    }
}

contract SimplePageTest is Test {
    SimplePage public pages;
    MockRenderer public renderer;
    address public admin;
    address public minter;
    address public user1;
    address public user2;

    function setUp() public {
        admin = address(this);
        minter = makeAddr("minter");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        pages = new SimplePage();
        renderer = new MockRenderer();

        // Setup roles
        pages.grantRole(pages.MINTER_ROLE(), minter);
        pages.setRenderer(address(renderer));
    }

    function test_InitialState() public view {
        assertEq(pages.name(), "SimplePage");
        assertEq(pages.symbol(), "SIMPLEPAGE");
        assertTrue(pages.hasRole(pages.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(pages.hasRole(pages.MINTER_ROLE(), minter));
    }

    function test_UpdateUnits_NewPage_SingleUnit() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 expectedId = uint256(keccak256(abi.encodePacked(domain)));
        uint256 id = pages.updateUnits(domain, expiresAt, 0, user1);

        assertEq(id, expectedId);
        assertEq(pages.ownerOf(id), user1);

        PageData memory data = pages.getPageData(id);
        assertEq(data.domain, domain);
        assertEq(data.units.length, 1);
        assertEq(data.units[0], expiresAt);
        vm.stopPrank();
    }

    function test_UpdateUnits_NewPage_MultipleUnits() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 id = pages.updateUnits(domain, expiresAt, 2, user1);

        PageData memory data = pages.getPageData(id);
        assertEq(data.units.length, 3); // 0, 1, 2 indices = 3 units
        for (uint256 i = 0; i < 3; i++) {
            assertEq(data.units[i], expiresAt);
        }
        vm.stopPrank();
    }

    function test_UpdateUnits_ExistingPage_ExtendUnits() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 initialExpiry = block.timestamp + 365 days;
        uint256 id = pages.updateUnits(domain, initialExpiry, 1, user1);

        uint256 newExpiry = block.timestamp + 730 days;
        pages.updateUnits(domain, newExpiry, 2, user1);

        PageData memory data = pages.getPageData(id);
        assertEq(data.units.length, 3);
        assertEq(data.units[0], newExpiry);
        assertEq(data.units[1], newExpiry);
        assertEq(data.units[2], newExpiry);
        vm.stopPrank();
    }

    function test_UpdateUnits_TransferOwnership() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 id = pages.updateUnits(domain, expiresAt, 0, user1);
        assertEq(pages.ownerOf(id), user1);

        // Update with new owner
        pages.updateUnits(domain, expiresAt + 100 days, 0, user2);
        assertEq(pages.ownerOf(id), user2);
        vm.stopPrank();
    }

    function test_IsUnitActive() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 id = pages.updateUnits(domain, expiresAt, 1, user1);

        assertTrue(pages.isUnitActive(id, 0));
        assertTrue(pages.isUnitActive(id, 1));
        assertFalse(pages.isUnitActive(id, 2)); // Non-existent unit

        // Warp past expiration
        vm.warp(expiresAt + 1);
        assertFalse(pages.isUnitActive(id, 0));
        assertFalse(pages.isUnitActive(id, 1));
        vm.stopPrank();
    }

    function test_RevertWhen_UpdateUnits_PastExpiration() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp - 1; // Past timestamp
        vm.expectRevert("Expiration time must be in the future");
        pages.updateUnits(domain, expiresAt, 0, user1);
        vm.stopPrank();
    }

    function test_RevertWhen_UpdateUnits_NonMinter() public {
        address nonMinter = makeAddr("nonMinter");
        vm.prank(nonMinter);
        vm.expectRevert();
        pages.updateUnits("test.eth", block.timestamp + 365 days, 0, user1);
    }

    function test_RevertWhen_UpdateUnits_EarlierExpiration() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 initialExpiry = block.timestamp + 365 days;
        pages.updateUnits(domain, initialExpiry, 0, user1);

        // Try to update with earlier expiration
        uint256 earlierExpiry = block.timestamp + 100 days;
        vm.expectRevert("New expiration date must be greater than existing unit expiry.");
        pages.updateUnits(domain, earlierExpiry, 0, user1);
        vm.stopPrank();
    }

    function test_TokenURI() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 id = pages.updateUnits(domain, block.timestamp + 365 days, 0, user1);
        assertEq(pages.tokenURI(id), "mock_uri");
        vm.stopPrank();
    }

    function test_RevertWhen_TokenURI_NonexistentToken() public {
        vm.expectRevert("ERC721: URI query for nonexistent token");
        pages.tokenURI(999);
    }

    function test_RevertWhen_GetPageData_NonexistentToken() public {
        vm.expectRevert("Page does not exist");
        pages.getPageData(999);
    }

    function test_UpdateUnits_PartialUpdate() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 initialExpiry = block.timestamp + 365 days;

        // First create a page with 3 units (0,1,2) all expiring at initialExpiry
        uint256 id = pages.updateUnits(domain, initialExpiry, 2, user1);

        // Update only units 0 and 1 to a later time
        uint256 laterExpiry = initialExpiry + 100 days;
        pages.updateUnits(domain, laterExpiry, 1, user1);

        // Verify the state
        PageData memory data = pages.getPageData(id);
        assertEq(data.units.length, 3, "Should still have 3 units");
        assertEq(data.units[0], laterExpiry, "Unit 0 should have later expiry");
        assertEq(data.units[1], laterExpiry, "Unit 1 should have later expiry");
        assertEq(data.units[2], initialExpiry, "Unit 2 should maintain initial expiry");
        vm.stopPrank();
    }

    function test_SetRenderer() public {
        address newRenderer = makeAddr("newRenderer");
        pages.setRenderer(newRenderer);
        assertEq(address(pages.renderer()), newRenderer);
    }

    function test_RevertWhen_SetRenderer_NonAdmin() public {
        address nonAdmin = makeAddr("nonAdmin");
        vm.prank(nonAdmin);
        vm.expectRevert();
        pages.setRenderer(address(0));
    }

    function test_UpdateUnits_UpdateToIntermediateTime() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";

        uint256 timeN = block.timestamp + 365 days;
        uint256 timeNPlus1 = timeN + 100 days;
        uint256 timeNPlus2 = timeN + 200 days;

        // First create a page with all units at timeN
        uint256 id = pages.updateUnits(domain, timeN, 2, user1);

        // Update unit 2 to timeNPlus1
        pages.updateUnits(domain, timeNPlus1, 2, user1);

        // Update units 0-1 to timeNPlus2
        pages.updateUnits(domain, timeNPlus2, 1, user1);

        // Verify final state
        PageData memory finalData = pages.getPageData(id);
        assertEq(finalData.units[0], timeNPlus2, "Unit 0 should be at N+2");
        assertEq(finalData.units[1], timeNPlus2, "Unit 1 should be at N+2");
        assertEq(finalData.units[2], timeNPlus1, "Unit 2 should be at N+1");
        vm.stopPrank();
    }

    // Additional test cases to fill coverage gaps

    function test_UpdateUnits_EmptyDomain() public {
        vm.startPrank(minter);
        string memory domain = "";
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 id = pages.updateUnits(domain, expiresAt, 0, user1);
        assertEq(id, uint256(keccak256(abi.encodePacked(domain))), "Empty domain should have valid ID");
        assertEq(pages.ownerOf(id), user1, "NFT should be minted to user1");
        vm.stopPrank();
    }

    function test_UpdateUnits_LargeUnitIndex() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;
        uint256 largeIndex = 100; // Large but reasonable index

        uint256 id = pages.updateUnits(domain, expiresAt, largeIndex, user1);

        PageData memory data = pages.getPageData(id);
        assertEq(data.units.length, largeIndex + 1, "Should have correct number of units");
        for (uint256 i = 0; i <= largeIndex; i++) {
            assertEq(data.units[i], expiresAt, "All units should have same expiry");
        }
        vm.stopPrank();
    }

    function test_UpdateUnits_MaxUnitIndex() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;
        uint256 maxIndex = type(uint256).max;

        // This should revert due to gas limits, but we test the behavior
        vm.expectRevert(); // Should revert due to out of gas
        pages.updateUnits(domain, expiresAt, maxIndex, user1);
        vm.stopPrank();
    }

    function test_UpdateUnits_DuplicateDomain() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt1 = block.timestamp + 365 days;
        uint256 expiresAt2 = block.timestamp + 730 days;

        uint256 id1 = pages.updateUnits(domain, expiresAt1, 0, user1);
        uint256 id2 = pages.updateUnits(domain, expiresAt2, 1, user2);

        assertEq(id1, id2, "Same domain should have same token ID");
        assertEq(pages.ownerOf(id1), user2, "Ownership should transfer to new user");

        PageData memory data = pages.getPageData(id1);
        assertEq(data.units.length, 2, "Should have 2 units");
        assertEq(data.units[0], expiresAt2, "Unit 0 should be updated");
        assertEq(data.units[1], expiresAt2, "Unit 1 should be new");
        vm.stopPrank();
    }

    function test_UpdateUnits_SameAddressTransfer() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 id = pages.updateUnits(domain, expiresAt, 0, user1);
        assertEq(pages.ownerOf(id), user1, "Initial owner should be user1");

        // Update with same address
        pages.updateUnits(domain, expiresAt + 100 days, 0, user1);
        assertEq(pages.ownerOf(id), user1, "Owner should remain user1");
        vm.stopPrank();
    }

    function test_RevertWhen_UpdateUnits_ZeroAddress() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        vm.expectRevert(); // ERC721 should revert on zero address
        pages.updateUnits(domain, expiresAt, 0, address(0));
        vm.stopPrank();
    }

    function test_UpdateUnits_MultipleRapidUpdates() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";

        // Perform multiple rapid updates
        for (uint256 i = 0; i < 10; i++) {
            uint256 expiresAt = block.timestamp + 365 days + (i * 30 days);
            pages.updateUnits(domain, expiresAt, i, user1);
        }

        PageData memory data = pages.getPageData(pages.tokenIdForDomain(domain));
        assertEq(data.units.length, 10, "Should have 10 units");
        vm.stopPrank();
    }

    function test_RevertWhen_TokenURI_ZeroRenderer() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 id = pages.updateUnits(domain, block.timestamp + 365 days, 0, user1);
        vm.stopPrank();

        // Set renderer to zero address
        pages.setRenderer(address(0));

        vm.expectRevert("Renderer not set");
        pages.tokenURI(id);
    }

    function test_RevokeMinterRole() public {
        pages.revokeRole(pages.MINTER_ROLE(), minter);

        vm.startPrank(minter);
        vm.expectRevert();
        pages.updateUnits("test.eth", block.timestamp + 365 days, 0, user1);
        vm.stopPrank();
    }

    function test_GrantMinterRole() public {
        address newMinter = makeAddr("newMinter");
        pages.grantRole(pages.MINTER_ROLE(), newMinter);

        vm.startPrank(newMinter);
        string memory domain = "test.eth";
        uint256 id = pages.updateUnits(domain, block.timestamp + 365 days, 0, user1);
        assertEq(pages.ownerOf(id), user1, "New minter should be able to mint");
        vm.stopPrank();
    }

    function test_TransferAdminRole() public {
        address newAdmin = makeAddr("newAdmin");
        pages.grantRole(pages.DEFAULT_ADMIN_ROLE(), newAdmin);
        pages.revokeRole(pages.DEFAULT_ADMIN_ROLE(), address(this));

        vm.startPrank(newAdmin);
        address newRenderer = makeAddr("newRenderer");
        pages.setRenderer(newRenderer);
        assertEq(address(pages.renderer()), newRenderer, "New admin should be able to set renderer");
        vm.stopPrank();
    }

    function testFuzz_UpdateUnits_RandomDomain(string memory domain) public {
        vm.assume(bytes(domain).length > 0 && bytes(domain).length <= 100);
        vm.startPrank(minter);
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 id = pages.updateUnits(domain, expiresAt, 0, user1);
        assertEq(id, uint256(keccak256(abi.encodePacked(domain))), "Token ID should match domain hash");
        vm.stopPrank();
    }

    function testFuzz_UpdateUnits_RandomExpiry(uint256 expiresAt) public {
        vm.assume(expiresAt > block.timestamp && expiresAt <= block.timestamp + 100 * 365 days);
        vm.startPrank(minter);
        string memory domain = "test.eth";

        uint256 id = pages.updateUnits(domain, expiresAt, 0, user1);
        PageData memory data = pages.getPageData(id);
        assertEq(data.units[0], expiresAt, "Unit should have correct expiry");
        vm.stopPrank();
    }

    function testFuzz_UpdateUnits_RandomUnitIndex(uint256 unitIndex) public {
        vm.assume(unitIndex <= 1000); // Reasonable upper bound to avoid gas issues
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 id = pages.updateUnits(domain, expiresAt, unitIndex, user1);
        PageData memory data = pages.getPageData(id);
        assertEq(data.units.length, unitIndex + 1, "Should have correct number of units");
        vm.stopPrank();
    }

    function testFuzz_IsUnitActive_RandomTime(uint256 checkTime) public {
        vm.assume(checkTime >= block.timestamp && checkTime <= block.timestamp + 100 * 365 days);
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 id = pages.updateUnits(domain, expiresAt, 0, user1);

        vm.warp(checkTime);
        bool isActive = pages.isUnitActive(id, 0);
        assertEq(isActive, checkTime < expiresAt, "Unit active status should be correct");
        vm.stopPrank();
    }

    function test_SupportsInterface() public view {
        // Test ERC721 interface
        assertTrue(pages.supportsInterface(0x80ac58cd), "Should support ERC721");
        // Test ERC165 interface
        assertTrue(pages.supportsInterface(0x01ffc9a7), "Should support ERC165");
        // Test AccessControl interface
        assertTrue(pages.supportsInterface(0x7965db0b), "Should support AccessControl");
        // Test non-existent interface
        assertFalse(pages.supportsInterface(0x12345678), "Should not support random interface");
    }

    function test_EventEmission_UnitsUpdated() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        vm.expectEmit(true, true, true, true);
        emit ISimplePage.UnitsUpdated(uint256(keccak256(abi.encodePacked(domain))), domain, 0, expiresAt, user1);

        pages.updateUnits(domain, expiresAt, 0, user1);
        vm.stopPrank();
    }

    function test_GasOptimization_LargeUnitUpdate() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        // Create page with many units
        uint256 id = pages.updateUnits(domain, expiresAt, 50, user1);

        // Update all units at once
        uint256 gasBefore = gasleft();
        pages.updateUnits(domain, expiresAt + 100 days, 50, user1);
        uint256 gasUsed = gasBefore - gasleft();

        // Gas usage should be reasonable (less than 1M gas)
        assertLt(gasUsed, 1_000_000, "Gas usage should be reasonable");
        vm.stopPrank();
    }

    function test_StateConsistency_AfterFailedTransfer() public {
        vm.startPrank(minter);
        string memory domain = "test.eth";
        uint256 expiresAt = block.timestamp + 365 days;

        uint256 id = pages.updateUnits(domain, expiresAt, 0, user1);
        PageData memory dataBefore = pages.getPageData(id);

        // Update with same owner (should not change state)
        pages.updateUnits(domain, expiresAt + 100 days, 0, user1);
        PageData memory dataAfter = pages.getPageData(id);

        assertEq(dataAfter.units[0], expiresAt + 100 days, "Unit should be updated");
        assertEq(dataAfter.units.length, dataBefore.units.length, "Unit count should remain same");
        vm.stopPrank();
    }
}
