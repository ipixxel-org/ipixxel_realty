import {
  BadRequestException,
  Controller,
  ForbiddenException,
  NotFoundException,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as path from 'path';
import {
  isSafeStorageKey,
  requestContentType,
  streamUploadToFile,
  verifyLocalUrl,
} from './private-local.util';
import { StorageService } from './storage.service';

/**
 * Local-dev stand-in for an R2 presigned PUT (only when R2 isn't configured).
 * The URL comes from StorageService.createUploadUrl after its own auth and
 * per-kind type/size checks, and is HMAC-signed over the exact key, content
 * type, size and expiry: changing any of them, or using it after it expires,
 * is rejected. The body is size-checked while streaming, never trusting
 * Content-Length.
 */
@Controller('uploads')
export class LocalUploadController {
  constructor(private readonly storage: StorageService) {}

  @Put('local-put')
  handleLocalPut(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('ct') ct: string,
    @Query('size') size: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // With R2 configured every upload goes straight to the bucket.
    if (this.storage.isConfigured()) throw new NotFoundException();

    if (!key || !isSafeStorageKey(key)) {
      throw new BadRequestException('Invalid key');
    }
    const expiry = Number(exp);
    const maxBytes = Number(size);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new BadRequestException('Invalid size');
    }
    if (
      !verifyLocalUrl(['public-put', key, expiry, ct, maxBytes], expiry, sig)
    ) {
      throw new ForbiddenException('Upload link expired or invalid');
    }
    if (requestContentType(req) !== ct) {
      throw new BadRequestException(`Content-Type must be ${ct}`);
    }

    const root = path.join(process.cwd(), 'uploads');
    streamUploadToFile(req, res, path.join(root, ...key.split('/')), maxBytes);
  }
}
