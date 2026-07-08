import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess, exec } from 'child_process';
import * as os from 'os';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);
  private pool: Pool;
  private tableName: string;
  private pipelineProcess: ChildProcess | null = null;

  private latestTelemetry = {
    cpuPercent: 0,
    ramUsedMB: 0,
    ramTotalMB: 0,
    gpuPercent: 0,
    gpuVramUsedMB: 0,
    gpuVramTotalMB: 0,
    pipelineRunning: false,
    timestamp: Date.now(),
  };
  private lastCpuTimes = { idle: 0, total: 0 };

  onModuleInit() {
    // 1. Load root project .env
    const envCandidate1 = path.resolve(__dirname, '../../../.env');
    const envCandidate2 = path.resolve(process.cwd(), '../../.env');
    const finalEnvPath = fs.existsSync(envCandidate1) ? envCandidate1 : (fs.existsSync(envCandidate2) ? envCandidate2 : null);

    if (finalEnvPath) {
      dotenv.config({ path: finalEnvPath });
      this.logger.log(`Loaded environment from ${finalEnvPath}`);
    } else {
      dotenv.config();
      this.logger.warn(`Could not find root .env file, relying on system env or defaults.`);
    }

    // 2. Ensure BigImageUpload directory exists
    const uploadDir = path.resolve(process.cwd(), '../../BigImageUpload');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      this.logger.log(`Created BigImageUpload directory at ${uploadDir}`);
    }

    // 3. Parse GDAL DB connection string
    const dbConnStr = process.env.DB_CONN || 'PG:dbname=gis_db host=localhost port=5432 user=postgres';
    const config = this.parseGDALConnString(dbConnStr);

    this.pool = new Pool(config);
    this.tableName = process.env.DB_TABLE || 'buildings_polygon';

    this.logger.log(`Initialized PostgreSQL Pool connecting to db '${config.database}' on host '${config.host}'`);
    this.startTelemetryLoop();
  }

  private parseGDALConnString(gdalStr: string): PoolConfig {
    let cleanStr = gdalStr.startsWith('PG:') ? gdalStr.substring(3).trim() : gdalStr;
    const tokens = cleanStr.split(/\s+/);

    const config: any = {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: '',
      database: 'postgres',
    };

    for (const token of tokens) {
      const [key, val] = token.split('=');
      if (!key || val === undefined) continue;

      const k = key.toLowerCase();
      if (k === 'dbname') config.database = val;
      else if (k === 'host') config.host = val;
      else if (k === 'port') config.port = parseInt(val, 10);
      else if (k === 'user') config.user = val;
      else if (k === 'password') config.password = val;
    }

    return config;
  }

  // --- Pipeline execution ---

  isPipelineRunning(): boolean {
    return this.pipelineProcess !== null;
  }

  runPipeline(imagePath: string): { success: boolean; message: string } {
    if (this.pipelineProcess) {
      return { success: false, message: 'Pipeline is already running' };
    }

    const projectRoot = path.resolve(process.cwd(), '../..');
    const exeName = process.platform === 'win32' ? 'vdt_app.exe' : 'vdt_app';
    const exePath = path.join(projectRoot, 'core_backend', 'build', exeName);
    const buildDir = path.join(projectRoot, 'core_backend', 'build');

    if (!fs.existsSync(exePath)) {
      this.logger.error(`Pipeline executable not found at ${exePath}`);
      return { success: false, message: 'Pipeline executable not found' };
    }

    this.logger.log(`Starting pipeline: ${exePath} "${imagePath}"`);

    const child = spawn(exePath, [imagePath], {
      cwd: buildDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.pipelineProcess = child;

    child.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        this.logger.log(`[Pipeline] ${line}`);
      }
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        this.logger.warn(`[Pipeline] ${line}`);
      }
    });

    child.on('close', (code) => {
      this.pipelineProcess = null;
      if (code === 0) {
        this.logger.log('[Pipeline] Completed successfully');
      } else {
        this.logger.error(`[Pipeline] Exited with code ${code}`);
      }
    });

    child.on('error', (err) => {
      this.pipelineProcess = null;
      this.logger.error(`[Pipeline] Failed to start: ${err.message}`);
    });

    return { success: true, message: 'Pipeline started' };
  }

  // --- Spatial query ---

  async getPolygonsInBox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
    let activeTable = this.tableName;
    try {
      const regCheck = await this.pool.query(
        `SELECT to_regclass($1) AS tbl_exists`,
        [`public.${this.tableName}_final`]
      );
      if (regCheck.rows[0]?.tbl_exists) {
        activeTable = `${this.tableName}_final`;
      } else {
        const regCheckMerged = await this.pool.query(
          `SELECT to_regclass($1) AS tbl_exists`,
          [`public.${this.tableName}_merged`]
        );
        if (regCheckMerged.rows[0]?.tbl_exists) {
          activeTable = `${this.tableName}_merged`;
        }
      }
    } catch (e) {
      // ignore check error, use default table
    }

    this.logger.log(`Querying bounding box [${minLng}, ${minLat}, ${maxLng}, ${maxLat}] on table '${activeTable}'`);

    const sql = `
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(
              CASE 
                WHEN ST_SRID(wkb_geometry) = 4326 THEN wkb_geometry
                WHEN ST_SRID(wkb_geometry) = 0 THEN ST_Transform(ST_SetSRID(wkb_geometry, 3857), 4326)
                ELSE ST_Transform(wkb_geometry, 4326)
              END
            )::json,
            'properties', to_jsonb(t) - 'wkb_geometry'
          )
        ), '[]'::json)
      ) AS geojson
      FROM (
        SELECT * FROM "${activeTable}"
        WHERE ST_Within(
          CASE 
            WHEN ST_SRID(wkb_geometry) = 4326 THEN wkb_geometry
            WHEN ST_SRID(wkb_geometry) = 0 THEN ST_Transform(ST_SetSRID(wkb_geometry, 3857), 4326)
            ELSE ST_Transform(wkb_geometry, 4326)
          END,
          ST_MakeEnvelope($1, $2, $3, $4, 4326)
        )
        LIMIT 8000
      ) t;
    `;

    try {
      const res = await this.pool.query(sql, [minLng, minLat, maxLng, maxLat]);
      const featureCollection = res.rows[0]?.geojson || { type: 'FeatureCollection', features: [] };
      this.logger.log(`Fetched ${featureCollection.features.length} polygons in bounding box.`);
      return featureCollection;
    } catch (err) {
      this.logger.error(`Database query failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  private startTelemetryLoop() {
    const cpus = os.cpus();
    let idle = 0; let total = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += (cpu.times as any)[type];
      }
      idle += cpu.times.idle;
    }
    this.lastCpuTimes = { idle, total };

    let tickCount = 0;
    let cachedGpuPercent = 0;
    let cachedGpuVramUsedMB = 0;
    let cachedGpuVramTotalMB = 0;

    setInterval(() => {
      tickCount++;
      const cpusNow = os.cpus();
      let idleNow = 0; let totalNow = 0;
      for (const cpu of cpusNow) {
        for (const type in cpu.times) {
          totalNow += (cpu.times as any)[type];
        }
        idleNow += cpu.times.idle;
      }
      const idleDelta = idleNow - this.lastCpuTimes.idle;
      const totalDelta = totalNow - this.lastCpuTimes.total;
      const cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
      this.lastCpuTimes = { idle: idleNow, total: totalNow };

      const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
      const freeMemMB = Math.round(os.freemem() / (1024 * 1024));
      const usedMemMB = totalMemMB - freeMemMB;

      const updateTelemetry = () => {
        this.latestTelemetry = {
          cpuPercent,
          ramUsedMB: usedMemMB,
          ramTotalMB: totalMemMB,
          gpuPercent: cachedGpuPercent,
          gpuVramUsedMB: cachedGpuVramUsedMB,
          gpuVramTotalMB: cachedGpuVramTotalMB,
          pipelineRunning: this.isPipelineRunning(),
          timestamp: Date.now(),
        };
      };

      if (tickCount === 1 || tickCount % 7 === 0) {
        exec('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits', (err, stdout) => {
          if (!err && stdout) {
            const parts = stdout.trim().split(',').map(s => parseInt(s.trim(), 10));
            if (parts.length >= 3 && !isNaN(parts[0])) {
              cachedGpuPercent = parts[0];
              cachedGpuVramUsedMB = parts[1];
              cachedGpuVramTotalMB = parts[2];
            }
          }
          updateTelemetry();
        });
      } else {
        updateTelemetry();
      }
    }, 1000);
  }

  getTelemetry() {
    return this.latestTelemetry;
  }
}
