import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from '../types/jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);
    (request as Request & { user: JwtPayload }).user = verifyAccessToken(
      this.jwtService,
      token,
    );
    return true;
  }
}

/** Verifies an access JWT (also used by the Team Chat socket handshake). */
export function verifyAccessToken(
  jwtService: JwtService,
  token: string,
): JwtPayload {
  try {
    return jwtService.verify<JwtPayload>(token, {
      secret: process.env.JWT_SECRET,
    });
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }
}
