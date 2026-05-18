import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { TokenPair } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

class LogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<TokenPair> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }
}
