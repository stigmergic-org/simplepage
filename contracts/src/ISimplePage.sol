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
 █  ░  Contract . : ISimplePage                                                █
 █  ░  License .. : GPL-3.0-only                                               █
 █  ░  Language . : Solidity                                                   █
 █  ░  Standard . : N/A                                                        █
 ▓  ░  Version .. : 1.0.0                                                      ▓
 ▒  ░  Deployed . : 2025-07-17                                                 ▒
 ░                                                                             ░
*/
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Struct representing page data with multiple storage units
/// @dev units array contains expiration timestamps for each storage unit
struct PageData {
    string domain;
    uint256[] units; // Expiration timestamps for each unit
}

interface ISimplePage is IERC721 {
    /// @notice Emitted when storage units are updated for a page
    /// @param id The ID of the page token
    /// @param domain The domain of the page
    /// @param unitIndex The highest index that was updated
    /// @param expiresAt The new expiration timestamp for the updated units
    /// @param patron The address that owns the NFT
    event UnitsUpdated(uint256 indexed id, string domain, uint256 unitIndex, uint256 expiresAt, address indexed patron);

    /// @notice Retrieves the data of a specific page
    /// @param id The ID of the page to query
    /// @return The data of the specified page
    function getPageData(uint256 id) external view returns (PageData memory);

    /// @notice Updates storage units for a page up to a specified index
    /// @param domain The domain of the page
    /// @param expiresAt The timestamp when the units will expire
    /// @param unitIndex The highest index to update or add
    /// @param patron The address that will own this NFT
    /// @return The ID of the page token
    function updateUnits(string memory domain, uint256 expiresAt, uint256 unitIndex, address patron)
        external
        returns (uint256);

    /// @notice Checks if a specific storage unit is active for a page
    /// @param id The ID of the page
    /// @param unitIndex The index of the unit to check
    /// @return True if the unit is active, false otherwise
    function isUnitActive(uint256 id, uint256 unitIndex) external view returns (bool);

    /// @notice Computes the token ID for a given domain
    /// @param domain The domain to calculate the token ID for
    /// @return The token ID for the given domain
    function tokenIdForDomain(string memory domain) external pure returns (uint256);
}
