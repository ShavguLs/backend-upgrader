/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryController', () => {
  let controller: InventoryController;
  let service: InventoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: InventoryService,
          useValue: {
            getSkins: jest.fn(),
            getSkin: jest.fn(),
            getInventory: jest.fn(),
            buySkin: jest.fn(),
            sellInventoryItem: jest.fn(),
            withdrawInventoryItem: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InventoryController>(InventoryController);
    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate catalog endpoint to service', async () => {
    const filters = { search: 'ak', page: 1, limit: 10 };
    const response = { items: [{ id: 1 }], pagination: { total: 1 } };
    (service.getSkins as jest.Mock).mockResolvedValue(response);

    await expect(controller.getSkins(filters)).resolves.toEqual(response);
    expect(service.getSkins).toHaveBeenCalledWith(filters);
  });

  it('should use authenticated user id for inventory endpoint', async () => {
    const req = { user: { id: 123 } } as unknown as Request;
    const items = [{ id: 10 }];
    (service.getInventory as jest.Mock).mockResolvedValue(items);

    await expect(controller.getInventory(req)).resolves.toEqual(items);
    expect(service.getInventory).toHaveBeenCalledWith(123);
  });

  it('should use authenticated user id and skin id for buy endpoint', async () => {
    const req = { user: { id: 123 } } as unknown as Request;
    const response = { item: { id: 10 }, wallet: { balance: '500.00' } };
    (service.buySkin as jest.Mock).mockResolvedValue(response);

    await expect(controller.buySkin(req, { skinId: 1 })).resolves.toEqual(
      response,
    );
    expect(service.buySkin).toHaveBeenCalledWith(123, { skinId: 1 });
  });

  it('should use authenticated user id and item id for withdraw endpoint', async () => {
    const req = { user: { id: 123 } } as unknown as Request;
    const response = {
      item: { id: 10, status: 'withdraw_pending' },
      withdrawal: { id: 1, status: 'provider_purchase_pending', provider: 'waxpeer' },
    };
    (service.withdrawInventoryItem as jest.Mock).mockResolvedValue(response);

    await expect(
      controller.withdrawInventoryItem(req, { inventoryItemId: 10 }),
    ).resolves.toEqual(response);
    expect(service.withdrawInventoryItem).toHaveBeenCalledWith(123, {
      inventoryItemId: 10,
    });
  });

  it('should use authenticated user id and item id for sell endpoint', async () => {
    const req = { user: { id: 123 } } as unknown as Request;
    const response = {
      item: { id: 10, status: 'sold' },
      wallet: { balance: '900.00' },
    };
    (service.sellInventoryItem as jest.Mock).mockResolvedValue(response);

    await expect(
      controller.sellInventoryItem(req, { inventoryItemId: 10 }),
    ).resolves.toEqual(response);
    expect(service.sellInventoryItem).toHaveBeenCalledWith(123, {
      inventoryItemId: 10,
    });
  });
});
