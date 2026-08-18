import { Controller, Get, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { EventBusService } from '../events/event-bus.service';

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly events: EventBusService,
    private readonly jwt: JwtService,
  ) {}

  @Get('boletas')
  async stream(@Req() req: Request, @Res() res: Response) {
    const token =
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      String(req.query.token || '');
    if (!token) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    try {
      this.jwt.verify(token);
    } catch {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const emitir = (payload: unknown) => {
      res.write(`event: boleta.firmada\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    this.events.on('boleta.firmada', emitir);

    const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.events.off('boleta.firmada', emitir);
    });
  }
}