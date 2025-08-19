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
 █  ░  Contract . : TokenRendererV2                                            █
 █  ░  License .. : GPL-3.0-only                                               █
 █  ░  Language . : Solidity                                                   █
 █  ░  Standard . : N/A                                                        █
 ▓  ░  Version .. : 2.0.0                                                      ▓
 ▒  ░  Deployed . : 2025-08-XX                                                 ▒
 ░                                                                             ░
*/
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./ITokenRenderer.sol";
import "./ISimplePage.sol";

contract TokenRendererV2 is ITokenRenderer {
    ISimplePage public pages;

    constructor(ISimplePage _pages) {
        pages = _pages;
    }

    function renderPage(uint256 tokenId) public view returns (string memory) {
        PageData memory pageData = pages.getPageData(tokenId);

        // Calculate active units count
        uint256 activeUnits = 0;
        for (uint256 i = 0; i < pageData.units.length; i++) {
            if (pageData.units[i] > block.timestamp) {
                activeUnits++;
            }
        }

        // Calculate dynamic height based on number of units
        uint256 baseHeight = 450;
        uint256 unitHeight = 40; // Increased from 35 to 40 for better spacing
        uint256 unitsSectionHeight = pageData.units.length * unitHeight + 65; // 65 for header, spacing, and summary
        uint256 totalHeight = baseHeight - 170 + unitsSectionHeight; // 170 is the original units section height

        // Create SVG with dynamic height
        string memory svg = string(
            abi.encodePacked(
                '<svg width="400" height="',
                Strings.toString(totalHeight),
                '" viewBox="0 0 400 ',
                Strings.toString(totalHeight),
                '" xmlns="http://www.w3.org/2000/svg">',
                "<!-- Professional gradients and effects -->",
                "<defs>",
                "<!-- Enhanced pastel splash for the card -->",
                '<radialGradient id="cardSplash" cx="30%" cy="25%" r="85%">',
                '<stop offset="0%" stop-color="#ffeee6" stop-opacity="1" />',
                '<stop offset="30%" stop-color="#e6fffa" stop-opacity="0.95" />',
                '<stop offset="60%" stop-color="#ffe6e6" stop-opacity="0.9" />',
                '<stop offset="100%" stop-color="#e6eeff" stop-opacity="0.7" />',
                "</radialGradient>",
                "<!-- Premium card shadow -->",
                '<filter id="premiumShadow" x="-50%" y="-50%" width="200%" height="200%">',
                '<feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.08"/>',
                '<feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.12"/>',
                "</filter>",
                "<!-- Elegant header gradient -->",
                '<linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" stop-color="#4f46e5" />',
                '<stop offset="50%" stop-color="#6366f1" />',
                '<stop offset="100%" stop-color="#7c3aed" />',
                "</linearGradient>",
                "<!-- Subtle border gradient -->",
                '<linearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" stop-color="#f1f5f9" />',
                '<stop offset="50%" stop-color="#e2e8f0" />',
                '<stop offset="100%" stop-color="#cbd5e1" />',
                "</linearGradient>",
                "<!-- Accent highlight -->",
                '<linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">',
                '<stop offset="0%" stop-color="#3b82f6" />',
                '<stop offset="100%" stop-color="#8b5cf6" />',
                "</linearGradient>",
                "</defs>",
                "<!-- Main card container with pastel splash -->",
                '<rect x="25" y="25" width="350" height="',
                Strings.toString(totalHeight - 50),
                '" rx="24" ry="24" fill="url(#cardSplash)" stroke="url(#borderGradient)" stroke-width="1.5" filter="url(#premiumShadow)"/>',
                "<!-- Premium header -->",
                '<rect x="45" y="45" width="310" height="70" rx="20" ry="20" fill="white" opacity="0.7"/>',
                "<!-- SimplePage title with refined typography -->",
                '<text x="200" y="90" text-anchor="middle" font-family="\'Segoe UI\', system-ui, sans-serif" font-size="32" font-weight="600" fill="#4b5563" letter-spacing="-0.5">Simple Page</text>',
                "<!-- Domain section with modern styling -->",
                '<rect x="45" y="135" width="310" height="70" rx="16" ry="16" opacity="0.4" fill="rgba(255,255,255,0.7)" stroke="#e5e7eb" stroke-width="1"/>',
                '<text x="65" y="160" font-family="\'Segoe UI\', system-ui, sans-serif" font-size="13" font-weight="500" fill="#6b7280" text-transform="uppercase" letter-spacing="0.5">Domain</text>',
                '<text x="65" y="185" font-family="\'SF Mono\', \'Monaco\', \'Cascadia Code\', monospace" font-size="18" font-weight="600" fill="#1f2937">',
                pageData.domain,
                "</text>",
                "<!-- Units section with elegant layout -->",
                '<rect x="45" y="225" width="310" height="',
                Strings.toString(unitsSectionHeight),
                '" rx="16" ry="16" opacity="0.4" fill="rgba(255,255,255,0.7)" stroke="#e5e7eb" stroke-width="1"/>',
                '<text x="65" y="250" font-family="\'Segoe UI\', system-ui, sans-serif" font-size="13" font-weight="500" fill="#6b7280" text-transform="uppercase" letter-spacing="0.5">Units</text>'
            )
        );

        // Add unit entries with refined styling
        uint256 yPos = 265;
        for (uint256 i = 0; i < pageData.units.length; i++) {
            string memory status = pageData.units[i] > block.timestamp ? "Active" : "Expired";
            string memory statusColor = pageData.units[i] > block.timestamp ? "#059669" : "#dc2626";
            
            // Convert timestamp to ISO format
            string memory isoDate = _timestampToISO(pageData.units[i]);
            
            svg = string(
                abi.encodePacked(
                    svg,
                    '<g>',
                    '<rect x="65" y="',
                    Strings.toString(yPos),
                    '" width="280" height="35" rx="8" ry="8" fill="white" stroke="#f3f4f6" stroke-width="1" opacity="0.4"/>',
                    '<text x="80" y="',
                    Strings.toString(yPos + 20),
                    '" font-family="\'Segoe UI\', system-ui, sans-serif" font-size="14" fill="#374151">Unit #',
                    Strings.toString(i + 1),
                    ': <tspan font-weight="600" fill="',
                    statusColor,
                    '">',
                    status,
                    '</tspan> - ',
                    isoDate,
                    "</text>",
                    "</g>"
                )
            );
            yPos += 40; // Increased spacing between units
        }

        // Add active units summary with proper positioning
        svg = string(
            abi.encodePacked(
                svg,
                '<text x="65" y="',
                Strings.toString(yPos + 15),
                '" font-family="\'Segoe UI\', system-ui, sans-serif" font-size="12" fill="#6b7280" font-style="italic">',
                Strings.toString(activeUnits),
                " of ",
                Strings.toString(pageData.units.length),
                " units active</text>"
            )
        );

        // Subtle branding with proper positioning
        svg = string(
            abi.encodePacked(
                svg,
                '<text x="200" y="',
                Strings.toString(totalHeight - 35),
                '" text-anchor="middle" font-family="\'SF Mono\', \'Monaco\', \'Cascadia Code\', monospace" font-size="11" fill="#9ca3af" letter-spacing="1">simplepage.eth</text>',
                "</svg>"
            )
        );

        // Create attributes array with unit information
        string memory attributes = string(
            abi.encodePacked(
                ',"attributes":[',
                '{"trait_type":"domain","value":"',
                pageData.domain,
                '"},',
                '{"trait_type":"totalUnits","value":',
                Strings.toString(pageData.units.length),
                "},",
                '{"trait_type":"activeUnits","value":',
                Strings.toString(activeUnits),
                "}"
            )
        );

        // Add unit expiration times as traits
        for (uint256 i = 0; i < pageData.units.length && i < 5; i++) {
            string memory isoDate = _timestampToISO(pageData.units[i]);
            attributes = string(
                abi.encodePacked(
                    attributes,
                    ',{"trait_type":"unit',
                    Strings.toString(i + 1),
                    'ExpiresAt","value":"',
                    isoDate,
                    '"}'
                )
            );
        }

        attributes = string(abi.encodePacked(attributes, "]"));

        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Page #',
                        Strings.toString(tokenId),
                        '", "description": "Domain: ',
                        pageData.domain,
                        " with ",
                        Strings.toString(activeUnits),
                        ' active storage units", "image": "data:image/svg+xml;base64,',
                        Base64.encode(bytes(svg)),
                        '"',
                        attributes,
                        "}"
                    )
                )
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    /// @notice Converts a Unix timestamp to ISO 8601 format
    /// @param timestamp The Unix timestamp to convert
    /// @return The ISO formatted date string
    function _timestampToISO(uint256 timestamp) internal pure returns (string memory) {
        if (timestamp == 0) {
            return "Never";
        }
        
        // Convert to days since epoch for easier date calculation
        uint256 daysSinceEpoch = timestamp / 86400;
        
        // Approximate year calculation (not exact but good enough for display)
        uint256 year = 1970 + (daysSinceEpoch / 365);
        uint256 remainingDays = daysSinceEpoch % 365;
        
        // Simple month calculation (approximate)
        uint256 month = 1 + (remainingDays / 30);
        uint256 day = 1 + (remainingDays % 30);
        
        return string(
            abi.encodePacked(
                Strings.toString(year),
                "-",
                month < 10 ? "0" : "",
                Strings.toString(month),
                "-",
                day < 10 ? "0" : "",
                Strings.toString(day)
            )
        );
    }
}
