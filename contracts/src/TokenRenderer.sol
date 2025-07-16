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
 █  ░  Contract . : TokenRenderer                                              █
 █  ░  License .. : GPL-3.0-only                                               █
 █  ░  Language . : Solidity                                                   █
 █  ░  Standard . : N/A                                                        █
 ▓  ░  Version .. : 1.0.0                                                      ▓
 ▒  ░  Deployed . : 2025-07-17                                                 ▒
 ░                                                                             ░
*/
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./ITokenRenderer.sol";
import "./ISimplePage.sol";

contract TokenRenderer is ITokenRenderer {
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

        // Create SVG with active units information
        string memory svg = string(
            abi.encodePacked(
                '<svg width="250" height="300" xmlns="http://www.w3.org/2000/svg">',
                "<style>",
                ".title { font-family: Arial; font-size: 16px; }",
                ".info { font-family: Arial; font-size: 14px; }",
                ".units { font-family: Arial; font-size: 12px; fill: #666; }",
                "</style>",
                '<rect width="100%" height="100%" fill="white"/>',
                '<text x="20" y="40" class="title" font-weight="bold">SimplePage Subscription</text>',
                '<text x="20" y="80" class="info">Domain: ',
                pageData.domain,
                "</text>",
                '<text x="20" y="110" class="info">Active Units: ',
                Strings.toString(activeUnits),
                " / ",
                Strings.toString(pageData.units.length),
                "</text>"
            )
        );

        // Add unit expiration times
        uint256 yPos = 150;
        for (uint256 i = 0; i < pageData.units.length && i < 5; i++) {
            string memory status = pageData.units[i] > block.timestamp ? "Active" : "Expired";
            svg = string(
                abi.encodePacked(
                    svg,
                    '<text x="20" y="',
                    Strings.toString(yPos),
                    '" class="units">Unit ',
                    Strings.toString(i),
                    ": ",
                    status,
                    " (Expires: ",
                    Strings.toString(pageData.units[i]),
                    ")</text>"
                )
            );
            yPos += 25;
        }

        svg = string(abi.encodePacked(svg, "</svg>"));

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

        // Add first 3 unit expiration times as traits
        for (uint256 i = 0; i < pageData.units.length && i < 3; i++) {
            attributes = string(
                abi.encodePacked(
                    attributes,
                    ',{"trait_type":"unit',
                    Strings.toString(i),
                    'ExpiresAt","value":',
                    Strings.toString(pageData.units[i]),
                    "}"
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
}
