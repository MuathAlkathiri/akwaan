import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import {
  CategoryMultipartBodyDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/create-category.dto';
import { Category } from './schemas/category.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { categoryExample, ids } from '../../common/swagger/examples';
import { CategoryResponseMapper } from './mappers/category-response.mapper';
import {
  CategoryDetailResponseDto,
  CategoryListResponseDto,
  CategoryMutationResponseDto,
} from './dto/category-response.dto';
import { parseMultipartJsonBody } from '../../common/pipes/multipart-json-body.parser';

interface UploadedBannerFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const categoryBannerUploadInterceptor = FileInterceptor('banner', {
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_request, file, callback) => {
    if (!/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) {
      callback(
        new BadRequestException(
          'Banner must be a jpg, jpeg, png, or webp image',
        ),
        false,
      );
      return;
    }

    callback(null, true);
  },
});

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(categoryBannerUploadInterceptor)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'categoriesCreate',
    summary: 'Create a new category',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    type: CategoryMultipartBodyDto,
    examples: {
      multipart: {
        summary: 'Multipart category with optional banner',
        value: {
          category: JSON.stringify({
            name: 'Science',
            slug: 'science',
            description: 'Science and discovery questions',
            catalogId: ids.catalog,
            isActive: true,
          }),
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Category created successfully',
    type: CategoryMutationResponseDto,
    schema: {
      example: {
        statusCode: 201,
        message: 'Category created successfully',
        data: categoryExample,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() banner?: UploadedBannerFile,
  ): Promise<{
    statusCode: number;
    message: string;
    data: Category;
  }> {
    const createCategoryDto = parseMultipartJsonBody(
      body,
      'category',
      CreateCategoryDto,
    );
    const category = await this.categoriesService.create(
      createCategoryDto,
      banner,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Category created successfully',
      data: CategoryResponseMapper.toResponse(category) as unknown as Category,
    };
  }

  @Get()
  @ApiOperation({
    operationId: 'categoriesList',
    summary: 'Get all categories',
  })
  @ApiQuery({
    name: 'catalogId',
    required: false,
    description: 'Filter categories by catalog ID',
    example: ids.catalog,
  })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
    type: CategoryListResponseDto,
    schema: {
      example: {
        statusCode: 200,
        data: [categoryExample],
      },
    },
  })
  async findAll(@Query('catalogId') catalogId?: string): Promise<{
    statusCode: number;
    data: Category[];
  }> {
    const categories = await this.categoriesService.findAll({ catalogId });
    return {
      statusCode: HttpStatus.OK,
      data: CategoryResponseMapper.toResponseList(
        categories,
      ) as unknown as Category[],
    };
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'categoriesGetById',
    summary: 'Get a specific category by ID',
  })
  @ApiParam({
    name: 'id',
    example: ids.category,
    description: 'Category MongoDB ObjectId',
  })
  @ApiResponse({
    status: 200,
    description: 'Category retrieved successfully',
    type: CategoryDetailResponseDto,
    schema: {
      example: {
        statusCode: 200,
        data: categoryExample,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Category not found',
    schema: {
      example: {
        statusCode: 404,
        message: `Category with ID "${ids.category}" not found`,
        error: 'Not Found',
      },
    },
  })
  async findById(@Param('id') id: string): Promise<{
    statusCode: number;
    data: Category;
  }> {
    const category = await this.categoriesService.findById(id);
    return {
      statusCode: HttpStatus.OK,
      data: CategoryResponseMapper.toResponse(category) as unknown as Category,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(categoryBannerUploadInterceptor)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'categoriesUpdate',
    summary: 'Update a category',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiParam({
    name: 'id',
    example: ids.category,
    description: 'Category MongoDB ObjectId',
  })
  @ApiBody({
    type: CategoryMultipartBodyDto,
    examples: {
      multipart: {
        summary: 'Multipart update with optional replacement banner',
        value: {
          category: JSON.stringify({
            name: 'Science Updated',
            description: 'Updated science category description',
            catalogId: ids.catalog,
            isActive: true,
          }),
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Category updated successfully',
    type: CategoryMutationResponseDto,
    schema: {
      example: {
        statusCode: 200,
        message: 'Category updated successfully',
        data: {
          ...categoryExample,
          name: 'Science Updated',
          description: 'Updated science category description',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() banner?: UploadedBannerFile,
  ): Promise<{
    statusCode: number;
    message: string;
    data: Category;
  }> {
    const updateCategoryDto = parseMultipartJsonBody(
      body,
      'category',
      UpdateCategoryDto,
    );
    const category = await this.categoriesService.update(
      id,
      updateCategoryDto,
      banner,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Category updated successfully',
      data: CategoryResponseMapper.toResponse(category) as unknown as Category,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'categoriesDelete',
    summary: 'Delete a category',
  })
  @ApiParam({
    name: 'id',
    example: ids.category,
    description: 'Category MongoDB ObjectId',
  })
  @ApiResponse({ status: 204, description: 'Category deleted successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.categoriesService.delete(id);
  }
}
