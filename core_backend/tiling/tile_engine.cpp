#include "gdal_priv.h"
#include <iostream>
#include <vector>
#include <cmath>
#include <algorithm>
#include <thread>
#include <string>
#include "tile_engine.h"
#include "../common/image_info.h"

namespace TileEngine {

    Tiler::Tiler(int input_overlap_percent, int input_num_workers){
        overlap_percent = input_overlap_percent;
        num_workers = input_num_workers;
    }

    void Tiler::TilingProcess(const std::string& file_path, Common::ImageInfo imgInfo, Common::ThreadSafeQueue<Common::TileData>* queue) {
        int overlap_px = imgInfo.tileSize * overlap_percent / 100;
        int step = imgInfo.tileSize - overlap_px;
        int totalRows = (int)std::ceil((double)(imgInfo.ySize - overlap_px) / step);

        int rows_per_thread = totalRows / num_workers;
        int remain = totalRows % num_workers;

        std::vector<std::thread> tiling_threads;
        int currentRow = 0;
        for (int i = 0; i < num_workers; i++) {
            int rStart = currentRow;
            int rEnd = rStart + rows_per_thread + (i < remain ? 1 : 0);
            
            tiling_threads.push_back(std::thread(&Tiler::TilingRange, this, file_path, imgInfo, rStart, rEnd, overlap_px, queue));
            currentRow = rEnd;
        }

        for (auto& t : tiling_threads) {
            if (t.joinable()) t.join();
        }
    }

    void Tiler::TilingRange(const std::string& file_path, Common::ImageInfo imgInfo, int startRow, int endRow, int overlap_px, Common::ThreadSafeQueue<Common::TileData>* queue) {

        GDALDataset *dataset = (GDALDataset *) GDALOpen(file_path.c_str(), GA_ReadOnly);
        if (dataset == nullptr) {
            std::cerr << "Can't open file for tiling: " << file_path << std::endl;
            return;
        }

        int tileSize = imgInfo.tileSize;
        int step = tileSize - overlap_px;
        int cols = (int)std::ceil((double)(imgInfo.xSize - overlap_px) / step);

        // Tiling processing
        for (int r = startRow; r < endRow; r++) {
            for (int c = 0; c < cols; c++) {
                int xOff = c * step;
                int yOff = r * step;

                int w = std::min(tileSize, imgInfo.xSize - xOff);
                int h = std::min(tileSize, imgInfo.ySize - yOff);

                std::vector<uint8_t> raw_pic_data(tileSize * tileSize * imgInfo.bandCount, 0);

                if (w == tileSize && h == tileSize) {
                    CPLErr err = dataset->RasterIO(
                        GF_Read,
                        xOff, yOff, w, h,
                        raw_pic_data.data(),
                        w, h,
                        GDT_Byte,
                        imgInfo.bandCount, nullptr,
                        0, 0, 0
                    );
                    if (err != CE_None) {
                        std::cerr << "Tiling error at column " << c << " and row " << r << std::endl;
                        continue;
                    }
                } else {
                    for (int b = 1; b <= imgInfo.bandCount; b++) {
                        GDALRasterBand* band = dataset->GetRasterBand(b);
                        int bandOffset = (b - 1) * tileSize * tileSize;
                        for (int row = 0; row < h; row++) {
                            CPLErr err = band->RasterIO(
                                GF_Read,
                                xOff, yOff + row, w, 1,
                                raw_pic_data.data() + bandOffset + row * tileSize,
                                w, 1,
                                GDT_Byte, 0, 0
                            );
                            if (err != CE_None) {
                                std::cerr << "Tiling error at column " << c << " row " << r << " band " << b << std::endl;
                            }
                        }
                    }
                }

                // std::string tile_path = "./demo_tile/tile_" + std::to_string(r) + "_" + std::to_string(c) + ".tiff";
                // GDALDriver *driver = GetGDALDriverManager()->GetDriverByName("GTiff");
                // GDALDataset *tile_dataset = driver->Create(tile_path.c_str(), tileSize, tileSize, imgInfo.bandCount, GDT_Byte, nullptr);
                // double tile_gt[6];
                // tile_gt[0] = imgInfo.geoTransform[0] + xOff * imgInfo.geoTransform[1] + yOff * imgInfo.geoTransform[2];
                // tile_gt[1] = imgInfo.geoTransform[1];
                // tile_gt[2] = imgInfo.geoTransform[2];
                // tile_gt[3] = imgInfo.geoTransform[3] + xOff * imgInfo.geoTransform[4] + yOff * imgInfo.geoTransform[5];
                // tile_gt[4] = imgInfo.geoTransform[4];
                // tile_gt[5] = imgInfo.geoTransform[5];

                // tile_dataset->SetGeoTransform(tile_gt);
                // if (!imgInfo.projection.empty()) {
                //     tile_dataset->SetProjection(imgInfo.projection.c_str());
                // }

                // CPLErr writeErr = tile_dataset->RasterIO(
                //     GF_Write, 0, 0, tileSize, tileSize,
                //     raw_pic_data.data(), tileSize, tileSize,
                //     GDT_Byte,
                //     imgInfo.bandCount, nullptr,
                //     0, 0, 0
                // );

                // if (writeErr != CE_None) {
                //     std::cerr << "Failed to write tile: " << tile_path << std::endl;
                // }
                // GDALClose(tile_dataset);

                //Pack into TileData struct
                Common::TileData tileData;
                tileData.rowIdx = r;
                tileData.colIdx = c;
                tileData.xOff = xOff;
                tileData.yOff = yOff;
                tileData.width = tileSize;
                tileData.height = tileSize;
                tileData.originalWidth = w;
                tileData.originalHeight = h;
                tileData.bandCount = imgInfo.bandCount;
                tileData.pixels = std::move(raw_pic_data);
                
                tileData.geoTransform[0] = imgInfo.geoTransform[0] + xOff * imgInfo.geoTransform[1] + yOff * imgInfo.geoTransform[2];
                tileData.geoTransform[1] = imgInfo.geoTransform[1];
                tileData.geoTransform[2] = imgInfo.geoTransform[2];
                tileData.geoTransform[3] = imgInfo.geoTransform[3] + xOff * imgInfo.geoTransform[4] + yOff * imgInfo.geoTransform[5];
                tileData.geoTransform[4] = imgInfo.geoTransform[4];
                tileData.geoTransform[5] = imgInfo.geoTransform[5];
                
                tileData.projection = imgInfo.projection;

                if (queue) {
                    queue->push(std::move(tileData));
                }
            }
        }
        GDALClose(dataset);
    }

}