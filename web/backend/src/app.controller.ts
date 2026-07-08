import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const targetDir = path.resolve(process.cwd(), '../../BigImageUpload');
          // Ensure strictly 1 image in directory at all times by deleting existing files
          if (fs.existsSync(targetDir)) {
            for (const item of fs.readdirSync(targetDir)) {
              try { fs.unlinkSync(path.join(targetDir, item)); } catch (e) { }
            }
          } else {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          cb(null, targetDir);
        },
        filename: (req, file, cb) => {
          // Keep clean original filename in BigImageUpload
          cb(null, file.originalname);
        },
      }),
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Auto-trigger pipeline after saving file to disk
    const imagePath = path.resolve(file.path);
    this.appService.runPipeline(imagePath);

    return {
      success: true,
      message: 'Upload successful, pipeline started',
    };
  }

  @Delete('upload')
  clearImages() {
    const targetDir = path.resolve(process.cwd(), '../../BigImageUpload');
    let deletedCount = 0;
    if (fs.existsSync(targetDir)) {
      for (const item of fs.readdirSync(targetDir)) {
        try { fs.unlinkSync(path.join(targetDir, item)); deletedCount++; } catch (e) { }
      }
    }
    return { success: true, message: 'Image removed' };
  }

  @Post('run-pipeline')
  runPipeline() {
    const targetDir = path.resolve(process.cwd(), '../../BigImageUpload');
    if (!fs.existsSync(targetDir)) {
      throw new BadRequestException('No image uploaded');
    }

    const files = fs.readdirSync(targetDir).filter(f => /\.(tif|tiff|geotiff)$/i.test(f));
    if (files.length === 0) {
      throw new BadRequestException('No image found');
    }

    const imagePath = path.join(targetDir, files[0]);
    return this.appService.runPipeline(imagePath);
  }

  @Get('pipeline-status')
  getPipelineStatus() {
    return {
      running: this.appService.isPipelineRunning(),
    };
  }

  @Get('query-box')
  async getPolygonsInBox(
    @Query('minLng') minLngStr: string,
    @Query('minLat') minLatStr: string,
    @Query('maxLng') maxLngStr: string,
    @Query('maxLat') maxLatStr: string,
  ) {
    const minLng = parseFloat(minLngStr);
    const minLat = parseFloat(minLatStr);
    const maxLng = parseFloat(maxLngStr);
    const maxLat = parseFloat(maxLatStr);

    if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
      throw new BadRequestException('Invalid bounding box coordinates. Expected valid floating point numbers for minLng, minLat, maxLng, maxLat.');
    }

    return this.appService.getPolygonsInBox(minLng, minLat, maxLng, maxLat);
  }

  @Get('telemetry')
  getTelemetry() {
    return this.appService.getTelemetry();
  }
}
