import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const projects = await this.prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        dslText: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { publishedSnapshots: true } },
      },
    });

    let buildMiniGraph: ((dsl: string) => {
      nodes: { id: string; type: string }[];
      edges: { from: string; to: string }[];
    } | null) | null = null;

    try {
      const shared = await import('@interactive-video/shared');
      buildMiniGraph = (dsl: string) => {
        if (!dsl.trim()) return null;
        try {
          const tokens = shared.tokenize(dsl);
          const { program } = shared.parse(tokens);
          const scenario = shared.buildScenario(program);
          const nodes: { id: string; type: string }[] = [];
          const edges: { from: string; to: string }[] = [];
          for (const s of scenario.scenes.values()) {
            let type: string;
            if (s.type === 'ending') type = 'ending';
            else if (s.video) type = 'scene';
            else if (s.choices.some((c: { condition?: unknown }) => c.condition !== undefined)) type = 'condition';
            else type = 'choice';
            nodes.push({ id: s.id, type });
            for (const c of s.choices) {
              if (scenario.scenes.has(c.targetSceneId)) {
                edges.push({ from: s.id, to: c.targetSceneId });
              }
            }
            if (s.autoTransitionTo && scenario.scenes.has(s.autoTransitionTo)) {
              edges.push({ from: s.id, to: s.autoTransitionTo });
            }
          }
          return { nodes, edges };
        } catch { return null; }
      };
    } catch {
      this.logger.warn('Could not load shared pipeline for mini graph');
    }

    return projects.map(({ dslText, ...rest }) => ({
      ...rest,
      miniGraph: buildMiniGraph ? buildMiniGraph(dslText) : null,
    }));
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

    // Fetch latest published snapshot's publicId
    const latestSnapshot = await this.prisma.publishedSnapshot.findFirst({
      where: { projectId: id },
      orderBy: { version: 'desc' },
      select: { publicId: true, version: true },
    });

    return {
      ...project,
      latestPublicId: latestSnapshot?.publicId ?? null,
      latestVersion: latestSnapshot?.version ?? null,
    };
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

  async saveLayout(
    id: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.assertOwner(id, userId);

    const jsonData = data as Prisma.InputJsonValue;
    const existing = await this.prisma.layout.findFirst({
      where: { projectId: id },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.layout.update({
        where: { id: existing.id },
        data: { data: jsonData },
      });
    } else {
      await this.prisma.layout.create({
        data: { projectId: id, data: jsonData },
      });
    }
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
