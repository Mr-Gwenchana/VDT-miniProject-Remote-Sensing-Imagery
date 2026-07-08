add_library(vdt_tiling STATIC tile_engine.cpp tile_engine.h)

target_include_directories(vdt_tiling PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(vdt_tiling PUBLIC GDAL::GDAL)
