import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, TokenPair } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly jwtRefreshSecret: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.jwtRefreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.refreshExpiresIn = config.get<string>('JWT_REFRESH_EXPIRES', '7d');
  }

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name ?? '',
      },
    });

    return this.createTokenPair(user);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createTokenPair(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Revoke current token (delete it)
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    return this.createTokenPair(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    try {
      await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    } catch (err) {
      // Ignore — token may already be gone
      this.logger.warn(`Logout: token not found or already deleted`);
    }
  }

  private async createTokenPair(user: User): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.jwtRefreshSecret,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expiresIn: this.refreshExpiresIn as any,
      }),
    ]);

    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = this.computeExpiry(this.refreshExpiresIn);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Converts a duration string like '7d', '15m', '3600' (seconds) into
   * an absolute Date for storage in the DB.
   */
  private computeExpiry(duration: string): Date {
    const now = Date.now();
    const match = /^(\d+)([smhd]?)$/.exec(duration);

    if (!match) {
      // Fallback: 7 days
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2] ?? 's';

    const multipliers: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };

    const ms = value * (multipliers[unit] ?? 1_000);
    return new Date(now + ms);
  }
}
