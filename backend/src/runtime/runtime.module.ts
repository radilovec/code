import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RuntimeController } from './runtime.controller';
import { RuntimeService } from './runtime.service';

@Module({
  imports: [PrismaModule],
  controllers: [RuntimeController],
  providers: [RuntimeService],
  exports: [RuntimeService],
})
export class RuntimeModule {}
