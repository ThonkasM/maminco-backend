import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { WsAuthService } from './ws-auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { resolveJwtExpiresIn } from '../config/jwt.config';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: resolveJwtExpiresIn(config.get<string>('JWT_EXPIRES_IN')),
        },
      }),
    }),
    PrismaModule,
  ],
  providers: [AuthService, JwtStrategy, WsAuthService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, WsAuthService],
})
export class AuthModule {}
