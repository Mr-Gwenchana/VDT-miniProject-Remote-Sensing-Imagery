import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS so frontend (port 3000) can communicate with backend (port 3001)
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const PORT = process.env.PORT || 3001;
  await app.listen(PORT);
  console.log(`🚀 VDT GeoAI Backend running on http://localhost:${PORT}`);
}
bootstrap();
