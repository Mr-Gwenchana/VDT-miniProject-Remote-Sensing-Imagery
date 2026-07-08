#include "pipeline/large_geotiff_pipeline.h"

int main(int argc, char* argv[]) {
    Pipeline::LargeGeotiffPipeline pipeline;

    std::string imagePathArg = (argc >= 2) ? argv[1] : "";
    pipeline.LoadConfig(".env", imagePathArg);

    return pipeline.Run();
}
