#pragma once

#include "../common/image_info.h"
#include "../common/tile_data.h"
#include "../common/thread_safe_queue.h"

#include <string>

namespace TileEngine {

    class Tiler {
    public:
        Tiler(int overlap_percent, int num_workers);
        ~Tiler() = default;

        void TilingProcess(const std::string& file_path, Common::ImageInfo imgInfo, Common::ThreadSafeQueue<Common::TileData>* queue);

    private:
        int overlap_percent;
        int num_workers;

        void TilingRange(const std::string& file_path, Common::ImageInfo imgInfo, int startRow, int endRow, int overlap_px, Common::ThreadSafeQueue<Common::TileData>* queue);
    };

}