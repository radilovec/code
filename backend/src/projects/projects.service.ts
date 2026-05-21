import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateProjectDto) {
    this.logger.log(`Creating project for user ${userId}`);
    return this.prisma.project.create({
      data: {
        ownerId: userId,
        name: dto.name,
        description: dto.description,
        dslText: dto.dslText ?? '',
      },
    });
  }

  async findAllByUser(userId: string) {
    return this.prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { publishedSnapshots: true } },
      },
    });
  }

  async findOne(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { layouts: true },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return project;
  }

  async update(id: string, userId: string, dto: UpdateProjectDto) {
    await this.assertOwner(id, userId);

    return this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.dslText !== undefined && { dslText: dto.dslText }),
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.assertOwner(id, userId);

    await this.prisma.project.delete({ where: { id } });
  }

  private async assertOwner(id: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
