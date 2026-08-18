import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';

@Injectable()
export class EventBusService extends EventEmitter implements OnModuleDestroy {
  onModuleDestroy() {
    this.removeAllListeners();
  }
}