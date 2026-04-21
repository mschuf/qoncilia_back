import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as dotenv from "dotenv";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import { json } from "express";
import { Request, Response, NextFunction } from "express";

async function bootstrap() {
  // Cargar variables de entorno
  dotenv.config();

  const app = await NestFactory.create(AppModule);

  // Middleware CORS manual para asegurar que las cabeceras se envíen
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(
      `CORS middleware: ${req.method} ${req.path} from ${req.headers.origin || "no origin"}`,
    );

    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,Accept,x-schema,x-user,Origin,X-Requested-With",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Manejar preflight requests
    if (req.method === "OPTIONS") {
      console.log(`CORS preflight handled for ${req.path}`);
      res.sendStatus(200);
      return;
    }

    next();
  });

  // Configurar límite de tamaño del body JSON para manejar imágenes grandes
  app.use(json({ limit: "50mb" }));

  // Configurar validación global con mensajes detallados
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      exceptionFactory: (errors) => {
        if (errors.length === 0) return null;

        // Obtener el primer mensaje de error disponible
        const firstError = errors[0];
        const firstConstraint = firstError.constraints
          ? Object.values(firstError.constraints)[0]
          : "Validation failed";

        return {
          statusCode: 400,
          message: firstConstraint,
        };
      },
    }),
  );

  // Habilitar CORS para todas las IPs/orígenes
  app.enableCors({
    origin: true, // Permitir todas las origines para debugging
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "x-schema",
      "x-user",
      "Origin",
      "X-Requested-With",
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle("Kipit API")
    .setDescription("API para integración con SAP Business One")
    .setVersion("1.0")
    .addTag("auth")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  const port = process.env.PORT ?? 3003;
  console.log(`Aplicación ejecutándose en el puerto: ${port}`);

  await app.listen(port);
}
bootstrap();
