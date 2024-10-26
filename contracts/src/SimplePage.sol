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
 █  ░  Contract . : SimplePage                                                 █
 █  ░  License .. : GPL-3.0-only                                               █
 █  ░  Language . : Solidity                                                   █
 █  ░  Standard . : ERC721                                                     █
 ▓  ░  Version .. : 1.0.0                                                      ▓
 ▒  ░  Deployed . : 2025-XX-XX                                                 ▒
 ░                                                                             ░
*/
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./ITokenRenderer.sol";
import "./ISimplePage.sol";

/// @title SimplePage NFT Contract
/// @notice This contract manages the creation and rendering of SimplePage NFTs
/// @dev Inherits from ERC721, AccessControl, and ISimplePage
contract SimplePage is ERC721, AccessControl, ISimplePage {
    mapping(uint256 => PageData) private _pageData;

    ITokenRenderer public renderer;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Initializes the SimplePage contract
    /// @dev Sets the name to "SimplePage" and the symbol to "SIMPLEPAGE"
    constructor() ERC721("SimplePage", "SIMPLEPAGE") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Updates storage units for a page up to a specified index
    /// @param domain The domain of the page
    /// @param expiresAt The timestamp when the units will expire
    /// @param unitIndex The highest index to update or add
    /// @param patron The address that will own this NFT
    /// @return The ID of the newly minted or updated token
    function updateUnits(string memory domain, uint256 expiresAt, uint256 unitIndex, address patron)
        public
        onlyRole(MINTER_ROLE)
        returns (uint256)
    {
        require(expiresAt > block.timestamp, "Expiration time must be in the future");
        uint256 id = tokenIdForDomain(domain);

        if (!_exists(id)) {
            // Create new page if it doesn't exist
            _mint(patron, id);
            _pageData[id].domain = domain;

            // Initialize units up to unitIndex with the same expiration date
            for (uint256 i = 0; i <= unitIndex; i++) {
                _pageData[id].units.push(expiresAt);
            }
        } else {
            uint256 newTotalUnits = Math.max(unitIndex + 1, _pageData[id].units.length);

            for (uint256 i = 0; i < newTotalUnits; i++) {
                if (i <= unitIndex) {
                    if (i < _pageData[id].units.length) {
                        require(
                            expiresAt >= _pageData[id].units[i],
                            "New expiration date must be greater than existing unit expiry."
                        );
                        _pageData[id].units[i] = expiresAt;
                    } else {
                        _pageData[id].units.push(expiresAt);
                    }
                } else {
                    break;
                }
            }
            // If patron is different from current owner, transfer the NFT
            if (ownerOf(id) != patron) {
                _transfer(ownerOf(id), patron, id);
            }
        }

        // Emit the event after all updates are complete
        emit UnitsUpdated(id, domain, unitIndex, expiresAt, patron);

        return id;
    }

    /// @notice Checks if a specific storage unit is active for a page
    /// @param id The ID of the page
    /// @param unitIndex The index of the unit to check
    /// @return True if the unit is active, false otherwise
    function isUnitActive(uint256 id, uint256 unitIndex) public view returns (bool) {
        require(_exists(id), "Page does not exist");

        if (unitIndex >= _pageData[id].units.length) {
            return false;
        }

        return _pageData[id].units[unitIndex] > block.timestamp;
    }

    /// @notice Retrieves the data of a specific page
    /// @param id The ID of the page to query
    /// @return The data of the specified page
    function getPageData(uint256 id) public view returns (PageData memory) {
        require(_exists(id), "Page does not exist");
        return _pageData[id];
    }

    /// @notice Computes the token ID for a given domain
    /// @param domain The domain to calculate the token ID for
    /// @return The token ID for the given domain
    function tokenIdForDomain(string memory domain) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(domain)));
    }

    /// @notice Returns the URI for a given token ID
    /// @dev Overrides the ERC721 tokenURI function
    /// @param tokenId The ID of the token to query
    /// @return The URI string for the token metadata
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "ERC721: URI query for nonexistent token");
        require(address(renderer) != address(0), "Renderer not set");
        return renderer.renderPage(tokenId);
    }

    /// @notice Sets a new renderer contract address
    /// @dev Only accounts with DEFAULT_ADMIN_ROLE can set a new renderer
    /// @param _newRenderer The address of the new renderer contract
    function setRenderer(address _newRenderer) public onlyRole(DEFAULT_ADMIN_ROLE) {
        renderer = ITokenRenderer(_newRenderer);
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        try this.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }

    // Override supportsInterface function
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
