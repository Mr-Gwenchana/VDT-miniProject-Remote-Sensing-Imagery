#pragma once

#include <string>

namespace Common {

struct ImageInfo {
    int xSize;                             
    int ySize;                              
    int bandCount;
    int tileSize;
    double geoTransform[6];     
    std::string projection;                
};

}
