#ifndef TILE_DATA_H
#define TILE_DATA_H

#include <vector>
#include <string>
#include <cstdint>

namespace Common {

    struct TileData {
        // The position of tile in original image
        int rowIdx;
        int colIdx;
        int xOff;
        int yOff;

        // The size of tile (after padding, always = tileSize)
        int width;
        int height;
        int bandCount;

        // The actual data size before padding (for edge tiles)
        int originalWidth;
        int originalHeight;

        // The pixel data of tile (BSQ format: R.. G.. B..)
        std::vector<uint8_t> pixels;

        // The geographical information of tile
        double geoTransform[6];
        std::string projection;
    };

}

#endif // TILE_DATA_H
