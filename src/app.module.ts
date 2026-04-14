import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { CompanyBank } from "./companies/entities/company-bank.entity";
import { Company } from "./companies/entities/company.entity";
import { CompaniesModule } from "./companies/companies.module";
import { User } from "./users/entities/user.entity";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        host: configService.get<string>("DB_HOST", "localhost"),
        port: Number(configService.get<string>("DB_PORT", "5432")),
        username: configService.get<string>("DB_USER", "postgres"),
        password: configService.get<string>("DB_PASSWORD", "postgres"),
        database: configService.get<string>("DB_NAME", "QONCILIA_BACK"),
        entities: [User, Company, CompanyBank],
        synchronize: false,
        logging: false
      })
    }),
    UsersModule,
    AuthModule,
    CompaniesModule
  ]
})
export class AppModule {}
