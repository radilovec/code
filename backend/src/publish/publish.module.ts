import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';

@Module({
  imports: [PrismaModule],
  controllers: [PublishController],
  providers: [PublishService],
  exports: [PublishService],
})
export class PublishModule {}
