import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { isSafePrivateKey, verifyLocalPrivate } from './private-local.util';
import { StorageService } from './storage.service';

/**
 * Local-dev-only PUT/GET for private files (Team Chat attachments) when R2
 * isn't configured. Auth is the signed URL itself (StorageService issues it
 * only after its own membership checks); with R2 configured these routes
 * refuse, since files then live in the private bucket.
 */
@Controller('files/private')
export class PrivateFilesController {
  constructor(private readonly storage: StorageService) {}

  @Put('put')
  put(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('ct') ct: string,
    @Query('size') size: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const target = this.authorize(
      ['put', key, Number(exp), ct, Number(size)],
      key,
      Number(exp),
      sig,
    );
    const limit = Number(size);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const out = fs.createWriteStream(target);
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > limit) {
        req.destroy();
        out.destroy();
        fs.rm(target, { force: true }, () => undefined);
        if (!res.headersSent) res.status(413).json({ error: 'File too large' });
      }
    });
    req.pipe(out);
    out.on('finish', () => {
      if (!res.headersSent) res.status(200).send('OK');
    });
    out.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
  }

  @Get('get')
  get(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('ct') ct: string,
    @Query('cd') cd: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const target = this.authorize(
      ['get', key, Number(exp), ct, cd],
      key,
      Number(exp),
      sig,
    );
    if (!fs.existsSync(target)) throw new NotFoundException('File not found');
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', cd);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(target).pipe(res);
  }

  private authorize(
    parts: Array<string | number>,
    key: string,
    exp: number,
    sig: string,
  ): string {
    if (this.storage.isConfigured()) {
      throw new NotFoundException();
    }
    if (!isSafePrivateKey(key)) throw new BadRequestException('Invalid key');
    if (!verifyLocalPrivate(parts, exp, sig)) {
      throw new ForbiddenException('Link expired or invalid');
    }
    return this.storage.localPrivatePath(key);
  }
}
