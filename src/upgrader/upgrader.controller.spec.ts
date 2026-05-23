/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { UpgraderController } from './upgrader.controller';
import { UpgraderService } from './upgrader.service';

describe('UpgraderController', () => {
  let controller: UpgraderController;
  let service: UpgraderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UpgraderController],
      providers: [
        {
          provide: UpgraderService,
          useValue: {
            listOptions: jest.fn(),
            createAttempt: jest.fn(),
            listHistory: jest.fn(),
            listDrops: jest.fn(),
            listTopDrop: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UpgraderController>(UpgraderController);
    service = module.get<UpgraderService>(UpgraderService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('uses authenticated user id for listOptions and delegates to service', async () => {
    const req = { user: { id: 123 } } as unknown as Request;
    const query = { inventoryItemId: 10, chance: 50 as const };
    const response = {
      sourceValueRub: '900.00',
      displayedChancePercent: '50.0000',
      targetValueRub: '1800.00',
      items: [],
    };
    (service.listOptions as jest.Mock).mockResolvedValue(response);

    await expect(controller.listOptions(req, query)).resolves.toEqual(response);
    expect(service.listOptions).toHaveBeenCalledWith(123, query);
  });

  it('uses authenticated user id for createAttempt and delegates to service', async () => {
    const req = { user: { id: 123 } } as unknown as Request;
    const dto = { inventoryItemId: 10, targetSkinId: 20, chance: 50 as const };
    const response = {
      result: 'win',
      displayedChancePercent: '50.0000',
      targetReceivedValueRub: '1800.00',
      sourceItem: { id: 10 },
      wonItem: { id: 500 },
      targetSkin: { id: 20 },
      attempt: { id: 1, result: 'win', createdAt: '2026-05-17T10:00:00Z' },
    };
    (service.createAttempt as jest.Mock).mockResolvedValue(response);

    await expect(controller.createAttempt(req, dto)).resolves.toEqual(response);
    expect(service.createAttempt).toHaveBeenCalledWith(123, dto);
  });

  it('uses authenticated user id for listHistory and delegates to service', async () => {
    const req = { user: { id: 123 } } as unknown as Request;
    const query = { page: 2, limit: 10 };
    const response = {
      items: [],
      pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
    };
    (service.listHistory as jest.Mock).mockResolvedValue(response);

    await expect(controller.listHistory(req, query)).resolves.toEqual(response);
    expect(service.listHistory).toHaveBeenCalledWith(123, query);
  });

  it('listDrops delegates to service without requiring req.user', async () => {
    const query = { limit: 16 };
    const response = { items: [] };
    (service.listDrops as jest.Mock).mockResolvedValue(response);

    await expect(controller.listDrops(query)).resolves.toEqual(response);
    expect(service.listDrops).toHaveBeenCalledWith(query);
  });

  it('listDrops works with empty query (default limit applied in service)', async () => {
    const response = { items: [] };
    (service.listDrops as jest.Mock).mockResolvedValue(response);

    await expect(controller.listDrops({})).resolves.toEqual(response);
    expect(service.listDrops).toHaveBeenCalledWith({});
  });

  it('uses authenticated user id for listTopDrop and delegates to service', async () => {
    const req = { user: { id: 123 } } as unknown as Request;
    const response = {
      topDrop: {
        id: 99,
        createdAt: '2026-05-17T10:00:00Z',
        priceRub: '1800.00',
        wonItem: { id: 500, status: 'sold', skin: { id: 20 } },
      },
    };
    (service.listTopDrop as jest.Mock).mockResolvedValue(response);

    await expect(controller.listTopDrop(req)).resolves.toEqual(response);
    expect(service.listTopDrop).toHaveBeenCalledWith(123);
  });

  it('listTopDrop returns null when service reports no winning attempts', async () => {
    const req = { user: { id: 123 } } as unknown as Request;
    (service.listTopDrop as jest.Mock).mockResolvedValue({ topDrop: null });

    await expect(controller.listTopDrop(req)).resolves.toEqual({
      topDrop: null,
    });
    expect(service.listTopDrop).toHaveBeenCalledWith(123);
  });
});
