import { Module } from '@nestjs/common';
import { GghhService } from './gghh.service';

@Module({
  providers: [GghhService],
  exports: [GghhService],
})
export class GghhModule {}