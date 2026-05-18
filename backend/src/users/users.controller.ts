import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAccessGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.usersService.getProfile(user.userId);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersService.changePassword(user.userId, dto);
  }
}
