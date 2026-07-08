add_library(vdt_storage postgis_writer.cpp postgis_writer.h)
target_include_directories(vdt_storage PUBLIC ${CMAKE_SOURCE_DIR})
target_link_libraries(vdt_storage PRIVATE GDAL::GDAL ${OpenCV_LIBS})
