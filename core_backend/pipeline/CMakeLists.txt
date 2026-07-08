add_library(vdt_pipeline
    large_geotiff_pipeline.cpp
)

target_include_directories(vdt_pipeline PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(vdt_pipeline PUBLIC vdt_tiling vdt_inference vdt_storage GDAL::GDAL)
