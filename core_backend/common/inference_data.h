#ifndef INFERENCE_DATA_H
#define INFERENCE_DATA_H

#include <vector>
#include <string>
#include <cstdint>

namespace Common {
    struct InferenceData {
        std::vector<uint8_t> mask;
        int width;
        int height;
        double geoTransform[6];
        std::string projection;
    };
}

#endif
