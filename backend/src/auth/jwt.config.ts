import { ConfigService } from '@nestjs/config';
import { JwtModuleAsyncOptions } from '@nestjs/jwt';

export const jwtModuleAsyncOptions: JwtModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    signOptions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expiresIn: config.get<string>('JWT_ACCESS_EXPIRES', '15m') as any,
    },
  }),
};
