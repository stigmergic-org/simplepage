// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Strings.sol";

contract FoamIdenticon {
    using Strings for uint256;

    uint256 private constant DEFAULT_SIZE = 512;
    uint256 private constant MIN_SIZE = 16;

    uint256 private constant CELL_MIN = 5;
    uint256 private constant CELL_MAX = 9;
    uint256 private constant MARGIN_NUM = 3;
    uint256 private constant MARGIN_DEN = 100;
    uint256 private constant MIN_MARGIN = 4;

    int256 private constant FP = 10000;
    int256 private constant FP_HALF = 5000;
    int256 private constant JITTER_FP = 4500;
    int256 private constant SIMPLIFY_NUM = 10;
    int256 private constant SIMPLIFY_DEN = 100;
    int256 private constant EDGE_FRACTION_NUM = 18;
    int256 private constant EDGE_FRACTION_DEN = 100;
    int256 private constant STROKE_BASE = 8;
    int256 private constant STROKE_OPACITY_FP = 2200;
    int256 private constant INSET_MIN_FP = 3500;
    int256 private constant INSET_RATIO_NUM = 5;
    int256 private constant INSET_RATIO_DEN = 100;
    int256 private constant INSET_LIMIT_NUM = 45;
    int256 private constant INSET_LIMIT_DEN = 100;
    int256 private constant GRADIENT_JITTER_FP = 600;
    int256 private constant PALETTE_JITTER_FP = 1800;

    uint256 private constant MAX_POINTS = 64;
    uint256 private constant MAX_VERTICES = 40;

    uint64 private constant RNG_MULT = 2685821657736338717;

    uint256 private constant DIR_COUNT = 8;

    string private constant STROKE_COLOR = "var(--color-base-content, oklch(21% 0.006 285.885))";
    string private constant COLOR_PRIMARY = "var(--color-primary, oklch(45% 0.24 277.023))";
    string private constant COLOR_SECONDARY = "var(--color-secondary, oklch(65% 0.241 354.308))";
    string private constant COLOR_ACCENT = "var(--color-accent, oklch(77% 0.152 181.912))";
    string private constant COLOR_INFO = "var(--color-info, oklch(74% 0.16 232.661))";
    string private constant COLOR_SUCCESS = "var(--color-success, oklch(76% 0.177 163.223))";
    string private constant COLOR_WARNING = "var(--color-warning, oklch(82% 0.189 84.429))";
    string private constant COLOR_ERROR = "var(--color-error, oklch(71% 0.194 13.428))";

    struct Point {
        int256 x;
        int256 y;
    }

    struct Gradient {
        int256 dirX;
        int256 dirY;
        int256 min;
        int256 max;
    }

    struct Context {
        uint256 pixelSize;
        uint256 margin;
        int256 sizeFp;
        int256 strokeWidth;
        int256 cellInset;
        int256 marginFp;
        Gradient gradient;
        bool useOcean;
        int256 simplifyThreshold;
    }


    struct Grid {
        uint256 cols;
        uint256 rows;
        int256 cellWidthFp;
        int256 cellHeightFp;
        int256 jitterX;
        int256 jitterY;
        int256 marginFp;
        int256 maxCoord;
        uint256 size;
    }

    struct EdgeWork {
        int256 dx;
        int256 dy;
        int256 nx;
        int256 ny;
        int256 edgeLen;
        int256 c;
        int256 cInset;
    }


    function generateFoamSvg(string memory seed, uint256 size) public pure returns (string memory) {
        (Context memory ctx, uint64 state, uint256 targetCount) = prepareContext(seed, size);
        (Point[] memory points, uint256 pointsLen, uint64 nextState) = generatePoints(
            state,
            ctx.pixelSize,
            targetCount,
            ctx.margin,
            ctx.marginFp
        );

        int256 spacing = computeSpacing(ctx.sizeFp, pointsLen);
        ctx.simplifyThreshold = (spacing * SIMPLIFY_NUM) / SIMPLIFY_DEN;

        string memory svg = buildSvgHeader(ctx.pixelSize, ctx.strokeWidth);
        (svg, state) = appendCells(svg, points, pointsLen, ctx, nextState);
        return string(abi.encodePacked(svg, '</g></svg>'));
    }

    function prepareContext(
        string memory seed,
        uint256 size
    ) internal pure returns (Context memory ctx, uint64 state, uint256 cellCount) {
        ctx.pixelSize = size < MIN_SIZE ? MIN_SIZE : size;
        state = initRng(seed);

        uint64 rnd;
        (state, rnd) = nextUint(state);
        ctx.useOcean = (rnd & 1) == 0;

        (state, rnd) = nextUint(state);
        cellCount = CELL_MIN + (uint256(rnd) % (CELL_MAX - CELL_MIN + 1));

        (state, rnd) = nextUint(state);
        uint256 dirIndex = uint256(rnd) % DIR_COUNT;
        ctx.gradient = createGradient(ctx.pixelSize, dirX(dirIndex), dirY(dirIndex));

        ctx.sizeFp = int256(ctx.pixelSize) * FP;
        ctx.strokeWidth = (STROKE_BASE * int256(ctx.pixelSize) * FP) / int256(DEFAULT_SIZE);
        int256 spacing = computeSpacing(ctx.sizeFp, cellCount);
        int256 insetFromSpacing = (spacing * INSET_RATIO_NUM) / INSET_RATIO_DEN;
        int256 strokeInset = ctx.strokeWidth / 2;
        ctx.cellInset = maxInt(INSET_MIN_FP, maxInt(strokeInset, insetFromSpacing));

        ctx.margin = (ctx.pixelSize * MARGIN_NUM) / MARGIN_DEN;
        if (ctx.margin < MIN_MARGIN) {
            ctx.margin = MIN_MARGIN;
        }
        ctx.marginFp = int256(ctx.margin) * FP;
    }

    function buildSvgHeader(uint256 pixelSize, int256 strokeWidth) internal pure returns (string memory) {
        string memory svg = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="',
                pixelSize.toString(),
                '" height="',
                pixelSize.toString(),
                '" viewBox="0 0 ',
                pixelSize.toString(),
                " ",
                pixelSize.toString(),
                '" fill="none">'
            )
        );
        svg = string(
            abi.encodePacked(
                svg,
                '<g stroke="',
                STROKE_COLOR,
                '" stroke-width="',
                formatFixed(strokeWidth),
                '" stroke-opacity="',
                formatFixed(STROKE_OPACITY_FP),
                '" stroke-linejoin="round" stroke-linecap="round">'
            )
        );
        return svg;
    }

    function appendCells(
        string memory svg,
        Point[] memory points,
        uint256 pointsLen,
        Context memory ctx,
        uint64 state
    ) internal pure returns (string memory, uint64) {
        for (uint256 i = 0; i < pointsLen; i++) {
            (string memory cellPath, string memory fill, uint64 updatedState) = buildCell(
                points,
                pointsLen,
                i,
                ctx,
                state
            );
            state = updatedState;

            if (bytes(cellPath).length == 0) {
                continue;
            }
            svg = string(
                abi.encodePacked(svg, '<path d="', cellPath, '" fill="', fill, '"/>')
            );
        }
        return (svg, state);
    }

    function buildCell(
        Point[] memory points,
        uint256 pointsLen,
        uint256 index,
        Context memory ctx,
        uint64 state
    ) internal pure returns (string memory, string memory, uint64) {
        Point[] memory poly = new Point[](MAX_VERTICES);
        uint256 polyLen = 4;
        poly[0] = Point(0, 0);
        poly[1] = Point(ctx.sizeFp, 0);
        poly[2] = Point(ctx.sizeFp, ctx.sizeFp);
        poly[3] = Point(0, ctx.sizeFp);

        Point memory site = points[index];
        for (uint256 j = 0; j < pointsLen; j++) {
            if (j == index) {
                continue;
            }
            Point memory other = points[j];
            int256 nx = other.x - site.x;
            int256 ny = other.y - site.y;
            int256 c = (other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y) / 2;

            (poly, polyLen) = clipPolygon(poly, polyLen, nx, ny, c);
            if (polyLen < 3) {
                return ("", "", state);
            }
        }

        (poly, polyLen) = insetPolygonByEdges(poly, polyLen, ctx.cellInset);
        if (polyLen < 3) {
            return ("", "", state);
        }

        int256 frameInset = ctx.strokeWidth / 2;
        (poly, polyLen) = snapPolygonToFrame(poly, polyLen, ctx.sizeFp, frameInset, ctx.cellInset);
        if (polyLen < 3) {
            return ("", "", state);
        }

        (poly, polyLen) = simplifyPolygon(poly, polyLen, ctx.simplifyThreshold);
        if (polyLen < 3) {
            return ("", "", state);
        }

        Point memory centroid = polygonCentroid(poly, polyLen);

        string memory path = buildRoundedPath(poly, polyLen);
        (string memory fill, uint64 nextState) = colorForCell(centroid, ctx.gradient, ctx.useOcean, state);
        return (path, fill, nextState);
    }

    function computeSpacing(int256 sizeFp, uint256 count) internal pure returns (int256) {
        if (count == 0) {
            return 0;
        }
        uint256 size = uint256(sizeFp);
        uint256 area = size * size;
        uint256 spacing = sqrt(area / count);
        return int256(spacing);
    }

    function buildInsetPolygon(
        Point[] memory points,
        uint256 pointsLen,
        uint256 index,
        int256 sizeFp,
        int256 cellInset
    ) internal pure returns (Point[] memory, uint256) {
        Point[] memory poly = new Point[](MAX_VERTICES);
        uint256 polyLen = 4;
        poly[0] = Point(0, 0);
        poly[1] = Point(sizeFp, 0);
        poly[2] = Point(sizeFp, sizeFp);
        poly[3] = Point(0, sizeFp);

        Point memory site = points[index];
        for (uint256 j = 0; j < pointsLen; j++) {
            if (j == index) {
                continue;
            }
            Point memory other = points[j];
            int256 nx = other.x - site.x;
            int256 ny = other.y - site.y;
            int256 c = (other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y) / 2;

            (poly, polyLen) = clipPolygon(poly, polyLen, nx, ny, c);
            if (polyLen < 3) {
                return (poly, 0);
            }
        }

        (poly, polyLen) = insetPolygonByEdges(poly, polyLen, cellInset);
        if (polyLen < 3) {
            return (poly, 0);
        }
        return (poly, polyLen);
    }

    function createGradient(uint256 size, int256 dirX, int256 dirY) internal pure returns (Gradient memory) {
        int256 sizeFp = int256(size) * FP;
        Point[4] memory corners = [
            Point(0, 0),
            Point(sizeFp, 0),
            Point(sizeFp, sizeFp),
            Point(0, sizeFp)
        ];

        int256 minProj = dirX * corners[0].x + dirY * corners[0].y;
        int256 maxProj = minProj;
        for (uint256 i = 1; i < 4; i++) {
            int256 proj = dirX * corners[i].x + dirY * corners[i].y;
            if (proj < minProj) {
                minProj = proj;
            }
            if (proj > maxProj) {
                maxProj = proj;
            }
        }
        return Gradient(dirX, dirY, minProj, maxProj);
    }

    function generatePoints(
        uint64 state,
        uint256 size,
        uint256 count,
        uint256 margin,
        int256 marginFp
    ) internal pure returns (Point[] memory, uint256, uint64) {
        Grid memory grid = buildGrid(size, count, margin, marginFp);

        Point[] memory points = new Point[](MAX_POINTS);
        uint256 len = 0;

        for (uint256 row = 0; row < grid.rows; row++) {
            for (uint256 col = 0; col < grid.cols; col++) {
                Point memory point;
                (state, point) = jitterPoint(state, grid, row, col);
                points[len] = point;
                len++;
            }
        }

        if (len > count) {
            for (uint256 i = len - 1; i > 0; i--) {
                uint256 j;
                (state, j) = randInt(state, 0, i);
                Point memory temp = points[i];
                points[i] = points[j];
                points[j] = temp;
            }
            len = count;
        }

        while (len < count) {
            Point memory point;
            (state, point) = randomPoint(state, grid);
            points[len] = point;
            len++;
        }

        return (points, len, state);
    }

    function buildGrid(
        uint256 size,
        uint256 count,
        uint256 margin,
        int256 marginFp
    ) internal pure returns (Grid memory grid) {
        uint256 usable = size > margin * 2 ? size - margin * 2 : 1;
        uint256 area = usable * usable;
        uint256 spacing = sqrt(area / count);
        if (spacing == 0) {
            spacing = 1;
        }

        uint256 cols = usable / spacing;
        if (cols < 2) {
            cols = 2;
        }
        uint256 rows = usable / spacing;
        if (rows < 2) {
            rows = 2;
        }

        uint256 cellWidth = usable / cols;
        uint256 cellHeight = usable / rows;
        if (cellWidth == 0) {
            cellWidth = 1;
        }
        if (cellHeight == 0) {
            cellHeight = 1;
        }

        grid.cols = cols;
        grid.rows = rows;
        grid.cellWidthFp = int256(cellWidth) * FP;
        grid.cellHeightFp = int256(cellHeight) * FP;
        grid.jitterX = (grid.cellWidthFp * JITTER_FP) / FP;
        grid.jitterY = (grid.cellHeightFp * JITTER_FP) / FP;
        grid.marginFp = marginFp;
        grid.maxCoord = int256(size) * FP - marginFp;
        grid.size = size;
    }

    function jitterPoint(
        uint64 state,
        Grid memory grid,
        uint256 row,
        uint256 col
    ) internal pure returns (uint64, Point memory) {
        int256 jitterXVal;
        int256 jitterYVal;
        (state, jitterXVal) = randSigned(state, grid.jitterX);
        (state, jitterYVal) = randSigned(state, grid.jitterY);

        int256 x = grid.marginFp + int256(col) * grid.cellWidthFp + grid.cellWidthFp / 2 + jitterXVal;
        int256 y = grid.marginFp + int256(row) * grid.cellHeightFp + grid.cellHeightFp / 2 + jitterYVal;

        x = clampInt(x, grid.marginFp, grid.maxCoord);
        y = clampInt(y, grid.marginFp, grid.maxCoord);

        return (state, Point(x, y));
    }

    function randomPoint(uint64 state, Grid memory grid) internal pure returns (uint64, Point memory) {
        int256 randX;
        int256 randY;
        (state, randX) = randFixed(state, grid.marginFp, int256(grid.size) * FP - grid.marginFp);
        (state, randY) = randFixed(state, grid.marginFp, int256(grid.size) * FP - grid.marginFp);
        return (state, Point(randX, randY));
    }

    function clipPolygon(
        Point[] memory polygon,
        uint256 len,
        int256 nx,
        int256 ny,
        int256 c
    ) internal pure returns (Point[] memory, uint256) {
        Point[] memory output = new Point[](MAX_VERTICES);
        uint256 outLen = 0;
        if (len < 3) {
            return (output, 0);
        }

        for (uint256 i = 0; i < len; i++) {
            Point memory a = polygon[i];
            Point memory b = polygon[(i + 1) % len];
            bool aInside = nx * a.x + ny * a.y <= c;
            bool bInside = nx * b.x + ny * b.y <= c;

            if (aInside && bInside) {
                if (outLen >= MAX_VERTICES) {
                    return (output, outLen);
                }
                output[outLen] = b;
                outLen++;
            } else if (aInside && !bInside) {
                if (outLen >= MAX_VERTICES) {
                    return (output, outLen);
                }
                output[outLen] = intersect(a, b, nx, ny, c);
                outLen++;
            } else if (!aInside && bInside) {
                if (outLen >= MAX_VERTICES) {
                    return (output, outLen);
                }
                output[outLen] = intersect(a, b, nx, ny, c);
                outLen++;
                if (outLen >= MAX_VERTICES) {
                    return (output, outLen);
                }
                output[outLen] = b;
                outLen++;
            }
        }

        return (output, outLen);
    }

    function intersect(Point memory a, Point memory b, int256 nx, int256 ny, int256 c) internal pure returns (Point memory) {
        int256 dx = b.x - a.x;
        int256 dy = b.y - a.y;
        int256 denom = nx * dx + ny * dy;
        if (denom == 0) {
            return a;
        }
        int256 t = c - (nx * a.x + ny * a.y);
        return Point(
            a.x + mulDivSigned(dx, t, denom),
            a.y + mulDivSigned(dy, t, denom)
        );
    }

    function polygonCentroid(Point[] memory points, uint256 len) internal pure returns (Point memory) {
        int256 area = 0;
        int256 cx = 0;
        int256 cy = 0;
        for (uint256 i = 0; i < len; i++) {
            Point memory p1 = points[i];
            Point memory p2 = points[(i + 1) % len];
            int256 cross = p1.x * p2.y - p2.x * p1.y;
            area += cross;
            cx += (p1.x + p2.x) * cross;
            cy += (p1.y + p2.y) * cross;
        }

        if (area == 0) {
            return points[0];
        }

        int256 denom = 6 * area;
        return Point(cx / denom, cy / denom);
    }

    function insetPolygonByEdges(
        Point[] memory points,
        uint256 len,
        int256 inset
    ) internal pure returns (Point[] memory, uint256) {
        if (len < 3 || inset <= 0) {
            return (points, len);
        }

        bool isCcw = polygonArea(points, len) >= 0;
        int256 minEdge = minEdgeLength(points, len);
        if (minEdge == 0) {
            return (points, len);
        }

        int256 maxInset = (minEdge * INSET_LIMIT_NUM) / INSET_LIMIT_DEN;
        int256 appliedInset = inset > maxInset ? maxInset : inset;
        if (appliedInset <= 0) {
            return (points, len);
        }

        return clipInset(points, len, appliedInset, isCcw);
    }

    function minEdgeLength(Point[] memory points, uint256 len) internal pure returns (int256) {
        int256 minEdge = 0;
        for (uint256 i = 0; i < len; i++) {
            Point memory p1 = points[i];
            Point memory p2 = points[(i + 1) % len];
            int256 dx = p2.x - p1.x;
            int256 dy = p2.y - p1.y;
            int256 dist = int256(sqrt(uint256(absInt(dx) * absInt(dx) + absInt(dy) * absInt(dy))));
            if (dist > 0 && (minEdge == 0 || dist < minEdge)) {
                minEdge = dist;
            }
        }
        return minEdge;
    }

    function clipInset(
        Point[] memory points,
        uint256 len,
        int256 inset,
        bool isCcw
    ) internal pure returns (Point[] memory, uint256) {
        Point[] memory poly = points;
        uint256 polyLen = len;
        EdgeWork memory edge;

        for (uint256 i = 0; i < len; i++) {
            Point memory p1 = points[i];
            Point memory p2 = points[(i + 1) % len];
            edge.dx = p2.x - p1.x;
            edge.dy = p2.y - p1.y;
            if (edge.dx == 0 && edge.dy == 0) {
                continue;
            }

            edge.nx = isCcw ? edge.dy : -edge.dy;
            edge.ny = isCcw ? -edge.dx : edge.dx;
            edge.edgeLen = int256(
                sqrt(uint256(absInt(edge.dx) * absInt(edge.dx) + absInt(edge.dy) * absInt(edge.dy)))
            );
            if (edge.edgeLen == 0) {
                continue;
            }

            edge.c = edge.nx * p1.x + edge.ny * p1.y;
            edge.cInset = edge.c - inset * edge.edgeLen;
            (poly, polyLen) = clipPolygon(poly, polyLen, edge.nx, edge.ny, edge.cInset);
            if (polyLen < 3) {
                return (poly, 0);
            }
        }

        return (poly, polyLen);
    }

    function polygonArea(Point[] memory points, uint256 len) internal pure returns (int256) {
        int256 area = 0;
        for (uint256 i = 0; i < len; i++) {
            Point memory p1 = points[i];
            Point memory p2 = points[(i + 1) % len];
            area += p1.x * p2.y - p2.x * p1.y;
        }
        return area;
    }

    function snapPolygonToFrame(
        Point[] memory points,
        uint256 len,
        int256 sizeFp,
        int256 frameInset,
        int256 snapThreshold
    ) internal pure returns (Point[] memory, uint256) {
        if (len < 3 || frameInset <= 0 || snapThreshold <= 0) {
            return (points, len);
        }

        int256 maxLine = sizeFp - frameInset;
        if (maxLine <= frameInset) {
            return (points, len);
        }

        int256 minSnap = snapThreshold;
        int256 maxSnap = sizeFp - snapThreshold;
        for (uint256 i = 0; i < len; i++) {
            Point memory point = points[i];
            int256 x = point.x;
            int256 y = point.y;

            if (x <= minSnap) {
                x = frameInset;
            } else if (x >= maxSnap) {
                x = maxLine;
            }

            if (y <= minSnap) {
                y = frameInset;
            } else if (y >= maxSnap) {
                y = maxLine;
            }

            points[i] = Point(x, y);
        }

        return (points, len);
    }

    function simplifyPolygon(
        Point[] memory points,
        uint256 len,
        int256 threshold
    ) internal pure returns (Point[] memory, uint256) {
        if (len < 3 || threshold <= 0) {
            return (points, len);
        }

        Point[] memory output = new Point[](MAX_VERTICES);
        uint256 outLen = 1;
        output[0] = points[0];

        for (uint256 i = 1; i < len; i++) {
            Point memory prev = output[outLen - 1];
            Point memory curr = points[i];
            if (edgeLength(prev, curr) < threshold) {
                continue;
            }
            if (outLen >= MAX_VERTICES) {
                break;
            }
            output[outLen] = curr;
            outLen++;
        }

        if (outLen >= 3) {
            if (edgeLength(output[outLen - 1], output[0]) < threshold && outLen > 3) {
                outLen--;
            }
        }

        if (outLen < 3) {
            return (points, len);
        }

        return (output, outLen);
    }

    function buildRoundedPath(Point[] memory points, uint256 len) internal pure returns (string memory) {
        if (len < 3) {
            return "";
        }

        int256 denom = EDGE_FRACTION_DEN;
        if (denom <= 0) {
            return "";
        }
        int256 maxNum = denom / 2;
        int256 num = EDGE_FRACTION_NUM > maxNum ? maxNum : EDGE_FRACTION_NUM;
        if (num <= 0) {
            return "";
        }

        Point[] memory entries = new Point[](len);
        Point[] memory exits = new Point[](len);
        for (uint256 i = 0; i < len; i++) {
            Point memory prev = points[(i + len - 1) % len];
            Point memory curr = points[i];
            Point memory next = points[(i + 1) % len];
            int256 cornerNum = cornerRatioNum(prev, curr, next, num, denom);
            entries[i] = Point(
                curr.x + mulDivSigned(prev.x - curr.x, cornerNum, denom),
                curr.y + mulDivSigned(prev.y - curr.y, cornerNum, denom)
            );
            exits[i] = Point(
                curr.x + mulDivSigned(next.x - curr.x, cornerNum, denom),
                curr.y + mulDivSigned(next.y - curr.y, cornerNum, denom)
            );
        }

        string memory path = string(abi.encodePacked("M ", formatPoint(entries[0])));
        for (uint256 i = 0; i < len; i++) {
            if (i > 0) {
                path = string(abi.encodePacked(path, " L ", formatPoint(entries[i])));
            }
            path = string(
                abi.encodePacked(path, " Q ", formatPoint(points[i]), " ", formatPoint(exits[i]))
            );
        }
        path = string(abi.encodePacked(path, " Z"));
        return path;
    }

    function cornerRatioNum(
        Point memory prev,
        Point memory curr,
        Point memory next,
        int256 num,
        int256 denom
    ) internal pure returns (int256) {
        int256 vx1 = prev.x - curr.x;
        int256 vy1 = prev.y - curr.y;
        int256 vx2 = next.x - curr.x;
        int256 vy2 = next.y - curr.y;
        int256 len1 = int256(sqrt(uint256(absInt(vx1) * absInt(vx1) + absInt(vy1) * absInt(vy1))));
        int256 len2 = int256(sqrt(uint256(absInt(vx2) * absInt(vx2) + absInt(vy2) * absInt(vy2))));
        int256 cosDen = len1 * len2;
        if (cosDen <= 0) {
            return num;
        }
        int256 dot = vx1 * vx2 + vy1 * vy2;
        int256 oneMinusCos = cosDen - dot;
        if (oneMinusCos < 0) {
            oneMinusCos = 0;
        }
        uint256 value = (uint256(oneMinusCos) * uint256(FP)) / uint256(2 * cosDen);
        if (value > uint256(FP)) {
            value = uint256(FP);
        }
        uint256 scaleFp = sqrt(value * uint256(FP));
        return int256((uint256(num) * scaleFp) / uint256(FP));
    }

    function edgeLength(Point memory a, Point memory b) internal pure returns (int256) {
        int256 dx = b.x - a.x;
        int256 dy = b.y - a.y;
        return int256(sqrt(uint256(absInt(dx) * absInt(dx) + absInt(dy) * absInt(dy))));
    }

    function colorForCell(
        Point memory centroid,
        Gradient memory gradient,
        bool useOcean,
        uint64 state
    ) internal pure returns (string memory, uint64) {
        int256 proj = gradient.dirX * centroid.x + gradient.dirY * centroid.y;
        int256 span = gradient.max - gradient.min;
        if (span == 0) {
            span = 1;
        }

        int256 t = ((proj - gradient.min) * FP) / span;
        int256 jitter1;
        (state, jitter1) = randSigned(state, GRADIENT_JITTER_FP);
        t = clampInt(t + jitter1, 0, FP);

        int256 jitter2;
        (state, jitter2) = randSigned(state, PALETTE_JITTER_FP);
        int256 adjusted = clampInt(t + jitter2, 0, FP - 1);
        uint256 index = uint256((adjusted * int256(7)) / FP);
        return (paletteColor(index, useOcean), state);
    }

    function paletteColor(uint256 index, bool ocean) internal pure returns (string memory) {
        if (ocean) {
            if (index == 0) return COLOR_INFO;
            if (index == 1) return COLOR_PRIMARY;
            if (index == 2) return COLOR_ACCENT;
            if (index == 3) return COLOR_SECONDARY;
            if (index == 4) return COLOR_SUCCESS;
            if (index == 5) return COLOR_WARNING;
            return COLOR_ERROR;
        }

        if (index == 0) return COLOR_WARNING;
        if (index == 1) return COLOR_ERROR;
        if (index == 2) return COLOR_SECONDARY;
        if (index == 3) return COLOR_PRIMARY;
        if (index == 4) return COLOR_ACCENT;
        if (index == 5) return COLOR_INFO;
        return COLOR_SUCCESS;
    }

    function dirX(uint256 index) internal pure returns (int256) {
        if (index == 0) return 1;
        if (index == 1) return 0;
        if (index == 2) return 1;
        if (index == 3) return -1;
        if (index == 4) return 1;
        if (index == 5) return -1;
        if (index == 6) return 0;
        return -1;
    }

    function dirY(uint256 index) internal pure returns (int256) {
        if (index == 0) return 0;
        if (index == 1) return 1;
        if (index == 2) return 1;
        if (index == 3) return 1;
        if (index == 4) return -1;
        if (index == 5) return 0;
        if (index == 6) return -1;
        return -1;
    }

    function formatPoint(Point memory point) internal pure returns (string memory) {
        return string(abi.encodePacked(formatFixed(point.x), " ", formatFixed(point.y)));
    }

    function formatFixed(int256 value) internal pure returns (string memory) {
        bool neg = value < 0;
        uint256 absVal = uint256(neg ? -value : value);
        uint256 scaled = (absVal * 100 + uint256(FP_HALF)) / uint256(FP);
        uint256 intPart = scaled / 100;
        uint256 frac = scaled % 100;
        string memory fracText = frac < 10 ? string(abi.encodePacked("0", frac.toString())) : frac.toString();
        return string(abi.encodePacked(neg ? "-" : "", intPart.toString(), ".", fracText));
    }

    function initRng(string memory seed) internal pure returns (uint64) {
        bytes32 hash = keccak256(bytes(seed));
        uint64 state = uint64(uint256(hash));
        if (state == 0) {
            state = 1;
        }
        return state;
    }

    function nextUint(uint64 state) internal pure returns (uint64, uint64) {
        uint64 x = state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        x = uint64(uint256(x) & ((1 << 64) - 1));
        uint64 result = uint64(uint256(x) * uint256(RNG_MULT));
        return (x, result);
    }

    function randInt(uint64 state, uint256 min, uint256 max) internal pure returns (uint64, uint256) {
        if (max <= min) {
            return (state, min);
        }
        uint64 rnd;
        (state, rnd) = nextUint(state);
        uint256 range = max - min + 1;
        return (state, min + (uint256(rnd) % range));
    }

    function randFixed(uint64 state, int256 min, int256 max) internal pure returns (uint64, int256) {
        if (max <= min) {
            return (state, min);
        }
        uint64 rnd;
        (state, rnd) = nextUint(state);
        uint256 range = uint256(int256(max - min));
        uint256 scaled = (uint256(rnd) * range) >> 64;
        return (state, min + int256(scaled));
    }

    function randSigned(uint64 state, int256 magnitude) internal pure returns (uint64, int256) {
        if (magnitude <= 0) {
            return (state, 0);
        }
        return randFixed(state, -magnitude, magnitude);
    }

    function clampInt(int256 value, int256 min, int256 max) internal pure returns (int256) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    function minInt(int256 a, int256 b) internal pure returns (int256) {
        return a < b ? a : b;
    }

    function maxInt(int256 a, int256 b) internal pure returns (int256) {
        return a > b ? a : b;
    }

    function absInt(int256 value) internal pure returns (uint256) {
        return uint256(value < 0 ? -value : value);
    }

    function mulDivSigned(int256 a, int256 b, int256 denom) internal pure returns (int256) {
        if (denom == 0) {
            return 0;
        }
        return (a * b) / denom;
    }

    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) {
            return 0;
        }
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
}
