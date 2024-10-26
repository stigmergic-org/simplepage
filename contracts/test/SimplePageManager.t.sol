// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/SimplePageManager.sol";
import "../src/SimplePage.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract MockPriceFeed is AggregatorV3Interface {
    int256 private price;

    constructor(int256 _price) {
        price = _price;
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (0, price, 0, 0, 0);
    }

    function setPrice(int256 _price) external {
        price = _price;
    }

    // Implement other required functions with empty bodies
    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "";
    }

    function version() external pure returns (uint256) {
        return 0;
    }

    function getRoundData(uint80 /* _roundId */ ) external pure returns (uint80, int256, uint256, uint256, uint80) {
        return (0, 0, 0, 0, 0);
    }
}

contract SimplePageManagerTest is Test {
    SimplePageManager public pageManager;
    SimplePage public pages;
    MockPriceFeed public mockPriceFeed;
    address public beneficiary;

    uint256 constant INITIAL_ETH_PRICE = 2000e8; // $2000 per ETH
    uint256 constant SECONDS_PER_YEAR = 31_536_000;
    uint256 constant USD_DECIMALS = 1e8;
    uint256 constant ETH_DECIMALS = 1e18;
    uint256 constant PRICE_PER_YEAR = 12e8; // 12 USD per year

    function setUp() public {
        beneficiary = address(0x12345678);
        pages = new SimplePage();
        mockPriceFeed = new MockPriceFeed(int256(INITIAL_ETH_PRICE));
        pageManager = new SimplePageManager(address(pages), beneficiary, address(mockPriceFeed));
        pages.grantRole(pages.MINTER_ROLE(), address(pageManager));
    }

    function testFuzzSubscribe(uint256 duration) public {
        vm.assume(duration > 0 && duration <= 10 * SECONDS_PER_YEAR);
        string memory domain = "test.eth";
        uint256 expectedFee = pageManager.fee(duration);

        uint256 balanceBefore = beneficiary.balance;
        uint256 tokenId = pageManager.subscribe{value: expectedFee}(domain, duration);

        assertEq(pages.ownerOf(tokenId), address(this), "NFT not minted to caller");
        assertEq(beneficiary.balance, balanceBefore + expectedFee, "Beneficiary didn't receive fee");
    }

    function testFuzzSubscribeWithExcessPayment(uint256 duration, uint256 excessPayment) public {
        vm.assume(duration > 0 && duration <= 10 * SECONDS_PER_YEAR);
        vm.assume(excessPayment > 0 && excessPayment <= 1 ether);
        string memory domain = "test.eth";
        uint256 expectedFee = pageManager.fee(duration);

        uint256 balanceBefore = address(this).balance;
        uint256 tokenId = pageManager.subscribe{value: expectedFee + excessPayment}(domain, duration);

        assertEq(pages.ownerOf(tokenId), address(this), "NFT not minted to caller");
        assertEq(address(this).balance, balanceBefore - expectedFee, "Excess payment not refunded");
    }

    function testFuzzFeeCalculation(uint256 duration) public view {
        vm.assume(duration > 86400 && duration <= 10 * SECONDS_PER_YEAR); // longer than a day, shorter than 10 years
        uint256 calculatedFee = pageManager.fee(duration);
        uint256 expectedFee = (PRICE_PER_YEAR * duration * 1e18) / (SECONDS_PER_YEAR * INITIAL_ETH_PRICE);
        assertEq(calculatedFee, expectedFee, "Fee calculation incorrect");
    }

    function testFuzzFeeCalculationWithPriceChange(uint256 duration, uint256 newEthPrice) public {
        vm.assume(duration > 86400 && duration <= 10 * SECONDS_PER_YEAR);
        vm.assume(newEthPrice > 0 && newEthPrice <= 10000e8);

        mockPriceFeed.setPrice(int256(newEthPrice));

        uint256 calculatedFee = pageManager.fee(duration);
        uint256 expectedFee = (PRICE_PER_YEAR * duration * 1e18) / (SECONDS_PER_YEAR * newEthPrice);
        assertEq(calculatedFee, expectedFee, "Fee calculation incorrect after price change");
    }

    function testFuzzSubscribeInsufficientPayment(uint256 duration, uint256 insufficientPayment) public {
        vm.assume(duration > 0 && duration <= 10 * SECONDS_PER_YEAR);
        uint256 requiredFee = pageManager.fee(duration);
        vm.assume(insufficientPayment < requiredFee);

        string memory domain = "test.eth";

        vm.expectRevert("Not enough ETH");
        pageManager.subscribe{value: insufficientPayment}(domain, duration);
    }

    function testSubscribe() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 expectedFee = 0.006 ether; // 12 USD / 2000 USD/ETH

        uint256 balanceBefore = beneficiary.balance;
        uint256 tokenId = pageManager.subscribe{value: expectedFee}(domain, duration);

        assertEq(pages.ownerOf(tokenId), address(this), "NFT not minted to caller");
        assertEq(beneficiary.balance, balanceBefore + expectedFee, "Beneficiary didn't receive fee");
    }

    function testSubscribeWithExcessPayment() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 expectedFee = 0.006 ether;
        uint256 excessPayment = 0.001 ether;

        uint256 balanceBefore = address(this).balance;

        vm.expectEmit(true, false, false, true);
        emit SimplePageManager.Subscribed(address(this), expectedFee);

        uint256 tokenId = pageManager.subscribe{value: expectedFee + excessPayment}(domain, duration);

        assertEq(pages.ownerOf(tokenId), address(this), "NFT not minted to caller");
        assertEq(address(this).balance, balanceBefore - expectedFee, "Excess payment not refunded");
    }

    function testFeeCalculation() public view {
        uint256 duration = SECONDS_PER_YEAR;
        uint256 expectedFee = 0.006 ether; // 12 USD / 2000 USD/ETH

        uint256 calculatedFee = pageManager.fee(duration);
        assertEq(calculatedFee, expectedFee, "Fee calculation incorrect");
    }

    function testFeeCalculationWithPriceChange() public {
        uint256 duration = SECONDS_PER_YEAR;
        uint256 newEthPrice = 3000e8; // $3000 per ETH
        uint256 expectedFee = 0.004 ether; // 12 USD / 3000 USD/ETH

        mockPriceFeed.setPrice(int256(newEthPrice));

        uint256 calculatedFee = pageManager.fee(duration);
        assertEq(calculatedFee, expectedFee, "Fee calculation incorrect after price change");
    }

    function testSubscribeInsufficientPayment() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 insufficientPayment = 0.005 ether;

        vm.expectRevert("Not enough ETH");
        pageManager.subscribe{value: insufficientPayment}(domain, duration);
    }

    function testSubscribeWithZeroDuration() public {
        string memory domain = "test.eth";
        uint256 duration = 0;

        vm.expectRevert(); // Expect revert due to division by zero in fee calculation
        pageManager.subscribe{value: 1 ether}(domain, duration);
    }

    function testFeeWithInvalidPrice() public {
        mockPriceFeed.setPrice(0);

        vm.expectRevert("Invalid price");
        pageManager.fee(SECONDS_PER_YEAR);
    }

    function testExtendSubscription() public {
        // Initial subscription
        string memory domain = "test.eth";
        uint256 initialDuration = SECONDS_PER_YEAR;
        uint256 initialFee = pageManager.fee(initialDuration);
        pageManager.subscribe{value: initialFee}(domain, initialDuration);

        // Extend subscription
        uint256 extensionDuration = SECONDS_PER_YEAR;
        uint256 extensionFee = pageManager.fee(extensionDuration);
        uint256 balanceBefore = beneficiary.balance;

        pageManager.subscribe{value: extensionFee}(domain, extensionDuration);

        assertEq(beneficiary.balance, balanceBefore + extensionFee, "Beneficiary didn't receive extension fee");
    }

    function testExtendSubscriptionWithExcessPayment() public {
        // Initial subscription
        string memory domain = "test.eth";
        uint256 initialDuration = SECONDS_PER_YEAR;
        uint256 initialFee = pageManager.fee(initialDuration);
        pageManager.subscribe{value: initialFee}(domain, initialDuration);

        // Extend subscription with excess payment
        uint256 extensionDuration = SECONDS_PER_YEAR;
        uint256 extensionFee = pageManager.fee(extensionDuration);
        uint256 excessPayment = 0.001 ether;
        uint256 balanceBefore = address(this).balance;

        pageManager.subscribe{value: extensionFee + excessPayment}(domain, extensionDuration);

        assertEq(address(this).balance, balanceBefore - extensionFee, "Excess payment not refunded");
    }

    function testExtendSubscriptionOnlyChargesForExtension() public {
        // Initial subscription for 1 year
        string memory domain = "test.eth";
        uint256 initialDuration = SECONDS_PER_YEAR;
        uint256 initialFee = pageManager.fee(initialDuration);

        uint256 beneficiaryBalanceBefore = beneficiary.balance;
        uint256 tokenId = pageManager.subscribe{value: initialFee}(domain, initialDuration);
        uint256 beneficiaryBalanceAfterInitial = beneficiary.balance;

        // Verify initial fee was charged
        assertEq(
            beneficiaryBalanceAfterInitial, beneficiaryBalanceBefore + initialFee, "Initial fee not charged correctly"
        );

        // Store the expected expiration time
        uint256 expectedExpirationTime = block.timestamp + SECONDS_PER_YEAR * 3 / 2; // 1.5 years from now

        // Fast forward 6 months (half way through the subscription)
        vm.warp(block.timestamp + SECONDS_PER_YEAR / 2);

        // Extend subscription for another 6 months
        uint256 extensionDuration = SECONDS_PER_YEAR / 2; // 6 months
        uint256 extensionFee = pageManager.fee(extensionDuration);

        uint256 beneficiaryBalanceBeforeExtension = beneficiary.balance;
        pageManager.subscribe{value: extensionFee}(domain, extensionDuration);
        uint256 beneficiaryBalanceAfterExtension = beneficiary.balance;

        // Verify only extension fee was charged, not full duration fee
        assertEq(
            beneficiaryBalanceAfterExtension,
            beneficiaryBalanceBeforeExtension + extensionFee,
            "Extension fee not charged correctly"
        );

        // Verify the resulting subscription duration is 1 year + 6 months (1.5 years total)
        uint256 actualExpirationTime = pages.getPageData(tokenId).units[0]; // Get the expiration time of the first unit
        assertEq(
            actualExpirationTime,
            expectedExpirationTime,
            "Subscription should be extended to 1.5 years total from initial subscription"
        );
    }

    receive() external payable {}

    // Additional test cases to fill coverage gaps

    function testSubscribeWithEmptyDomain() public {
        string memory domain = "";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 expectedFee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: expectedFee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithMaxDuration() public {
        string memory domain = "test.eth";
        uint256 duration = type(uint256).max;

        vm.expectRevert(); // Should revert due to arithmetic overflow in fee calculation
        pageManager.subscribe{value: 1 ether}(domain, duration);
    }

    function testFeeCalculationWithZeroPrice() public {
        mockPriceFeed.setPrice(0);

        vm.expectRevert("Invalid price");
        pageManager.fee(SECONDS_PER_YEAR);
    }

    function testFeeCalculationWithNegativePrice() public {
        mockPriceFeed.setPrice(-1000e8);

        vm.expectRevert("Invalid price");
        pageManager.fee(SECONDS_PER_YEAR);
    }

    function testSubscribeWithExactPayment() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 exactFee = pageManager.fee(duration);

        uint256 balanceBefore = address(this).balance;
        uint256 tokenId = pageManager.subscribe{value: exactFee}(domain, duration);

        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
        assertEq(address(this).balance, balanceBefore - exactFee, "Exact payment should be deducted");
    }

    function testSubscribeWithLargeExcessPayment() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 expectedFee = pageManager.fee(duration);
        uint256 largeExcess = 100 ether;

        uint256 balanceBefore = address(this).balance;
        uint256 tokenId = pageManager.subscribe{value: expectedFee + largeExcess}(domain, duration);

        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
        assertEq(address(this).balance, balanceBefore - expectedFee, "Only fee should be deducted");
    }

    function testSubscribeWithOneWeiExcess() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 expectedFee = pageManager.fee(duration);

        uint256 balanceBefore = address(this).balance;
        uint256 tokenId = pageManager.subscribe{value: expectedFee + 1}(domain, duration);

        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
        assertEq(address(this).balance, balanceBefore - expectedFee, "Excess 1 wei should be refunded");
    }

    function testSubscribeWithInsufficientPaymentByOneWei() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 requiredFee = pageManager.fee(duration);
        uint256 insufficientPayment = requiredFee - 1;

        vm.expectRevert("Not enough ETH");
        pageManager.subscribe{value: insufficientPayment}(domain, duration);
    }

    function testSubscribeWithZeroPayment() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;

        vm.expectRevert("Not enough ETH");
        pageManager.subscribe{value: 0}(domain, duration);
    }

    function testMultipleSubscriptionsSameDomain() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // First subscription
        uint256 tokenId1 = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId1), address(this), "First NFT should be minted to caller");

        // Second subscription (should extend existing)
        uint256 tokenId2 = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(tokenId1, tokenId2, "Same domain should have same token ID");
        assertEq(pages.ownerOf(tokenId2), address(this), "NFT should still be owned by caller");
    }

    function testSubscribeWithDifferentDomains() public {
        string memory domain1 = "test1.eth";
        string memory domain2 = "test2.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId1 = pageManager.subscribe{value: fee}(domain1, duration);
        uint256 tokenId2 = pageManager.subscribe{value: fee}(domain2, duration);

        assertTrue(tokenId1 != tokenId2, "Different domains should have different token IDs");
        assertEq(pages.ownerOf(tokenId1), address(this), "First NFT should be owned by caller");
        assertEq(pages.ownerOf(tokenId2), address(this), "Second NFT should be owned by caller");
    }

    function testSubscribeWithVeryShortDuration() public {
        string memory domain = "test.eth";
        uint256 duration = 1; // 1 second
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithVeryLongDuration() public {
        string memory domain = "test.eth";
        uint256 duration = 100 * SECONDS_PER_YEAR; // 100 years
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testFuzzSubscribeWithRandomDuration(uint256 duration) public {
        vm.assume(duration > 0 && duration <= 50 * SECONDS_PER_YEAR); // Reasonable upper bound
        string memory domain = "test.eth";
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testFuzzSubscribeWithRandomDomain(string memory domain) public {
        vm.assume(bytes(domain).length > 0 && bytes(domain).length <= 100);
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testFuzzFeeCalculationWithRandomPrice(uint256 price) public {
        vm.assume(price > 0 && price <= 10000e8); // Reasonable price range
        mockPriceFeed.setPrice(int256(price));

        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);
        assertGt(fee, 0, "Fee should be greater than 0");
    }

    function testFuzzFeeCalculationWithRandomDuration(uint256 duration) public {
        vm.assume(duration > 0 && duration <= 50 * SECONDS_PER_YEAR);
        uint256 fee = pageManager.fee(duration);
        assertGt(fee, 0, "Fee should be greater than 0");
    }

    function testSubscribeWithPriceChangeDuringTransaction() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;

        // Calculate fee with initial price
        uint256 initialFee = pageManager.fee(duration);

        // Change price before subscription
        mockPriceFeed.setPrice(int256(3000e8)); // $3000 per ETH
        uint256 newFee = pageManager.fee(duration);

        // Use new fee for subscription
        uint256 tokenId = pageManager.subscribe{value: newFee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithBeneficiaryAsCaller() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Give beneficiary some ETH to pay for the subscription
        vm.deal(beneficiary, fee);
        vm.prank(beneficiary);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), beneficiary, "NFT should be minted to beneficiary");
    }

    function testSubscribeWithContractAsCaller() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Create a contract caller
        ContractCaller caller = new ContractCaller();
        // Give caller some ETH to pay for the subscription
        vm.deal(address(caller), fee);
        vm.prank(address(caller));
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(caller), "NFT should be minted to contract");
    }

    function testSubscribeWithZeroAddressAsCaller() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        vm.prank(address(0));
        vm.deal(address(0), fee);
        vm.expectRevert("ERC721InvalidReceiver(0x0000000000000000000000000000000000000000)");
        pageManager.subscribe{value: fee}(domain, duration);
    }

    function testSubscribeWithLargeDomain() public {
        string memory domain = "very-long-domain-name-that-exceeds-normal-length-limits.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithSpecialCharactersInDomain() public {
        string memory domain = "test-domain-with-hyphens.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithUnicodeDomain() public {
        string memory domain = unicode"tëst.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithNumericDomain() public {
        string memory domain = "123.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithMixedCaseDomain() public {
        string memory domain = "TestDomain.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithSubdomain() public {
        string memory domain = "sub.test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithDeepSubdomain() public {
        string memory domain = "deep.sub.domain.test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithMaxLengthDomain() public {
        // Create a domain with maximum reasonable length
        string memory longDomain = "a";
        for (uint256 i = 0; i < 100; i++) {
            longDomain = string(abi.encodePacked(longDomain, "a"));
        }
        longDomain = string(abi.encodePacked(longDomain, ".eth"));

        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        uint256 tokenId = pageManager.subscribe{value: fee}(longDomain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithReentrantCall() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Create a reentrant contract
        ReentrantContract reentrant = new ReentrantContract(address(pageManager));

        vm.prank(address(reentrant));
        vm.deal(address(reentrant), 1 ether);

        // Expect the refund to fail due to reentrancy
        vm.expectRevert("Failed to refund excess ETH");
        reentrant.subscribe{value: fee * 2}(domain, duration);
    }

    function testSubscribeWithFailedETHTransfer() public {
        // Create a failing beneficiary contract
        FailingBeneficiary failingBeneficiary = new FailingBeneficiary();

        // Create a new page manager with the failing beneficiary
        SimplePageManager failingPageManager =
            new SimplePageManager(address(pages), address(failingBeneficiary), address(mockPriceFeed));
        pages.grantRole(pages.MINTER_ROLE(), address(failingPageManager));

        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = failingPageManager.fee(duration);

        vm.expectRevert("Failed to send ETH to beneficiary");
        failingPageManager.subscribe{value: fee}(domain, duration);
    }

    function testSubscribeWithFailedRefund() public {
        // Create a contract that fails refunds
        FailingRefundReceiver failingRefundReceiver = new FailingRefundReceiver();

        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);
        uint256 excess = 0.001 ether;

        // Fund the contract so it can pay the fee + excess
        vm.deal(address(failingRefundReceiver), fee + excess);

        vm.prank(address(failingRefundReceiver));
        vm.expectRevert("Failed to refund excess ETH");
        pageManager.subscribe{value: fee + excess}(domain, duration);
    }

    function testSubscribeWithHighGasPrice() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Test with high gas price
        vm.txGasPrice(1000 gwei);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithBlockNumberChange() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change block number
        vm.roll(block.number + 1000);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithTimestampChange() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change timestamp
        vm.warp(block.timestamp + 1000);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithChainIdChange() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change chain ID
        vm.chainId(999);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithDifficultyChange() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change prevrandao (replaces difficulty after Paris hard fork)
        vm.prevrandao(1000000);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithBaseFeeChange() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change base fee
        vm.fee(1000000000); // 1 gwei
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithCoinbaseChange() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change coinbase
        vm.coinbase(address(0x1234));
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithBalanceChange() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change balance
        vm.deal(address(this), 1000 ether);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithCodeChange() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change code at address
        bytes memory code = hex"12345678";
        vm.etch(address(this), code);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithStorageChange() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change storage
        vm.store(address(this), bytes32(0), bytes32(uint256(0x12345678)));
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithChainIdChange2() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change chain ID
        vm.chainId(1);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithBlockNumberChange2() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change block number
        vm.roll(1);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithTimestampChange2() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change timestamp
        vm.warp(1);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithDifficultyChange2() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change prevrandao (replaces difficulty after Paris hard fork)
        vm.prevrandao(1);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithBaseFeeChange2() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change base fee
        vm.fee(1);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithCoinbaseChange2() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change coinbase
        vm.coinbase(address(0));
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithCodeChange2() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change code at address
        bytes memory code = hex"";
        vm.etch(address(this), code);
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }

    function testSubscribeWithStorageChange2() public {
        string memory domain = "test.eth";
        uint256 duration = SECONDS_PER_YEAR;
        uint256 fee = pageManager.fee(duration);

        // Change storage
        vm.store(address(this), bytes32(0), bytes32(0));
        uint256 tokenId = pageManager.subscribe{value: fee}(domain, duration);
        assertEq(pages.ownerOf(tokenId), address(this), "NFT should be minted to caller");
    }
}

// Helper contracts for testing edge cases

contract FailingRefundReceiver {
    // This contract will fail when receiving refunds
    receive() external payable {
        revert("Refund failed");
    }
}

contract FailingBeneficiary {
    // This contract will fail when receiving ETH
    receive() external payable {
        revert("ETH transfer failed");
    }
}

contract ContractCaller {
    function subscribe(address pageManager, string memory domain, uint256 duration)
        external
        payable
        returns (uint256)
    {
        return SimplePageManager(pageManager).subscribe{value: msg.value}(domain, duration);
    }
}

contract ReentrantContract {
    SimplePageManager public pageManager;
    uint256 public tokenId;

    constructor(address _pageManager) {
        pageManager = SimplePageManager(_pageManager);
    }

    function subscribe(string memory domain, uint256 duration) external payable returns (uint256) {
        return pageManager.subscribe{value: msg.value}(domain, duration);
    }

    receive() external payable {
        // Try to reenter during ETH transfer
        if (msg.value > 0) {
            pageManager.subscribe{value: 0.001 ether}("reentrant.eth", 365 days);
        }
    }
}
