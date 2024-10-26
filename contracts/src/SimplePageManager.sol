/* SPDX-License-Identifier: GPL-3.0-only
  ▄▄▄▄▄▄▄▄▄▄  ▄▄  ▄                                           ▄  ▄▄  ▄▄▄▄▄▄▄▄▄▄
 █▄▓▄                                                                       ▄▓▄█
 █         ▒██████  █▓ ▓██▄ ▄██▄ ██▓███  ██▓   ███████ ██████ ██████▒          █
 █         ██▒      ██ ▒██▀█▀ █▓██░  ██▒██▒    ▓█   ▀  ██  ██ ██  ██           █
 █          ██████  ██ ▓██ █  █▓██░ ██▓▒██░    ▒███    ██████ ██ ▄▄▒           █
 █              ██▒ ██ ▓██ █  █▒██▄█▓▒ ▒██░    ▒▓█  ▄  ██     ██  ██           █
 █         ███████▒ ██▒▒██ █  █▒██▒ ░  ░██████▒▓█████▒ ██     ██████           █
 █         ░ ▒░▒░▒░ ▓ ░ ▒░ ░  ▒▒▓▒░ ░  ░▒ ▒░▓  ░░ ▒░ ░ ░░▒    ░░▒▒▓▒           █
 █           ░ ▒ ▒░ ▒ ░ ░░    ▒░▒ ░     ░ ░ ▒  ░░ ░  ░ ░   ░  ░ ░▒░            █
 █         ░ ░ ░ ▒ ▒    ░     ░░░         ░ ░     ░         ░   ░ ░            █
 █            ░ ░  ░            ░              ░  ░   ░  ░   ░░ ░              █
  ▄▄▄▄▄▄▄ ▄         ░            ░            ░  ░              ░     ▄ ▄▄▄▄▄▄▄
 █▄▓▄▄                           ░                                         ▄▄▓▄█
 █                                                                             █
 █  ░  Release Information                                                     █
 █  ░ ---------------- -                                                       █
 █                                                                             █
 █  ░  Contract . : SimplePageManager                                          █
 █  ░  License .. : GPL-3.0-only                                               █
 █  ░  Language . : Solidity                                                   █
 █  ░  Standard . : N/A                                                        █
 ▓  ░  Version .. : 1.0.0                                                      ▓
 ▒  ░  Deployed . : 2025-XX-XX                                                 ▒
 ░                                                                             ░
*/
pragma solidity ^0.8.24;

import "./ISimplePage.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

contract SimplePageManager is ReentrancyGuardTransient {
    event Subscribed(address indexed user, uint256 amount);

    ISimplePage public pagesContract;
    address public beneficiary;
    AggregatorV3Interface public ethUsdPriceFeed;

    uint256 public constant SUBSCRIPTION_TYPE_DEFAULT = 0;
    uint256 public constant PRICE_PER_YEAR = 12e8;
    uint256 public constant SECONDS_PER_YEAR = 31_536_000; // 365 days
    uint256 public constant ETH_DECIMALS = 1e18;

    constructor(address _pagesContract, address _beneficiary, address _priceFeedAddress) {
        pagesContract = ISimplePage(_pagesContract);
        beneficiary = _beneficiary;
        ethUsdPriceFeed = AggregatorV3Interface(_priceFeedAddress);
    }

    /// @notice Subscribes to a domain by minting a SimplePage NFT
    /// @param domain The domain to subscribe to
    /// @param duration The duration of the subscription in seconds
    function subscribe(string memory domain, uint256 duration) external payable nonReentrant returns (uint256) {
        uint256 _fee = fee(duration);
        require(msg.value >= _fee, "Not enough ETH");

        uint256 tokenId = pagesContract.tokenIdForDomain(domain);
        uint256 expiresAt = currentExpiryOrNow(tokenId) + duration;
        pagesContract.updateUnits(domain, expiresAt, 0, msg.sender);

        // Send fee to beneficiary using call
        (bool sent,) = payable(beneficiary).call{value: _fee}("");
        require(sent, "Failed to send ETH to beneficiary");

        // Refund excess ETH if any
        if (msg.value > _fee) {
            (bool refunded,) = payable(msg.sender).call{value: msg.value - _fee}("");
            require(refunded, "Failed to refund excess ETH");
        }
        emit Subscribed(msg.sender, _fee);

        return tokenId;
    }

    /// @notice Calculates the fee for a given duration
    /// @param duration The duration of the subscription in seconds
    /// @return The fee in ETH
    function fee(uint256 duration) public view returns (uint256) {
        (, int256 price,,,) = ethUsdPriceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        // Calculate the fee in USD (12 USD per year)
        uint256 nominator = PRICE_PER_YEAR * duration * ETH_DECIMALS;
        uint256 denominator = uint256(price) * SECONDS_PER_YEAR;
        return nominator / denominator;
    }

    function currentExpiryOrNow(uint256 tokenId) internal view returns (uint256) {
        try pagesContract.getPageData(tokenId) returns (PageData memory pageData) {
            return pageData.units[0];
        } catch {
            return block.timestamp;
        }
    }
}
