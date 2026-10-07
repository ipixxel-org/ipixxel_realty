import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { LocalUploadController } from './local-upload.controller';
import { PrivateFilesController } from './private-files.controller';

// Shared object-storage kernel. Global, same as PrismaModule — import it
// once, inject StorageService anywhere.
@Global()
@Module({
  controllers: [LocalUploadController, PrivateFilesController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
